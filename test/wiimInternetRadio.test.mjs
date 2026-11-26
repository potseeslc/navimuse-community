import test from 'node:test';
import assert from 'node:assert/strict';
import {internetRadioQueue} from '../shared/wiim/internetRadio.js';
import {createInternetRadioSource} from '../server/wiim/radioSource.mjs';

const queue={index:0,items:[{queueItemId:'station-occurrence',song:{id:'radio:station-1',title:'Untrusted title',streamUrl:'https://client.example/untrusted'}}]};
const principal={id:'owner',scope:'owner-scope'};
const station={id:'station-1',name:'Station One',streamUrl:'https://radio.example/live'};
const safeUrl=url=>String(url).startsWith('https://radio.example/')?url:null;

test('live station contract retains identity and occurrence but discards all client media URLs',()=>{
 const normalized=internetRadioQueue(queue);
 assert.deepEqual(normalized.items,[{queueItemId:'station-occurrence',provenance:'explicit',song:{id:'radio:station-1'}}]);
 assert.deepEqual(normalized.internetRadio,{stationId:'station-1'});
 assert.deepEqual(internetRadioQueue(normalized),normalized);
 assert.equal(internetRadioQueue({index:0,items:[{song:{id:'library-song'}}]}),null);
 for(const candidate of [
  {...queue,index:1},{...queue,items:[...queue.items,...queue.items]},
  {...queue,instanceId:'atlas'},{...queue,journey:{}},{...queue,source:{kind:'downloads'}},
  {...queue,items:[{...queue.items[0],queueItemId:''}]},
  {...queue,items:[{...queue.items[0],song:{id:'radio:../../private'}}]},
  {...queue,items:[{...queue.items[0],provenance:'generated'}]}
 ])assert.throws(()=>internetRadioQueue(candidate));
});

test('station hydration uses the authorized registry and never trusts client title or duration',async()=>{
 const source=createInternetRadioSource({safeUrl,stationFor:async(p,id)=>{assert.equal(p,principal);assert.equal(id,'station-1');return station;},fetchStream:()=>assert.fail('Hydration must not probe stream')});
 assert.deepEqual(await source.songFor(principal,'radio:station-1'),{id:'radio:station-1',title:'Station One',artist:'Internet Radio',album:'Internet Radio',duration:0,suffix:'radio',isRadio:true});
});

test('radio grant request rechecks principal and registry before fetching media',async()=>{
 let allowed=true,fetches=0,lookups=0;
 const source=createInternetRadioSource({safeUrl,stationFor:async(p)=>{lookups++;assert.equal(p,principal);if(!allowed)throw Error('Account revoked');return station;},fetchStream:async(url,headers,signal)=>{fetches++;assert.equal(url,station.streamUrl);assert.equal(headers.Authorization,undefined);assert.equal(headers['Icy-MetaData'],'1');assert.ok(signal);return new Response('audio',{headers:{'content-type':'audio/mpeg','content-length':'5','accept-ranges':'bytes'}});}});
 await source.songFor(principal,'radio:station-1');
 const response=await source.mediaFor(principal,'radio:station-1',{signal:new AbortController().signal});
 assert.equal(await response.text(),'audio');assert.equal(response.headers.get('content-length'),null);assert.equal(response.headers.get('accept-ranges'),null);
 allowed=false;await assert.rejects(source.mediaFor(principal,'radio:station-1'),/revoked/);assert.equal(fetches,1);assert.equal(lookups,3);
});

test('speaker audio strips ICY metadata across chunks and records the matching station',async()=>{
 const metadata=Buffer.alloc(32);metadata.write("StreamTitle='Artist - Song';");
 const bytes=Buffer.concat([Buffer.from('abcd'),Buffer.from([2]),metadata,Buffer.from('efgh'),Buffer.from([0])]);
 const updates=[];
 const source=createInternetRadioSource({safeUrl,stationFor:async()=>station,onMetadata:(p,s,value)=>{assert.equal(p,principal);assert.equal(s,station);updates.push(value);},fetchStream:async()=>new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,8));c.enqueue(bytes.subarray(8,21));c.enqueue(bytes.subarray(21));c.close();}}),{headers:{'content-type':'audio/mpeg','icy-metaint':'4','icy-logo':'https://radio.example/art.jpg'}})});
 const response=await source.mediaFor(principal,'radio:station-1');assert.equal(await response.text(),'abcdefgh');assert.ok(updates.some(x=>x.title==='Artist - Song'));
});

