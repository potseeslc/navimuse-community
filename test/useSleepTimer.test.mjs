import {Window} from 'happy-dom';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import {createRoot} from 'react-dom/client';
import {useSleepTimer} from '../src/useSleepTimer.js';

test('timer hook uses one local authority, cancels on output change, and routes remote timers to server',async()=>{
 const w=new Window();globalThis.window=w;globalThis.document=w.document;
 const container=document.createElement('div');const root=createRoot(container);let timer,pauses=0,clock=1000;
 const realNow=Date.now;Date.now=()=>clock;const commands=[];
 const props={wiim:{blocksLocal:false,state:{busy:false},command:async(action,extra)=>{commands.push({action,...extra});return true;}},pauseLocal:()=>pauses++,notify:()=>{}};
 function Harness(p){timer=useSleepTimer(p);return null;}
 try{
  act(()=>root.render(React.createElement(Harness,props)));
  await act(async()=>{await timer.set(15);});assert.equal(timer.deadline,901000);
  clock=901000;act(()=>w.dispatchEvent(new w.Event('focus')));assert.equal(pauses,1);assert.equal(timer.deadline,0);
  act(()=>w.dispatchEvent(new w.Event('focus')));assert.equal(pauses,1);
  await act(async()=>{await timer.set(30);});
  act(()=>root.render(React.createElement(Harness,{...props,remoteSession:{id:'remote',sleepTimerDeadline:2000000}})));
  assert.equal(timer.deadline,2000000);await act(async()=>{await timer.set(60);});assert.deepEqual(commands,[{action:'sleepTimer',minutes:60}]);
  clock=4000000;act(()=>w.dispatchEvent(new w.Event('focus')));assert.equal(pauses,1,'former local timer must not fire');
 }catch(error){console.error(error);throw error;}finally{act(()=>root.unmount());Date.now=realNow;w.close();}
});
test('native timer is acknowledged before display and native expiry never triggers a second browser pause',async()=>{
 const w=new Window();globalThis.window=w;globalThis.document=w.document;
 const calls=[];let nativeDeadline=0,fail=false,pauses=0,timer;
 w.__nmAudioTransport={version:1,sleepTimer:true,request:async message=>{
  calls.push(message);if(fail)throw Error('native unavailable');
  if(message.action==='sleepTimer')nativeDeadline=message.minutes?Date.now()+message.minutes*60000:0;
  return {deadline:nativeDeadline};
 }};
 const root=createRoot(document.createElement('div'));
 const props={wiim:{blocksLocal:false,state:{}},pauseLocal:()=>pauses++,notify:()=>{}};
 function Harness(){timer=useSleepTimer(props);return null;}
 try{
  act(()=>root.render(React.createElement(Harness)));
  await act(async()=>{assert.equal(await timer.set(15),true);});assert.ok(timer.deadline>0);
  fail=true;await act(async()=>{assert.equal(await timer.set(0),false);});assert.ok(timer.deadline>0,'failed cancellation does not claim success');fail=false;
  nativeDeadline=0;act(()=>w.dispatchEvent(new w.CustomEvent('navimuse-native-audio',{detail:{type:'sleepTimer',deadline:0}})));
  assert.equal(timer.deadline,0);assert.equal(pauses,0);
  await act(async()=>{assert.equal(await timer.set(30),true);});
  act(()=>root.unmount());assert.equal(calls.at(-1).minutes,0);
 }catch(error){console.error(error);throw error;}finally{act(()=>root.unmount());w.close();}
});
