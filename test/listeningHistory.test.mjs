import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {openListeningHistory} from '../server/listeningHistory.mjs';
import {browserListeningTransport} from '../src/browserListeningReports.js';
import {createNativeListeningReporter} from '../src/nativeListeningReports.js';
const now=()=>Date.UTC(2026,8,19,18);const song={id:'s1',title:'One',artist:'Artist',album:'Album',albumId:'a1',coverArt:'cover',duration:240};
const event=(time=now()-1000)=>({id:randomUUID(),songId:'s1',time});
test('history is durable, idempotent and account isolated; metadata is sanitized',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nm-history-'));let store=openListeningHistory(dir,{now});try{
 const e=event();store.record('alice',e,{...song,password:'secret',streamUrl:'private'});store.record('alice',e,song);
 assert.equal(store.section('alice','recordings').items[0].count,1);assert.equal(store.section('bob','recent').items.length,0);
 assert.throws(()=>store.record('alice',{...e,time:e.time-1},song),{status:409});assert.throws(()=>store.record('alice',event(now()+999999),song),{status:400});
 store.close();assert.doesNotThrow(()=>store.close());store=openListeningHistory(dir,{now});assert.equal(store.has('alice',e),true);
 const recent=store.section('alice','recent');assert.equal(recent.items[0].song.streamUrl,undefined);assert.equal(recent.items[0].song.password,undefined);
 store.record('bob',e,song);assert.equal(store.section('alice','recent').items.length,1);assert.equal(store.section('bob','recent').items.length,1);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('UTC ranges, zero days, rankings and offline event times agree without external stats',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nm-history-')),store=openListeningHistory(dir,{now});try{
 for(const time of [Date.UTC(2026,7,31,23),Date.UTC(2026,8,1),Date.UTC(2026,8,18),Date.UTC(2026,8,19)])store.record('a',event(time),song);
 const monthly=store.section('a','listening-activity','this_month');assert.equal(monthly.total,3);assert.equal(monthly.items.length,19);assert.equal(monthly.items[1].count,0);assert.equal(monthly.items.reduce((s,r)=>s+r.count,0),3);
 assert.equal(store.section('a','artists','this_month').items[0].count,3);assert.equal(store.section('a','release-groups','this_month').items[0].albumId,'a1');assert.equal(store.section('a','recordings','this_week').total,2);
 assert.equal(store.section('a','listening-activity','all_time').total,4);assert.equal(store.section('a','recent').items.length,4);
 assert.throws(()=>store.section('a','wrong'),{status:400});assert.throws(()=>store.section('', 'recent'),{status:401});
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
function memoryStorage(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('browser outbox survives recreation, isolates users, and retries lost acknowledgements exactly once',async()=>{
 const storage=memoryStorage(),dir=await mkdtemp(join(tmpdir(),'nm-history-')),store=openListeningHistory(dir,{now});try{
 const e={...event(),scope:'a'};browserListeningTransport('a',storage).enqueue(e);browserListeningTransport('b',storage).enqueue({...e,scope:'b'});
 let lose=true;
 const reporter=createNativeListeningReporter({scope:'a',transport:browserListeningTransport('a',storage),fetchFn:async(_,options)=>{const r=JSON.parse(options.body);const receipt=store.record('a',r,song);if(lose)throw Error('Response lost');return {ok:true,json:async()=>receipt};}});
 await reporter.flush();assert.equal((await browserListeningTransport('a',storage).request({action:'listening.pending',scope:'a'})).length,1);
 lose=false;await reporter.flush();assert.equal(store.section('a','recent').items.length,1);assert.equal((await browserListeningTransport('a',storage).request({action:'listening.pending',scope:'a'})).length,0);assert.equal((await browserListeningTransport('b',storage).request({action:'listening.pending',scope:'b'})).length,1);reporter.stop();
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
