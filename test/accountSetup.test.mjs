import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createAccountSetup} from '../server/accountSetup.mjs';
import {createAccountPasswordLogin} from '../server/accountPasswordLogin.mjs';
import {createPasswordService} from '../server/passwordCredentials.mjs';
const secret=Buffer.alloc(32,19),token='synthetic-setup-token-53',password='Synthetic setup passphrase 53!';
const input={setupToken:token,username:' OWNER ',displayName:'Owner',password};
const context={networkAddress:'192.0.2.1'};
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'navimuse-setup-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'accounts'),store=await openAccountStoreWorker(path);t.after(()=>store.close());
  return {store,path};
}
const service=(store,passwords,extra={})=>createAccountSetup({store,passwords,verifySetupToken:value=>value===token,
  mode:'local',legacyConfigured:false,throttleSecret:secret,...extra});

test('controlled first-owner enrollment creates a real credential usable by the login service',async t=>{
  const {store}=await fixture(t);let screened=0;
  const passwords=await createPasswordService({screenPassword:async value=>{screened++;assert.equal(value,password);return 'allowed';}});
  const setup=service(store,passwords);
  assert.equal(await store.hasAccounts(),false);
  const result=await setup.setup(input,context);assert.equal(result.ok,true);assert.equal(screened,1);
  assert.deepEqual(Object.keys(result).sort(),['accountId','ok']);
  const account=await store.getAccount(result.accountId);assert.equal(account.username,'owner');assert.deepEqual(account.roles,['owner','listener']);
  const login=createAccountPasswordLogin({store,passwords,mode:'local',throttleSecret:secret});
  const issued=await login.login({username:'owner',password},context);assert.equal(issued.ok,true);
  assert.equal((await store.authenticateSession(issued.issued.token)).account.id,result.accountId);
  assert.deepEqual(await setup.setup(input,context),{ok:false,code:'SETUP_CLOSED'});assert.equal(screened,1);
});

test('invalid tokens and caller-supplied identity/roles never reach enrollment',async t=>{
  const {store}=await fixture(t);let enrollments=0;
  const setup=service(store,{enrollPassword:async()=>{enrollments++;throw new Error('must not run');}});
  for (const candidate of [{...input,setupToken:'incorrect-token-53'}, {...input,roles:['owner']}, {...input,accountId:'caller'}, {...input,displayName:'\n'},null]) {
    assert.deepEqual(await setup.setup(candidate,context),{ok:false,code:'INVALID_SETUP'});
  }
  assert.equal(enrollments,0);assert.equal(await store.hasAccounts(),false);
  assert.deepEqual(await setup.setup(input,{networkAddress:'192.0.2.2'}),{ok:false,code:'SETUP_THROTTLED'});
});

test('legacy and OIDC deployment policy cannot be overridden by submitted setup data',async t=>{
  const {store}=await fixture(t);const passwords={enrollPassword:()=>{throw new Error('must not run');}};
  assert.deepEqual(await service(store,passwords,{legacyConfigured:true}).setup({...input,legacyConfigured:false},context),{ok:false,code:'MIGRATION_REQUIRED'});
  assert.deepEqual(await service(store,passwords,{mode:'oidc'}).setup(input,context),{ok:false,code:'PASSWORD_SETUP_DISABLED'});
  assert.throws(()=>service(store,passwords,{legacyConfigured:undefined}),/configuration/);
  assert.equal(await store.hasAccounts(),false);
});

test('password policy failures leave first-owner creation available without leaking internal errors',async t=>{
  const {store}=await fixture(t);
  for (const code of ['PASSWORD_COMPROMISED','PASSWORD_INVALID','PASSWORD_SCREENING_UNAVAILABLE','PASSWORD_BUSY','INTERNAL_SECRET']) {
    const setup=service(store,{enrollPassword:async()=>{const e=new Error('private internal detail');e.code=code;throw e;}});
    const result=await setup.setup(input,context);
    assert.deepEqual(result,{ok:false,code:code.startsWith('PASSWORD_') && code!=='PASSWORD_BUSY'?code:'SETUP_UNAVAILABLE'});
    assert.equal(await store.hasAccounts(),false);
  }
});

test('concurrent first-owner ceremonies through two actual workers create only one identity',async t=>{
  const {store,path}=await fixture(t),other=await openAccountStoreWorker(path);t.after(()=>other.close());
  const passwords=await createPasswordService(),credential=await passwords.hashPassword(password);
  let entered=0,release;
  const barrier=new Promise(resolve=>{release=resolve;});
  const enrollment={enrollPassword:async()=>{if (++entered===2) release();await barrier;return credential;}};
  const results=await Promise.all([service(store,enrollment).setup({...input,username:'first'},context),service(other,enrollment).setup({...input,username:'second'},context)]);
  assert.equal(results.filter(result=>result.ok).length,1);
  const accounts=await Promise.all([store.findByUsername('first'),other.findByUsername('second')]);
  assert.equal(accounts.filter(Boolean).length,1);
  assert.deepEqual(accounts.find(Boolean).roles,['owner','listener']);
});
