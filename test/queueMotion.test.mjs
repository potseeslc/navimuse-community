import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
test('queue reorder animates stable rows, removal closes space, undo reveals, and reduced motion cancels',async()=>{
 const w=new Window();Object.assign(globalThis,{window:w,document:w.document,HTMLElement:w.HTMLElement,getComputedStyle:w.getComputedStyle.bind(w)});
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');const {useQueueMotion}=await import('../src/useQueueMotion.js');
 const calls=[];w.HTMLElement.prototype.animate=function(frames){const result={cancelled:false,cancel(){this.cancelled=true;},finished:new Promise(()=>{})};calls.push({key:this.dataset.queueMotionKey,frames,result});return result;};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:this.tagName==='LI'?[...this.parentElement.children].indexOf(this)*60:0};};
 function Scene({ids}){const ref=React.useRef(null);useQueueMotion(ref,ids.join('|'));return React.createElement('ol',{ref},ids.map(id=>React.createElement('li',{key:id,'data-queue-motion-key':id},id)));}
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);const render=ids=>flushSync(()=>root.render(React.createElement(Scene,{ids})));
 try {
  render(['a','b','c']);const b=node.querySelector('[data-queue-motion-key="b"]');calls.length=0;
  render(['a','c','b']);assert.equal(node.querySelector('[data-queue-motion-key="b"]'),b);assert.ok(calls.some(c=>c.key==='b'&&c.frames[0].transform==='translateY(-60px)'));
  calls.length=0;render(['a','b']);assert.ok(calls.some(c=>c.key==='b'&&c.frames[0].transform==='translateY(60px)'));
  calls.length=0;render(['a','c','b']);assert.ok(calls.some(c=>c.key==='c'&&c.frames[0].opacity===0));
  const running=calls.map(c=>c.result);w.matchMedia=()=>({matches:true});calls.length=0;render(['b','a','c']);assert.equal(calls.length,0);assert.ok(running.every(a=>a.cancelled));
 } finally {flushSync(()=>root.unmount());await w.happyDOM.close();}
});
