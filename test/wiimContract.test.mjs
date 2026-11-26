import test from 'node:test';import assert from 'node:assert/strict';
import {ordinaryQueue,advanceRemoteQueue,completedObservation} from '../shared/wiim/contract.js';
const queue=()=>({items:[{queueItemId:'one',song:{id:'same'}},{queueItemId:'two',song:{id:'same'}}],index:0});
test('remote queue preserves duplicate song occurrences and rejects unsupported sources',()=>{
 assert.equal(ordinaryQueue(queue()).items.length,2);
 assert.throws(()=>ordinaryQueue({...queue(),instanceId:'journey'}));
 const q=queue();q.items[0].song.streamUrl='https://example.com';assert.throws(()=>ordinaryQueue(q));
 const d=queue();d.items[1].queueItemId='one';assert.throws(()=>ordinaryQueue(d));
});
test('remote advancement uses existing next, repeat and pause-after-current semantics',()=>{
 const s={queue:queue(),controls:{},pool:[],history:[],generation:1,status:'playing'};
 assert.equal(advanceRemoteQueue(s,{natural:true}).queue.index,1);
 assert.equal(advanceRemoteQueue({...s,controls:{repeat:true}},{natural:true}).queue.index,0);
 const p=advanceRemoteQueue({...s,controls:{pauseAfterCurrent:true}},{natural:true});assert.equal(p.queue.index,1);assert.equal(p.status,'paused');assert.equal(p.controls.pauseAfterCurrent,false);
});
test('a stopped device requires a fresh near-end owned observation',()=>{
 const previous={uri:'owned',state:'PLAYING',position:99,at:1000};const current={uri:'owned',state:'STOPPED'};
 assert.equal(completedObservation(previous,current,{uri:'owned',duration:100,now:2000}),true);
 assert.equal(completedObservation({...previous,position:10},current,{uri:'owned',duration:100,now:2000}),false);
 assert.equal(completedObservation(previous,{...current,uri:'external'},{uri:'owned',duration:100,now:2000}),false);
 assert.equal(completedObservation(previous,current,{uri:'owned',duration:100,now:15000}),false);
});

test('terminal position corroborates completion across a delayed poll without guessing from STOPPED',()=>{
 const previous={uri:'owned',state:'PLAYING',position:95,at:1000};
 const current={uri:'owned',state:'STOPPED',position:100};
 const options={uri:'owned',duration:100,now:6000};
 assert.equal(completedObservation(previous,current,options),true);
 for(const update of [{position:96},{position:0},{position:undefined},{uri:'external'}])assert.equal(completedObservation(previous,{...current,...update},options),false);
 for(const update of [{position:50},{state:'PAUSED_PLAYBACK'},{uri:'external'},{at:-10000}])assert.equal(completedObservation({...previous,...update},current,options),false);
 assert.equal(completedObservation(previous,current,{...options,now:2000}),false);
 assert.equal(completedObservation(null,current,options),false);
});
