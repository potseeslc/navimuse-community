import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openAccountStore} from '../server/accountStore.mjs';
import {createAccountPasskeys} from '../server/accountPasskeys.mjs';
import {accountCredentialFixture as password} from '../test-support/accountCredentialFixture.mjs';
import {passkeyAuthenticatorFixture} from '../test-support/passkeyAuthenticatorFixture.mjs';
const networkAddress='192.0.2.10',config={canonicalOrigin:'https://music.example.test',rpID:'music.example.test',throttleSecret:Buffer.alloc(32,7)};
async function setup(t) {
 const root=await mkdtemp(join(tmpdir(),'navimuse-passkey-service-'));t.after(()=>rm(root,{recursive:true,force:true}));let clock=Date.now();
 const store=await openAccountStore(root,{now:()=>clock});t.after(()=>store.close());const owner=store.createFirstOwner({username:'owner',displayName:'Owner'},password),session=store.issuePasswordSession(owner.id,{expectedGeneration:1,expectedRevision:1});
 return {store,owner,session,service:createAccountPasskeys({store,...config,usernameFirstEnabled:true}),advance:ms=>clock+=ms};
}
async function enroll(service,sessionToken) {
 const start=await service.registrationOptions({sessionToken,networkAddress});assert.equal(start.ok,true);
 const authenticator=passkeyAuthenticatorFixture(start.public.options.user.id),response=authenticator.registration(start.public.options.challenge);
 const result=await service.verifyRegistration({ceremonyId:start.public.ceremonyId,response,label:'Test authenticator'},{bindingToken:start.bindingToken,sessionToken,networkAddress});assert.equal(result.ok,true);
 return authenticator;
}
test('real registration and signed discoverable login issue the existing account/session after consuming challenges',async t=>{
 const {store,owner,session,service}=await setup(t),auth=await enroll(service,session.token),start=await service.authenticationOptions({networkAddress});
 assert.equal(start.ok,true);assert.ok(!start.public.options.allowCredentials?.length);assert.equal(JSON.stringify(start.public).includes(start.bindingToken),false);assert.equal(JSON.stringify(start.public).includes(owner.id),false);
 const request={ceremonyId:start.public.ceremonyId,response:auth.authentication(start.public.options.challenge),remember:true},context={bindingToken:start.bindingToken,networkAddress};
 const result=await service.verifyAuthentication(request,context);assert.equal(result.ok,true);assert.equal(result.issued.account.id,owner.id);assert.ok(store.authenticateSession(result.issued.token));assert.ok(store.refreshDevice(result.issued.deviceToken));
 assert.deepEqual(await service.verifyAuthentication(request,context),{ok:false,code:'PASSKEY_FAILED'});
});
test('wrong browser cannot consume another attempt; invalid signature consumes the correctly bound challenge',async t=>{
 const {session,service}=await setup(t),auth=await enroll(service,session.token),start=await service.authenticationOptions({networkAddress});
 const request={ceremonyId:start.public.ceremonyId,response:auth.authentication(start.public.options.challenge)};
 assert.equal((await service.verifyAuthentication(request,{bindingToken:'p1.'+randomBytes(32).toString('base64url'),networkAddress})).ok,false);
 assert.equal((await service.verifyAuthentication({...request,response:auth.authentication(start.public.options.challenge,{corrupt:true})},{bindingToken:start.bindingToken,networkAddress})).ok,false);
 assert.equal((await service.verifyAuthentication(request,{bindingToken:start.bindingToken,networkAddress})).ok,false);
});
test('cancelled, expired, missing-UV and unknown-credential attempts produce the same generic denial',async t=>{
 const {session,service,advance}=await setup(t),auth=await enroll(service,session.token);
 for(const kind of ['cancel','expired','uv','unknown']) {
  advance(900001);const start=await service.authenticationOptions({networkAddress});assert.equal(start.ok,true);
  if(kind==='cancel')await service.cancel({ceremonyId:start.public.ceremonyId,purpose:'login'},{bindingToken:start.bindingToken});
  if(kind==='expired')advance(300000);
  const response=auth.authentication(start.public.options.challenge,kind==='uv'?{flags:1}:{});if(kind==='unknown'){response.id=randomBytes(32).toString('base64url');response.rawId=response.id;}
  assert.deepEqual(await service.verifyAuthentication({ceremonyId:start.public.ceremonyId,response},{bindingToken:start.bindingToken,networkAddress}),{ok:false,code:'PASSKEY_FAILED'});
 }
});
test('a generation change after credential capture prevents a cryptographically valid login',async t=>{
 const {store,owner,session,service}=await setup(t),auth=await enroll(service,session.token),start=await service.authenticationOptions({networkAddress});
 const wrapped={...store,getPasskeyCredential(id){const saved=store.getPasskeyCredential(id);store.replaceOwnPassword(owner.id,{expectedGeneration:1,expectedRevision:1,credential:password});return saved;}};
 const raced=createAccountPasskeys({store:wrapped,...config});
 assert.equal((await raced.verifyAuthentication({ceremonyId:start.public.ceremonyId,response:auth.authentication(start.public.options.challenge)},{bindingToken:start.bindingToken,networkAddress})).ok,false);
});
test('completion deadline is rechecked inside issuance transaction after asynchronous verification work',async t=>{
 const {store,session,service,advance}=await setup(t),auth=await enroll(service,session.token),start=await service.authenticationOptions({networkAddress});
 const wrapped={...store,issuePasskeySession(...args){advance(300000);return store.issuePasskeySession(...args);}};
 assert.equal((await createAccountPasskeys({store:wrapped,...config,usernameFirstEnabled:true}).verifyAuthentication({ceremonyId:start.public.ceremonyId,response:auth.authentication(start.public.options.challenge)},{bindingToken:start.bindingToken,networkAddress})).ok,false);
 assert.equal(store.getPasskeyCredential(auth.id).revision,1);
});
test('options require verified network identity and durable admission',async t=>{
 const {service}=await setup(t);assert.equal((await service.authenticationOptions()).ok,false);
 const token='p1.'+randomBytes(32).toString('base64url');
 for(let i=0;i<4;i++){const start=await service.authenticationOptions({bindingToken:token,networkAddress});assert.equal(start.ok,true);await service.cancel({ceremonyId:start.public.ceremonyId,purpose:'login'},{bindingToken:token});}
 const fifth=await service.authenticationOptions({bindingToken:token,networkAddress});assert.equal(fifth.ok,true);await service.cancel({ceremonyId:fifth.public.ceremonyId,purpose:'login'},{bindingToken:token});
 assert.equal((await service.authenticationOptions({bindingToken:token,networkAddress})).ok,false);
});

