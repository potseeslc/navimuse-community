import test from 'node:test';import assert from 'node:assert/strict';
import {startNowPlayingDelivery} from '../server/wiim/nowPlayingPush.mjs';
test('background delivery coalesces position, pushes track changes, and removes ended registrations',async t=>{
 let now=1000;let attrs={id:'session',revision:1,title:'Track',timestamp:'time',elapsedTime:1};let publication={kind:'update',attributes:attrs};const calls=[],removed=[];
 const worker=startNowPlayingDelivery({interval:999999,now:()=>now,service:{deliveries:async()=>[{key:'key',pushToken:'ab',sessionID:'session',publication}],removePush:async key=>removed.push(key)},send:async(...args)=>{calls.push(args);return {ok:true};}});t.after(()=>worker.close());
 await worker.tick();assert.equal(calls.length,1);attrs.elapsedTime=5;await worker.tick();assert.equal(calls.length,1);attrs.revision=2;attrs.title='Next';await worker.tick();assert.equal(calls.length,2);
 publication={kind:'retain'};await worker.tick();assert.equal(calls.length,2);publication={kind:'end'};await worker.tick();assert.equal(calls[2][1].aps.event,'end');assert.deepEqual(calls[2][1].aps.attributes,{id:'session'});assert.deepEqual(removed,['key']);
});
test('transport failure backs off and invalid tokens are discarded without command effects',async t=>{
 let now=0,count=0,removed=0;
 const worker=startNowPlayingDelivery({interval:999999,now:()=>now,service:{deliveries:async()=>[{key:'key',pushToken:'ab',sessionID:'session',publication:{kind:'end'}}],removePush:async()=>removed++},send:async()=>{count++;if(count===1)throw Error('offline');return {ok:false,invalidToken:true};}});t.after(()=>worker.close());
 await worker.tick();await worker.tick();assert.equal(count,1);now=15000;await worker.tick();assert.equal(count,2);assert.equal(removed,1);
});
