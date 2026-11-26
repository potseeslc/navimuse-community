#import <AVFoundation/AVFoundation.h>

// Transport reservations only: queue policy and occurrence identities come from
// the application. AVQueuePlayer owns the audio boundary while JS is suspended.
@interface NMAlbumQueue : NSObject
@property(nonatomic,strong) AVQueuePlayer *player;
@property(nonatomic,strong) NSMapTable<AVPlayerItem *,NSDictionary *> *entries;
@property(nonatomic,strong) AVPlayerItem *observedItem;
@property(nonatomic,copy) NSString *token;
@property(nonatomic,copy) NSString *anchor;
@property(nonatomic,strong) NSArray *sequence;
@property(nonatomic,strong) NSDictionary *receipt;
@property(nonatomic,copy) void (^promoted)(NSDictionary *,AVPlayerItem *);
- (instancetype)initWithPlayer:(AVQueuePlayer *)player;
- (BOOL)prepare:(NSArray<AVPlayerItem *> *)items entries:(NSArray<NSDictionary *> *)entries token:(NSString *)token;
- (void)cancel;
@end
@implementation NMAlbumQueue
- (instancetype)initWithPlayer:(AVQueuePlayer *)player {
 if(!(self=[super init]))return nil;
 _player=player;_entries=[NSMapTable strongToStrongObjectsMapTable];_observedItem=player.currentItem;
 player.actionAtItemEnd=AVPlayerActionAtItemEndPause;
 [player addObserver:self forKeyPath:@"currentItem" options:0 context:NULL];return self;
}
- (void)dealloc {[self.player removeObserver:self forKeyPath:@"currentItem"];}
- (void)cancel {
 self.token=nil;
 for(AVPlayerItem *item in self.player.items)if(item!=self.player.currentItem)[self.player removeItem:item];
 [self.entries removeAllObjects];self.player.actionAtItemEnd=AVPlayerActionAtItemEndPause;
}
- (BOOL)prepare:(NSArray<AVPlayerItem *> *)items entries:(NSArray<NSDictionary *> *)entries token:(NSString *)token {
 if(!self.player.currentItem||items.count==0||items.count!=entries.count||items.count>31)return NO;
 if([self.token isEqual:token])return YES;
 [self cancel];self.token=token;NSMutableArray *sequence=[NSMutableArray new];if(self.anchor)[sequence addObject:self.anchor];for(NSDictionary *entry in entries)[sequence addObject:entry[@"queueItemId"]];self.sequence=sequence;
 AVPlayerItem *after=self.player.currentItem;
 for(NSUInteger i=0;i<items.count;i++){
  AVPlayerItem *item=items[i];
  if(![self.player canInsertItem:item afterItem:after]){[self cancel];return NO;}
  [self.entries setObject:entries[i] forKey:item];[self.player insertItem:item afterItem:after];after=item;
 }
 self.player.actionAtItemEnd=AVPlayerActionAtItemEndAdvance;return YES;
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
 AVPlayerItem *old=self.observedItem;self.observedItem=self.player.currentItem;
 NSDictionary *entry=[self.entries objectForKey:self.observedItem];
 if(!entry||!self.token)return;
 [self.entries removeObjectForKey:self.observedItem];
 self.receipt=@{@"token":self.token,@"queueItemId":entry[@"queueItemId"],@"url":entry[@"url"],@"sequence":self.sequence?:@[]};
 if(self.player.items.count<=1)self.player.actionAtItemEnd=AVPlayerActionAtItemEndPause;
 if(self.promoted)self.promoted(entry,old);
}
@end
