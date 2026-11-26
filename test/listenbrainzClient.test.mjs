import test from 'node:test';
import assert from 'node:assert/strict';
import {createListenBrainzClient} from '../server/listenbrainz/client.mjs';
test('reads from fixed ListenBrainz host without forwarding credentials',async()=>{
 let request;
 const client=createListenBrainzClient({fetchImpl:async(url,options)=>{request={url,options};return new Response('{"payload":{}}');}});
 await client.stats('a/b?x','artists');
 assert.equal(request.url,'https://api.listenbrainz.org/1/stats/user/a%2Fb%3Fx/artists?range=this_month');
 assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.authorization,undefined);
 assert.match(request.options.headers['user-agent'],/^NaviMuse\//);
});
test('not-yet-generated statistics are distinct from zero listens',async()=>{
 const client=createListenBrainzClient({fetchImpl:async()=>new Response(null,{status:204})});
 assert.deepEqual(await client.stats('listener','artists'),{state:'pending',data:null});
});
test('rate limits propagate without an automatic retry storm',async()=>{
 let calls=0;const client=createListenBrainzClient({fetchImpl:async()=>{calls++;return new Response(null,{status:429});}});
 await assert.rejects(client.recommendations('listener'),error=>error.status===429);assert.equal(calls,1);
});
test('invalid ranges and arbitrary playlist URLs never reach the network',()=>{
 const client=createListenBrainzClient({fetchImpl:()=>assert.fail('Unexpected request')});
 assert.throws(()=>client.stats('listener','artists','today'));
 assert.throws(()=>client.playlist('https://example.com'));
});
test('serializes calls and respects upstream cooldown headers',async()=>{
 let time=0;const starts=[];
 const client=createListenBrainzClient({now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{
  starts.push(time);return new Response('{}',{headers:starts.length===1?{'x-ratelimit-remaining':'0','x-ratelimit-reset-in':'3'}:{}});
 }});
 await Promise.all([client.listens('listener'),client.recommendations('listener'),client.stats('listener','artists')]);
 assert.deepEqual(starts,[0,3000,4000]);
});
test('missing rate-limit headers still back off on 429 and recover',async()=>{
 let time=0;const starts=[];
 const client=createListenBrainzClient({now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{starts.push(time);return new Response('{}',{status:starts.length===1?429:200});}});
 await assert.rejects(client.listens('a'));
 await client.listens('a');await client.listens('a');
 assert.deepEqual(starts,[0,30000,31000]);
});
test('low remaining allowance spreads requests across reset window',async()=>{
 let time=0;const starts=[];
 const client=createListenBrainzClient({now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{starts.push(time);return new Response('{}',{headers:{'x-ratelimit-remaining':'2','x-ratelimit-reset-in':'10'}});}});
 await client.listens('a');await client.listens('b');assert.deepEqual(starts,[0,5000]);
});
