import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openAccountStore,restoreAccountStoreBackup} from '../server/accountStore.mjs';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {SESSION_LIFETIME_MS,RECENT_AUTH_MS} from '../server/accountSessions.mjs';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
const proof={expectedGeneration:1,expectedRevision:1,remember:true};
async function setup(t,sessionPolicy) {
  const root=await mkdtemp(join(tmpdir(),'navimuse-sessions-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let clock=1800000000000;
  const path=join(root,'accounts'),store=await openAccountStore(path,{now:()=>clock,sessionPolicy});let closed=false;const close=()=>{if (!closed) {store.close();closed=true;}};t.after(close);
  const owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
  return {root,path,store,owner,close,advance:ms=>{clock+=ms;}};
}
test('sessions survive restart with only hashed verifiers stored and token types separated',async t=>{
  const {path,store,owner,close}=await setup(t),login=store.issuePasswordSession(owner.id,proof);
  const db=new DatabaseSync(join(path,'accounts.sqlite'));
  const persisted=JSON.stringify([db.prepare('SELECT * FROM account_sessions').all(),db.prepare('SELECT * FROM device_families').all()]);
  assert.equal(persisted.includes(login.token),false);assert.equal(persisted.includes(login.deviceToken),false);
  assert.equal(store.authenticateSession(login.deviceToken),null);assert.equal(store.refreshDevice(login.token),null);
  db.close();close();
  const reopened=await openAccountStore(path,{now:()=>login.session.authenticatedAt});t.after(()=>reopened.close());
  assert.equal(reopened.authenticateSession(login.token).account.id,owner.id);
  const devices=reopened.listDevices(login.token);assert.equal(devices[0].current,true);assert.equal(JSON.stringify(devices).includes('verifier'),false);
});
test('separate workers rotate one predecessor once without invalidating the winner',async t=>{
  const {path,store,owner}=await setup(t);
  // Real-time workers require a real-time issuance, independent of the fake clock.
  const one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);t.after(()=>one.close());t.after(()=>two.close());
  const login=await one.issuePasswordSession(owner.id,proof);
  const outcomes=await Promise.all([one.refreshDevice(login.deviceToken),two.refreshDevice(login.deviceToken)]);
  assert.equal(outcomes.filter(Boolean).length,1);const winner=outcomes.find(Boolean);
  assert.equal(await two.refreshDevice(login.deviceToken),null);
  assert.equal((await two.authenticateSession(winner.token)).account.id,owner.id);
  assert.ok(await one.refreshDevice(winner.deviceToken));
});
test('short expiry, device idle and absolute expiry are enforced without refreshing recent auth',async t=>{
  const {store,owner,advance}=await setup(t);let login=store.issuePasswordSession(owner.id,proof);
  const absolute=store.listDevices(login.token)[0].absoluteExpiresAt;
  advance(RECENT_AUTH_MS);login=store.refreshDevice(login.deviceToken);
  assert.equal(store.listDevices(login.token)[0].absoluteExpiresAt,absolute);
  assert.throws(()=>store.logoutEverywhere(login.token),/Recent authentication/);
  advance(SESSION_LIFETIME_MS);assert.equal(store.authenticateSession(login.token),null);
  login=store.refreshDevice(login.deviceToken);assert.ok(login);
  // Stay active below the idle deadline until the immutable absolute deadline.
  for (let day=0;day<170;day+=10) {advance(10*86400000);login=store.refreshDevice(login.deviceToken);assert.ok(login);assert.equal(store.listDevices(login.token)[0].absoluteExpiresAt,absolute);}
  advance(10*86400000);assert.equal(store.refreshDevice(login.deviceToken),null);
  const fresh=store.issuePasswordSession(owner.id,proof);advance(30*86400000);assert.equal(store.refreshDevice(fresh.deviceToken),null);
});
test('password changes reject stale issuance and invalidate existing short and device tokens',async t=>{
  const {store,owner}=await setup(t),login=store.issuePasswordSession(owner.id,proof);
  store.replaceOwnPassword(owner.id,{...proof,credential});
  assert.throws(()=>store.issuePasswordSession(owner.id,proof),/denied/);
  assert.equal(store.authenticateSession(login.token),null);assert.equal(store.refreshDevice(login.deviceToken),null);
  assert.throws(()=>store.issuePasswordSession(owner.id,{...proof,expectedGeneration:2}),/denied/);
});
test('device revocation enforces ownership and logout everywhere revokes every own session',async t=>{
  const {store,owner}=await setup(t),first=store.issuePasswordSession(owner.id,proof),second=store.issuePasswordSession(owner.id,proof);
  const listener=store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential),other=store.issuePasswordSession(listener.id,proof);
  assert.throws(()=>store.revokeDevice(first.token,other.session.deviceId),/denied/);
  store.revokeDevice(first.token,second.session.deviceId);
  assert.equal(store.authenticateSession(second.token),null);assert.equal(store.refreshDevice(second.deviceToken),null);
  const short=store.issuePasswordSession(owner.id,{...proof,remember:false});assert.equal(short.deviceToken,null);
  store.logoutEverywhere(first.token);
  assert.equal(store.authenticateSession(short.token),null);assert.equal(store.refreshDevice(first.deviceToken),null);
  assert.ok(store.authenticateSession(other.token));store.logoutSession(other.token);assert.equal(store.refreshDevice(other.deviceToken),null);
});
test('failed short-session insert rolls back device creation and rotation',async t=>{
  const {store,path,owner}=await setup(t),login=store.issuePasswordSession(owner.id,proof);
  const db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
  db.exec("CREATE TRIGGER reject_session BEFORE INSERT ON account_sessions BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.throws(()=>store.issuePasswordSession(owner.id,proof),/fixture failure/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM device_families').get().n,1);
  assert.throws(()=>store.refreshDevice(login.deviceToken),/fixture failure/);
  db.exec('DROP TRIGGER reject_session');assert.ok(store.refreshDevice(login.deviceToken),'Failed rotation did not consume predecessor');
});
test('backup restore retains accounts but never resurrects historical sessions',async t=>{
  const {store,root,owner}=await setup(t),login=store.issuePasswordSession(owner.id,proof);
  const backup=store.createBackup(join(root,'backups'));store.logoutSession(login.token);
  const target=join(root,'restored');await restoreAccountStoreBackup(backup.path,target);
  const restored=await openAccountStore(target,{now:()=>login.session.authenticatedAt});t.after(()=>restored.close());
  assert.equal(restored.getAccount(owner.id).id,owner.id);
  assert.equal(restored.authenticateSession(login.token),null);assert.equal(restored.refreshDevice(login.deviceToken),null);
});


test('schema v2 migrates credentials while disabled accounts cannot issue or renew sessions',async t=>{
  const {store,path,owner,close}=await setup(t);
  const listener=store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
  const login=store.issuePasswordSession(listener.id,proof);
  store.setAccess(owner.id,listener.id,{owner:false,disabled:true});
  assert.equal(store.authenticateSession(login.token),null);assert.equal(store.refreshDevice(login.deviceToken),null);
  assert.throws(()=>store.issuePasswordSession(listener.id,proof),/denied/);
  close();const db=new DatabaseSync(join(path,'accounts.sqlite'));
  db.exec('DROP TABLE passkey_login_targets; DROP TABLE account_recovery_codes; DROP TABLE passkey_credentials; DROP TABLE passkey_accounts; DROP TABLE passkey_ceremonies; DROP TABLE account_preferences; DROP TABLE account_upstream_bindings; DROP TABLE login_throttle; DROP TABLE account_sessions; DROP TABLE device_families; PRAGMA user_version=2');db.close();
  const upgraded=await openAccountStore(path);t.after(()=>upgraded.close());
  assert.deepEqual(upgraded.getPasswordCredential(owner.id),{credential,revision:1});
  assert.ok(upgraded.issuePasswordSession(owner.id,proof));
});


test('session and device caps preserve active sessions and a failed refresh keeps its predecessor',async t=>{
  const {store,owner,advance}=await setup(t,{maxDevices:1,maxSessions:2});
  const first=store.issuePasswordSession(owner.id,proof);
  assert.throws(()=>store.issuePasswordSession(owner.id,proof),/Device limit/);
  const next=store.refreshDevice(first.deviceToken);
  assert.throws(()=>store.refreshDevice(next.deviceToken),/Session limit/);
  assert.ok(store.authenticateSession(next.token),'Reaching a limit does not evict an active session');
  advance(SESSION_LIFETIME_MS);
  assert.ok(store.refreshDevice(next.deviceToken),'Expired sessions are pruned and failed refresh preserved the current token');
});
test('expired families are pruned and deployment lifetimes cannot exceed accepted ceilings',async t=>{
  const {store,owner,advance,path}=await setup(t,{shortMs:100,recentMs:50,idleMs:200,absoluteMs:600,maxDevices:1});
  const first=store.issuePasswordSession(owner.id,proof);advance(100);assert.equal(store.authenticateSession(first.token),null);
  advance(100);assert.equal(store.refreshDevice(first.deviceToken),null);
  const next=store.issuePasswordSession(owner.id,proof);assert.notEqual(next.session.deviceId,first.session.deviceId);
  const db=new DatabaseSync(join(path,'accounts.sqlite'));try {
    assert.equal(db.prepare('SELECT count(*) AS n FROM device_families').get().n,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM account_sessions').get().n,1);
  } finally {db.close();}
  for (const sessionPolicy of [{shortMs:0},{idleMs:31*86400000},{recentMs:100,shortMs:50},{maxDevices:1.1},{unknown:1}]) {
    await assert.rejects(openAccountStoreWorker(path,{sessionPolicy}),/Invalid session policy/);
  }
});

test('every revocation operation rolls back family and short-session changes together',async t=>{
  for (const operation of ['logoutSession','revokeDevice','logoutEverywhere']) await t.test(operation,async t=>{
    const {store,path,owner}=await setup(t);
    const manager=store.issuePasswordSession(owner.id,proof),target=store.issuePasswordSession(owner.id,proof);
    const db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
    const revoke=()=>operation==='revokeDevice' ? store.revokeDevice(manager.token,target.session.deviceId) : store[operation](target.token);
    db.exec("CREATE TRIGGER reject_revocation BEFORE UPDATE OF revoked ON account_sessions WHEN NEW.revoked=1 BEGIN SELECT RAISE(ABORT,'fixture revocation failure'); END;");
    assert.throws(revoke,/fixture revocation failure/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM device_families WHERE revoked=1').get().n,0,'Family update rolls back when following session update fails');
    assert.equal(db.prepare('SELECT count(*) AS n FROM account_sessions WHERE revoked=1').get().n,0);
    assert.ok(store.authenticateSession(target.token));assert.ok(store.authenticateSession(manager.token));
    db.exec('DROP TRIGGER reject_revocation');revoke();
    assert.equal(store.authenticateSession(target.token),null);assert.equal(store.refreshDevice(target.deviceToken),null);
    assert.equal(Boolean(store.authenticateSession(manager.token)),operation!=='logoutEverywhere');
  });
});

test('owner account overview is paginated, secret-free, and rechecks session authority',async t=>{
 const {store,owner}=await setup(t);
 const listener=store.createListener(owner.id,{username:'reader',displayName:'Reader'},credential);
 const disabled=store.createListener(owner.id,{username:'disabled',displayName:'Disabled'},credential);
 store.setAccess(owner.id,disabled.id,{owner:false,disabled:true});
 store.setUpstreamBinding(owner.id,listener.id,{expectedRevision:0,binding:{serverId:'10000000-0000-4000-8000-000000000001',username:'private-upstream-name',credentialRef:'private-ref'}});
 const login=store.issuePasswordSession(owner.id,proof);
 const first=store.listManagedAccountsForSession(login.token,{limit:2});
 assert.equal(first.accounts.length,2);assert(first.page.nextAfter);
 const second=store.listManagedAccountsForSession(login.token,{limit:2,after:first.page.nextAfter});
 assert.equal(second.accounts.length,1);assert.equal(second.page.nextAfter,null);
 const all=[...first.accounts,...second.accounts];assert.equal(new Set(all.map(x=>x.id)).size,3);
 assert.deepEqual(all.find(x=>x.id===listener.id),{id:listener.id,username:'reader',displayName:'Reader',roles:['listener'],disabled:false,musicConfigured:true,bindingRevision:1});
 assert.equal(all.find(x=>x.id===disabled.id).disabled,true);
 const encoded=JSON.stringify(all);for(const secret of ['private-upstream-name','private-ref',credential.hash,'authorizationGeneration','serverId'])assert(!encoded.includes(secret));
 assert.equal(store.listManagedAccountsForSession('bad'),null);
 const reader=store.issuePasswordSession(listener.id,{...proof,expectedGeneration:2});
 assert.deepEqual(store.listManagedAccountsForSession(reader.token),{ok:false,code:'OWNER_REQUIRED'});
 store.logoutSession(login.token);assert.equal(store.listManagedAccountsForSession(login.token),null);
});

test('managed access requires recent owner authority, detects stale views, and revokes only changed accounts',async t=>{
 const {store,owner,advance}=await setup(t),ownerSession=store.issuePasswordSession(owner.id,proof),listener=store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential),session=store.issuePasswordSession(listener.id,proof);
 assert.throws(()=>store.getManagedAccessForSession(session.token,owner.id),/Owner access/);
 assert.deepEqual(store.getManagedAccessForSession(ownerSession.token,listener.id),{accountId:listener.id,owner:false,disabled:false,revision:1});
 const noOp=store.setManagedAccessForSession(ownerSession.token,listener.id,{expectedGeneration:1,owner:false,disabled:false});assert.equal(noOp.revision,1);assert(store.authenticateSession(session.token));
 assert.throws(()=>store.setManagedAccessForSession(ownerSession.token,listener.id,{expectedGeneration:2,owner:true,disabled:false}),/access changed/);
 const changed=store.setManagedAccessForSession(ownerSession.token,listener.id,{expectedGeneration:1,owner:true,disabled:false});assert.equal(changed.revision,2);
 assert.equal(store.authenticateSession(session.token),null);assert.equal(store.refreshDevice(session.deviceToken),null);assert(store.authenticateSession(ownerSession.token));
 advance(RECENT_AUTH_MS);assert.throws(()=>store.setManagedAccessForSession(ownerSession.token,listener.id,{expectedGeneration:2,owner:true,disabled:true}),/Recent authentication/);
});
test('competing owners cannot remove both enabled owners across workers',async t=>{
 const {path,store,owner,close}=await setup(t),other=store.createListener(owner.id,{username:'other',displayName:'Other'},credential);store.setAccess(owner.id,other.id,{owner:true,disabled:false});
 close();
 const one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);
 try{
  const oneSession=await one.issuePasswordSession(owner.id,proof),twoSession=await two.issuePasswordSession(other.id,{...proof,expectedGeneration:2});
  const results=await Promise.allSettled([one.setManagedAccessForSession(oneSession.token,owner.id,{expectedGeneration:1,owner:false,disabled:false}),two.setManagedAccessForSession(twoSession.token,other.id,{expectedGeneration:2,owner:false,disabled:false})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const records=await Promise.all([one.getAccount(owner.id),one.getAccount(other.id)]);assert.equal(records.filter(a=>a.roles.includes('owner')&&!a.disabled).length,1);
 }finally{await one.close();await two.close();}
});

test('managed listener creation requires recent owner authority and rejects caller-selected privileges',async t=>{
 const {store,owner,advance}=await setup(t),session=store.issuePasswordSession(owner.id,proof);
 const input={username:' New.Listener ',displayName:'New Listener'};
 for(const extra of [{owner:true},{roles:['owner']},{id:owner.id},{actorId:owner.id},{disabled:true}])assert.throws(()=>store.createManagedListenerForSession(session.token,{...input,...extra},credential),/Invalid account creation/);
 const created=store.createManagedListenerForSession(session.token,input,credential);
 assert.equal(created.username,'new.listener');assert.deepEqual(created.roles,['listener']);assert.equal(created.disabled,false);assert.notEqual(created.id,owner.id);
 assert.equal(store.getUpstreamBinding(created.id).binding,null);
 assert.throws(()=>store.createManagedListenerForSession(session.token,input,credential),/Username unavailable/);
 const listenerSession=store.issuePasswordSession(created.id,proof);
 assert.throws(()=>store.createManagedListenerForSession(listenerSession.token,{username:'denied',displayName:'Denied'},credential),/Owner access/);
 advance(RECENT_AUTH_MS);
 assert.throws(()=>store.createManagedListenerForSession(session.token,{username:'expired',displayName:'Expired'},credential),/Recent authentication/);
 assert.equal(store.findByUsername('expired'),null);assert.equal(store.findByUsername('denied'),null);
 const renewed=store.issuePasswordSession(owner.id,proof);store.logoutSession(renewed.token);
 assert.throws(()=>store.createManagedListenerForSession(renewed.token,{username:'revoked',displayName:'Revoked'},credential),/Recent authentication/);assert.equal(store.findByUsername('revoked'),null);
});

test('two workers cannot create the same normalized listener twice',async t=>{
 const {path,owner}=await setup(t),one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);
 try{
  const session=await one.issuePasswordSession(owner.id,proof);
  const results=await Promise.allSettled([one.createManagedListenerForSession(session.token,{username:' Same ',displayName:'One'},credential),two.createManagedListenerForSession(session.token,{username:'same',displayName:'Two'},credential)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const created=await one.findByUsername('same');assert.deepEqual(created.roles,['listener']);
 }finally{await one.close();await two.close();}
});
