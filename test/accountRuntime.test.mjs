import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm,readFile,unlink,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {passkeyAuthenticatorFixture} from '../test-support/passkeyAuthenticatorFixture.mjs';
import {openLocalAccountRuntime} from '../server/accountRuntime.mjs';
const password='Fixture owner password for runtime 298!',setupToken='fixture-runtime-setup-token';
const binding={credentialRef:'music-owner',serverId:'10000000-0000-4000-8000-000000000001',username:'MusicOwner'};
async function fixture(t,legacyConfigured=false,passkeyEnabled=false) {
 const directory=await mkdtemp(join(tmpdir(),'navimuse-runtime-'));let runtime=null,upstreamCalls=0,upstreamAvailable=true;
 const music=createServer((req,res)=>{
  upstreamCalls++;const params=new URL(req.url,'http://fixture').searchParams;
  const valid=params.get('u')===binding.username && params.get('t')===createHash('md5').update('fixture-music-password'+params.get('s')).digest('hex');
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({'subsonic-response':{status:valid&&upstreamAvailable?'ok':'failed'}}));
 });music.listen(0,'127.0.0.1');await once(music,'listening');
 const server=createServer(async(req,res)=>{
  if (!runtime) {res.writeHead(503);res.end('{}');return;}
  if (await runtime.handleAccountRequest(req,res)) return;
  const result=req.url==='/atlas'?await runtime.withAtlasRequest(req,({map})=>map.manifest()):
   await runtime.withUpstreamRequest(req,async request=>(await (await request('/rest/ping.view')).json())['subsonic-response'].status);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{if(runtime) await runtime.close();for(const s of [server,music]) {s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}await rm(directory,{recursive:true,force:true});});
 const origin=`http://${passkeyEnabled?'localhost':'127.0.0.1'}:${server.address().port}`,musicOrigin=`http://127.0.0.1:${music.address().port}`;
 const options={directory,legacyConfigured,passkeyEnabled,boundaryOptions:{canonicalOrigin:origin,developmentLoopback:true},
  navidromeEntries:[{...binding,url:musicOrigin,password:'fixture-music-password'}],assertAllowedNavidromeUrl:url=>assert.equal(url.origin,musicOrigin),
  verifySetupToken:async token=>token===setupToken,passwordOptions:{screenPassword:async()=> 'allowed'},
  atlasDatasets:[{serverId:binding.serverId,username:binding.username,datasetId:'20000000-0000-4000-8000-000000000002',revision:1,grantFullProjection:true,
   fetchMap:async()=>({projection:'fixture',items:[{item_id:'a',embedding_2d:[0,0]},{item_id:'b',embedding_2d:[1,1]}]}),
   planSegment:async()=>[],findSimilar:async()=>[]}]};
 const start=async initialize=>{runtime=await openLocalAccountRuntime({...options,initialize});};
 const stop=async()=>{await runtime.close();runtime=null;};
 const call=async(path,{body,cookie,headers={},method=body?'POST':'GET'}={})=>{
  const response=await fetch(origin+path,{method,headers:{Origin:origin,'X-Requested-With':'NaviMuse',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json(),cookies:response.headers.getSetCookie()};
 };
 return {directory,start,stop,call,options,upstreamCalls:()=>upstreamCalls,setUpstreamAvailable:value=>{upstreamAvailable=value;}};
}
const short=result=>result.cookies.find(c=>c.startsWith('navimuse_session_v1_dev=')).split(';')[0];
test('assembled runtime preserves account identity, cookie sessions and approved upstream access across restart',async t=>{
 const f=await fixture(t);
 const registryFile=join(f.directory,'navidrome-registry.json');
 await writeFile(registryFile,JSON.stringify({version:'navimuse-navidrome-registry/v1',entries:f.options.navidromeEntries}),{mode:0o600});
 delete f.options.navidromeEntries;f.options.navidromeRegistryFile=registryFile;
 await f.start(true);
 assert.equal((await f.call('/api/auth/v1/session')).body.state,'setup-required');
 assert.equal((await f.call('/api/auth/v1/setup',{body:{setupToken,username:'owner',displayName:'Owner',password}})).status,201);
 let signed=await f.call('/api/auth/v1/password/login',{body:{username:'owner',password,remember:true}});
 assert.equal(signed.body.state,'authenticated');assert.equal(signed.body.queueScope,null);
 assert.deepEqual((await f.call('/atlas',{cookie:short(signed)})).body,{ok:false,code:'UPSTREAM_UNASSIGNED'});
 assert.deepEqual((await f.call('/music',{cookie:short(signed)})).body,{ok:false,code:'UPSTREAM_UNASSIGNED'});assert.equal(f.upstreamCalls(),0);
 const approvalPath=`/api/auth/v1/accounts/${signed.body.account.id}/upstream-binding`;
 const approval=await f.call(approvalPath,{method:'PUT',cookie:short(signed),body:{expectedRevision:0,credentialRef:binding.credentialRef}});
 assert.equal(approval.status,200);assert.deepEqual(approval.body,{ok:true,revision:1,reauthenticate:true});assert.equal(approval.cookies.length,3);
 assert.equal(f.upstreamCalls(),1,'Approval verifies credentials with the configured upstream');
 assert.equal((await f.call('/api/auth/v1/session',{cookie:short(signed)})).body.state,'signed-out');
 signed=await f.call('/api/auth/v1/password/login',{body:{username:'owner',password,remember:true}});
 const cookie=short(signed),scope=signed.body.queueScope,accountId=signed.body.account.id,keys=await readFile(join(f.directory,'account-secrets-v1'));
 assert.match(scope,/^queue-scope-v2:/);
 const atlas=await f.call('/atlas',{cookie});assert.equal(atlas.body.ok,true);assert.equal(atlas.body.value.pointCount,2);
 assert.deepEqual((await f.call('/atlas',{cookie,headers:{Origin:'https://evil.example'}})).body,{ok:false,code:'REQUEST_DENIED'});
 assert.deepEqual((await f.call('/music',{cookie})).body,{ok:true,value:'ok'});
 await f.stop();await f.start(false);
 const session=await f.call('/api/auth/v1/session',{cookie});assert.equal(session.body.account.id,accountId);assert.equal(session.body.queueScope,scope);
 assert.equal((await f.call('/atlas',{cookie})).body.value.projectionDigest,atlas.body.value.projectionDigest);
 assert.deepEqual(await readFile(join(f.directory,'account-secrets-v1')),keys);
 assert.deepEqual((await f.call('/music',{cookie})).body,{ok:true,value:'ok'});
 assert.deepEqual((await f.call('/music',{cookie,headers:{Origin:'https://evil.example'}})).body,{ok:false,code:'REQUEST_DENIED'});
 assert.equal((await f.call('/api/auth/v1/setup',{body:{setupToken,username:'other',displayName:'Other',password}})).status,409);
});
test('runtime requires explicit initialization and never replaces missing keys for an existing database',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.start(false),/^Error: Account runtime unavailable$/);assert.deepEqual(await readdir(f.directory),[]);
 await f.start(true);await f.stop();const database=await readFile(join(f.directory,'accounts.sqlite'));
 await unlink(join(f.directory,'account-secrets-v1'));
 await assert.rejects(f.start(true),/^Error: Account runtime unavailable$/);
 assert.deepEqual(await readFile(join(f.directory,'accounts.sqlite')),database);
 await assert.rejects(readFile(join(f.directory,'account-secrets-v1')),error=>error.code==='ENOENT');
});
test('legacy installations remain migration-required and cannot bootstrap a new owner',async t=>{
 const f=await fixture(t,true);await f.start(true);
 assert.equal((await f.call('/api/auth/v1/session')).body.state,'migration-required');
 const response=await f.call('/api/auth/v1/setup',{body:{setupToken,username:'owner',displayName:'Owner',password}});
 assert.equal(response.status,409);assert.deepEqual(response.body,{ok:false,code:'MIGRATION_REQUIRED'});
 assert.deepEqual((await f.call('/music')).body,{ok:false,code:'SIGN_IN_REQUIRED'});assert.equal(f.upstreamCalls(),0);
});

