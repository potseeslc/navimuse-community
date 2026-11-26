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
import {defaultAccountPreferences,parseAccountPreferenceChange} from '../shared/accountPreferences.js';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';

test('preferences enforce exact values without coercion',()=>{
 const preferences=defaultAccountPreferences(),expectedAccountId='10000000-0000-4000-8000-000000000001';
 assert.deepEqual(parseAccountPreferenceChange({expectedAccountId,expectedRevision:0,preferences}).preferences,preferences);
 for(const change of [{expectedAccountId,expectedRevision:-1,preferences},{expectedAccountId,expectedRevision:0,preferences,accountId:'other'}, {expectedAccountId,expectedRevision:0,preferences:{...preferences,library:{...preferences.library,artworkSize:600}}}, {expectedAccountId,expectedRevision:0,preferences:{...preferences,playback:{...preferences.playback,autoplayAfterQueue:"yes"}}}])assert.throws(()=>parseAccountPreferenceChange({expectedAccountId,...change}));
});

test('real preference routes isolate accounts, reject stale concurrent saves and survive restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'navimuse-preferences-'));
 let store=await openAccountStoreWorker(directory),other;
 let handler;
 const server=createServer((req,res)=>handler(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await other?.close();await store.close();await rm(directory,{recursive:true,force:true});});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const boundary=createAccountHttpBoundary({canonicalOrigin:origin,developmentLoopback:true});
 const mount=()=>{handler=createAccountHttpRoutes({boundary,store,mode:'local',methods:{password:true,passkey:false,oidc:false},legacyConfigured:false,queueScopeForAccount:async()=>null});};mount();
 const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const listener=await store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
 const proof={expectedGeneration:1,expectedRevision:1,remember:false};
 const a=await store.issuePasswordSession(owner.id,proof),b=await store.issuePasswordSession(listener.id,proof);
 const cookie=session=>boundary.cookie('session',session.token,session.session.expiresAt).split(';')[0];
 const request=(session,body,extra={})=>fetch(origin+'/api/auth/v1/preferences',{method:body?'PUT':'GET',headers:{Cookie:session?cookie(session):'',Origin:origin,'X-Requested-With':'NaviMuse','X-NaviMuse-Preferences':'2',...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request(null)).status,401);
 const defaults=await (await request(a)).json();assert.equal(defaults.revision,0);
 const expectedAccountId=owner.id;
 const preferences={...defaults.preferences,appearance:{theme:'system',accent:'neutral'},library:{...defaults.preferences.library,artworkSize:'1000',selectedFolders:['1','2']}};
 let response=await request(a,{expectedAccountId,expectedRevision:0,preferences});assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
 assert.equal((await (await request(b)).json()).preferences.library.artworkSize,'600');
 assert.equal((await request(a,{expectedAccountId,expectedRevision:0,preferences})).status,409);
 const crossed=await request(b,{expectedAccountId,expectedRevision:0,preferences});assert.equal(crossed.status,409);assert.equal((await crossed.json()).code,'ACCOUNT_SCOPE_CHANGED');
 assert.equal((await request(a,{expectedAccountId,expectedRevision:1,preferences,accountId:listener.id})).status,400);
 assert.equal((await request(a,{expectedAccountId,expectedRevision:1,preferences},{Origin:'https://untrusted.invalid'})).status,403);
 other=await openAccountStoreWorker(directory);
 const race=await Promise.all([store.writePreferencesForSession(a.token,{expectedAccountId,expectedRevision:1,preferences}),other.writePreferencesForSession(a.token,{expectedAccountId,expectedRevision:1,preferences})]);
 assert.deepEqual(race.map(x=>x.ok).sort(),[false,true]);
 await other.close();other=null;await store.close();store=await openAccountStoreWorker(directory);mount();
 const restored=await (await request(a)).json();assert.equal(restored.revision,2);assert.equal(restored.preferences.library.artworkSize,'1000');assert.deepEqual(restored.preferences.library.selectedFolders,['1','2']);assert.deepEqual(restored.preferences.appearance,{theme:'system',accent:'neutral'});
 await store.logoutSession(a.token);
 assert.equal((await request(a,{expectedAccountId,expectedRevision:2,preferences})).status,401);
 assert.equal(await store.writePreferencesForSession(a.token,{expectedAccountId,expectedRevision:2,preferences}),null);
 assert.equal((await (await request(b)).json()).revision,0);
});

test('schema-six backup reports its real version and restores preferences while invalidating old sessions',async t=>{
 const {openAccountStore,restoreAccountStoreBackup}=await import('../server/accountStore.mjs');
 const root=await mkdtemp(join(tmpdir(),'navimuse-preference-backup-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const store=await openAccountStore(join(root,'source'));
 let backup,session,owner;
 try {
  owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
  session=store.issuePasswordSession(owner.id,{expectedGeneration:1,expectedRevision:1,remember:false});
  const preferences=defaultAccountPreferences();preferences.library.artworkSize='1000';
  store.writePreferencesForSession(session.token,{expectedAccountId:owner.id,expectedRevision:0,preferences});
  backup=store.createBackup(join(root,'backups'));
  assert.equal(backup.schemaVersion,10);
 } finally {store.close();}
 const target=join(root,'restored');await restoreAccountStoreBackup(backup.path,target);
 const restored=await openAccountStore(target);
 try {
  assert.equal(restored.readPreferencesForSession(session.token),null);
  const login=restored.issuePasswordSession(owner.id,{expectedGeneration:1,expectedRevision:1,remember:false});
  const result=restored.readPreferencesForSession(login.token);
  assert.equal(result.accountId,owner.id);assert.equal(result.revision,1);
  assert.equal(result.preferences.library.artworkSize,'1000');
 } finally {restored.close();}
});
