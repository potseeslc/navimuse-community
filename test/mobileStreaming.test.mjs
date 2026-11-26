import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseStreamPreference, saveDeviceStreaming, hasMobileNetwork, deviceStreamFormats, normalizeDeviceStreaming } from '../src/mobileStreaming.js';
test('native connection selects device preferences; browser ignores device storage', () => {
 const values=new Map(); globalThis.window={localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
 const defaults={cellularFormat:'mp3',cellularBitrate:'128',wifiFormat:'raw',wifiBitrate:'0'};
 assert.equal(hasMobileNetwork(),false); assert.deepEqual(chooseStreamPreference(defaults),{format:'raw',maxBitRate:'0'});
 window.__nmAudioTransport={network:true,networkType:'cellular'};
 saveDeviceStreaming({...defaults,cellularBitrate:'192'});
 assert.deepEqual(chooseStreamPreference(defaults),{format:'mp3',maxBitRate:'192'});
 window.__nmAudioTransport.networkType='wifi';assert.deepEqual(chooseStreamPreference(defaults),{format:'raw',maxBitRate:'0'});
 window.__nmAudioTransport.networkType='unknown';assert.equal(chooseStreamPreference(defaults).maxBitRate,'192');
 delete window.__nmAudioTransport;assert.deepEqual(chooseStreamPreference(defaults),{format:'raw',maxBitRate:'0'});
 delete globalThis.window;
});

test('Opus is capability-gated, original cellular is explicit, and network preferences persist independently',()=>{
 const values=new Map();globalThis.window={localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},__nmAudioTransport:{network:true,networkType:'cellular',audioFormats:['raw','mp3','opus']}};
 try{
  assert.deepEqual(deviceStreamFormats(),['raw','mp3','opus']);
  saveDeviceStreaming({cellularFormat:'opus',cellularBitrate:'96',wifiFormat:'opus',wifiBitrate:'256'});
  assert.deepEqual(chooseStreamPreference(),{format:'opus',maxBitRate:'96'});
  window.__nmAudioTransport.networkType='wifi';assert.deepEqual(chooseStreamPreference(),{format:'opus',maxBitRate:'256'});
  window.__nmAudioTransport.networkType=undefined;assert.deepEqual(chooseStreamPreference(),{format:'opus',maxBitRate:'96'});
  delete window.__nmAudioTransport.audioFormats;assert.deepEqual(deviceStreamFormats(),['raw','mp3']);assert.deepEqual(chooseStreamPreference(),{format:'mp3',maxBitRate:'96'});
  assert.equal(normalizeDeviceStreaming({wifiFormat:'aac'}).wifiFormat,'raw','unsupported encoders are not silently advertised');
  saveDeviceStreaming({cellularFormat:'raw',cellularBitrate:'128',wifiFormat:'mp3',wifiBitrate:'192'});
  assert.deepEqual(chooseStreamPreference(),{format:'raw',maxBitRate:'0'});
  window.__nmAudioTransport.networkType='wifi';assert.deepEqual(chooseStreamPreference(),{format:'mp3',maxBitRate:'192'});
 }finally{delete globalThis.window;}
});
