// Isolated real worker -> scoped proxy -> real simulator AVPlayer. No live accounts.
import {createHlsWorker} from '../server/hls/worker.mjs';
import {createHlsService} from '../server/hls/service.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createServer} from 'node:http';import {once} from 'node:events';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile),dir=await mkdtemp(join(tmpdir(),'nm-hls-native-')),token='fixture-shared-token-'.repeat(3);
let worker,proxy,service;const seen=[];
try{
 const input=join(dir,'source.wav');await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=24','-ac','2',input]);
 const bytes=await readFile(input);worker=await createHlsWorker({directory:join(dir,'cache'),token});worker.listen(0,'127.0.0.1');await once(worker,'listening');
 service=createHlsService({enabled:true,workerUrl:`http://127.0.0.1:${worker.address().port}`,token,allowScopes:['scope'],songFor:async()=>({duration:24,size:bytes.length}),requestFor:async()=>new Response(bytes,{headers:{'content-type':'audio/wav'}})});
 let ready=await service.prepare({scope:'scope'},'song');
 for(let i=0;i<100&&ready.state!=='ready';i++){await new Promise(r=>setTimeout(r,50));ready=await service.prepare({scope:'scope'},'song');}assert.equal(ready.state,'ready');
 proxy=createServer(async(req,res)=>{
  try{const u=new URL(req.url,'http://local');const authorized=req.headers.cookie?.includes('navimuse_session=fixture')&&u.searchParams.get('accountScope')==='scope';
   seen.push({path:u.pathname,authorized});if(!authorized){res.writeHead(401);res.end();return;}
   const match=u.pathname.match(/^\/api\/navidrome\/hls\/sessions\/([a-f0-9]{48})\/(.+)$/);const media=match&&await service.media({scope:'scope'},match[1],match[2]);
   if(!media){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':media.type,'content-length':media.body.length,'cache-control':'no-store'});res.end(media.body);
  }catch{res.writeHead(503);res.end();}
 });proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
 const sdk=(await exec('xcrun',['--sdk','iphonesimulator','--show-sdk-path'])).stdout.trim(),binary=join(dir,'probe');
 await exec('xcrun',['clang','-fobjc-arc','-Werror','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,'-framework','Foundation','-framework','AVFoundation','-framework','CoreMedia','test/fixtures/native-hls-playback.m','-o',binary]);
 const result=await exec('xcrun',['simctl','spawn',process.argv[2]||'booted',binary,`http://127.0.0.1:${proxy.address().port}${ready.url}`],{timeout:25000});
 assert.match(result.stdout,/PASS:/);assert.ok(seen.some(x=>x.path.endsWith('.m4s')));assert.ok(seen.every(x=>x.authorized));console.log(result.stdout.trim());console.log(`PASS: first-party cookie and account scope present on all ${seen.length} manifest/segment requests`);
}finally{await service?.close();for(const s of [proxy,worker])if(s){s.closeAllConnections();await new Promise(r=>s.close(r));}await rm(dir,{recursive:true,force:true});}
