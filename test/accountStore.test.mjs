import { accountCredentialFixture as credential } from '../test-support/accountCredentialFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openAccountStore } from '../server/accountStore.mjs';

const moduleUrl = new URL('../server/accountStore.mjs', import.meta.url).href;
async function location(t) {
  const path = await mkdtemp(join(tmpdir(), 'navimuse-accounts-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
const input = (username) => ({ username, displayName: 'Listener' });
function writer(path, operation) {
  const script = `import {openAccountStore} from ${JSON.stringify(moduleUrl)};
  const store=await openAccountStore(process.argv[1]);
  try { const result=${operation}; console.log(JSON.stringify({ok:true,result})); }
  catch(error) { console.log(JSON.stringify({ok:false,error:error.message})); }
  finally {store.close();}`;
  const child = spawn(process.execPath, ['--input-type=module','-e',script,path]);
  let stdout='', stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  return once(child,'exit').then(([code])=>{assert.equal(code,0,stderr);return JSON.parse(stdout);});
}

test('account records persist, enforce normalized uniqueness, and protect owner administration', async t => {
  const path=await location(t);let store=await openAccountStore(path);
  try {
    const owner=store.createFirstOwner(input(' Owner '),credential);
    assert.equal(owner.username,'owner');assert.equal(owner.authorizationGeneration,1);
    const listener=store.createListener(owner.id,input('listener'),credential);
    assert.throws(()=>store.createListener(owner.id,input('ＬＩＳＴＥＮＥＲ'),credential));
    assert.throws(()=>store.createListener(listener.id,input('unapproved'),credential),/denied/);
    assert.throws(()=>store.setAccess(owner.id,owner.id,{owner:true,disabled:true}),/last enabled owner/);
    const elevated=store.setAccess(owner.id,listener.id,{owner:true,disabled:false});
    assert.equal(elevated.authorizationGeneration,2);
    const disabled=store.setAccess(listener.id,owner.id,{owner:true,disabled:true});
    assert.equal(disabled.authorizationGeneration,2);
    assert.throws(()=>store.createListener(owner.id,input('blocked'),credential),/denied/);
    store.close();store=await openAccountStore(path);
    assert.deepEqual(store.getAccount(owner.id),disabled);
    assert.equal(store.findByUsername(' LISTENER ').id,listener.id);
    assert.equal((await stat(join(path,'accounts.sqlite'))).mode & 0o077,0);
  } finally {store.close();}
});

test('separate writers cannot bootstrap twice or remove both enabled owners', async t => {
  const path=await location(t);let store=await openAccountStore(path);store.close();
  const bootstrap=await Promise.all(['first','second'].map(name=>writer(path,`store.createFirstOwner(${JSON.stringify(input(name))},${JSON.stringify(credential)})`)));
  assert.equal(bootstrap.filter(x=>x.ok).length,1);
  assert.match(bootstrap.find(x=>!x.ok).error,/already completed/);
  const owner=bootstrap.find(x=>x.ok).result;
  store=await openAccountStore(path);const second=store.createListener(owner.id,input('third'),credential);
  store.setAccess(owner.id,second.id,{owner:true,disabled:false});store.close();
  const changes=await Promise.all([owner,second].map(account=>writer(path,`store.setAccess(${JSON.stringify(account.id)},${JSON.stringify(account.id)},{owner:true,disabled:true})`)));
  assert.equal(changes.filter(x=>x.ok).length,1);
  assert.match(changes.find(x=>!x.ok).error,/last enabled owner/);
});

test('committed account survives SIGKILL without a clean database close', async t => {
  const path=await location(t);
  const script=`import {openAccountStore} from ${JSON.stringify(moduleUrl)};const store=await openAccountStore(process.argv[1]);store.createFirstOwner({username:'durable',displayName:'Durable'},${JSON.stringify(credential)});console.log('committed');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,path]);
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const exited=once(child,'exit');
  const ready=await Promise.race([once(child.stdout,'data'),exited.then(()=>{throw new Error('Writer exited before commit');})]);
  assert.match(String(ready[0]),/committed/);child.kill('SIGKILL');await exited;
  const store=await openAccountStore(path);
  try {assert.equal(store.findByUsername('durable').roles.includes('owner'),true);} finally {store.close();}
});

test('store refuses an account directory readable by other users', async t => {
  const path=await location(t);await chmod(path,0o755);
  await assert.rejects(openAccountStore(path),/must be private/);
});

test('an interrupted uncommitted transaction is rolled back on reopen', async t => {
  const path=await location(t);let store=await openAccountStore(path);
  const owner=store.createFirstOwner(input('owner'),credential);store.close();
  const script=`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec("BEGIN IMMEDIATE; UPDATE accounts SET disabled=1,authorization_generation=2;");console.log('uncommitted');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,join(path,'accounts.sqlite')]);
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const exited=once(child,'exit');
  const ready=await Promise.race([once(child.stdout,'data'),exited.then(()=>{throw new Error('Writer exited before transaction');})]);
  assert.match(String(ready[0]),/uncommitted/);child.kill('SIGKILL');await exited;
  store=await openAccountStore(path);
  try {assert.deepEqual(store.getAccount(owner.id),owner);} finally {store.close();}
});
