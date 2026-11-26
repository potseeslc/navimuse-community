import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openAccountStore,restoreAccountStoreBackup} from '../server/accountStore.mjs';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
const random=()=>randomBytes(32).toString('base64url');
const options=()=>({purpose:'login',challenge:random(),origin:'https://music.example.test',rpID:'music.example.test',bindingToken:'p1.'+random()});
async function setup(t) {
 const root=await mkdtemp(join(tmpdir(),'navimuse-passkeys-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let time=Date.now();const path=join(root,'accounts'),store=await openAccountStore(path,{now:()=>time});let closed=false;
 const close=()=>{if(!closed){closed=true;store.close();}};t.after(close);
 return {store,path,root,close,advance:ms=>time+=ms};
}
test('ceremonies are browser, purpose and relying-party bound and consume exactly once',async t=>{
 const {store,path}=await setup(t),input=options(),created=store.createPasskeyCeremony(input),request={...input,id:created.id};
 const db=new DatabaseSync(join(path,'accounts.sqlite'));t.after(()=>db.close());
 const saved=db.prepare('SELECT * FROM passkey_ceremonies').get();assert.ok(!JSON.stringify(saved).includes(input.bindingToken));
 assert.throws(()=>store.createPasskeyCeremony({...input,bindingToken:'p1.'+random()}),/UNIQUE/);
 for(const change of [{bindingToken:'p1.'+random()},{purpose:'register'},{origin:'https://other.test'},{rpID:'other.test'},{sessionToken:'s1.'+random()}]) assert.equal(store.consumePasskeyCeremony({...request,...change}),null);
 const result=store.consumePasskeyCeremony(request);assert.equal(result.challenge,input.challenge);assert.equal(result.accountId,null);
 assert.equal(store.consumePasskeyCeremony(request),null,'rejected signature after consumption cannot reuse challenge');
 assert.equal(db.prepare('SELECT count(*) AS n FROM passkey_ceremonies').get().n,0);
});
test('enrollment requires recent session and rejects session replacement, revocation and generation changes',async t=>{
 const {store,advance}=await setup(t),owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const login=()=>store.issuePasswordSession(owner.id,{expectedGeneration:store.getAccount(owner.id).authorizationGeneration,expectedRevision:1});
 let session=login();const base={...options(),purpose:'register',sessionToken:session.token};
 assert.throws(()=>store.createPasskeyCeremony({...base,sessionToken:null}),/Recent authentication/);
 let created=store.createPasskeyCeremony(base);
 assert.equal(store.consumePasskeyCeremony({...base,id:created.id,sessionToken:login().token}),null);
 assert.equal(store.consumePasskeyCeremony({...base,id:created.id}).accountId,owner.id);
 created=store.createPasskeyCeremony(base);store.logoutSession(session.token);
 assert.equal(store.consumePasskeyCeremony({...base,id:created.id}),null);
 session=login();base.sessionToken=session.token;created=store.createPasskeyCeremony(base);
 store.replaceOwnPassword(owner.id,{expectedGeneration:1,expectedRevision:1,credential});
 assert.equal(store.consumePasskeyCeremony({...base,id:created.id}),null);
 base.sessionToken=store.issuePasswordSession(owner.id,{expectedGeneration:2,expectedRevision:2}).token;
 advance(300000);assert.throws(()=>store.createPasskeyCeremony(base),/Recent authentication/);
});
test('expiry and outstanding limits are enforced and expired rows reclaimed',async t=>{
 const {store,advance}=await setup(t),input=options();const rows=Array.from({length:4},()=>store.createPasskeyCeremony({...input,challenge:random()}));
 assert.throws(()=>store.createPasskeyCeremony(input),/limit/);
 advance(300000);assert.equal(store.consumePasskeyCeremony({...input,id:rows[0].id}),null);assert.ok(store.createPasskeyCeremony(input));
 assert.throws(()=>store.createPasskeyCeremony({...input,challenge:'short'}),/Invalid/);
});
test('two workers cannot consume one challenge twice and restart preserves consumption',async t=>{
 const {path,store,close}=await setup(t),input=options(),created=store.createPasskeyCeremony(input);close();
 const one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);
 try {const results=await Promise.all([one.consumePasskeyCeremony({...input,id:created.id}),two.consumePasskeyCeremony({...input,id:created.id})]);assert.equal(results.filter(Boolean).length,1);} finally {await one.close();await two.close();}
 const reopened=await openAccountStore(path);try {assert.equal(reopened.consumePasskeyCeremony({...input,id:created.id}),null);} finally {reopened.close();}
});
test('backup restore never resurrects an unconsumed challenge or revoked session',async t=>{
 const {store,root}=await setup(t),input=options(),created=store.createPasskeyCeremony(input);
 const backup=store.createBackup(join(root,'backups'));assert.equal(backup.schemaVersion,10);
 const destination=join(root,'restored');await restoreAccountStoreBackup(backup.path,destination);
 const restored=await openAccountStore(destination);try {assert.equal(restored.consumePasskeyCeremony({...input,id:created.id}),null);} finally {restored.close();}
 assert.ok(store.consumePasskeyCeremony({...input,id:created.id}),'backup does not mutate live challenges');
});
test('schema six upgrades without changing existing account credentials',async t=>{
 const {store,path,close}=await setup(t),owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);close();
 const db=new DatabaseSync(join(path,'accounts.sqlite'));db.exec('DROP TABLE passkey_login_targets; DROP TABLE account_recovery_codes; DROP TABLE passkey_credentials; DROP TABLE passkey_accounts; DROP TABLE passkey_ceremonies; PRAGMA user_version=6');db.close();
 const upgraded=await openAccountStore(path);try {assert.deepEqual(upgraded.getPasswordCredential(owner.id),{credential,revision:1});assert.ok(upgraded.createPasskeyCeremony(options()));}finally{upgraded.close();}
});