test('enrollment rechecks the consumed challenge deadline before persisting a credential',async t=>{
 const {store,session,service,advance}=await setup(t),start=await service.registrationOptions({sessionToken:session.token,networkAddress});
 assert.equal(start.ok,true);
 const auth=passkeyAuthenticatorFixture(start.public.options.user.id);
 const wrapped={...store,registerPasskey(...args){advance(300000);return store.registerPasskey(...args);}};
 const result=await createAccountPasskeys({store:wrapped,...config}).verifyRegistration({ceremonyId:start.public.ceremonyId,response:auth.registration(start.public.options.challenge)},{bindingToken:start.bindingToken,sessionToken:session.token,networkAddress});
 assert.deepEqual(result,{ok:false,code:'PASSKEY_FAILED'});
 assert.equal(store.getPasskeyCredential(auth.id),null);
});

function usernameAttempt(store,username){
 const input={purpose:'login',challenge:randomBytes(32).toString('base64url'),origin:config.canonicalOrigin,rpID:config.rpID,bindingToken:'p1.'+randomBytes(32).toString('base64url'),username};
 const created=store.createPasskeyCeremony(input);return {input,created,context:{bindingToken:input.bindingToken,networkAddress}};
}
test('durable username-first proof accepts a signed assertion without a user handle and remains single use',async t=>{
 const {store,owner,session,service}=await setup(t),auth=await enroll(service,session.token),attempt=usernameAttempt(store,'  ＯＷＮＥＲ  ');
 assert.deepEqual(attempt.created.credentials.map(c=>c.id),[auth.id]);
 const request={ceremonyId:attempt.created.id,response:auth.authentication(attempt.input.challenge,{handle:null})};
 const result=await service.verifyAuthentication(request,attempt.context);assert.equal(result.ok,true);assert.equal(result.issued.account.id,owner.id);
 assert.deepEqual(await service.verifyAuthentication(request,attempt.context),{ok:false,code:'PASSKEY_FAILED'});
});
test('username-first proof refuses another account key, unknown targets and keys added after options',async t=>{
 const {store,owner,session,service}=await setup(t),auth=await enroll(service,session.token);
 store.createListener(owner.id,{username:'other',displayName:'Other'},password);
 for(const username of ['other','missing']){
  const attempt=usernameAttempt(store,username);
  assert.deepEqual(await service.verifyAuthentication({ceremonyId:attempt.created.id,response:auth.authentication(attempt.input.challenge,{handle:null})},attempt.context),{ok:false,code:'PASSKEY_FAILED'});
 }
 const before=usernameAttempt(store,'owner'),later=await enroll(service,session.token);
 assert.deepEqual(await service.verifyAuthentication({ceremonyId:before.created.id,response:later.authentication(before.input.challenge,{handle:null})},before.context),{ok:false,code:'PASSKEY_FAILED'});
});
test('username-first proof rejects changes before consumption and after credential lookup',async t=>{
 const {store,owner,session,service}=await setup(t),auth=await enroll(service,session.token);
 let attempt=usernameAttempt(store,'owner');store.replaceOwnPassword(owner.id,{expectedGeneration:1,expectedRevision:1,credential:password});
 assert.deepEqual(await service.verifyAuthentication({ceremonyId:attempt.created.id,response:auth.authentication(attempt.input.challenge,{handle:null})},attempt.context),{ok:false,code:'PASSKEY_FAILED'});
 attempt=usernameAttempt(store,'owner');
 const wrapped={...store,getPasskeyCredential(id){const saved=store.getPasskeyCredential(id);store.replaceOwnPassword(owner.id,{expectedGeneration:2,expectedRevision:2,credential:password});return saved;}};
 assert.deepEqual(await createAccountPasskeys({store:wrapped,...config,usernameFirstEnabled:true}).verifyAuthentication({ceremonyId:attempt.created.id,response:auth.authentication(attempt.input.challenge,{handle:null})},attempt.context),{ok:false,code:'PASSKEY_FAILED'});
});

test('username-first admission survives rotating browser bindings and stops before another inventory read',async t=>{
 const {store}=await setup(t);let creates=0;
 const service=createAccountPasskeys({store:{...store,createPasskeyCeremony(...args){creates++;return store.createPasskeyCeremony(...args);}},...config,usernameFirstEnabled:true});
 for(let i=0;i<5;i++)assert.equal((await service.authenticationOptions({username:'unknown',networkAddress})).ok,true);
 assert.deepEqual(await service.authenticationOptions({username:'unknown',networkAddress}),{ok:false,code:'PASSKEY_FAILED'});assert.equal(creates,5);
});
