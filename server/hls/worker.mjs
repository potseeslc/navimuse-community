// Internal-only, credential-free packaging service. No arbitrary source URLs.
import {createServer} from 'node:http';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,rm,readdir,stat,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {spawn} from 'node:child_process';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const mediaPath=/^(?:master\.m3u8|[012]\/(?:index\.m3u8|init_?[012]?\.mp4|seg\d+\.m4s))$/;
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
export async function validateDuration(dir,expected){
 if(!Number.isFinite(expected)||expected<=0||expected>1800)throw Error('Invalid duration');
 for(const v of ['0','1','2']){const text=await readFile(join(dir,v,'index.m3u8'),'utf8');const actual=[...text.matchAll(/#EXTINF:([0-9.]+)/g)].reduce((n,x)=>n+Number(x[1]),0);if(!text.includes('#EXT-X-ENDLIST')||!Number.isFinite(actual)||Math.abs(actual-expected)>Math.max(3,expected*.02))throw Error('Incomplete audio');}
}
async function bytesIn(dir){let total=0;for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);total+=e.isDirectory()?await bytesIn(p):(await stat(p)).size;}return total;}
export async function encode(source,dir,{signal,ffmpeg='ffmpeg'}={}){
 const args=['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-format_whitelist','aac,flac,mp3,mov,ogg,wav,aiff,ape,asf,matroska','-i',source,'-filter_complex_threads','1','-filter_complex','[0:a:0]asplit=3[a0][a1][a2]'];
 for(const [i,rate] of [64,128,256].entries())args.push('-map',`[a${i}]`,`-c:a:${i}`,'aac',`-b:a:${i}`,`${rate}k`,`-ar:a:${i}`,'48000',`-ac:a:${i}`,'2');
 args.push('-var_stream_map','a:0 a:1 a:2','-f','hls','-hls_time','4','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_flags','temp_file','-master_pl_name','master.m3u8','-hls_segment_filename',join(dir,'%v','seg%05d.m4s'),join(dir,'%v','index.m3u8'));
 await new Promise((ok,fail)=>{const child=spawn(ffmpeg,args,{stdio:'ignore',signal});child.on('error',fail);child.on('exit',code=>code===0?ok():fail(new Error('Packaging failed')));});
 // Never expose partial output. Require finite complete playlists and all referenced files.
 for(const v of ['0','1','2']){
  const text=await readFile(join(dir,v,'index.m3u8'),'utf8');
  if(!text.includes('#EXT-X-ENDLIST')||!text.includes('#EXTINF:'))throw Error('Incomplete playlist');
  const refs=[...text.matchAll(/URI="([^"]+)"/g)].map(x=>x[1]).concat(text.split('\n').filter(x=>x&&!x.startsWith('#')));
  for(const f of refs){if(!mediaPath.test(`${v}/${f}`)||(await stat(join(dir,v,f))).size===0)throw Error('Invalid segment');}
 }
}
export async function createHlsWorker({directory,token,encoder=encode,maxJobs=2,maxJobBytes=256*1024**2,maxCacheBytes=2*1024**3,jobTimeoutMs=120000,ttlMs=6*3600000}={}){
 if(!token||token.length<32||!Number.isInteger(maxJobs)||maxJobs<1||maxJobs>8||!Number.isSafeInteger(maxJobBytes)||!Number.isSafeInteger(maxCacheBytes)||maxJobBytes<1024||maxCacheBytes<maxJobBytes*maxJobs)throw Error('Invalid HLS worker configuration');
 const root=resolve(directory);await mkdir(root,{recursive:true,mode:0o700});
 // This dedicated volume contains disposable media only. Sessions do not survive restart.
 for(const entry of await readdir(root))if(/^[a-f0-9]{64}$/.test(entry))await rm(join(root,entry),{recursive:true,force:true});
 const jobs=new Map();let active=0;
 const key=Buffer.from(`Bearer ${token}`);
 async function sweep(reserve=0){
  let used=[...jobs.values()].reduce((n,j)=>n+(j.state==='preparing'?maxJobBytes:j.bytes||0),0);
  for(const [id,j] of [...jobs].sort((a,b)=>a[1].used-b[1].used)){
   if(j.state==='preparing'||j.readers)continue;
   // Never evict media used in the last minute, including between segment requests.
   if(Date.now()-j.used<60000 && j.state==='ready')continue;
   if(Date.now()-j.used>ttlMs||used+reserve>maxCacheBytes||j.state==='failed'){
    await rm(j.dir,{recursive:true,force:true});jobs.delete(id);used-=j.bytes||0;
   }
  }
  return used+reserve<=maxCacheBytes;
 }
 let admission=Promise.resolve();
 const server=createServer(async(req,res)=>{
  const supplied=Buffer.from(req.headers.authorization||'');if(supplied.length!==key.length||!timingSafeEqual(supplied,key)){json(res,401,{error:'Unauthorized'});return;}
  const path=new URL(req.url,'http://worker').pathname;
  if(path==='/health'&&req.method==='GET'){json(res,200,{ok:true,active,jobs:jobs.size});return;}
  const m=path.match(/^\/jobs\/([a-f0-9]{64})(?:\/(.+))?$/);if(!m){json(res,404,{error:'Not found'});return;}
  const [,id,file]=m;
  try{
   if(req.method==='POST'&&!file){
    const expected=Number(req.headers['x-hls-duration']);if(!Number.isFinite(expected)||expected<=0||expected>1800){json(res,400,{error:'Invalid duration'});req.resume();return;}
    // Serialize admission only; uploads and encoders execute concurrently within the cap.
    const admitted=await(admission=admission.catch(()=>{}).then(async()=>{
     const existing=jobs.get(id);if(existing&&existing.state!=='failed')return {existing};
     if(active>=maxJobs||!await sweep(maxJobBytes))return null;
     const job={state:'preparing',dir:join(root,id),used:Date.now(),bytes:0,readers:0,abort:new AbortController()};jobs.set(id,job);active++;return {job};
    }));
    if(!admitted){json(res,429,{error:'Capacity unavailable'});req.resume();return;}
    if(admitted.existing){json(res,200,{state:admitted.existing.state});req.resume();return;}
    const job=admitted.job;let input=0;
    const timer=setTimeout(()=>job.abort.abort(),jobTimeoutMs);
    const monitor=setInterval(()=>{void bytesIn(job.dir).then(n=>{if(n>maxJobBytes)job.abort.abort();}).catch(()=>{});},250);
    try{
     await mkdir(job.dir,{recursive:true,mode:0o700});const source=join(job.dir,'source');
     await pipeline(req,new Transform({transform(chunk,_,cb){input+=chunk.length;cb(input>maxJobBytes/2?Error('Input limit'):null,chunk);}}),createWriteStream(source,{mode:0o600}),{signal:job.abort.signal});
     await encoder(source,job.dir,{signal:job.abort.signal});await validateDuration(job.dir,expected);await rm(source);job.bytes=await bytesIn(job.dir);
     if(job.abort.signal.aborted||job.bytes>maxJobBytes/2)throw Error('Output limit');
     job.state='ready';job.used=Date.now();json(res,200,{state:'ready'});
    }catch{job.state='failed';await rm(job.dir,{recursive:true,force:true});if(!res.destroyed)json(res,502,{error:'Packaging unavailable'});}
    finally{clearTimeout(timer);clearInterval(monitor);active--;}
    return;
   }
   const job=jobs.get(id);if(!job){json(res,404,{error:'Expired'});return;}
   if(req.method!=='GET'){json(res,405,{error:'Method not allowed'});return;}
   if(!file){json(res,200,{state:job.state});return;}
   if(job.state!=='ready'||!mediaPath.test(file)){json(res,404,{error:'Not ready'});return;}
   job.used=Date.now();job.readers++;let finished=false;
   const release=()=>{if(!finished){finished=true;job.readers--;}};res.once('close',release);
   const body=await readFile(join(job.dir,file));res.writeHead(200,{'content-type':file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'audio/mp4','content-length':body.length,'cache-control':'no-store'});res.end(body);
  }catch{if(!res.headersSent)json(res,503,{error:'HLS unavailable'});else res.destroy();}
 });
 const cleanup=setInterval(()=>{admission=admission.catch(()=>{}).then(()=>sweep());},60000);cleanup.unref();
 server.on('close',()=>{clearInterval(cleanup);for(const j of jobs.values())j.abort?.abort();});return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const token=process.env.HLS_WORKER_TOKEN_FILE?(await readFile(process.env.HLS_WORKER_TOKEN_FILE,'utf8')).trim():process.env.HLS_WORKER_TOKEN;
 const server=await createHlsWorker({directory:process.env.HLS_CACHE_DIR||'/cache',token,maxJobs:Number(process.env.HLS_MAX_JOBS||2),maxCacheBytes:Number(process.env.HLS_CACHE_BYTES||2*1024**3)});
 server.listen(Number(process.env.PORT||8100),'0.0.0.0');
}
