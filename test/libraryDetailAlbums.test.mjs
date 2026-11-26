import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryDetailAlbums, libraryGenres } from '../server/libraryDetailAlbums.js';

test('artist albums intersect selected folder and keep scanning through empty pages', async () => {
  const calls = [];
  const upstream = async (path, params) => {
    calls.push({ path, params });
    if (path.includes('getArtist')) return { artist: { album: [{ id: 'other-folder' }, { id: 'match' }] } };
    assert.equal(params.musicFolderId, 'selected');
    return { albumList2: { album: params.offset === '0' ? [{ id: 'unrelated' }] : [{ id: 'match' }] } };
  };
  const params = new URLSearchParams({ artistId: 'artist', musicFolderId: 'selected', limit: '1' });
  const first = await libraryDetailAlbums(upstream, params);
  assert.deepEqual(first.albums, []);
  assert.equal(first.page.nextOffset, 1);
  params.set('offset', '1');
  assert.deepEqual((await libraryDetailAlbums(upstream, params)).albums, [{ id: 'match' }]);
});

test('genre detail passes the folder and genre upstream and preserves pagination', async () => {
  const result = await libraryDetailAlbums(async (path, params) => {
    assert.equal(path, '/rest/getAlbumList2.view');
    assert.deepEqual(params, { type: 'byGenre', genre: 'Jazz & Blues', musicFolderId: '2', offset: '0', size: '2' });
    return { albumList2: { album: [{ id: 'one' }] } };
  }, new URLSearchParams({ genre: 'Jazz & Blues', musicFolderId: '2', limit: '2' }));
  assert.equal(result.page.nextOffset, null);
  assert.equal(result.albums.length, 1);
});

test('all-library artist detail pages actual artist membership', async () => {
  const result = await libraryDetailAlbums(async () => ({ artist: { album: [{ id: 'a' }, { id: 'b' }] } }), new URLSearchParams({ artistId: 'artist', limit: '1' }));
  assert.deepEqual(result.albums, [{ id: 'a' }]);
  assert.equal(result.page.nextOffset, 1);
});

test('ambiguous filters fail before upstream access', async () => {
  await assert.rejects(libraryDetailAlbums(() => assert.fail('upstream accessed'), new URLSearchParams({ artistId: 'a', genre: 'b' })), { status: 400 });
});


test('scoped genre overview agrees with detail membership and omits global counts', async () => {
  const genres = await libraryGenres(async (path, params) => {
    if (path.includes('getGenres')) return { genres: { genre: [{ value: 'Jazz', songCount: 900 }, { value: 'Rock', albumCount: 20 }] } };
    assert.equal(params.musicFolderId, 'selected');
    assert.equal(params.type, 'byGenre');
    assert.equal(params.size, '1');
    return { albumList2: { album: params.genre === 'Jazz' ? [{ id: 'a' }] : [] } };
  }, 'selected');
  assert.deepEqual(genres, { genres: [{ value: 'Jazz' }], page: { offset: 0, limit: 32, nextOffset: null } });
});

test('scoped genres bound membership probes and retain cursors through empty pages', async () => {
  const probes = [];
  const upstream = async (path, params) => {
    if (path.includes('getGenres')) return { genres: { genre: Array.from({length:70},(_,i)=>({value:`Genre ${i}`,albumCount:999})) } };
    probes.push(params.genre);
    return {albumList2:{album:params.genre === 'Genre 65' ? [{id:'match'}] : []}};
  };
  const first = await libraryGenres(upstream,'folder',new URLSearchParams({limit:'999'}));
  assert.equal(probes.length,32);
  assert.deepEqual(first,{genres:[],page:{offset:0,limit:32,nextOffset:32}});
  const second = await libraryGenres(upstream,'folder',new URLSearchParams({offset:'32'}));
  assert.equal(probes.length,64);
  assert.deepEqual(second,{genres:[],page:{offset:32,limit:32,nextOffset:64}});
  const last = await libraryGenres(upstream,'folder',new URLSearchParams({offset:'64'}));
  assert.deepEqual(last,{genres:[{value:'Genre 65'}],page:{offset:64,limit:32,nextOffset:null}});
  assert.equal(new Set(probes).size,70);
});

test('a scoped search avoids scanning when it proves every artist album belongs to the folder',async()=>{
 const calls=[];const upstream=async(path,params)=>{calls.push(path);if(path.includes('getArtist'))return {artist:{name:'Temple',album:[{id:'match'}]}};if(path.includes('search3')){assert.equal(params.musicFolderId,'7');return {searchResult3:{album:[{id:'match'}]}};}assert.fail('unrelated album scan');};
 const result=await libraryDetailAlbums(upstream,new URLSearchParams({artistId:'artist',musicFolderId:'7'}));assert.deepEqual(result.albums,[{id:'match'}]);assert.equal(result.page.nextOffset,null);assert.equal(calls.length,2);
});
test('incomplete search retains scoped scanning rather than hiding unmatched releases',async()=>{
 const upstream=async path=>path.includes('getArtist')?{artist:{name:'Artist',album:[{id:'outside'},{id:'compilation'}]}}:path.includes('search3')?{searchResult3:{album:[{id:'outside'}]}}:{albumList2:{album:[{id:'compilation'}]}};
 assert.deepEqual((await libraryDetailAlbums(upstream,new URLSearchParams({artistId:'artist',musicFolderId:'selected'}))).albums,[{id:'compilation'}]);
});

test('a scan cursor cannot switch to artist-list pagination if search later recovers',async()=>{
 const result=await libraryDetailAlbums(async(path,params)=>{if(path.includes('getArtist'))return {artist:{name:'Artist',album:[{id:'late'}]}};assert.equal(path,'/rest/getAlbumList2.view');assert.equal(params.offset,'500');return {albumList2:{album:[{id:'late'}]}};},new URLSearchParams({artistId:'artist',musicFolderId:'selected',offset:'500'}));
 assert.deepEqual(result.albums,[{id:'late'}]);assert.equal(result.page.nextOffset,null);
});
