import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const window=new Window();
global.window=window;global.document=window.document;global.HTMLElement=window.HTMLElement;
const React=await import('react');
const {createRoot}=await import('react-dom/client');
const {flushSync}=await import('react-dom');
const {useWiiMPlayback}=await import('../src/useWiiMPlayback.js');

test('track changes clear only the source validation message through the real hook',async()=>{
 let hook;const root=createRoot(document.createElement('div'));
 function Probe({source}){
  hook=useWiiMPlayback({scope:'notice-test',authenticated:false,pauseLocal:()=>assert.fail('Validation must not pause'),playbackSource:source});
  return React.createElement('span',null,hook.state.error);
 }
 const render=source=>flushSync(()=>root.render(React.createElement(Probe,{source})));
 try{
  render('radio:invalid:id');const controller=hook.controller;
  const radio={index:0,items:[{song:{id:'radio:invalid:id'}}]};
  await controller.transfer('speaker',radio,{},0);
  render('radio:invalid:id');assert.match(hook.state.error,/live radio station cannot be transferred/);
  render('song-for-zula');render('song-for-zula');
  assert.equal(hook.controller,controller);assert.equal(hook.state.error,'');
  assert.equal(hook.state.session,null);
 }finally{flushSync(()=>root.unmount());await window.happyDOM.abort();}
});
