import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openAccountStoreWorker } from '../server/accountStoreWorker.mjs';
import { createPasswordService } from '../server/passwordCredentials.mjs';
import { validPasswordCredential } from '../server/passwordCredentialRecord.mjs';
import { accountCredentialFixture } from '../test-support/accountCredentialFixture.mjs';

async function setup(t) {
  const path=await mkdtemp(join(tmpdir(),'navimuse-account-credentials-'));
  t.after(()=>rm(path,{recursive:true,force:true}));
  const store=await openAccountStoreWorker(path);t.after(()=>store.close());
  return {path,store};
}

test('account and credential insertion roll back together if the credential write fails', async t => {
  const {path,store}=await setup(t);const db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
  db.exec("CREATE TRIGGER reject_credential BEFORE INSERT ON password_credentials BEGIN SELECT RAISE(ABORT,'fixture write failure'); END;");
  await assert.rejects(store.createFirstOwner({username:'owner',displayName:'Owner'},accountCredentialFixture),/fixture write failure/);
  assert.equal(await store.findByUsername('owner'),null);
  assert.equal(db.prepare('SELECT count(*) AS count FROM account_events').get().count,0);
  db.exec('DROP TRIGGER reject_credential');
  await assert.rejects(store.createFirstOwner({username:'owner',displayName:'Owner'},null),/Invalid password credential/);
  const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},accountCredentialFixture);
  assert.equal((await store.getPasswordCredential(owner.id)).revision,1);
  assert.equal(JSON.stringify(owner).includes(accountCredentialFixture.hash),false,'Account responses contain no credential material');
});

test('screened credentials persist and stale password replacements cannot overwrite a newer password', async t => {
  const {store}=await setup(t);const passwords=await createPasswordService({screenPassword:async()=> 'allowed'});
  const first=await passwords.enrollPassword('First synthetic password');
  const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},first);
  assert.equal(await passwords.verifyPassword((await store.getPasswordCredential(owner.id)).credential,'First synthetic password'),true);
  const second=await passwords.enrollPassword('Second synthetic password');
  const updated=await store.replaceOwnPassword(owner.id,{expectedGeneration:1,expectedRevision:1,credential:second});
  assert.equal(updated.authorizationGeneration,2);
  await assert.rejects(store.replaceOwnPassword(owner.id,{expectedGeneration:1,expectedRevision:1,credential:first}),/denied/);
  await assert.rejects(store.replaceOwnPassword(owner.id,{expectedGeneration:2,expectedRevision:1,credential:first}),/changed/);
  const current=await store.getPasswordCredential(owner.id);assert.equal(current.revision,2);
  assert.equal(await passwords.verifyPassword(current.credential,'Second synthetic password'),true);
  assert.equal(await passwords.verifyPassword(current.credential,'First synthetic password'),false);
  assert.equal((await store.getAccount(owner.id)).authorizationGeneration,2,'Rejected replacements do not change the generation');
});

test('schema v1 upgrades without inventing credentials for existing identity records', async t => {
  const {path,store}=await setup(t);
  const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},accountCredentialFixture);await store.close();
  const db=new DatabaseSync(join(path,'accounts.sqlite'));
  db.exec('DROP TABLE passkey_login_targets; DROP TABLE account_recovery_codes; DROP TABLE passkey_credentials; DROP TABLE passkey_accounts; DROP TABLE passkey_ceremonies; DROP TABLE account_preferences; DROP TABLE account_upstream_bindings; DROP TABLE login_throttle; DROP TABLE account_sessions; DROP TABLE device_families; DROP TABLE password_credentials; PRAGMA user_version=1');db.close();
  const upgraded=await openAccountStoreWorker(path);t.after(()=>upgraded.close());
  assert.deepEqual(await upgraded.getAccount(owner.id),owner);
  assert.equal(await upgraded.getPasswordCredential(owner.id),null,'Legacy identity alone is not a password credential');
});


test('credential records require their own version and nonempty valid hash', () => {
  assert.equal(validPasswordCredential(accountCredentialFixture),true);
  for (const record of [
    {version:'argon2id-v1'}, {version:'argon2id-v1',hash:undefined},
    {version:'argon2id-v1',hash:null}, {version:'argon2id-v1',hash:''},
    {version:'argon2id-v1',hash:'malformed'},
    Object.assign(Object.create(accountCredentialFixture),{one:1,two:2}),
  ]) assert.equal(validPasswordCredential(record),false);
});

test('ordinary account reads expose only account metadata after credential persistence', async t => {
  const {store}=await setup(t);
  const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},accountCredentialFixture);
  const expected=['id','username','displayName','roles','disabled','authorizationGeneration','createdAt','updatedAt'].sort();
  for (const account of [owner,await store.getAccount(owner.id),await store.findByUsername('owner')]) {
    assert.deepEqual(Object.keys(account).sort(),expected);
    assert.equal(JSON.stringify(account).includes(accountCredentialFixture.hash),false);
  }
});
