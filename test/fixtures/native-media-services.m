#import "../../src-tauri/ios/native-audio.m"
static void check(BOOL v,NSString *label){if(!v){NSLog(@"FAIL: %@",label);exit(1);}}
@interface NMResetTestController : NMNativeAudio
@property(nonatomic,strong) NSMutableArray *events;
@end
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-designated-initializers"
@implementation NMResetTestController
- (instancetype)init {
 self.players=@[[AVQueuePlayer new],[AVQueuePlayer new]];
 self.albumQueues=@[[[NMAlbumQueue alloc]initWithPlayer:(id)self.players[0]],[[NMAlbumQueue alloc]initWithPlayer:(id)self.players[1]]];
 self.recovery=@[[NMStreamRecovery new],[NMStreamRecovery new]];self.generations=[@[@1,@1] mutableCopy];self.ready=[@[@NO,@NO] mutableCopy];self.streamDetails=[@[@{},@{}] mutableCopy];self.downloadedDecks=[@[@{},@{}] mutableCopy];self.events=[NSMutableArray new];self.metadata=[NSMutableDictionary new];self.observers=[NSMutableArray new];self.remoteTargets=[NSMutableArray new];
 self.nowPlayingSession=[[MPNowPlayingSession alloc]initWithPlayers:self.players];
 [self attachPlayerObservers];[self attachRemoteCommands];return self;
}
- (void)publish {}
- (void)emit:(NSString *)type deck:(NSInteger)deck {[self.events addObject:type];}
- (void)send:(NSDictionary *)event {}
- (void)saveCheckpoint {}
- (void)readStreamDetails:(NSInteger)deck {}
- (void)recordPlaybackEvent:(NSString *)event deck:(NSInteger)deck fields:(NSDictionary *)fields {}
- (void)recordSessionEvent:(NSString *)event {[self.events addObject:event];}
@end
#pragma clang diagnostic pop
static void spin(double duration){NSDate *end=[NSDate dateWithTimeIntervalSinceNow:duration];while(end.timeIntervalSinceNow>0)[NSRunLoop.mainRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.01]];}
int main(int argc,char **argv){@autoreleasepool{
 NSError *reset=[NSError errorWithDomain:AVFoundationErrorDomain code:AVErrorMediaServicesWereReset userInfo:nil];
 check(NMMediaServicesResetError(reset),@"classifies AVFoundation reset");
 check(!NMMediaServicesResetError([NSError errorWithDomain:NSURLErrorDomain code:-11819 userInfo:nil]),@"rejects same number in other domain");
 check(NMMediaServicesResetError([NSError errorWithDomain:@"wrapper" code:1 userInfo:@{NSUnderlyingErrorKey:reset}]),@"wrapped reset");
 NMResetTestController *c=[NMResetTestController new];CFBridgingRetain(c);
 AVPlayer *old=c.players[0];MPNowPlayingSession *oldSession=c.nowPlayingSession;
 NSURL *url=[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/song?accountScope=account"];
 [c.recovery[0] load:url];c.recovery[0].position=123;c.recovery[0].wantsPlayback=YES;c.recovery[0].pending=YES;c.resumeAfterInterruption=YES;
 NSUInteger revision=c.recovery[0].revision;c.players[0].volume=.25;c.players[0].muted=YES;c.nextEnabled=YES;
 [c handleFailure:reset deck:0];[c mediaServicesReset:nil];
 check(c.mediaResetPending,@"defers reconstruction out of KVO");check(!c.recovery[0].wantsPlayback && !c.recovery[0].pending && c.recovery[0].revision>revision,@"revokes stale retries and play intent immediately");
 spin(.1);
 check(c.players[0]!=old && c.nowPlayingSession!=oldSession,@"replaces player and session");
 check(c.observers.count==2 && c.remoteTargets.count==6,@"exactly one observer and remote binding set");
 check(c.players[0].currentItem==nil && c.players[0].rate==0,@"does not automatically restart audio");
 check(c.recovery[0].position==123 && [c.recovery[0].url isEqual:url],@"preserves song and resume position");
 check(c.players[0].muted && c.players[0].volume==.25 && c.nowPlayingSession.remoteCommandCenter.nextTrackCommand.enabled,@"preserves output and queue controls");
 check(!c.resumeAfterInterruption,@"old interruption cannot resume playback");
 check([[c.events filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"SELF == %@",@"media-player-rebuilt"]] count]==1,@"coalesces item error and reset notification");
 // A fresh player can prepare an actual local audio item after the reset.
 [c.recovery[0] load:url];AVPlayerItem *item=[AVPlayerItem playerItemWithURL:[NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]]];
 [c replaceItem:item deck:0];spin(1);
 check(item.status==AVPlayerItemStatusReadyToPlay && c.ready[0].boolValue,@"new engine prepares audio successfully");
 [c mediaServicesReset:nil];spin(.1);check(c.players[0].currentItem==nil,@"repeated reset detaches item observers safely");
 NSLog(@"PASS: media-services reconstruction, cancellation, no autoplay, preserved position, real audio preparation");return 0;
}}
