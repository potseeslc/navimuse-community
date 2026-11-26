#import <Foundation/Foundation.h>
#import "offline-store.h"

NS_ASSUME_NONNULL_BEGIN
// Main-queue coordinator. WebKit supplies cookies directly; neither cookies nor
// grant documents are accepted from web messages or included in snapshots.
@interface NMOfflineDownloads : NSObject <NSURLSessionDownloadDelegate>
@property(nonatomic, copy, nullable) void (^changed)(void);
@property(nonatomic, copy) NSString *networkType;
@property(nonatomic, readonly) NMOfflineStore *store;
@property(nonatomic) BOOL pausedForPlayback;
@property(nonatomic, readonly) double transferBitsPerSecond;
@property(nonatomic, readonly) double transferSampleTime;
- (instancetype)initWithRootURL:(NSURL *)root;
- (void)authorizeScope:(NSString *)scope cookies:(NSArray<NSHTTPCookie *> *)cookies completion:(void (^)(NSError * _Nullable))completion;
- (BOOL)enqueueSongs:(NSArray *)songs format:(NSString *)format bitrate:(NSNumber *)bitrate cookies:(NSArray<NSHTTPCookie *> *)cookies error:(NSError **)error;
- (NSDictionary *)snapshot;
- (void)prioritizeSongs:(NSArray *)songs;
- (void)cancelSongID:(NSString *)songID;
- (BOOL)removeSongID:(NSString *)songID error:(NSError **)error;
- (BOOL)clear:(NSError **)error;
- (BOOL)clearAllDownloadedMusic:(NSError **)error;
- (void)preferencesChanged;
- (void)invalidateAccess;
- (void)suspend;
- (void)close;
@end
NS_ASSUME_NONNULL_END
