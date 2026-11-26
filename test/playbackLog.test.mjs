import test from 'node:test';import assert from 'node:assert/strict';
import {createPlaybackLog,bindPlaybackLog,unbindPlaybackLog,PLAYBACK_LOG_LIMIT} from '../src/playbackLog.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('logs persist bounded safe events, prune stale data, and clear',()=>{
 const disk=storage();let time=1e12;const log=createPlaybackLog({storage:disk,now:()=>time});
 log.record({event:'error',errorCode:2,url:'https://secret',title:'private',message:'token',network:'wifi',position:12,bufferSeconds:3});
 assert.doesNotMatch(JSON.stringify(createPlaybackLog({storage:disk,now:()=>time}).snapshot()),/secret|private|token/);
 for(let i=0;i<PLAYBACK_LOG_LIMIT+10;i++){time++;log.record({event:'sample',position:i});}
 assert.equal(log.snapshot().events.length,PLAYBACK_LOG_LIMIT);assert.equal(log.snapshot().events.at(-1).position,PLAYBACK_LOG_LIMIT+9);
 time+=8*86400000;assert.equal(log.snapshot().events.length,0);
 log.record({event:'https://private',position:1});assert.equal(log.snapshot().events.length,0);
 log.record({event:'waiting'});log.clear();assert.equal(createPlaybackLog({storage:disk,now:()=>time}).snapshot().events.length,0);
});
test('storage failure cannot break playback and corrupt persisted entries are sanitized',()=>{
 const log=createPlaybackLog({storage:{getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}}});
 assert.doesNotThrow(()=>{log.record({event:'playing'});log.clear();});
 const now=1e12;const restored=createPlaybackLog({now:()=>now,storage:{getItem:()=>JSON.stringify([{event:'error',at:now,errorCode:3,password:'secret'},{event:'private title',at:now},{event:'sample',at:now+1}])}});
 assert.deepEqual(restored.snapshot().events,[{event:'error',at:now,errorCode:3}]);
});
test('media events capture buffer and numeric error without URLs; samples throttle and cleanup detaches',()=>{
 const media=new EventTarget(),win=new EventTarget(),connection=new EventTarget(),log=createPlaybackLog();let time=31000;
 Object.assign(media,{paused:false,currentTime:10,readyState:2,networkState:2,error:{code:2,message:'secret'},src:'https://private',buffered:{length:1,start:()=>0,end:()=>25}});
 const nav={onLine:true,connection};bindPlaybackLog(media,0,{log,windowLike:win,navigatorLike:nav,now:()=>time});
 for(const event of ['loadstart','waiting','error','timeupdate','timeupdate'])media.dispatchEvent(new Event(event));
 nav.onLine=false;win.dispatchEvent(new Event('offline'));
 const report=log.snapshot();assert.equal(report.events.filter(e=>e.event==='sample').length,1);assert.equal(report.events[1].bufferSeconds,15);assert.equal(report.events.at(-1).network,'offline');assert.doesNotMatch(JSON.stringify(report),/private|secret/);
 unbindPlaybackLog(media);media.dispatchEvent(new Event('playing'));win.dispatchEvent(new Event('online'));assert.equal(log.snapshot().events.length,report.events.length);
});
