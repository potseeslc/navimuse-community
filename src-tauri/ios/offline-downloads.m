#import "download-validation.h"
#import "offline-downloads.h"
#import "media-policy.h"
#import <AVFoundation/AVFoundation.h>
#import <math.h>

static NSError *NMDownloadError(NSString *text){return [NSError errorWithDomain:@"NaviMuseOffline" code:3 userInfo:@{NSLocalizedDescriptionKey:text}];}
static NSString *NMDownloadMIME(NSURL *file) {
    NSFileHandle *handle=[NSFileHandle fileHandleForReadingFromURL:file error:NULL];
    NSData *data=[handle readDataUpToLength:64 error:NULL];[handle closeFile];
    const unsigned char *b=data.bytes;NSUInteger n=data.length;
    if(n>=12 && !memcmp(b,"RIFF",4) && !memcmp(b+8,"WAVE",4))return @"audio/wav";
    if(n>=12 && !memcmp(b,"FORM",4) && (!memcmp(b+8,"AIFF",4)||!memcmp(b+8,"AIFC",4)))return @"audio/aiff";
    if(n>=4 && !memcmp(b,"fLaC",4))return @"audio/flac";
    if(n>=4 && !memcmp(b,"OggS",4))return @"audio/ogg";
    if(n>=12 && !memcmp(b+4,"ftyp",4))return @"audio/mp4";
    if(n>=3 && !memcmp(b,"ID3",3))return @"audio/mpeg";
    if(n>=2 && b[0]==0xff && (b[1]&0xf6)==0xf0)return @"audio/aac";
    if(n>=2 && b[0]==0xff && (b[1]&0xe0)==0xe0)return @"audio/mpeg";
    return nil;
}
// Objective-C retains the asynchronous key-loading API; the replacement named
// in the SDK deprecation message is Swift-only. Read properties only after load.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
static void NMValidateDownloadedAsset(AVURLAsset *asset, double expectedDuration, void (^completion)(BOOL)) {
    [asset loadValuesAsynchronouslyForKeys:@[@"playable",@"duration"] completionHandler:^{
        BOOL ready=[asset statusOfValueForKey:@"playable" error:NULL]==AVKeyValueStatusLoaded &&
            [asset statusOfValueForKey:@"duration" error:NULL]==AVKeyValueStatusLoaded;
        double duration=ready?CMTimeGetSeconds(asset.duration):0;
        if(!ready || !asset.playable || !NMDownloadedDurationComplete(duration,expectedDuration)){completion(NO);return;}
        [asset loadTracksWithMediaType:AVMediaTypeAudio completionHandler:^(NSArray<AVAssetTrack *> *tracks,NSError *error){completion(!error && tracks.count>0);}];
    }];
}
#pragma clang diagnostic pop
static const unsigned long long NMDownloadMaximum=1024ULL*1024*1024;
@interface NMOfflineDownloads ()
@property(nonatomic) NMOfflineAccess *access;
@property(nonatomic, readwrite) NMOfflineStore *store;
@property(nonatomic) NSURLSession *session;
@property(nonatomic) NSURLSessionDataTask *authorizationTask;
@property(nonatomic) NSMutableArray<NSDictionary *> *queue;
@property(nonatomic, nullable) NSDictionary *active;
@property(nonatomic) NSURLSessionDownloadTask *task;
@property(nonatomic) NSUInteger revision;
@property(nonatomic) NSUInteger received;
@property(nonatomic) long long expected;
@property(nonatomic) unsigned long long activeUsedBytes;
@property(nonatomic) unsigned long long activeFreeBytes;
@property(nonatomic) double lastProgress;
@property(nonatomic, readwrite) double transferBitsPerSecond;
@property(nonatomic, readwrite) double transferSampleTime;
@property(nonatomic) double transferWindowStart;
@property(nonatomic) long long transferWindowBytes;
@property(nonatomic, nullable) NSURL *validatingFile;
@end
@implementation NMOfflineDownloads
- (instancetype)initWithRootURL:(NSURL *)root {
    if((self=[super init])) {
        _access=[[NMOfflineAccess alloc]initWithStateURL:[root URLByAppendingPathComponent:@"access.json"]];
        _store=[[NMOfflineStore alloc]initWithRootURL:[root URLByAppendingPathComponent:@"music"] access:_access];
        _queue=[NSMutableArray new];_networkType=@"unknown";
        NSURLSessionConfiguration *config=NSURLSessionConfiguration.ephemeralSessionConfiguration;
        config.HTTPCookieStorage=nil;config.URLCache=nil;config.requestCachePolicy=NSURLRequestReloadIgnoringLocalCacheData;
        config.timeoutIntervalForRequest=30;config.timeoutIntervalForResource=600;
        _session=[NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:NSOperationQueue.mainQueue];
    }return self;
}
- (void)notify {if(self.changed)self.changed();}
- (void)authorizeScope:(NSString *)scope cookies:(NSArray<NSHTTPCookie *> *)cookies completion:(void (^)(NSError *))completion {
    if(![scope isKindOfClass:NSString.class] || [scope rangeOfString:@"^queue-scope-v[12]:[a-f0-9]{64}$" options:NSRegularExpressionSearch].location==NSNotFound){completion(NMDownloadError(@"Sign in before downloading music."));return;}
    NSString *old=[self.store snapshot][@"scope"];
    if(old && ![old isEqual:scope])[self invalidateAccess];
    [self.authorizationTask cancel];NSUInteger revision=++self.revision;
    NSURLComponents *url=[NSURLComponents componentsWithString:@"https://navimuse.example.com/api/navidrome/offline-access"];
    url.queryItems=@[[NSURLQueryItem queryItemWithName:@"accountScope" value:scope]];
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url.URL];request.timeoutInterval=15;
    [request setAllHTTPHeaderFields:[NSHTTPCookie requestHeaderFieldsWithCookies:cookies]];
    __weak NMOfflineDownloads *weak=self;
    self.authorizationTask=[self.session dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){
        NMOfflineDownloads *strong=weak;if(!strong || revision!=strong.revision){completion(NMDownloadError(@"Account changed. Retry the download."));return;}
        strong.authorizationTask=nil;
        NSInteger status=[response isKindOfClass:NSHTTPURLResponse.class]?[(NSHTTPURLResponse *)response statusCode]:0;
        if([@[@401,@403,@409] containsObject:@(status)]){[strong invalidateAccess];completion(NMDownloadError(@"Music access changed. Sign in again to use downloads."));return;}
        if(error || status!=200 || data.length==0 || data.length>16384){completion(NMDownloadError(@"Connect to NaviMuse to authorize downloads."));return;}
        id grant=[NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];NSError *failure=nil;
        if(![strong.access acceptResponse:grant expectedScope:scope nowMS:NSDate.date.timeIntervalSince1970*1000 uptime:NSProcessInfo.processInfo.systemUptime error:&failure]){[strong stopPending];[strong notify];completion(failure);return;}
        [strong notify];completion(nil);
    }];[self.authorizationTask resume];
}
- (BOOL)enqueueSongs:(NSArray *)songs format:(NSString *)format bitrate:(NSNumber *)bitrate cookies:(NSArray<NSHTTPCookie *> *)cookies error:(NSError **)error {
    if(![songs isKindOfClass:NSArray.class] || songs.count==0 || songs.count>500 || ![@[@"raw",@"mp3",@"opus"] containsObject:format] || ![bitrate isKindOfClass:NSNumber.class] || ![@[@0,@64,@96,@128,@160,@192,@256,@320] containsObject:bitrate]){if(error)*error=NMDownloadError(@"Invalid download selection.");return NO;}
    NSString *scope=[self.store snapshot][@"scope"];if(!scope){if(error)*error=NMDownloadError(@"Reconnect to authorize downloaded music.");return NO;}
    NSMutableArray *selected=[NSMutableArray new];
    for(id song in songs) {
        if(![song isKindOfClass:NSDictionary.class])continue;
        NSString *songID=song[@"id"];if(![songID isKindOfClass:NSString.class])continue;
        songID=[self.store storedSongID:songID]?:songID;BOOL exists=[self.active[@"songID"] isEqual:songID];
        for(NSDictionary *queued in self.queue)if([queued[@"songID"] isEqual:songID])exists=YES;
        if(!exists)[selected addObject:song];
    }
    NSArray *added=[self.store beginSongs:selected error:error];if(!added)return NO;
    for(NSDictionary *item in added)[self.queue addObject:@{@"songID":item[@"songID"],@"scope":scope,@"ticket":item[@"ticket"],@"format":format,@"bitrate":bitrate,@"cookies":[cookies copy]}];
    [self notify];[self advance];return YES;
}
- (void)prioritizeSongs:(NSArray *)songs {
    NSMutableDictionary *order=[NSMutableDictionary new];
    for(NSUInteger i=0;i<songs.count;i++){NSString *songID=songs[i][@"id"];if([songID isKindOfClass:NSString.class])order[songID]=@(i);}
    [self.queue sortUsingComparator:^NSComparisonResult(NSDictionary *a,NSDictionary *b){return [order[a[@"songID"]]?:@(NSUIntegerMax) compare:order[b[@"songID"]]?:@(NSUIntegerMax)];}];
}
- (BOOL)networkAllowed {return ![self.networkType isEqual:@"offline"] && (self.store.allowsCellular || [@[@"wifi",@"wired"] containsObject:self.networkType]);}
- (void)setNetworkType:(NSString *)networkType {if(![_networkType isEqual:networkType]){self.transferSampleTime=0;self.transferBitsPerSecond=0;self.transferWindowStart=0;self.transferWindowBytes=0;}_networkType=[networkType copy];[self preferencesChanged];}
- (void)preferencesChanged {
    if(![self networkAllowed] && self.active){NSDictionary *job=self.active;[self stopActive];[self.store setState:@"queued" songID:job[@"songID"] ticket:job[@"ticket"] message:@"Waiting for an allowed network." error:NULL];[self.queue insertObject:job atIndex:0];}
    [self notify];[self advance];
}
- (void)setPausedForPlayback:(BOOL)paused {
    if(_pausedForPlayback==paused)return;
    _pausedForPlayback=paused;self.transferWindowStart=0;self.transferWindowBytes=0;
    if(paused){if(self.task.state==NSURLSessionTaskStateRunning)[self.task suspend];}
    else {if(self.task.state==NSURLSessionTaskStateSuspended)[self.task resume];[self advance];}
}
- (void)advance {
    if(self.pausedForPlayback || self.active || !self.queue.count || ![self networkAllowed])return;
    NSDictionary *job=self.queue.firstObject;[self.queue removeObjectAtIndex:0];
    if(![[self.store snapshot][@"scope"] isEqual:job[@"scope"]]){[self stopPending];[self notify];return;}
    NSError *error=nil;
    if(![self.store setState:@"downloading" songID:job[@"songID"] ticket:job[@"ticket"] message:nil error:&error]){[self notify];[self advance];return;}
    self.active=job;self.received=0;self.expected=-1;self.lastProgress=0;
    self.activeUsedBytes=[self.store usedBytes];
    self.activeFreeBytes=[[NSFileManager.defaultManager attributesOfFileSystemForPath:NSTemporaryDirectory() error:NULL][NSFileSystemFreeSize] unsignedLongLongValue];
    if(self.activeFreeBytes<128ULL*1024*1024){[self failActive:@"The device needs more free space to download music."];return;}
    NSMutableCharacterSet *allowed=[NSCharacterSet.URLPathAllowedCharacterSet mutableCopy];[allowed removeCharactersInString:@"/%?#"];
    NSString *idPart=[job[@"songID"] stringByAddingPercentEncodingWithAllowedCharacters:allowed];
    NSURLComponents *url=[NSURLComponents componentsWithString:[@"https://navimuse.example.com/api/navidrome/stream/" stringByAppendingString:idPart]];
    url.queryItems=@[[NSURLQueryItem queryItemWithName:@"accountScope" value:job[@"scope"]],[NSURLQueryItem queryItemWithName:@"format" value:job[@"format"]],[NSURLQueryItem queryItemWithName:@"maxBitRate" value:[job[@"format"] isEqual:@"raw"]?@"0":[job[@"bitrate"] stringValue]]];
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url.URL];request.allowsCellularAccess=self.store.allowsCellular;request.allowsExpensiveNetworkAccess=self.store.allowsCellular;request.allowsConstrainedNetworkAccess=self.store.allowsCellular;
    [request setAllHTTPHeaderFields:[NSHTTPCookie requestHeaderFieldsWithCookies:job[@"cookies"]]];
    self.task=[self.session downloadTaskWithRequest:request];[self.task resume];[self notify];
}
- (NSDictionary *)snapshot {
    NSMutableDictionary *snapshot=[[self.store snapshot] mutableCopy];
    if(self.active)snapshot[@"progress"]=@{@"songID":self.active[@"songID"],@"receivedBytes":@(self.received),@"expectedBytes":@(self.expected)};
    snapshot[@"waitingForNetwork"]=(self.queue.count>0 && ![self networkAllowed])?@YES:@NO;return snapshot;
}
- (void)stopActive {
    self.active=nil;[self.task cancel];self.task=nil;self.received=0;self.expected=-1;
    if(self.validatingFile)[NSFileManager.defaultManager removeItemAtURL:self.validatingFile error:NULL];self.validatingFile=nil;
}
- (void)stopPending {
    for(NSDictionary *job in self.queue)[self.store setState:@"failed" songID:job[@"songID"] ticket:job[@"ticket"] message:@"Download interrupted. Retry when connected." error:NULL];
    [self.queue removeAllObjects];
    NSDictionary *active=self.active;[self stopActive];if(active)[self.store setState:@"failed" songID:active[@"songID"] ticket:active[@"ticket"] message:@"Download interrupted. Retry when connected." error:NULL];
}
- (void)suspend {self.revision++;[self.authorizationTask cancel];self.authorizationTask=nil;[self stopPending];[self notify];}
- (void)invalidateAccess {self.revision++;[self.authorizationTask cancel];self.authorizationTask=nil;[self stopPending];[self.access invalidate];[self notify];}
- (void)close {self.changed=nil;self.revision++;[self stopPending];[self.authorizationTask cancel];self.authorizationTask=nil;[self.session invalidateAndCancel];}
- (void)cancelSongID:(NSString *)songID {
    songID=[self.store storedSongID:songID]?:songID;
    NSMutableArray *removed=[NSMutableArray new];for(NSDictionary *job in self.queue)if([job[@"songID"] isEqual:songID])[removed addObject:job];
    [self.queue removeObjectsInArray:removed];
    if([self.active[@"songID"] isEqual:songID]){[removed addObject:self.active];[self stopActive];}
    for(NSDictionary *job in removed)[self.store setState:@"cancelled" songID:songID ticket:job[@"ticket"] message:@"Download cancelled." error:NULL];
    [self notify];[self advance];
}
- (BOOL)removeSongID:(NSString *)songID error:(NSError **)error {[self cancelSongID:songID];BOOL ok=[self.store removeSongID:songID error:error];[self notify];return ok;}
- (BOOL)clear:(NSError **)error {[self stopPending];BOOL ok=[self.store clearCurrentScope:error];[self notify];return ok;}
- (BOOL)clearAllDownloadedMusic:(NSError **)error {[self stopPending];BOOL ok=[self.store clearAllDownloadedMusic:error];[self notify];return ok;}
- (void)failActive:(NSString *)message {
    NSDictionary *job=self.active;[self stopActive];if(job)[self.store setState:@"failed" songID:job[@"songID"] ticket:job[@"ticket"] message:message error:NULL];[self notify];[self advance];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {completionHandler(nil);}
- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)task didWriteData:(int64_t)bytesWritten totalBytesWritten:(int64_t)totalBytesWritten totalBytesExpectedToWrite:(int64_t)totalBytesExpectedToWrite {
    if(task!=self.task)return;
    double sampleNow=NSProcessInfo.processInfo.systemUptime;
    if(!self.transferWindowStart){self.transferWindowStart=sampleNow;self.transferWindowBytes=0;}
    self.transferWindowBytes+=MAX(0,bytesWritten);
    if(sampleNow-self.transferWindowStart>=2){
        self.transferBitsPerSecond=8.0*self.transferWindowBytes/(sampleNow-self.transferWindowStart);
        self.transferSampleTime=sampleNow;self.transferWindowStart=sampleNow;self.transferWindowBytes=0;
    }
    self.received=MAX(0,totalBytesWritten);self.expected=totalBytesExpectedToWrite;
    unsigned long long used=self.activeUsedBytes,limit=self.store.budgetBytes;
    if(totalBytesWritten<0 || (unsigned long long)totalBytesWritten>NMDownloadMaximum || (totalBytesExpectedToWrite>0 && (unsigned long long)totalBytesExpectedToWrite>NMDownloadMaximum) || (limit && (used>=limit || self.received>limit-used || (totalBytesExpectedToWrite>0 && (unsigned long long)totalBytesExpectedToWrite>limit-used)))){[self failActive:@"Download storage limit reached or song is too large."];return;}
    if(self.received>self.activeFreeBytes-128ULL*1024*1024){[self failActive:@"The device needs more free space to download music."];return;}
    double now=NSProcessInfo.processInfo.systemUptime;
    if(now-self.lastProgress>=.25){self.lastProgress=now;[self notify];}
}
- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)task didFinishDownloadingToURL:(NSURL *)location {
    if(task!=self.task || !self.active)return;
    NSHTTPURLResponse *response=[task.response isKindOfClass:NSHTTPURLResponse.class]?(id)task.response:nil;
    NSInteger status=response.statusCode;
    if([@[@401,@403,@409] containsObject:@(status)]){[self invalidateAccess];return;}
    NSString *type=response.MIMEType.lowercaseString;
    BOOL audio=[type hasPrefix:@"audio/"] || [@[@"application/ogg",@"application/octet-stream"] containsObject:type?:@""];
    NSDictionary *attrs=[NSFileManager.defaultManager attributesOfItemAtPath:location.path error:NULL];
    unsigned long long bytes=[attrs[NSFileSize] unsignedLongLongValue];
    if(status!=200 || !audio || bytes==0 || bytes>NMDownloadMaximum || (response.expectedContentLength>=0 && bytes!=(unsigned long long)response.expectedContentLength)){[self failActive:@"The server did not return a complete audio file."];return;}
    // NSURLSession deletes its file after this delegate returns. Retain under a
    // generated temporary name until AVFoundation validates actual audio tracks.
    NSURL *retained=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingString:@".nmvalidation"]]];
    NSError *error=nil;if(![NSFileManager.defaultManager moveItemAtURL:location toURL:retained error:&error]){[self failActive:@"Unable to save the downloaded file."];return;}
    self.validatingFile=retained;NSDictionary *job=self.active;
    NSString *mime=NMDownloadMIME(retained);
    if(!mime){[self failActive:@"The downloaded file has no supported audio container."];return;}
    AVURLAsset *asset=[AVURLAsset URLAssetWithURL:retained options:@{AVURLAssetOverrideMIMETypeKey:mime,AVURLAssetReferenceRestrictionsKey:@(AVAssetReferenceRestrictionForbidAll)}];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,15*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        if(self.active==job && [self.validatingFile isEqual:retained]){[asset cancelLoading];[self failActive:@"Audio validation timed out. Retry the download."];}
    });
    double expectedDuration=0;
    for(NSDictionary *record in [self.store snapshot][@"tracks"])if([record[@"song"][@"id"] isEqual:job[@"songID"]]){expectedDuration=[record[@"song"][@"duration"] doubleValue];break;}
    NMValidateDownloadedAsset(asset,expectedDuration,^(BOOL playable){
        dispatch_async(dispatch_get_main_queue(),^{
            if(self.active!=job || ![self.validatingFile isEqual:retained]){[NSFileManager.defaultManager removeItemAtURL:retained error:NULL];return;}
            if(!playable){[self failActive:@"The downloaded file is incomplete or has no playable audio."];return;}
            NSError *failure=nil;
            if(![self.store installFile:retained mimeType:mime songID:job[@"songID"] ticket:job[@"ticket"] error:&failure]){[self failActive:failure.localizedDescription?:@"Unable to save downloaded music."];return;}
            self.validatingFile=nil;self.active=nil;self.task=nil;self.received=0;[self notify];[self advance];
        });
    });
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
    if(task!=self.task || !error)return;
    [self failActive:@"Download interrupted. Retry when connected."];
}
@end
