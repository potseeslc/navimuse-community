#import "offline-downloads.h"

// A bounded, persistent safety cache uses the same authenticated downloader and grant
// validation as explicit downloads. It never selects a track or starts playback.
@interface NMStreamCache : NSObject
@property(nonatomic) NMOfflineDownloads *downloads;
@property(nonatomic) NSUInteger revision;
@property(nonatomic,copy) NSString *scope;
- (instancetype)initWithRootURL:(NSURL *)root;
- (void)prepare:(NSArray *)songs scope:(NSString *)scope format:(NSString *)format bitrate:(NSNumber *)bitrate keeping:(NSArray *)pinned cookies:(NSArray *)cookies;
- (NSDictionary *)media:(NSString *)songID scope:(NSString *)scope format:(NSString *)format bitrate:(NSString *)bitrate;
- (void)invalidate;
@end
@implementation NMStreamCache
- (instancetype)initWithRootURL:(NSURL *)root {
 if((self=[super init])){_downloads=[[NMOfflineDownloads alloc]initWithRootURL:root];_scope=[_downloads snapshot][@"scope"];[_downloads.store setAllowsCellular:YES budgetBytes:512ULL*1024*1024 error:NULL];}return self;
}
- (void)invalidate {self.revision++;self.scope=nil;[self.downloads invalidateAccess];[self.downloads clearAllDownloadedMusic:NULL];}
- (void)prepare:(NSArray *)songs scope:(NSString *)scope format:(NSString *)format bitrate:(NSNumber *)bitrate keeping:(NSArray *)pinned cookies:(NSArray *)cookies {
 if(![songs isKindOfClass:NSArray.class]||songs.count>11||![scope isKindOfClass:NSString.class]||![@[@"raw",@"mp3",@"opus"] containsObject:format]||![bitrate isKindOfClass:NSNumber.class])return;
 format=@"mp3";bitrate=@96;
 NSUInteger revision=++self.revision;
 if(!songs.count){[self.downloads suspend];return;}
 if(self.scope && ![self.scope isEqual:scope]){[self invalidate];revision=self.revision;}
 self.scope=scope;
 __weak NMStreamCache *weak=self;
 [self.downloads authorizeScope:scope cookies:cookies completion:^(NSError *error){
  NMStreamCache *strong=weak;if(!strong||revision!=strong.revision||error)return;
  NSMutableSet *keep=[NSMutableSet setWithArray:pinned?:@[]];for(NSDictionary *song in songs)if([song[@"id"] isKindOfClass:NSString.class])[keep addObject:song[@"id"]];
  for(NSDictionary *track in [strong.downloads snapshot][@"tracks"])if(![keep containsObject:track[@"song"][@"id"]])[strong.downloads removeSongID:track[@"song"][@"id"] error:NULL];
  BOOL paused=strong.downloads.pausedForPlayback;strong.downloads.pausedForPlayback=YES;
  [strong.downloads enqueueSongs:songs format:format bitrate:bitrate cookies:cookies error:NULL];
  [strong.downloads prioritizeSongs:songs];strong.downloads.pausedForPlayback=paused;
 }];
}
- (NSDictionary *)media:(NSString *)songID scope:(NSString *)scope format:(NSString *)format bitrate:(NSString *)bitrate {
 // Safety copies have a fixed profile independent of the requested stream.
 if(![scope isEqual:self.scope])return nil;
 NSURL *file=[self.downloads.store mediaForSongID:songID scope:scope];NSString *mime=[self.downloads.store mimeTypeForSongID:songID scope:scope];
 return file&&mime?@{@"songID":songID,@"scope":scope,@"file":file,@"mimeType":mime,@"cached":@YES}:nil;
}
@end
