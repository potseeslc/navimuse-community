import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('creation reviews without displaying password, blocks repeated writes and handles uncertainty without retry',async()=>{
 const window=new Window({url:'http://localhost/'});for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent'])globalThis[key]=key==='window'?window:window[key];Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom'),{OwnerAccountCreation}=await vite.ssrLoadModule('/src/OwnerAccountCreation.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('Expected creation UI state');};
 const button=text=>[...node.querySelectorAll('button')].find(b=>b.textContent===text),click=el=>flushSync(()=>el.click());
 let writes=0,release,uncertain=true,closed=0;
 const password='Synthetic listener password 2026!';
 const client={create:async input=>{writes++;assert.deepEqual(input,{username:'listener',displayName:'Listener',password});await new Promise(resolve=>release=resolve);if(uncertain)throw new Error('private service text');return {id:'synthetic'};}};
 function fill(){const values=[' Listener ','Listener',password,password];for(const [index,input] of [...node.querySelectorAll('input')].entries())flushSync(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,values[index]);input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));});}
 try{
  flushSync(()=>root.render(React.createElement(OwnerAccountCreation,{client,onClose:()=>closed++})));fill();flushSync(()=>node.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert(button('Create listener account'));assert.equal(writes,0);assert(!node.textContent.includes(password));assert.equal(document.activeElement,node.querySelector('h3'));
  click(button('Create listener account'));await wait(()=>writes===1);assert(button('Back to accounts').disabled);assert.equal(button('Create listener account'),undefined);release();await wait(()=>node.textContent.includes('could not be confirmed'));
  assert.equal(node.querySelector('input[type="password"]'),null);assert(!node.textContent.includes('private service text'));assert.equal(button('Create listener account'),undefined);assert.equal(writes,1);click(button('Back to accounts'));assert.equal(closed,1);
  flushSync(()=>root.render(React.createElement(OwnerAccountCreation,{key:'fresh',client,onClose:()=>closed++})));fill();flushSync(()=>node.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));uncertain=false;click(button('Create listener account'));await wait(()=>writes===2);release();await wait(()=>button('Done'));assert.match(node.textContent,/can now sign in/);assert.equal(node.querySelector('input'),null);
 }finally{flushSync(()=>root.unmount());await vite.close();await window.happyDOM.close();}
});