test('runtime owner approval denies failed upstream verification without changing the session or binding',async t=>{
 const f=await fixture(t);await f.start(true);
 await f.call('/api/auth/v1/setup',{body:{setupToken,username:'owner',displayName:'Owner',password}});
 const signed=await f.call('/api/auth/v1/password/login',{body:{username:'owner',password,remember:true}}),cookie=short(signed);
 const path=`/api/auth/v1/accounts/${signed.body.account.id}/upstream-binding`;
 f.setUpstreamAvailable(false);
 const denied=await f.call(path,{method:'PUT',cookie,body:{expectedRevision:0,credentialRef:binding.credentialRef}});
 assert.equal(denied.status,503);assert.deepEqual(denied.body,{ok:false,code:'ACCOUNT_UNAVAILABLE'});assert.deepEqual(denied.cookies,[]);
 assert.deepEqual((await f.call(path,{cookie})).body,{revision:0,credentialRef:null});
 const session=await f.call('/api/auth/v1/session',{cookie});assert.equal(session.body.state,'authenticated');assert.equal(session.body.queueScope,null);
 assert.deepEqual((await f.call('/music',{cookie})).body,{ok:false,code:'UPSTREAM_UNASSIGNED'});
});

test('invalid registry file or ambiguous source fails before database initialization',async t=>{
 const f=await fixture(t),path=join(f.directory,'registry.json');
 await writeFile(path,'{"version":"navimuse-navidrome-registry/v1","entries":[]}',{mode:0o600});
 f.options.navidromeRegistryFile=path;
 await assert.rejects(f.start(true),/^Error: Account runtime unavailable$/);
 assert.deepEqual(await readdir(f.directory),['registry.json']);
 delete f.options.navidromeEntries;
 await writeFile(path,'private invalid JSON');
 await assert.rejects(f.start(true),/^Error: Account runtime unavailable$/);
 assert.deepEqual(await readdir(f.directory),['registry.json']);
 await writeFile(path,JSON.stringify({version:'navimuse-navidrome-registry/v1',entries:[{credentialRef:'incomplete'}]}));
 await assert.rejects(f.start(true),/^Error: Account runtime unavailable$/);
 assert.deepEqual(await readdir(f.directory),['registry.json']);
 assert.equal(f.upstreamCalls(),0);
});

