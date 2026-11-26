import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile,stat,writeFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {openAccountStore} from '../server/accountStore.mjs';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {prepareOwnerRecovery} from '../scripts/account-owner-recovery.mjs';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'navimuse-owner-lockout-')),data=join(root,'accounts'),backups=join(root,'backups'),output=join(root,'recovery.json');
 await mkdir(backups,{mode:0o700});t.after(()=>rm(root,{recursive:true,force:true}));
 const store=await openAccountStore(data);const owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);store.close();
 const args=['--accounts-dir',data,'--owner-id',owner.id,'--confirm-owner-id',owner.id,'--expected-generation','1','--output',output,'--backup-dir',backups];
 return {root,data,backups,output,owner,args};
}
test('local operator creates a private single-use grant without an owner session or automatic password changes',async t=>{
 const {data,output,owner,args}=await fixture(t);
 let store=await openAccountStore(data);assert.equal(store.issueDeploymentRecoveryCode,undefined);store.close();
 const worker=await openAccountStoreWorker(data);assert.equal(worker.issueDeploymentRecoveryCode,undefined);await worker.close();
 const {stdout,stderr}=await promisify(execFile)(process.execPath,['scripts/account-owner-recovery.mjs',...args]);
 assert(!stdout.includes('r1.'));assert(!stderr.includes('r1.'));const result=JSON.parse(stdout),grant=JSON.parse(await readFile(output,'utf8'));
 assert.equal((await stat(output)).mode&0o777,0o600);assert.equal((await stat(result.backup)).mode&0o777,0o600);
 assert.equal(grant.accountId,owner.id);assert.match(grant.code,/^r1\.[A-Za-z0-9_-]{43}$/);
 store=await openAccountStore(data);try{
  assert.equal(store.getPasswordCredential(owner.id).revision,1);assert.equal(store.getAccount(owner.id).authorizationGeneration,1);
  assert.deepEqual(store.recoverPasswordWithCode(grant.code,credential),{ok:true});assert.equal(store.recoverPasswordWithCode(grant.code,credential),null);
  assert.equal(store.getAccount(owner.id).authorizationGeneration,2);
 }finally{store.close();}
});
test('operator recovery refuses wrong confirmation, stale generation, disabled and non-sole owners',async t=>{
 const {data,owner,args,output}=await fixture(t);
 const wrong=[...args];wrong[5]='00000000-0000-4000-8000-000000000001';await assert.rejects(prepareOwnerRecovery(wrong),/confirmation/);
 const stale=[...args];stale[7]='2';await assert.rejects(prepareOwnerRecovery(stale),/could not be prepared/);await assert.rejects(stat(output),{code:'ENOENT'});
 const store=await openAccountStore(data);try{
  const other=store.createListener(owner.id,{username:'other',displayName:'Other'},credential);store.setAccess(owner.id,other.id,{owner:true,disabled:false});
  await assert.rejects(prepareOwnerRecovery(args),/could not be prepared/);
  store.setAccess(other.id,owner.id,{owner:true,disabled:true});await assert.rejects(prepareOwnerRecovery(args),/could not be prepared/);
  assert.equal(store.getPasswordCredential(owner.id).revision,1);
 }finally{store.close();}
});
test('operator output cannot overwrite files or follow a symlink',async t=>{
 const {root,args,output}=await fixture(t);await writeFile(output,'keep',{mode:0o600});
 await assert.rejects(prepareOwnerRecovery(args),/could not be prepared/);assert.equal(await readFile(output,'utf8'),'keep');
 await rm(output);const target=join(root,'target');await writeFile(target,'preserve',{mode:0o600});await symlink(target,output);
 await assert.rejects(prepareOwnerRecovery(args),/could not be prepared/);assert.equal(await readFile(target,'utf8'),'preserve');
});
