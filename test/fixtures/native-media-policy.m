#import "../../src-tauri/ios/media-policy.h"
#include <assert.h>

int main(void) {
    @autoreleasepool {
        for (NSString *path in @[@"/api/navidrome/cover/album?size=600", @"/api/navidrome/radios/1/artwork?v=123", @"/api/navidrome/radios/station%201/artwork"]) {
            assert(NMArtworkURL([NSURL URLWithString:[@"https://navimuse.example.com" stringByAppendingString:path]]));
        }
        for (NSString *raw in @[@"http://navimuse.example.com/api/navidrome/cover/a", @"https://evil.example/api/navidrome/cover/a", @"https://navimuse.example.com:444/api/navidrome/cover/a", @"https://user:pass@navimuse.example.com/api/navidrome/cover/a", @"https://navimuse.example.com/api/settings", @"https://navimuse.example.com/api/navidrome/radios/1/stream", @"https://navimuse.example.com/api/navidrome/radios/1/metadata", @"https://navimuse.example.com/api/navidrome/cover/../stream", @"https://navimuse.example.com/api/navidrome/cover/%2e%2e", @"https://navimuse.example.com/api/navidrome/radios/a%2Fb/artwork", @"https://navimuse.example.com/api/navidrome/cover/", @"file:///tmp/cover.jpg"]) {
            if(NMArtworkURL([NSURL URLWithString:raw])) { NSLog(@"Unexpected artwork permission: %@", raw); return 1; }
        }
        assert(!NMArtworkURL(nil));
        NSString *hls=@"https://navimuse.example.com/api/navidrome/hls/sessions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/master.m3u8?accountScope=test";
        assert(NMHLSURL([NSURL URLWithString:hls],@"test"));
        assert(!NMHLSURL([NSURL URLWithString:hls],@"other"));
        assert(!NMHLSURL([NSURL URLWithString:[hls stringByAppendingString:@"&accountScope=test"]],@"test"));
        assert(!NMHLSURL([NSURL URLWithString:[hls stringByReplacingOccurrencesOfString:@"navimuse.example.com" withString:@"evil.example"]],@"test"));
        assert(!NMHLSURL(nil,@"test"));
        puts("Native artwork URL policy passed");
    }
    return 0;
}
