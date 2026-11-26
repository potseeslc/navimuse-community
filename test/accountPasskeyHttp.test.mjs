import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createAccountHttpBoundary} from '../server/accountHttpBoundary.mjs';
import {createAccountHttpRoutes} from '../server/accountHttpRoutes.mjs';
import {createAccountPasskeys} from '../server/accountPasskeys.mjs';
import {accountCredentialFixture} from '../test-support/accountCredentialFixture.mjs';
import {passkeyAuthenticatorFixture} from '../test-support/passkeyAuthenticatorFixture.mjs';
async function fixture(t,{usernameFirstEnabled=false}={}) {
 const dir=await mkdtemp(join(tmpdir(),'navimuse-passkey-http-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await openAccountStoreWorker(dir);t.after(()=>store.close());
 const account=await store.createFirstOwner({username:'owner',displayName:'Owner'},accountCredentialFixture);
 const session=await store.issuePasswordSession(account.id,{expectedGeneration:1,expectedRevision:1});
 let handler;const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port,origin=`http://localhost:${port}`;
 const boundary=createAccountHttpBoundary({canonicalOrigin:origin,developmentLoopback:true,nativeOrigins:['tauri://localhost']});
 const passkeys=createAccountPasskeys({store,canonicalOrigin:origin,rpID:'localhost',developmentLocalhost:true,throttleSecret:Buffer.alloc(32,3),usernameFirstEnabled});
 handler=createAccountHttpRoutes({boundary,store,passkeys,mode:'local',methods:{password:true,passkey:true,oidc:false},legacyConfigured:false,queueScopeForAccount:async()=>null});
 async function call(path,{body={},cookie='',headers={},method='POST'}={}) {
  const res=await fetch(`${origin}/api/auth/v1${path}`,{method,headers:{Host:`localhost:${port}`,Origin:origin,'X-Requested-With':'NaviMuse','Content-Type':'application/json',Cookie:cookie,...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  return {status:res.status,body:await res.json(),cookies:res.headers.getSetCookie()};
 }
 const pair=(res,kind)=>res.cookies.find(x=>x.startsWith(boundary.names[kind]+'=')).split(';')[0];
 const sessionCookie=`${boundary.names.session}=${session.token}`;
 async function enroll() {
  const start=await call('/passkeys/register/options',{cookie:sessionCookie});assert.equal(start.status,200);
  const auth=passkeyAuthenticatorFixture(start.body.options.user.id,{origin,rpID:'localhost'}),binding=pair(start,'passkey');
  const registration=auth.registration(start.body.options.challenge);
  if(usernameFirstEnabled){assert.equal(start.body.options.authenticatorSelection.residentKey,'preferred');registration.clientExtensionResults.credProps.rk=false;}
  const result=await call('/passkeys/register/verify',{cookie:sessionCookie+'; '+binding,body:{ceremonyId:start.body.ceremonyId,response:registration,label:'My security key'}});
  assert.equal(result.status,201);return {auth,binding};
 }
 return {store,account,sessionCookie,boundary,call,pair,enroll};
}
test('HTTP registration and signed login keep bearers in cookies and issue the existing account contract',async t=>{
 const {enroll,call,pair,boundary,account,sessionCookie}=await fixture(t),{auth,binding}=await enroll();
 const start=await call('/passkeys/login/options',{cookie:binding});assert.equal(start.status,200);
 assert.match(start.cookies[0],/HttpOnly; SameSite=Strict/);assert.equal(JSON.stringify(start.body).includes('p1.'),false);
 const body={ceremonyId:start.body.ceremonyId,response:auth.authentication(start.body.options.challenge),remember:true};
 const result=await call('/passkeys/login/verify',{cookie:binding+'; '+sessionCookie,body});
 assert.equal(result.status,200);assert.equal(result.body.account.id,account.id);assert.equal(result.body.state,'authenticated');assert.equal(result.body.queueScope,null);
 assert.equal(result.cookies.length,2);assert.equal(/s1\.|d1\.|p1\./.test(JSON.stringify(result.body)),false);
 assert.equal((await call('/session',{method:'GET',cookie:pair(result,'session')})).body.account.id,account.id);
 assert.equal((await call('/session',{method:'GET',cookie:sessionCookie})).body.state,'signed-out');
 const replay=await call('/passkeys/login/verify',{cookie:binding,body});assert.equal(replay.status,401);assert.deepEqual(replay.cookies,[]);
 assert.ok(result.cookies.some(x=>x.startsWith(boundary.names.device+'=d1.')));
});
test('canonical origin, bounded bodies and server-only context are enforced before issuing ceremony cookies',async t=>{
 const {call}=await fixture(t);
 for (const Origin of ['https://evil.example','tauri://localhost','null']) {
  const denied=await call('/passkeys/login/options',{headers:{Origin}});assert.equal(denied.status,403);assert.deepEqual(denied.cookies,[]);
 }
 for(const body of [{bindingToken:'caller'},{sessionToken:'caller'},{accountId:'caller'},{response:'x'.repeat(33000)}]) {
  const denied=await call('/passkeys/login/options',{body});assert.ok([400,413].includes(denied.status));assert.deepEqual(denied.cookies,[]);
 }
 assert.equal((await call('/passkeys/register/options')).status,401);
});
test('wrong or duplicate binding cookies cannot consume a challenge, invalid signatures do consume it',async t=>{
 const {enroll,call}=await fixture(t),{auth,binding}=await enroll();
 const start=await call('/passkeys/login/options',{cookie:binding}),body={ceremonyId:start.body.ceremonyId,response:auth.authentication(start.body.options.challenge)};
 for(const cookie of ['',binding+'; '+binding]) {
  const denied=await call('/passkeys/login/verify',{cookie,body});assert.equal(denied.status,401);assert.deepEqual(denied.cookies,[]);
 }
 const invalid=await call('/passkeys/login/verify',{cookie:binding,body:{...body,response:auth.authentication(start.body.options.challenge,{corrupt:true})}});
 assert.deepEqual(invalid.body,{ok:false,code:'PASSKEY_FAILED'});
 assert.equal((await call('/passkeys/login/verify',{cookie:binding,body})).status,401);
});
test('HTTP cancellation consumes only its bound ceremony and cannot install authentication cookies',async t=>{
 const {enroll,call}=await fixture(t),{auth,binding}=await enroll(),start=await call('/passkeys/login/options',{cookie:binding});
 const cancelled=await call('/passkeys/cancel',{cookie:binding,body:{ceremonyId:start.body.ceremonyId,purpose:'login'}});
 assert.equal(cancelled.status,200);assert.deepEqual(cancelled.cookies,[]);
 assert.equal((await call('/passkeys/login/verify',{cookie:binding,body:{ceremonyId:start.body.ceremonyId,response:auth.authentication(start.body.options.challenge)}})).status,401);
});
test('HTTP credential management returns public metadata, enforces revisions and removes login authority',async t=>{
 const {enroll,call,sessionCookie}=await fixture(t),{auth}=await enroll();
 const listed=await call('/passkeys',{method:'GET',cookie:sessionCookie});assert.equal(listed.status,200);const item=listed.body.credentials[0];
 assert.equal(item.id,auth.id);assert.equal(JSON.stringify(listed.body).includes('publicKey'),false);
 assert.equal((await call('/passkeys/change',{cookie:sessionCookie,body:{id:item.id,expectedRevision:1,label:'Renamed'}})).status,200);
 assert.equal((await call('/passkeys/change',{cookie:sessionCookie,body:{id:item.id,expectedRevision:1,remove:true}})).status,409);
 assert.equal((await call('/passkeys/change',{body:{id:item.id,expectedRevision:2,remove:true}})).status,401);
 assert.equal((await call('/passkeys/change',{cookie:sessionCookie,body:{id:item.id,expectedRevision:2,remove:true}})).status,200);
 assert.deepEqual((await call('/passkeys',{method:'GET',cookie:sessionCookie})).body,{credentials:[]});
});

test('username-first HTTP options bind non-discoverable assertions and keep unknown targets generic',async t=>{
 const {enroll,call,pair,account}=await fixture(t,{usernameFirstEnabled:true}),{auth}=await enroll();
 assert.deepEqual((await call('/passkeys/policy',{method:'GET'})).body,{usernameFirst:true});
 const start=await call('/passkeys/login/options',{body:{username:' ＯＷＮＥＲ '}});assert.equal(start.status,200);
 assert.equal(start.body.options.allowCredentials.length,20);assert(start.body.options.allowCredentials.some(c=>c.id===auth.id));
 assert(!JSON.stringify(start.body).includes(account.id));assert(!JSON.stringify(start.body).includes('generation'));
 const again=await call('/passkeys/login/options',{body:{username:'owner'}});assert.deepEqual(again.body.options.allowCredentials,start.body.options.allowCredentials);
 const success=await call('/passkeys/login/verify',{cookie:pair(start,'passkey'),body:{ceremonyId:start.body.ceremonyId,response:auth.authentication(start.body.options.challenge,{handle:null}),remember:false}});
 assert.equal(success.status,200);assert.equal(success.body.account.id,account.id);
 const missing=await call('/passkeys/login/options',{body:{username:'missing'}});assert.equal(missing.status,200);assert.equal(missing.body.options.allowCredentials.length,20);
 const denial=await call('/passkeys/login/verify',{cookie:pair(missing,'passkey'),body:{ceremonyId:missing.body.ceremonyId,response:auth.authentication(missing.body.options.challenge,{handle:null,counter:2})}});
 assert.equal(denial.status,401);assert.deepEqual(denial.body,{ok:false,code:'PASSKEY_FAILED'});assert.deepEqual(denial.cookies,[]);
 const forbidden=await call('/passkeys/register/options',{body:{username:'owner'}});assert.equal(forbidden.status,400);
});
test('username-first policy defaults off and cannot be enabled by request JSON',async t=>{
 const {call}=await fixture(t);assert.deepEqual((await call('/passkeys/policy',{method:'GET'})).body,{usernameFirst:false});
 const denied=await call('/passkeys/login/options',{body:{username:'owner'}});assert.equal(denied.status,401);assert.deepEqual(denied.cookies,[]);
 const injected=await call('/passkeys/login/options',{body:{username:'owner',usernameFirstEnabled:true}});assert.equal(injected.status,400);
 assert.equal((await call('/passkeys/login/options')).status,200);
});
