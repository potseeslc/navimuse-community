import test from 'node:test';
import assert from 'node:assert/strict';
import {shareTrackDetails} from '../src/shareTrack.js';
const data={title:'Song',text:'Song by Artist',url:'https://example.test/?track=song'};

test('canceling a native share produces no notice or clipboard fallback',async()=>{
 let copies=0;
 const notice=await shareTrackDetails({data,share:async()=>{throw Object.assign(Error('Dismissed'),{name:'AbortError'});},copy:async()=>{copies++;return true;}});
 assert.equal(notice,null);assert.equal(copies,0);
});

test('share success, copy fallback and actionable failures remain distinct',async()=>{
 assert.equal(await shareTrackDetails({data,share:async()=>{},copy:()=>assert.fail('Unneeded clipboard')}),'Shared from NaviMuse.');
 assert.equal(await shareTrackDetails({data,copy:async text=>{assert.equal(text,data.text+'\n'+data.url);return true;}}),'Track copied to clipboard.');
 assert.equal(await shareTrackDetails({data,share:async()=>{throw Error('Unavailable');},copy:async()=>false}),'Share failed. Copy this track: Song by Artist');
 assert.equal(await shareTrackDetails({data,copy:async()=>false}),'Copy this track: Song by Artist');
});

test('a completed share from an old track cannot report or fall back to copying',async()=>{
 for(const fails of [false,true]){
  let current=true,finish,copies=0;
  const pending=shareTrackDetails({data,isCurrent:()=>current,share:()=>new Promise((resolve,reject)=>{finish=()=>fails?reject(Error('Failed')):resolve();}),copy:async()=>{copies++;return true;}});
  current=false;finish();assert.equal(await pending,null);assert.equal(copies,0);
 }
});

test('a delayed clipboard result from an old track cannot overwrite its notice',async()=>{
 let current=true,finish;
 const pending=shareTrackDetails({data,isCurrent:()=>current,copy:()=>new Promise(resolve=>{finish=resolve;})});
 current=false;finish(true);assert.equal(await pending,null);
});
