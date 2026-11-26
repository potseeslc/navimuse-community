import { accountCredentialFixture as credential } from '../test-support/accountCredentialFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openAccountStoreWorker } from '../server/accountStoreWorker.mjs';

test('SQLite contention stays off the caller event loop and close drains accepted work', async t => {
  const directory=await mkdtemp(join(tmpdir(),'navimuse-account-worker-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=await openAccountStoreWorker(directory);
  t.after(()=>store.close());
  const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
  const blocker=new DatabaseSync(join(directory,'accounts.sqlite'));
  try {
    blocker.exec('BEGIN IMMEDIATE');
    let completed=false;
    const write=store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential).then(value=>{completed=true;return value;});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(completed,false,'Caller timer runs while the worker waits on a real database lock');
    blocker.exec('COMMIT');
    const listener=await write;
    assert.equal((await store.getAccount(listener.id)).username,'listener');
    const read=store.getAccount(owner.id);
    const close=store.close();
    assert.equal((await read).id,owner.id,'Accepted operations finish before close');
    await close;
    await assert.rejects(store.getAccount(owner.id),/closed/);
  } finally {blocker.close();}
});

test('worker startup failure rejects rather than leaving a pending client', async t => {
  const directory=await mkdtemp(join(tmpdir(),'navimuse-account-worker-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  await chmod(directory,0o755);
  await assert.rejects(openAccountStoreWorker(directory),/must be private/);
});
