import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrdinaryAutoplay} from '../src/ordinaryAutoplay.js';
import {ordinaryAutoplayEnabled,removeUpcomingAutoplay} from '../shared/ordinaryAutoplay.js';
import {remoteQueue} from '../src/wiimPlayback.js';
const queue=()=>({index:0,source:{kind:'album'},items:[{queueItemId:'a',song:{id:'a',duration:120}},{queueItemId:'b',song:{id:'b',duration:120}}]});
function fixture(options={}){
 let state={queue:queue(),controls:{autoplayAfterQueue:true},active:true,pool:[]};const notices=[],appended=[];
 const controller=createOrdinaryAutoplay({snapshot:()=>state,append:items=>appended.push(items),onNotice:text=>notices.push(text),fetchSimilar:async()=>({ok:true,tracks:[{id:'b'},{id:'c'},{id:'c'},{id:'radio:x',streamUrl:'https://invalid.test'}]}),...options});
 return {controller,notices,appended,get state(){return state;},update:patch=>state={...state,...patch}};
}
test('ordinary music is prepared before the end without selecting or replacing playback',async()=>{
 const f=fixture();assert.ok(await f.controller.refresh());assert.deepEqual(f.appended[0].map(item=>item.song.id),['c']);assert.equal(f.state.queue.index,0);assert.deepEqual(f.state.queue.items.map(x=>x.song.id),['a','b']);assert.equal(f.appended[0][0].autoplay,true);
 assert.doesNotThrow(()=>remoteQueue({...f.state.queue,items:[...f.state.queue.items,...f.appended[0]]}));
});
for(const patch of [{autoplayAfterQueue:false},{repeat:true},{repeatAll:true},{pauseAfterCurrent:true},{continueThroughQueue:false}])test(`continuation respects ${Object.keys(patch)[0]}`,async()=>{
 const f=fixture();f.update({controls:{...f.state.controls,...patch}});assert.equal(await f.controller.refresh(),false);assert.equal(f.appended.length,0);
});
test('download, radio and Journey queues never invoke the ordinary provider',()=>{
 for(const extra of [{source:{kind:'downloads'}},{source:{kind:'radio'}},{instanceId:'atlas'},{journey:{version:1}},{items:[{song:{id:'x',streamUrl:'https://radio.test'}}]}])assert.equal(ordinaryAutoplayEnabled({...queue(),...extra},{autoplayAfterQueue:true}),false);
});
test('stop, output change or replacement defeats delayed music without restarting transport',async()=>{
 for(const change of [f=>f.update({active:false}),f=>f.update({queue:{...queue(),items:[{queueItemId:'different',song:{id:'new'}}]}}),f=>f.update({controls:{autoplayAfterQueue:false}})]){
  let resolve;const f=fixture({fetchSimilar:()=>new Promise(r=>resolve=r)});const p=f.controller.refresh();change(f);resolve({ok:true,tracks:[{id:'late'}]});assert.equal(await p,false);assert.equal(f.appended.length,0);
 }
});
test('natural advance within an unchanged queue can accept prefetch without selecting a song',async()=>{
 let resolve;const f=fixture({fetchSimilar:()=>new Promise(r=>resolve=r)});const p=f.controller.refresh();f.update({queue:{...f.state.queue,index:1}});resolve({ok:true,tracks:[{id:'c'}]});assert.ok(await p);assert.equal(f.state.queue.index,1);
});
test('stalled similarity times out, retains music and cannot retry in a tight loop',async()=>{
 let calls=0;const f=fixture({timeoutMs:5,fetchSimilar:()=>{calls++;return new Promise(()=>{});}});assert.equal(await f.controller.refresh(),false);assert.match(f.notices[0],/queued tracks/);await f.controller.refresh();assert.equal(calls,1);assert.equal(f.appended.length,0);
});
test('turning autoplay off removes only pending generated additions, retaining explicit choices and current music',()=>{
 const q=queue();q.items.push({queueItemId:'c',song:{id:'c'},autoplay:true,provenance:'generated'},{queueItemId:'d',song:{id:'d'},autoplay:true,provenance:'explicit'});
 assert.deepEqual(removeUpcomingAutoplay(q).items.map(item=>item.song.id),['a','b','d']);
 q.index=2;assert.deepEqual(removeUpcomingAutoplay(q).items.map(item=>item.song.id),['a','b','c','d']);
});

test('a failed request from a replaced queue cannot publish a warning for current playback',async()=>{
 let reject;
 const f=fixture({fetchSimilar:()=>new Promise((_,fail)=>reject=fail)});
 const pending=f.controller.refresh();
 f.update({queue:{...queue(),items:[{queueItemId:'new-occurrence',song:{id:'new-track'}}]}});
 reject(Error('unavailable'));
 assert.equal(await pending,false);
 assert.deepEqual(f.notices,[]);
 assert.deepEqual(f.appended,[]);
});

test('continuation recovery clears its own warning, with natural advance preserving the warning until recovery',async()=>{
 let time=1000,fail=true;const cleared=[];
 const f=fixture({now:()=>time,clearNotice:message=>cleared.push(message),fetchSimilar:async()=>{if(fail)throw Error('offline');return {ok:true,tracks:[{id:'new-song'}]};}});
 await f.controller.refresh();assert.equal(f.notices.length,1);
 f.update({queue:{...f.state.queue,index:1}});await f.controller.refresh();assert.deepEqual(cleared,[]);
 time+=60001;fail=false;assert.equal(await f.controller.refresh(),true);
 assert.deepEqual(cleared,[f.notices[0]]);
});

test('replacing a queue or disabling continuation clears only the prior continuation warning',async()=>{
 for(const change of [f=>f.update({queue:{...queue(),items:[{queueItemId:'new',song:{id:'new'}}]},active:false}),f=>f.update({controls:{autoplayAfterQueue:false}})]){
  const cleared=[];const f=fixture({clearNotice:message=>cleared.push(message),fetchSimilar:async()=>{throw Error('failed');}});
  await f.controller.refresh();change(f);await f.controller.refresh();assert.deepEqual(cleared,[f.notices[0]]);
 }
});

test('the production player notice binding preserves newer unrelated feedback when autoplay recovers',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const binding=source.slice(source.indexOf('  if(!ordinaryAutoplayRef.current)'),source.indexOf('  useEffect(()=>{',source.indexOf('  if(!ordinaryAutoplayRef.current)')));
 let options,notice='';
 runInNewContext(binding,{ordinaryAutoplayRef:{current:null},createOrdinaryAutoplay:value=>{options=value;return {};},fetchSimilarTracks(){},setPlayerNotice:value=>{notice=typeof value==='function'?value(notice):value;}});
 const warning='Similar music is unavailable. Your queued tracks will keep playing.';
 options.onNotice(warning);options.clearNotice(warning);assert.equal(notice,'');
 options.onNotice('Playlist could not be saved.');options.clearNotice(warning);assert.equal(notice,'Playlist could not be saved.');
});
