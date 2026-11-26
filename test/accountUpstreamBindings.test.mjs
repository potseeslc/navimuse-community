import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openAccountStore,restoreAccountStoreBackup} from '../server/accountStore.mjs';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {accountQueueScope} from '../server/accountUpstreamBindings.mjs';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
const binding={serverId:'10000000-0000-4000-8000-000000000001',username:'MusicOwner',credentialRef:'navidrome-owner'};
const proof={expectedGeneration:1,expectedRevision:1,remember:true};
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'navimuse-binding-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'accounts'),store=await openAccountStore(path);let closed=false;
  const close=()=>{if (!closed) {store.close();closed=true;}};t.after(close);
  const owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
  const listener=store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
  return {root,path,store,close,owner,listener};
}

test('only owner approval binds an account and changing binding revokes its prior sessions',async t=>{
  const {store,owner,listener}=await fixture(t),session=store.issuePasswordSession(listener.id,proof);
  assert.deepEqual(store.getUpstreamBinding(listener.id),{revision:0,binding:null});
  assert.throws(()=>store.setUpstreamBinding(listener.id,listener.id,{expectedRevision:0,binding}),/denied/);
  assert.deepEqual(store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding}),{revision:1,binding});
  assert.equal(store.authenticateSession(session.token),null);assert.equal(store.refreshDevice(session.deviceToken),null);
  assert.equal(store.getAccount(listener.id).authorizationGeneration,2);
  const current=store.issuePasswordSession(listener.id,{...proof,expectedGeneration:2});
  store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:1,binding});
  assert.ok(store.authenticateSession(current.token),'Idempotent approval does not revoke');
  store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:1,binding:null});
  assert.deepEqual(store.getUpstreamBinding(listener.id),{revision:2,binding:null});
  assert.equal(store.authenticateSession(current.token),null);
  assert.throws(()=>store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding}),/changed/);
  assert.equal(store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:2,binding}).revision,3);
});

test('separate worker writers cannot overwrite a stale binding revision',async t=>{
  const {path,store,owner,listener}=await fixture(t);
  store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding});
  const one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);t.after(()=>one.close());t.after(()=>two.close());
  const results=await Promise.allSettled([one.setUpstreamBinding(owner.id,listener.id,{expectedRevision:1,binding:{...binding,username:'First'}}),two.setUpstreamBinding(owner.id,listener.id,{expectedRevision:1,binding:{...binding,username:'Second'}})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await one.getUpstreamBinding(listener.id)).revision,2);
});

test('failed audit insertion rolls back binding, generation and both bearer revocations',async t=>{
  const {path,store,owner,listener}=await fixture(t),session=store.issuePasswordSession(listener.id,proof);
  const db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
  db.exec("CREATE TRIGGER fail_binding_audit BEFORE INSERT ON account_events WHEN NEW.operation='upstream-binding-approved' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  assert.throws(()=>store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding}),/synthetic failure/);
  assert.deepEqual(store.getUpstreamBinding(listener.id),{revision:0,binding:null});
  assert.equal(store.getAccount(listener.id).authorizationGeneration,1);
  assert.ok(store.authenticateSession(session.token));assert.ok(store.refreshDevice(session.deviceToken));
});

test('bindings survive worker restart and backup while restored bearer tokens stay revoked',async t=>{
  const {root,path,store,close,owner,listener}=await fixture(t);
  store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding});
  const session=store.issuePasswordSession(listener.id,{...proof,expectedGeneration:2});
  const backup=store.createBackup(join(root,'backups'));assert.equal(backup.schemaVersion,10);close();
  const reopened=await openAccountStoreWorker(path);t.after(()=>reopened.close());assert.deepEqual(await reopened.getUpstreamBinding(listener.id),{revision:1,binding});
  const restoredPath=join(root,'restored');await restoreAccountStoreBackup(backup.path,restoredPath);
  const restored=await openAccountStoreWorker(restoredPath);t.after(()=>restored.close());
  assert.deepEqual(await restored.getUpstreamBinding(listener.id),{revision:1,binding});
  assert.equal(await restored.authenticateSession(session.token),null);assert.equal(await restored.refreshDevice(session.deviceToken),null);
});

test('schema 4 migration preserves identities and sessions without inventing upstream approvals',async t=>{
  const {path,store,close,owner}=await fixture(t),session=store.issuePasswordSession(owner.id,proof);close();
  const db=new DatabaseSync(join(path,'accounts.sqlite'));db.exec('DROP TABLE passkey_login_targets; DROP TABLE account_recovery_codes; DROP TABLE passkey_credentials; DROP TABLE passkey_accounts; DROP TABLE passkey_ceremonies; DROP TABLE account_preferences; DROP TABLE account_upstream_bindings; PRAGMA user_version=4');db.close();
  const upgraded=await openAccountStoreWorker(path);t.after(()=>upgraded.close());
  assert.deepEqual(await upgraded.getUpstreamBinding(owner.id),{revision:0,binding:null});
  assert.ok(await upgraded.authenticateSession(session.token));
});

