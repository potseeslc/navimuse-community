#import "../../src-tauri/ios/native-audio.m"
#include <assert.h>
static NSInteger calls=0;
@interface NMRenewProtocol : NSURLProtocol @end
@implementation NMRenewProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request{return [request.URL.host isEqual:@"navimuse.example.com"];}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request{return request;}
- (void)startLoading {
    calls++;
    assert([self.request.HTTPMethod isEqual:@"POST"]);
    assert([self.request.URL.path isEqual:@"/api/navidrome/hls/sessions"]);
    assert([self.request.URL.query isEqual:@"accountScope=scope"]);
    assert([[self.request valueForHTTPHeaderField:@"X-Requested-With"] isEqual:@"NaviMuse"]);
    assert([[self.request valueForHTTPHeaderField:@"Cookie"] containsString:@"fixture-session=fixture"]);
    NSInteger status=calls==3?401:calls==4?202:200;
    NSString *url=calls==2?@"https://evil.example/master.m3u8":@"/api/navidrome/hls/sessions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/master.m3u8?accountScope=scope";
    NSData *data=[NSJSONSerialization dataWithJSONObject:@{@"state":status==202?@"preparing":@"ready",@"url":url} options:0 error:nil];
    [self.client URLProtocol:self didReceiveResponse:[[NSHTTPURLResponse alloc]initWithURL:self.request.URL statusCode:status HTTPVersion:@"HTTP/1.1" headerFields:@{@"Content-Type":@"application/json"}] cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    [self.client URLProtocol:self didLoadData:data];[self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading {}
@end
@interface NMRenewController : NMNativeAudio @end
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-designated-initializers"
@implementation NMRenewController
- (instancetype)init {return self;}
- (NSURLSessionConfiguration *)hlsSessionConfiguration {NSURLSessionConfiguration *c=NSURLSessionConfiguration.ephemeralSessionConfiguration;c.protocolClasses=@[NMRenewProtocol.class];return c;}
@end
#pragma clang diagnostic pop
static NMRenewController *owner;
int main(void){@autoreleasepool{
    [NSURLProtocol registerClass:NMRenewProtocol.class];owner=[NMRenewController new];owner.listeningLedger=[NMListeningLedger new];owner.listeningLedger.scope=@"scope";
    NMStreamRecovery *state=[NMStreamRecovery new];[state load:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/song?accountScope=scope&format=mp3&maxBitRate=192"]];
    NSArray *cookies=@[[NSHTTPCookie cookieWithProperties:@{NSHTTPCookieName:@"fixture-session",NSHTTPCookieValue:@"fixture",NSHTTPCookieDomain:@"navimuse.example.com",NSHTTPCookiePath:@"/",NSHTTPCookieSecure:@"TRUE"}]];
    [owner renewHLS:state cookies:cookies completion:^(NSURL *url,NSInteger status){
        assert(status==200&&NMHLSURL(url,@"scope"));
        [owner renewHLS:state cookies:cookies completion:^(NSURL *invalid,NSInteger code){
            assert(!invalid&&code==200);
            [owner renewHLS:state cookies:cookies completion:^(NSURL *denied,NSInteger code){
                assert(!denied&&code==401);
                [owner renewHLS:state cookies:cookies completion:^(NSURL *pending,NSInteger code){
                    assert(!pending&&code==202&&calls==4);
                    NSLog(@"PASS: native HLS renewal authenticates scoped requests, validates manifest origin, and preserves authorization/preparing status; all network intercepted");exit(0);
                }];
            }];
        }];
    }];
    CFRunLoopRun();
}return 1;}
