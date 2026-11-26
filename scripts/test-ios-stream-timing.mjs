import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';import {createServer} from 'node:http';import {once} from 'node:events';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'nm-stream-timing-'));
let server;
try{
 const audio=process.argv[2]||join(dir,'vbr.opus');
 if(!process.argv[2])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','aevalsrc=if(lt(mod(t\\,60)\\,30)\\,0\\,0.1*sin(440*2*PI*t)):s=48000:d=180','-c:a','libopus','-b:a','128k',audio]);
 const expected=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audio],{encoding:'utf8'}));
 const source=join(dir,'timing.m');writeFileSync(source,`#import "${resolve('src-tauri/ios/stream-timing.h')}"
#include <assert.h>
int main(int argc,const char **argv){@autoreleasepool{
 NSString *input=[NSString stringWithUTF8String:argv[1]];NSURL *url=[input hasPrefix:@"http:"]?[NSURL URLWithString:input]:[NSURL fileURLWithPath:input];
 for(int i=0;i<2;i++){
 AVURLAsset *asset=i?NMPlaybackAsset(url,@{}):[AVURLAsset URLAssetWithURL:url options:nil];
 __block BOOL done=NO;[asset loadValuesAsynchronouslyForKeys:@[@"duration",@"playable"] completionHandler:^{dispatch_async(dispatch_get_main_queue(),^{done=YES;});}];
 NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:30];while(!done&&deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.01]];
 assert(done);double duration=CMTimeGetSeconds(asset.duration);printf("%s: %.3f seconds, precise=%d\\n",i?"fixed":"default",duration,asset.providesPreciseDurationAndTiming);
 if(i){assert(asset.playable);assert(asset.providesPreciseDurationAndTiming);assert(fabs(duration-atof(argv[2]))<.1);}
 }
}}
`);
 execFileSync('xcrun',['--sdk','macosx','clang','-w','-fobjc-arc','-framework','Foundation','-framework','AVFoundation','-framework','CoreMedia',source,'-o',join(dir,'timing')]);
 execFileSync(join(dir,'timing'),[audio,String(expected)],{stdio:'inherit',timeout:65000});
 const bytes=readFileSync(audio);let transferred=0,requests=0;
 server=createServer((req,res)=>{
  requests++;const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
  if(start>=bytes.length){res.writeHead(416,{'content-range':`bytes */${bytes.length}`});res.end();return;}
  const body=bytes.subarray(start,end+1);transferred+=body.length;
  res.writeHead(range?206:200,{'content-type':'audio/ogg','accept-ranges':'bytes','content-length':body.length,...(range?{'content-range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(body);
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 const result=await promisify(execFile)(join(dir,'timing'),[`http://127.0.0.1:${server.address().port}/track.opus`,String(expected)],{timeout:65000});process.stdout.write(result.stdout);console.log(`HTTP requests: ${requests}; response bytes: ${transferred}`);
}finally{server?.closeAllConnections();server?.close();rmSync(dir,{recursive:true,force:true});}
