import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createAccountHttpBoundary } from '../server/accountHttpBoundary.mjs';

const request=(headers={},socket={encrypted:true,remoteAddress:'192.0.2.8'})=>({
  headers:{host:'music.example',origin:'https://music.example','x-requested-with':'NaviMuse',...headers},socket,
});

test('direct TLS client identity is the socket peer regardless of spoofed forwarding headers',()=>{
  const boundary=createAccountHttpBoundary({canonicalOrigin:'https://music.example',trustedProxyPeers:['127.0.0.1']});
  for (const value of ['192.0.2.9','192.0.2.9, 192.0.2.10',undefined]) {
    assert.equal(boundary.networkAddress(request({'x-forwarded-for':value,forwarded:'for=192.0.2.9','cf-connecting-ip':'192.0.2.9','x-real-ip':'192.0.2.9'})),'192.0.2.8');
  }
  for (const req of [request({host:'evil.example'}),request({origin:'https://evil.example'}),request({'x-requested-with':undefined}),request({}, {remoteAddress:'192.0.2.8'}),request({}, {encrypted:true,remoteAddress:undefined})]) {
    assert.equal(boundary.networkAddress(req),null);
  }
});

test('an explicitly trusted proxy requires one unambiguous address and retains all write checks',()=>{
  const boundary=createAccountHttpBoundary({canonicalOrigin:'https://music.example',trustedProxyPeers:['127.0.0.1']});
  const proxied=value=>request({'x-forwarded-proto':'https','x-forwarded-for':value},{remoteAddress:'127.0.0.1'});
  for (const value of ['192.0.2.8','2001:db8::1','::ffff:192.0.2.8']) assert.equal(boundary.networkAddress(proxied(value)),value);
  for (const value of [undefined,'','unknown','192.0.2.1, 192.0.2.2',['192.0.2.1'], ' 192.0.2.1','192.0.2.1 ','192.0.2.1:443','[2001:db8::1]','fe80::1%en0','192.0.2.1\n','x'.repeat(8192)]) assert.equal(boundary.networkAddress(proxied(value)),null);
  const duplicate=proxied('192.0.2.1');
  duplicate.rawHeaders=['X-Forwarded-For','192.0.2.1','x-forwarded-for','192.0.2.1'];
  assert.equal(boundary.networkAddress(duplicate),null);
  duplicate.rawHeaders=['X-Forwarded-For','192.0.2.1'];
  assert.equal(boundary.networkAddress(duplicate),'192.0.2.1');
  duplicate.headers.origin='https://evil.example';assert.equal(boundary.networkAddress(duplicate),null);
});

test('explicit Cloudflare header policy never falls back to XFF or trusts an unconfigured peer',()=>{
  const options={canonicalOrigin:'https://music.example',trustedProxyPeers:['127.0.0.1'],proxyAddressHeader:'cf-connecting-ip'};
  const boundary=createAccountHttpBoundary(options);
  const proxied=value=>request({'x-forwarded-proto':'https','x-forwarded-for':'192.0.2.99, 192.0.2.8','cf-connecting-ip':value},{remoteAddress:'127.0.0.1'});
  assert.equal(boundary.networkAddress(proxied('192.0.2.8')),'192.0.2.8');
  for (const value of [undefined,'192.0.2.1, 192.0.2.8',['192.0.2.8'],'fe80::1%en0']) assert.equal(boundary.networkAddress(proxied(value)),null);
  const duplicate=proxied('192.0.2.8');duplicate.rawHeaders=['CF-Connecting-IP','192.0.2.8','cf-connecting-ip','192.0.2.9'];
  assert.equal(boundary.networkAddress(duplicate),null);
  assert.equal(boundary.networkAddress(request({'cf-connecting-ip':'192.0.2.99'})),'192.0.2.8');
  assert.equal(boundary.networkAddress(request({'cf-connecting-ip':'192.0.2.99','x-forwarded-proto':'https'},{remoteAddress:'192.0.2.8'})),null);
  assert.throws(()=>createAccountHttpBoundary({...options,proxyAddressHeader:'x-user-ip'}),/proxy address header/);
});

test('real Node HTTP requests reject duplicate/chained proxy headers and ignore direct-client spoofing',async t=>{
  const proxy=createAccountHttpBoundary({canonicalOrigin:'https://music.example',trustedProxyPeers:['127.0.0.1']});
  const cloudflare=createAccountHttpBoundary({canonicalOrigin:'https://music.example',trustedProxyPeers:['127.0.0.1'],proxyAddressHeader:'cf-connecting-ip'});
  let direct;
  const server=createServer((req,res)=>{
    const boundary=req.headers.host==='music.example'?(req.url==='/cloudflare'?cloudflare:proxy):direct;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({address:boundary.networkAddress(req)}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  direct=createAccountHttpBoundary({canonicalOrigin:`http://127.0.0.1:${port}`,developmentLoopback:true});
  const send=(headers,path='/')=>new Promise((resolve,reject)=>{
    const req=httpRequest({host:'127.0.0.1',port,method:'POST',path,headers},res=>{
      let body='';res.setEncoding('utf8');res.on('data',part=>{body+=part;});res.on('end',()=>resolve(JSON.parse(body)));
    });req.on('error',reject);req.end();
  });
  const headers=['Host','music.example','X-Forwarded-Proto','https','X-Requested-With','NaviMuse'];
  assert.deepEqual(await send([...headers,'X-Forwarded-For','192.0.2.9']),{address:'192.0.2.9'});
  assert.deepEqual(await send([...headers,'X-Forwarded-For','192.0.2.9','X-Forwarded-For','192.0.2.10']),{address:null});
  assert.deepEqual(await send([...headers,'X-Forwarded-For','192.0.2.9, 192.0.2.10']),{address:null});
  assert.deepEqual(await send(headers),{address:null});
  assert.deepEqual(await send([...headers,'X-Forwarded-For','192.0.2.99, 192.0.2.9','CF-Connecting-IP','192.0.2.9'],'/cloudflare'),{address:'192.0.2.9'});
  assert.deepEqual(await send([...headers,'X-Forwarded-For','192.0.2.9'],'/cloudflare'),{address:null});
  assert.deepEqual(await send([...headers,'CF-Connecting-IP','192.0.2.9','CF-Connecting-IP','192.0.2.10'],'/cloudflare'),{address:null});
  assert.deepEqual(await send({'Host':`127.0.0.1:${port}`,'X-Requested-With':'NaviMuse','X-Forwarded-For':'192.0.2.9'}),{address:'127.0.0.1'});
});
