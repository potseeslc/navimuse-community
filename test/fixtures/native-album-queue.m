#import "../../src-tauri/ios/native-audio.m"
static void check(BOOL value,NSString *label){if(!value){NSLog(@"FAIL: %@",label);exit(1);}}
@interface NMAlbumTestPlayer : AVQueuePlayer
@property(nonatomic) NSUInteger playCalls;
@end
@implementation NMAlbumTestPlayer
- (void)play {self.playCalls++;[super play];}
@end
@interface NMAlbumTestController : NMNativeAudio
@property(nonatomic,strong) NSMutableArray *events;
@property(nonatomic) NSUInteger checkpoints;
@end
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-designated-initializers"
@implementation NMAlbumTestController
- (instancetype)init {
 self.players=@[[NMAlbumTestPlayer new],[NMAlbumTestPlayer new]];
 self.albumQueues=@[[[NMAlbumQueue alloc]initWithPlayer:(id)self.players[0]],[[NMAlbumQueue alloc]initWithPlayer:(id)self.players[1]]];
 __weak NMAlbumTestController *owner=self;
 for(NSInteger i=0;i<2;i++)self.albumQueues[i].promoted=^(NSDictionary *entry,AVPlayerItem *old){[owner albumAdvanced:entry previous:old deck:i];};
 self.recovery=@[[NMStreamRecovery new],[NMStreamRecovery new]];self.generations=[@[@1,@1] mutableCopy];self.ready=[@[@NO,@NO] mutableCopy];self.streamDetails=[@[@{},@{}] mutableCopy];self.downloadedDecks=[@[@{},@{}] mutableCopy];self.events=[NSMutableArray new];self.metadata=[NSMutableDictionary new];
 [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(ended:) name:AVPlayerItemDidPlayToEndTimeNotification object:nil];return self;
}
- (void)dealloc {} // Fixture exits while retained; production teardown needs its full observer setup.
- (void)publish {}
- (void)emit:(NSString *)type deck:(NSInteger)deck {[self.events addObject:@{@"type":type}];}
- (void)send:(NSDictionary *)event {[self.events addObject:event];}
- (void)saveCheckpoint {self.checkpoints++;}
- (BOOL)downloadedDeckAllowed:(NSInteger)deck {return YES;}
- (void)readStreamDetails:(NSInteger)deck {}
- (void)recordPlaybackEvent:(NSString *)event deck:(NSInteger)deck fields:(NSDictionary *)fields {}
- (void)recordSessionEvent:(NSString *)event {}
- (void)setMetadata:(NSDictionary *)metadata webCookies:(NSArray *)cookies {self.metadata=[metadata mutableCopy];}
@end
#pragma clang diagnostic pop
int main(int argc,char **argv){@autoreleasepool{
 check(argc==2,@"fixture WAV path");NSURL *file=[NSURL fileURLWithPath:@(argv[1])];
 NMAlbumTestController *controller=[NMAlbumTestController new];NMAlbumTestPlayer *player=(id)controller.players[0];player.volume=0;
 NSURL *first=[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/first"];
 [controller.recovery[0] load:first];controller.recovery[0].wantsPlayback=YES;
 [controller replaceItem:[AVPlayerItem playerItemWithURL:file] deck:0];
 NSMutableArray *items=[NSMutableArray new],*entries=[NSMutableArray new];
 for(NSString *name in @[@"second",@"third"]){[items addObject:[AVPlayerItem playerItemWithURL:file]];[entries addObject:@{@"queueItemId":name,@"url":[@"https://navimuse.example.com/api/navidrome/stream/" stringByAppendingString:name],@"title":name}];}
 controller.albumQueues[0].anchor=@"first";
 check([controller.albumQueues[0] prepare:items entries:entries token:@"album-test"],@"native preparation accepted");
 [player play];NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:12];
 while([deadline timeIntervalSinceNow]>0){[NSRunLoop.currentRunLoop runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:.05]];if([controller.events filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"type == 'ended'"]].count)break;}
 NSArray *handoffs=[controller.events filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"type == 'albumhandoff'"]];
 check(handoffs.count==2,@"two native handoffs without JavaScript");
 check([handoffs[0][@"queueItemId"] isEqual:@"second"]&&[handoffs[1][@"queueItemId"] isEqual:@"third"],@"native handoff occurrence order");
 check([controller.albumQueues[0].receipt[@"sequence"] isEqual:@[@"first",@"second",@"third"]],@"receipt carries occurrence sequence for scoped restoration");
 check(player.playCalls==1,@"only initial Play; handoffs do not replay");
 check([controller.events filteredArrayUsingPredicate:[NSPredicate predicateWithFormat:@"type == 'ended'"]].count==1,@"only final item emits ended");
 check([controller.recovery[0].url.lastPathComponent isEqual:@"third"],@"recovery source follows native promotion");
 check([controller.metadata[@"title"] isEqual:@"third"],@"native metadata follows promotion");
 check([controller.generations[0] isEqual:@1],@"handoff preserves load generation");
 AVPlayerItem *current=player.currentItem;
 check([controller.albumQueues[0] prepare:@[[AVPlayerItem playerItemWithURL:file]] entries:@[entries[0]] token:@"cancel-test"],@"next slot prepared for cancellation");
 [controller.albumQueues[0] cancel];check(player.items.count==1&&player.currentItem==current,@"cancel removes future items only");
 [controller replaceItem:nil deck:0];check(controller.albumQueues[0].receipt==nil,@"replacement invalidates old receipts");
 NSLog(@"PASS: real muted AVQueuePlayer, two background-capable handoffs, one Play, final ended, metadata/recovery/receipt and cancellation");
 // Avoid the production deallocator, whose test-only observer slots are absent.
 (void)CFBridgingRetain(controller);return 0;
}}
