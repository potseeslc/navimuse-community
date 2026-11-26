#import "../../src-tauri/ios/playback-checkpoint.h"
#include <assert.h>
int main(void){@autoreleasepool{
    NSURL *file=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
    NMPlaybackCheckpoint *store=[[NMPlaybackCheckpoint alloc]initWithFile:file];
    NSString *url=@"https://navimuse.example.com/api/navidrome/stream/song?accountScope=alice&format=mp3&maxBitRate=192";
    assert(NMCheckpointURL([NSURL URLWithString:url],@"alice"));assert(!NMCheckpointURL([NSURL URLWithString:url],@"bob"));
    assert(!NMCheckpointURL([NSURL URLWithString:[url stringByAppendingString:@"&token=secret"]],@"alice"));
    assert(!NMCheckpointURL([NSURL URLWithString:[url stringByAppendingString:@"&accountScope=alice"]],@"alice"));
    assert(!NMCheckpointURL([NSURL URLWithString:@"https://evil.test/api/navidrome/stream/song?accountScope=alice"],@"alice"));
    NSDictionary *saved=@{@"url":url,@"scope":@"alice",@"position":@73.5,@"savedAt":@(NSDate.date.timeIntervalSince1970)};
    [store save:saved];assert([[store read][@"position"] doubleValue]==73.5);
    NMPlaybackCheckpoint *reopened=[[NMPlaybackCheckpoint alloc]initWithFile:file];assert([[reopened read][@"scope"] isEqual:@"alice"]);
    NSMutableDictionary *expired=[saved mutableCopy];expired[@"savedAt"]=@(NSDate.date.timeIntervalSince1970-8*86400);[store save:expired];assert(![store read]);
    [store save:saved];[store clear];assert(![store read]);
    NSLog(@"PASS: durable resume position, scoped first-party URL, no query secrets, expiry and logout deletion");
}return 0;}
