import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('music session is selected before Web Audio construction and interrupted playback can resume',async()=>{
 const oldWindow=globalThis.window,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let type='auto',context,resumes=0;const events=[];
 const session={get type(){return type;},set type(value){events.push(value);type=value;}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{audioSession:session}});
 globalThis.window={AudioContext:class{
  constructor(){events.push('context');context=this;this.state='suspended';this.destination={};}
  createGain(){return {gain:{value:1},connect(target){return target;}};}
  createMediaElementSource(){return {connect(target){return target;}};}
  async resume(){resumes++;this.state='running';}
 }};
 try{
  const {useAudioEngine}=await import('../src/useAudioEngine.js?audio-session-playback');
  let api;function Harness(){api=useAudioEngine();return null;}
  renderToStaticMarkup(React.createElement(Harness));api.bindAudioDeck(0,{});
  assert.deepEqual(events,['playback','context']);
  await api.wakeAudioContext();assert.equal(resumes,1);
  context.state='interrupted';type='auto';await api.wakeAudioContext();
  assert.equal(type,'playback');assert.equal(resumes,2);
  await api.wakeAudioContext();assert.equal(resumes,2,'running audio is left alone');
  context.state='closed';await api.wakeAudioContext();assert.equal(resumes,2);
  context.state='interrupted';context.resume=async()=>{throw new Error('not allowed');};
  await assert.doesNotReject(api.wakeAudioContext());
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get audioSession(){throw new Error('unsupported');}}});
  await assert.doesNotReject(api.wakeAudioContext());
 }finally{
  globalThis.window=oldWindow;
  if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
 }
});
