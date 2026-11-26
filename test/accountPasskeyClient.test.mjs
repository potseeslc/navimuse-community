import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountSessionClient} from '../src/services/accountSessionService.js';
const uuid='10000000-0000-4000-8000-000000000001';
const authenticated={version:'navimuse-account/v1',mode:'local',state:'authenticated',methods:{password:true,passkey:true,oidc:false},account:{id:uuid,username:'owner',displayName:'Owner',roles:['owner','listener']},session:{authenticatedAt:1,expiresAt:2,deviceId:null},queueScope:null};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
function locks(){let tail=Promise.resolve();return {request(_key,_options,run){const next=tail.then(run);tail=next.catch(()=>{});return next;}};}
function fixture({adapter={},handler}={}) {
 const calls=[],stages=[];
 const passkeyAdapter={available:()=>true,authenticate:async()=>({id:'signed'}),register:async()=>({id:'registered'}),cancel:()=>{},...adapter};
 const client=createAccountSessionClient({baseUrl:'https://music.example/api/auth/v1',locks:locks(),passkeyAdapter,fetchImpl:async(url,init)=>{
  const path=new URL(url).pathname.replace('/api/auth/v1',''),body=init.body?JSON.parse(init.body):undefined;calls.push({path,body,credentials:init.credentials});
  const custom=await handler?.(path,body);if(custom)return custom;
  if(path.endsWith('/options'))return response({ceremonyId:uuid,options:{challenge:'fixture'}});
  if(path==='/session'||path==='/passkeys/login/verify')return response(authenticated);
  if(path==='/passkeys/register/verify')return response({credential:{id:'registered',label:body.label,createdAt:1}});
  return response({ok:true});
 }});return {client,calls,stages,onStage:value=>stages.push(value)};
}
test('passkey login uses the browser adapter and preserves cookie coordination and remember preference',async()=>{
 const f=fixture();assert.deepEqual(await f.client.loginPasskey({remember:true,onStage:f.onStage}),authenticated);
 assert.deepEqual(f.calls.map(x=>x.path),['/passkeys/login/options','/passkeys/login/verify']);
 assert.deepEqual(f.calls[1].body,{ceremonyId:uuid,response:{id:'signed'},remember:true});assert.ok(f.calls.every(x=>x.credentials==='include'));
 assert.deepEqual(f.stages,['preparing','authenticator','verifying','idle']);
});
test('cancelling the authenticator consumes the server challenge without sending verification',async()=>{
 let rejectPrompt,started;const ready=new Promise(resolve=>started=resolve);
 const f=fixture({adapter:{authenticate:()=>new Promise((_resolve,reject)=>{rejectPrompt=reject;started();}),cancel:()=>rejectPrompt(Object.assign(new Error(),{name:'AbortError'}))}});
 const operation=f.client.loginPasskey();await ready;f.client.cancelPasskey();await assert.rejects(operation,error=>error.code==='PASSKEY_CANCELLED');
 assert.deepEqual(f.calls.map(x=>x.path),['/passkeys/login/options','/passkeys/cancel']);
});
test('verification finishes under the shared lock before a queued logout; late cancellation cannot undo cookies',async()=>{
 let release,started;const ready=new Promise(resolve=>started=resolve),pending=new Promise(resolve=>release=resolve);
 const f=fixture({handler:async path=>{if(path==='/passkeys/login/verify'){started();await pending;return response(authenticated);}}});
 const operation=f.client.loginPasskey();await ready;const logout=f.client.logout();f.client.cancelPasskey();
 assert.equal(f.calls.some(x=>x.path==='/logout'),false);release();assert.equal((await operation).state,'authenticated');await logout;
 assert.deepEqual(f.calls.map(x=>x.path),['/passkeys/login/options','/passkeys/login/verify','/logout']);
});
test('unavailable authenticators and changed enrollment identity do not start a ceremony',async()=>{
 const unavailable=fixture({adapter:{available:()=>false}});await assert.rejects(unavailable.client.loginPasskey(),error=>error.code==='PASSKEY_UNAVAILABLE');assert.equal(unavailable.calls.length,0);
 const f=fixture();await assert.rejects(f.client.registerPasskey({accountId:'other',label:'Key'}),error=>error.code==='SIGN_IN_REQUIRED');assert.deepEqual(f.calls.map(x=>x.path),['/session']);
});
test('registration checks the account and sends a label; failed verification consumes the challenge',async()=>{
 const f=fixture();const result=await f.client.registerPasskey({accountId:uuid,label:'MacBook'});assert.equal(result.credential.label,'MacBook');
 assert.deepEqual(f.calls.map(x=>x.path),['/session','/passkeys/register/options','/passkeys/register/verify']);
 const denied=fixture({handler:async path=>path.endsWith('/verify')?response({ok:false,code:'PASSKEY_FAILED'},401):null});
 await assert.rejects(denied.client.loginPasskey(),error=>error.code==='PASSKEY_FAILED');assert.equal(denied.calls.at(-1).path,'/passkeys/cancel');
});

test('queued Settings reads and changes reject an account switch before reaching credential endpoints',async()=>{
 const f=fixture();await assert.rejects(f.client.listPasskeys('other'),error=>error.code==='SIGN_IN_REQUIRED');
 await assert.rejects(f.client.changePasskey({id:'key',expectedRevision:1,remove:true},'other'),error=>error.code==='SIGN_IN_REQUIRED');
 assert.deepEqual(f.calls.map(x=>x.path),['/session','/session']);
});

test('cancelling a queued client cannot abort another client authenticator under the shared lock',async()=>{
 const sharedLocks=locks();let openPrompt,releasePrompt,aborts=0;
 const ready=new Promise(resolve=>openPrompt=resolve),prompt=new Promise(resolve=>releasePrompt=resolve),calls=[];
 const adapter={available:()=>true,authenticate:async()=>{openPrompt();return prompt;},cancel:()=>{aborts++;}};
 const fetchImpl=async(url,init)=>{calls.push(url);return response(url.endsWith('/options')?{ceremonyId:uuid,options:{challenge:'fixture'}}:authenticated);};
 const options={baseUrl:'https://music.example/api/auth/v1',locks:sharedLocks,passkeyAdapter:adapter,fetchImpl};
 const one=createAccountSessionClient(options),two=createAccountSessionClient(options);
 const first=one.loginPasskey();await ready;const second=two.loginPasskey();two.cancelPasskey();
 assert.equal(aborts,0);releasePrompt({id:'first'});assert.equal((await first).state,'authenticated');
 await assert.rejects(second,error=>error.code==='PASSKEY_CANCELLED');
 assert.equal(calls.length,2);assert.equal(aborts,0);
});

test('username-first login sends only username at options and keeps it out of verification',async()=>{
 const f=fixture();await f.client.loginPasskey({username:'owner',remember:false});
 assert.deepEqual(f.calls[0].body,{username:'owner'});assert.deepEqual(f.calls[1].body,{ceremonyId:uuid,response:{id:'signed'},remember:false});
});
test('username-first policy is projected strictly and invalid responses fail closed',async()=>{
 const f=fixture({handler:path=>path==='/passkeys/policy'?response({usernameFirst:true}):null});assert.deepEqual(await f.client.readPasskeyPolicy(),{usernameFirst:true});
 const broken=fixture({handler:()=>response({usernameFirst:true,private:'not public'})});await assert.rejects(broken.client.readPasskeyPolicy(),{code:'INVALID_ACCOUNT_RESPONSE'});
});
