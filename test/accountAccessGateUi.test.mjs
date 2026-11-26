import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('account access forms submit exact credentials, gate unbound identity and retain mounted content on uncertainty',async()=>{
 const window=new Window({url:'http://localhost/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?window:window[key];
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {AccountAccessGate}=await vite.ssrLoadModule('/src/AccountAccessGate.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const base={state:'signed-out',methods:{password:true},account:null,queueScope:null};
 let value={...base,state:'setup-required'},submitted,loginFields,readyLogin=false,failRenew=false,notify;
 const unbound={...base,state:'authenticated',account:{id:'fixture',displayName:'QA Listener'}};
 const ready={...unbound,queueScope:'queue-scope-v2:'+'a'.repeat(64)};
 const client={subscribeSessionChanges:fn=>{notify=fn;return()=>{notify=null;};},readSession:async()=>value,renew:async()=>{throw Object.assign(new Error(),{code:failRenew?'ACCOUNT_UNAVAILABLE':'SESSION_RECHECK_REQUIRED'});},
  setup:async fields=>{submitted=fields;value=base;},login:async fields=>{loginFields=fields;value=readyLogin?ready:unbound;return value;},logout:async()=>{value=base;}};
 const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('UI did not reach expected state');};
 const input=(selector,text)=>flushSync(()=>{const el=node.querySelector(selector);Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,text);el.dispatchEvent(new window.Event('input',{bubbles:true}));});
 const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text);
 const submit=()=>flushSync(()=>node.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 try {
  flushSync(()=>root.render(React.createElement(AccountAccessGate,{client},(_session,actions)=>React.createElement('section',{id:'listening'},'Mounted listening session',React.createElement('button',{onClick:actions.refresh},'Refresh session')))));
  await wait(()=>node.textContent.includes('Make NaviMuse yours'));
  input('[autocomplete="one-time-code"]','fixture-token');input('[autocomplete="name"]','QA Listener');input('[autocomplete="username"]','qa-owner');input('[type="password"]','  Exact fixture password  ');submit();
  await wait(()=>node.textContent.includes('Welcome back'));
  assert.deepEqual(submitted,{setupToken:'fixture-token',displayName:'QA Listener',username:'qa-owner',password:'  Exact fixture password  '});
  assert.equal(node.querySelector('[type="password"]').value,'');assert.equal(document.activeElement,node.querySelector('h1'));
  input('[type="password"]','  Exact fixture password  ');flushSync(()=>node.querySelector('[type="checkbox"]').click());submit();
  await wait(()=>node.textContent.includes('Your library is not connected'));
  assert.deepEqual(loginFields,{username:'qa-owner',password:'  Exact fixture password  ',remember:false});assert.equal(node.querySelector('#listening'),null);
  flushSync(()=>button('Sign out').click());await wait(()=>node.textContent.includes('Welcome back'));
  readyLogin=true;input('[type="password"]','fixture password');submit();await wait(()=>node.querySelector('#listening'));
  const mounted=node.querySelector('#listening');value=base;failRenew=true;
  flushSync(()=>button('Refresh session').click());await wait(()=>node.querySelector('[role="alert"]'));
  assert.equal(node.querySelector('#listening'),mounted);
  notify();await wait(()=>node.textContent.includes('Welcome back'));
  assert.equal(node.querySelector('#listening'),null);
  assert.equal(document.activeElement,node.querySelector('h1'));
 } finally {flushSync(()=>root.unmount());await vite.close();window.happyDOM.abort();}
});
