import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src-tauri/ios/track-controls.js',import.meta.url),'utf8');
function harness(origin='https://navimuse.example.com',subframe=false,script=source){
 let mounted=false,changed;const document={getElementById:()=>mounted?{childElementCount:1}:null};
 const messages=[],events=[],listeners={};const window={webkit:{messageHandlers:{navimuseAudio:{postMessage:message=>{messages.push(message);return Promise.resolve(true);}}}},addEventListener:(name,fn)=>listeners[name]=fn,dispatchEvent:e=>events.push(e)};window.top=subframe?{}:window;
 const media={setActionHandler(){}};const original=media.setActionHandler;
 vm.runInNewContext(script,{document,MutationObserver:class {constructor(fn){changed=fn;}observe(){}disconnect(){}},window,location:{origin},crypto:{randomUUID:()=> 'page-one'},CustomEvent:class {constructor(name,options){this.name=name;this.detail=options.detail;}},navigator:{mediaSession:media}});
 return {window,media,original,messages,events,listeners,mount(){mounted=true;changed();}};
}
test('native audio bridge is first-party main-frame only and does not patch WebKit actions',()=>{
 const h=harness();assert.equal(h.window.__nmAudioTransport.version,1);assert.equal(h.media.setActionHandler,h.original);assert.equal(h.messages[0].action,'bind');
 for(const h of [harness('https://example.com'),harness('https://navimuse.example.com',true)])assert.equal(h.window.__nmAudioTransport,undefined);
});
test('stale native events cannot reach a replacement page and unload detaches the interface without discarding native playback',async()=>{
 const h=harness();h.window.__nmReceiveAudio({page:'old',payload:{type:'ended'}});assert.equal(h.events.length,0);
 h.window.__nmReceiveAudio({page:'page-one',payload:{type:'playing'}});assert.equal(h.events[0].detail.type,'playing');
 await h.window.__nmAudioTransport.request({action:'pause',page:'forged'});assert.equal(h.messages.at(-1).page,'page-one');
 h.listeners.pagehide();assert.equal(h.messages.at(-1).action,'detach');
});

test('native loading cover waits for mounted content before hiding',async()=>{const h=harness();await Promise.resolve();assert.equal(h.messages.some(m=>m.action==='pageReady'),false);h.mount();await Promise.resolve();assert.equal(h.messages.at(-1).action,'pageReady');});

test('native format capabilities are available synchronously and remain immutable',()=>{
 const fallback=harness().window.__nmAudioTransport.audioFormats;assert.deepEqual(Array.from(fallback),['raw','mp3']);assert.equal(Object.isFrozen(fallback),true);
 const injected=source.replace("/*NM_AUDIO_FORMATS*/['raw','mp3']",JSON.stringify(['raw','mp3','opus']));
 const capable=harness('https://navimuse.example.com',false,injected).window.__nmAudioTransport.audioFormats;
 assert.deepEqual(Array.from(capable),['raw','mp3','opus']);assert.equal(Object.isFrozen(capable),true);
});
