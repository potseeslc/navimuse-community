import { accountCredentialFixture as credential } from '../test-support/accountCredentialFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAccountStore, restoreAccountStoreBackup } from '../server/accountStore.mjs';
import { openAccountStoreWorker } from '../server/accountStoreWorker.mjs';

test('live WAL backup restores a consistent independent account database without overwriting a target', async t => {
  const root=await mkdtemp(join(tmpdir(),'navimuse-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=await openAccountStoreWorker(join(root,'source'));t.after(()=>store.close());
  const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
  const backup=await store.createBackup(join(root,'backups'));
  assert.equal((await stat(backup.path)).mode & 0o077,0);
  await store.createListener(owner.id,{username:'later',displayName:'Later'},credential);
  const restoredPath=join(root,'restored');await restoreAccountStoreBackup(backup.path,restoredPath);
  const restored=await openAccountStore(restoredPath);
  try {
    assert.deepEqual(restored.getAccount(owner.id),owner);
    assert.deepEqual(restored.getPasswordCredential(owner.id),{credential,revision:1},'Snapshot preserves the account credential');
    assert.equal(restored.findByUsername('later'),null,'Snapshot precedes later source changes');
    assert.throws(()=>restored.createFirstOwner({username:'other',displayName:'Other'},credential),/already completed/);
    await assert.rejects(restoreAccountStoreBackup(backup.path,restoredPath),{code:'EEXIST'});
    assert.deepEqual(restored.getAccount(owner.id),owner,'Failed overwrite leaves target intact');
  } finally {restored.close();}
});

test('invalid and incomplete backups never become an active database', async t => {
  const root=await mkdtemp(join(tmpdir(),'navimuse-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const bad=join(root,'bad.sqlite');await writeFile(bad,'not a database',{mode:0o600});
  const target=join(root,'target');await assert.rejects(restoreAccountStoreBackup(bad,target));
  await assert.rejects(stat(join(target,'accounts.sqlite')),{code:'ENOENT'});
  const partial=join(root,'unfinished.partial');await writeFile(partial,'',{mode:0o600});
  await assert.rejects(restoreAccountStoreBackup(partial,join(root,'another')),/Invalid account backup/);
});
