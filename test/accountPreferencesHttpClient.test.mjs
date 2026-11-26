import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createAccountHttpBoundary} from '../server/accountHttpBoundary.mjs';
import {createAccountHttpRoutes} from '../server/accountHttpRoutes.mjs';
import {createAccountPreferencesClient} from '../src/services/accountPreferencesService.js';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';

test('Settings client uses the real account HTTP boundary and rejects stale writes after browser account changes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'navimuse-preference-client-'));
 const store=await openAccountStoreWorker(directory);
 let handler;
 const server=createServer((req,res)=>handler(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`http://127.0.0.1:${server.address().port}`;
 const boundary=createAccountHttpBoundary({canonicalOrigin:origin,developmentLoopback:true});
 handler=createAccountHttpRoutes({boundary,store,mode:'local',methods:{password:true,passkey:false,oidc:false},legacyConfigured:false,queueScopeForAccount:async()=>null});
 const nativeFetch=globalThis.fetch;
 try {
  const a=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
  const b=await store.createListener(a.id,{username:'listener',displayName:'Listener'},credential);
  const proof={expectedGeneration:1,expectedRevision:1,remember:false};
  const sa=await store.issuePasswordSession(a.id,proof),sb=await store.issuePasswordSession(b.id,proof);
  let browserSession=sa,requestOrigin=origin;
  globalThis.fetch=(input,init)=>{
   assert.equal(init.credentials,'include');
   const cookie=boundary.cookie('session',browserSession.token,browserSession.session.expiresAt).split(';')[0];
   return nativeFetch(new URL(String(input),origin),{...init,headers:{...init.headers,Origin:requestOrigin,Cookie:cookie}});
  };
  const firstWindow=createAccountPreferencesClient(a.id),secondWindow=createAccountPreferencesClient(a.id);
  const first=await firstWindow.read(),second=await secondWindow.read();
  const draft=structuredClone(first.preferences);draft.playback.startFullScreen=false;
  const saved=await firstWindow.save(first.revision,draft);assert.equal(saved.revision,1);
  await assert.rejects(secondWindow.save(second.revision,second.preferences),error=>error.code==='PREFERENCES_CHANGED');
  const refreshed=await secondWindow.read();assert.equal(refreshed.preferences.playback.startFullScreen,false);
  requestOrigin='https://untrusted.invalid';
  await assert.rejects(firstWindow.save(saved.revision,draft),error=>error.code==='PREFERENCES_UNAVAILABLE');requestOrigin=origin;
  browserSession=sb;
  await assert.rejects(firstWindow.read(),error=>error.code==='ACCOUNT_SCOPE_CHANGED');
  await assert.rejects(firstWindow.save(0,draft),error=>error.code==='ACCOUNT_SCOPE_CHANGED');
  const listener=createAccountPreferencesClient(b.id);const untouched=await listener.read();
  assert.equal(untouched.revision,0);assert.equal(untouched.preferences.playback.startFullScreen,true);
  await store.logoutSession(sb.token);
  await assert.rejects(listener.read(),error=>error.code==='PREFERENCES_UNAVAILABLE');
  browserSession=sa;assert.deepEqual(await firstWindow.read(),saved);
 } finally {
  globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await store.close();await rm(directory,{recursive:true,force:true});
 }
});
