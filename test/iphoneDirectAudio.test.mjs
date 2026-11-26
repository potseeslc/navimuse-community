import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {usesDirectMediaAudio,audioTransitionCapabilities} from '../src/audioPlatform.js';
import {transitionDecisionFor,TRANSITION_MODE,shouldPrepareTransition} from '../src/playbackTransitions.js';
test('iOS direct output disables blended standby playback while desktop retains it',()=>{
 const iphone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'};
 assert.equal(usesDirectMediaAudio(iphone),true);
 assert.equal(usesDirectMediaAudio({platform:'MacIntel',maxTouchPoints:5}),true);
 assert.equal(usesDirectMediaAudio({platform:'MacIntel',maxTouchPoints:0}),false);
 assert.equal(usesDirectMediaAudio({userAgent:'Android'}),false);
 for(const transitionStyle of ['smart','crossfade']){
  const input={outgoingItem:{id:'a',duration:180,albumId:'a'},incomingItem:{id:'b',duration:200,albumId:'b'},preferences:{transitionStyle}};
  const phone=transitionDecisionFor({...input,capabilities:audioTransitionCapabilities(iphone)});
  assert.equal(phone.mode,TRANSITION_MODE.HARD);
  assert.equal(shouldPrepareTransition({mode:phone.mode,currentTime:178,duration:180}),false);
  assert.notEqual(transitionDecisionFor({...input,capabilities:audioTransitionCapabilities({})}).mode,TRANSITION_MODE.HARD);
 }
});
test('iPhone decks never enter Web Audio and mute works without programmable volume',async()=>{
 const oldWindow=globalThis.window,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let contexts=0,type='auto';
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'iPhone',audioSession:{get type(){return type;},set type(value){type=value;}}}});
 globalThis.window={AudioContext:class {constructor(){contexts++;throw new Error('must not construct');}}};
 try{
  const {useAudioEngine}=await import('../src/useAudioEngine.js?iphone-direct');
  let api;function Harness(){api=useAudioEngine();return null;}
  renderToStaticMarkup(React.createElement(Harness));
  const deck={muted:false,set volume(_){throw new Error('iOS volume is not writable');}};
  api.bindAudioDeck(0,deck);assert.equal(contexts,0);assert.equal(type,'playback');assert.equal(api.isWebAudioActive(),false);
  api.setDeckGain(deck,0);assert.equal(deck.muted,true);
  api.setDeckGain(deck,0.5);assert.equal(deck.muted,false);
  await api.wakeAudioContext();assert.equal(contexts,0);
 }finally{globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});
