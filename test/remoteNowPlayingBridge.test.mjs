import test from 'node:test';import assert from 'node:assert/strict';import {publishNativeRemotePlayer,endNativeRemotePlayer} from '../src/remoteNowPlayingBridge.js';
test('bridge retains uncertain ownership and only sends narrow verified-session references',async()=>{const calls=[],bridge={request:async x=>calls.push(x)};const state={scope:'scope',session:{id:'session',status:'playing',credentials:'never'},checked:true};await publishNativeRemotePlayer({...state,busy:true},bridge);await publishNativeRemotePlayer({...state,error:'offline'},bridge);assert.equal(calls.length,0);await publishNativeRemotePlayer({...state,userInitiated:true},bridge);assert.deepEqual(calls,[{action:'update',scope:'scope',sessionID:'session',userInitiated:true}]);await publishNativeRemotePlayer({...state,session:null},bridge);assert.deepEqual(calls[1],{action:'end'});});
test('browser has no native fallback and failed publication does not affect playback',async()=>{assert.equal(await publishNativeRemotePlayer({checked:true},{}),false);assert.equal(await publishNativeRemotePlayer({checked:true,session:null},{request:async()=>{throw Error('disabled');}}),false);await endNativeRemotePlayer({});});

test('confirmed speaker release and takeover end the native card',async()=>{
 for(const status of ['released','external','error','ended']){
  const calls=[];await publishNativeRemotePlayer({scope:'scope',checked:true,session:{id:'session',status}}, {request:async p=>calls.push(p)});
  assert.deepEqual(calls,[{action:'end'}]);
 }
});
