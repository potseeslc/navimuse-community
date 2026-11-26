import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountAccessController} from '../src/services/accountAccessController.js';
const signedOut={state:'signed-out',queueScope:null},setup={state:'setup-required',queueScope:null},unbound={state:'authenticated',account:{id:'owner'},queueScope:null};
const ready={...unbound,queueScope:'queue-scope-v2:'+'a'.repeat(64)};
const failure=code=>Object.assign(new Error('private service detail'),{code});
test('access restores remembered identity, retains it on uncertain renewal, and reconciles explicit logout',async()=>{
 let value=signedOut,unavailable=false;
 const client={readSession:async()=>value,renew:async()=>{if(unavailable)throw failure('SESSION_RECHECK_REQUIRED');return ready;},logout:async()=>{value=signedOut;}};
 const c=createAccountAccessController(client);assert.equal(await c.check(),true);assert.equal(c.getSnapshot().session,ready);
 unavailable=true;assert.equal(await c.check(),false);assert.equal(c.getSnapshot().session,ready);assert.equal(c.getSnapshot().errorCode,'SESSION_RECHECK_REQUIRED');
 assert.equal(await c.logout(),true);assert.equal(c.getSnapshot().session,signedOut);
 const fresh=createAccountAccessController(client);assert.equal(await fresh.check(),true);assert.equal(fresh.getSnapshot().session,signedOut);
});
test('setup transitions to sign-in and unbound login retains authenticated identity',async()=>{
 let value=setup,submitted;
 const c=createAccountAccessController({readSession:async()=>value,setup:async fields=>{submitted=fields;value=signedOut;},login:async()=>unbound});
 await c.check();assert.equal(c.getSnapshot().session,setup);
 const fields={username:'owner',displayName:'Owner',password:' Exact fixture password ',setupToken:'fixture'};
 assert.equal(await c.setup(fields),true);assert.equal(submitted,fields);assert.equal(c.getSnapshot().session,signedOut);
 await c.login({});assert.equal(c.getSnapshot().session,unbound);
});
test('stale reads and disposed work cannot replace newer account state; restart supports effect replay',async()=>{
 let release;
 const waiting=new Promise(resolve=>{release=resolve;});
 const c=createAccountAccessController({readSession:()=>waiting,login:async()=>ready});
 const old=c.check();assert.equal(c.check(),old);await c.login({});release(setup);await old;
 assert.equal(c.getSnapshot().session,ready);
 let loginRelease;const d=createAccountAccessController({login:()=>new Promise(resolve=>{loginRelease=resolve;}),readSession:async()=>setup});
 const login=d.login({});d.dispose();loginRelease(ready);assert.equal(await login,false);assert.equal(d.getSnapshot().session,null);
 d.activate();await d.check();assert.equal(d.getSnapshot().session,setup);
});

test('native offline access follows authoritative account state and locks before explicit server logout',async()=>{
 const calls=[];globalThis.window={__nmAudioTransport:{version:1,offlineDownloads:true,request:async message=>{calls.push(message);return true;}}};
 try{
  let value=ready;
  const c=createAccountAccessController({readSession:async()=>value,logout:async()=>{calls.push({action:'server.logout'});value=signedOut;}});
  await c.check();assert.deepEqual(calls[0],{action:'offline.account',scope:ready.queueScope});
  await c.logout();assert.deepEqual(calls.slice(1).map(x=>x.action),['offline.forget','server.logout','offline.account']);assert.equal(calls.at(-1).scope,null);
 }finally{delete globalThis.window;}
});
