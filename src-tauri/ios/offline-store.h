#import <Foundation/Foundation.h>
#import "offline-access.h"

NS_ASSUME_NONNULL_BEGIN
// All methods run on the main queue. Paths never cross the JS boundary. Media
// may be installed only from the downloader's completed, validated temporary file.
@interface NMOfflineStore : NSObject
@property(nonatomic, readonly) unsigned long long budgetBytes;
@property(nonatomic, readonly) BOOL allowsCellular;
- (instancetype)initWithRootURL:(NSURL *)root access:(NMOfflineAccess *)access;
- (NSDictionary *)snapshot;
- (BOOL)setOutputOwnership:(NSDictionary *)ownership scope:(NSString *)scope error:(NSError **)error;
- (BOOL)setAllowsCellular:(BOOL)cellular budgetBytes:(unsigned long long)budget error:(NSError **)error;
- (nullable NSArray<NSDictionary *> *)beginSongs:(NSArray *)songs error:(NSError **)error;
- (nullable NSString *)beginSong:(NSDictionary *)song error:(NSError **)error;
- (BOOL)setState:(NSString *)state songID:(NSString *)songID ticket:(NSString *)ticket message:(nullable NSString *)message error:(NSError **)error;
- (BOOL)installFile:(NSURL *)temporary mimeType:(NSString *)mimeType songID:(NSString *)songID ticket:(NSString *)ticket error:(NSError **)error;
- (nullable NSURL *)mediaForSongID:(NSString *)songID scope:(NSString *)scope;
- (nullable NSString *)mimeTypeForSongID:(NSString *)songID scope:(NSString *)scope;
- (nullable NSString *)storedSongID:(NSString *)songID;
- (BOOL)removeSongID:(NSString *)songID error:(NSError **)error;
- (BOOL)clearCurrentScope:(NSError **)error;
- (BOOL)clearAllDownloadedMusic:(NSError **)error;
- (unsigned long long)usedBytes;
@end
NS_ASSUME_NONNULL_END
