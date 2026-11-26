import test from 'node:test';import assert from 'node:assert/strict';
import{createSonicRadioController}from'../src/sonicRadioController.js';
import{fetchArtistSongs,fetchGenreSongs,searchSonicFallback}from'../src/sonicRadioUi.js';
const deps=()=>({replaceQueue(){},playTrack(){},getQueueSnapshot:()=>({items:[],index:0}),fetchSimilarTracks:async()=>({ok:true,tracks:[{id:'similar'}]})});
test('failed or malformed seed requests are not presented as an empty library',async()=>{
 for(const load of [fetchArtistSongs,fetchGenreSongs,searchSonicFallback]){
  for(const response of [Response.json({},{status:503}),Response.json({}),new Response('broken',{status:200})])await assert.rejects(load(async()=>response,'seed'));
  assert.deepEqual(await load(async()=>Response.json({songs:[]}),'seed'),[]);
 }
});
test('failed seed lookup differs from a successful empty result and clears only start notices',async()=>{
 let fail=true;const c=createSonicRadioController({...deps(),fetchArtistSongs:async()=>{if(fail)throw Error('private network text');return [];}});
 await c.startArtistJourney({id:'beck',name:'Beck'});assert.match(c.getNotice(),/Could not load tracks for Beck/);assert.doesNotMatch(c.getNotice(),/No tracks|private/);
 c.clearStartNotice();assert.equal(c.getNotice(),'');fail=false;await c.startArtistJourney({id:'beck',name:'Beck'});assert.equal(c.getNotice(),'No tracks found for Beck');c.clearStartNotice();
 await c.startTrackJourney({id:'seed',title:'Seed'});c.stopRadio();const saved=c.getNotice();assert.match(saved,/Save/);c.clearStartNotice();assert.equal(c.getNotice(),saved);c.destroy();
});
test('a late seed lookup cannot replace playback or publish errors after a newer playback intent',async()=>{
 for(const reject of [false,true]){
  let resolve,fail,intent=1,replaced=0;const c=createSonicRadioController({...deps(),getPlaybackContext:()=>intent,replaceQueue:()=>replaced++,fetchArtistSongs:()=>new Promise((r,j)=>{resolve=r;fail=j;})});
  const pending=c.startArtistJourney({id:'beck',name:'Beck'});intent++;if(reject)fail(Error('network'));else resolve([{id:'old-seed'}]);await pending;assert.equal(replaced,0);assert.equal(c.getNotice(),'');c.destroy();
 }
});
test('a late similarity result cannot replace newer playback and abandons only its pending feeder',async()=>{
 let finish,intent=1,replaced=0;const c=createSonicRadioController({...deps(),getPlaybackContext:()=>intent,replaceQueue:()=>replaced++,fetchSimilarTracks:()=>new Promise(r=>finish=r)});
 const pending=c.startTrackJourney({id:'seed',title:'Seed'});intent++;finish({ok:true,tracks:[{id:'old'}]});await pending;assert.equal(replaced,0);assert.equal(c.getNotice(),'');assert.equal(c.getState().status,'idle');c.destroy();
});
test('a source-change effect cannot clear a new failure already owned by that source',async()=>{
 const c=createSonicRadioController({...deps(),playbackSource:'first',fetchArtistSongs:async()=>[]});c.updateDeps({playbackSource:'second'});await c.startArtistJourney({id:'beck',name:'Beck'});c.clearStartNotice('second');assert.equal(c.getNotice(),'No tracks found for Beck');c.clearStartNotice('third');assert.equal(c.getNotice(),'');c.destroy();
});
