import test from 'node:test';
import assert from 'node:assert/strict';
import {searchLibrary} from '../server/librarySearch.js';

test('genre search matches names case-insensitively before folder checks and preserves ordinary results', async()=>{
 const calls=[];
 const fetch=async(path,params)=>{
  calls.push({path,params});
  if(path.includes('search3'))return {searchResult3:{song:[{id:'song'}]}};
  if(path.includes('getGenres'))return {genres:{genre:[...Array.from({length:40},(_,i)=>({value:`Other ${i}`})),{value:'Jazz Fusion',albumCount:99},{value:'Smooth Jazz'},{value:'Rock'}]}};
  assert.equal(params.musicFolderId,'mine');
  return {albumList2:{album:params.genre==='Jazz Fusion'?[{id:'album',coverArt:'cover'}]:[]}};
 };
 const result=await searchLibrary(fetch,new URLSearchParams({q:' JAZZ ',musicFolderId:'mine'}));
 assert.deepEqual(result.genres,[{value:'Jazz Fusion',coverArt:'cover'}]);
 assert.deepEqual(result.songs,[{id:'song'}]);
 assert.equal(calls.filter(c=>c.path.includes('getAlbumList2')).length,2,'only matching genre names need membership checks');
 assert.equal(calls[0].params.musicFolderId,'mine');
});

test('genre failures do not discard song matches, and short queries do not fetch',async()=>{
 const result=await searchLibrary(async path=>{
  if(path.includes('getGenres'))throw Error('unavailable');
  return {searchResult3:{song:[{id:'song'}]}};
 },new URLSearchParams({q:'rock'}));
 assert.equal(result.genresUnavailable,true);assert.equal(result.songs[0].id,'song');
 const empty=await searchLibrary(()=>assert.fail('must not fetch'),new URLSearchParams({q:'x'}));
 assert.deepEqual(empty.genres,[]);
});

test('a matching genre beyond an empty folder-membership page is still found',async()=>{
 const result=await searchLibrary(async(path,params)=>{
  if(path.includes('search3'))return {};
  if(path.includes('getGenres'))return {genres:{genre:Array.from({length:33},(_,i)=>({value:`Rock ${i}`}))}};
  return {albumList2:{album:params.genre==='Rock 32'?[{id:'mine'}]:[]}};
 },new URLSearchParams({q:'rock',musicFolderId:'mine'}));
 assert.deepEqual(result.genres,[{value:'Rock 32'}]);
});
