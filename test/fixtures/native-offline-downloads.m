#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import "../../src-tauri/ios/native-audio.m"

// Load a downloaded item through the production bridge/player path. Playback
// and AVAudioSession activation stay disabled: this is a silent readiness test.
@interface NMOfflinePlayerFixture : NMNativeAudio @end
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-designated-initializers"
@implementation NMOfflinePlayerFixture
- (instancetype)init {
    self.players=@[[AVPlayer new],[AVPlayer new]];self.recovery=@[[NMStreamRecovery new],[NMStreamRecovery new]];
    self.generations=[@[@0,@0] mutableCopy];self.ready=[@[@NO,@NO] mutableCopy];
    self.streamDetails=[@[@{},@{}] mutableCopy];self.downloadedDecks=[@[@{},@{}] mutableCopy];self.page=@"offline-fixture";return self;
}
- (BOOL)activate{return NO;}
- (void)publish{}
- (void)send:(NSDictionary *)event{}
@end
#pragma clang diagnostic pop
@interface NMOfflineOrigin : NSObject
@property(nonatomic,readonly) NSString *protocol;
@property(nonatomic,readonly) NSString *host;
@property(nonatomic,readonly) NSInteger port;
@end
@implementation NMOfflineOrigin
- (NSString *)protocol{return @"https";}- (NSString *)host{return @"navimuse.example.com";}- (NSInteger)port{return 443;}
@end
@interface NMOfflineFrame : NSObject
@property(nonatomic,readonly,getter=isMainFrame) BOOL mainFrame;
@property(nonatomic,readonly) NMOfflineOrigin *securityOrigin;
@end
@implementation NMOfflineFrame
- (BOOL)isMainFrame{return YES;}- (NMOfflineOrigin *)securityOrigin{return [NMOfflineOrigin new];}
@end
@interface NMOfflineMessage : NSObject
@property(nonatomic) NSDictionary *body;
@property(nonatomic,readonly) NMOfflineFrame *frameInfo;
@end
@implementation NMOfflineMessage
- (NMOfflineFrame *)frameInfo{return [NMOfflineFrame new];}
@end

