// Simulator-only executable: run the production controller with inert AVPlayer
// subclasses. No stream requests, account, AVAudioSession or audible playback.
#import "../../src-tauri/ios/native-audio.m"
#include <assert.h>
@interface NMTestItem : AVPlayerItem
@end
@implementation NMTestItem
- (AVPlayerItemStatus)status{return AVPlayerItemStatusReadyToPlay;}
- (CMTime)duration{return CMTimeMakeWithSeconds(300,600);}
@end
@interface NMTestPlayer : AVPlayer
@property(nonatomic,strong) AVPlayerItem *fixtureItem;
@property(nonatomic) NSInteger plays;
@property(nonatomic) double sought;
@property(nonatomic,copy) void (^completion)(BOOL);
@end
@implementation NMTestPlayer
- (AVPlayerItem *)currentItem{return self.fixtureItem;}
- (CMTime)currentTime{return CMTimeMakeWithSeconds(self.sought,600);}
- (AVPlayerTimeControlStatus)timeControlStatus{return AVPlayerTimeControlStatusPaused;}
- (AVPlayerStatus)status{return AVPlayerStatusReadyToPlay;}
- (void)prerollAtRate:(float)rate completionHandler:(void (^)(BOOL))completion {completion(YES);}
- (void)play{self.plays++;}
- (void)pause{}
- (void)seekToTime:(CMTime)time toleranceBefore:(CMTime)before toleranceAfter:(CMTime)after completionHandler:(void (^)(BOOL))completion {self.sought=CMTimeGetSeconds(time);self.completion=completion;}
@end
@interface NMTestController : NMNativeAudio
@property(nonatomic,strong) NSMutableArray *events;
@end
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-designated-initializers"
@implementation NMTestController
- (instancetype)init {
    // Deliberately bypass service setup: this fixture exercises the production
    // event/recovery methods without installing real players or observers.
    self.players=@[[NMTestPlayer new],[NMTestPlayer new]];
    self.recovery=@[[NMStreamRecovery new],[NMStreamRecovery new]];
    self.generations=[@[@1,@1] mutableCopy];self.ready=[@[@YES,@YES] mutableCopy];
    self.streamDetails=[@[@{},@{}] mutableCopy];self.events=[NSMutableArray new];self.networkType=@"offline";
    return self;
}
- (BOOL)activate{return YES;}
- (void)publish{}
- (void)send:(NSDictionary *)event{[self.events addObject:event];}
@end
#pragma clang diagnostic pop
static NMTestController *controller;
static void prepare(void){
    NMStreamRecovery *state=controller.recovery[0];
    [state load:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/song"]];
    state.wantsPlayback=YES;state.restoring=YES;state.position=73.5;
    NMTestPlayer *player=(id)controller.players[0];
    player.fixtureItem=[[NMTestItem alloc]initWithURL:[NSURL fileURLWithPath:@"/nonexistent"]];
}
int main(void){@autoreleasepool{
    controller=[NMTestController new];prepare();
    NMTestPlayer *player=(id)controller.players[0];
    assert([[controller playbackEvent:0] isEqual:@"waiting"]);
    [controller restoreDeck:0];assert(player.sought==73.5 && player.plays==0);
    void (^stale)(BOOL)=player.completion;
    [controller pauseDeck:0];stale(YES);
    dispatch_async(dispatch_get_main_queue(),^{
        assert(player.plays==0);assert(!controller.recovery[0].wantsPlayback);
        prepare();[controller restoreDeck:0];void (^oldTrack)(BOOL)=player.completion;
        [controller.recovery[0] load:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/next"]];oldTrack(YES);
        dispatch_async(dispatch_get_main_queue(),^{
            assert(player.plays==0);prepare();[controller restoreDeck:0];
            player.completion(YES);
            dispatch_async(dispatch_get_main_queue(),^{
                assert(player.plays==1);assert(!controller.recovery[0].restoring);
                prepare();[controller restoreDeck:0];void (^oldSeek)(BOOL)=player.completion;
                [controller seek:120 deck:0];assert(player.sought==120);oldSeek(YES);player.completion(YES);
                dispatch_async(dispatch_get_main_queue(),^{
                    assert(player.plays==2); // superseded seek cannot restart twice
                    [controller routeChanged:[NSNotification notificationWithName:AVAudioSessionRouteChangeNotification object:nil userInfo:@{AVAudioSessionRouteChangeReasonKey:@(AVAudioSessionRouteChangeReasonOldDeviceUnavailable)}]];
                    assert(!controller.recovery[0].wantsPlayback);
                    assert([[controller playbackEvent:0] isEqual:@"pause"]);
                    prepare();controller.listeningLedger=[NMListeningLedger new];controller.listeningLedger.scope=@"scope";
                    player.fixtureItem=[[NMTestItem alloc]initWithURL:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/hls/sessions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/master.m3u8?accountScope=scope"]];
                    [controller handleFailure:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorResourceUnavailable userInfo:nil] deck:0];
                    assert(controller.recovery[0].pending && controller.recovery[0].restoring);
                    assert([controller.recovery[0].url.path isEqual:@"/api/navidrome/stream/song"]);
                    assert(controller.recovery[0].position==73.5);
                    [controller pauseDeck:0];
                    prepare();NSError *networkError=[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNetworkConnectionLost userInfo:nil];
                    [controller handleFailure:networkError deck:0];assert(controller.recovery[0].pending);
                    NSUInteger pendingRevision=controller.recovery[0].revision;
                    [controller handleFailure:networkError deck:0];
                    assert(controller.recovery[0].pending && controller.recovery[0].revision==pendingRevision && controller.recovery[0].attempts==0);
                    [controller pauseDeck:0];assert(!controller.recovery[0].pending);
                    NSInteger priorPlays=player.plays;
                    prepare();[controller restoreDeck:0];player.sought=0;player.completion(YES);
                    dispatch_async(dispatch_get_main_queue(),^{
                        assert(player.plays==priorPlays && controller.recovery[0].restoring);
                        assert(controller.recovery[0].position==73.5);
                        [controller pauseDeck:0];
                        prepare();controller.page=nil;controller.webview=nil;
                        NSInteger beforeRemote=player.plays;
                        assert([controller remote:@"play" event:nil]==MPRemoteCommandHandlerStatusSuccess);
                        assert(player.sought==73.5);player.completion(YES);
                        dispatch_async(dispatch_get_main_queue(),^{
                            assert(player.plays==beforeRemote+1);
                            assert([controller remote:@"pause" event:nil]==MPRemoteCommandHandlerStatusSuccess);
                            assert(!controller.recovery[0].wantsPlayback);
                            player.fixtureItem=nil;controller.restoringCheckpoint=YES;controller.checkpointRequestPending=YES;
                            assert([controller remote:@"play" event:nil]==MPRemoteCommandHandlerStatusSuccess);
                            assert(controller.recovery[0].wantsPlayback);
                            assert([controller remote:@"pause" event:nil]==MPRemoteCommandHandlerStatusSuccess);
                            assert(!controller.recovery[0].wantsPlayback);
                            NSLog(@"PASS: seek-before-play, cancellation, route removal, and native remote resume/pause without WebKit");
                            exit(0);
                        });
                    });
                });
            });
        });
    });
    CFRunLoopRun();
}return 1;}