test('acknowledged challenge consumption survives abrupt process death',async t=>{
 const {path,store,close}=await setup(t),input=options(),created=store.createPasskeyCeremony(input);close();
 const moduleUrl=new URL('../server/accountStore.mjs',import.meta.url).href;
 const script=`import {openAccountStore} from ${JSON.stringify(moduleUrl)};const store=await openAccountStore(process.argv[1]);if(!store.consumePasskeyCeremony(JSON.parse(process.argv[2])))process.exit(1);console.log('consumed');setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,path,JSON.stringify({...input,id:created.id})]);
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});const exited=once(child,'exit');
 const ready=await Promise.race([once(child.stdout,'data'),exited.then(()=>{throw new Error('Writer exited before consumption');})]);assert.match(String(ready[0]),/consumed/);child.kill('SIGKILL');await exited;
 const reopened=await openAccountStore(path);try{assert.equal(reopened.consumePasskeyCeremony({...input,id:created.id}),null);}finally{reopened.close();}
});

test('username targets survive restart and do not return after restore',async t=>{
 const {store,path,root,close}=await setup(t);store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const input={...options(),username:'owner'},created=store.createPasskeyCeremony(input);close();
 const reopened=await openAccountStore(path);
 try{
  const backup=reopened.createBackup(join(root,'backups')),destination=join(root,'restored');await restoreAccountStoreBackup(backup.path,destination);
  const restored=await openAccountStore(destination);try{assert.equal(restored.consumePasskeyCeremony({...input,id:created.id}),null);}finally{restored.close();}
  const db=new DatabaseSync(join(destination,'accounts.sqlite'));try{assert.equal(db.prepare('SELECT count(*) AS n FROM passkey_login_targets').get().n,0);}finally{db.close();}
  const proof=reopened.consumePasskeyCeremony({...input,id:created.id});assert.equal(proof.usernameFirst,true);assert.equal(proof.generation,1);
 }finally{reopened.close();}
});
test('schema nine migrates with its live account and existing discoverable ceremony preserved',async t=>{
 const {store,path,close}=await setup(t),owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential),input=options(),created=store.createPasskeyCeremony(input);close();
 const db=new DatabaseSync(join(path,'accounts.sqlite'));db.exec('DROP TABLE passkey_login_targets; PRAGMA user_version=9');db.close();
 const upgraded=await openAccountStore(path);try{
  assert.equal(upgraded.getAccount(owner.id).authorizationGeneration,1);assert.equal(upgraded.getPasswordCredential(owner.id).revision,1);
  assert.equal(upgraded.consumePasskeyCeremony({...input,id:created.id}).accountId,null);
  const named=upgraded.createPasskeyCeremony({...options(),username:'owner'});assert.deepEqual(named.credentials,[]);
 }finally{upgraded.close();}
});

test('unknown and disabled username targets never degrade to discoverable login; expiry removes target rows',async t=>{
 const {store,path,advance}=await setup(t),owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const listener=store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);store.setAccess(owner.id,listener.id,{owner:false,disabled:true});
 for(const username of ['absent','listener']){
  const input={...options(),username},created=store.createPasskeyCeremony(input);assert.deepEqual(created.credentials,[]);
  assert.equal(store.consumePasskeyCeremony({...input,id:created.id}),null);
 }
 const input={...options(),username:'owner'},created=store.createPasskeyCeremony(input);advance(300000);
 assert.equal(store.consumePasskeyCeremony({...input,id:created.id}),null);
 const db=new DatabaseSync(join(path,'accounts.sqlite'));try{assert.equal(db.prepare('SELECT count(*) AS n FROM passkey_login_targets').get().n,0);}finally{db.close();}
});
test('two workers consume a username-bound challenge at most once',async t=>{
 const {store,path,close}=await setup(t),owner=store.createFirstOwner({username:'owner',displayName:'Owner'},credential),input={...options(),username:'owner'},created=store.createPasskeyCeremony(input);close();
 const one=await openAccountStoreWorker(path),two=await openAccountStoreWorker(path);
 try{const results=await Promise.all([one.consumePasskeyCeremony({...input,id:created.id}),two.consumePasskeyCeremony({...input,id:created.id})]);assert.equal(results.filter(Boolean).length,1);assert.equal(results.find(Boolean).accountId,owner.id);}finally{await one.close();await two.close();}
});