test('opaque queue namespaces isolate account/server/username but survive credential-reference rotation',async t=>{
  const {store,owner,listener}=await fixture(t),secret=Buffer.alloc(32,20);
  const scope=accountQueueScope(secret,owner.id,binding);assert.match(scope,/^queue-scope-v2:[0-9a-f]{64}$/);
  assert.equal(accountQueueScope(secret,owner.id,{...binding,credentialRef:'replacement'}),scope);
  assert.notEqual(accountQueueScope(secret,listener.id,binding),scope);
  assert.notEqual(accountQueueScope(secret,owner.id,{...binding,username:'musicowner'}),scope);
  assert.notEqual(accountQueueScope(secret,owner.id,{...binding,serverId:'20000000-0000-4000-8000-000000000002'}),scope);
  for (const invalid of [{...binding,password:'secret'},{...binding,credentialRef:'/secrets/file'},{...binding,username:' bad '},{...binding,serverId:'https://music.example'},{...binding,username:'bad\nname'}]) {
    assert.throws(()=>store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding:invalid}),/Invalid/);
    assert.throws(()=>accountQueueScope(secret,owner.id,invalid),/Invalid/);
  }
});

test('session-based binding approval checks recent owner authentication within the mutation transaction',async t=>{
  const root=await mkdtemp(join(tmpdir(),'navimuse-recent-binding-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let time=1000000;const store=await openAccountStore(root,{now:()=>time});t.after(()=>store.close());
  const owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
  const listener=store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
  const session=store.issuePasswordSession(owner.id,proof),listenerSession=store.issuePasswordSession(listener.id,proof);
  assert.equal('changeWithinTransaction' in store,false);
  assert.throws(()=>store.setUpstreamBindingForSession(owner.id,listener.id,{expectedRevision:0,binding}),/Recent authentication/);
  assert.throws(()=>store.setUpstreamBindingForSession(listenerSession.token,listener.id,{expectedRevision:0,binding}),/denied/);
  assert.equal(store.setUpstreamBindingForSession(session.token,listener.id,{expectedRevision:0,binding}).revision,1);
  time+=5*60*1000;
  assert.ok(store.authenticateSession(session.token));
  assert.throws(()=>store.setUpstreamBindingForSession(session.token,listener.id,{expectedRevision:1,binding:null}),/Recent authentication/);
  const renewed=store.refreshDevice(session.deviceToken);
  assert.throws(()=>store.setUpstreamBindingForSession(renewed.token,listener.id,{expectedRevision:1,binding:null}),/Recent authentication/);
  assert.deepEqual(store.getUpstreamBinding(listener.id),{revision:1,binding});
  const fresh=store.issuePasswordSession(owner.id,proof);
  store.logoutSession(fresh.token);
  assert.throws(()=>store.setUpstreamBindingForSession(fresh.token,listener.id,{expectedRevision:1,binding:null}),/Recent authentication/);
});

test('competing owner revocation and session approval serialize authorization with the binding audit',async t=>{
  const {root,path,store,close,owner,listener}=await fixture(t);
  const second=store.createListener(owner.id,{username:'second-owner',displayName:'Second owner'},credential);
  store.setAccess(owner.id,second.id,{owner:true,disabled:false});
  const token=store.issuePasswordSession(owner.id,proof).token;close();
  const actor=await openAccountStoreWorker(path),revoker=await openAccountStoreWorker(path);
  t.after(()=>actor.close());t.after(()=>revoker.close());
  const [approval,revocation]=await Promise.allSettled([
    actor.setUpstreamBindingForSession(token,listener.id,{expectedRevision:0,binding}),
    revoker.setAccess(second.id,owner.id,{owner:false,disabled:true}),
  ]);
  assert.equal(revocation.status,'fulfilled');
  const current=await actor.getUpstreamBinding(listener.id);
  const db=new DatabaseSync(join(path,'accounts.sqlite'),{readOnly:true});
  try {
    const changed=db.prepare("SELECT sequence FROM account_events WHERE account_id=? AND operation='access-changed' ORDER BY sequence DESC LIMIT 1").get(owner.id);
    const approved=db.prepare("SELECT sequence FROM account_events WHERE account_id=? AND operation='upstream-binding-approved'").get(listener.id);
    if (approval.status==='fulfilled') {
      assert.deepEqual(current,{revision:1,binding});assert.ok(approved.sequence<changed.sequence,'Authorization and write committed before revocation');
    } else {
      assert.match(approval.reason.message,/Recent authentication required|Account operation denied/);
      assert.deepEqual(current,{revision:0,binding:null});assert.equal(approved,undefined);
    }
  } finally {db.close();}
  await assert.rejects(actor.setUpstreamBindingForSession(token,listener.id,{expectedRevision:current.revision,binding:null}),/Recent authentication required/);
  assert.deepEqual(await actor.getUpstreamBinding(listener.id),current);
});
