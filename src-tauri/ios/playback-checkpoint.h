#import <Foundation/Foundation.h>
#import "media-policy.h"
#include <math.h>
#import <TargetConditionals.h>
// Only an account-scoped canonical song URL may be persisted. Never store
// session cookies, expiring HLS URLs, radio URLs or arbitrary query secrets.
static BOOL NMCheckpointURL(NSURL *url,NSString *scope) {
    if(!scope.length||!NMTrustedURL(url)||url.fragment.length||[url.path rangeOfString:@"^/api/navidrome/stream/[^/]+$" options:NSRegularExpressionSearch].location==NSNotFound)return NO;
    NSInteger scopes=0;
    for(NSURLQueryItem *q in [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO].queryItems){
        if([q.name isEqual:@"accountScope"]){scopes++;if(![q.value isEqual:scope])return NO;}
        else if(![@[@"format",@"maxBitRate"] containsObject:q.name])return NO;
    }
    return scopes==1;
}
@interface NMPlaybackCheckpoint : NSObject
@property(nonatomic,copy) NSURL *file;
- (instancetype)initWithFile:(NSURL *)file;
- (NSDictionary *)read;
- (void)save:(NSDictionary *)value;
- (void)clear;
@end
@implementation NMPlaybackCheckpoint
- (instancetype)initWithFile:(NSURL *)file {if((self=[super init]))_file=file;return self;}
- (NSDictionary *)read {
    NSDictionary *v=[NSDictionary dictionaryWithContentsOfURL:self.file];
    if(![v isKindOfClass:NSDictionary.class]||![v[@"url"] isKindOfClass:NSString.class]||![v[@"scope"] isKindOfClass:NSString.class]||![v[@"position"] isKindOfClass:NSNumber.class]||![v[@"savedAt"] isKindOfClass:NSNumber.class])return nil;
    double p=[v[@"position"] doubleValue],age=NSDate.date.timeIntervalSince1970-[v[@"savedAt"] doubleValue];
    if(!isfinite(p)||!isfinite(age)||p<0||age<0||age>7*86400||!NMCheckpointURL([NSURL URLWithString:v[@"url"]],v[@"scope"]))return nil;
    return v;
}
- (void)save:(NSDictionary *)value {
    if(!NMCheckpointURL([NSURL URLWithString:value[@"url"]],value[@"scope"]))return;
    [NSFileManager.defaultManager createDirectoryAtURL:self.file.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:nil];
    [value writeToURL:self.file atomically:YES];
    [NSFileManager.defaultManager setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:self.file.path error:nil];
#if TARGET_OS_IPHONE
    [NSFileManager.defaultManager setAttributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} ofItemAtPath:self.file.path error:nil];
#endif
}
- (void)clear {[NSFileManager.defaultManager removeItemAtURL:self.file error:nil];}
@end
