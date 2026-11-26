import {execFileSync} from 'node:child_process';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'nm-playback-log-'));
try{
 const source=join(dir,'test.m');writeFileSync(source,`#import "${resolve('src-tauri/ios/playback-log.h')}"
int main(){@autoreleasepool{
 NSDictionary *safe=NMPlaybackLogEntry(@{@"event":@"stream-failure",@"at":@1000000,@"errorCode":@-1009,@"httpStatus":@503,@"url":@"https://secret",@"title":@"private",@"network":@"wifi"});
 NSCAssert(safe[@"url"]==nil && safe[@"title"]==nil && [safe[@"errorCode"] intValue]==-1009,@"redaction");
 NSCAssert(NMPlaybackLogEntry(@{@"event":@"secret",@"at":@1000000})==nil,@"event allowlist");
 NSMutableArray *all=[NSMutableArray new];for(int i=0;i<2010;i++)[all addObject:safe];
 NSCAssert(NMPlaybackLogPruned(all,1000000).count==2000,@"bounded");NSCAssert(NMPlaybackLogPruned(all,2000000).count==0,@"expiry");
 NSCAssert(NMPlaybackLogPruned(@[@{@"event":@"sample",@"at":@3000000}],1000000).count==0,@"future");
 NSData *json=[NSJSONSerialization dataWithJSONObject:safe options:0 error:nil];NSCAssert(json!=nil,@"export serialization");
 puts("Native playback log: redaction, bounds, expiry and export passed");}}
`);
 execFileSync('xcrun',['--sdk','macosx','clang','-fobjc-arc','-framework','Foundation',source,'-o',join(dir,'test')],{stdio:'inherit'});execFileSync(join(dir,'test'),[],{stdio:'inherit'});
}finally{rmSync(dir,{recursive:true,force:true});}
