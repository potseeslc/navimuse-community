// Production controller with inert players: never activate an audio session or
// start household/local playback. Completion order is controlled by the test.
#import "../../src-tauri/ios/native-audio.m"
static void check(BOOL value,NSString *label){if(!value){NSLog(@"FAIL: %@",label);exit(1);}}
static void pump(void){NSDate *until=[NSDate dateWithTimeIntervalSinceNow:0.03];while([until timeIntervalSinceNow]>0)[NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:until];}
@interface NMStartItem : AVPlayerItem
@property(nonatomic) BOOL fixtureReady;
@end
@implementation NMStartItem
- (AVPlayerItemStatus)status{return self.fixtureReady?AVPlayerItemStatusReadyToPlay:AVPlayerItemStatusUnknown;}
- (CMTime)duration{return CMTimeMakeWithSeconds(300,600);}
@end
@interface NMStartPlayer : AVPlayer
@property(nonatomic) NMStartItem *fixtureItem;
@property(nonatomic) BOOL fixtureReady;
@property(nonatomic) NSUInteger plays;
@property(nonatomic) NSUInteger prerolls;
@property(nonatomic) double position;
@property(nonatomic) AVPlayerTimeControlStatus fixtureTimeControl;
@property(nonatomic,copy) void (^prepared)(BOOL);
@property(nonatomic,copy) void (^sought)(BOOL);
@end
@implementation NMStartPlayer
- (AVPlayerItem *)currentItem{return self.fixtureItem;}
- (AVPlayerStatus)status{return self.fixtureReady?AVPlayerStatusReadyToPlay:AVPlayerStatusUnknown;}
- (float)rate{return 0;}
- (CMTime)currentTime{return CMTimeMakeWithSeconds(self.position,600);}
- (AVPlayerTimeControlStatus)timeControlStatus{return self.fixtureTimeControl;}
- (void)replaceCurrentItemWithPlayerItem:(AVPlayerItem *)item{self.fixtureItem=(id)item;self.position=0;}
- (void)play{self.plays++;}
- (void)pause{}
- (void)cancelPendingPrerolls{} // Deliberately permit late callbacks after cancel.
- (void)prerollAtRate:(float)rate completionHandler:(void (^)(BOOL))completion {
 check(rate==1 && self.status==AVPlayerStatusReadyToPlay && self.currentItem.status==AVPlayerItemStatusReadyToPlay,@"preroll requires ready player and item");self.prerolls++;self.prepared=completion;
}
- (void)seekToTime:(CMTime)time toleranceBefore:(CMTime)before toleranceAfter:(CMTime)after completionHandler:(void (^)(BOOL))completion{self.position=CMTimeGetSeconds(time);self.sought=completion;}
@end
@interface NMRealSilentPlayer : AVPlayer
@property(nonatomic) NSUInteger playRequests;
@end
@implementation NMRealSilentPlayer
- (void)play {self.playRequests++;} // Never call AVPlayer's actual playback.
@end
@interface NMStartController : NMNativeAudio @end
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-designated-initializers"
@implementation NMStartController
- (instancetype)init {
 self.players=@[[NMStartPlayer new],[NMStartPlayer new]];self.recovery=@[[NMStreamRecovery new],[NMStreamRecovery new]];
 self.generations=[@[@1,@1] mutableCopy];self.ready=[@[@NO,@NO] mutableCopy];self.streamDetails=[@[@{},@{}] mutableCopy];self.networkType=@"offline";return self;
}
- (BOOL)activate{return YES;}
- (BOOL)downloadedDeckAllowed:(NSInteger)deck{return YES;} // Fixture authorization only; production gate tested separately.
- (void)publish{}
- (void)send:(NSDictionary *)event{}
- (void)readStreamDetails:(NSInteger)deck{}
@end
#pragma clang diagnostic pop
static void load(NMStartController *controller,NSString *path,BOOL ready) {
 [controller.recovery[0] load:[NSURL URLWithString:[@"https://navimuse.example.com" stringByAppendingString:path]]];
 NMStartItem *item=[[NMStartItem alloc]initWithURL:[NSURL fileURLWithPath:@"/nonexistent"]];item.fixtureReady=ready;
 ((NMStartPlayer *)controller.players[0]).fixtureReady=ready;
 [controller replaceItem:item deck:0];
}
int main(int argc,char **argv){@autoreleasepool{
 NMStartController *c=[NMStartController new];NMStartPlayer *p=(id)c.players[0];
 load(c,@"/api/navidrome/stream/one",NO);[c playDeck:0];
 check(p.plays==0 && p.prerolls==0 && [c startState:0].pending,@"unknown item cannot start clock");
 p.fixtureItem.fixtureReady=YES;[c observeValueForKeyPath:@"status" ofObject:p.fixtureItem change:nil context:NULL];
 check(p.prerolls==0,@"item readiness alone is insufficient");
 p.fixtureReady=YES;[c observeValueForKeyPath:@"status" ofObject:p change:nil context:NULL];
 check(p.prerolls==1 && p.plays==0 && p.position==0,@"pipeline prepares with unchanged zero position");
 [c playDeck:0];check(p.prerolls==1,@"duplicate play cannot begin a second preroll");
 p.prepared(YES);check(p.plays==1 && [c startState:0].position==0,@"successful preparation starts once at beginning");
 load(c,@"/api/navidrome/stream/two",YES);[c playDeck:0];void (^paused)(BOOL)=p.prepared;
 [c pauseDeck:0];paused(YES);check(p.plays==1,@"pause invalidates delayed completion");
 [c playDeck:0];void (^replaced)(BOOL)=p.prepared;
 load(c,@"/api/navidrome/stream/three",YES);[c playDeck:0];replaced(YES);check(p.plays==1,@"new track invalidates old completion");p.prepared(YES);check(p.plays==2,@"new track starts exactly once");
 load(c,@"/api/navidrome/stream/four",YES);[c playDeck:0];void (^beforeSeek)(BOOL)=p.prepared;
 [c seek:120 deck:0];beforeSeek(YES);check(p.plays==2 && [c startState:0].seeking,@"seek cancels pending zero-position preparation");
 p.sought(YES);pump();check([c startState:0].pending,@"completed seek primes requested position");p.prepared(YES);check(p.plays==3 && [c startState:0].position==120,@"resume starts at requested seek position");
 load(c,@"/api/navidrome/stream/five",YES);[c playDeck:0];void (^removedRoute)(BOOL)=p.prepared;
 [c routeChanged:[NSNotification notificationWithName:AVAudioSessionRouteChangeNotification object:nil userInfo:@{AVAudioSessionRouteChangeReasonKey:@(AVAudioSessionRouteChangeReasonOldDeviceUnavailable)}]];
 removedRoute(YES);check(p.plays==3 && !c.recovery[0].wantsPlayback,@"route removal never restarts delayed audio");
 [c playDeck:0];void (^oldRoute)(BOOL)=p.prepared;
 [c routeChanged:[NSNotification notificationWithName:AVAudioSessionRouteChangeNotification object:nil userInfo:@{AVAudioSessionRouteChangeReasonKey:@(AVAudioSessionRouteChangeReasonNewDeviceAvailable)}]];
 oldRoute(YES);check(p.plays==3,@"route change discards old pipeline completion");p.prepared(YES);check(p.plays==4,@"new route primes before start");
 load(c,@"/api/navidrome/stream/six",YES);[c playDeck:0];p.prepared(NO);check(p.plays==4 && c.recovery[0].restoring && c.recovery[0].pending,@"failed priming enters bounded recovery without play");
 load(c,@"/api/navidrome/radios/one/stream",YES);NSUInteger prerolls=p.prerolls;[c playDeck:0];check(p.plays==5 && p.prerolls==prerolls,@"live radio retains continuous stream behavior");
 // Production KVO path: a downloaded player can report waiting after preroll
 // while AVPlayer starts its output. Waiting is not a terminal file error.
 load(c,@"/api/navidrome/stream/download",YES);
 c.downloadedDecks=[@[@{@"songID":@"download",@"scope":@"fixture"},@{}] mutableCopy];
 [c playDeck:0];p.prepared(YES);
 [c observeValueForKeyPath:@"timeControlStatus" ofObject:p change:nil context:NULL];
 check(c.recovery[0].wantsPlayback && c.recovery[0].pending,@"downloaded startup waiting preserves play intent during bounded grace");
 [c pauseDeck:0];check(!c.recovery[0].wantsPlayback && !c.recovery[0].pending,@"pause cancels downloaded wait");
 c.downloadedDecks[0]=@{};
 NMStartController *waiting=[NMStartController new],*playing=[NMStartController new],*cancelled=[NMStartController new];
 for(NMStartController *test in @[waiting,playing,cancelled]){
  load(test,@"/api/navidrome/stream/downloaded-wait",YES);test.downloadedDecks=[@[@{@"songID":@"download",@"scope":@"fixture"},@{}] mutableCopy];
  [test playDeck:0];((NMStartPlayer *)test.players[0]).prepared(YES);[test scheduleRecovery:0];
 }
 ((NMStartPlayer *)playing.players[0]).fixtureTimeControl=AVPlayerTimeControlStatusPlaying;
 [cancelled pauseDeck:0];cancelled.downloadedDecks[0]=@{};load(cancelled,@"/api/navidrome/stream/replacement",YES);
 [cancelled playDeck:0];((NMStartPlayer *)cancelled.players[0]).prepared(YES);
 NSDate *grace=[NSDate dateWithTimeIntervalSinceNow:8.2];while(grace.timeIntervalSinceNow>0)pump();
 check(!waiting.recovery[0].wantsPlayback && !waiting.recovery[0].pending,@"persistent local wait ends in a bounded local failure");
 check(playing.recovery[0].wantsPlayback && !playing.recovery[0].pending && !playing.recovery[0].restoring,@"download that begins playing survives grace without a network replacement");
 check(cancelled.recovery[0].wantsPlayback,@"cancelled local timer cannot stop replacement playback");
 [playing handleFailure:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorTimedOut userInfo:nil] deck:0];
 check(!playing.recovery[0].wantsPlayback && !playing.recovery[0].restoring,@"actual downloaded failure stays local immediately");
 NMStartController *actual=[NMStartController new];NMRealSilentPlayer *real=[NMRealSilentPlayer new];actual.players=@[real,[NMRealSilentPlayer new]];
 [real addObserver:actual forKeyPath:@"status" options:0 context:NULL];
 NSURL *file=[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
 [actual.recovery[0] load:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/silent-fixture"]];
 [actual replaceItem:[AVPlayerItem playerItemWithURL:file] deck:0];[actual playDeck:0];
 NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:6];while(real.playRequests==0 && [deadline timeIntervalSinceNow]>0)pump();
 check(real.currentItem.status==AVPlayerItemStatusReadyToPlay,@"actual file is ready");
 check(real.playRequests==1 && [[actual startState:0].phase isEqual:@"started"],@"real render pipeline preroll completes before intercepted play");
 check(real.rate==0 && fabs(CMTimeGetSeconds(real.currentTime))<0.001,@"real preroll leaves audio silent and media clock at zero");
 NSLog(@"PASS: real AVPlayer file preroll completes at time zero with playback suppressed");
 NSLog(@"PASS: native readiness, preroll-before-play, zero start, duplicate play, pause, replacement, seek, route changes, failure recovery and live radio");
 exit(0); // Bypassed production setup, so do not run observer teardown.
}return 1;}