test('missing stations and blocked URLs fail before any upstream stream request',async()=>{
 for(const value of [null,{...station,id:'other'},{...station,streamUrl:'http://127.0.0.1/private'}]){
  const source=createInternetRadioSource({safeUrl,stationFor:async()=>value,fetchStream:()=>assert.fail('Must not fetch')});
  await assert.rejects(source.mediaFor(principal,'radio:station-1'));
 }
});

test('radio source rejects nonaudio responses and bounds artwork',async()=>{
 let canceled=false;
 const source=createInternetRadioSource({safeUrl,stationFor:async()=>station,fetchStream:async()=>new Response(new ReadableStream({cancel(){canceled=true;}}),{headers:{'content-type':'text/html'}})});
 await assert.rejects(source.mediaFor(principal,'radio:station-1'),/unavailable/);assert.equal(canceled,true);
 const art=createInternetRadioSource({safeUrl,stationFor:async()=>station,artworkFor:()=> 'https://radio.example/art.jpg',fetchStream:async()=>new Response(new Uint8Array(2*1024*1024+1),{headers:{'content-type':'image/jpeg'}})});
 await assert.rejects(art.mediaFor(principal,'radio:station-1',{artwork:true}),/too large/);
});

test('canceling speaker consumption cancels the upstream radio stream',async()=>{
 let canceled=false;
 const source=createInternetRadioSource({safeUrl,stationFor:async()=>station,fetchStream:async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array([1,2,3]));},cancel(){canceled=true;}}),{headers:{'content-type':'audio/mpeg'}})});
 const response=await source.mediaFor(principal,'radio:station-1');const reader=response.body.getReader();await reader.read();await reader.cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(canceled,true);
});


test('returning radio locally reconstructs the fixed BFF endpoint at the live edge',async()=>{
 const {localPlaybackSession}=await import('../src/wiimPlayback.js');
 const queue=internetRadioQueue({index:0,items:[{queueItemId:'station',song:{id:'radio:station-1'}}]});
 const input={song:{id:'radio:station-1',streamUrl:'https://untrusted.example'},queue,position:1000};
 const session=localPlaybackSession(input);
 assert.equal(session.position,0);assert.equal(session.song.streamUrl,'/api/navidrome/radios/station-1/stream');
 assert.equal(session.queue.items[0].song.streamUrl,session.song.streamUrl);
 assert.equal(input.position,1000);assert.equal(input.queue.items[0].song.streamUrl,undefined);
});


test('client radio handoff pauses local playback and sends only the normalized station identity',async()=>{
 const {createWiiMController}=await import('../src/wiimPlayback.js');let payload;const events=[];
 const controller=createWiiMController({pauseLocal:async()=>events.push('pause'),request:async(_path,options)=>{
  if(!options)return {session:null};events.push('transfer');payload=JSON.parse(options.body);return {session:{id:'speaker-session',status:'playing',revision:1,queue:payload.queue}};
 }});
 await controller.refresh();assert.equal(await controller.transfer('speaker',queue,{},0),true);
 assert.deepEqual(events,['pause','transfer']);assert.equal(payload.queue.internetRadio.stationId,'station-1');
 assert.equal(payload.queue.items[0].song.streamUrl,undefined);assert.equal(controller.blocksLocal,true);
});

test('remote station metadata retains Navidrome cover art without probing a stream',async()=>{
 const source=createInternetRadioSource({safeUrl,stationFor:async()=>({...station,coverArt:'ra-station-1'}),fetchStream:()=>assert.fail('No stream probe')});
 assert.equal((await source.songFor(principal,'radio:station-1')).coverArt,'ra-station-1');
});
