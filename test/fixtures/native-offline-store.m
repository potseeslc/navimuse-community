#import <Foundation/Foundation.h>
#import "../../src-tauri/ios/offline-store.h"
static void check(BOOL value,NSString *message){if(!value){NSLog(@"FAIL: %@",message);exit(1);}}
static NSURL *temporary(NSURL *root,unsigned long long size) {
    NSURL *url=[root URLByAppendingPathComponent:NSUUID.UUID.UUIDString];
    [NSFileManager.defaultManager createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:NULL];
    [NSFileManager.defaultManager createFileAtPath:url.path contents:[NSData data] attributes:nil];
    NSFileHandle *handle=[NSFileHandle fileHandleForWritingAtPath:url.path];[handle truncateFileAtOffset:size];[handle closeFile];return url;
}
static void authorize(NMOfflineAccess *gate,NSString *scope) {
    double now=NSDate.date.timeIntervalSince1970*1000;
    check([gate acceptResponse:@{@"version":@"navimuse-offline/v1",@"scope":scope,@"issuedAt":@(now),@"expiresAt":@(now+30.0*86400000)} expectedScope:scope nowMS:now uptime:NSProcessInfo.processInfo.systemUptime error:NULL],@"fixture grant");
}
int main(int argc,char **argv){@autoreleasepool{
    NSURL *root=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]] isDirectory:YES];
    NSURL *media=[root URLByAppendingPathComponent:@"media"],*temp=[root URLByAppendingPathComponent:@"temporary"];
    NMOfflineAccess *gate=[[NMOfflineAccess alloc]initWithStateURL:[root URLByAppendingPathComponent:@"access.json"]];
    NMOfflineStore *store=[[NMOfflineStore alloc]initWithRootURL:media access:gate];
    NSString *a=[@"queue-scope-v2:" stringByAppendingString:[@"" stringByPaddingToLength:64 withString:@"a" startingAtIndex:0]],*b=[a stringByReplacingOccurrencesOfString:@"a" withString:@"b"];
    NSDictionary *song=@{@"id":@"song/with?a#path",@"title":@"Fixture",@"artist":@"Native test",@"path":@"../../never",@"password":@"never retained"};
    check(![store snapshot][@"available"] || ![[store snapshot][@"available"] boolValue],@"locked without grant");
    check([store beginSong:song error:NULL]==nil,@"cannot queue without grant");
    authorize(gate,a);check([[store snapshot][@"tracks"] count]==0,@"fresh account empty");
    check([[store snapshot][@"outputOwnership"][@"state"] isEqual:@"unknown"],@"new offline account cannot assume local playback");
    check(![store setOutputOwnership:@{@"state":@"local"} scope:b error:NULL],@"ownership cannot cross accounts");
    check(![store setOutputOwnership:@{@"state":@"invented"} scope:a error:NULL],@"ownership state validated");
    check([store setOutputOwnership:@{@"state":@"remote",@"label":@"Fixture speaker"} scope:a error:NULL],@"persist remote ownership");
    check(CFGetTypeID((__bridge CFTypeRef)[store snapshot][@"available"])==CFBooleanGetTypeID(),@"native availability is a JavaScript boolean");
    check(!store.allowsCellular,@"cellular defaults off");
    check([store setAllowsCellular:YES budgetBytes:512ULL*1024*1024 error:NULL],@"save preference");
    check(![store setAllowsCellular:YES budgetBytes:1 error:NULL],@"invalid storage limit rejected");
    NSString *ticket=[store beginSong:song error:NULL];check(ticket!=nil,@"queue song");
    check([store mediaForSongID:song[@"id"] scope:a]==nil,@"queued media cannot play");
    check([store setState:@"downloading" songID:song[@"id"] ticket:ticket message:nil error:NULL],@"start download");
    NSURL *first=temporary(temp,64);
    check([store installFile:first mimeType:@"audio/wav" songID:song[@"id"] ticket:ticket error:NULL],@"completed native file installed");
    NSURL *local=[store mediaForSongID:song[@"id"] scope:a];check(local!=nil && local.isFileURL,@"same player can resolve local file");
    check(![local.path containsString:song[@"id"]],@"song id cannot become file path");
    NSDictionary *item=[store snapshot][@"tracks"][0];check(item[@"song"][@"path"]==nil && item[@"song"][@"password"]==nil && item[@"file"]==nil,@"no paths or credentials in metadata/JS snapshot");
    store=[[NMOfflineStore alloc]initWithRootURL:media access:gate];
    check([[store snapshot][@"outputOwnership"][@"state"] isEqual:@"remote"],@"remote ownership survives process restart");
    check(store.allowsCellular && store.budgetBytes==512ULL*1024*1024,@"preferences survive restart");
    check([store mediaForSongID:song[@"id"] scope:a]!=nil,@"completed file survives restart");
    check([store beginSong:song error:NULL]==nil,@"duplicate completed song not replaced");
    check([store mediaForSongID:song[@"id"] scope:b]==nil,@"wrong scope never resolves");
    authorize(gate,b);check([[store snapshot][@"tracks"] count]==0,@"other account cannot see metadata");
    check([[store snapshot][@"outputOwnership"][@"state"] isEqual:@"unknown"],@"ownership isolated for another account");
    check([store mediaForSongID:song[@"id"] scope:a]==nil,@"other account cannot resolve old file");
    authorize(gate,a);check([store mediaForSongID:song[@"id"] scope:a]!=nil,@"reauthorized account retains downloaded file");
    check([[store snapshot][@"outputOwnership"][@"state"] isEqual:@"remote"],@"switching accounts preserves original remote owner");
    check([store setOutputOwnership:@{@"state":@"local"} scope:a error:NULL],@"confirmed release may persist local owner");
    store=[[NMOfflineStore alloc]initWithRootURL:media access:gate];
    check([[store snapshot][@"outputOwnership"][@"state"] isEqual:@"local"],@"confirmed local ownership survives restart");
    NSDictionary *second=@{@"id":@"second",@"title":@"Second"};
    NSString *stale=[store beginSong:second error:NULL];check([store setState:@"downloading" songID:@"second" ticket:stale message:nil error:NULL],@"second started");
    check([store setState:@"cancelled" songID:@"second" ticket:stale message:nil error:NULL],@"cancel download");
    check(![store installFile:temporary(temp,20) mimeType:@"audio/wav" songID:@"second" ticket:stale error:NULL],@"cancelled completion rejected");
    NSString *retry=[store beginSong:second error:NULL];check(![retry isEqual:stale],@"retry has new ticket");
    check(![store setState:@"failed" songID:@"second" ticket:stale message:@"stale" error:NULL],@"stale callback cannot alter retry");
    store=[[NMOfflineStore alloc]initWithRootURL:media access:gate];
    NSArray *records=[store snapshot][@"tracks"];BOOL interrupted=NO;for(NSDictionary *r in records)if([r[@"song"][@"id"] isEqual:@"second"])interrupted=[r[@"state"] isEqual:@"failed"];check(interrupted,@"interrupted process offers retry");
    retry=[store beginSong:second error:NULL];[store setState:@"downloading" songID:@"second" ticket:retry message:nil error:NULL];
    check(![store installFile:temporary(temp,0) mimeType:@"audio/wav" songID:@"second" ticket:retry error:NULL],@"empty file rejected");
    check(![store installFile:temporary(temp,1024ULL*1024*1024+1) mimeType:@"audio/wav" songID:@"second" ticket:retry error:NULL],@"per-track bound enforced");
    check(![store installFile:temporary(temp,512ULL*1024*1024) mimeType:@"audio/wav" songID:@"second" ticket:retry error:NULL],@"existing stored bytes count against budget");
    NSURL *symlink=[temp URLByAppendingPathComponent:@"link"];
    [NSFileManager.defaultManager createSymbolicLinkAtURL:symlink withDestinationURL:local error:NULL];
    check(![store installFile:symlink mimeType:@"audio/wav" songID:@"second" ticket:retry error:NULL],@"symlink cannot install media");
    [gate invalidate];check([store mediaForSongID:song[@"id"] scope:a]==nil && [[store snapshot][@"tracks"] count]==0,@"logout hides and locks media");
    authorize(gate,a);check([store removeSongID:song[@"id"] error:NULL],@"remove downloaded track");
    check(![NSFileManager.defaultManager fileExistsAtPath:local.path],@"remove reclaims native file");
    check([store clearCurrentScope:NULL] && [[store snapshot][@"tracks"] count]==0,@"clear downloads");
    check([store usedBytes]==0,@"storage reclaimed");
    check([store beginSong:@{@"id":@"radio",@"streamUrl":@"https://example.test/stream"} error:NULL]==nil,@"live streams excluded");
    ticket=[store beginSong:song error:NULL];[store setState:@"downloading" songID:song[@"id"] ticket:ticket message:nil error:NULL];
    check([store installFile:temporary(temp,64) mimeType:@"audio/wav" songID:song[@"id"] ticket:ticket error:NULL],@"fixture for clear after logout");
    check([store setAllowsCellular:YES budgetBytes:0 error:NULL],@"unlimited accepted");
    store=[[NMOfflineStore alloc]initWithRootURL:media access:gate];check(store.budgetBytes==0,@"unlimited persists");
    NSArray *collection=[store beginSongs:@[@{@"id":song[@"id"],@"downloadCollections":@[@{@"id":@"p1",@"name":@"Playlist One"}]}] error:NULL];
    check(collection!=nil && collection.count==0,@"existing media associates without redownload");
    store=[[NMOfflineStore alloc]initWithRootURL:media access:gate];
    NSDictionary *downloaded=[store snapshot][@"tracks"][0];check([downloaded[@"song"][@"downloadCollections"][0][@"id"] isEqual:@"p1"],@"playlist association survives restart");
    [gate invalidate];check([store clearAllDownloadedMusic:NULL] && [store usedBytes]==0,@"device clear works after grant expiry/signout");
    check(store.allowsCellular,@"clear preserves device preferences");
    puts("native offline store: scoped persistence, cancellation, stale completion, restart, storage bounds, metadata filtering and removal passed");
}return 0;}
