import test from 'node:test';
import assert from 'node:assert/strict';
import {readHomeSnapshot,saveHomeSnapshot} from '../src/homeSnapshot.js';
import {scopedQueueStorage} from '../src/queueStorageScope.js';
const payload={musicFolders:[{id:'1',name:'Music'}],newestAlbums:[{id:'a',name:'Album',artist:'Artist',streamUrl:'secret',token:'secret'}],recentAlbums:[],randomAlbums:[],frequentAlbums:[]};
function backing(){const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),map};}
test('Home snapshots isolate verified account and library selection, expire and omit media URLs',()=>{
 const base=backing(),a=scopedQueueStorage(base,'queue-scope-v1:'+ 'a'.repeat(64)),b=scopedQueueStorage(base,'queue-scope-v1:'+ 'b'.repeat(64));
 assert.ok(saveHomeSnapshot(a,'1',payload,100));assert.equal(readHomeSnapshot(a,'1',101).newestAlbums[0].name,'Album');
 assert.equal(readHomeSnapshot(b,'1',101),null);assert.equal(readHomeSnapshot(a,'2',101),null);assert.equal(readHomeSnapshot(a,'1',100+8*86400000),null);assert.equal(readHomeSnapshot(a,'1',99),null);
 assert.ok(![...base.map.values()][0].includes('secret'));
});
test('unavailable, corrupt and oversized persistence never prevents live Home loading',()=>{
 assert.equal(saveHomeSnapshot(null,'1',payload),false);assert.equal(readHomeSnapshot(null,'1'),null);
 assert.equal(saveHomeSnapshot({setItem(){throw Error('Quota');}},'1',payload),false);
 for(const raw of ['{','x'.repeat(200001),'null','{"version":1}'])assert.equal(readHomeSnapshot({getItem:()=>raw},'1'),null);
 assert.equal(saveHomeSnapshot(backing(),'1',{}),false);
});
