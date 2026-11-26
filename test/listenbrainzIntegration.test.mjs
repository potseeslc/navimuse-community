import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createListenBrainzIntegration,matchRecording,matchListeningLibraryItem} from '../server/listenbrainz/integration.mjs';
import {ordinaryAutoplayEnabled} from '../shared/ordinaryAutoplay.js';
import {ordinaryQueue} from '../shared/wiim/contract.js';
async function setup(t,extra={}){const directory=await mkdtemp(join(tmpdir(),'nm-listenbrainz-'));t.after(()=>rm(directory,{recursive:true,force:true}));const client={listens:async()=>({state:'ready',data:{payload:{listens:[]}}}),stats:async username=>({state:'ready',data:{payload:{artists:[{artist_name:username,listen_count:5}]}}}),...extra};return {directory,client,store:createListenBrainzIntegration({directory,client})};}
test('two accounts persist separate connections and cache data; disconnect does not affect the other',async t=>{
 const {store,directory,client}=await setup(t);await store.save('a',{revision:0,username:'Alice'});await store.save('b',{revision:0,username:'Bob'});
 assert.equal((await store.section('a','artists','this_month')).items[0].title,'Alice');assert.equal((await store.section('b','artists','this_month')).items[0].title,'Bob');
 await store.save('a',{revision:1,username:''});await assert.rejects(store.section('a','artists','this_month'));
 assert.equal((await createListenBrainzIntegration({directory,client}).connection('b')).username,'Bob');
 await assert.rejects(store.save('a',{revision:1,username:'Other'}),e=>e.status===409);
});
test('in-flight old profile results are rejected after disconnect',async t=>{
 let finish,started;const ready=new Promise(r=>started=r);const {store}=await setup(t,{stats:()=>{started();return new Promise(r=>finish=r);}});
 await store.save('a',{revision:0,username:'Alice'});const result=store.section('a','artists','this_month');await ready;
 await store.save('a',{revision:1,username:''});finish({state:'ready',data:{payload:{artists:[]}}});await assert.rejects(result,e=>e.status===409);
});
test('only a unique matching recording is playable; ambiguous versions are not guessed',()=>{
 const t={title:'Song',artist:'Artist',album:'Album',duration:120};const song={id:'a',...t};
 assert.equal(matchRecording(t,[song]).state,'matched');assert.equal(matchRecording(t,[song,{...song,id:'b'}]).state,'ambiguous');
 assert.equal(matchRecording(t,[{...song,title:'Song (Live)'}]).state,'unavailable');assert.equal(matchRecording(t,[{...song,duration:160}]).state,'unavailable');
});
test('ListenBrainz provenance survives direct speaker transfer and disables AudioMuse refill',()=>{
 const queue=ordinaryQueue({source:{kind:'listenbrainz'},index:0,items:[{queueItemId:'one',song:{id:'song'}}]});
 assert.equal(queue.source.kind,'listenbrainz');assert.equal(ordinaryAutoplayEnabled(queue,{autoplayAfterQueue:true}),false);
});
test('activity removes the previous calendar month returned by the upstream API',async t=>{
 const {directory,client}=await setup(t,{stats:async()=>({state:'ready',data:{payload:{listening_activity:[{from_ts:Date.UTC(2026,7,31)/1000,time_range:'August',listen_count:99},{from_ts:Date.UTC(2026,8,1)/1000,time_range:'September',listen_count:5}]}}})});
 const store=createListenBrainzIntegration({directory,client,now:()=>Date.UTC(2026,8,14)});await store.save('a',{revision:0,username:'Alice'});
 assert.deepEqual((await store.section('a','listening-activity','this_month')).items.map(i=>i.count),[5]);
});
test('top track and album titles remain distinct from their artist credit',async t=>{
 const {store}=await setup(t,{stats:async()=>({state:'ready',data:{payload:{recordings:[{track_name:'Song for Zula',artist_name:'Phosphorescent',listen_count:16}],release_groups:[{release_group_name:'Muchacho',artist_name:'Phosphorescent',listen_count:20}]}}})});
 await store.save('a',{revision:0,username:'Alice'});
 assert.equal((await store.section('a','recordings','this_month')).items[0].title,'Song for Zula');
 assert.equal((await store.section('a','release-groups','this_month')).items[0].title,'Muchacho');
});
test('album statistics retain a unique library album ID alongside artwork',async t=>{
 const {store}=await setup(t,{stats:async()=>({state:'ready',data:{payload:{release_groups:[{release_group_name:'Muchacho',artist_name:'Phosphorescent',listen_count:20}]}}})});
 await store.save('a',{revision:0,username:'Alice'});
 const result=await store.section('a','release-groups','this_month',async()=>({coverArt:'cover',albumId:'album'}));
 assert.equal(result.items[0].albumId,'album');assert.equal(result.items[0].coverArt,'cover');
});
test('listening rows retain verified songs but never invent playback for unmatched items',async t=>{
 const {store}=await setup(t,{stats:async()=>({state:'ready',data:{payload:{recordings:[{track_name:'Matched',artist_name:'Artist',listen_count:3},{track_name:'Unmatched',artist_name:'Artist',listen_count:2}]}}})});
 await store.save('a',{revision:0,username:'Alice'});
 const result=await store.section('a','recordings','this_month',async item=>item.title==='Matched'?{coverArt:'cover',song:{id:'verified',title:'Matched'}}:null);
 assert.equal(result.items[0].song.id,'verified');assert.equal(result.items[1].song,undefined);
});

test('statistic playback refuses duplicate versions, missing artist, and truncated searches',()=>{
 const item={title:'Song',artist:'Artist'},song={id:'song',title:'Song',artist:'Artist'};
 assert.equal(matchListeningLibraryItem(item,'song',[song]).song.id,'song');
 assert.equal(matchListeningLibraryItem(item,'song',[song,{...song,id:'other'}]),null);
 assert.equal(matchListeningLibraryItem({title:'Song'},'song',[song]).song,undefined);
 assert.equal(matchListeningLibraryItem(item,'song',[song,...Array.from({length:19},(_,i)=>({title:'Other '+i}))]).song,undefined);
});
test('recent feed expires in 30 seconds while chart cache lasts 15 minutes',async t=>{
 let time=100000,calls=0,stats=0;
 const {directory,client}=await setup(t,{listens:async()=>{calls++;return {state:'ready',data:{payload:{listens:[{listened_at:100,track_metadata:{track_name:'Song',artist_name:'Artist'}}]}}};},stats:async()=>{stats++;return {state:'ready',data:{payload:{artists:[]}}};}});
 const store=createListenBrainzIntegration({directory,client,now:()=>time});await store.save('a',{revision:0,username:'Alice'});calls=0;
 const first=await store.section('a','recent');await store.section('a','artists','this_month');
 time+=29999;await store.section('a','recent');assert.equal(calls,1);
 time++;const next=await store.section('a','recent');assert.equal(calls,2);assert.equal(next.items[0].id,first.items[0].id);
 await store.section('a','artists','this_month');assert.equal(stats,1);
 time+=870000;await store.section('a','artists','this_month');assert.equal(stats,2);
});
