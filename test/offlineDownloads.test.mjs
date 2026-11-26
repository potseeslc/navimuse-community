import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineDownloadsController,downloadableSongs,downloadProfile,saveDownloadProfile} from '../src/offlineDownloads.js';
const scope='queue-scope-v2:'+'a'.repeat(64),other='queue-scope-v2:'+'b'.repeat(64);
const snapshot=(own=scope)=>({available:true,scope:own,expiresAt:100000,tracks:[{song:{id:'one',title:'First'},state:'complete',bytes:123}],usedBytes:123,budgetBytes:2*1024**3,allowsCellular:false});
const detailEvent=detail=>{const event=new Event('navimuse-native-audio');event.detail=detail;return event;};
test('downloads reconcile account before reading metadata and hide mismatched native events',async()=>{
 const calls=[],events=new EventTarget();let payload=snapshot();
 const c=createOfflineDownloadsController(scope,{events,native:{version:1,offlineDownloads:true,request:async message=>{calls.push(message);return message.action==='offline.account'?true:payload;}}});c.activate();
 await c.refresh({revalidate:true});assert.deepEqual(calls.map(x=>x.action),['offline.account','offline.status','offline.authorize']);assert.equal(c.getSnapshot().tracks[0].song.id,'one');
 events.dispatchEvent(detailEvent({type:'offline',snapshot:snapshot(other)}));assert.equal(c.getSnapshot().available,false);assert.deepEqual(c.getSnapshot().tracks,[]);assert.equal(c.getSnapshot().expiresAt,null);
 events.dispatchEvent(detailEvent({type:'offline',snapshot:snapshot()}));assert.equal(c.getSnapshot().available,true);
 c.dispose();events.dispatchEvent(detailEvent({type:'offline',snapshot:snapshot(other)}));assert.equal(c.getSnapshot().available,true,'disposed instance ignores native events');
});
test('download commands keep existing queue untouched, reject radio and await authorization errors',async()=>{
 const calls=[],songs=[{id:'one'},{id:'one'},{id:'radio:live',streamUrl:'https://radio.test'},{id:'two'}];
 let reject=false;const c=createOfflineDownloadsController(scope,{native:{version:1,offlineDownloads:true,request:async m=>{calls.push(m);if(reject)throw Error('Connect to NaviMuse');return snapshot();}}});
 assert.equal(await c.download(songs,{format:'raw',bitrate:192}),true);
 assert.deepEqual(calls[0],{action:'offline.download',scope,songs:[{id:'one'},{id:'two'}],format:'raw',bitrate:0});assert.equal(songs.length,4);
 reject=true;assert.equal(await c.download([{id:'new'}],{format:'mp3',bitrate:128}),false);assert.equal(c.getSnapshot().error,'Connect to NaviMuse');assert.equal(c.getSnapshot().busy,false);
 assert.equal(await c.download([{id:'radio:live'}]),false);assert.match(c.getSnapshot().error,/Live radio/);
 assert.deepEqual(downloadableSongs([{id:'external',streamUrl:'/api/atlas/x'},null]),[]);
});
test('pending actions prevent duplicate submissions; detached results cannot publish into a replacement UI',async()=>{
 let release;const c=createOfflineDownloadsController(scope,{native:{version:1,offlineDownloads:true,request:()=>new Promise(r=>release=r)}});
 const first=c.download([{id:'one'}],{format:'raw',bitrate:0});assert.equal(c.getSnapshot().busy,true);
 assert.equal(await c.remove('one'),false);c.dispose();release(snapshot());assert.equal(await first,false);assert.deepEqual(c.getSnapshot().tracks,[]);
});
test('old shells expose no downloads and device profile offers only native supported formats',async()=>{
 let calls=0;const c=createOfflineDownloadsController(scope,{native:{version:1,request:()=>calls++}});await c.refresh();assert.equal(c.getSnapshot().supported,false);assert.equal(calls,0);
 const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},__nmAudioTransport:{audioFormats:['raw','mp3','opus']}};
 try{assert.deepEqual(downloadProfile(),{format:'raw',bitrate:192});saveDownloadProfile({format:'opus',bitrate:128});assert.deepEqual(downloadProfile(),{format:'opus',bitrate:128});window.__nmAudioTransport.audioFormats=['raw','mp3'];assert.equal(downloadProfile().format,'raw');}finally{delete globalThis.window;}
});
