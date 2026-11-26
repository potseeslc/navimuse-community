import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'navimuse-stream-details-'));
let server;
try {
 const wav=join(directory,'silence.wav'),aac=join(directory,'silence.aac'),binary=join(directory,'inspect'),opus=join(directory,'silence.ogg'),mp3=join(directory,'silence.mp3');
 const data=Buffer.alloc(44+44100*2*10);
 data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(44100,24);data.writeUInt32LE(88200,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);writeFileSync(wav,data);
 execFileSync('afconvert',['-f','adts','-d','aac','-b','128000',wav,aac],{stdio:'inherit'});
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',wav,'-c:a','libopus',opus],{stdio:'inherit'});
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',wav,'-c:a','libmp3lame',mp3],{stdio:'inherit'});
 const streams=[readFileSync(mp3),readFileSync(opus)];
 server=createServer((req,res)=>{
  const index=req.url.startsWith('/opus')?1:0,data=streams[index];
  res.writeHead(200,{'content-type':index?'audio/ogg':'audio/mpeg'});
  let offset=0;const timer=setInterval(()=>{if(offset>=data.length){clearInterval(timer);res.end();return;}res.write(data.subarray(offset,offset+1024));offset+=1024;},20);
  res.on('close',()=>clearInterval(timer));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin=`http://127.0.0.1:${server.address().port}`;
 const sdk=execFileSync('xcrun',['--sdk','iphonesimulator','--show-sdk-path'],{encoding:'utf8'}).trim();
 execFileSync('xcrun',['clang','-fobjc-arc','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,...['Foundation','AVFoundation','CoreMedia'].flatMap(f=>['-framework',f]),'test/fixtures/native-stream-details.m','-o',binary],{stdio:'inherit'});
 const result=await promisify(execFile)('xcrun',['simctl','spawn',process.argv[2]||'booted',binary,wav,aac,opus,origin+'/mp3?format=opus',origin+'/opus?format=mp3'],{timeout:60000});
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);
}finally{server?.closeAllConnections();server?.close();rmSync(directory,{recursive:true,force:true});}
