import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { openAccountStoreWorker } from '../server/accountStoreWorker.mjs';
import { readAccountRequestBody } from '../server/accountRequestBody.mjs';
import { createAccountSetup } from '../server/accountSetup.mjs';
import { createPasswordService } from '../server/passwordCredentials.mjs';
import { createAccountPasswordLogin } from '../server/accountPasswordLogin.mjs';
import { createAccountHttpBoundary } from '../server/accountHttpBoundary.mjs';

test('real HTTP boundary and durable login service reject spoofed requests before hashing and issue authenticatable cookies',async t=>{
  const root=await mkdtemp(join(tmpdir(),'navimuse-login-http-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const store=await openAccountStoreWorker(join(root,'accounts'));t.after(()=>store.close());
  const passwords=await createPasswordService({screenPassword:async()=> 'allowed'}); // Synthetic screening only.
  const password='Synthetic integration passphrase 53!';
  const setup=createAccountSetup({store,passwords,mode:'local',legacyConfigured:false,throttleSecret:Buffer.alloc(32,12),
    verifySetupToken:value=>value==='synthetic-integration-setup-token'});
  const enrolled=await setup.setup({setupToken:'synthetic-integration-setup-token',username:'owner',displayName:'Owner',password},{networkAddress:'192.0.2.1'});
  assert.equal(enrolled.ok,true);
  const owner=await store.getAccount(enrolled.accountId);
  let verifications=0;
  const login=createAccountPasswordLogin({store,mode:'local',throttleSecret:Buffer.alloc(32,12),passwords:{
    verifyPassword:async (...args)=>{verifications++;return passwords.verifyPassword(...args);},
  }});
  const boundary=createAccountHttpBoundary({canonicalOrigin:'https://music.example',trustedProxyPeers:['127.0.0.1']});
  // Isolated test adapter, not production route wiring. Parses synthetic request
  // credentials through the production parser before the real login service.
  const server=createServer(async(req,res)=>{
    try {
      res.setHeader('Content-Type','application/json');
      const networkAddress=boundary.networkAddress(req);
      if (!networkAddress) {res.writeHead(403);res.end('{"ok":false}');return;}
      const payload=await readAccountRequestBody(req,'login');
      const result=await login.login(payload,{networkAddress});
      if (!result.ok) {
        res.writeHead(result.code==='LOGIN_THROTTLED'?429:401);
        res.end(JSON.stringify(result));return;
      }
      res.setHeader('Set-Cookie',boundary.cookie('session',result.issued.token,result.issued.session.expiresAt));
      res.end('{"ok":true}');
    } catch(error) {if (!res.destroyed) {res.writeHead(error.status??500);res.end('{"ok":false}');}}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const send=(extra=[],path='/login')=>new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,method:'POST',path,headers:[
      'Host','music.example','X-Forwarded-Proto','https','X-Requested-With','NaviMuse','Content-Type','application/json',...extra,
    ]},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;});
      res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body),cookies:res.headers['set-cookie']}));
    });req.on('error',reject);req.end(JSON.stringify({username:'owner',password:path==='/wrong'?'wrong':password,remember:false}));
  });
  for (const extra of [[],['X-Forwarded-For','192.0.2.1, 192.0.2.2'],['X-Forwarded-For','192.0.2.1','X-Forwarded-For','192.0.2.2'],['X-Forwarded-For','192.0.2.1','Origin','https://evil.example']]) {
    const denied=await send(extra);assert.equal(denied.status,403);assert.equal(denied.cookies,undefined);
  }
  assert.equal(verifications,0,'Rejected request boundaries cannot spend password work');
  const success=await send(['X-Forwarded-For','192.0.2.1']);
  assert.equal(success.status,200);assert.deepEqual(success.body,{ok:true});assert.equal(success.cookies.length,1);
  const token=boundary.readCookie({headers:{cookie:success.cookies[0].split(';',1)[0]}},'session');
  assert.equal((await store.authenticateSession(token)).account.id,owner.id);
  for (let attempt=0;attempt<4;attempt++) {
    const denied=await send(['X-Forwarded-For',`192.0.2.${attempt+2}`],'/wrong');
    assert.equal(denied.status,401);assert.deepEqual(denied.body,{ok:false,code:'INVALID_CREDENTIALS'});assert.equal(denied.cookies,undefined);
  }
  assert.equal(verifications,5);
  const throttled=await send(['X-Forwarded-For','192.0.2.99']);
  assert.equal(throttled.status,429);assert.equal(throttled.cookies,undefined);assert.equal(verifications,5);
  // Account throttling applies across networks but never revokes prior playback.
  assert.equal((await store.authenticateSession(token)).account.id,owner.id);
});
