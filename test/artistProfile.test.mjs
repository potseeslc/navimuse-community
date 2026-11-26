import test from 'node:test';import assert from 'node:assert/strict';
import {artistProfile} from '../server/artistProfile.mjs';
test('artist profile retains first-party cover ID and filters popularity to this artist',async()=>{
 const calls=[];const value=await artistProfile(async(path,params)=>{calls.push([path,params]);return path.includes('getArtist.')?{artist:{id:'a',name:'Artist',coverArt:'ar-a'}}:{topSongs:{song:[{id:'1',artistId:'a',albumId:'one'},{id:'2',artistId:'other'},{id:'3',artist:'Artist'},{id:'1',artistId:'a'},{}]}};},'a');
 assert.equal(value.artist.coverArt,'ar-a');assert.deepEqual(value.popular.map(s=>s.id),['1','3']);assert.equal(value.popularAvailable,true);assert.equal(calls.find(([path])=>path.includes('getTopSongs'))[1].count,'20');
});
test('optional popularity failure cannot hide the artist and unknown artists do not query popularity',async()=>{
 const value=await artistProfile(async path=>{if(path.includes('getTopSongs'))throw Error('offline');return {artist:{id:'a',name:'Artist'}};},'a');assert.equal(value.artist.name,'Artist');assert.equal(value.popularAvailable,false);assert.deepEqual(value.popular,[]);
 let calls=0;await assert.rejects(artistProfile(async()=>{calls++;return {};},'missing'),e=>e.status===404);assert.equal(calls,1);
});

test('artist biography is optional plain text with an allowlisted source link',async()=>{
 const fetcher=async path=>path.includes('getArtist.view')?{artist:{id:'a',name:'Artist'}}:path.includes('getArtistInfo2')?{artistInfo2:{biography:'<p>Artist &amp; band</p><script>bad()</script><img src="https://example.com/track">',lastFmUrl:'https://www.last.fm/music/Artist'}}:{topSongs:{song:[]}};
 const result=await artistProfile(fetcher,'a');
 assert.deepEqual(result.biography,{text:'Artist & band',sourceUrl:'https://www.last.fm/music/Artist'});
 const unsafe=await artistProfile(async path=>path.includes('getArtistInfo2')?{artistInfo2:{biography:'A biography',lastFmUrl:'javascript:alert(1)'}}:fetcher(path),'a');
 assert.equal(unsafe.biography.sourceUrl,null);
 const failed=await artistProfile(async path=>{if(path.includes('getArtistInfo2'))throw Error('provider down');return fetcher(path);},'a');
 assert.equal(failed.biography,null);assert.equal(failed.popularAvailable,true);
});
