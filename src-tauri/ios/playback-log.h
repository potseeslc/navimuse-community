#import <Foundation/Foundation.h>
#include <math.h>
// Strict fields at both persistence and export boundaries; never accept error
// descriptions, URLs, song IDs, account scopes or arbitrary metadata.
static NSDictionary *NMPlaybackLogEntry(NSDictionary *input) {
    if(![input isKindOfClass:NSDictionary.class])return nil;
    NSString *event=input[@"event"];
    static NSSet *allowed;static dispatch_once_t allowedOnce;dispatch_once(&allowedOnce,^{allowed=[NSSet setWithArray:@[@"loadstart",@"playing",@"waiting",@"stalled",@"pause",@"ended",@"error",@"seeked",@"sample",@"network",@"stream-failure",@"audio-interruption",@"audio-route-changed",@"audio-session-active",@"audio-session-activation-failed",@"now-playing-active",@"now-playing-not-active",@"recovery-cooldown",@"recovery-authorization-failed",@"recovery-hls",@"recovery-same-stream",@"session-reset",@"media-services-lost",@"media-services-reset",@"media-player-rebuilt",@"audio-session-configuration-failed",@"interface-terminated",@"checkpoint-delivery-unavailable",@"checkpoint-loaded-paused",@"remote-play",@"remote-pause",@"remote-toggle",@"remote-nexttrack",@"remote-previoustrack",@"remote-seekto",@"remote-seekforward",@"remote-seekbackward",@"remote-paused-checkpoint",@"remote-awaiting-checkpoint",@"remote-no-item",@"queue-interface-unavailable"]];});
    if(![event isKindOfClass:NSString.class]||![allowed containsObject:event]||![input[@"at"] isKindOfClass:NSNumber.class]||!isfinite([input[@"at"] doubleValue]))return nil;
    NSMutableDictionary *out=[@{@"event":event,@"at":input[@"at"]} mutableCopy];
    for(NSString *key in @[@"deck",@"generation",@"position",@"bufferSeconds",@"attempts",@"errorCode",@"httpStatus",@"observedBitrate",@"indicatedBitrate",@"reportedDuration",@"preciseTiming"])if([input[key] isKindOfClass:NSNumber.class]&&isfinite([input[key] doubleValue]))out[key]=input[key];
    static NSDictionary *enums;static dispatch_once_t enumsOnce;dispatch_once(&enumsOnce,^{enums=@{@"network":@[@"unknown",@"offline",@"wifi",@"cellular",@"wired"],@"source":@[@"hls",@"progressive",@"downloaded",@"none"],@"state":@[@"playing",@"waiting",@"paused"],@"codec":@[@"AAC",@"MP3",@"Opus",@"FLAC",@"ALAC",@"PCM",@"Vorbis"]};});
    for(NSString *key in enums)if([enums[key] containsObject:input[key]])out[key]=input[key];
    return out;
}
static NSArray *NMPlaybackLogPruned(NSArray *entries,double now) {
    NSMutableArray *out=[NSMutableArray new];
    for(id raw in entries){NSDictionary *entry=NMPlaybackLogEntry(raw);double at=[entry[@"at"] doubleValue];if(entry&&at>=now-7*86400&&at<=now)[out addObject:entry];}
    if(out.count>2000)[out removeObjectsInRange:NSMakeRange(0,out.count-2000)];
    return out;
}
