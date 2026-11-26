import {createAccountCreation} from '../server/accountCreationService.mjs';
import {createAccountRecovery} from '../server/accountRecoveryService.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createAccountHttpRoutes} from '../server/accountHttpRoutes.mjs';
import {createAccountHttpBoundary} from '../server/accountHttpBoundary.mjs';
import {createAccountPasswordLogin} from '../server/accountPasswordLogin.mjs';
import {createAccountSetup} from '../server/accountSetup.mjs';
import {createPasswordService} from '../server/passwordCredentials.mjs';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {parseAccountSession} from '../shared/accountSession.js';
const password='Synthetic routed passphrase 65!',setupToken='synthetic-route-setup-token';
async function fixture(t,sessionPolicy) {
  const root=await mkdtemp(join(tmpdir(),'navimuse-routes-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=await openAccountStoreWorker(join(root,'accounts'),{sessionPolicy});t.after(()=>store.close());
  const passwords=await createPasswordService({screenPassword:async()=> 'allowed'});
  const config={store,passwords,mode:'local',throttleSecret:Buffer.alloc(32,15)};
  const login=createAccountPasswordLogin(config),setup=createAccountSetup({...config,legacyConfigured:false,verifySetupToken:value=>value===setupToken});
  let handler;
  const server=createServer(async(req,res)=>{if (!await handler(req,res)) {res.writeHead(404);res.end();}});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const boundary=createAccountHttpBoundary({canonicalOrigin:origin,developmentLoopback:true,nativeOrigins:['tauri://localhost']});
  let mapped=true,mappingFailed=false,malformed=false;
  handler=createAccountHttpRoutes({boundary,store,login,setup,recovery:createAccountRecovery(config),creation:createAccountCreation(config),mode:'local',methods:{password:true,passkey:false,oidc:false},legacyConfigured:false,
    listMusicConnections:()=>[{reference:'music-listener',label:'Music Library',password:'private-injected-password'}],
    bindingForCredential:async ref=>ref==='music-listener'?{serverId:'10000000-0000-4000-8000-000000000001',username:'MusicListener',credentialRef:ref}:null,
    queueScopeForAccount:async()=>{
      if (mappingFailed) throw new Error('private binding-store detail');
      return malformed?'invalid-scope':mapped?`queue-scope-v2:${'1'.repeat(64)}`:null;
    }}); // Synthetic approved namespace.
  async function call(path,{body,cookie,method=body?'POST':'GET',headers={}}={}) {
    const response=await fetch(origin+'/api/auth/v1'+path,{method,headers:{'X-Requested-With':'NaviMuse',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,headers:response.headers,cookies:response.headers.getSetCookie(),body:response.status===204?null:await response.json()};
  }
  const enroll=()=>call('/setup',{body:{setupToken,username:'owner',displayName:'Owner',password}});
  const signIn=(remember=true,cookie)=>call('/password/login',{body:{username:'owner',password,remember},cookie});
  return {call,enroll,signIn,store,boundary,unmap:()=>{mapped=false;},remap:()=>{mapped=true;mappingFailed=false;},failMapping:()=>{mappingFailed=true;},malformedMapping:()=>{malformed=true;}};
}
const cookieValue=(response,name)=>response.cookies.find(value=>value.startsWith(name+'=')).split(';',1)[0];

test('actual account HTTP handler performs controlled setup, login, cookie authentication and logout',async t=>{
  const {call,enroll,signIn,store,boundary}=await fixture(t);
  assert.equal((await call('/session')).body.state,'setup-required');
  const created=await enroll();assert.equal(created.status,201);assert.deepEqual(created.body,{ok:true,next:'sign-in'});assert.deepEqual(created.cookies,[]);
  assert.equal((await call('/session')).body.state,'signed-out');
  const signed=await signIn();assert.equal(signed.status,200);assert.equal(parseAccountSession(signed.body).state,'authenticated');
  assert.equal(signed.cookies.length,2);assert.equal(JSON.stringify(signed.body).includes('s1.'),false);assert.equal(JSON.stringify(signed.body).includes('d1.'),false);
  const cookie=cookieValue(signed,boundary.names.session);
  assert.equal((await call('/session',{cookie})).body.account.id,signed.body.account.id);
  assert.equal((await call('/setup',{body:{setupToken,username:'owner2',displayName:'Other',password}})).status,409);
  const out=await call('/logout',{method:'POST',cookie});assert.equal(out.status,200);assert.equal(out.cookies.length,3);out.cookies.forEach(value=>assert.match(value,/Max-Age=0/));
  assert.equal((await call('/session',{cookie})).body.state,'signed-out');
  const device=cookieValue(signed,boundary.names.device);
  const denied=await call('/refresh',{method:'POST',cookie:device});assert.equal(denied.status,409);assert.deepEqual(denied.cookies,[]);
  assert.equal((await store.findByUsername('owner')).id,signed.body.account.id);
});

test('concurrent refresh delivers exactly one successor and a losing response cannot overwrite it',async t=>{
  const {call,enroll,signIn,boundary}=await fixture(t);await enroll();const signed=await signIn();
  const oldDevice=cookieValue(signed,boundary.names.device),oldSession=cookieValue(signed,boundary.names.session);
  const results=await Promise.all([call('/refresh',{method:'POST',cookie:oldDevice}),call('/refresh',{method:'POST',cookie:oldDevice})]);
  assert.equal(results.filter(value=>value.status===200).length,1);
  const winner=results.find(value=>value.status===200),loser=results.find(value=>value.status===409);
  assert.deepEqual(loser.cookies,[]);assert.equal(loser.body.next,'recheck-session');
  assert.equal((await call('/session',{cookie:oldSession})).body.state,'authenticated');
  // Apply the winner's cookies, then process the losing response last.
  const jar=new Map();for (const response of [winner,loser]) for (const value of response.cookies) {const pair=value.split(';',1)[0],index=pair.indexOf('=');jar.set(pair.slice(0,index),pair);}
  assert.equal((await call('/session',{cookie:jar.get(boundary.names.session)})).body.state,'authenticated');
  assert.equal((await call('/refresh',{method:'POST',cookie:jar.get(boundary.names.device)})).status,200);
});

test('new nonremembered login retires prior family and clears the old device cookie',async t=>{
  const {call,enroll,signIn,boundary}=await fixture(t);await enroll();const original=await signIn();
  const replacement=await signIn(false,cookieValue(original,boundary.names.session));assert.equal(replacement.status,200);
  assert.match(replacement.cookies.find(value=>value.startsWith(boundary.names.device+'=')),/Max-Age=0/);
  assert.equal((await call('/session',{cookie:cookieValue(original,boundary.names.session)})).body.state,'signed-out');
  assert.equal((await call('/refresh',{method:'POST',cookie:cookieValue(original,boundary.names.device)})).status,409);
});

test('invalid boundaries, malformed bodies and malformed namespace values never issue cookies',async t=>{
  const {call,enroll,signIn,malformedMapping}=await fixture(t);
  const denied=await call('/setup',{body:{setupToken,username:'owner',displayName:'Owner',password},headers:{Origin:'https://evil.example'}});
  assert.equal(denied.status,403);assert.deepEqual(denied.cookies,[]);assert.equal(denied.headers.get('access-control-allow-origin'),null);
  const invalid=await call('/password/login',{body:{username:'owner',password,accountId:'caller'}});assert.equal(invalid.status,400);assert.deepEqual(invalid.cookies,[]);
  const options=await call('/password/login',{method:'OPTIONS',headers:{Origin:'tauri://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-requested-with'}});
  assert.equal(options.status,204);assert.equal(options.headers.get('access-control-allow-origin'),'tauri://localhost');
  await enroll();malformedMapping();const unmapped=await signIn();assert.equal(unmapped.status,503);assert.deepEqual(unmapped.cookies,[]);
  assert.deepEqual(unmapped.body,{ok:false,code:'ACCOUNT_UNAVAILABLE'});
});

test('missing or unavailable mapping preserves real login, renewal and recovery of the same application session',async t=>{
  const {call,enroll,signIn,boundary,unmap,remap,failMapping}=await fixture(t);await enroll();unmap();
  const signed=await signIn();assert.equal(signed.status,200);assert.equal(signed.cookies.length,2);
  assert.equal(parseAccountSession(signed.body).state,'authenticated');assert.equal(signed.body.queueScope,null);
  const accountId=signed.body.account.id,originalAuth=signed.body.session.authenticatedAt;
  assert.equal((await call('/session',{cookie:cookieValue(signed,boundary.names.session)})).body.account.id,accountId);
  const wrong=await call('/password/login',{body:{username:'owner',password:'wrong'}});assert.equal(wrong.status,401);assert.deepEqual(wrong.cookies,[]);
  failMapping();
  const renewed=await call('/refresh',{method:'POST',cookie:cookieValue(signed,boundary.names.device)});
  assert.equal(renewed.status,200);assert.equal(renewed.cookies.length,2);assert.equal(renewed.body.queueScope,null);
  assert.equal(renewed.body.account.id,accountId);assert.equal(renewed.body.session.authenticatedAt,originalAuth);
  assert.equal(JSON.stringify(renewed.body).includes('private binding-store detail'),false);
  const recoveryCookie=cookieValue(renewed,boundary.names.session);
  const pending=await call('/session',{cookie:recoveryCookie});assert.equal(pending.body.state,'authenticated');assert.equal(pending.body.queueScope,null);
  remap();const recovered=await call('/session',{cookie:recoveryCookie});
  assert.equal(recovered.body.account.id,accountId);assert.equal(recovered.body.session.authenticatedAt,originalAuth);
  assert.match(recovered.body.queueScope,/^queue-scope-v2:[a-f0-9]{64}$/);
});

test('device routes require account ownership and logout-everywhere revokes all own sessions',async t=>{
  const {call,enroll,signIn,store,boundary}=await fixture(t);await enroll();const signed=await signIn(),cookie=cookieValue(signed,boundary.names.session);
  const devices=await call('/devices',{cookie});assert.equal(devices.status,200);assert.equal(devices.body.devices.length,1);
  assert.equal(JSON.stringify(devices.body).includes('verifier'),false);assert.equal(JSON.stringify(devices.body).includes('d1.'),false);
  assert.equal((await call('/devices')).status,401);
  const owner=await store.findByUsername('owner'),credential=(await store.getPasswordCredential(owner.id)).credential;
  const listener=await store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
  // Private issuance fixture supplies another account's authentic device family.
  const other=await store.issuePasswordSession(listener.id,{expectedGeneration:1,expectedRevision:1,remember:true});
  const foreign=await call('/devices/'+other.session.deviceId,{method:'DELETE',cookie});assert.equal(foreign.status,403);assert.deepEqual(foreign.cookies,[]);
  assert.ok(await store.authenticateSession(other.token));
  const revoked=await call('/devices/'+devices.body.devices[0].id,{method:'DELETE',cookie});assert.equal(revoked.status,200);assert.equal(revoked.cookies.length,3);
  assert.equal((await call('/session',{cookie})).body.state,'signed-out');
  const fresh=await signIn();const all=await call('/logout-everywhere',{method:'POST',cookie:cookieValue(fresh,boundary.names.session)});
  assert.equal(all.status,200);assert.equal(all.cookies.length,3);assert.ok(await store.authenticateSession(other.token));
});

test('recent-auth failures and unexpected refresh bodies preserve existing sessions and device tokens',async t=>{
  const {call,enroll,signIn,boundary}=await fixture(t,{recentMs:1});await enroll();const signed=await signIn();
  const cookie=cookieValue(signed,boundary.names.session),device=cookieValue(signed,boundary.names.device);
  await new Promise(resolve=>setTimeout(resolve,5));
  const denied=await call('/logout-everywhere',{method:'POST',cookie});
  assert.equal(denied.status,403);assert.equal(denied.body.code,'RECENT_AUTH_REQUIRED');assert.deepEqual(denied.cookies,[]);
  assert.equal((await call('/session',{cookie})).body.state,'authenticated');
  const extra=await call('/refresh',{cookie:device,body:{accountId:'caller'}});assert.equal(extra.status,400);assert.deepEqual(extra.cookies,[]);
  assert.equal((await call('/refresh',{cookie:device,method:'POST'})).status,200);
});

test('another account device token cannot select the account during password login',async t=>{
  const {call,enroll,signIn,store,boundary}=await fixture(t);await enroll();const ownerLogin=await signIn();
  const owner=await store.findByUsername('owner'),credential=(await store.getPasswordCredential(owner.id)).credential;
  const listener=await store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
  // A real second-account family models possession of someone else's bearer.
  const other=await store.issuePasswordSession(listener.id,{expectedGeneration:1,expectedRevision:1,remember:true});
  const foreignCookie=`${boundary.names.device}=${other.deviceToken}`;
  for (const extra of [{deviceToken:other.deviceToken},{deviceId:other.session.deviceId},{accountId:listener.id}]) {
    const result=await call('/password/login',{body:{username:'owner',password,remember:true,...extra},cookie:foreignCookie});
    assert.equal(result.status,400);assert.deepEqual(result.body,{ok:false,code:'INVALID_ACCOUNT_BODY'});assert.deepEqual(result.cookies,[]);
  }
  const wrong=await call('/password/login',{body:{username:'owner',password:'wrong',remember:true},cookie:foreignCookie});
  assert.equal(wrong.status,401);assert.deepEqual(wrong.cookies,[]);
  const query=`?deviceToken=${encodeURIComponent(other.deviceToken)}&accountId=${listener.id}`;
  const legitimate=await call('/password/login'+query,{body:{username:'owner',password,remember:true},cookie:foreignCookie});
  assert.equal(legitimate.status,200);assert.equal(legitimate.body.account.id,owner.id);
  assert.notEqual(legitimate.body.session.deviceId,other.session.deviceId);
  const issuedDevice=cookieValue(legitimate,boundary.names.device);
  assert.notEqual(issuedDevice,foreignCookie);
  assert.equal((await call('/refresh',{method:'POST',cookie:issuedDevice})).body.account.id,owner.id);
  assert.equal((await store.authenticateSession(other.token)).account.id,listener.id);
  assert.equal((await call('/session',{cookie:cookieValue(ownerLogin,boundary.names.session)})).body.account.id,owner.id);
});

test('owner binding HTTP route enforces ownership, configured references, revisions and self-reauthentication',async t=>{
  const {call,enroll,signIn,store,boundary}=await fixture(t);await enroll();const signed=await signIn(),cookie=cookieValue(signed,boundary.names.session);
  const owner=signed.body.account,credential=(await store.getPasswordCredential(owner.id)).credential;
  const listener=await store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
  const session=await store.issuePasswordSession(listener.id,{expectedGeneration:1,expectedRevision:1,remember:true});
  const route=`/accounts/${listener.id}/upstream-binding`,body={expectedRevision:0,credentialRef:'music-listener'};
  assert.equal((await call(route,{method:'PUT',body})).status,401);
  assert.equal((await call(route,{method:'PUT',body,cookie:`${boundary.names.session}=${session.token}`})).status,403);
  assert.equal((await call(route,{method:'PUT',body:{...body,username:'owner'},cookie})).status,400);
  assert.equal((await call(route,{method:'PUT',body:{...body,credentialRef:'unknown'},cookie})).status,400);
  assert.equal((await call(route,{method:'PUT',body,cookie,headers:{Origin:'https://evil.example'}})).status,403);
  const options=await call(route,{method:'OPTIONS',headers:{Origin:'tauri://localhost','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,x-requested-with'}});
  assert.equal(options.status,204);
  const approved=await call(route,{method:'PUT',body,cookie});assert.equal(approved.status,200);
  assert.deepEqual(approved.body,{ok:true,revision:1,reauthenticate:false});assert.deepEqual(approved.cookies,[]);
  assert.equal(await store.authenticateSession(session.token),null);assert.equal(await store.refreshDevice(session.deviceToken),null);
  assert.deepEqual((await call(route,{cookie})).body,{revision:1,credentialRef:'music-listener'});
  assert.equal((await call(route,{method:'PUT',body,cookie})).status,409);
  assert.equal((await call(route,{method:'PUT',body:{expectedRevision:1,credentialRef:null},cookie})).status,200);
  const own=await call(`/accounts/${owner.id}/upstream-binding`,{method:'PUT',body,cookie});
  assert.equal(own.status,200);assert.equal(own.body.reauthenticate,true);assert.equal(own.cookies.length,3);
  assert.equal((await call('/session',{cookie})).body.state,'signed-out');
});

test('owner binding HTTP route requires renewed interactive authentication after recent-auth expires',async t=>{
  const {call,enroll,signIn,store,boundary}=await fixture(t,{recentMs:1});await enroll();const signed=await signIn();
  await new Promise(resolve=>setTimeout(resolve,10));
  const cookie=cookieValue(signed,boundary.names.session),owner=signed.body.account;
  const result=await call(`/accounts/${owner.id}/upstream-binding`,{method:'PUT',cookie,body:{expectedRevision:0,credentialRef:'music-listener'}});
  assert.equal(result.status,403);assert.deepEqual(result.body,{ok:false,code:'RECENT_AUTH_REQUIRED'});assert.deepEqual(result.cookies,[]);
  assert.deepEqual(await store.getUpstreamBinding(owner.id),{revision:0,binding:null});
});

test('owner account overview HTTP boundary denies listeners and validates pagination',async t=>{
 const {call,enroll,signIn,store,boundary}=await fixture(t);await enroll();const signed=await signIn(),cookie=cookieValue(signed,boundary.names.session);
 const owner=await store.findByUsername('owner'),credential=(await store.getPasswordCredential(owner.id)).credential;
 const listener=await store.createListener(owner.id,{username:'reader',displayName:'Reader'},credential);
 assert.equal((await call('/admin/accounts')).status,401);
 const reader=await store.issuePasswordSession(listener.id,{expectedGeneration:1,expectedRevision:1});
 assert.deepEqual((await call('/admin/accounts',{cookie:`${boundary.names.session}=${reader.token}`})).body,{ok:false,code:'OWNER_REQUIRED'});
 const first=await call('/admin/accounts?limit=1',{cookie});assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');assert.equal(first.body.accounts.length,1);
 const next=await call('/admin/accounts?limit=1&after='+first.body.page.nextAfter,{cookie});assert.equal(next.status,200);assert.equal(next.body.page.nextAfter,null);assert.notEqual(first.body.accounts[0].id,next.body.accounts[0].id);
 for(const query of ['limit=101','limit=0','limit=1&limit=2','after=invalid','accountId='+owner.id])assert.equal((await call('/admin/accounts?'+query,{cookie})).status,400);
 assert.equal((await call('/admin/accounts',{cookie,method:'POST'})).status,405);
 assert.equal((await call('/admin/accounts',{cookie,headers:{Origin:'https://untrusted.invalid'}})).status,403);
 await store.logoutSession(signed.cookies.find(x=>x.startsWith(boundary.names.session+'=')).split(';')[0].split('=')[1]);
 assert.equal((await call('/admin/accounts',{cookie})).status,401);
});

test('approved music catalogue is owner-only and strips provider private fields',async t=>{
 const {call,enroll,signIn,store,boundary}=await fixture(t);await enroll();const signed=await signIn(),cookie=cookieValue(signed,boundary.names.session);
 assert.equal((await call('/admin/music-connections')).status,401);
 const owner=await store.findByUsername('owner'),credential=(await store.getPasswordCredential(owner.id)).credential;
 const listener=await store.createListener(owner.id,{username:'reader',displayName:'Reader'},credential);
 const reader=await store.issuePasswordSession(listener.id,{expectedGeneration:1,expectedRevision:1});
 assert.equal((await call('/admin/music-connections',{cookie:`${boundary.names.session}=${reader.token}`})).status,403);
 const result=await call('/admin/music-connections',{cookie});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
 assert.deepEqual(result.body,{connections:[{reference:'music-listener',label:'Music Library'}]});
 assert.equal((await call('/admin/music-connections',{cookie,method:'POST'})).status,405);
 assert.equal((await call('/admin/music-connections',{cookie,headers:{Origin:'https://untrusted.invalid'}})).status,403);
 await call('/logout',{cookie,method:'POST'});assert.equal((await call('/admin/music-connections',{cookie})).status,401);
});

test('recovery HTTP issues only to an owner, resets once, revokes old sessions and never logs in automatically',async t=>{
 const {call,enroll,signIn,store,boundary}=await fixture(t);
 await enroll();const owner=await signIn(),ownerCookie=cookieValue(owner,boundary.names.session);
 const listener=await store.createListener(owner.body.account.id,{username:'recovery-listener',displayName:'Recovery listener'},(await store.getPasswordCredential(owner.body.account.id)).credential);
 const signed=await call('/password/login',{body:{username:'recovery-listener',password,remember:true}}),cookie=cookieValue(signed,boundary.names.session);
 const path=`/accounts/${listener.id}/recovery-code`;
 assert.equal((await call(path,{body:{}})).status,401);
 assert.equal((await call(path,{body:{},cookie})).status,403);
 assert.equal((await call(path,{body:{},cookie:ownerCookie,headers:{Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await call(path,{body:{unexpected:true},cookie:ownerCookie})).status,400);
 assert.equal((await call(path,{cookie:ownerCookie})).status,405);
 const issued=await call(path,{body:{},cookie:ownerCookie});assert.equal(issued.status,201);assert.equal(issued.headers.get('cache-control'),'no-store');assert.deepEqual(Object.keys(issued.body).sort(),['code','expiresAt']);assert.deepEqual(issued.cookies,[]);
 const replacement='Replacement synthetic passphrase 2026!';
 assert.equal((await call('/recovery',{body:{code:issued.body.code,password:replacement,accountId:owner.body.account.id}})).status,400);
 const recovered=await call('/recovery',{body:{code:issued.body.code,password:replacement}});
 assert.equal(recovered.status,200);assert.deepEqual(recovered.body,{ok:true,next:'sign-in'});assert.deepEqual(recovered.cookies,[]);assert.equal(recovered.headers.get('cache-control'),'no-store');
 assert.equal((await call('/session',{cookie})).body.state,'signed-out');
 assert.equal((await call('/refresh',{method:'POST',cookie:cookieValue(signed,boundary.names.device)})).status,409);
 assert.equal((await call('/session',{cookie:ownerCookie})).body.account.id,owner.body.account.id);
 const replay=await call('/recovery',{body:{code:issued.body.code,password:replacement}}),unknown=await call('/recovery',{body:{code:`r1.${'A'.repeat(43)}`,password:replacement}});
 assert.equal(replay.status,400);assert.deepEqual(replay.body,unknown.body);assert.deepEqual(replay.body,{ok:false,code:'RECOVERY_FAILED'});
 assert.equal((await call('/password/login',{body:{username:'recovery-listener',password,remember:false}})).status,401);
 assert.equal((await call('/password/login',{body:{username:'recovery-listener',password:replacement,remember:false}})).status,200);
});

test('recovery HTTP throttles repeated redemption before additional password work',async t=>{
 const {call}=await fixture(t),body={code:`r1.${'B'.repeat(42)}A`,password:'Synthetic recovery passphrase 2026!'};
 for(let i=0;i<5;i++)assert.equal((await call('/recovery',{body})).status,400);
 const blocked=await call('/recovery',{body});assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'900');assert.deepEqual(blocked.body,{ok:false,code:'RECOVERY_THROTTLED'});assert.deepEqual(blocked.cookies,[]);
});

test('managed access HTTP requires owner authority, strict updates and last-owner protection',async t=>{
 const {call,enroll,signIn,store,boundary}=await fixture(t);await enroll();const signed=await signIn(),owner=signed.body.account,cookie=cookieValue(signed,boundary.names.session);
 const listener=await store.createListener(owner.id,{username:'access-listener',displayName:'Access listener'},(await store.getPasswordCredential(owner.id)).credential),path=`/accounts/${listener.id}/access`;
 assert.equal((await call(path)).status,401);
 const read=await call(path,{cookie});assert.deepEqual(read.body,{accountId:listener.id,owner:false,disabled:false,revision:1});
 const body={expectedGeneration:1,owner:false,disabled:true};
 for(const invalid of [{...body,actorId:owner.id},{...body,expectedGeneration:'1'},{...body,owner:1}])assert.equal((await call(path,{method:'PUT',cookie,body:invalid})).status,400);
 const foreign=await call(path,{method:'PUT',cookie,body,headers:{Origin:'https://other.example'}});assert.equal(foreign.status,403);
 const changed=await call(path,{method:'PUT',cookie,body});assert.equal(changed.status,200);assert.equal(changed.body.revision,2);assert.deepEqual(changed.cookies,[]);
 const stale=await call(path,{method:'PUT',cookie,body});assert.equal(stale.status,409);assert.equal(stale.body.code,'ACCOUNT_ACCESS_CHANGED');
 const last=await call(`/accounts/${owner.id}/access`,{method:'PUT',cookie,body:{expectedGeneration:1,owner:false,disabled:false}});assert.equal(last.status,409);assert.equal(last.body.code,'LAST_OWNER_REQUIRED');
 assert.equal((await call('/session',{cookie})).body.state,'authenticated');
});

test('owner creation HTTP boundary creates an unassigned listener without issuing credentials or cookies',async t=>{
 const {call,enroll,signIn,boundary,store}=await fixture(t);await enroll();const signed=await signIn(),cookie=cookieValue(signed,boundary.names.session);
 const body={username:' New.Listener ',displayName:'New Listener',password:'New synthetic listener passphrase!'};
 assert.equal((await call('/accounts',{body})).status,401);
 assert.equal((await call('/accounts',{body,cookie,headers:{Origin:'https://untrusted.example'}})).status,403);
 for(const extra of [{owner:true},{roles:['owner']},{accountId:signed.body.account.id},{actorId:signed.body.account.id},{credentialRef:'music-listener'}]){
  const rejected=await call('/accounts',{body:{...body,...extra},cookie});assert.equal(rejected.status,400);assert.deepEqual(rejected.cookies,[]);
 }
 const created=await call('/accounts',{body,cookie});assert.equal(created.status,201);assert.equal(created.headers.get('cache-control'),'no-store');assert.deepEqual(created.cookies,[]);
 assert.deepEqual(Object.keys(created.body).sort(),['account','ok']);assert.deepEqual(Object.keys(created.body.account).sort(),['bindingRevision','disabled','displayName','id','musicConfigured','roles','username']);
 assert.equal(created.body.account.username,'new.listener');assert.deepEqual(created.body.account.roles,['listener']);assert.equal(created.body.account.musicConfigured,false);
 assert.equal((await store.getUpstreamBinding(created.body.account.id)).binding,null);
 assert.equal(JSON.stringify(created.body).includes(body.password),false);assert.equal(JSON.stringify(created.body).includes('argon2'),false);
 const duplicate=await call('/accounts',{body,cookie});assert.equal(duplicate.status,409);assert.deepEqual(duplicate.body,{ok:false,code:'USERNAME_UNAVAILABLE'});
 const listener=await call('/password/login',{body:{username:'new.listener',password:body.password,remember:false}});assert.equal(listener.status,200);
 const denied=await call('/accounts',{body:{...body,username:'not-created'},cookie:cookieValue(listener,boundary.names.session)});assert.equal(denied.status,403);assert.deepEqual(denied.body,{ok:false,code:'OWNER_REQUIRED'});assert.equal(await store.findByUsername('not-created'),null);
 const unchanged=await call('/session',{cookie});assert.equal(unchanged.body.account.id,signed.body.account.id);
});
