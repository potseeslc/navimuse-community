#import "album-queue.h"
#import "stream-timing.h"
#import "playback-log.h"
#import "carplay.h"
#import "playback-checkpoint.h"
#import "network-handoff.h"
#import "stream-cache.h"
#import "safety-cache-policy.h"
#import "nearby-speakers.h"
#import <AVFoundation/AVFoundation.h>
#import <AVKit/AVKit.h>
#import <MediaPlayer/MediaPlayer.h>
#import <WebKit/WebKit.h>
#import <UIKit/UIKit.h>
#import <Network/Network.h>
#import <objc/runtime.h>
#import "media-policy.h"
#import "stream-recovery.h"
#import "media-services-recovery.h"
#import "listening-ledger.h"
#import "playback-start.h"
#import "stream-details.h"
#import "navigation-recovery.h"
#import "offline-downloads.h"

static NSString *NMOnlineShellHTML;
void navimuse_install_online_shell(const char *html) { NMOnlineShellHTML=html?[NSString stringWithUTF8String:html]:nil; }
static NSString *NMOfflineShellHTML;
void navimuse_install_offline_shell(const char *html) { NMOfflineShellHTML=html?[NSString stringWithUTF8String:html]:nil; }

@interface NMNativeAudio : NSObject <WKScriptMessageHandlerWithReply, NSURLSessionTaskDelegate, AVRoutePickerViewDelegate>
@property(nonatomic,strong) NMListeningLedger *listeningLedger;
@property(nonatomic,strong) NMPlaybackCheckpoint *checkpoint;
@property(nonatomic) double checkpointAt;
@property(nonatomic) BOOL restoringCheckpoint;
@property(nonatomic) BOOL checkpointRequestPending;
@property(nonatomic) BOOL mediaResetPending;
@property(nonatomic,strong) MPNowPlayingSession *nowPlayingSession;
@property(nonatomic,strong) NSMutableArray *sessionEvents;
@property(nonatomic) double diagnosticSampleAt;
@property(nonatomic) NSTimeInterval sleepDeadline;
@property(nonatomic,strong) NSTimer *sleepTimer;
@property(nonatomic) BOOL offlineLaunch;
@property(nonatomic,strong) NMOfflineDownloads *downloads;
@property(nonatomic,strong) NMStreamCache *streamCache;
@property(nonatomic) BOOL safetyFallback;
@property(nonatomic) double safetyHealthySince;
@property(nonatomic) double safetyRequiredBitrate;
@property(nonatomic,copy) NSDictionary *lastSafetySnapshot;
@property(nonatomic) NSUInteger cachePlanRevision;
@property(nonatomic) UIBackgroundTaskIdentifier downloadBackgroundTask;
@property(nonatomic,strong) NSMutableArray<NSDictionary *> *downloadedDecks;
@property(nonatomic,weak) WKWebView *webview;
@property(nonatomic,strong) AVRoutePickerView *routePicker;
@property(nonatomic,strong) UIView *loadingView;
@property(nonatomic,strong) NMNavigationRecovery *navigationRecovery;
@property(nonatomic) NSInteger loadingRevision;
@property(nonatomic,strong) nw_path_monitor_t networkMonitor;
@property(nonatomic,copy) NSString *networkType;
@property(nonatomic) double networkHandoffAt;
@property(nonatomic,strong) NSArray<AVPlayer *> *players;
@property(nonatomic,strong) NSArray<NMAlbumQueue *> *albumQueues;
@property(nonatomic,strong) NSArray<NSHTTPCookie *> *albumCookies;
@property(nonatomic) NSUInteger albumPrepareRevision;
@property(nonatomic,strong) NSArray<NMStreamRecovery *> *recovery;
@property(nonatomic,strong) NSArray<NMPlaybackStart *> *starts;
@property(nonatomic,strong) NSMutableArray<NSNumber *> *generations;
@property(nonatomic,strong) NSMutableArray<NSNumber *> *ready;
@property(nonatomic,strong) NSMutableArray<NSDictionary *> *streamDetails;
@property(nonatomic,strong) NSMutableArray *observers;
@property(nonatomic,strong) NSMutableArray *remoteTargets;
@property(nonatomic,strong) NSString *page;
@property(nonatomic,strong) NSMutableDictionary *metadata;
@property(nonatomic,strong) NSURLSession *artSession;
@property(nonatomic,strong) NSURLSessionDataTask *artTask;
@property(nonatomic) NSInteger artRevision;
@property(nonatomic) NSInteger metadataRevision;
@property(nonatomic,copy) NSString *artURL;
@property(nonatomic) NSInteger active;
@property(nonatomic) BOOL previousEnabled;
@property(nonatomic) BOOL canGoPrevious;
@property(nonatomic) BOOL nextEnabled;
@property(nonatomic) BOOL resumeAfterInterruption;
@property(nonatomic) NSInteger commandID;
@property(nonatomic,strong) NSString *commandResult;
@end
@implementation NMNativeAudio
- (instancetype)init {
    if (!(self=[super init])) return nil;
    _recovery=@[[NMStreamRecovery new],[NMStreamRecovery new]];
    _players=@[[AVQueuePlayer new],[AVQueuePlayer new]]; _generations=[@[@0,@0] mutableCopy];_ready=[@[@NO,@NO] mutableCopy];_observers=[NSMutableArray new];_remoteTargets=[NSMutableArray new];_metadata=[NSMutableDictionary new];_active=0;
    _albumQueues=@[[[NMAlbumQueue alloc]initWithPlayer:(AVQueuePlayer *)_players[0]],[[NMAlbumQueue alloc]initWithPlayer:(AVQueuePlayer *)_players[1]]];
    __weak NMNativeAudio *albumOwner=self;
    for(NSInteger deck=0;deck<2;deck++)_albumQueues[deck].promoted=^(NSDictionary *entry,AVPlayerItem *old){[albumOwner albumAdvanced:entry previous:old deck:deck];};
    _sessionEvents=[NMPlaybackLogPruned([NSUserDefaults.standardUserDefaults arrayForKey:@"NaviMusePlaybackEvents"]?:@[],NSDate.date.timeIntervalSince1970) mutableCopy];
    _nowPlayingSession=[[MPNowPlayingSession alloc]initWithPlayers:_players];
    _streamDetails=[@[@{},@{}] mutableCopy];
    _downloadedDecks=[@[@{},@{}] mutableCopy];
    _downloadBackgroundTask=UIBackgroundTaskInvalid;
    NSURL *support=[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
    _checkpoint=[[NMPlaybackCheckpoint alloc]initWithFile:[support URLByAppendingPathComponent:@"NaviMuseListening/resume.plist"]];
    _listeningLedger=[[NMListeningLedger alloc]initWithFile:[support URLByAppendingPathComponent:@"NaviMuseListening/ledger.json"]];
    _downloads=[[NMOfflineDownloads alloc]initWithRootURL:[support URLByAppendingPathComponent:@"NaviMuseOffline" isDirectory:YES]];
    _streamCache=[[NMStreamCache alloc]initWithRootURL:[support URLByAppendingPathComponent:@"NaviMuseSafetyCache-v1" isDirectory:YES]];
    __weak NMNativeAudio *downloadOwner=self;
    _downloads.changed=^{[downloadOwner downloadsChanged];};
    _streamCache.downloads.pausedForPlayback=YES;
    _streamCache.downloads.changed=^{[downloadOwner safetyCacheChanged];};
    _networkType=@"unknown";
    _networkMonitor=nw_path_monitor_create();
    __weak NMNativeAudio *weak=self;
    NMCarPlayHub.shared.send=^(NSDictionary *event){NMNativeAudio *owner=weak;if(owner && NMTrustedURL(owner.webview.URL))[owner send:event];};
    nw_path_monitor_set_queue(_networkMonitor,dispatch_get_main_queue());
    nw_path_monitor_set_update_handler(_networkMonitor,^(nw_path_t path){
        NMNativeAudio *strong=weak;if(!strong)return;
        NSString *previousNetwork=strong.networkType;
        strong.networkType=nw_path_get_status(path)!=nw_path_status_satisfied?@"offline":nw_path_uses_interface_type(path,nw_interface_type_cellular)?@"cellular":nw_path_uses_interface_type(path,nw_interface_type_wifi)?@"wifi":nw_path_uses_interface_type(path,nw_interface_type_wired)?@"wired":@"unknown";
        if(![previousNetwork isEqual:@"unknown"] && ![previousNetwork isEqual:strong.networkType])strong.networkHandoffAt=NSProcessInfo.processInfo.systemUptime;
        if(![previousNetwork isEqual:strong.networkType])[strong recordSessionEvent:@"network"];
        strong.downloads.networkType=strong.networkType;
        strong.streamCache.downloads.networkType=strong.networkType;
        [strong send:@{@"type":@"network",@"networkType":strong.networkType}];
        if(![strong.networkType isEqual:@"offline"] && strong.recovery[strong.active].wantsPlayback && strong.players[strong.active].timeControlStatus!=AVPlayerTimeControlStatusPlaying){if(strong.restoringCheckpoint&&!strong.players[strong.active].currentItem)[strong restoreCheckpoint];else [strong scheduleRecovery:strong.active];}
    });
    nw_path_monitor_start(_networkMonitor);
    [self attachPlayerObservers];
    NSNotificationCenter *nc=NSNotificationCenter.defaultCenter;
    [nc addObserver:self selector:@selector(stalled:) name:AVPlayerItemPlaybackStalledNotification object:nil];
    [nc addObserver:self selector:@selector(failedToEnd:) name:AVPlayerItemFailedToPlayToEndTimeNotification object:nil];
    [nc addObserver:self selector:@selector(ended:) name:AVPlayerItemDidPlayToEndTimeNotification object:nil];
    [nc addObserver:self selector:@selector(interrupted:) name:AVAudioSessionInterruptionNotification object:nil];
    [nc addObserver:self selector:@selector(mediaServicesLost:) name:AVAudioSessionMediaServicesWereLostNotification object:nil];
    [nc addObserver:self selector:@selector(mediaServicesReset:) name:AVAudioSessionMediaServicesWereResetNotification object:nil];
    [nc addObserver:self selector:@selector(routeChanged:) name:AVAudioSessionRouteChangeNotification object:nil];
    [self attachRemoteCommands];
    return self;
}
- (void)attachPlayerObservers {
    __weak NMNativeAudio *weak=self;
    for(AVPlayer *player in _players) {
        player.allowsExternalPlayback=YES;
        player.automaticallyWaitsToMinimizeStalling=YES;
        [player addObserver:self forKeyPath:@"timeControlStatus" options:0 context:NULL];
        [player addObserver:self forKeyPath:@"status" options:0 context:NULL];
        __weak AVPlayer *weakPlayer=player;
        id observer=[player addPeriodicTimeObserverForInterval:CMTimeMakeWithSeconds(0.5,600) queue:dispatch_get_main_queue() usingBlock:^(CMTime time){
            (void)time;
            NMNativeAudio *strong=weak;if(!strong)return;
            [strong sampleListening:strong.active];
            if([strong expireSleepTimer])return;
            NSInteger index=[strong.players indexOfObject:weakPlayer];
            if(index!=NSNotFound){
                if(strong.downloadedDecks.count>index && [strong.downloadedDecks[index] count] && ![strong downloadedDeckAllowed:index]){[strong terminalFailure:index];[strong replaceItem:nil deck:index];return;}
                NMStreamRecovery *state=strong.recovery[index];
                double seconds=CMTimeGetSeconds(weakPlayer.currentTime);
                [state observePosition:seconds];
                if(weakPlayer.timeControlStatus==AVPlayerTimeControlStatusPlaying){
                    if(state.stableSince==0)state.stableSince=NSProcessInfo.processInfo.systemUptime;
                    if(NSProcessInfo.processInfo.systemUptime-state.stableSince>=15){state.attempts=0;state.retryAfter=0;}
                }else state.stableSince=0;
            }
            if(index==strong.active && strong.recovery[index].wantsPlayback && NSProcessInfo.processInfo.systemUptime-strong.diagnosticSampleAt>=30){strong.diagnosticSampleAt=NSProcessInfo.processInfo.systemUptime;[strong recordSessionEvent:@"sample"];}
            if(index==strong.active){[strong updateSafetyBuffer];if(NSProcessInfo.processInfo.systemUptime-strong.checkpointAt>=5)[strong saveCheckpoint];}
            if(index==strong.active && UIApplication.sharedApplication.applicationState==UIApplicationStateActive){[strong emit:@"timeupdate" deck:index];[strong publish];}
        }];
        [_observers addObject:observer];
    }
}
- (void)attachRemoteCommands {
    __weak NMNativeAudio *weak=self;
    MPRemoteCommandCenter *center=self.nowPlayingSession.remoteCommandCenter;
    NSDictionary *commands=@{@"play":center.playCommand,@"pause":center.pauseCommand,@"toggle":center.togglePlayPauseCommand,@"nexttrack":center.nextTrackCommand,@"previoustrack":center.previousTrackCommand,@"seek":center.changePlaybackPositionCommand};
    for(NSString *action in commands) {
        MPRemoteCommand *command=commands[action];
        id target=[command addTargetWithHandler:^MPRemoteCommandHandlerStatus(MPRemoteCommandEvent *event){
            NMNativeAudio *strong=weak;
            return strong ? [strong remote:action event:event] : MPRemoteCommandHandlerStatusNoSuchContent;
        }];
        [_remoteTargets addObject:@[command,target]];
    }
    center.skipBackwardCommand.enabled=NO;center.skipForwardCommand.enabled=NO;
    center.previousTrackCommand.enabled=self.previousEnabled;center.nextTrackCommand.enabled=self.nextEnabled;
    center.playCommand.enabled=YES;center.pauseCommand.enabled=YES;center.togglePlayPauseCommand.enabled=YES;center.changePlaybackPositionCommand.enabled=YES;
}
- (void)detachPlayers {
    for(NSInteger i=0;i<(NSInteger)self.players.count;i++) {
        AVPlayer *player=self.players[i];
        [player removeTimeObserver:self.observers[i]];
        [player removeObserver:self forKeyPath:@"timeControlStatus"];
        [player removeObserver:self forKeyPath:@"status"];
        [self replaceItem:nil deck:i];
        [player pause];
    }
    [self.observers removeAllObjects];
    for(NSArray *pair in self.remoteTargets)[(MPRemoteCommand *)pair[0] removeTarget:pair[1]];
    [self.remoteTargets removeAllObjects];
}
- (void)mediaServicesLost:(NSNotification *)notification {
    [self recordSessionEvent:@"media-services-lost"];
}
- (void)mediaServicesReset:(NSNotification *)notification {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self mediaServicesReset:notification];});return;}
    if(self.mediaResetPending)return;
    self.mediaResetPending=YES;
    [self recordSessionEvent:@"media-services-reset"];
    // Revoke every pending seek, preroll and network retry before leaving KVO.
    [self saveCheckpoint];
    self.resumeAfterInterruption=NO;
    self.checkpointRequestPending=NO;
    for(NSInteger i=0;i<self.players.count;i++) {
        [self.recovery[i] observePosition:CMTimeGetSeconds(self.players[i].currentTime)];
        [self.recovery[i] cancel];self.recovery[i].restoring=YES;
        [self cancelStart:i];
    }
    // Do not destroy an observed AVPlayer while its KVO callback is on the stack.
    dispatch_async(dispatch_get_main_queue(),^{[self rebuildMediaPlayers];});
}
- (void)rebuildMediaPlayers {
    NSArray *volumes=@[@(self.players[0].volume),@(self.players[1].volume)];
    NSArray *muted=@[@(self.players[0].muted),@(self.players[1].muted)];
    [self detachPlayers];
    self.nowPlayingSession=nil;self.albumQueues=nil;
    self.players=@[[AVQueuePlayer new],[AVQueuePlayer new]];
    self.albumQueues=@[[[NMAlbumQueue alloc]initWithPlayer:(AVQueuePlayer *)self.players[0]],[[NMAlbumQueue alloc]initWithPlayer:(AVQueuePlayer *)self.players[1]]];
    __weak NMNativeAudio *weak=self;
    for(NSInteger i=0;i<2;i++) {
        self.players[i].volume=[volumes[i] floatValue];self.players[i].muted=[muted[i] boolValue];
        self.albumQueues[i].promoted=^(NSDictionary *entry,AVPlayerItem *old){[weak albumAdvanced:entry previous:old deck:i];};
    }
    self.nowPlayingSession=[[MPNowPlayingSession alloc]initWithPlayers:self.players];
    [self attachPlayerObservers];[self attachRemoteCommands];
    // Apple's reset contract requires recreating audio objects and configuration,
    // but playback/activation must wait for an explicit user action.
    NSError *error=nil;
    [AVAudioSession.sharedInstance setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault routeSharingPolicy:AVAudioSessionRouteSharingPolicyLongFormAudio options:0 error:&error];
    if(error)[self recordSessionEvent:@"audio-session-configuration-failed"];
    NSDictionary *saved=[self.checkpoint read];
    self.restoringCheckpoint=saved && [saved[@"url"] isEqual:self.recovery[self.active].url.absoluteString];
    self.mediaResetPending=NO;
    [self recordSessionEvent:@"media-player-rebuilt"];
    for(NSInteger i=0;i<2;i++)if(self.recovery[i].url)[self emit:@"mediareset" deck:i];
    [self publish];
}
- (MPRemoteCommandHandlerStatus)remote:(NSString *)action event:(MPRemoteCommandEvent *)event {
    if(!NSThread.isMainThread){__block MPRemoteCommandHandlerStatus result;dispatch_sync(dispatch_get_main_queue(),^{result=[self remote:action event:event];});return result;}
            if(self.mediaResetPending)return MPRemoteCommandHandlerStatusCommandFailed;
            [self recordSessionEvent:[@"remote-" stringByAppendingString:action]];
            if(!self.players[self.active].currentItem){
                if(self.restoringCheckpoint && ([action isEqual:@"pause"]||([action isEqual:@"toggle"]&&self.recovery[self.active].wantsPlayback))){
                    // Keep the authorized load in flight but revoke only play intent.
                    // Its completion may prepare the item; it must not start audio.
                    self.recovery[self.active].wantsPlayback=NO;[self recordSessionEvent:@"remote-paused-checkpoint"];return MPRemoteCommandHandlerStatusSuccess;
                }
                if(self.restoringCheckpoint && self.recovery[self.active].url && ([action isEqual:@"play"]||[action isEqual:@"toggle"])){
                    if(![self activate])return MPRemoteCommandHandlerStatusCommandFailed;
                    self.recovery[self.active].wantsPlayback=YES;[self restoreCheckpoint];[self recordSessionEvent:@"remote-awaiting-checkpoint"];return MPRemoteCommandHandlerStatusSuccess;
                }
                [self recordSessionEvent:@"remote-no-item"];return MPRemoteCommandHandlerStatusNoSuchContent;
            }
            [self emitAlbumReceipt:self.active];
            [self send:@{@"type":@"remote",@"action":action}];
            if([action isEqual:@"previoustrack"] && (CMTimeGetSeconds(self.players[self.active].currentTime)>3 || !self.canGoPrevious)) {
                [self seek:0 deck:self.active];return MPRemoteCommandHandlerStatusSuccess;
            }
            if([action isEqual:@"nexttrack"] || [action isEqual:@"previoustrack"]) {
                if(!self.page){[self recordSessionEvent:@"queue-interface-unavailable"];return MPRemoteCommandHandlerStatusCommandFailed;}
                if(([action isEqual:@"nexttrack"] && !self.nextEnabled)||([action isEqual:@"previoustrack"]&&!self.previousEnabled))return MPRemoteCommandHandlerStatusNoSuchContent;
                self.commandID++;self.commandResult=@"pending";
                [self send:@{@"type":@"command",@"action":action,@"id":@(self.commandID)}];
            } else if([action isEqual:@"seek"]) {
                [self seek:((MPChangePlaybackPositionCommandEvent *)event).positionTime deck:self.active];
            } else if([action isEqual:@"pause"] || ([action isEqual:@"toggle"] && self.recovery[self.active].wantsPlayback)) {
                self.resumeAfterInterruption=NO;[self pauseDeck:self.active];[self emit:@"pause" deck:self.active];[self publish];
            } else {
                if(![self activate])return MPRemoteCommandHandlerStatusCommandFailed;
                [self playDeck:self.active];
            }
            return MPRemoteCommandHandlerStatusSuccess;
}
- (void)sampleListening:(NSInteger)deck {
    AVPlayer *player=self.players[deck];
    BOOL playing=deck==self.active && self.recovery[deck].wantsPlayback && !self.recovery[deck].restoring && player.timeControlStatus==AVPlayerTimeControlStatusPlaying;
    BOOL ready=[self.listeningLedger sampleDeck:deck position:CMTimeGetSeconds(player.currentTime) duration:CMTimeGetSeconds(player.currentItem.duration) playing:playing uptime:NSProcessInfo.processInfo.systemUptime];
    if(ready && UIApplication.sharedApplication.applicationState==UIApplicationStateActive)[self send:@{@"type":@"listeningReady"}];
}
- (void)safetyCacheChanged {
    NSDictionary *snapshot=[self.streamCache.downloads snapshot];
    NSMutableArray *ready=[NSMutableArray new];
    for(NSDictionary *track in snapshot[@"tracks"]){NSString *songID=track[@"song"][@"id"];if([track[@"state"] isEqual:@"complete"] && [self.streamCache.downloads.store mediaForSongID:songID scope:snapshot[@"scope"]])[ready addObject:songID];}
    NSDictionary *event=@{@"type":@"safetycache",@"scope":snapshot[@"scope"]?:@"",@"ready":ready};
    if(![event isEqual:self.lastSafetySnapshot]){self.lastSafetySnapshot=event;[self send:event];}
}
- (void)updateSafetyBuffer {
    AVPlayer *player=self.players[self.active];AVPlayerItem *item=player.currentItem;
    double position=CMTimeGetSeconds(player.currentTime),buffer=0;
    for(NSValue *value in item.loadedTimeRanges){CMTimeRange range=value.CMTimeRangeValue;double start=CMTimeGetSeconds(range.start),end=CMTimeGetSeconds(CMTimeRangeGetEnd(range));if(start<=position+.25 && end>position)buffer=MAX(buffer,end-position);}
    BOOL local=[self.downloadedDecks[self.active] count]>0;
    double duration=CMTimeGetSeconds(item.duration);
    BOOL complete=isfinite(duration)&&duration>0&&position+buffer>=duration-.5;
    BOOL playing=self.recovery[self.active].wantsPlayback;
    BOOL waiting=playing && player.timeControlStatus!=AVPlayerTimeControlStatusPlaying;
    // Hysteresis: stop below 20 seconds, resume above 60. Startup always wins.
    self.streamCache.downloads.pausedForPlayback=NMSafetyShouldPause(self.streamCache.downloads.pausedForPlayback,playing,waiting,local,complete,buffer);
    double now=NSProcessInfo.processInfo.systemUptime;
    AVPlayerItemAccessLogEvent *event=item.accessLog.events.lastObject;
    double required=event.indicatedBitrate;
    if(required<=0)required=[self.streamDetails[self.active][@"estimatedBitRate"] doubleValue];
    if(!local && required>0)self.safetyRequiredBitrate=MAX(self.safetyRequiredBitrate,required);
    required=self.safetyRequiredBitrate>0?self.safetyRequiredBitrate:1500000;
    double measured=local?self.streamCache.downloads.transferBitsPerSecond:event.observedBitrate;
    double sampleAge=local?now-self.streamCache.downloads.transferSampleTime:0;
    BOOL healthy=![self.networkType isEqual:@"offline"]&&NMSafetyHealthy(playing,waiting,local,complete,buffer,measured,required,sampleAge);
    if(healthy){if(!self.safetyHealthySince)self.safetyHealthySince=now;if(now-self.safetyHealthySince>=30)self.safetyFallback=NO;}
    else self.safetyHealthySince=0;
    if(playing&&!local&&!complete&&![self startState:self.active].seeking&&![self startState:self.active].pending&&buffer<5&&measured>0&&measured<required){self.safetyFallback=YES;self.safetyHealthySince=0;[self restoreFromSafetyCache:self.active];}
}
- (NSDictionary *)offlineSnapshot {
    NSMutableDictionary *snapshot=[[self.downloads snapshot] mutableCopy];snapshot[@"offlineLaunch"]=@(self.offlineLaunch);return snapshot;
}
- (BOOL)offlinePlaybackAllowed {
    NSDictionary *snapshot=[self.downloads snapshot];
    return !self.offlineLaunch || ([snapshot[@"available"] boolValue] && [snapshot[@"outputOwnership"][@"state"] isEqual:@"local"]);
}
- (void)openOffline {
    if(!NMOfflineShellHTML.length)return;
    [self.webview stopLoading];[self.downloads suspend];[self reset];self.page=nil;self.offlineLaunch=YES;
    [self.webview loadHTMLString:NMOfflineShellHTML baseURL:[NSURL URLWithString:@"https://navimuse.example.com"]];
}
- (void)reconnect {
    [self saveCheckpoint];NSDictionary *saved=[self.checkpoint read];[self reset];if(saved)[self.checkpoint save:saved];self.page=nil;self.offlineLaunch=NO;[self showLoading];
    if(NMOnlineShellHTML.length){[self.webview stopLoading];[self.webview loadHTMLString:NMOnlineShellHTML baseURL:[NSURL URLWithString:@"https://navimuse.example.com"]];return;}
    [self.webview loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"https://navimuse.example.com"] cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:30]];
}
- (void)downloadsChanged {
    NSDictionary *snapshot=[self offlineSnapshot];
    [self send:@{@"type":@"offline",@"snapshot":snapshot}];
    if(snapshot[@"progress"] && self.downloadBackgroundTask==UIBackgroundTaskInvalid){
        __weak NMNativeAudio *weak=self;
        self.downloadBackgroundTask=[UIApplication.sharedApplication beginBackgroundTaskWithName:@"Finish music download" expirationHandler:^{
            NMNativeAudio *strong=weak;if(!strong)return;[strong.downloads suspend];
        }];
    }else if(!snapshot[@"progress"] && self.downloadBackgroundTask!=UIBackgroundTaskInvalid){
        UIBackgroundTaskIdentifier task=self.downloadBackgroundTask;self.downloadBackgroundTask=UIBackgroundTaskInvalid;
        [UIApplication.sharedApplication endBackgroundTask:task];
    }
    for(NSInteger deck=0;deck<(NSInteger)self.downloadedDecks.count;deck++)if([self.downloadedDecks[deck] count] && ![self downloadedDeckAllowed:deck]){[self terminalFailure:deck];[self replaceItem:nil deck:deck];}
}
- (BOOL)downloadedDeckAllowed:(NSInteger)deck {
    if(![self offlinePlaybackAllowed])return NO;
    if(self.downloadedDecks.count<=deck || ![self.downloadedDecks[deck] count])return YES;
    NSDictionary *item=self.downloadedDecks[deck];
    NMOfflineStore *store=[item[@"cached"] boolValue]?self.streamCache.downloads.store:self.downloads.store;
    return [store mediaForSongID:item[@"songID"] scope:item[@"scope"]]!=nil;
}
- (NSDictionary *)downloadForStream:(NSURL *)url {
    if(![self offlinePlaybackAllowed])return nil;
    NSString *prefix=@"/api/navidrome/stream/";
    NSURLComponents *parts=[NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
    if(!NMTrustedURL(url)||![parts.percentEncodedPath hasPrefix:prefix])return nil;
    NSString *songID=[[parts.percentEncodedPath substringFromIndex:prefix.length] stringByRemovingPercentEncoding];
    NSString *scope=nil;NSUInteger count=0;
    for(NSURLQueryItem *item in parts.queryItems)if([item.name isEqual:@"accountScope"]){scope=item.value;count++;}
    if(count>1)return nil;
    if(!scope){NSString *active=[self.downloads snapshot][@"scope"];if([active hasPrefix:@"queue-scope-v1:"])scope=active;}
    if(!scope || !songID)return nil;
    NSURL *file=[self.downloads.store mediaForSongID:songID scope:scope];
    NSString *mime=[self.downloads.store mimeTypeForSongID:songID scope:scope];
    if(!file && !self.safetyFallback && !self.offlineLaunch && ![self.networkType isEqual:@"offline"])return nil;
    if(!file){NSString *format=@"raw",*bitrate=@"0";for(NSURLQueryItem *part in parts.queryItems){if([part.name isEqual:@"format"])format=part.value;if([part.name isEqual:@"maxBitRate"])bitrate=part.value;}return [self.streamCache media:songID scope:scope format:format bitrate:bitrate];}
    return file && mime?@{@"songID":songID,@"scope":scope,@"file":file,@"mimeType":mime}:nil;
}
- (void)dealloc {
    [self.sleepTimer invalidate];
    [self.downloads close];[self.streamCache.downloads close];
    if(self.downloadBackgroundTask!=UIBackgroundTaskInvalid)[UIApplication.sharedApplication endBackgroundTask:self.downloadBackgroundTask];
    if(self.networkMonitor)nw_path_monitor_cancel(self.networkMonitor);
    [NSNotificationCenter.defaultCenter removeObserver:self];
    [self.webview removeObserver:self forKeyPath:@"URL"];
    [self.webview removeObserver:self forKeyPath:@"loading"];
    for(NSInteger i=0;i<(NSInteger)self.players.count;i++) {
        AVPlayer *player=self.players[i];
        [player removeTimeObserver:self.observers[i]];
        [player removeObserver:self forKeyPath:@"timeControlStatus"];
        [player removeObserver:self forKeyPath:@"status"];
        if(player.currentItem){[player.currentItem removeObserver:self forKeyPath:@"status"];[player.currentItem removeObserver:self forKeyPath:@"tracks"];}
        [player pause];
    }
    for(NSArray *pair in self.remoteTargets)[(MPRemoteCommand *)pair[0] removeTarget:pair[1]];
    [self.artSession invalidateAndCancel];
}
- (void)showLoading {[self showLoadingMessage:@"Connecting to NaviMuse…" retry:NO];}
- (void)showLoadingMessage:(NSString *)message retry:(BOOL)retryNow {
    [self.loadingView removeFromSuperview];
    UIView *view=[UIView new];view.backgroundColor=[UIColor colorWithRed:9/255.0 green:13/255.0 blue:15/255.0 alpha:1];view.frame=self.webview.bounds;view.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;self.loadingView=view;
    UILabel *label=[UILabel new];label.text=message;label.textColor=UIColor.whiteColor;label.textAlignment=NSTextAlignmentCenter;label.numberOfLines=0;
    UIButton *retry=[UIButton buttonWithType:UIButtonTypeSystem];[retry setTitle:@"Try Again" forState:UIControlStateNormal];retry.hidden=!retryNow;
    __weak NMNativeAudio *weak=self;
    [retry addAction:[UIAction actionWithHandler:^(UIAction *action){NMNativeAudio *strong=weak;if(!strong)return;[strong reconnect];}] forControlEvents:UIControlEventTouchUpInside];
    UIButton *offline=[UIButton buttonWithType:UIButtonTypeSystem];[offline setTitle:@"Open downloaded music" forState:UIControlStateNormal];offline.hidden=!NMOfflineShellHTML.length;
    [offline addAction:[UIAction actionWithHandler:^(UIAction *action){[weak openOffline];}] forControlEvents:UIControlEventTouchUpInside];
    [offline.heightAnchor constraintEqualToConstant:44].active=YES;
    UIStackView *stack=[[UIStackView alloc]initWithArrangedSubviews:@[label,retry,offline]];stack.axis=UILayoutConstraintAxisVertical;stack.spacing=24;stack.translatesAutoresizingMaskIntoConstraints=NO;[view addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[[stack.centerYAnchor constraintEqualToAnchor:view.centerYAnchor],[stack.leadingAnchor constraintEqualToAnchor:view.leadingAnchor constant:24],[stack.trailingAnchor constraintEqualToAnchor:view.trailingAnchor constant:-24],[retry.heightAnchor constraintEqualToConstant:44]]];
    [self.webview addSubview:view];NSInteger revision=++self.loadingRevision;
    if(retryNow)return;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,12*NSEC_PER_SEC),dispatch_get_main_queue(),^{NMNativeAudio *strong=weak;if(!strong||strong.loadingRevision!=revision)return;label.text=@"NaviMuse hasn’t loaded yet. Check your connection and try again.";retry.hidden=NO;});
}
- (void)navigationFailed:(NSError *)error {
    // No raw URL or localized error text: it may include session information.
    BOOL offline=[error.domain isEqual:NSURLErrorDomain] && error.code==NSURLErrorNotConnectedToInternet;
    [self showLoadingMessage:offline?@"You’re offline. Reconnect, then try opening NaviMuse again.":@"NaviMuse couldn’t connect. Check your connection and try again." retry:YES];
}
- (void)contentProcessTerminated {
    // The interface process is not the owner of native audio. Keep the current
    // session and native play/pause alive until an explicit reset/account change.
    [self recordSessionEvent:@"interface-terminated"];[self saveCheckpoint];self.page=nil;
    [NMCarPlayHub.shared clear];
    [self showLoadingMessage:@"NaviMuse’s screen stopped responding. Audio controls remain available. Reload to reconnect." retry:YES];
}
- (void)hideLoading {self.loadingRevision++;[self.loadingView removeFromSuperview];self.loadingView=nil;}
- (BOOL)activate {
    NSError *error=nil;
    AVAudioSession *session=AVAudioSession.sharedInstance;
    [session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault routeSharingPolicy:AVAudioSessionRouteSharingPolicyLongFormAudio options:0 error:&error];
    if(error)return NO;
    BOOL ok=[session setActive:YES error:&error];
    [self recordSessionEvent:ok?@"audio-session-active":@"audio-session-activation-failed"];
    if(ok)[self.nowPlayingSession becomeActiveIfPossibleWithCompletion:^(BOOL active){[self recordSessionEvent:active?@"now-playing-active":@"now-playing-not-active"];}];
    return ok;
}
- (void)send:(NSDictionary *)payload {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self send:payload];});return;}
    if(!self.page || !NMTrustedURL(self.webview.URL))return;
    NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"page":self.page,@"payload":payload} options:0 error:nil];
    NSString *json=[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding];
    NSString *script=[NSString stringWithFormat:@"window.__nmReceiveAudio && window.__nmReceiveAudio(%@)",json];
    [self.webview evaluateJavaScript:script completionHandler:nil];
}
- (void)emit:(NSString *)type deck:(NSInteger)deck {
    AVPlayer *player=self.players[deck];
    double duration=CMTimeGetSeconds(player.currentItem.duration),time=CMTimeGetSeconds(player.currentTime);
    if(self.recovery[deck].restoring)time=self.recovery[deck].position;
    if([@[@"loadstart",@"playing",@"waiting",@"pause",@"ended",@"error",@"seeked"] containsObject:type])[self recordPlaybackEvent:type deck:deck fields:@{}];
    [self send:@{@"type":type,@"deck":@(deck),@"generation":self.generations[deck],@"time":@(isfinite(time)?MAX(0,time):0),@"duration":@(isfinite(duration)?MAX(0,duration):0),@"delivery":self.streamDetails[deck],@"paused":@((BOOL)(!self.recovery[deck].wantsPlayback && player.timeControlStatus==AVPlayerTimeControlStatusPaused))}];
}
- (NSString *)routeKind {
    for(AVAudioSessionPortDescription *output in AVAudioSession.sharedInstance.currentRoute.outputs){
        if([output.portType isEqual:AVAudioSessionPortAirPlay])return @"AirPlay";
        if([@[AVAudioSessionPortBluetoothA2DP,AVAudioSessionPortBluetoothHFP,AVAudioSessionPortBluetoothLE] containsObject:output.portType])return @"Bluetooth";
    }
    return @"Local / wired";
}
- (void)recordSessionEvent:(NSString *)event {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self recordSessionEvent:event];});return;}
    [self recordPlaybackEvent:event deck:self.active fields:@{}];
}
- (void)recordPlaybackEvent:(NSString *)event deck:(NSInteger)deck fields:(NSDictionary *)fields {
    if(deck<0||deck>=self.players.count)return;
    AVPlayer *player=self.players[deck];AVPlayerItem *item=player.currentItem;
    double position=CMTimeGetSeconds(player.currentTime),buffer=0;
    for(NSValue *value in item.loadedTimeRanges){CMTimeRange range=value.CMTimeRangeValue;double start=CMTimeGetSeconds(range.start),end=CMTimeGetSeconds(CMTimeRangeGetEnd(range));if(start<=position+.25&&end>position)buffer=MAX(buffer,end-position);}
    AVAsset *asset=item.asset;BOOL hls=[asset isKindOfClass:AVURLAsset.class]&&NMHLSURL([(AVURLAsset *)asset URL],self.listeningLedger.scope);
    AVPlayerItemAccessLogEvent *access=item.accessLog.events.lastObject;
    NSMutableDictionary *entry=[@{@"event":event,@"at":@(NSDate.date.timeIntervalSince1970),@"deck":@(deck),@"generation":self.generations[deck],@"position":@(isfinite(position)?MAX(0,position):0),@"bufferSeconds":@(isfinite(buffer)?buffer:0),@"reportedDuration":@(CMTimeGetSeconds(item.duration)),@"preciseTiming":@(asset.providesPreciseDurationAndTiming),@"network":self.networkType?:@"unknown",@"source":!item?@"none":[self.downloadedDecks[deck] count]?@"downloaded":hls?@"hls":@"progressive",@"state":player.timeControlStatus==AVPlayerTimeControlStatusPlaying?@"playing":player.timeControlStatus==AVPlayerTimeControlStatusWaitingToPlayAtSpecifiedRate?@"waiting":@"paused",@"attempts":@(self.recovery[deck].attempts)} mutableCopy];
    if(access){entry[@"observedBitrate"]=@(access.observedBitrate);entry[@"indicatedBitrate"]=@(access.indicatedBitrate);}
    if(self.streamDetails[deck][@"codec"])entry[@"codec"]=self.streamDetails[deck][@"codec"];
    [entry addEntriesFromDictionary:fields];NSDictionary *safe=NMPlaybackLogEntry(entry);if(!safe)return;
    if(!self.sessionEvents)self.sessionEvents=[NSMutableArray new];
    NSDictionary *last=self.sessionEvents.lastObject;
    if([last[@"event"] isEqual:event]&&[last[@"generation"] isEqual:entry[@"generation"]]&&[last[@"deck"] isEqual:entry[@"deck"]]&&[entry[@"at"] doubleValue]-[last[@"at"] doubleValue]<1)return;
    [self.sessionEvents addObject:safe];self.sessionEvents=[NMPlaybackLogPruned(self.sessionEvents,NSDate.date.timeIntervalSince1970) mutableCopy];
    [NSUserDefaults.standardUserDefaults setObject:self.sessionEvents forKey:@"NaviMusePlaybackEvents"];
}
- (void)saveCheckpoint {
    NMStreamRecovery *state=self.recovery[self.active];
    if(self.restoringCheckpoint || !self.players[self.active].currentItem || !NMCheckpointURL(state.url,self.listeningLedger.scope))return;
    [state observePosition:CMTimeGetSeconds(self.players[self.active].currentTime)];
    double duration=CMTimeGetSeconds(self.players[self.active].currentItem.duration);
    if(isfinite(duration)&&duration>0&&state.position>=duration){[self.checkpoint clear];return;}
    NSMutableDictionary *meta=[NSMutableDictionary new];
    for(NSString *key in @[MPMediaItemPropertyTitle,MPMediaItemPropertyArtist,MPMediaItemPropertyAlbumTitle])if([self.metadata[key] isKindOfClass:NSString.class])meta[key]=self.metadata[key];
    NSMutableDictionary *saved=[@{@"url":state.url.absoluteString,@"scope":self.listeningLedger.scope,@"position":@(state.position),@"savedAt":@(NSDate.date.timeIntervalSince1970),@"metadata":meta,@"hls":@(NMHLSURL(state.deliveryURL,self.listeningLedger.scope))} mutableCopy];
    if(self.albumQueues[self.active].receipt)saved[@"albumReceipt"]=self.albumQueues[self.active].receipt;
    [self.checkpoint save:saved];
    self.checkpointAt=NSProcessInfo.processInfo.systemUptime;
}
- (void)restoreCheckpoint {
    if(self.checkpointRequestPending)return;
    NSDictionary *saved=[self.checkpoint read];if(!saved)return;
    BOOL intent=self.recovery[self.active].wantsPlayback;
    self.restoringCheckpoint=YES;self.checkpointRequestPending=YES;
    NSInteger deck=self.active;self.listeningLedger.scope=saved[@"scope"];
    NSURL *url=[NSURL URLWithString:saved[@"url"]];NMStreamRecovery *state=self.recovery[deck];[state load:url];
    [self.listeningLedger loadURL:url deck:deck];state.position=[saved[@"position"] doubleValue];state.restoring=YES;state.wantsPlayback=intent;
    NSDictionary *meta=saved[@"metadata"];if([meta isKindOfClass:NSDictionary.class])[self.metadata addEntriesFromDictionary:meta];
    NSUInteger revision=state.revision;
    // Authorization stays with the BFF. Saved state never grants offline access.
    [self.webview.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){
        if(state.revision!=revision || !self.restoringCheckpoint)return;
        void (^load)(NSURL *,NSInteger)=^(NSURL *delivery,NSInteger status){
            if(state.revision!=revision || !self.restoringCheckpoint)return;
            self.checkpointRequestPending=NO;
            if(!delivery){
                [self recordSessionEvent:@"checkpoint-delivery-unavailable"];
                if(status==400||status==401||status==403||status==409){[self.checkpoint clear];self.restoringCheckpoint=NO;self.checkpointRequestPending=NO;[self terminalFailure:deck];return;}
                // A cold-resume request also survives a temporary network outage.
                [self publish];
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW,30*NSEC_PER_SEC),dispatch_get_main_queue(),^{if(state.revision==revision&&state.wantsPlayback&&self.restoringCheckpoint)[self restoreCheckpoint];});
                return;
            }
            state.deliveryURL=delivery;
            AVURLAsset *asset=NMPlaybackAsset(delivery, @{AVURLAssetHTTPCookiesKey:[self firstPartyCookies:cookies]});
            [self replaceItem:[AVPlayerItem playerItemWithAsset:asset] deck:deck];[self publish];
            [self recordSessionEvent:@"checkpoint-loaded-paused"];
        };
        if([saved[@"hls"] boolValue])[self renewHLS:state cookies:[self firstPartyCookies:cookies] completion:load];else load(url,200);
    }];
}
- (void)publish {
    AVPlayer *player=self.players[self.active];
    if(!player.currentItem){
        if(!self.recovery[self.active].url)self.nowPlayingSession.nowPlayingInfoCenter.nowPlayingInfo=nil;
        else if(self.restoringCheckpoint){NSMutableDictionary *info=[self.metadata mutableCopy];info[MPNowPlayingInfoPropertyElapsedPlaybackTime]=@(self.recovery[self.active].position);info[MPNowPlayingInfoPropertyPlaybackRate]=@0;self.nowPlayingSession.nowPlayingInfoCenter.nowPlayingInfo=info;}
        return;
    }
    NSMutableDictionary *info=[self.metadata mutableCopy];
    double duration=CMTimeGetSeconds(player.currentItem.duration),time=CMTimeGetSeconds(player.currentTime);
    if(isfinite(duration)&&duration>0)info[MPMediaItemPropertyPlaybackDuration]=@(duration);
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime]=@(isfinite(time)?MAX(0,time):0);
    info[MPNowPlayingInfoPropertyPlaybackRate]=@(player.rate);
    info[MPNowPlayingInfoPropertyDefaultPlaybackRate]=@1;
    info[MPNowPlayingInfoPropertyMediaType]=@(MPNowPlayingInfoMediaTypeAudio);
    self.nowPlayingSession.nowPlayingInfoCenter.nowPlayingInfo=info;
    double latency=AVAudioSession.sharedInstance.outputLatency;
    NMPlaybackStart *start=[self startState:self.active];
    if(UIApplication.sharedApplication.applicationState==UIApplicationStateActive)[self send:@{@"type":@"diagnostic",@"sessionEvents":self.sessionEvents.count>40?[self.sessionEvents subarrayWithRange:NSMakeRange(self.sessionEvents.count-40,40)]:self.sessionEvents?:@[],@"nowPlayingActive":@(self.nowPlayingSession.active),@"recovery":@{@"attempts":@(self.recovery[self.active].attempts),@"restoring":@(self.recovery[self.active].restoring),@"checkpoint":@(self.recovery[self.active].position),@"degraded":@(self.safetyFallback),@"source":[self.downloadedDecks[self.active] count]?@"downloaded":@"stream"},@"metadataPresent":@(self.metadata.count>0),@"artworkPresent":@(self.metadata[MPMediaItemPropertyArtwork]!=nil),@"commandResult":self.commandResult?:@"none",@"startPhase":start.phase,@"startPosition":start.hasPrepared?@(start.position):NSNull.null,@"startCount":@(start.requests),@"routeKind":[self routeKind],@"outputLatency":@(isfinite(latency)?MAX(0,latency):0)}];
}
- (NSString *)playbackEvent:(NSInteger)deck {
    if(self.players[deck].timeControlStatus==AVPlayerTimeControlStatusPlaying && !self.recovery[deck].restoring)return @"playing";
    return self.recovery[deck].wantsPlayback ? @"waiting" : @"pause";
}
- (void)pauseDeck:(NSInteger)deck {
    [self sampleListening:deck];[self.listeningLedger resetSample:deck];
    [self cancelStart:deck];
    if(deck==self.active)self.streamCache.downloads.pausedForPlayback=YES;
    [self.recovery[deck] cancel];[self.players[deck] pause];if(deck==self.active)[self saveCheckpoint];
}
- (void)playDeck:(NSInteger)deck {
    if([self expireSleepTimer])return;
    if(![self downloadedDeckAllowed:deck]){[self terminalFailure:deck];[self replaceItem:nil deck:deck];return;}
    [self pauseDeck:1-deck];self.active=deck;
    NMStreamRecovery *state=self.recovery[deck];state.wantsPlayback=YES;
    if(state.restoring || self.players[deck].currentItem.status==AVPlayerItemStatusFailed){
        state.attempts=0;if(self.players[deck].currentItem.status==AVPlayerItemStatusReadyToPlay)[self restoreDeck:deck];else [self scheduleRecovery:deck];
    }else [self prepareStart:deck];
}
- (NMPlaybackStart *)startState:(NSInteger)deck {
    if(!self.starts)self.starts=@[[NMPlaybackStart new],[NMPlaybackStart new]];
    return self.starts[deck];
}
- (void)cancelStart:(NSInteger)deck {
    [[self startState:deck] cancel];[self.players[deck] cancelPendingPrerolls];
}
- (void)failStart:(NSInteger)deck {
    [self cancelStart:deck];
    // File playback must fail locally. Streaming retains the bounded existing
    // recovery policy; never begin at an unprepared position after a timeout.
    NSError *error=[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorTimedOut userInfo:nil];
    [self handleFailure:error deck:deck];[self startState:deck].phase=@"failed";[self publish];
}
- (void)continueStart:(NSInteger)deck {
    NMPlaybackStart *start=[self startState:deck];AVPlayer *player=self.players[deck];
    if(!start.pending || ![start.phase isEqual:@"waiting-for-item"] || !self.recovery[deck].wantsPlayback || self.recovery[deck].restoring)return;
    if(player.status!=AVPlayerStatusReadyToPlay || player.currentItem.status!=AVPlayerItemStatusReadyToPlay)return;
    if(player.rate!=0){[self cancelStart:deck];return;}
    if(![self downloadedDeckAllowed:deck]){[self terminalFailure:deck];return;}
    AVPlayerItem *item=player.currentItem;NSUInteger revision=start.revision;
    start.phase=@"priming";
    // Apple's contract requires ReadyToPlay and rate zero before preroll. The
    // media clock stays at its requested position until priming succeeds.
    [player prerollAtRate:1 completionHandler:^(BOOL finished){
        void (^complete)(void)=^{
            if(start.revision!=revision || !start.pending || player.currentItem!=item || !self.recovery[deck].wantsPlayback || self.recovery[deck].restoring)return;
            if(!finished){[self failStart:deck];return;}
            if(![self downloadedDeckAllowed:deck]){[self terminalFailure:deck];return;}
            start.pending=NO;start.phase=@"started";start.hasPrepared=YES;
            double position=CMTimeGetSeconds(player.currentTime);start.position=isfinite(position)?MAX(0,position):0;
            [player play];[self publish];
        };
        if(NSThread.isMainThread)complete();else dispatch_async(dispatch_get_main_queue(),complete);
    }];
}
- (void)prepareStart:(NSInteger)deck {
    AVPlayer *player=self.players[deck];NMPlaybackStart *start=[self startState:deck];
    if(!self.recovery[deck].wantsPlayback || self.recovery[deck].restoring || !player.currentItem || start.pending || start.seeking)return;
    if(player.rate!=0)return; // Already playing/waiting through AVPlayer.
    // Live radio has no finite track beginning and retains AVPlayer's normal
    // continuous-stream buffering behavior.
    if([self.recovery[deck].url.path containsString:@"/radios/"]){start.phase=@"live";[player play];return;}
    start.pending=YES;start.requests++;start.phase=@"waiting-for-item";NSUInteger revision=++start.revision;
    [self emit:@"waiting" deck:deck];[self continueStart:deck];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        if(start.revision==revision && start.pending && self.recovery[deck].wantsPlayback)[self failStart:deck];
    });
}
- (void)terminalFailure:(NSInteger)deck {
    self.ready[deck]=@NO;[self pauseDeck:deck];[self emit:@"error" deck:deck];
}
- (void)handleFailure:(NSError *)error deck:(NSInteger)deck {
    if(NMMediaServicesResetError(error)){[self mediaServicesReset:nil];return;}
    [self recordPlaybackEvent:@"stream-failure" deck:deck fields:@{@"errorCode":@(error.code),@"httpStatus":@(self.players[deck].currentItem.errorLog.events.lastObject.errorStatusCode)}];
    [self cancelStart:deck];
    // Actual local-file failures stay local; a waiting notification alone is not a failure.
    if(self.downloadedDecks.count>deck && [self.downloadedDecks[deck] count]){[self terminalFailure:deck];return;}
    AVPlayerItemErrorLogEvent *event=self.players[deck].currentItem.errorLog.events.lastObject;
    AVAsset *asset=self.players[deck].currentItem.asset;
    BOOL hls=[asset isKindOfClass:AVURLAsset.class] && NMHLSURL([(AVURLAsset *)asset URL],self.listeningLedger.scope);
    // HLS retries renew the same AAC delivery session. Authorization failures stop playback.
    BOOL fallback=hls && event.errorStatusCode!=401 && event.errorStatusCode!=403;
    if((fallback || NMTransientStreamFailure(error,event.errorStatusCode)) && self.recovery[deck].wantsPlayback){
        NMStreamRecovery *state=self.recovery[deck];
        double time=CMTimeGetSeconds(self.players[deck].currentTime);
        [state observePosition:time];
        state.restoring=YES;[self scheduleRecovery:deck];
    }
    else {if(event.errorStatusCode==401||event.errorStatusCode==403)[self.checkpoint clear];[self terminalFailure:deck];}
}
- (BOOL)restoreFromSafetyCache:(NSInteger)deck {
    NMStreamRecovery *state=self.recovery[deck];AVPlayer *player=self.players[deck];
    if(!state.wantsPlayback || [self.downloadedDecks[deck] count])return NO;
    NSDictionary *cached=[self downloadForStream:state.url];if(!cached)return NO;
    [state observePosition:CMTimeGetSeconds(player.currentTime)];
    state.revision++;state.pending=NO;state.restoring=YES;[player pause];
    self.downloadedDecks[deck]=@{@"songID":cached[@"songID"],@"scope":cached[@"scope"],@"cached":cached[@"cached"]?:@NO};
    AVURLAsset *asset=NMPlaybackAsset(cached[@"file"], @{AVURLAssetOverrideMIMETypeKey:cached[@"mimeType"],AVURLAssetReferenceRestrictionsKey:@(AVAssetReferenceRestrictionForbidAll)});
    [self replaceItem:[AVPlayerItem playerItemWithAsset:asset] deck:deck];return YES;
}
- (NSURLSessionConfiguration *)hlsSessionConfiguration {return NSURLSessionConfiguration.ephemeralSessionConfiguration;}
- (void)renewHLS:(NMStreamRecovery *)state cookies:(NSArray *)cookies completion:(void (^)(NSURL *,NSInteger))completion {
    NSString *scope=self.listeningLedger.scope;
    if(!NMCheckpointURL(state.url,scope)){completion(nil,403);return;}
    NSURLComponents *parts=[NSURLComponents componentsWithString:@"https://navimuse.example.com/api/navidrome/hls/sessions"];
    parts.queryItems=@[[NSURLQueryItem queryItemWithName:@"accountScope" value:scope]];
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:parts.URL];request.HTTPMethod=@"POST";request.timeoutInterval=12;
    request.allHTTPHeaderFields=[NSHTTPCookie requestHeaderFieldsWithCookies:cookies];
    [request setValue:@"NaviMuse" forHTTPHeaderField:@"X-Requested-With"];[request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    request.HTTPBody=[NSJSONSerialization dataWithJSONObject:@{@"songId":state.url.lastPathComponent} options:0 error:nil];
    NSURLSessionConfiguration *config=[self hlsSessionConfiguration];config.HTTPShouldSetCookies=NO;
    config.timeoutIntervalForResource=12;
    // The existing delegate rejects redirects for this non-artwork endpoint.
    NSURLSession *session=[NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];
    [[session dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){
        NSInteger status=[response isKindOfClass:NSHTTPURLResponse.class]?[(NSHTTPURLResponse *)response statusCode]:0;
        NSDictionary *body=data.length<65536?[NSJSONSerialization JSONObjectWithData:data?:[NSData data] options:0 error:nil]:nil;
        NSString *raw=[body isKindOfClass:NSDictionary.class]&&[body[@"url"] isKindOfClass:NSString.class]?body[@"url"]:nil;
        NSURL *url=raw?[NSURL URLWithString:raw relativeToURL:parts.URL].absoluteURL:nil;
        if(status!=200||!NMHLSURL(url,scope)||error)url=nil;
        [session finishTasksAndInvalidate];dispatch_async(dispatch_get_main_queue(),^{completion(url,status);});
    }] resume];
}
- (void)scheduleRecovery:(NSInteger)deck {
    NMStreamRecovery *state=self.recovery[deck];
    if(deck==self.active)self.streamCache.downloads.pausedForPlayback=YES;
    if([self startState:deck].pending || [self startState:deck].seeking)return;
    if(!state.wantsPlayback || !state.url || state.pending)return;
    if(self.downloadedDecks.count>deck && [self.downloadedDecks[deck] count]){
        // AVPlayer may briefly wait while its output starts after preroll. Do
        // not cancel local playback synchronously from that KVO notification.
        state.pending=YES;NSUInteger revision=++state.revision;
        AVPlayerItem *item=self.players[deck].currentItem;
        __weak NMNativeAudio *weak=self;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC),dispatch_get_main_queue(),^{
            NMNativeAudio *strong=weak;
            if(!strong || state.revision!=revision || !state.wantsPlayback || strong.players[deck].currentItem!=item)return;
            state.pending=NO;
            if(![strong downloadedDeckAllowed:deck] || strong.players[deck].timeControlStatus!=AVPlayerTimeControlStatusPlaying)[strong terminalFailure:deck];
        });
        return;
    }
    state.pending=YES;state.stableSince=0;
    if(state.waitingSince==0)state.waitingSince=NSProcessInfo.processInfo.systemUptime;
    NSUInteger revision=++state.revision;
    [self emit:@"waiting" deck:deck];
    __weak NMNativeAudio *weak=self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        NMNativeAudio *strong=weak;if(!strong || state.revision!=revision || !state.wantsPlayback)return;
        state.pending=NO;
        AVPlayer *player=strong.players[deck];
        // Give AVPlayer's built-in buffering a chance before replacing the item.
        if(player.timeControlStatus==AVPlayerTimeControlStatusPlaying && !state.restoring)return;
        AVAsset *asset=player.currentItem.asset;
        BOOL hls=[asset isKindOfClass:AVURLAsset.class] && NMHLSURL([(AVURLAsset *)asset URL],strong.listeningLedger.scope);
        if(NMHLSHandoffGrace(hls,state.restoring || player.currentItem.status==AVPlayerItemStatusFailed,NSProcessInfo.processInfo.systemUptime,strong.networkHandoffAt,state.waitingSince)){
            [strong scheduleRecovery:deck];return;
        }
        strong.safetyFallback=YES;strong.safetyHealthySince=0;
        if([strong restoreFromSafetyCache:deck])return;
        if([strong.networkType isEqual:@"offline"]){[strong scheduleRecovery:deck];return;}
        if(![state retryAllowedAt:NSProcessInfo.processInfo.systemUptime]){
            [strong recordSessionEvent:@"recovery-cooldown"];[strong scheduleRecovery:deck];return;
        }
        if(![state reserveAttempt])return;
        [state observePosition:CMTimeGetSeconds(player.currentTime)];
        state.restoring=YES;state.pending=YES;
        [player pause];
        [strong.webview.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){
            if(state.revision!=revision || !state.wantsPlayback || !NMTrustedURL(state.url))return;
            void (^replace)(NSURL *,NSInteger)=^(NSURL *url,NSInteger status){
                if(state.revision!=revision||!state.wantsPlayback)return;
                if(status==400||status==401||status==403||status==409){[strong recordPlaybackEvent:@"recovery-authorization-failed" deck:deck fields:@{@"httpStatus":@(status)}];[strong.checkpoint clear];[strong terminalFailure:deck];return;}
                if(!url){state.pending=NO;[strong scheduleRecovery:deck];return;}
                state.deliveryURL=url;
                AVURLAsset *asset=NMPlaybackAsset(url, @{AVURLAssetHTTPCookiesKey:[strong firstPartyCookies:cookies]});
                [strong replaceItem:[AVPlayerItem playerItemWithAsset:asset] deck:deck];
                if(state.revision!=revision || !state.wantsPlayback)return;
                state.pending=NO;[strong scheduleRecovery:deck];
            };
            if(NMHLSURL(state.deliveryURL,strong.listeningLedger.scope)){
                [strong recordSessionEvent:@"recovery-hls"];[strong renewHLS:state cookies:[strong firstPartyCookies:cookies] completion:replace];
            }else{[strong recordSessionEvent:@"recovery-same-stream"];replace(state.deliveryURL?:state.url,200);}
        }];
    });
}
- (void)restoreDeck:(NSInteger)deck {
    NMStreamRecovery *state=self.recovery[deck];AVPlayer *player=self.players[deck];
    if(!state.restoring || !state.wantsPlayback)return;
    state.pending=YES;NSUInteger revision=++state.revision;
    AVPlayerItem *item=player.currentItem;
    double duration=CMTimeGetSeconds(item.duration);
    BOOL live=[state.url.path containsString:@"/radios/"];
    double position=live?0:state.position;
    if(isfinite(duration)&&duration>0)position=MIN(position,duration);
    void (^resume)(BOOL)=^(BOOL finished){
        dispatch_async(dispatch_get_main_queue(),^{
            if(state.revision!=revision||!state.wantsPlayback||player.currentItem!=item)return;
            state.pending=NO;
            if(!finished || (!live && !NMRecoverySeekLanded(position,CMTimeGetSeconds(player.currentTime)))){[self scheduleRecovery:deck];return;}
            state.restoring=NO;self.restoringCheckpoint=NO;
            [self emit:@"loadedmetadata" deck:deck];[self emit:@"canplay" deck:deck];
            if([self activate])[self prepareStart:deck];else [self terminalFailure:deck];
        });
    };
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        if(state.revision==revision && state.restoring && state.wantsPlayback){state.pending=NO;[self scheduleRecovery:deck];}
    });
    if(position>0)[player seekToTime:CMTimeMakeWithSeconds(position,600) toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero completionHandler:resume];
    else resume(YES);
}
- (void)stalled:(NSNotification *)notification {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self stalled:notification];});return;}
    for(NSInteger deck=0;deck<2;deck++)if(notification.object==self.players[deck].currentItem){[self recordPlaybackEvent:@"stalled" deck:deck fields:@{}];[self scheduleRecovery:deck];}
}
- (void)failedToEnd:(NSNotification *)notification {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self failedToEnd:notification];});return;}
    for(NSInteger deck=0;deck<2;deck++)if(notification.object==self.players[deck].currentItem)[self handleFailure:notification.userInfo[AVPlayerItemFailedToPlayToEndTimeErrorKey] deck:deck];
}
- (void)seek:(double)time deck:(NSInteger)deck {
    [self sampleListening:deck];[self.listeningLedger resetSample:deck];
    AVPlayer *player=self.players[deck];if(!isfinite(time)||time<0||!player.currentItem)return;
    double duration=CMTimeGetSeconds(player.currentItem.duration);if(isfinite(duration))time=MIN(time,duration);
    if(self.recovery[deck].restoring){self.recovery[deck].position=time;if(player.currentItem.status==AVPlayerItemStatusReadyToPlay)[self restoreDeck:deck];return;}
    NSNumber *generation=self.generations[deck];
    NMPlaybackStart *start=[self startState:deck];BOOL resumePreparation=start.pending || start.seeking;
    if(resumePreparation){[self cancelStart:deck];start.seeking=YES;start.phase=@"seeking";}
    NSUInteger revision=start.revision;
    [player seekToTime:CMTimeMakeWithSeconds(time,600) toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero completionHandler:^(BOOL finished){
        dispatch_async(dispatch_get_main_queue(),^{
            if(![generation isEqual:self.generations[deck]] || (resumePreparation && start.revision!=revision))return;
            if(resumePreparation)start.seeking=NO;
            if(finished){self.recovery[deck].position=time;[self emit:@"seeked" deck:deck];[self emit:@"timeupdate" deck:deck];if(resumePreparation)[self prepareStart:deck];[self publish];}
            else if(resumePreparation)[self failStart:deck];
        });
    }];
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self observeValueForKeyPath:keyPath ofObject:object change:change context:context];});return;}
    if(self.mediaResetPending)return;
    if(object==self.webview && [keyPath isEqual:@"URL"]){if(self.webview.URL && !NMTrustedURL(self.webview.URL)){[self reset];self.page=nil;[self hideLoading];}return;}
    if(object==self.webview && [keyPath isEqual:@"loading"]){if(self.webview.loading&&NMTrustedURL(self.webview.URL))[self showLoading];return;}
    for(NSInteger deck=0;deck<(NSInteger)self.players.count;deck++) {
        AVPlayer *player=self.players[deck];
        if(object==player.currentItem && [keyPath isEqual:@"status"]) {
            if(player.currentItem.status==AVPlayerItemStatusReadyToPlay && !self.ready[deck].boolValue){self.ready[deck]=@YES;[self readStreamDetails:deck];if(self.recovery[deck].restoring)[self restoreDeck:deck];else {[self emit:@"loadedmetadata" deck:deck];[self emit:@"canplay" deck:deck];[self continueStart:deck];}}
            else if(player.currentItem.status==AVPlayerItemStatusFailed)[self handleFailure:player.currentItem.error deck:deck];
        } else if(object==player.currentItem && [keyPath isEqual:@"tracks"]) {
            [self readStreamDetails:deck];
        } else if(object==player) {
            if([keyPath isEqual:@"status"] && NMMediaServicesResetError(player.error)){[self mediaServicesReset:nil];return;}
            if([keyPath isEqual:@"status"])[self continueStart:deck];
            NSString *type=[self playbackEvent:deck];
            [self emit:type deck:deck];
            if([type isEqual:@"playing"])self.recovery[deck].waitingSince=0;
            if([type isEqual:@"waiting"])[self scheduleRecovery:deck];
        }
    }
    [self publish];
}
- (void)readStreamDetails:(NSInteger)deck {
    AVPlayerItem *item=self.players[deck].currentItem;
    NSNumber *generation=self.generations[deck];
    __weak NMNativeAudio *weak=self;
    AVAssetTrack *track=NMSelectedAudioTrack(item);
    NMLoadTrackStreamDetails(track,^(NSDictionary *details){
        dispatch_async(dispatch_get_main_queue(),^{
            NMNativeAudio *strong=weak;
            if(!strong || strong.players[deck].currentItem!=item || NMSelectedAudioTrack(item)!=track || ![strong.generations[deck] isEqual:generation])return;
            strong.streamDetails[deck]=strong.downloadedDecks.count>deck && [strong.downloadedDecks[deck] count]?[@{@"source":[strong.downloadedDecks[deck][@"cached"] boolValue]?@"cached":@"downloaded"} mutableCopy]:[NSMutableDictionary new];
            [(NSMutableDictionary *)strong.streamDetails[deck] addEntriesFromDictionary:details];
            if([item.asset isKindOfClass:AVURLAsset.class] && NMHLSURL([(AVURLAsset *)item.asset URL],strong.listeningLedger.scope))[(NSMutableDictionary *)strong.streamDetails[deck] setObject:@"hls" forKey:@"source"];[strong emit:@"streamdetails" deck:deck];
        });
    });
}
- (void)replaceItem:(AVPlayerItem *)item deck:(NSInteger)deck {
    self.albumPrepareRevision++;[self.albumQueues[deck] cancel];self.albumQueues[deck].receipt=nil;[self emit:@"albuminvalidated" deck:deck];
    [self cancelStart:deck];
    self.streamDetails[deck]=@{};
    if(!item && self.downloadedDecks.count>deck)self.downloadedDecks[deck]=@{};
    AVPlayer *player=self.players[deck];
    if(player.currentItem){[player.currentItem removeObserver:self forKeyPath:@"status"];[player.currentItem removeObserver:self forKeyPath:@"tracks"];}
    if(deck==self.active)self.streamCache.downloads.pausedForPlayback=YES;
    if(item && [item.asset isKindOfClass:AVURLAsset.class] && ![(AVURLAsset *)item.asset URL].isFileURL && ![self.recovery[deck].url.path containsString:@"/radios/"])item.preferredForwardBufferDuration=120;
    [player replaceCurrentItemWithPlayerItem:item];self.ready[deck]=@NO;
    if(item)[self recordPlaybackEvent:@"loadstart" deck:deck fields:@{}];
    if(item){[item addObserver:self forKeyPath:@"tracks" options:0 context:NULL];[item addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionInitial context:NULL];}
}
- (void)emitAlbumReceipt:(NSInteger)deck {
    NSDictionary *receipt=self.albumQueues[deck].receipt;if(!receipt)return;
    NSMutableDictionary *event=[receipt mutableCopy];event[@"type"]=@"albumhandoff";event[@"deck"]=@(deck);event[@"generation"]=self.generations[deck];
    double position=CMTimeGetSeconds(self.players[deck].currentTime);event[@"time"]=@(isfinite(position)?MAX(0,position):0);
    [self send:event];
}
- (void)albumAdvanced:(NSDictionary *)entry previous:(AVPlayerItem *)old deck:(NSInteger)deck {
    // This runs on the AVQueuePlayer item change, including while WebKit is asleep.
    if(old){[old removeObserver:self forKeyPath:@"status"];[old removeObserver:self forKeyPath:@"tracks"];}
    [self cancelStart:deck];NSURL *url=[NSURL URLWithString:entry[@"url"]];
    BOOL playing=self.recovery[deck].wantsPlayback;[self.recovery[deck] load:url];self.recovery[deck].wantsPlayback=playing;
    [self.listeningLedger loadURL:url deck:deck];self.downloadedDecks[deck]=entry[@"download"]?:@{};
    self.streamDetails[deck]=@{};self.ready[deck]=@NO;
    AVPlayerItem *item=self.players[deck].currentItem;
    [item addObserver:self forKeyPath:@"tracks" options:0 context:NULL];
    [item addObserver:self forKeyPath:@"status" options:0 context:NULL];
    self.ready[deck]=@(item.status==AVPlayerItemStatusReadyToPlay);
    if(![self downloadedDeckAllowed:deck]){[self terminalFailure:deck];[self replaceItem:nil deck:deck];return;}
    // Already running: do not preroll, seek to zero, or call Play again.
    self.active=deck;self.metadataRevision++;[self setMetadata:entry webCookies:self.albumCookies?:@[]];
    [self readStreamDetails:deck];[self saveCheckpoint];[self emitAlbumReceipt:deck];
    if(self.ready[deck].boolValue)[self emit:@"loadedmetadata" deck:deck];[self emit:[self playbackEvent:deck] deck:deck];
    [self recordPlaybackEvent:@"album-handoff" deck:deck fields:@{}];[self publish];
}
- (void)ended:(NSNotification *)notification {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self ended:notification];});return;}
    if(notification.object==self.players[self.active].currentItem && self.albumQueues[self.active].token && [(AVQueuePlayer *)self.players[self.active] items].count>1 && self.players[self.active].actionAtItemEnd==AVPlayerActionAtItemEndAdvance){[self sampleListening:self.active];return;}
    if(notification.object==self.players[self.active].currentItem){[self.checkpoint clear];[self.recovery[self.active] cancel];[self emit:@"ended" deck:self.active];[self publish];}
}
- (void)interrupted:(NSNotification *)notification {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self interrupted:notification];});return;}
    [self recordSessionEvent:@"audio-interruption"];
    if([notification.userInfo[AVAudioSessionInterruptionTypeKey] integerValue]==AVAudioSessionInterruptionTypeBegan){self.resumeAfterInterruption=self.recovery[self.active].wantsPlayback;[self pauseDeck:self.active];}
    else if(self.resumeAfterInterruption && ([notification.userInfo[AVAudioSessionInterruptionOptionKey] integerValue]&AVAudioSessionInterruptionOptionShouldResume)){self.resumeAfterInterruption=NO;if([self activate])[self playDeck:self.active];}
}
- (void)routeChanged:(NSNotification *)notification {
    if(!NSThread.isMainThread){dispatch_async(dispatch_get_main_queue(),^{[self routeChanged:notification];});return;}
    [self send:@{@"type":@"route",@"kind":[self routeKind]}];
    [self recordSessionEvent:@"audio-route-changed"];
    if([notification.userInfo[AVAudioSessionRouteChangeReasonKey] integerValue]==AVAudioSessionRouteChangeReasonOldDeviceUnavailable){self.resumeAfterInterruption=NO;[self pauseDeck:self.active];}
    else if([self startState:self.active].pending && self.recovery[self.active].wantsPlayback){[self cancelStart:self.active];[self prepareStart:self.active];}
}
- (void)routePickerViewWillBeginPresentingRoutes:(AVRoutePickerView *)routePickerView {
    [self send:@{@"type":@"routePicker",@"presenting":@YES}];
}
- (void)routePickerViewDidEndPresentingRoutes:(AVRoutePickerView *)routePickerView {
    [self send:@{@"type":@"routePicker",@"presenting":@NO}];
}
- (NSDictionary *)sleepTimerStatus {
    return @{@"deadline":@(self.sleepDeadline * 1000)};
}
- (BOOL)expireSleepTimer {
    if(self.sleepDeadline<=0 || NSDate.date.timeIntervalSince1970<self.sleepDeadline)return NO;
    self.sleepDeadline=0;[self.sleepTimer invalidate];self.sleepTimer=nil;
    self.albumPrepareRevision++;for(NMAlbumQueue *queue in self.albumQueues)[queue cancel];
    self.resumeAfterInterruption=NO;
    for(NSInteger deck=0;deck<2;deck++){[self pauseDeck:deck];[self emit:@"pause" deck:deck];}
    [self publish];[self send:@{@"type":@"sleepTimer",@"deadline":@0}];return YES;
}
- (void)reset {
    self.albumPrepareRevision++;self.albumCookies=nil;[self recordSessionEvent:@"session-reset"];[self.checkpoint clear];self.restoringCheckpoint=NO;self.checkpointRequestPending=NO;
    [NMCarPlayHub.shared clear];
    [self sampleListening:self.active];self.listeningLedger.scope=@"";
    self.sleepDeadline=0;[self.sleepTimer invalidate];self.sleepTimer=nil;
    self.lastSafetySnapshot=nil;self.cachePlanRevision++;[self.streamCache.downloads suspend];
    self.resumeAfterInterruption=NO;
    [self.routePicker removeFromSuperview];self.routePicker=nil;
    for(NSInteger i=0;i<(NSInteger)self.players.count;i++){self.generations[i]=@(self.generations[i].integerValue+1);[self.recovery[i] load:nil];[self.players[i] pause];[self replaceItem:nil deck:i];}
    [self.artTask cancel];self.artTask=nil;self.artURL=nil;[self.artSession invalidateAndCancel];self.artSession=nil;self.artRevision++;self.metadataRevision++;[self.metadata removeAllObjects];[self publish];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
    completionHandler(NMArtworkURL(task.originalRequest.URL)&&NMArtworkURL(request.URL)?request:nil);
}
- (void)setMetadata:(NSDictionary *)values webCookies:(NSArray<NSHTTPCookie *> *)cookies {
    NSURL *url=[NSURL URLWithString:[values[@"artwork"] isKindOfClass:NSString.class]?values[@"artwork"]:@""];
    BOOL validArtwork=NMArtworkURL(url);
    BOOL sameArtwork=validArtwork && [self.artURL isEqual:url.absoluteString];
    id artwork=sameArtwork?self.metadata[MPMediaItemPropertyArtwork]:nil;
    [self.metadata removeAllObjects];
    NSDictionary *keys=@{@"title":MPMediaItemPropertyTitle,@"artist":MPMediaItemPropertyArtist,@"album":MPMediaItemPropertyAlbumTitle};
    for(NSString *key in keys)if([values[key] isKindOfClass:NSString.class])self.metadata[keys[key]]=[values[key] substringToIndex:MIN(2048,[values[key] length])];
    if([values[@"live"] isEqual:@YES])self.metadata[MPNowPlayingInfoPropertyIsLiveStream]=@YES;
    if(artwork)self.metadata[MPMediaItemPropertyArtwork]=artwork;
    [self publish];
    // ICY title updates and same-album advancement must not erase/restart the
    // artwork request. Reset/logout still invalidates both metadata and artwork.
    if(sameArtwork && (artwork || self.artTask))return;
    [self.artTask cancel];self.artTask=nil;NSInteger revision=++self.artRevision;
    self.artURL=validArtwork?url.absoluteString:nil;
    if(!validArtwork)return;
    NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url];
    request.timeoutInterval=15;
    [request setAllHTTPHeaderFields:[NSHTTPCookie requestHeaderFieldsWithCookies:cookies]];
    if(!self.artSession)self.artSession=[NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.ephemeralSessionConfiguration delegate:self delegateQueue:NSOperationQueue.mainQueue];
    __weak NMNativeAudio *weak=self;
    if(self.offlineLaunch)return;
    self.artTask=[self.artSession dataTaskWithRequest:request completionHandler:^(NSData *data,NSURLResponse *response,NSError *error){
        NMNativeAudio *strong=weak;if(!strong||revision!=strong.artRevision)return;
        strong.artTask=nil;
        if(error||data.length>8*1024*1024||![response isKindOfClass:NSHTTPURLResponse.class]||[(NSHTTPURLResponse *)response statusCode]!=200)return;
        UIImage *image=[UIImage imageWithData:data];if(!image)return;
        strong.metadata[MPMediaItemPropertyArtwork]=[[MPMediaItemArtwork alloc]initWithBoundsSize:image.size requestHandler:^UIImage *(CGSize size){(void)size;return image;}];
        [strong publish];
    }];[self.artTask resume];
}
- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message replyHandler:(void (^)(id,NSString *))reply {
    WKSecurityOrigin *origin=message.frameInfo.securityOrigin;
    if(!message.frameInfo.mainFrame||![origin.protocol isEqual:@"https"]||![origin.host isEqual:@"navimuse.example.com"]||(origin.port!=0&&origin.port!=443)||![message.body isKindOfClass:NSDictionary.class]){reply(nil,@"Untrusted origin");return;}
    NSDictionary *body=message.body;NSString *action=body[@"action"],*page=body[@"page"];
    if(![action isKindOfClass:NSString.class]||action.length>100){reply(nil,@"Invalid action");return;}
    if(![page isKindOfClass:NSString.class]||page.length>100){reply(nil,@"Invalid page");return;}
    if([action isEqual:@"bind"]){
        [self saveCheckpoint];NSDictionary *saved=[self.checkpoint read];[self reset];if(saved)[self.checkpoint save:saved];
        self.generations=[@[@0,@0] mutableCopy];self.page=page;[self restoreCheckpoint];reply(@YES,nil);return;
    }
    if(![self.page isEqual:page]){reply(nil,@"Stale page");return;}
    if([action isEqual:@"diagnostics.clear"]){[self.sessionEvents removeAllObjects];[NSUserDefaults.standardUserDefaults removeObjectForKey:@"NaviMusePlaybackEvents"];reply(@YES,nil);return;}
    if([action isEqual:@"diagnostics.export"]){
        UIViewController *root=self.webview.window.rootViewController;
        if(!root||root.presentedViewController){reply(nil,@"Close the current sheet before exporting");return;}
        NSDictionary *report=@{@"schema":@"navimuse-playback-log/v1",@"platform":@"ios",@"timestampUnit":@"unix-seconds",@"build":[NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleVersion"]?:@"unknown",@"osVersion":UIDevice.currentDevice.systemVersion,@"exportedAt":@(NSDate.date.timeIntervalSince1970),@"events":NMPlaybackLogPruned(self.sessionEvents,NSDate.date.timeIntervalSince1970)};
        NSData *data=[NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
        NSURL *file=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:@"navimuse-playback-log.json"]];
        if(!data||![data writeToURL:file options:NSDataWritingAtomic|NSDataWritingFileProtectionComplete error:nil]){reply(nil,@"Could not create playback log");return;}
        UIActivityViewController *sheet=[[UIActivityViewController alloc]initWithActivityItems:@[file] applicationActivities:nil];
        sheet.popoverPresentationController.sourceView=self.webview;sheet.popoverPresentationController.sourceRect=CGRectMake(CGRectGetMidX(self.webview.bounds),CGRectGetMidY(self.webview.bounds),1,1);
        sheet.completionWithItemsHandler=^(UIActivityType activity,BOOL completed,NSArray *items,NSError *error){[NSFileManager.defaultManager removeItemAtURL:file error:nil];};
        [root presentViewController:sheet animated:YES completion:nil];reply(@YES,nil);return;
    }
    if([action isEqual:@"carplay.clear"]){[NMCarPlayHub.shared clear];reply(@YES,nil);return;}
    if([action isEqual:@"carplay.catalog"]){BOOL ok=[NMCarPlayHub.shared accept:body[@"snapshot"]];reply(ok?@YES:nil,ok?nil:@"Invalid CarPlay catalog");return;}
    if([action isEqual:@"carplay.result"]){[NMCarPlayHub.shared finish:body];reply(@YES,nil);return;}
    if([action isEqual:@"nearbySpeakers"]){
        if(self.offlineLaunch || ![@[@"wifi",@"wired"] containsObject:self.networkType?:@""]){reply(@{@"nearbyIds":@[]},nil);return;}
        NSArray *devices=body[@"devices"];if(![devices isKindOfClass:NSArray.class]||devices.count>32){reply(nil,@"Invalid speaker list");return;}
        [NMNearbySpeakers probe:devices completion:^(NSArray *ids){if(![self.page isEqual:page]){reply(nil,@"Stale page");return;}reply(@{@"nearbyIds":ids},nil);}];return;
    }
    if([action isEqual:@"album.resume"]){
        NSDictionary *saved=[self.checkpoint read],*receipt=saved[@"albumReceipt"];
        NSURL *requested=[body[@"url"] isKindOfClass:NSString.class]?[NSURL URLWithString:body[@"url"]]:nil;
        BOOL valid=[receipt isKindOfClass:NSDictionary.class]&&[receipt[@"url"] isEqual:saved[@"url"]]&&NMCheckpointURL(requested,saved[@"scope"]);
        reply(valid?@{@"receipt":receipt,@"position":saved[@"position"]}:NSNull.null,nil);return;
    }
    if([action isEqual:@"resumePosition"]){
        NSDictionary *saved=[self.checkpoint read];NSURL *url=[body[@"url"] isKindOfClass:NSString.class]?[NSURL URLWithString:body[@"url"]]:nil;
        BOOL match=saved && NMCheckpointURL(url,saved[@"scope"]) && [url.path isEqual:[NSURL URLWithString:saved[@"url"]].path];
        reply(match?saved[@"position"]:NSNull.null,nil);return;
    }
    if([action isEqual:@"routeState"]){[self send:@{@"type":@"route",@"kind":[self routeKind]}];reply(@YES,nil);return;}
    if([action isEqual:@"pageReady"]){[self hideLoading];reply(@YES,nil);return;}
    if([action isEqual:@"detach"]){[self saveCheckpoint];self.page=nil;[NMCarPlayHub.shared clear];reply(@YES,nil);return;}
    if([action isEqual:@"reset"]){[self reset];self.page=nil;reply(@YES,nil);return;}
    if([action hasPrefix:@"listening."]){
        NSString *scope=body[@"scope"];
        if(![scope isKindOfClass:NSString.class] || !scope.length || scope.length>512){reply(nil,@"Invalid listening scope");return;}
        if([action isEqual:@"listening.configure"]){
            if(![self.listeningLedger.scope isEqual:scope]){if(self.listeningLedger.scope.length){[self reset];self.page=page;}[self sampleListening:self.active];self.listeningLedger.scope=scope;for(NSInteger i=0;i<2;i++)[self.listeningLedger loadURL:self.recovery[i].url deck:i];}
            reply(@YES,nil);return;
        }
        if(![self.listeningLedger.scope isEqual:scope]){reply(nil,@"Listening account changed");return;}
        if([action isEqual:@"listening.pending"]){reply([self.listeningLedger recordsForScope:scope],nil);return;}
        if([action isEqual:@"listening.ack"] && [body[@"id"] isKindOfClass:NSString.class]){BOOL ok=[self.listeningLedger acknowledge:body[@"id"] scope:scope];reply(ok?@YES:nil,ok?nil:@"Could not save listening receipt");return;}
        reply(nil,@"Unsupported listening action");return;
    }
    if([action isEqual:@"cacheStatus"]){self.lastSafetySnapshot=nil;[self safetyCacheChanged];reply(@YES,nil);return;}
    if([action isEqual:@"cacheAhead"]){
        if(self.offlineLaunch){reply(@YES,nil);return;}
        NSArray *songs=body[@"songs"];if(![songs isKindOfClass:NSArray.class]||songs.count>11){reply(nil,@"Invalid cache selection");return;}
        NSUInteger revision=++self.cachePlanRevision;
        [self.webview.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){
            if(![self.page isEqual:page]||revision!=self.cachePlanRevision){reply(nil,@"Stale cache plan");return;}
            NSMutableArray *pinned=[NSMutableArray new];for(NSDictionary *deck in self.downloadedDecks)if([deck[@"cached"] boolValue])[pinned addObject:deck[@"songID"]];
            [self.streamCache prepare:songs scope:body[@"scope"] format:body[@"format"] bitrate:body[@"bitrate"] keeping:pinned cookies:[self firstPartyCookies:cookies]];reply(@YES,nil);
        }];return;
    }
    if([action hasPrefix:@"offline."]){
        if(!self.downloads){reply(nil,@"Offline downloads unavailable");return;}
        if([action isEqual:@"offline.open"]){if(!NMOfflineShellHTML.length){reply(nil,@"Offline screen unavailable");return;}reply(@YES,nil);dispatch_async(dispatch_get_main_queue(),^{[self openOffline];});return;}
        if([action isEqual:@"offline.reconnect"]){reply(@YES,nil);dispatch_async(dispatch_get_main_queue(),^{[self reconnect];});return;}
        if(self.offlineLaunch && [@[@"offline.account",@"offline.output",@"offline.authorize",@"offline.download"] containsObject:action]){reply(nil,@"Reconnect to change online account or playback ownership");return;}
        if([action isEqual:@"offline.account"]){
            id scope=body[@"scope"];if(![scope isKindOfClass:NSString.class]||![self.streamCache.scope isEqual:scope]){self.cachePlanRevision++;[self.streamCache invalidate];self.safetyFallback=NO;self.safetyHealthySince=0;}NSString *current=[self.downloads snapshot][@"scope"];
            if(![scope isKindOfClass:NSString.class] || ![current isEqual:scope])[self.downloads invalidateAccess];
            reply(@YES,nil);return;
        }
        if([action isEqual:@"offline.output"]){NSError *error=nil;BOOL ok=[self.downloads.store setOutputOwnership:body[@"ownership"] scope:body[@"scope"] error:&error];if(ok)[self downloadsChanged];reply(ok?@YES:nil,error.localizedDescription);return;}
        if([action isEqual:@"offline.status"]){reply([self offlineSnapshot],nil);return;}
        if([action isEqual:@"offline.clearAll"]){NSError *error=nil;BOOL ok=[self.downloads clearAllDownloadedMusic:&error];reply(ok?@YES:nil,error.localizedDescription);return;}
        if([action isEqual:@"offline.forget"]){self.cachePlanRevision++;[self.streamCache invalidate];[self.downloads invalidateAccess];reply(@YES,nil);return;}
        if([action isEqual:@"offline.preferences"]){
            if(![body[@"allowsCellular"] isKindOfClass:NSNumber.class]||![body[@"budgetBytes"] isKindOfClass:NSNumber.class]){reply(nil,@"Invalid download preferences");return;}
            NSError *error=nil;BOOL ok=[self.downloads.store setAllowsCellular:[body[@"allowsCellular"] boolValue] budgetBytes:[body[@"budgetBytes"] unsignedLongLongValue] error:&error];
            if(ok)[self.downloads preferencesChanged];reply(ok?@YES:nil,error.localizedDescription);return;
        }
        NSString *scope=body[@"scope"];
        if(![scope isKindOfClass:NSString.class]){reply(nil,@"Account scope required");return;}
        if([action isEqual:@"offline.authorize"]||[action isEqual:@"offline.download"]){
            [self.webview.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){
                if(![self.page isEqual:page]){reply(nil,@"Stale page");return;}
                NSArray *firstParty=[self firstPartyCookies:cookies];
                [self.downloads authorizeScope:scope cookies:firstParty completion:^(NSError *failure){
                    if(![self.page isEqual:page]){reply(nil,@"Stale page");return;}
                    if(failure){reply(nil,failure.localizedDescription);return;}
                    if([action isEqual:@"offline.download"]){
                        NSError *error=nil;BOOL ok=[self.downloads enqueueSongs:body[@"songs"] format:body[@"format"] bitrate:body[@"bitrate"] cookies:firstParty error:&error];
                        if(!ok){reply(nil,error.localizedDescription);return;}
                    }
                    reply([self.downloads snapshot],nil);
                }];
            }];return;
        }
        if(![[self.downloads snapshot][@"scope"] isEqual:scope]){reply(nil,@"Account access changed");return;}
        NSError *error=nil;BOOL ok=YES;
        if([action isEqual:@"offline.clear"])ok=[self.downloads clear:&error];
        else if([body[@"songID"] isKindOfClass:NSString.class] && [action isEqual:@"offline.remove"])ok=[self.downloads removeSongID:body[@"songID"] error:&error];
        else if([body[@"songID"] isKindOfClass:NSString.class] && [action isEqual:@"offline.cancel"])[self.downloads cancelSongID:body[@"songID"]];
        else {reply(nil,@"Unsupported download action");return;}
        reply(ok?[self.downloads snapshot]:nil,error.localizedDescription);return;
    }
    if([action isEqual:@"routePickerFrame"]){
        if([body[@"hidden"] isEqual:@YES]){[self.routePicker removeFromSuperview];self.routePicker=nil;reply(@YES,nil);return;}
        for(NSString *key in @[@"x",@"y",@"width",@"height"])if(![body[key] isKindOfClass:NSNumber.class]||!isfinite([body[key] doubleValue])){reply(nil,@"Invalid picker frame");return;}
        CGRect frame=CGRectMake([body[@"x"] doubleValue],[body[@"y"] doubleValue],[body[@"width"] doubleValue],[body[@"height"] doubleValue]);
        BOOL fullRow=[body[@"fullRow"] isEqual:@YES];
        if(fullRow){
            for(NSString *key in @[@"viewportWidth",@"viewportHeight"])if(![body[key] isKindOfClass:NSNumber.class]||!isfinite([body[key] doubleValue])||[body[key] doubleValue]<=0){reply(nil,@"Invalid picker viewport");return;}
            CGFloat sx=self.webview.bounds.size.width/[body[@"viewportWidth"] doubleValue],sy=self.webview.bounds.size.height/[body[@"viewportHeight"] doubleValue];
            frame=CGRectMake(frame.origin.x*sx,frame.origin.y*sy,frame.size.width*sx,frame.size.height*sy);
        }
        if(frame.size.width<1||frame.size.width>(fullRow?self.webview.bounds.size.width:100)||frame.size.height<1||frame.size.height>100||!CGRectContainsRect(self.webview.bounds,frame)){[self.routePicker removeFromSuperview];self.routePicker=nil;reply(@{@"mounted":@NO},nil);return;}
        if(!self.routePicker){self.routePicker=[AVRoutePickerView new];self.routePicker.prioritizesVideoDevices=NO;self.routePicker.delegate=self;self.routePicker.accessibilityLabel=@"AirPlay, speakers and TVs";}
        // The public control owns the entire tappable row. Its transparent glyph
        // sits above the app-drawn icon/label, without invoking private subviews or
        // synthesizing a button press. VoiceOver sees the native route control.
        self.routePicker.tintColor=fullRow?UIColor.clearColor:UIColor.systemOrangeColor;
        self.routePicker.activeTintColor=self.routePicker.tintColor;
        self.routePicker.frame=frame;[self.webview addSubview:self.routePicker];reply(@{@"mounted":@YES},nil);return;
    }
    if([action isEqual:@"routePicker"]){
        UIViewController *root=self.webview.window.rootViewController;
        while(root.presentedViewController)root=root.presentedViewController;
        if(!root){reply(nil,@"Output picker unavailable");return;}
        UIViewController *sheet=[UIViewController new];sheet.view.backgroundColor=UIColor.systemBackgroundColor;sheet.modalPresentationStyle=UIModalPresentationPageSheet;
        UILabel *label=[UILabel new];label.text=@"Choose an AirPlay output";label.font=[UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];label.textAlignment=NSTextAlignmentCenter;
        AVRoutePickerView *picker=[AVRoutePickerView new];picker.delegate=self;picker.prioritizesVideoDevices=NO;picker.tintColor=UIColor.systemOrangeColor;picker.activeTintColor=UIColor.systemOrangeColor;
        UIButton *done=[UIButton buttonWithType:UIButtonTypeSystem];[done setTitle:@"Done" forState:UIControlStateNormal];
        __weak UIViewController *weakSheet=sheet;[done addAction:[UIAction actionWithHandler:^(UIAction *a){[weakSheet dismissViewControllerAnimated:YES completion:nil];}] forControlEvents:UIControlEventTouchUpInside];
        UIStackView *stack=[[UIStackView alloc] initWithArrangedSubviews:@[label,picker,done]];stack.axis=UILayoutConstraintAxisVertical;stack.spacing=24;stack.translatesAutoresizingMaskIntoConstraints=NO;[sheet.view addSubview:stack];
        [NSLayoutConstraint activateConstraints:@[[stack.leadingAnchor constraintEqualToAnchor:sheet.view.safeAreaLayoutGuide.leadingAnchor constant:24],[stack.trailingAnchor constraintEqualToAnchor:sheet.view.safeAreaLayoutGuide.trailingAnchor constant:-24],[stack.centerYAnchor constraintEqualToAnchor:sheet.view.centerYAnchor],[picker.heightAnchor constraintEqualToConstant:64],[done.heightAnchor constraintEqualToConstant:44]]];
        if(@available(iOS 15.0,*))sheet.sheetPresentationController.detents=@[UISheetPresentationControllerDetent.mediumDetent];
        [root presentViewController:sheet animated:YES completion:nil];reply(@YES,nil);return;
    }
    if([action isEqual:@"network"]){[self send:@{@"type":@"network",@"networkType":self.networkType?:@"unknown"}];reply(@YES,nil);return;}
    if([action isEqual:@"sleepTimerStatus"]){[self expireSleepTimer];reply([self sleepTimerStatus],nil);return;}
    if([action isEqual:@"sleepTimer"]){
        NSNumber *minutes=body[@"minutes"];
        if(![minutes isKindOfClass:NSNumber.class] || ![@[@0,@15,@30,@45,@60,@90] containsObject:minutes]){reply(nil,@"Choose a sleep timer duration.");return;}
        [self.sleepTimer invalidate];self.sleepTimer=nil;
        self.sleepDeadline=minutes.doubleValue>0?NSDate.date.timeIntervalSince1970+minutes.doubleValue*60:0;
        if(self.sleepDeadline>0){
            __weak NMNativeAudio *weak=self;
            self.albumPrepareRevision++;for(NMAlbumQueue *queue in self.albumQueues)[queue cancel];
            self.sleepTimer=[NSTimer timerWithTimeInterval:minutes.doubleValue*60 repeats:NO block:^(NSTimer *timer){[weak expireSleepTimer];}];
            [NSRunLoop.mainRunLoop addTimer:self.sleepTimer forMode:NSRunLoopCommonModes];
        }
        reply([self sleepTimerStatus],nil);return;
    }
    if([action isEqual:@"sync"]){[self emitAlbumReceipt:self.active];[self safetyCacheChanged];for(NSInteger i=0;i<2;i++)if(self.players[i].currentItem){if(self.ready[i].boolValue && !self.recovery[i].restoring)[self emit:@"loadedmetadata" deck:i];[self emit:[self playbackEvent:i] deck:i];}[self publish];reply(@YES,nil);return;}
    if([action isEqual:@"commandResult"]){if([body[@"id"] isEqual:@(self.commandID)]){self.commandResult=[body[@"handled"] isEqual:@YES]?@"handled":@"no queue move";[self publish];}reply(@YES,nil);return;}
    if([action isEqual:@"commands"]){self.previousEnabled=[body[@"previous"] isEqual:@YES];if(body[@"canPrevious"])self.canGoPrevious=[body[@"canPrevious"] isEqual:@YES];self.nextEnabled=[body[@"next"] isEqual:@YES];self.nowPlayingSession.remoteCommandCenter.previousTrackCommand.enabled=self.previousEnabled;self.nowPlayingSession.remoteCommandCenter.nextTrackCommand.enabled=self.nextEnabled;reply(@YES,nil);return;}
    if([action isEqual:@"metadata"]){NSDictionary *values=body[@"metadata"];if(![values isKindOfClass:NSDictionary.class]){reply(nil,@"Invalid metadata");return;}
        NSInteger requestedRevision=++self.metadataRevision;
        [self.webview.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){if([self.page isEqual:page] && requestedRevision==self.metadataRevision)[self setMetadata:values webCookies:[self firstPartyCookies:cookies]];}];reply(@YES,nil);return;}
    if(![body[@"deck"] isKindOfClass:NSNumber.class]||![body[@"generation"] isKindOfClass:NSNumber.class]){reply(nil,@"Invalid deck");return;}
    NSInteger deck=[body[@"deck"] integerValue];if(deck<0||deck>1){reply(nil,@"Invalid deck");return;}
    if(self.mediaResetPending){reply(nil,@"Audio system is restarting. Tap Play to resume.");return;}
    NSNumber *generation=body[@"generation"];AVPlayer *player=self.players[deck];
    if([action isEqual:@"load"]) {
        self.restoringCheckpoint=NO;self.checkpointRequestPending=NO;
        if(generation.integerValue<self.generations[deck].integerValue){reply(nil,@"Stale load");return;}
        NSString *raw=body[@"url"];if(![raw isKindOfClass:NSString.class]||raw.length>8192){reply(nil,@"Invalid stream");return;}
        NSURL *url=[NSURL URLWithString:raw];
        if(raw.length && (!NMTrustedURL(url)||![url.path hasPrefix:@"/api/navidrome/"]||![url.path containsString:@"/stream"])){reply(nil,@"Unsupported stream origin");return;}
        [self sampleListening:deck];[self.listeningLedger loadURL:raw.length?url:nil deck:deck];
        self.resumeAfterInterruption=NO;[self.recovery[deck] load:raw.length?url:nil];
        NSNumber *restore=body[@"restorePosition"];
        if(raw.length&&[restore isKindOfClass:NSNumber.class]&&isfinite(restore.doubleValue)&&restore.doubleValue>0){self.recovery[deck].position=restore.doubleValue;self.recovery[deck].restoring=YES;}
        [player pause];self.generations[deck]=generation;[self replaceItem:nil deck:deck];
        if(!raw.length){if(deck==self.active)[self.checkpoint clear];reply(@YES,nil);return;}
        NSDictionary *download=[self downloadForStream:url];
        if(download){
            self.downloadedDecks[deck]=@{@"songID":download[@"songID"],@"scope":download[@"scope"],@"cached":download[@"cached"]?:@NO};
            AVURLAsset *asset=NMPlaybackAsset(download[@"file"], @{AVURLAssetOverrideMIMETypeKey:download[@"mimeType"],AVURLAssetReferenceRestrictionsKey:@(AVAssetReferenceRestrictionForbidAll)});
            [self replaceItem:[AVPlayerItem playerItemWithAsset:asset] deck:deck];reply(@YES,nil);return;
        }
        if(self.offlineLaunch){reply(nil,@"This track is unavailable offline, or playback ownership needs confirmation. Reconnect to continue.");return;}
        NSURL *hls=[body[@"hlsUrl"] isKindOfClass:NSString.class]?[NSURL URLWithString:body[@"hlsUrl"]]:nil;
        // Keep the canonical song identity separate from the selected delivery URL.
        // Recovery renews HLS, or retries this exact progressive stream.
        if(!NMHLSURL(hls,self.listeningLedger.scope)||[[self routeKind] isEqual:@"AirPlay"])hls=nil;
        [self.webview.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){
            if(self.mediaResetPending||self.players[deck]!=player||![self.page isEqual:page]||![self.generations[deck] isEqual:generation]){reply(nil,@"Stale load");return;}
            self.recovery[deck].deliveryURL=hls?:url;
            AVURLAsset *asset=NMPlaybackAsset(self.recovery[deck].deliveryURL, @{AVURLAssetHTTPCookiesKey:[self firstPartyCookies:cookies]});
            [self replaceItem:[AVPlayerItem playerItemWithAsset:asset] deck:deck];reply(@YES,nil);
        }];return;
    }
    if(![generation isEqual:self.generations[deck]]){reply(nil,@"Stale command");return;}
    if([action isEqual:@"album.cancel"]){self.albumPrepareRevision++;[self emitAlbumReceipt:deck];[self.albumQueues[deck] cancel];reply(@YES,nil);return;}
    if([action isEqual:@"album.prepare"]){
        NSArray *entries=body[@"entries"];NSString *token=body[@"token"],*current=body[@"currentURL"],*anchor=body[@"currentQueueItemId"];
        if(![anchor isKindOfClass:NSString.class]||anchor.length<1||anchor.length>160||![token isKindOfClass:NSString.class]||token.length<1||token.length>200||![entries isKindOfClass:NSArray.class]||!entries.count||entries.count>31||![current isKindOfClass:NSString.class]||![current isEqual:self.recovery[deck].url.absoluteString]){reply(nil,@"Invalid album reservation");return;}
        if(deck!=self.active||self.sleepDeadline>0||NMHLSURL(self.recovery[deck].deliveryURL,self.listeningLedger.scope)){reply(@NO,nil);return;}
        if([self.albumQueues[deck].token isEqual:token]){reply(@YES,nil);return;}
        for(id value in entries){
            if(![value isKindOfClass:NSDictionary.class]){reply(nil,@"Invalid album entry");return;}
            NSDictionary *entry=value;NSString *url=entry[@"url"],*identifier=entry[@"queueItemId"];
            if(![url isKindOfClass:NSString.class]||url.length>8192||!NMTrustedURL([NSURL URLWithString:url])||!NMCheckpointURL([NSURL URLWithString:url],self.listeningLedger.scope)||![identifier isKindOfClass:NSString.class]||identifier.length<1||identifier.length>160){reply(nil,@"Invalid album source");return;}
            for(NSString *key in @[@"title",@"artist",@"album",@"artwork"])if(entry[key]&&(![entry[key] isKindOfClass:NSString.class]||[entry[key] length]>2048)){reply(nil,@"Invalid album metadata");return;}
        }
        NSUInteger reservation=++self.albumPrepareRevision;
        [self.webview.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray *cookies){
            if(reservation!=self.albumPrepareRevision||deck!=self.active||self.sleepDeadline>0||![self.page isEqual:page]||![generation isEqual:self.generations[deck]]||![current isEqual:self.recovery[deck].url.absoluteString]){reply(@NO,nil);return;}
            NSArray *firstParty=[self firstPartyCookies:cookies];NSMutableArray *items=[NSMutableArray new],*resolved=[NSMutableArray new];
            for(NSDictionary *entry in entries){
                NSURL *url=[NSURL URLWithString:entry[@"url"]];NSDictionary *download=[self downloadForStream:url];
                if(self.offlineLaunch&&!download){reply(@NO,nil);return;}
                AVURLAsset *asset=download?NMPlaybackAsset(download[@"file"],@{AVURLAssetOverrideMIMETypeKey:download[@"mimeType"],AVURLAssetReferenceRestrictionsKey:@(AVAssetReferenceRestrictionForbidAll)}):NMPlaybackAsset(url,@{AVURLAssetHTTPCookiesKey:firstParty});
                AVPlayerItem *item=[AVPlayerItem playerItemWithAsset:asset];item.preferredForwardBufferDuration=30;
                [items addObject:item];NSMutableDictionary *details=[entry mutableCopy];
                if(download)details[@"download"]=@{@"songID":download[@"songID"],@"scope":download[@"scope"],@"cached":download[@"cached"]?:@NO};
                [resolved addObject:details];
            }
            self.albumCookies=firstParty;self.albumQueues[deck].anchor=anchor;reply(@([self.albumQueues[deck] prepare:items entries:resolved token:token]),nil);
        }];return;
    }
    if([action isEqual:@"toggle"]){
        if(!player.currentItem){reply(nil,@"Playback unavailable");return;}
        BOOL shouldPause=self.recovery[deck].wantsPlayback;
        if(shouldPause){self.resumeAfterInterruption=NO;[self pauseDeck:deck];[self emit:@"pause" deck:deck];}
        else {if(![self activate]){reply(nil,@"Playback unavailable");return;}[self playDeck:deck];}
        [self publish];reply(@{@"paused":@(shouldPause)},nil);return;
    }
    if([action isEqual:@"play"]){if(!player.currentItem||![self activate]){reply(nil,@"Playback unavailable");return;}[self playDeck:deck];}
    else if([action isEqual:@"pause"]){self.resumeAfterInterruption=NO;[self pauseDeck:deck];}
    else if([action isEqual:@"seek"] && [body[@"time"] isKindOfClass:NSNumber.class])[self seek:[body[@"time"] doubleValue] deck:deck];
    else if([action isEqual:@"volume"] && [body[@"volume"] isKindOfClass:NSNumber.class]){double volume=[body[@"volume"] doubleValue];if(isfinite(volume))player.volume=MAX(0,MIN(1,volume));}
    else {reply(nil,@"Unsupported action");return;}
    [self publish];reply(@YES,nil);
}
- (NSArray *)firstPartyCookies:(NSArray<NSHTTPCookie *> *)cookies {
    NSMutableArray *result=[NSMutableArray new];
    for(NSHTTPCookie *cookie in cookies)if([cookie.domain isEqual:@"navimuse.example.com"]||[cookie.domain isEqual:@".navimuse.example.com"])[result addObject:cookie];
    return result;
}
@end
void navimuse_install_native_audio(WKWebView *webview, const char *javascript) {
    if(objc_getAssociatedObject(webview,@selector(firstPartyCookies:)))return;
    NMNativeAudio *audio=[NMNativeAudio new];audio.webview=webview;
    objc_setAssociatedObject(webview,@selector(firstPartyCookies:),audio,OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    webview.opaque=NO;webview.backgroundColor=[UIColor colorWithRed:9/255.0 green:13/255.0 blue:15/255.0 alpha:1];
    [webview addObserver:audio forKeyPath:@"URL" options:0 context:NULL];
    [webview addObserver:audio forKeyPath:@"loading" options:0 context:NULL];
    audio.navigationRecovery=[NMNavigationRecovery new];
    audio.navigationRecovery.original=webview.navigationDelegate;
    __weak NMNativeAudio *weak=audio;
    audio.navigationRecovery.failure=^(NSError *error){[weak navigationFailed:error];};
    audio.navigationRecovery.terminated=^{[weak contentProcessTerminated];};
    webview.navigationDelegate=audio.navigationRecovery;
    [audio showLoading];
    WKUserContentController *controller=webview.configuration.userContentController;
    [controller addScriptMessageHandlerWithReply:audio contentWorld:WKContentWorld.pageWorld name:@"navimuseAudio"];
    NSString *source=[NSString stringWithUTF8String:javascript];
    NSArray *formats=[AVURLAsset isPlayableExtendedMIMEType:@"audio/ogg; codecs=opus"]?@[@"raw",@"mp3",@"opus"]:@[@"raw",@"mp3"];
    NSString *formatJSON=[[NSString alloc]initWithData:[NSJSONSerialization dataWithJSONObject:formats options:0 error:nil] encoding:NSUTF8StringEncoding];
    source=[source stringByReplacingOccurrencesOfString:@"/*NM_AUDIO_FORMATS*/['raw','mp3']" withString:formatJSON];
    [controller addUserScript:[[WKUserScript alloc]initWithSource:source injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    // Mount the packaged interface without waiting for remote HTML or assets.
    // The unchanged bridge and BFF still verify the document and account.
    [audio reconnect];
}
