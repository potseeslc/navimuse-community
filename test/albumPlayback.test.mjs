import test from 'node:test';
import assert from 'node:assert/strict';
import {albumRun,albumHandoffIndex} from '../src/albumPlayback.js';
const item=(n,album='a')=>({queueItemId:'occurrence-'+n,song:{id:'song-'+n,albumId:album,track:n,discNumber:1}});
const queue={index:0,items:[item(1),item(2),item(3),item(4,'b')]};
test('reserve consecutive authored album boundaries without crossing albums or controls',()=>{
 assert.deepEqual(albumRun(queue,{},true).map(i=>i.song.track),[1,2,3]);
 for(const controls of [{shuffle:true},{repeat:true},{pauseAfterCurrent:true},{continueThroughQueue:false}])assert.deepEqual(albumRun(queue,controls,true),[]);
 assert.deepEqual(albumRun(queue,{},false),[]);
 assert.deepEqual(albumRun({...queue,items:[item(1),item(3)]},{},true),[]);
 assert.equal(albumRun(queue,{},true,2).length,2);
});
test('native background receipt can reconcile several observed boundaries once, but never a stale queue',()=>{
 const reservation={token:'load-a',items:queue.items.slice(0,3)};
 const event={token:'load-a',queueItemId:'occurrence-3'};
 assert.equal(albumHandoffIndex(queue,reservation,event),2);
 assert.equal(albumHandoffIndex({...queue,index:2},reservation,event),-1);
 assert.equal(albumHandoffIndex(queue,reservation,{...event,token:'stale'}),-1);
 assert.equal(albumHandoffIndex({...queue,items:[item(1),item(99),item(3)]},reservation,event),-1);
});
