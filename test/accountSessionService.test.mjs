import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountSessionClient} from '../src/services/accountSessionService.js';
const signedOut={version:'navimuse-account/v1',mode:'local',state:'signed-out',methods:{password:true,passkey:false,oidc:false},account:null,session:null,queueScope:null};
const signedIn={...signedOut,state:'authenticated',account:{id:'10000000-0000-4000-8000-000000000001',username:'owner',displayName:'Owner',roles:['owner','listener']},session:{authenticatedAt:100,expiresAt:200,deviceId:null}};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function lockManager() {let tail=Promise.resolve();return {request(_name,options,run){assert.equal(options.mode,'exclusive');const p=tail.then(run);tail=p.catch(()=>{});return p;}};}
test('renewal is single-flight, unbound identity remains authenticated and logout waits for it',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const calls=[];
 const client=createAccountSessionClient({locks:lockManager(),fetchImpl:async(url,init)=>{
  calls.push([url,init]);if(url.endsWith('/session'))return response(signedOut);
  if(url.endsWith('/refresh')){await gate;return response(signedIn);}return response({ok:true});
 }});
 const a=client.renew(),b=client.renew();assert.equal(a,b);const logout=client.logout();
 await Promise.resolve();await Promise.resolve();assert.equal(calls.some(([url])=>url.endsWith('/logout')),false);
 release();assert.equal((await a).queueScope,null);await logout;
 assert.deepEqual(calls.map(([url])=>url.split('/').at(-1)),['session','refresh','logout']);
 for(const [,init] of calls) {assert.equal(init.credentials,'include');assert.equal(init.redirect,'error');assert.equal(init.headers['X-Requested-With'],'NaviMuse');assert.equal(init.body,undefined);}
});
test('two document clients sharing Web Locks recheck cookies before a second rotation',async()=>{
 const locks=lockManager();let active=false,rotations=0;
 const fetchImpl=async url=>{
  if(url.endsWith('/session'))return response(active?signedIn:signedOut);
  rotations++;await Promise.resolve();active=true;return response(signedIn);
 };
 const a=createAccountSessionClient({locks,fetchImpl}),b=createAccountSessionClient({locks,fetchImpl});
 assert.deepEqual(await Promise.all([a.renew(),b.renew()]),[signedIn,signedIn]);assert.equal(rotations,1);
});
test('rotation conflict rechecks delayed winner cookies and unresolved conflict stays retryable',async()=>{
 let reads=0;const delays=[];
 const client=createAccountSessionClient({locks:lockManager(),wait:async n=>delays.push(n),fetchImpl:async url=>url.endsWith('/refresh')?
  response({code:'REFRESH_NOT_CURRENT'},409):response(++reads===3?signedIn:signedOut)});
 assert.deepEqual(await client.renew(),signedIn);assert.deepEqual(delays,[100]);
 const unresolved=createAccountSessionClient({locks:lockManager(),wait:async()=>{},fetchImpl:async url=>url.endsWith('/refresh')?response({code:'REFRESH_NOT_CURRENT'},409):response(signedOut)});
 await assert.rejects(unresolved.renew(),error=>error.code==='SESSION_RECHECK_REQUIRED');
});
test('transport or malformed responses never synthesize signed-out state and failures release the queue',async()=>{
 let attempt=0;
 const client=createAccountSessionClient({locks:lockManager(),fetchImpl:async()=>{attempt++;if(attempt===1)throw new Error('private server URL');if(attempt===2)return response({...signedIn,password:'private'});return response(signedIn);}});
 await assert.rejects(client.renew(),error=>error.code==='ACCOUNT_UNAVAILABLE'&&!error.message.includes('private'));
 await assert.rejects(client.readSession(),error=>error.code==='INVALID_ACCOUNT_RESPONSE');
 assert.deepEqual(await client.readSession(),signedIn);
});
test('explicit login preserves the password and setup/migration states do not attempt refresh',async()=>{
 let submitted;
 const client=createAccountSessionClient({locks:lockManager(),fetchImpl:async(_url,init)=>{submitted=JSON.parse(init.body);return response(signedIn);}});
 await client.login({username:'owner',password:'  Exact Password  ',remember:true});
 assert.deepEqual(submitted,{username:'owner',password:'  Exact Password  ',remember:true});
 for(const state of ['setup-required','migration-required']) {
  let calls=0;const c=createAccountSessionClient({locks:lockManager(),fetchImpl:async()=>{calls++;return response({...signedOut,state});}});
  assert.equal((await c.renew()).state,state);assert.equal(calls,1);
 }
});

test('a timed-out request releases local serialization without returning a logout state',async()=>{
 let calls=0;
 const client=createAccountSessionClient({locks:lockManager(),timeoutMs:10,fetchImpl:async(_url,init)=>{
  if(++calls>1)return response(signedIn);
  return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
 }});
 await assert.rejects(client.renew(),error=>error.code==='ACCOUNT_UNAVAILABLE');
 assert.deepEqual(await client.readSession(),signedIn);
});

test('missing cross-document locks rejects mutations before dispatch while allowing session reconciliation',async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push([url,init.method]);return response(signedOut);};
 const a=createAccountSessionClient({locks:null,fetchImpl}),b=createAccountSessionClient({locks:null,fetchImpl});
 assert.equal((await a.readSession()).state,'signed-out');
 for(const action of [()=>a.login({username:'owner',password:'fixture'}),()=>b.renew(),()=>a.logout(),()=>b.setup({setupToken:'fixture',username:'owner',displayName:'Owner',password:'fixture'})]) {
  await assert.rejects(action(),error=>error.code==='ACCOUNT_COORDINATION_UNAVAILABLE');
 }
 assert.deepEqual(calls.map(([,method])=>method),['GET']);
});

test('a second document login waits for a pending renewal before replacing shared identity',async()=>{
 const locks=lockManager(),calls=[];let current=signedOut,release,entered;
 const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const second={...signedIn,account:{...signedIn.account,id:'20000000-0000-4000-8000-000000000002',username:'listener'}};
 const fetchImpl=async url=>{
  const path=url.split('/').at(-1);calls.push(path);
  if(path==='session')return response(current);
  if(path==='refresh'){entered();await gate;current=signedIn;return response(current);}
  current=second;return response(current);
 };
 const a=createAccountSessionClient({locks,fetchImpl}),b=createAccountSessionClient({locks,fetchImpl});
 const renewal=a.renew();await started;
 const login=b.login({username:'listener',password:'fixture password'});
 await Promise.resolve();assert.deepEqual(calls,['session','refresh']);
 release();assert.deepEqual(await renewal,signedIn);assert.deepEqual(await login,second);
 assert.deepEqual(await a.readSession(),second);assert.deepEqual(await b.readSession(),second);
 assert.deepEqual(calls,['session','refresh','login','session','session']);
});
