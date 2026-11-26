import test from 'node:test';
import assert from 'node:assert/strict';
import {createArtistOpenerHistory} from '../src/artistOpenerHistory.js';
import {createAccountStorage} from '../src/accountStorage.js';
import {createSonicRadioController} from '../src/sonicRadioController.js';
import {createRemoteJourneyStarter} from '../src/remoteJourney.js';
const songs=['one','two','three'].map(id=>({id,artistId:'artist'}));
function storage(){const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};}
function dependencies(history){return {artistOpenerHistory:history,fetchArtistSongs:async()=>songs,fetchSimilarTracks:async()=>({ok:true,tracks:[{id:'other',artistId:'other'}]}),replaceQueue(){},playTrack(){},getQueueSnapshot:()=>({items:[],index:0}),shouldAutoExtend:false};}
test('recent openers rotate across relaunch and stay isolated by account and artist',()=>{
 const disk=storage(),a=createAccountStorage('queue-scope-v2:'+'a'.repeat(64),disk),b=createAccountStorage('queue-scope-v2:'+'b'.repeat(64),disk);
 for(const expected of ['one','two','three','one']){
  const history=createArtistOpenerHistory(a,()=>0),seed=history.choose('artist',songs);assert.equal(seed.id,expected);history.remember('artist',seed.id);
 }
 assert.equal(createArtistOpenerHistory(b,()=>0).choose('artist',songs).id,'one');
 assert.equal(createArtistOpenerHistory(a,()=>0).choose('different',songs).id,'one');
});
test('small catalogs, damaged storage and write failures still allow playback',()=>{
 const disk=storage();disk.setItem('artistJourneyOpeners.v1','invalid');const h=createArtistOpenerHistory(disk,()=>0);
 h.remember('artist','one');assert.equal(h.choose('artist',[songs[0],songs[0],songs[1]]).id,'two');
 assert.equal(h.choose('artist',[songs[0]]).id,'one');assert.equal(h.choose('artist',[]),undefined);
 disk.setItem=()=>{throw Error('quota');};h.remember('artist','two');assert.equal(h.choose('artist',songs.slice(0,2)).id,'one');
});
test('local starts rotate and failed generation does not consume an opener',async()=>{
 const history=createArtistOpenerHistory(storage(),()=>0),played=[];
 const deps=dependencies(history),c=createSonicRadioController({...deps,playTrack:item=>played.push(item.song.id)});
 await c.startArtistJourney({id:'artist'});await c.startArtistJourney({id:'artist'});assert.deepEqual(played,['one','two']);
 c.updateDeps({fetchSimilarTracks:async()=>({ok:false})});await c.startArtistJourney({id:'artist'});
 assert.equal(history.choose('artist',songs).id,'three');c.destroy();
});
test('remote starts remember only accepted speaker replacements and share local history',async()=>{
 const h=createArtistOpenerHistory(storage(),()=>0);h.remember('artist','one');let accepted=false;const starts=[];
 const output={state:{session:{id:'s',generation:1,status:'playing'}},command:async(_,payload)=>{starts.push(payload.queue.items[0].song.id);return accepted;}};
 const c=createRemoteJourneyStarter({getOutput:()=>output,discovery:dependencies(h)});
 assert.equal(await c.start('artist',{id:'artist'}),false);assert.equal(h.choose('artist',songs).id,'two');
 accepted=true;await c.start('artist',{id:'artist'});await c.start('artist',{id:'artist'});assert.deepEqual(starts,['two','two','three']);c.cancel();
});
test('cancelled artist discovery neither records an opener nor replaces the queue',async()=>{
 const h=createArtistOpenerHistory(storage(),()=>0);let resolve;let replaced=0;
 const c=createSonicRadioController({...dependencies(h),fetchSimilarTracks:()=>new Promise(r=>{resolve=r;}),replaceQueue:()=>replaced++});
 const pending=c.startArtistJourney({id:'artist'});await new Promise(r=>setImmediate(r));c.destroy();
 resolve({ok:true,tracks:[{id:'other',artistId:'other'}]});await pending;
 assert.equal(replaced,0);assert.equal(h.choose('artist',songs).id,'one');
});
