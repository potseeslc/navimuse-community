import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('access editor reviews before saving, blocks duplicates and requires refreshed state after uncertain writes',async()=>{
 const window=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?window:window[key];Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom'),{OwnerAccessEditor}=await vite.ssrLoadModule('/src/OwnerAccessEditor.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected UI state missing');};
 const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text),click=el=>flushSync(()=>el.click());
 let reads=0,writes=0,release,deny=false,saved,closed=0;
 const account={id:'10000000-0000-4000-8000-000000000001',username:'listener',displayName:'Listener'};
 const client={read:async()=>{reads++;return {accountId:account.id,owner:false,disabled:false,revision:reads};},save:async(id,change)=>{writes++;assert.equal(id,account.id);assert.deepEqual(change,{expectedGeneration:reads,owner:false,disabled:true});await new Promise(r=>release=r);if(deny)throw new Error('Private upstream text');return {accountId:id,owner:false,disabled:true,revision:reads+1};}};
 try{
  flushSync(()=>root.render(React.createElement(OwnerAccessEditor,{account,client,onClose:()=>closed++,onSaved:v=>saved=v})));
  await wait(()=>button('Review change'));assert(button('Review change').disabled);click(node.querySelector('input[type="checkbox"]'));click(button('Review change'));
  assert.equal(writes,0);assert.match(node.textContent,/Enabled → Disabled/);assert.equal(document.activeElement,node.querySelector('h3'));
  click(button('Save account access'));await wait(()=>writes===1);assert(button('Back to accounts').disabled);assert.equal(button('Save account access'),undefined);
  deny=true;release();await wait(()=>button('Refresh account access'));assert(!node.textContent.includes('Private upstream text'));assert.equal(button('Review change'),undefined);
  click(button('Refresh account access'));await wait(()=>reads===2&&button('Review change'));click(node.querySelector('input[type="checkbox"]'));click(button('Review change'));click(button('Save account access'));await wait(()=>writes===2);deny=false;release();await wait(()=>button('Done'));
  assert.deepEqual(saved,{id:account.id,roles:['listener'],disabled:true});click(button('Done'));assert.equal(closed,1);
 }finally{flushSync(()=>root.unmount());await vite.close();window.happyDOM.abort();}
});

test('successful self-demotion requires reauthentication and cannot close back into owner controls',async()=>{
 const window=new Window({url:'http://localhost/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?window:window[key];
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom'),{OwnerAccessEditor}=await vite.ssrLoadModule('/src/OwnerAccessEditor.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected self-change UI state missing');};
 const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text),click=el=>flushSync(()=>el.click());
 let closed=0,reauthenticated=0,writes=0,release,saved;
 const account={id:'10000000-0000-4000-8000-000000000002',username:'owner',displayName:'Owner'};
 const client={read:async()=>({accountId:account.id,owner:true,disabled:false,revision:3}),save:async(id,change)=>{
  writes++;assert.equal(id,account.id);assert.deepEqual(change,{expectedGeneration:3,owner:false,disabled:false});
  await new Promise(resolve=>release=resolve);
  return {accountId:id,owner:false,disabled:false,revision:4};
 }};
 const escape=()=>flushSync(()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 try{
  flushSync(()=>root.render(React.createElement(OwnerAccessEditor,{account,self:true,client,onClose:()=>closed++,onSaved:value=>saved=value,onReauthenticate:()=>reauthenticated++})));
  await wait(()=>button('Review change'));
  const select=node.querySelector('select');flushSync(()=>{select.value='listener';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  click(button('Review change'));assert.match(node.textContent,/This includes your current session/);
  escape();assert(button('Review change'));assert.equal(node.querySelector('select').value,'listener');assert.equal(closed,0);
  click(button('Review change'));click(button('Save account access'));await wait(()=>release);escape();assert.equal(closed,0);assert(button('Back to accounts').disabled);
  release();await wait(()=>button('Done'));assert.equal(writes,1);assert.deepEqual(saved,{id:account.id,roles:['listener'],disabled:false});
  assert(button('Done').disabled);click(button('Done'));escape();assert.equal(closed,0);assert.equal(button('Review change'),undefined);assert.equal(document.activeElement,node.querySelector('h3'));
  click(button('Sign out to sign in again'));assert.equal(reauthenticated,1);assert.equal(writes,1);
 }finally{flushSync(()=>root.unmount());await vite.close();await window.happyDOM.close();}
});
