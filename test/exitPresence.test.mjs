import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

test('exit completion retains content, reopening cancels stale removal, reduced motion removes immediately', async()=>{
 const browser=new Window();
 globalThis.window=browser;globalThis.document=browser.document;globalThis.HTMLElement=browser.HTMLElement;
 globalThis.getComputedStyle=browser.getComputedStyle.bind(browser);
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const {useExitPresence}=await import('../src/useExitPresence.js');
 const animations=[];let exited=0;
 browser.HTMLElement.prototype.animate=function(){let resolve;const finished=new Promise(r=>resolve=r);const animation={finished,resolve,cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
 function Scene({open}){const ref=React.useRef(null);const present=useExitPresence(open,ref,()=>exited++);return present?React.createElement('div',{ref},'panel'):null;}
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 const render=open=>flushSync(()=>root.render(React.createElement(Scene,{open})));
 try {
  render(true);render(false);assert.equal(container.textContent,'panel');assert.equal(animations.length,1);
  render(true);assert.equal(animations[0].cancelled,true);
  animations[0].resolve();await new Promise(r=>setImmediate(r));assert.equal(container.textContent,'panel');assert.equal(exited,0);
  render(false);animations.at(-1).resolve();await new Promise(r=>setImmediate(r));flushSync(()=>{});
  assert.equal(container.textContent,'');assert.equal(exited,1);
  browser.matchMedia=()=>({matches:true});render(true);render(false);assert.equal(container.textContent,'');assert.equal(exited,2);
 } finally {flushSync(()=>root.unmount());await browser.happyDOM.close();}
});
