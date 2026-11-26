import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalNavidromeId as canonical,canonicalNavidromeParams,usesCanonicalNavidromeIds,navidromeIdPolicy,navidromeSongForReference} from '../server/navidromeIds.mjs';
import {createNavidromeClient} from '../server/navidromeClient.mjs';

const old='0123456789abcdef0123456789abcdef',current='0296TIIbB3u904riPYGPJJ';
const config={url:'http://fixture.test/music',username:'listener',password:'fixture'};
const envelope=(serverVersion='0.64.0',extra={})=>({'subsonic-response':{status:'ok',type:'navidrome',serverVersion,...extra}});
test('canonical conversion preserves 128-bit values, UUIDs, and overflowing nanoids',()=>{
  assert.equal(canonical(old),current);
  assert.equal(canonical('01234567-89ab-cdef-0123-456789abcdef'),current);
  assert.equal(canonical('ffffffffffffffffffffffffffffffff'),'7N42dgm5tFLK9N8MT7fHC7');
  assert.equal(canonical('00000000000000000000000000000000'),'0'.repeat(22));
  assert.equal(canonical('Z'.repeat(22)),'2M034N7SJ2GTCQrEWb2ZmX');
  assert.equal(canonical('z'.repeat(22)),'3LyqmwQBm5IRqlVjNYASwb');
  for(const value of [current,'7N42dgm5tFLK9N8MT7fHC7','radio:station','short-id','_'.repeat(22),'g'.repeat(32),'',null])assert.equal(canonical(value),value);
});
test('conversion is limited to ID fields and retains playlist duplicate occurrences',()=>{
  const params={playlistId:old,songId:[old,old],songIdToAdd:[old],songIndexToRemove:[0,2],musicFolderId:old,name:old,query:old};
  assert.deepEqual(canonicalNavidromeParams('/rest/createPlaylist.view',params),{...params,playlistId:current,songId:[current,current],songIdToAdd:[current]});
  assert.equal(canonicalNavidromeParams('/rest/getCoverArt.view',{id:'al-'+old}).id,'al-'+current);
  assert.equal(canonicalNavidromeParams('/rest/getCoverArt.view',{id:'ra-'+old}).id,'ra-'+current);
  assert.equal(canonicalNavidromeParams('/rest/getCoverArt.view',{id:'ra-somafm-bootliquor_6a551317'}).id,'ra-somafm-bootliquor_6a551317');
  assert.equal(params.playlistId,old);
});
test('frozen Atlas and UPnP queues retain exact requested identity only for proven aliases',()=>{
  const response=envelope('0.64.0',{song:{id:current,title:'Fixture'}})['subsonic-response'];
  assert.equal(navidromeSongForReference(response,old).id,old);
  assert.equal(navidromeSongForReference(response,current).id,current);
  assert.equal(navidromeSongForReference(response,'another-track').id,current);
  assert.equal(navidromeSongForReference({...response,serverVersion:'0.63.2'},old).id,current);
  assert.equal(response.song.id,current);
});
test('format detection requires an authenticated Navidrome envelope',()=>{
  for(const version of ['0.64.0','0.64.1','0.65.0-beta.1','1.0.0'])assert.equal(usesCanonicalNavidromeIds(envelope(version)['subsonic-response']),true);
  for(const value of [{},{status:'ok',version:'1.16.1'},...['0.63.2','nonsense'].map(v=>envelope(v)['subsonic-response']),{...envelope()['subsonic-response'],type:'other'},{...envelope()['subsonic-response'],status:'failed'}])assert.equal(usesCanonicalNavidromeIds(value),false);
});
test('old queued tracks, cached mix tracks, artwork, feedback and playlist writes use migrated IDs',async()=>{
  const calls=[];
  const fetchImpl=async(input,options)=>{
    const url=new URL(input),params=options.body?new URLSearchParams(options.body):url.searchParams;
    calls.push({url,params,options});return Response.json(envelope());
  };
  const client=createNavidromeClient(config,{fetchImpl});
  for(const path of ['getSong','stream','getLyricsBySongId','star','unstar','setRating','scrobble']) {
    const result=await client.request(`/rest/${path}.view`,{id:old},{...(path==='stream'?{formatJson:false,headers:{Range:'bytes=0-127'}}:{})});await result.body.cancel();
    assert.equal(calls.at(-1).params.get('id'),current);
  }
  await (await client.request('/rest/getCoverArt.view',{id:'al-'+old})).body.cancel();
  assert.equal(calls.at(-1).params.get('id'),'al-'+current);
  await (await client.request('/rest/createPlaylist.view',{playlistId:old,songId:[old,old],name:old},{formPost:true})).body.cancel();
  const write=calls.at(-1);assert.equal(write.options.method,'POST');assert.equal(write.url.search,'');
  assert.deepEqual(write.params.getAll('songId'),[current,current]);assert.equal(write.params.get('name'),old);
  assert.equal(calls.filter(c=>c.url.pathname.endsWith('/ping.view')).length,1);
  const media=calls.find(c=>c.url.pathname.endsWith('/stream.view'));assert.equal(media.options.headers.Range,'bytes=0-127');
  assert.equal(media.params.has('f'),false);
});
test('0.63, unrecognized servers, failed authentication and failed probes never rewrite IDs',async()=>{
  for(const reply of [envelope('0.63.2'),envelope('0.64.0',{type:'other'}),envelope('0.64.0',{status:'failed',error:{code:40}}),null]) {
    const seen=[];const client=createNavidromeClient(config,{fetchImpl:async url=>{
      const target=new URL(url);seen.push(target);
      if(target.pathname.endsWith('/ping.view')&&!reply)throw Error('private upstream failure');
      return Response.json(reply||{});
    }});
    await (await client.request('/rest/getSong.view',{id:old})).body.cancel();
    assert.equal(seen.at(-1).searchParams.get('id'),old);
  }
});
test('shared probes are isolated by server and credential, and refresh across upgrade/rollback',async()=>{
  let now=0,version='0.63.2',probes=0;const fetchImpl=()=>{};
  const a=navidromeIdPolicy(config,fetchImpl,{now:()=>now});
  const same=navidromeIdPolicy(config,fetchImpl,{now:()=>now});
  const other=navidromeIdPolicy({...config,username:'other'},fetchImpl,{now:()=>now});
  const probe=async()=>{probes++;return envelope(version)['subsonic-response'];};
  assert.deepEqual(await Promise.all([a(probe),same(probe)]),[false,false]);assert.equal(probes,1);
  version='0.64.0';assert.equal(await other(probe),true);assert.equal(await a(probe),false);
  now=5001;assert.equal(await a(probe),true);
  version='0.63.2';now=35002;assert.equal(await a(probe),false);
});
test('cancelled callers cannot cancel another listener of the same probe',async()=>{
  const policy=navidromeIdPolicy(config,()=>{});let finish;
  const probe=()=>new Promise(resolve=>{finish=resolve;});
  const abort=new AbortController();const first=policy(probe,abort.signal),second=policy(probe);
  abort.abort();await assert.rejects(first);finish(envelope()['subsonic-response']);assert.equal(await second,true);
});
test('unchanged IDs add no network probe; malformed requests reject before probing',async()=>{
  let calls=0;const client=createNavidromeClient(config,{fetchImpl:async()=>{calls++;return Response.json(envelope());}});
  await (await client.request('/rest/stream.view',{id:current},{formatJson:false})).body.cancel();assert.equal(calls,1);
  await assert.rejects(client.request('/rest/getSong.view',{id:old,u:'override'}));assert.equal(calls,1);
});
