import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createAccountUpstreamAccess} from '../server/accountUpstreamAccess.mjs';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
const binding={serverId:'10000000-0000-4000-8000-000000000001',username:'MusicOwner',credentialRef:'owner-music'};
async function fixture(t) {
 const directory=await mkdtemp(join(tmpdir(),'navimuse-access-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=await openAccountStoreWorker(directory);t.after(()=>store.close());
 const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const listener=await store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
 const issue=async id=>store.issuePasswordSession(id,{expectedGeneration:(await store.getAccount(id)).authorizationGeneration,expectedRevision:1,remember:true});
 let requests=0;
 const client={...binding,request:async()=>{requests++;return 'synthetic music response';}};
 const queueSecret=randomBytes(32),access=createAccountUpstreamAccess({store,queueSecret,clients:[client]});
 return {directory,store,owner,listener,issue,client,access,queueSecret,requests:()=>requests};
}
test('only an authenticated account with an exactly matching approval can dispatch its private client',async t=>{
 const {store,owner,listener,issue,access,requests}=await fixture(t);
 const operation=(request,context)=>request().then(value=>({value,...context}));
 assert.deepEqual(await access.withUpstream(owner.id,operation),{ok:false,code:'SIGN_IN_REQUIRED'});
 let session=await issue(listener.id);
 assert.deepEqual(await access.withUpstream(session.token,operation),{ok:false,code:'UPSTREAM_UNASSIGNED'});
 assert.equal(await access.queueScopeForAccount(listener.id),null);assert.equal(requests(),0);
 await store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding});
 assert.deepEqual(await access.withUpstream(session.token,operation),{ok:false,code:'SIGN_IN_REQUIRED'});
 session=await issue(listener.id);
 const result=await access.withUpstream(session.token,operation);
 assert.equal(result.ok,true);assert.equal(result.value.accountId,listener.id);assert.equal(result.value.bindingRevision,1);
 assert.equal(result.value.value,'synthetic music response');assert.equal(result.value.queueScope,await access.queueScopeForAccount(listener.id));
 assert.equal(requests(),1);
 const ownerSession=await issue(owner.id);
 assert.deepEqual(await access.withUpstream(ownerSession.token,operation),{ok:false,code:'UPSTREAM_UNASSIGNED'});
 await store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:1,binding:null});
 assert.deepEqual(await access.withUpstream(session.token,operation),{ok:false,code:'SIGN_IN_REQUIRED'});assert.equal(requests(),1);
});
test('missing references, exact username/server mismatches and private service failures never grant fallback access',async t=>{
 const {store,owner,listener,issue,queueSecret,client,requests}=await fixture(t);
 await store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding});const session=await issue(listener.id);
 for (const clients of [[],[{...client,username:'musicowner'}],[{...client,serverId:'20000000-0000-4000-8000-000000000002'}]]) {
  const access=createAccountUpstreamAccess({store,queueSecret,clients});
  assert.equal(await access.queueScopeForAccount(listener.id),null);
  assert.deepEqual(await access.withUpstream(session.token,r=>r()),{ok:false,code:'UPSTREAM_UNAVAILABLE'});
 }
 assert.equal(requests(),0);
 assert.throws(()=>createAccountUpstreamAccess({store,queueSecret,clients:[client,client]}),/Invalid upstream access configuration/);
 const access=createAccountUpstreamAccess({store,queueSecret,clients:[{...client,request:async()=>{throw new Error('private credential detail');}}]});
 assert.deepEqual(await access.withUpstream(session.token,r=>r()),{ok:false,code:'UPSTREAM_UNAVAILABLE'});
});
test('concurrent approval changes cannot pair an old bearer with the new binding',async t=>{
 const {directory,store,owner,listener,issue,access}=await fixture(t);
 await store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding});const session=await issue(listener.id);
 const writer=await openAccountStoreWorker(directory);t.after(()=>writer.close());
 const reads=Array.from({length:20},()=>store.authenticateUpstreamSession(session.token));
 const change=writer.setUpstreamBinding(owner.id,listener.id,{expectedRevision:1,binding:{...binding,username:'OtherMusicUser'}});
 const results=await Promise.all(reads);await change;
 for (const state of results) if(state) {assert.equal(state.account.id,listener.id);assert.deepEqual(state.upstream,{revision:1,binding});}
 assert.equal(await store.authenticateUpstreamSession(session.token),null);
 assert.deepEqual(await access.withUpstream(session.token,()=>assert.fail('must not dispatch')),{ok:false,code:'SIGN_IN_REQUIRED'});
});

test('durable playback principal survives cookie logout but not a binding or generation change',async t=>{
 const {store,owner,listener,issue,access,requests}=await fixture(t);
 await store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding});
 const session=await issue(listener.id);
 const captured=await access.withUpstream(session.token,(_,identity)=>identity);
 assert.equal(captured.ok,true);
 await store.logoutSession(session.token);
 assert.equal((await access.withPrincipal(captured.value,r=>r())).ok,true);
 assert.equal(requests(),1);
 assert.equal((await access.withPrincipal({...captured.value,accountId:owner.id},r=>r())).ok,false);
 assert.equal((await access.withPrincipal({...captured.value,queueScope:'forged'},r=>r())).ok,false);
 await store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:1,binding:null});
 assert.equal((await access.withPrincipal(captured.value,r=>r())).ok,false);
 assert.equal(requests(),1);
});
