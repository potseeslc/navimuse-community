import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNavidromeAccountRegistry} from '../server/navidromeAccountRegistry.mjs';
import {createAccountUpstreamAccess} from '../server/accountUpstreamAccess.mjs';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
const serverId='10000000-0000-4000-8000-000000000001';
async function upstream(t) {
 let mode='ok',requests=0;
 const server=createServer((req,res)=>{
  requests++;const params=new URL(req.url,'http://fixture').searchParams;
  const valid=params.get('u')==='MusicOwner' && params.get('t')===createHash('md5').update('fixture-password'+params.get('s')).digest('hex');
  res.setHeader('Content-Type','application/json');
  res.end(mode==='oversize'?' '.repeat(16385):JSON.stringify({'subsonic-response':{status:valid&&mode==='ok'?'ok':'failed',error:valid&&mode==='ok'?undefined:{message:'private upstream detail'}}}));
 });server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const url=`http://127.0.0.1:${server.address().port}`;
 return {entry:{credentialRef:'music-owner',serverId,url,username:'MusicOwner',password:'fixture-password'},policy:value=>assert.equal(value.origin,url),mode:value=>{mode=value;},requests:()=>requests};
}
test('registry verifies captured credentials before approval and feeds the real account access boundary',async t=>{
 const {entry,policy,requests}=await upstream(t);
 const registry=createNavidromeAccountRegistry({entries:[entry],assertAllowedUrl:policy});
 entry.username='Changed';entry.password='Changed';
 assert.equal(await registry.bindingForCredential('unknown'),null);assert.equal(requests(),0);
 const binding=await registry.bindingForCredential('music-owner');assert.equal(binding.username,'MusicOwner');
 assert.equal(JSON.stringify(registry).includes('fixture-password'),false);assert.equal(JSON.stringify(registry).includes(entry.url),false);
 const dir=await mkdtemp(join(tmpdir(),'navimuse-registry-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await openAccountStoreWorker(dir);t.after(()=>store.close());
 const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const access=createAccountUpstreamAccess({store,queueSecret:randomBytes(32),clients:registry.clients});
 let issued=await store.issuePasswordSession(owner.id,{expectedGeneration:1,expectedRevision:1,remember:false});
 assert.deepEqual(await access.withUpstream(issued.token,request=>request('/rest/ping.view')),{ok:false,code:'UPSTREAM_UNASSIGNED'});
 await store.setUpstreamBinding(owner.id,owner.id,{expectedRevision:0,binding});
 issued=await store.issuePasswordSession(owner.id,{expectedGeneration:2,expectedRevision:1,remember:false});
 const result=await access.withUpstream(issued.token,async request=>(await (await request('/rest/ping.view')).json())['subsonic-response'].status);
 assert.deepEqual(result,{ok:true,value:'ok'});
 const personal=await access.withUpstream(issued.token,(_,identity,withCredentials)=>withCredentials(credentials=>({username:credentials.username,password:credentials.password,identity:identity.upstream.username})));
 assert.deepEqual(personal,{ok:true,value:{username:'MusicOwner',password:'fixture-password',identity:'MusicOwner'}});
 assert.equal((await access.withUpstream('not-a-session',(_,__,withCredentials)=>withCredentials(()=>true))).ok,false);
});
test('failed credentials and oversized verification responses cannot produce an approved binding',async t=>{
 const {entry,policy,mode}=await upstream(t);
 const registry=createNavidromeAccountRegistry({entries:[entry],assertAllowedUrl:policy});
 for (const state of ['failed','oversize']) {
  mode(state);await assert.rejects(registry.bindingForCredential(entry.credentialRef),/^Error: Navidrome credential verification unavailable$/);
 }
 const wrong=createNavidromeAccountRegistry({entries:[{...entry,password:'wrong'}],assertAllowedUrl:policy});mode('ok');
 await assert.rejects(wrong.bindingForCredential(entry.credentialRef),/^Error: Navidrome credential verification unavailable$/);
});
test('registry rejects URL-policy violations, duplicate references and ambiguous server IDs at construction',async t=>{
 const {entry,policy}=await upstream(t);
 for (const entries of [[entry,entry],[entry,{...entry,credentialRef:'second',url:entry.url+'/other'}],[{...entry,username:' owner'}],[{...entry,extra:'private'}]])
  assert.throws(()=>createNavidromeAccountRegistry({entries,assertAllowedUrl:policy}),/^Error: Invalid Navidrome account registry$/);
 assert.throws(()=>createNavidromeAccountRegistry({entries:[entry],assertAllowedUrl:()=>{throw new Error('private configuration');}}),/^Error: Invalid Navidrome account registry$/);
});

test('owner connection catalogue captures bounded labels without credentials or upstream requests',async t=>{
 const {entry,policy,requests}=await upstream(t);
 const labelled={...entry,label:'Music Library'};
 const registry=createNavidromeAccountRegistry({entries:[labelled],assertAllowedUrl:policy});
 labelled.label='Changed';
 const list=registry.listConnections();assert.deepEqual(list,[{reference:'music-owner',label:'Music Library'}]);
 list[0].label='Mutated';assert.equal(registry.listConnections()[0].label,'Music Library');assert.equal(requests(),0);
 assert.deepEqual(createNavidromeAccountRegistry({entries:[entry],assertAllowedUrl:policy}).listConnections(),[{reference:'music-owner',label:'music-owner'}]);
 for(const label of ['', ' padded ', '\nsecret', 'x'.repeat(121), 7])assert.throws(()=>createNavidromeAccountRegistry({entries:[{...entry,label}],assertAllowedUrl:policy}),/Invalid Navidrome account registry/);
});
