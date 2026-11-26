import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountHttpBoundary} from '../server/accountHttpBoundary.mjs';
const token=kind=>`${kind}.${Buffer.alloc(32,7).toString('base64url')}`;
const request=(headers={},socket={encrypted:true,remoteAddress:'192.0.2.8'})=>({headers:{host:'music.example',origin:'https://music.example','x-requested-with':'NaviMuse',...headers},socket});
test('account transport requires configured host, trusted TLS and write origin protection',()=>{
  const gate=createAccountHttpBoundary({canonicalOrigin:'https://music.example',trustedProxyPeers:['127.0.0.1']});
  assert.equal(gate.allowedRequest(request(),{write:true}),true);
  for (const req of [request({host:'attacker.example'}),request({origin:'https://attacker.example'}),request({'x-requested-with':undefined}),request({'x-forwarded-proto':'https'},{remoteAddress:'192.0.2.8'})]) assert.equal(gate.allowedRequest(req,{write:true}),false);
  assert.equal(gate.allowedRequest(request({'x-forwarded-proto':'https'},{remoteAddress:'127.0.0.1'}),{write:true}),true);
  assert.equal(gate.allowedRequest(request({'x-forwarded-proto':'https,http'},{remoteAddress:'127.0.0.1'})),false);
  assert.equal(gate.allowedRequest(request({origin:'null'})),false);
});
test('loopback exceptions and native origins require explicit configuration',()=>{
  assert.throws(()=>createAccountHttpBoundary({canonicalOrigin:'http://localhost:9000'}),/HTTPS/);
  assert.throws(()=>createAccountHttpBoundary({canonicalOrigin:'http://music.example',developmentLoopback:true}),/HTTPS/);
  const dev=createAccountHttpBoundary({canonicalOrigin:'http://localhost:9000',developmentLoopback:true});
  assert.equal(dev.allowedRequest({headers:{host:'localhost:9000'},socket:{remoteAddress:'127.0.0.1'}}),true);
  assert.equal(dev.allowedRequest({headers:{host:'localhost:9000'},socket:{remoteAddress:'192.0.2.8'}}),false);
  assert.equal(createAccountHttpBoundary({canonicalOrigin:'https://music.example'}).allowedRequest(request({origin:'tauri://localhost'})),false);
  const native=createAccountHttpBoundary({canonicalOrigin:'https://music.example',nativeOrigins:['tauri://localhost']});
  assert.equal(native.allowedRequest(request({origin:'tauri://localhost'}),{write:true}),true);
  assert.throws(()=>createAccountHttpBoundary({canonicalOrigin:'https://music.example',trustedProxyPeers:['*']}),/proxy/);
});
test('cookies are host-only protected and cleared at their exact original paths',()=>{
  const gate=createAccountHttpBoundary({canonicalOrigin:'https://music.example'});
  const session=gate.cookie('session',token('s1'),61000,1000),device=gate.cookie('device',token('d1'),61000,1000);
  assert.match(session,/^__Host-navimuse_session_v1=s1\./);assert.match(session,/Path=\/; Max-Age=60; HttpOnly; SameSite=Lax; Secure$/);
  assert.match(device,/^__Secure-navimuse_device_v1=d1\./);assert.match(device,/Path=\/api\/auth\/v1\/refresh; Max-Age=60; HttpOnly; SameSite=Lax; Secure$/);
  assert.equal(session.includes('Domain='),false);assert.equal(device.includes('Domain='),false);
  const cleared=gate.clearCookies();assert.match(cleared[0],/Path=\/; Max-Age=0/);assert.match(cleared[1],/Path=\/api\/auth\/v1\/refresh; Max-Age=0/);
  assert.throws(()=>gate.cookie('session',token('d1'),61000,1000),/token/);
});
test('cookie parsing rejects duplicates, encoded substitutions and wrong token kinds',()=>{
  const gate=createAccountHttpBoundary({canonicalOrigin:'https://music.example'}),name=gate.names.session,value=token('s1');
  assert.equal(gate.readCookie(request({cookie:`${name}=${value}`}), 'session'),value);
  for (const cookie of [`${name}=${value}; ${name}=${value}`,`${name}=${token('d1')}`,`${name}=${value.replace('.','%2e')}`,`${name}=s1.${'A'.repeat(42)}B`,`${name}=${value}; ${name}`, 'x'.repeat(8193)]) assert.equal(gate.readCookie(request({cookie}),'session'),null);
});

test('token parsing and writing reject every noncanonical base64url tail and base64 substitution',()=>{
  const gate=createAccountHttpBoundary({canonicalOrigin:'https://music.example'});
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  for (const [kind,prefix] of [['session','s1'],['device','d1'],['passkey','p1']]) {
    const name=gate.names[kind];
    for (let index=0;index<alphabet.length;index++) {
      // 32 bytes use 43 base64url symbols: the final symbol has two unused zero bits.
      const value=`${prefix}.${'A'.repeat(42)}${alphabet[index]}`;
      const canonical=index%4===0;
      assert.equal(gate.readCookie(request({cookie:`${name}=${value}`}),kind),canonical?value:null);
      if (canonical) assert.ok(gate.cookie(kind,value,61000,1000).startsWith(`${name}=${value};`));
      else assert.throws(()=>gate.cookie(kind,value,61000,1000),/token/);
    }
    const valid=`${prefix}.${Buffer.alloc(32,255).toString('base64url')}`;
    for (const malformed of [valid+'=',valid.replaceAll('_','/'),valid.replace('_','+'),valid.replace('_','%5f'),`${prefix}.${'A'.repeat(21)} ${'A'.repeat(21)}`,`${prefix}.${'A'.repeat(42)}\n`]) {
      assert.equal(gate.readCookie(request({cookie:`${name}=${malformed}`}),kind),null);
      assert.throws(()=>gate.cookie(kind,malformed,61000,1000),/token/);
    }
  }
});

test('cookie writer rejects the review injection example and same-length separators',()=>{
  const gate=createAccountHttpBoundary({canonicalOrigin:'https://music.example'});
  const example='s1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=; Path=/evil; Secure=true';
  assert.throws(()=>gate.cookie('session',example,61000,1000),/Invalid account token/);
  for (const [kind,prefix] of [['session','s1'],['device','d1'],['passkey','p1']]) {
    const valid=token(prefix);
    for (const separator of [';','=','\r','\n','\t',' ',':',',','"','\\']) {
      const sameLength=valid.slice(0,20)+separator+valid.slice(21);
      assert.equal(sameLength.length,valid.length);
      assert.throws(()=>gate.cookie(kind,sameLength,61000,1000),/Invalid account token/);
    }
    for (const suffix of ['; Domain=evil.example','; Path=/evil','\r\nSet-Cookie: injected=1']) {
      assert.throws(()=>gate.cookie(kind,valid+suffix,61000,1000),/Invalid account token/);
    }
  }
});

test('passkey cookies are host-protected, strict and cleared at the root path',()=>{
 const gate=createAccountHttpBoundary({canonicalOrigin:'https://music.example',nativeOrigins:['tauri://localhost']});
 assert.match(gate.cookie('passkey',token('p1'),301000,1000),/^__Host-navimuse_passkey_v1=p1\..*; Path=\/; Max-Age=300; HttpOnly; SameSite=Strict; Secure$/);
 assert.match(gate.clearCookies()[2],/Path=\/; Max-Age=0; HttpOnly; SameSite=Strict; Secure$/);
 assert.equal(gate.allowedPasskeyRequest(request()),true);
 for(const origin of [undefined,'tauri://localhost','null'])assert.equal(gate.allowedPasskeyRequest(request({origin})),false);
});