test('explicit passkey runtime policy mounts signed ceremonies only on a valid relying-party origin',async t=>{
 const f=await fixture(t,false,true);await f.start(true);
 assert.equal((await f.call('/api/auth/v1/session')).body.methods.passkey,true);
 await f.call('/api/auth/v1/setup',{body:{setupToken,username:'owner',displayName:'Owner',password}});
 const signed=await f.call('/api/auth/v1/password/login',{body:{username:'owner',password}}),session=short(signed);
 const start=await f.call('/api/auth/v1/passkeys/register/options',{cookie:session,body:{}});assert.equal(start.status,200);
 const binding=start.cookies[0].split(';')[0],auth=passkeyAuthenticatorFixture(start.body.options.user.id,{origin:f.options.boundaryOptions.canonicalOrigin,rpID:'localhost'});
 assert.equal((await f.call('/api/auth/v1/passkeys/register/verify',{cookie:session+'; '+binding,body:{ceremonyId:start.body.ceremonyId,response:auth.registration(start.body.options.challenge),label:'Runtime key'}})).status,201);
 const login=await f.call('/api/auth/v1/passkeys/login/options',{cookie:binding,body:{}});
 const result=await f.call('/api/auth/v1/passkeys/login/verify',{cookie:binding,body:{ceremonyId:login.body.ceremonyId,response:auth.authentication(login.body.options.challenge)}});
 assert.equal(result.status,200);assert.equal(result.body.account.id,signed.body.account.id);
 await f.stop();f.options.boundaryOptions.canonicalOrigin='http://127.0.0.1:9000';
 await assert.rejects(f.start(false),/Account runtime unavailable/);
});

test('username-first runtime policy is explicit and cannot enable absent passkey support',async t=>{
 const f=await fixture(t,false,true);f.options.passkeyUsernameFirstEnabled=true;await f.start(true);
 assert.deepEqual((await f.call('/api/auth/v1/passkeys/policy')).body,{usernameFirst:true});
 const start=await f.call('/api/auth/v1/passkeys/login/options',{body:{username:'unknown'}});assert.equal(start.status,200);assert.equal(start.body.options.allowCredentials.length,20);
 await f.stop();f.options.passkeyEnabled=false;await assert.rejects(f.start(false),/Account runtime unavailable/);
});
