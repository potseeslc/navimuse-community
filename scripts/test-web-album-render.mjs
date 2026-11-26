// Actual browser offline rendering. No audible output or user browser session.
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=process.cwd(),profile=await mkdtemp(join(tmpdir(),'nm-gapless-chrome-'));
const html=`<!doctype html><body>RUNNING<script type="module">
import {WebAlbumAudio} from '/src/webAlbumAudio.js';
try {
 for(const sampleRate of [44100,48000]){
  const frames=sampleRate*2+137,split=sampleRate+79;
  const ctx=new OfflineAudioContext(2,frames,sampleRate),first=ctx.createBuffer(2,split,sampleRate),second=ctx.createBuffer(2,frames-split,sampleRate);
  const reference=Float32Array.from({length:frames},(_,i)=>Math.sin(i*.031)*.25);
  for(let c=0;c<2;c++){first.copyToChannel(reference.subarray(0,split),c);second.copyToChannel(reference.subarray(split),c);}
  const media=document.createElement('audio'),deck=new WebAlbumAudio(media);
  const clock={get currentTime(){return ctx.currentTime},sampleRate,createBufferSource:()=>ctx.createBufferSource(),resume:async()=>{}};
  deck.setPCMOutput(clock,ctx.destination);deck.mode=true;deck.buffer=first;deck.decode=async()=>second;deck._src='/first';
  await deck.play();await deck.prepareAlbum({token:'proof',entries:[{queueItemId:'second',url:'/second'}]});
  const result=await ctx.startRendering();
  for(let c=0;c<2;c++){const samples=result.getChannelData(c);for(let i=0;i<frames;i++)if(Math.abs(samples[i]-reference[i])>1e-7)throw Error('Sample mismatch at '+sampleRate+':'+i+' actual='+samples[i]+' expected='+reference[i]+' neighboring='+JSON.stringify(Array.from(samples.slice(i-2,i+3))));}
  deck.dispose();
 }
 document.body.textContent='PASS: exact PCM boundary at 44100 and 48000 Hz';
} catch(error){document.body.textContent='FAIL: '+error.stack;}
await fetch('/result',{method:'POST',body:document.body.textContent});
</script>`;
let finish;const outcome=new Promise(resolve=>finish=resolve);
const server=createServer(async(req,res)=>{try{if(req.url==='/result'){let body='';for await(const c of req)body+=c;if(body.length>8000)throw Error('Large result');res.end('ok');finish(body);return;}if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);return;}if(!['/src/webAlbumAudio.js','/src/albumPlayback.js','/src/playbackTransitions.js'].includes(req.url)){res.writeHead(404).end();return;}res.setHeader('content-type','text/javascript');res.end(await readFile(resolve(root,'.'+req.url)));}catch{res.writeHead(500).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 const child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-mock-keychain','--password-store=basic','--disable-gpu','--no-first-run','--disable-background-networking','--user-data-dir='+profile,`http://127.0.0.1:${server.address().port}/`],{stdio:'ignore'});
 let timer;try{
  const output=await Promise.race([outcome,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser render timed out')),20000);child.on('error',reject);})]);
  if(!output.startsWith('PASS:'))throw Error(output);console.log(output);
 }finally{clearTimeout(timer);child.kill();await new Promise(r=>child.once('exit',r));}

}finally{server.closeAllConnections();server.close();await rm(profile,{recursive:true,force:true});}
