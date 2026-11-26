import test from 'node:test';import assert from 'node:assert/strict';
import {downloadGroups} from '../src/downloadGroups.js';
import {createOfflineDownloadsController} from '../src/offlineDownloads.js';
test('album grouping separates album identities and restores disc/track order',()=>{
 const tracks=[{song:{id:'2',albumId:'a',album:'Same',track:2}},{song:{id:'1',albumId:'a',album:'Same',track:1}},{song:{id:'3',albumId:'b',album:'Same',track:1}}];
 const groups=downloadGroups(tracks);assert.equal(groups.length,2);assert.deepEqual(groups[0].tracks.map(t=>t.song.id),['1','2']);assert.equal(tracks[0].song.id,'2');
});
test('a download can belong to multiple playlists without duplicate media',()=>{
 const tracks=[{song:{id:'one',downloadCollections:[{id:'a',name:'Morning'},{id:'b',name:'Evening'}]}}];
 assert.deepEqual(downloadGroups(tracks,'playlists').map(g=>g.name),['Evening','Morning']);
});
test('playlist download carries bounded association request without mutating songs',async()=>{
 let request;const c=createOfflineDownloadsController('scope',{native:{version:1,offlineDownloads:true,request:async m=>{request=m;return true;}}});
 const song={id:'one'};await c.download([song],{format:'raw'},{kind:'playlist',id:'mix',name:'Mix'});
 assert.deepEqual(request.songs[0].downloadCollections,[{id:'mix',name:'Mix',position:0}]);assert.equal(song.downloadCollections,undefined);
 await c.preferences({budgetBytes:0,allowsCellular:false});assert.equal(request.action,'offline.status');
});
