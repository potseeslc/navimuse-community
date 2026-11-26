import test from 'node:test';
import assert from 'node:assert/strict';
import {createRemoteJourneyStarter} from '../src/remoteJourney.js';
function fixture(extra={}){
 const commands=[],notices=[];
 const output={state:{session:{id:'speaker-session',generation:1,status:'playing'}},async command(action,extra){commands.push({action,...extra});return true;}};
 const discovery={fetchSimilarTracks:async()=>({ok:true,tracks:[{id:'two',artistId:'other',title:'Two'}]}),fetchArtistSongs:async()=>[{id:'one',artistId:'artist',title:'One'}],fetchGenreSongs:async()=>[{id:'one',title:'One'}],...extra.discovery};
 const starter=createRemoteJourneyStarter({getOutput:()=>output,discovery,onNotice:notice=>notices.push(notice),...extra});
 return {output,commands,notices,starter};
}
for(const [kind,value] of [['track',{id:'one',title:'One'}],['artist',{id:'artist',name:'Artist'}],['genre','Jazz'],['artist-dj',{id:'artist',name:'Artist'}]])test(`${kind} starts on selected speaker through one replacement command`,async()=>{
 const f=fixture();assert.equal(await f.starter.start(kind,value,undefined,true),true);
 assert.equal(f.commands.length,1);const cmd=f.commands[0];assert.equal(cmd.action,'replace');assert.ok(cmd.queue.items.length);assert.ok(cmd.queue.journey);assert.equal(cmd.queue.journey.autoExtend,kind!=='artist-dj');
});
test('failed discovery preserves the playing queue',async()=>{
 const f=fixture({discovery:{fetchSimilarTracks:async()=>({ok:false})}});
 assert.equal(await f.starter.start('track',{id:'one'}),false);assert.equal(f.commands.length,0);assert.match(f.notices.at(-1),/unavailable/);
});
test('output changes reject a delayed Journey result',async()=>{
 let resolve;const f=fixture({discovery:{fetchSimilarTracks:()=>new Promise(r=>resolve=r)}});
 const pending=f.starter.start('track',{id:'one'});f.output.state.session={id:'different-speaker-session',generation:1,status:'playing'};
 resolve({ok:true,tracks:[{id:'two'}]});assert.equal(await pending,false);assert.equal(f.commands.length,0);
});
test('new Journey supersedes an older request without playing its result',async()=>{
 let resolve;let calls=0;const f=fixture({discovery:{fetchSimilarTracks:()=>++calls===1?new Promise(r=>resolve=r):Promise.resolve({ok:true,tracks:[{id:'three'}]})}});
 const old=f.starter.start('track',{id:'one'});const current=f.starter.start('track',{id:'two'});
 assert.equal(await old,false);assert.equal(await current,true);resolve({ok:true,tracks:[{id:'late'}]});await new Promise(r=>setImmediate(r));assert.equal(f.commands.length,1);assert.equal(f.commands[0].queue.items[0].song.id,'two');
});
test('timeout and unmount cancellation keep the speaker untouched',async()=>{
 const f=fixture({timeoutMs:5,discovery:{fetchSimilarTracks:()=>new Promise(()=>{})}});
 assert.equal(await f.starter.start('track',{id:'one'}),false);assert.match(f.notices.at(-1),/too long/);assert.equal(f.commands.length,0);
 const p=f.starter.start('track',{id:'one'});f.starter.cancel();assert.equal(await p,false);
});
