import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createAccountCreation} from '../server/accountCreationService.mjs';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
test('creation projects listener data and rechecks revoked owner authority after password work',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'navimuse-create-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=await openAccountStoreWorker(directory);t.after(()=>store.close());
 const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const session=await store.issuePasswordSession(owner.id,{expectedGeneration:1,expectedRevision:1});
 let revoke=false,hashes=0;
 const passwords={enrollPassword:async()=>{hashes++;if(revoke)await store.logoutSession(session.token);return credential;}};
 const service=createAccountCreation({store,passwords,mode:'local',throttleSecret:Buffer.alloc(32,3)});
 const context={sessionToken:session.token,networkAddress:'127.0.0.1'},input={username:' Listener ',displayName:' Listener ',password:'Synthetic initial passphrase'};
 const result=await service.create(input,context);assert.equal(result.ok,true);
 assert.deepEqual(Object.keys(result.account).sort(),['bindingRevision','disabled','displayName','id','musicConfigured','roles','username']);assert.deepEqual(result.account.roles,['listener']);assert.equal(result.account.username,'listener');assert.equal(result.account.musicConfigured,false);
 assert.deepEqual(await service.create(input,context),{ok:false,code:'USERNAME_UNAVAILABLE'});
 const before=hashes;assert.deepEqual(await service.create({...input,owner:true},context),{ok:false,code:'INVALID_ACCOUNT_CREATION'});assert.equal(hashes,before);
 revoke=true;assert.deepEqual(await service.create({...input,username:'revoked'},context),{ok:false,code:'RECENT_AUTH_REQUIRED'});assert.equal(await store.findByUsername('revoked'),null);
 assert.deepEqual(await service.create({...input,username:'after'},context),{ok:false,code:'SIGN_IN_REQUIRED'});
});

test('creation admission precedes password work and screening failures remain public fixed codes',async()=>{
 let allowed=false,hashes=0,writes=0,screenFailure;
 const store={authenticateSession:async()=>({account:{id:'owner',roles:['owner']}}),consumePasswordLoginAttempt:async()=>allowed,createManagedListenerForSession:async()=>{writes++;throw new Error('private write detail');}};
 const passwords={enrollPassword:async()=>{hashes++;if(screenFailure)throw screenFailure;return credential;}};
 const config={store,passwords,mode:'local',throttleSecret:Buffer.alloc(32,4)},service=createAccountCreation(config);
 const input={username:'listener',displayName:'Listener',password:'Synthetic creation passphrase'},context={sessionToken:'synthetic',networkAddress:'127.0.0.1'};
 assert.deepEqual(await service.create(input,context),{ok:false,code:'ACCOUNT_CREATION_THROTTLED'});assert.equal(hashes,0);
 allowed=true;screenFailure=Object.assign(new Error('private screening detail'),{code:'PASSWORD_COMPROMISED'});
 assert.deepEqual(await service.create(input,context),{ok:false,code:'PASSWORD_COMPROMISED'});assert.equal(writes,0);
 screenFailure=new Error('private provider detail');assert.deepEqual(await service.create(input,context),{ok:false,code:'ACCOUNT_CREATION_UNAVAILABLE'});assert.equal(writes,0);
 const before=hashes;assert.deepEqual(await createAccountCreation({...config,mode:'oidc'}).create(input,context),{ok:false,code:'ACCOUNT_CREATION_DISABLED'});assert.equal(hashes,before);
});
