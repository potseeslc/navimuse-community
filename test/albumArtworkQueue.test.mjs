import test from 'node:test';
import assert from 'node:assert/strict';
import {albumQueueItems,queueItem} from '../src/playerState.js';
import {buildPersistedQueueState,validatePersistedQueue} from '../src/queueStore.js';

test('album artwork survives track advance, shuffle selection and queue restore',()=>{
 const album={id:'surfer-rosa',name:'Surfer Rosa',artist:'Pixies',coverArt:'album-cover',song:[
  {id:'first',albumId:'surfer-rosa',coverArt:'track-cover'},
  {id:'second',albumId:'surfer-rosa'},
  {id:'third',albumId:'surfer-rosa',coverArt:'unavailable-track-cover'}
 ]};
 const entries=albumQueueItems(album);
 for(const index of [0,1,2,1]){
  assert.equal(entries[index].album.coverArt,'album-cover');
  assert.equal(entries[index].album.id,'surfer-rosa');assert.equal(entries[index].album.song,undefined);
 }
 assert.equal(album.song.length,3);assert.equal(album.song[2].coverArt,'unavailable-track-cover');
 const saved=buildPersistedQueueState({items:entries,index:1},[],[],{shuffle:false,repeat:false,pauseAfterCurrent:false},12);
 const restored=validatePersistedQueue(JSON.parse(JSON.stringify(saved)));
 assert.ok(restored);assert.equal(restored.items[2].album.coverArt,'album-cover');
 // Mixed playlists still retain each track's own album and cover.
 assert.equal(queueItem({id:'other',album:'Other album',coverArt:'other-cover'}).album.coverArt,'other-cover');
});
test('album queue omits invalid songs without copying the full track list into each entry',()=>{
 assert.deepEqual(albumQueueItems(null),[]);
 const songs=[{id:'first'},null,{}, {id:'selected'}];
 const entries=albumQueueItems({id:'album',song:songs});
 assert.deepEqual(entries.map(item=>item.song.id),['first','selected']);assert.equal(entries.findIndex(item=>item.song===songs[3]),1);
});