static NSString *scope;
static NSData *wave;
static NSString *mediaType=@"audio/wav";
static NSString *mode=@"audio";
static NSUInteger mediaRequests=0,mediaStarted=0;
static NSString *lastURL;
static BOOL requestCookie=NO;
static void check(BOOL value,NSString *message){if(!value){NSLog(@"FAIL: %@",message);exit(1);}}
@interface NMFixtureProtocol : NSURLProtocol
@property(nonatomic) BOOL stopped;
@end
@implementation NMFixtureProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request{return [request.URL.host isEqual:@"navimuse.example.com"];}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request{return request;}
- (void)startLoading {
    if(![self.request.URL.path isEqual:@"/api/navidrome/offline-access"])mediaStarted++;
    if([mode isEqual:@"delayed"]){dispatch_after(dispatch_time(DISPATCH_TIME_NOW,NSEC_PER_SEC/5),dispatch_get_main_queue(),^{if(!self.stopped)[self emitResponse];});return;}
    [self emitResponse];
}
- (void)emitResponse {
    NSString *path=self.request.URL.path;NSInteger status=200;NSString *type=mediaType;NSData *body=wave;
    requestCookie=[[self.request valueForHTTPHeaderField:@"Cookie"] containsString:@"fixture-session"];
    if([path isEqual:@"/api/navidrome/offline-access"]) {
        double now=NSDate.date.timeIntervalSince1970*1000;type=@"application/json";
        body=[NSJSONSerialization dataWithJSONObject:@{@"version":@"navimuse-offline/v1",@"scope":scope,@"issuedAt":@(now),@"expiresAt":@(now+30.0*86400000)} options:0 error:NULL];
        if([mode isEqual:@"revoked"])status=403;
    } else {
        mediaRequests++;lastURL=self.request.URL.absoluteString;
        if([mode isEqual:@"html"]){type=@"text/html";body=[@"<html>Login</html>" dataUsingEncoding:NSUTF8StringEncoding];}
        if([mode isEqual:@"fake-audio"])body=[@"not audio" dataUsingEncoding:NSUTF8StringEncoding];
        if([mode isEqual:@"partial"])status=206;
        if([mode isEqual:@"revoked"])status=403;
    }
    NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc]initWithURL:self.request.URL statusCode:status HTTPVersion:@"HTTP/1.1" headerFields:[mode isEqual:@"unknown-length"]?@{@"Content-Type":type}:@{@"Content-Type":type,@"Content-Length":[NSString stringWithFormat:@"%lu",(unsigned long)body.length]}];
    [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    [self.client URLProtocol:self didLoadData:body];[self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading {self.stopped=YES;}
@end
static BOOL waitUntil(BOOL (^predicate)(void)) {
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:5];
    while(!predicate() && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.01]];
    return predicate();
}
static NSString *state(NMOfflineDownloads *downloads,NSString *id) {
    for(NSDictionary *r in [downloads snapshot][@"tracks"])if([r[@"song"][@"id"] isEqual:id])return r[@"state"];return nil;
}
int main(int argc,char **argv){@autoreleasepool{
    NSURL *root=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
    wave=[NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[2]]];
    scope=[@"queue-scope-v2:" stringByAppendingString:[@"" stringByPaddingToLength:64 withString:@"a" startingAtIndex:0]];
    NMOfflineDownloads *downloads=[[NMOfflineDownloads alloc]initWithRootURL:root];
    // Replace only transport with an in-process HTTPS protocol fixture. Production
    // URL construction, cookies, delegates, AVFoundation validation and files run.
    NSURLSession *original=[downloads valueForKey:@"session"];[original invalidateAndCancel];
    NSURLSessionConfiguration *config=NSURLSessionConfiguration.ephemeralSessionConfiguration;config.protocolClasses=@[NMFixtureProtocol.class];config.HTTPCookieStorage=nil;
    NSURLSession *session=[NSURLSession sessionWithConfiguration:config delegate:downloads delegateQueue:NSOperationQueue.mainQueue];[downloads setValue:session forKey:@"session"];
    NSArray *cookies=@[[NSHTTPCookie cookieWithProperties:@{NSHTTPCookieName:@"fixture-session",NSHTTPCookieValue:@"opaque",NSHTTPCookieDomain:@"navimuse.example.com",NSHTTPCookiePath:@"/",NSHTTPCookieSecure:@"TRUE"}]];
    __block BOOL done=NO;__block NSError *failure=nil;
    [downloads authorizeScope:scope cookies:cookies completion:^(NSError *error){failure=error;done=YES;}];
    check(waitUntil(^BOOL{return done;}),@"authorization completed");check(failure==nil && requestCookie,@"first-party cookie authorization");
    downloads.networkType=@"cellular";
    check([downloads enqueueSongs:@[@{@"id":@"song",@"title":@"Silent fixture"}] format:@"raw" bitrate:@0 cookies:cookies error:NULL],@"queued song");
    check(mediaRequests==0 && [[downloads snapshot][@"waitingForNetwork"] boolValue],@"cellular defaults to waiting");
    downloads.networkType=@"wifi";
    check(waitUntil(^BOOL{return [state(downloads,@"song") isEqual:@"complete"] || [state(downloads,@"song") isEqual:@"failed"];}),@"download completed");
    check([state(downloads,@"song") isEqual:@"complete"], [NSString stringWithFormat:@"real WAV validated: %@",[downloads snapshot]]);
    check(requestCookie && [lastURL containsString:@"format=raw"] && [lastURL containsString:@"maxBitRate=0"] && [lastURL containsString:@"accountScope="],@"authenticated scoped media request");
    check([downloads.store mediaForSongID:@"song" scope:scope]!=nil,@"download resolves to native file");
    mode=@"unknown-length";
    check([downloads enqueueSongs:@[@{@"id":@"chunked"}] format:@"mp3" bitrate:@192 cookies:cookies error:NULL],@"queue unknown-length audio");
    check(waitUntil(^BOOL{return [state(downloads,@"chunked") isEqual:@"complete"] || [state(downloads,@"chunked") isEqual:@"failed"];}),@"unknown-length transfer completes");
    check([state(downloads,@"chunked") isEqual:@"complete"],@"unknown response length is bounded by actual bytes, not rejected as huge");
    check([downloads enqueueSongs:@[@{@"id":@"short-audio",@"duration":@300}] format:@"mp3" bitrate:@96 cookies:cookies error:NULL],@"queue decodable but truncated audio");
    check(waitUntil(^BOOL{return [state(downloads,@"short-audio") isEqual:@"failed"];}),@"short duration rejected even with valid audio and unknown content length");
    check([downloads.store mediaForSongID:@"short-audio" scope:scope]==nil,@"truncated audio is never Ready offline");
    mode=@"audio";
    NMOfflinePlayerFixture *player=[NMOfflinePlayerFixture new];player.downloads=downloads;
    NMOfflineMessage *message=[NMOfflineMessage new];
    message.body=@{@"action":@"load",@"page":@"offline-fixture",@"deck":@0,@"generation":@1,@"url":[@"https://navimuse.example.com/api/navidrome/stream/song?accountScope=" stringByAppendingString:scope]};
    __block BOOL loaded=NO;
    [player userContentController:[WKUserContentController new] didReceiveScriptMessage:(id)message replyHandler:^(id value,NSString *error){check(error==nil,@"production bridge accepts cached stream");loaded=[value boolValue];}];
    check(loaded && [(AVURLAsset *)player.players[0].currentItem.asset URL].isFileURL,@"production AVPlayer deck uses local file");
    check(waitUntil(^BOOL{return player.players[0].currentItem.status!=AVPlayerItemStatusUnknown;}),@"local AVPlayerItem ready check finishes");
    check(player.players[0].currentItem.status==AVPlayerItemStatusReadyToPlay,@"actual cached audio ready without network or playback");
    check([player downloadForStream:[NSURL URLWithString:@"https://evil.example/api/navidrome/stream/song"]]==nil,@"foreign stream cannot select local files");
    check([player downloadForStream:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/song"]]==nil,@"account-mode stream requires scope");
    player.offlineLaunch=YES;
    check(![player downloadedDeckAllowed:0],@"offline unknown owner cannot resume cached audio");
    [downloads.store setOutputOwnership:@{@"state":@"remote"} scope:scope error:NULL];
    check(![player downloadedDeckAllowed:0],@"offline remote owner cannot resume cached audio");
    message.body=@{@"action":@"offline.output",@"page":@"offline-fixture",@"scope":scope,@"ownership":@{@"state":@"local"}};
    [player userContentController:[WKUserContentController new] didReceiveScriptMessage:(id)message replyHandler:^(id value,NSString *error){check(error!=nil && value==nil,@"offline document cannot grant itself local ownership");}];
    [downloads.store setOutputOwnership:@{@"state":@"local"} scope:scope error:NULL];
    check([player downloadedDeckAllowed:0],@"confirmed local owner can resume downloaded item offline");
    message.body=@{@"action":@"load",@"page":@"offline-fixture",@"deck":@1,@"generation":@1,@"url":[@"https://navimuse.example.com/api/navidrome/stream/not-downloaded?accountScope=" stringByAppendingString:scope]};
    [player userContentController:[WKUserContentController new] didReceiveScriptMessage:(id)message replyHandler:^(id value,NSString *error){check(error!=nil && value==nil,@"offline missing media never falls through to a streaming asset");}];
    check(player.players[1].currentItem==nil,@"offline missing item leaves deck empty");
    player.offlineLaunch=NO;
    message.body=@{@"action":@"offline.account",@"page":@"offline-fixture",@"scope":scope};
    [player userContentController:[WKUserContentController new] didReceiveScriptMessage:(id)message replyHandler:^(id value,NSString *error){check(error==nil && [value boolValue],@"verified account scope reconciles");}];
    check([player downloadedDeckAllowed:0],@"same account keeps offline access");
    message.body=@{@"action":@"offline.account",@"page":@"offline-fixture",@"scope":@"queue-scope-v2:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"};
    [player userContentController:[WKUserContentController new] didReceiveScriptMessage:(id)message replyHandler:^(id value,NSString *error){check(error==nil,@"changed account locks offline access");}];
    check(![player downloadedDeckAllowed:0],@"native account reconciliation blocks old local playback");
    done=NO;[downloads authorizeScope:scope cookies:cookies completion:^(NSError *error){failure=error;done=YES;}];
    check(waitUntil(^BOOL{return done;}) && !failure,@"reauthorize before remaining network cases");
    for(NSString *invalid in @[@"html",@"fake-audio",@"partial"]) {
        mode=invalid;check([downloads enqueueSongs:@[@{@"id":invalid}] format:@"mp3" bitrate:@128 cookies:cookies error:NULL],@"queue invalid response test");
        check(waitUntil(^BOOL{return [state(downloads,invalid) isEqual:@"failed"];}),[NSString stringWithFormat:@"%@ rejected",invalid]);
        check([downloads.store mediaForSongID:invalid scope:scope]==nil,@"invalid response cannot play");
    }
    mode=@"delayed";NSUInteger started=mediaStarted;
    check([downloads enqueueSongs:@[@{@"id":@"in-flight"}] format:@"raw" bitrate:@0 cookies:cookies error:NULL],@"start delayed download");
    check(waitUntil(^BOOL{return mediaStarted>started;}),@"real URLSession request is in flight");
    [downloads cancelSongID:@"in-flight"];
    [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.3]];
    check([state(downloads,@"in-flight") isEqual:@"cancelled"] && [downloads.store mediaForSongID:@"in-flight" scope:scope]==nil,@"in-flight cancellation cannot complete later");
    mode=@"audio";downloads.networkType=@"cellular";
    check([downloads enqueueSongs:@[@{@"id":@"cellular-opt-in"}] format:@"raw" bitrate:@0 cookies:cookies error:NULL],@"queue cellular download");
    check([state(downloads,@"cellular-opt-in") isEqual:@"queued"],@"cellular still blocked by default");
    check([downloads.store setAllowsCellular:YES budgetBytes:downloads.store.budgetBytes error:NULL],@"enable cellular preference");
    [downloads preferencesChanged];
    check(waitUntil(^BOOL{return [state(downloads,@"cellular-opt-in") isEqual:@"complete"];}),@"explicit cellular preference starts queued download");
    [downloads.store setAllowsCellular:NO budgetBytes:downloads.store.budgetBytes error:NULL];[downloads preferencesChanged];
    mode=@"audio";downloads.networkType=@"offline";
    check([downloads enqueueSongs:@[@{@"id":@"cancel"}] format:@"raw" bitrate:@0 cookies:cookies error:NULL],@"queue while offline");
    [downloads cancelSongID:@"cancel"];check([state(downloads,@"cancel") isEqual:@"cancelled"],@"queued cancellation");
    NSUInteger before=mediaRequests;downloads.networkType=@"wifi";check(mediaRequests==before,@"cancelled song does not start");
    mode=@"revoked";
    check([downloads enqueueSongs:@[@{@"id":@"media-revoked"}] format:@"raw" bitrate:@0 cookies:cookies error:NULL],@"queue music after upstream revocation");
    check(waitUntil(^BOOL{return ![[downloads snapshot][@"available"] boolValue];}),@"media authorization rejection invalidates existing access");
    done=NO;
    [downloads authorizeScope:scope cookies:cookies completion:^(NSError *error){failure=error;done=YES;}];
    check(waitUntil(^BOOL{return done;}) && failure!=nil,@"auth rejection reported");
    check(![[downloads snapshot][@"available"] boolValue] && [downloads.store mediaForSongID:@"song" scope:scope]==nil,@"auth rejection locks cached music");
    check(![player downloadedDeckAllowed:0],@"revoked grant prevents local player resume");
    [player replaceItem:nil deck:0];
    mode=@"audio";player.offlineLaunch=NO;
    wave=[NSData dataWithContentsOfFile:@(argv[4])];mediaType=@"audio/mpeg";
    NMStreamCache *cache=[[NMStreamCache alloc]initWithRootURL:[root URLByAppendingPathComponent:@"stream-cache"]];
    [[cache.downloads valueForKey:@"session"] invalidateAndCancel];
    [cache.downloads setValue:[NSURLSession sessionWithConfiguration:config delegate:cache.downloads delegateQueue:NSOperationQueue.mainQueue] forKey:@"session"];
    cache.downloads.networkType=@"cellular";player.streamCache=cache;
    before=mediaRequests;cache.downloads.pausedForPlayback=YES;
    [cache prepare:@[@{@"id":@"ahead1"},@{@"id":@"ahead2"},@{@"id":@"ahead3"}] scope:scope format:@"opus" bitrate:@128 keeping:@[] cookies:cookies];
    check(waitUntil(^BOOL{return [state(cache.downloads,@"ahead1") isEqual:@"queued"];}),@"cache queues while playback fills");
    check(mediaRequests==before,@"playback priority prevents competing downloads");
    cache.downloads.pausedForPlayback=NO;
    check(waitUntil(^BOOL{return [state(cache.downloads,@"ahead3") isEqual:@"complete"];}),@"next three cache entries complete on cellular");
    check(cache.downloads.store.budgetBytes==512ULL*1024*1024,@"cache storage bounded independently from explicit downloads");
    check([lastURL containsString:@"format=mp3"] && [lastURL containsString:@"maxBitRate=96"],@"safety cache requests 96 kbps MP3");
    NMStreamCache *reopened=[[NMStreamCache alloc]initWithRootURL:[root URLByAppendingPathComponent:@"stream-cache"]];
    check([reopened media:@"ahead1" scope:scope format:@"raw" bitrate:@"0"]!=nil,@"completed cache survives reopening within account grant");[reopened.downloads close];
    NSURL *cachedURL=[NSURL URLWithString:[@"https://navimuse.example.com/api/navidrome/stream/ahead1?format=opus&maxBitRate=128&accountScope=" stringByAppendingString:scope]];
    player.networkType=@"wifi";
    check([player downloadForStream:cachedURL]==nil,@"healthy playback keeps selected streaming quality");
    player.safetyFallback=YES;
    check([player downloadForStream:cachedURL][@"cached"]!=nil,@"degraded playback resolves safety copy");
    check([cache media:@"ahead1" scope:scope format:@"mp3" bitrate:@"128"]!=nil,@"safety variant remains available independently of streaming preference");
    [player.recovery[0] load:cachedURL];player.recovery[0].wantsPlayback=YES;player.recovery[0].restoring=YES;player.recovery[0].position=.25;
    NSNumber *generation=player.generations[0];
    check([player restoreFromSafetyCache:0],@"production recovery switches to validated safety copy");
    check([player.generations[0] isEqual:generation] && player.recovery[0].position==.25,@"fallback preserves track generation and recovery position");
    [player pauseDeck:0];[player replaceItem:nil deck:0];
    check(![player restoreFromSafetyCache:0],@"paused playback cannot restart through fallback");
    message.body=@{@"action":@"load",@"page":@"offline-fixture",@"deck":@0,@"generation":@3,@"url":cachedURL.absoluteString};
    before=mediaRequests;cache.downloads.networkType=@"offline";
    [player userContentController:[WKUserContentController new] didReceiveScriptMessage:(id)message replyHandler:^(id value,NSString *error){check(error==nil && [value boolValue],@"cached stream loads after connection drops");}];
    check(waitUntil(^BOOL{return player.players[0].currentItem.status==AVPlayerItemStatusReadyToPlay;}),@"cached next track reaches real player readiness offline");
    check(mediaRequests==before && [player downloadedDeckAllowed:0],@"cached playback does not issue another stream request");
    cache.downloads.networkType=@"wifi";cache.downloads.pausedForPlayback=NO;
    [cache prepare:@[@{@"id":@"ahead2"},@{@"id":@"ahead3"},@{@"id":@"ahead4"}] scope:scope format:@"opus" bitrate:@128 keeping:@[@"ahead1"] cookies:cookies];
    check(waitUntil(^BOOL{return [state(cache.downloads,@"ahead4") isEqual:@"complete"];}),@"cache rolls forward");
    check([player downloadedDeckAllowed:0],@"active cached file stays pinned");
    [player replaceItem:nil deck:0];cache.downloads.pausedForPlayback=NO;
    [cache prepare:@[@{@"id":@"ahead3"},@{@"id":@"ahead4"},@{@"id":@"ahead5"}] scope:scope format:@"opus" bitrate:@128 keeping:@[] cookies:cookies];
    check(waitUntil(^BOOL{return [state(cache.downloads,@"ahead5") isEqual:@"complete"];}),@"next rolling batch completes");
    check([cache media:@"ahead1" scope:scope format:@"opus" bitrate:@"128"]==nil,@"old unpinned files are evicted");
    mode=@"delayed";[cache prepare:@[@{@"id":@"obsolete"}] scope:scope format:@"opus" bitrate:@128 keeping:@[] cookies:cookies];[cache invalidate];
    [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.3]];
    check([cache media:@"ahead3" scope:scope format:@"opus" bitrate:@"128"]==nil && ![[cache.downloads snapshot][@"available"] boolValue],@"logout invalidates cache and pending authorization");
    [cache.downloads close];
    puts("stream cache: cellular transfer, offline local playback, healthy quality preference, pinning, eviction, bounded storage and invalidation passed");
    [downloads close];puts("native downloads: authenticated WAV download, cellular wait, malformed/partial responses, cancellation, real AVPlayer readiness and revocation passed");
    exit(0); // fixture intentionally bypasses production observer setup/teardown
}return 0;}
