import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderPlaylist} from '../src/playlists.js';
const entries=[{id:'a'},{id:'b'},{id:'a'}];
test('saved reorder preserves occurrences and accepts only the confirmed returned order',async()=>{
 const calls=[];
 const fetchFn=async(url,options)=>{calls.push({url,...options});return Response.json({playlist:{id:'p/q',entry:[entries[0],entries[2],entries[1]]}});};
 const result=await reorderPlaylist(fetchFn,'p/q',entries,2,1);
 assert.deepEqual(result.entry.map(x=>x.id),['a','a','b']);
 assert.equal(calls[0].url,'/api/navidrome/playlists/p%2Fq');
 assert.equal(calls[0].headers['x-requested-with'],'NaviMuse');
 assert.deepEqual(JSON.parse(calls[0].body),{reorder:{version:1,expectedSongIds:['a','b','a'],order:[0,2,1]}});
 assert.deepEqual(entries.map(x=>x.id),['a','b','a']);
});
test('invalid positions never write; rejected or unconfirmed reorder is not retried',async()=>{
 let calls=0;
 for(const [from,to] of [[-1,0],[0,3],[1,1],[0,1.5]]) {
  await assert.rejects(reorderPlaylist(async()=>{calls++;},'p',entries,from,to));
 }
 assert.equal(calls,0);
 for(const response of [Response.json({error:'Conflict'},{status:409}),Response.json({playlist:{id:'other',entry:entries}}),Response.json({playlist:{id:'p',entry:entries}})]) {
  calls=0;await assert.rejects(reorderPlaylist(async()=>{calls++;return response;},'p',entries,2,1));assert.equal(calls,1);
 }
});
