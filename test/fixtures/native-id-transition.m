#import <Foundation/Foundation.h>
#import "../../src-tauri/ios/offline-store.h"
#import "../../src-tauri/ios/navidrome-id.h"
static void check(BOOL ok,NSString *message){if(!ok){NSLog(@"FAIL: %@",message);exit(1);}}
static void grant(NMOfflineAccess *access,NSString *scope,BOOL canonical) {
    double now=NSDate.date.timeIntervalSince1970*1000;
    check([access acceptResponse:@{@"version":@"navimuse-offline/v1",@"scope":scope,@"issuedAt":@(now),@"expiresAt":@(now+86400000),@"navidromeIdFormat":canonical?@"canonical-v1":@"legacy"} expectedScope:scope nowMS:now uptime:NSProcessInfo.processInfo.systemUptime error:NULL],@"grant accepted");
}
int main(int argc,char **argv){@autoreleasepool{
    NSString *old=@"0123456789abcdef0123456789abcdef",*current=@"0296TIIbB3u904riPYGPJJ";
    check([NMCanonicalNavidromeID(old) isEqual:current],@"hex conversion");
    check([NMCanonicalNavidromeID(@"01234567-89ab-cdef-0123-456789abcdef") isEqual:current],@"UUID conversion");
    check([NMCanonicalNavidromeID(@"ZZZZZZZZZZZZZZZZZZZZZZ") isEqual:@"2M034N7SJ2GTCQrEWb2ZmX"],@"overflow nanoid");
    check([NMCanonicalNavidromeID(@"ffffffffffffffffffffffffffffffff") isEqual:@"7N42dgm5tFLK9N8MT7fHC7"],@"max 128 bits");
    for(NSString *s in @[current,@"7N42dgm5tFLK9N8MT7fHC7",@"radio:live",@"______________________",@"zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"])check([NMCanonicalNavidromeID(s) isEqual:s],@"unchanged IDs");
    NSURL *root=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]] isDirectory:YES];
    NSURL *state=[root URLByAppendingPathComponent:@"access.json"],*media=[root URLByAppendingPathComponent:@"media"];
    NMOfflineAccess *access=[[NMOfflineAccess alloc]initWithStateURL:state];
    NMOfflineStore *store=[[NMOfflineStore alloc]initWithRootURL:media access:access];
    NSString *scope=[@"queue-scope-v2:" stringByAppendingString:[@"" stringByPaddingToLength:64 withString:@"a" startingAtIndex:0]],*other=[scope stringByReplacingOccurrencesOfString:@"a" withString:@"b"];
    grant(access,scope,NO);
    NSString *ticket=[store beginSong:@{@"id":old,@"title":@"Retained download"} error:NULL];
    check([store setState:@"downloading" songID:old ticket:ticket message:nil error:NULL],@"start old download");
    NSData *audio=[@"OggS retained fixture bytes" dataUsingEncoding:NSUTF8StringEncoding];
    NSURL *temp=[root URLByAppendingPathComponent:@"temporary"];[audio writeToURL:temp atomically:YES];
    check([store installFile:temp mimeType:@"audio/ogg" songID:old ticket:ticket error:NULL],@"install old download");
    NSURL *file=[store mediaForSongID:old scope:scope];check(file!=nil,@"old ID works before upgrade");
    check([store mediaForSongID:current scope:scope]==nil,@"no aliases before trusted upgrade confirmation");
    grant(access,scope,YES);
    check([[store mediaForSongID:current scope:scope] isEqual:file],@"new ID resolves original file");
    check([[store mediaForSongID:old scope:scope] isEqual:file],@"restored queue retains old ID");
    check([[store mimeTypeForSongID:current scope:scope] isEqual:@"audio/ogg"],@"Opus MIME retained");
    check([[NSData dataWithContentsOfURL:file] isEqual:audio],@"media bytes unchanged");
    check([store beginSong:@{@"id":current} error:NULL]==nil,@"no duplicate redownload");
    check([[[store snapshot][@"tracks"][0][@"song"] objectForKey:@"id"] isEqual:current],@"downloads surface uses current library ID");
    check([[store storedSongID:current] isEqual:old],@"existing tickets retain original record key");
    NSString *pendingOld=@"ffffffffffffffffffffffffffffffff",*pendingNew=@"7N42dgm5tFLK9N8MT7fHC7";
    NSString *pendingTicket=[store beginSong:@{@"id":pendingOld} error:NULL];
    check([[store storedSongID:pendingNew] isEqual:pendingOld],@"alias cache invalidated after enqueue");
    check([store setState:@"cancelled" songID:[store storedSongID:pendingNew] ticket:pendingTicket message:nil error:NULL],@"cancel by new ID uses existing ticket");
    access=[[NMOfflineAccess alloc]initWithStateURL:state];store=[[NMOfflineStore alloc]initWithRootURL:media access:access];
    check([[store mediaForSongID:current scope:scope] isEqual:file],@"offline restart retains aliases and media");
    check([store mediaForSongID:current scope:other]==nil,@"cross-account lookup denied");
    grant(access,other,YES);check([store mediaForSongID:current scope:other]==nil,@"other account has no alias or metadata");
    grant(access,scope,NO);check([store mediaForSongID:current scope:scope]==nil,@"rollback disables aliases");
    check([[store mediaForSongID:old scope:scope] isEqual:file],@"rollback preserves original download");
    grant(access,scope,YES);check([store removeSongID:current error:NULL],@"explicit removal by new ID");
    check(![NSFileManager.defaultManager fileExistsAtPath:file.path],@"explicit removal reclaims original file");
    check([store mediaForSongID:old scope:scope]==nil,@"removed alias cannot play");
    puts("native ID transition: retained bytes, aliases, Opus MIME, restart, scope, rollback, duplicate prevention and removal passed");
}return 0;}
