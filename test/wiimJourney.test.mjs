import test from 'node:test';import assert from 'node:assert/strict';
import {playbackQueue} from '../shared/wiim/journey.js';
import {createWiiMController,remoteQueue} from '../src/wiimPlayback.js';
import {createSonicRadioController} from '../src/sonicRadioController.js';
export const seed={seedType:'song',seedId:'one',seedSongId:'one',seedLabel:'Track Journey',sessionKind:'journey'};
export const journeyQueue=()=>({source:{kind:'radio',label:'Track Journey'},index:0,items:['one','two'].map((id,index)=>({queueItemId:'occurrence-'+index,song:{id,title:id,duration:100},provenance:index?'generated':'source',radioSessionId:'journey-one',radioSeed:seed}))});
test('Journey transfer round trips feeder identity, order and explicit occurrences while rejecting URL and frozen sources',()=>{
 const q=journeyQueue();q.items.push({queueItemId:'explicit',song:{id:'three'}});
 const remote=remoteQueue(q,{autoExtend:false});assert.equal(remote.journey.autoExtend,false);assert.deepEqual(remote.items.map(x=>x.song.id),['one','two','three']);assert.deepEqual(playbackQueue(remote),remote);assert.deepEqual(remote.items[1].radioSeed,seed);
 for(const invalid of [{...q,instanceId:'atlas'},{...q,items:[{...q.items[0],song:{id:'radio:x',streamUrl:'https://example.test'}}]},{...q,journey:{version:1,sessionId:'s',autoExtend:true,seed:{...seed,seedSongId:'../secret'}}},{...q,items:[{song:{id:'one'},queueItemId:'x'}]}])assert.throws(()=>playbackQueue(invalid));
 const dj=journeyQueue();dj.items=dj.items.map(item=>({...item,radioSeed:{...seed,sessionKind:'artist-dj'}}));assert.equal(remoteQueue(dj,{autoExtend:true}).journey.autoExtend,false);
});
test('unsupported-source preflight leaves playback untouched and does not suggest speaker refresh',async()=>{
 const events=[];const c=createWiiMController({pauseLocal:async()=>events.push('pause'),saveOwnership:async()=>events.push('save'),request:async()=>{events.push('request');return{session:null};}});
 await c.refresh();events.length=0;assert.equal(await c.transfer('speaker',{...journeyQueue(),instanceId:'atlas'},{}),false);assert.deepEqual(events,[]);assert.equal(c.blocksLocal,false);assert.doesNotMatch(c.state.error,/Refresh speakers/);
});
test('lost Journey handoff reconciles and returns the latest server queue for paused local restoration',async()=>{
 let session=null;const events=[];const q=remoteQueue(journeyQueue());
 const c=createWiiMController({pauseLocal:async()=>events.push('pause'),request:async(path,init)=>{
  if(!init)return{session};
  if(path.endsWith('/session')){session={id:'remote',status:'playing',revision:1,queue:q,song:{id:'one'}};throw Error('Response lost');}
  session={...session,status:'released',queue:{...q,index:1},song:{id:'two'},position:42};return{session};
 }});
 await c.refresh();assert.equal(await c.transfer('speaker',journeyQueue(),{},12),false);assert.ok(c.blocksLocal);assert.equal(await c.release(),true);assert.equal(c.state.releasedSession.position,42);assert.equal(c.state.releasedSession.queue.index,1);assert.equal(c.blocksLocal,false);
 let plays=0;const feeder=createSonicRadioController({replaceQueue(){throw Error('must not replace');},getQueueSnapshot:()=>c.state.releasedSession.queue,playTrack(){plays++;},fetchSimilarTracks:async()=>({ok:false,tracks:[]}),shouldAutoExtend:false});
 assert.equal(feeder.restoreQueueSession(c.state.releasedSession.queue),true);assert.equal(feeder.getState().seedSongId,'one');assert.equal(plays,0);feeder.destroy();
});

test('an old local refill cannot append after the same Journey returns from a speaker',async()=>{
 let finish;let appends=0;const q=journeyQueue();
 const feeder=createSonicRadioController({getQueueSnapshot:()=>q,replaceQueue(){},appendToQueue(){appends++;},playTrack(){},fetchSimilarTracks:()=>new Promise(resolve=>finish=resolve),shouldAutoExtend:false});
 assert.ok(feeder.restoreQueueSession(q));const pending=feeder.replenish();await new Promise(r=>setImmediate(r));
 feeder.dismissSavePrompt();assert.ok(feeder.restoreQueueSession(q));finish({ok:true,tracks:[{id:'late'}]});await pending;assert.equal(appends,0);assert.equal(feeder.getState().status,'listening');feeder.destroy();
});
