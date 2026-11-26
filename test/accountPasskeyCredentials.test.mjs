import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openAccountStore,restoreAccountStoreBackup} from '../server/accountStore.mjs';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {accountCredentialFixture as password} from '../test-support/accountCredentialFixture.mjs';
const proof={expectedGeneration:1,expectedRevision:1};
// Storage-only bytes, never represented as cryptographically verified responses.
const fakeCredential=()=>({id:randomBytes(32).toString('base64url'),publicKey:new Uint8Array([1,2,3]),counter:0,transports:['internal']});
async function setup(t) {
 const root=await mkdtemp(join(tmpdir(),'navimuse-passkey-records-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let clock=Date.now();const path=join(root,'accounts'),store=await openAccountStore(path,{now:()=>clock});let closed=false;const close=()=>{if(!closed){closed=true;store.close();}};t.after(close);
 const owner=store.createFirstOwner({username:'owner',displayName:'Owner'},password),session=store.issuePasswordSession(owner.id,proof);
 return {store,path,root,owner,session,close,advance:ms=>clock+=ms};
}
function enroll(store,token,credential=fakeCredential()) {
 const prepared=store.preparePasskeyEnrollment(token);
 store.registerPasskey(token,{expectedGeneration:prepared.account.authorizationGeneration,userHandle:prepared.userHandle,credential,deviceType:'multiDevice',backedUp:true,label:'Test key',ceremonyExpiresAt:Date.now()+300000});
 return store.getPasskeyCredential(credential.id);
}
const issuance=saved=>({expectedGeneration:saved.generation,expectedRevision:saved.revision,newCounter:0,deviceType:saved.deviceType,backedUp:saved.backedUp,remember:true,ceremonyExpiresAt:Date.now()+300000});
test('opaque handles and credential ownership persist without leaking key material in enrollment options',async t=>{
 const {store,path,owner,session,close}=await setup(t),prepared=store.preparePasskeyEnrollment(session.token),saved=enroll(store,session.token);
 assert.equal(prepared.userHandle,saved.userHandle);assert.notEqual(prepared.userHandle,owner.id);assert.equal(Buffer.from(prepared.userHandle,'base64url').length,32);
 const again=store.preparePasskeyEnrollment(session.token);assert.deepEqual(Object.keys(again.credentials[0]).sort(),['id','transports']);
 const other=store.createListener(owner.id,{username:'listener',displayName:'Listener'},password),otherSession=store.issuePasswordSession(other.id,proof);
 assert.notEqual(store.preparePasskeyEnrollment(otherSession.token).userHandle,saved.userHandle);
 assert.throws(()=>enroll(store,otherSession.token,saved.credential),/UNIQUE/);
 close();const reopened=await openAccountStore(path);try{assert.deepEqual(reopened.getPasskeyCredential(saved.credential.id),saved);}finally{reopened.close();}
});
test('enrollment rechecks recent authentication, generation and account user handle',async t=>{
 const {store,session,owner,advance}=await setup(t),prepared=store.preparePasskeyEnrollment(session.token),input={expectedGeneration:1,userHandle:prepared.userHandle,credential:fakeCredential(),deviceType:'singleDevice',backedUp:false,label:'Key',ceremonyExpiresAt:Date.now()+300000};
 assert.throws(()=>store.registerPasskey(session.token,{...input,userHandle:randomBytes(32).toString('base64url')}),/denied/);
 assert.throws(()=>store.registerPasskey(session.token,{...input,expectedGeneration:2}),/denied/);
 advance(300000);assert.throws(()=>store.registerPasskey(session.token,input),/Recent authentication/);
 assert.equal(store.getPasskeyCredential(input.credential.id),null);
});
test('two workers cannot issue from one credential revision, including zero-counter synced passkeys',async t=>{
 const {store,path,session}=await setup(t),saved=enroll(store,session.token),one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);
 try {
  const results=await Promise.allSettled([one.issuePasskeySession(saved.credential.id,issuance(saved)),two.issuePasskeySession(saved.credential.id,issuance(saved))]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const winner=results.find(x=>x.status==='fulfilled').value;
  assert.equal((await one.authenticateSession(winner.token)).account.id,saved.accountId);assert.ok(await one.refreshDevice(winner.deviceToken));
  assert.equal((await two.getPasskeyCredential(saved.credential.id)).revision,2);
 }finally{await one.close();await two.close();}
});
test('counter update, audit and device issuance roll back together on session write failure',async t=>{
 const {store,path,session}=await setup(t),saved=enroll(store,session.token),db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
 db.exec("CREATE TRIGGER fail_session BEFORE INSERT ON account_sessions BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.throws(()=>store.issuePasskeySession(saved.credential.id,{...issuance(saved),newCounter:1}),/fixture failure/);
 assert.deepEqual(store.getPasskeyCredential(saved.credential.id),saved);assert.equal(db.prepare('SELECT count(*) AS n FROM device_families').get().n,0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM account_events WHERE operation='passkey-login'").get().n,0);
 db.exec('DROP TRIGGER fail_session');assert.ok(store.issuePasskeySession(saved.credential.id,{...issuance(saved),newCounter:1}));
 const updated=store.getPasskeyCredential(saved.credential.id);assert.equal(updated.credential.counter,1);
 assert.throws(()=>store.issuePasskeySession(saved.credential.id,{...issuance(updated),newCounter:1}),/denied/);
});
test('disable, generation change and revocation deny stale passkey proofs',async t=>{
 const {store,path,owner,session}=await setup(t),listener=store.createListener(owner.id,{username:'listener',displayName:'Listener'},password),login=store.issuePasswordSession(listener.id,proof),saved=enroll(store,login.token);
 store.setAccess(owner.id,listener.id,{owner:false,disabled:true});assert.equal(store.getPasskeyCredential(saved.credential.id),null);assert.throws(()=>store.issuePasskeySession(saved.credential.id,issuance(saved)),/denied/);
 store.setAccess(owner.id,listener.id,{owner:false,disabled:false});assert.throws(()=>store.issuePasskeySession(saved.credential.id,issuance(saved)),/denied/);
 const current=store.getPasskeyCredential(saved.credential.id),db=new DatabaseSync(join(path,'accounts.sqlite'));db.prepare('UPDATE passkey_credentials SET revoked=1 WHERE id=?').run(saved.credential.id);db.close();
 assert.equal(store.getPasskeyCredential(saved.credential.id),null);assert.throws(()=>store.issuePasskeySession(saved.credential.id,issuance(current)),/denied/);
});
test('schema-seven upgrade preserves identity and backup restore revokes historical keys and sessions',async t=>{
 const {store,path,root,owner,session,close}=await setup(t);close();const db=new DatabaseSync(join(path,'accounts.sqlite'));db.exec('DROP TABLE passkey_login_targets; DROP TABLE account_recovery_codes; DROP TABLE passkey_credentials; DROP TABLE passkey_accounts; PRAGMA user_version=7');db.close();
 const upgraded=await openAccountStore(path);try{
  assert.deepEqual(upgraded.getPasswordCredential(owner.id),{credential:password,revision:1});const saved=enroll(upgraded,session.token),issued=upgraded.issuePasskeySession(saved.credential.id,issuance(saved));
  const backup=upgraded.createBackup(join(root,'backups'));assert.equal(backup.schemaVersion,10);const target=join(root,'restored');await restoreAccountStoreBackup(backup.path,target);
  const restored=await openAccountStore(target);try{assert.equal(restored.getPasskeyCredential(saved.credential.id),null);assert.equal(restored.authenticateSession(issued.token),null);
   const snapshot=new DatabaseSync(join(target,'accounts.sqlite'));try{assert.equal(snapshot.prepare('SELECT user_handle FROM passkey_accounts WHERE account_id=?').get(owner.id).user_handle,saved.userHandle);assert.equal(snapshot.prepare('SELECT revoked FROM passkey_credentials WHERE id=?').get(saved.credential.id).revoked,1);}finally{snapshot.close();}}finally{restored.close();}
 }finally{upgraded.close();}
});

test('invalid or missing completion deadlines cannot persist credentials or issue sessions',async t=>{
 const {store,session,path}=await setup(t),saved=enroll(store,session.token),prepared=store.preparePasskeyEnrollment(session.token);
 const credential=fakeCredential(),input={expectedGeneration:1,userHandle:prepared.userHandle,credential,deviceType:'singleDevice',backedUp:false,label:'Key'};
 const db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
 const sessions=db.prepare('SELECT count(*) AS n FROM account_sessions').get().n;
 for(const ceremonyExpiresAt of [undefined,null,'9999999999999',{},[],NaN,Infinity,0,Date.now()-60000,Number.MAX_SAFE_INTEGER+1]) {
  assert.throws(()=>store.registerPasskey(session.token,{...input,ceremonyExpiresAt}),/denied/);
  assert.throws(()=>store.issuePasskeySession(saved.credential.id,{...issuance(saved),ceremonyExpiresAt}),/denied/);
 }
 assert.equal(store.getPasskeyCredential(credential.id),null);
 assert.deepEqual(store.getPasskeyCredential(saved.credential.id),saved);
 assert.equal(db.prepare('SELECT count(*) AS n FROM account_sessions').get().n,sessions);
 assert.equal(db.prepare('SELECT count(*) AS n FROM device_families').get().n,0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM account_events WHERE operation='passkey-login'").get().n,0);
});

test('credential management is account-scoped, recent, revision-checked and invalidates captured assertions',async t=>{
 const {store,session,owner,advance}=await setup(t),saved=enroll(store,session.token);
 const list=store.listPasskeys(session.token);assert.equal(list.length,1);assert.equal(list[0].id,saved.credential.id);
 assert.deepEqual(Object.keys(list[0]).sort(),['backedUp','createdAt','deviceType','id','label','lastUsedAt','revision']);
 const other=store.createListener(owner.id,{username:'listener',displayName:'Listener'},password),otherSession=store.issuePasswordSession(other.id,proof);
 assert.deepEqual(store.listPasskeys(otherSession.token),[]);
 assert.throws(()=>store.changePasskey(otherSession.token,{id:saved.credential.id,expectedRevision:1,label:'Other'}),/denied/);
 store.changePasskey(session.token,{id:saved.credential.id,expectedRevision:1,label:'Renamed key'});
 assert.equal(store.listPasskeys(session.token)[0].label,'Renamed key');
 assert.throws(()=>store.changePasskey(session.token,{id:saved.credential.id,expectedRevision:1,remove:true}),/changed/);
 assert.throws(()=>store.issuePasskeySession(saved.credential.id,issuance(saved)),/denied/);
 const captured=store.getPasskeyCredential(saved.credential.id);
 store.changePasskey(session.token,{id:saved.credential.id,expectedRevision:2,remove:true});
 assert.deepEqual(store.listPasskeys(session.token),[]);assert.equal(store.getPasskeyCredential(saved.credential.id),null);
 assert.throws(()=>store.issuePasskeySession(saved.credential.id,issuance(captured)),/denied/);
 const next=enroll(store,session.token);advance(300000);
 assert.equal(store.listPasskeys(session.token).length,1);
 assert.throws(()=>store.changePasskey(session.token,{id:next.credential.id,expectedRevision:1,remove:true}),/Recent authentication/);
 assert.throws(()=>store.listPasskeys(null),/Sign in/);
});
test('removal cannot leave an account without a password or another active passkey',async t=>{
 const {store,session,path,owner}=await setup(t),saved=enroll(store,session.token),db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
 db.prepare('DELETE FROM password_credentials WHERE account_id=?').run(owner.id);
 assert.throws(()=>store.changePasskey(session.token,{id:saved.credential.id,expectedRevision:1,remove:true}),/Last recovery method/);
 assert.equal(store.listPasskeys(session.token).length,1);
 enroll(store,session.token);store.changePasskey(session.token,{id:saved.credential.id,expectedRevision:1,remove:true});
 assert.equal(store.listPasskeys(session.token).length,1);
});
test('two workers cannot concurrently remove the final recovery credentials',async t=>{
 const {store,session,path,owner}=await setup(t),first=enroll(store,session.token),second=enroll(store,session.token),db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
 db.prepare('DELETE FROM password_credentials WHERE account_id=?').run(owner.id);
 const one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);
 try {
  const results=await Promise.allSettled([one.changePasskey(session.token,{id:first.credential.id,expectedRevision:1,remove:true}),two.changePasskey(session.token,{id:second.credential.id,expectedRevision:1,remove:true})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await one.listPasskeys(session.token)).length,1);
 }finally{await one.close();await two.close();}
});
