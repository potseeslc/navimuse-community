import test from 'node:test';
import assert from 'node:assert/strict';
import {WebAlbumAudio} from '../src/webAlbumAudio.js';
class Media extends EventTarget {currentTime=0;paused=true;readyState=0;duration=10;volume=1;loads=0;plays=0;pause(){this.paused=true;}play(){this.plays++;this.paused=false;return Promise.resolve();}load(){this.loads++;}removeAttribute(){}hasAttribute(){return false;}}
function fixture(){
 const nodes=[];const context={currentTime:0,sampleRate:48000,resume:async()=>{},createBufferSource(){const node={start(t,offset){this.when=t;this.offset=offset;},stop(time){if(time===undefined)this.stopped=true;else this.stopAt=time;},connect(){},disconnect(){}};nodes.push(node);return node;}};
 const media=new Media(),deck=new WebAlbumAudio(media);deck.setPCMOutput(context,{});
 deck.mode=true;deck.buffer={duration:10,length:480000,numberOfChannels:2};deck._src='/first';deck.decode=async()=>({duration:12,length:576000,numberOfChannels:2});
 return {deck,context,nodes,media};
}
test('audio clock schedules the exact decoded boundary, promotion does not restart or seek',async()=>{
 const {deck,context,nodes,media}=fixture();let event;deck.addEventListener('albumhandoff',e=>event=e.detail);
 await deck.play();context.currentTime=2;
 await deck.prepareAlbum({token:'album',entries:[{queueItemId:'second',url:'/second'}]});
 assert.equal(nodes[1].when,10);assert.equal(nodes[1].offset,0);assert.equal(media.plays,0);
 context.currentTime=10.25;nodes[0].onended();assert.equal(event.queueItemId,'second');assert.equal(deck.currentTime,.25);assert.equal(nodes.length,2);assert.equal(deck.src,'/second');
 context.currentTime=22;nodes[1].onended();assert.equal(deck.ended,true);
});
test('pause cancels scheduled audio and resume preserves the position and new boundary',async()=>{
 const {deck,context,nodes}=fixture();await deck.play();await deck.prepareAlbum({token:'album',entries:[{queueItemId:'second',url:'/second'}]});
 context.currentTime=3;deck.pause();assert.equal(deck.currentTime,3);assert.ok(nodes[1].stopped);
 context.currentTime=30;await deck.play();assert.equal(nodes[2].offset,3);assert.equal(nodes[3].when,37);
});
test('invalidating the next track never stops the current source',async()=>{
 const {deck,nodes}=fixture();await deck.play();await deck.prepareAlbum({token:'album',entries:[{queueItemId:'second',url:'/second'}]});deck.cancelAlbum();
 assert.equal(nodes[0].stopped,undefined);assert.ok(nodes[1].stopped);
});
test('late prefetch result after cancellation cannot schedule audio',async()=>{
 const {deck,nodes}=fixture();let done;deck.decode=()=>new Promise(r=>done=r);await deck.play();
 const preparing=deck.prepareAlbum({token:'album',entries:[{queueItemId:'second',url:'/second'}]});deck.cancelAlbum();done({duration:12,length:576000,numberOfChannels:2});
 assert.equal(await preparing,false);assert.equal(nodes.length,1);
});
test('pause while the initial buffer is preparing cancels the pending Play intent',async()=>{
 const {deck,nodes}=fixture();let ready;deck.pendingLoad=new Promise(resolve=>ready=resolve);const playing=deck.play();deck.pause();ready();
 await assert.rejects(playing,e=>e.name==='AbortError');assert.equal(nodes.length,0);
});

test('bounded reader rejects oversized metadata and encoded bodies before decoding',async()=>{
 const media=new Media();let calls=0,decodes=0;
 const deck=new WebAlbumAudio(media,{fetchImpl:async()=>{calls++;return new Response(new Uint8Array(4),{headers:{'content-length':String(49*1024*1024)}});}});
 deck.setPCMOutput({sampleRate:48000,decodeAudioData:async()=>{decodes++;}},{});
 const signal=new AbortController().signal;
 await assert.rejects(deck.decode('/song',signal,{duration:10000}),/PCM budget/);assert.equal(calls,0);
 await assert.rejects(deck.decode('/song',signal,{duration:60}),/too large/);assert.equal(decodes,0);
});
test('uncancellable codecs serialize and aborted waiting jobs never enter the decoder',async()=>{
 const deck=new WebAlbumAudio(new Media(),{fetchImpl:async()=>new Response(new Uint8Array(4))});let finish,started;const ready=new Promise(r=>started=r);let decodes=0;
 deck.setPCMOutput({sampleRate:48000,decodeAudioData:()=>{decodes++;started();return new Promise(r=>finish=r);}},{});
 const first=deck.decode('/one',new AbortController().signal,{duration:1});await ready;
 const controller=new AbortController(),second=deck.decode('/two',controller.signal,{duration:1});
 controller.abort();const rejected=assert.rejects(second,e=>e.name==='AbortError');
 finish({length:48000,numberOfChannels:2,duration:1});await first;await rejected;assert.equal(decodes,1);
});
test('failed initial album preparation resumes the existing HTML player',async()=>{
 const {deck,media}=fixture();deck.albumSource={duration:10};deck.src='/ordinary';deck.decode=async()=>{throw Error('Unavailable');};
 deck.load();await deck.play();assert.equal(deck.mode,false);assert.equal(media.src,'/ordinary');assert.equal(media.plays,1);
});
