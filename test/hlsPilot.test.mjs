import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {createHlsWorker} from '../server/hls/worker.mjs';
import {createHlsService,rewritePlaylist} from '../server/hls/service.mjs';
const token='test-worker-secret-'.repeat(3),headers={authorization:`Bearer ${token}`,'x-hls-duration':'9'};
async function worker(t,options={}){const dir=await mkdtemp(join(tmpdir(),'nm-hls-'));const server=await createHlsWorker({directory:dir,token,...options});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});return {dir,url:`http://127.0.0.1:${server.address().port}`};}
const key='a'.repeat(64);
test('worker rejects unauthenticated reads and bounds concurrent work',async t=>{
 let release;const wait=new Promise(r=>release=r);const w=await worker(t,{maxJobs:1,encoder:()=>wait});
 assert.equal((await fetch(w.url+'/health')).status,401);
 const first=fetch(w.url+'/jobs/'+key,{method:'POST',headers,body:'fixture'});
 for(let i=0;i<30;i++){const r=await fetch(w.url+'/jobs/'+key,{headers});if(r.ok)break;await new Promise(r=>setTimeout(r,5));}
 const busy=await fetch(w.url+'/jobs/'+'b'.repeat(64),{method:'POST',headers,body:'fixture'});assert.equal(busy.status,429);
 assert.equal((await fetch(w.url+'/jobs/'+key+'/master.m3u8',{headers})).status,404,'partial output never served');
 release();await first;
});
test('playlist rewriting carries account scope to all relative child requests',()=>{
 assert.equal(rewritePlaylist('#EXTM3U\n#EXT-X-MAP:URI="init_0.mp4"\nseg00001.m4s\n','scope:a'),'#EXTM3U\n#EXT-X-MAP:URI="init_0.mp4?accountScope=scope%3Aa"\nseg00001.m4s?accountScope=scope%3Aa\n');
 for(const uri of ['https://evil.example/a','../source','/secret','seg00001.m4s?token=foo'])assert.throws(()=>rewritePlaylist('#EXTM3U\n'+uri,'a'));
});
test('disabled/unlisted accounts never contact a worker or upstream',async()=>{
 const fail=()=>{throw Error('unexpected network');};
 for(const enabled of [false,true]){const service=createHlsService({enabled,workerUrl:'http://worker',token,allowScopes:[],songFor:fail,fetchImpl:fail});assert.deepEqual(await service.prepare({scope:'a'},'track'),{state:'disabled'});}
});
test('ready sessions are scoped, expire, reauthorize library access and rewrite manifests',async()=>{
 let time=1,authorized=true,calls=0;
 const service=createHlsService({enabled:true,workerUrl:'http://worker',token,allowScopes:['a','b'],now:()=>time,sessionMs:1000,
  songFor:async()=>{calls++;if(!authorized)throw Error('Revoked');return {duration:12,size:1000};},
  fetchImpl:async url=>new Response(String(url).endsWith('master.m3u8')?'#EXTM3U\n0/index.m3u8\n':JSON.stringify({state:'ready'}))});
 const ready=await service.prepare({scope:'a'},'song');const sid=ready.url.split('/')[5].split('?')[0];
 assert.equal((await service.media({scope:'b'},sid,'master.m3u8')),null);
 assert.equal((await service.media({scope:'a',binding:'changed'},sid,'master.m3u8')),null);
 assert.equal((await service.media({scope:'a'},sid,'../source')),null);
 const media=await service.media({scope:'a'},sid,'master.m3u8');assert.match(media.body.toString(),/accountScope=a/);assert.equal(calls,2);
 authorized=false;await assert.rejects(service.media({scope:'a'},sid,'master.m3u8'));
 time=1002;assert.equal(await service.media({scope:'a'},sid,'master.m3u8'),null);
});
test('real FFmpeg worker packages an original input; BFF serves only completed HLS',async t=>{
 // Integration is mandatory on the release host; CI without ffmpeg may explicitly skip.
 try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{t.skip('ffmpeg not installed');return;}
 const w=await worker(t);const input=join(w.dir,'fixture.wav');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=9','-ac','2',input]);
 const bytes=await readFile(input);let upstream=0;
 const service=createHlsService({enabled:true,workerUrl:w.url,token,allowScopes:['a'],songFor:async()=>({duration:9,size:bytes.length}),requestFor:async(principal,path,params)=>{assert.equal(principal.scope,'a');assert.equal(params.format,'raw');upstream++;return new Response(bytes,{headers:{'content-type':'audio/wav'}});}});t.after(()=>service.close());
 let state=await service.prepare({scope:'a'},'track');assert.equal(state.state,'preparing');
 for(let i=0;i<100 && state.state!=='ready';i++){await new Promise(r=>setTimeout(r,30));state=await service.prepare({scope:'a'},'track');}
 assert.equal(state.state,'ready');assert.equal(upstream,1,'in-flight jobs deduplicated');
 const sid=state.url.split('/')[5];const master=await service.media({scope:'a'},sid,'master.m3u8');assert.match(master.body.toString(),/CODECS="mp4a.40.2"/);
 for(const v of ['0','1','2']){
  const playlist=await service.media({scope:'a'},sid,`${v}/index.m3u8`);assert.match(playlist.body.toString(),/#EXT-X-ENDLIST/);
  const names=[...playlist.body.toString().matchAll(/(?:URI="|\n)([^#\n"]+\.(?:mp4|m4s))\?/g)].map(x=>x[1]);assert.ok(names.length>1);
  for(const name of names)assert.ok((await service.media({scope:'a'},sid,`${v}/${name}`)).body.length>0);
 }
});

test('worker rejects completed output whose duration is shorter than the track',async t=>{
 const w=await worker(t,{encoder:async(_,dir)=>{for(const v of ['0','1','2']){await (await import('node:fs/promises')).mkdir(join(dir,v));await writeFile(join(dir,v,'index.m3u8'),'#EXTM3U\n#EXTINF:2.0,\nseg00000.m4s\n#EXT-X-ENDLIST\n');}}});
 const response=await fetch(w.url+'/jobs/'+key,{method:'POST',headers,body:'fixture'});assert.equal(response.status,502);
 assert.equal((await fetch(w.url+'/jobs/'+key+'/0/index.m3u8',{headers})).status,404);
});
test('worker aborts jobs exceeding input limits',async t=>{
 const w=await worker(t,{maxJobBytes:2048,maxCacheBytes:8192,encoder:()=>{throw Error('Must not encode oversized input');}});
 await fetch(w.url+'/jobs/'+key,{method:'POST',headers,body:Buffer.alloc(2048)}).catch(()=>{});
 const state=await (await fetch(w.url+'/jobs/'+key,{headers})).json();assert.equal(state.state,'failed');
});

test('simultaneous prepare requests reserve only one upstream packaging job',async()=>{
 let uploads=0,release;const source=new Promise(r=>release=r);
 const service=createHlsService({enabled:true,workerUrl:'http://worker',token,allowScopes:['a'],songFor:async()=>({duration:9,size:1000}),
  requestFor:()=>{uploads++;return source;},fetchImpl:async(_url,options)=>options.method==='POST'?Response.json({state:'ready'}):new Response('',{status:404})});
 try{const results=await Promise.all(Array.from({length:8},()=>service.prepare({scope:'a'},'song')));assert.ok(results.every(x=>x.state==='preparing'));assert.equal(uploads,1);}
 finally{release(new Response('audio',{headers:{'content-type':'audio/wav'}}));await service.close();}
});
