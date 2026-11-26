import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_SESSION_VERSION, normalizeLocalUsername, parseAccountSession} from '../shared/accountSession.js';

const accountId='312f90fb-84f4-4d24-8355-1e8c112188bf';
const signedIn=()=>({version:ACCOUNT_SESSION_VERSION,mode:'hybrid',state:'authenticated',methods:{password:true,passkey:true,oidc:true},account:{id:accountId,username:'listener',displayName:'Music listener',roles:['listener']},session:{authenticatedAt:1000,expiresAt:901000,deviceId:null},queueScope:`queue-scope-v2:${'a'.repeat(64)}`});

test('account session supports explicit modes and credential-free signed-out states',()=>{
 for(const mode of ['local','oidc','hybrid']) for(const state of ['setup-required','migration-required','signed-out']) {
  const response={version:ACCOUNT_SESSION_VERSION,mode,state,methods:{password:mode!=='oidc',passkey:false,oidc:mode!=='local'},account:null,session:null,queueScope:null};
  assert.deepEqual(parseAccountSession(response),response);
 }
});

test('authenticated public identity uses an immutable account ID independently of provider or display name',()=>{
 const response=signedIn();const parsed=parseAccountSession(response);
 assert.deepEqual(parsed,response);
 response.account.roles.push('owner');response.account.displayName='Changed';
 assert.deepEqual(parsed.account.roles,['listener']);assert.equal(parsed.account.displayName,'Music listener');
 assert.equal(parsed.account.id,accountId);
});

test('authenticated accounts may have no usable music namespace without losing identity',()=>{
 const response=signedIn();response.queueScope=null;
 const parsed=parseAccountSession(response);assert.equal(parsed.state,'authenticated');
 assert.equal(parsed.account.id,accountId);assert.equal(parsed.queueScope,null);
 for (const value of [undefined,'',false,{},'queue-scope-v2:unbound']) {
  assert.throws(()=>parseAccountSession({...response,queueScope:value}),TypeError);
 }
});

test('public account boundary rejects credential leakage and unknown nested fields without echoing them',()=>{
 for(const [location,key] of [['root','refreshToken'],['account','passwordHash'],['account','oidcSubject'],['session','token'],['methods','privateKey']]) {
  const response=signedIn();const target=location==='root'?response:response[location];target[key]='sensitive-test-value';
  assert.throws(()=>parseAccountSession(response),error=>error.message==='Invalid account session response');
 }
});

test('invalid identity, authorization vocabulary, mode and lifecycle combinations fail closed',()=>{
 const invalids=[
  x=>x.mode='password',x=>x.version='v0',x=>x.state='ready',
  x=>{x.mode='local';},x=>{x.mode='oidc';},
  x=>x.methods.passkey='true',x=>x.account.id='listener@example.test',
  x=>x.account.username='Listener',x=>x.account.roles=['admin'],
  x=>x.account.roles=['owner','owner'],x=>x.account.roles=[],
  x=>x.account.displayName='secret\nheader',x=>x.session.expiresAt=1000,
  x=>x.session.authenticatedAt=-1,x=>x.session.expiresAt=Infinity,
  x=>x.session.deviceId='raw-cookie',x=>x.queueScope='local-admin',
  x=>x.state='signed-out',x=>x.account=null,
 ];
 for(const mutate of invalids){const response=signedIn();mutate(response);assert.throws(()=>parseAccountSession(response),TypeError);}
});

test('normalized local usernames collide deterministically and reject unsafe or ambiguous identifiers',()=>{
 assert.equal(normalizeLocalUsername('  Listener.ONE  '),'listener.one');
 assert.equal(normalizeLocalUsername('Ｌｉｓｔｅｎｅｒ'),'listener');
 for(const value of ['ab','a'.repeat(65),'a b','a/b','éclair','a\nuser',null,{},'a'.repeat(257)]) assert.throws(()=>normalizeLocalUsername(value),TypeError);
});
