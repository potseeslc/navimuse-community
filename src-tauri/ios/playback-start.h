#import <Foundation/Foundation.h>
// Independent from stream recovery: readiness/preroll callbacks must not revive
// an old play request after pause, seek, route removal or item replacement.
@interface NMPlaybackStart : NSObject
@property(nonatomic) NSUInteger revision;
@property(nonatomic) BOOL pending;
@property(nonatomic) BOOL seeking;
@property(nonatomic) NSUInteger requests;
@property(nonatomic) double position;
@property(nonatomic) BOOL hasPrepared;
@property(nonatomic,copy) NSString *phase;
- (void)cancel;
@end
@implementation NMPlaybackStart
- (instancetype)init {if((self=[super init]))_phase=@"idle";return self;}
- (void)cancel {self.revision++;self.pending=NO;self.seeking=NO;self.phase=@"cancelled";}
@end
