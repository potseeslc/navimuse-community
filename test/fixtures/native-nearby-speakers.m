#import "../../src-tauri/ios/nearby-speakers.h"
static void check(BOOL ok,NSString *label){if(!ok){NSLog(@"FAIL: %@",label);exit(1);}}
static NSString *mode=@"match";static NSUInteger requests=0;
@interface NMProbeProtocol : NSURLProtocol @end
@implementation NMProbeProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)r{return [r.URL.host isEqual:@"192.168.42.4"];}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)r{return r;}
- (void)startLoading {
 requests++;check([self.request.HTTPMethod isEqual:@"GET"]&&[self.request.URL.path isEqual:@"/description.xml"]&&self.request.URL.port.integerValue==49152,@"fixed read-only endpoint");check(![self.request valueForHTTPHeaderField:@"Cookie"]&&![self.request valueForHTTPHeaderField:@"Authorization"],@"no credentials reach speakers");
 NSString *xml=[mode isEqual:@"mismatch"]?@"<root><UDN>uuid:hotel</UDN></root>":@"<root><UDN>uuid:home</UDN></root>";
 NSData *data=[xml dataUsingEncoding:NSUTF8StringEncoding];if([mode isEqual:@"oversize"])data=[NSMutableData dataWithLength:262145];
 NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc]initWithURL:self.request.URL statusCode:[mode isEqual:@"redirect"]?302:200 HTTPVersion:@"HTTP/1.1" headerFields:@{@"Content-Type":@"text/xml"}];
 [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];[self.client URLProtocol:self didLoadData:data];[self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading{}
@end
@interface NMProbeFixture : NMNearbySpeakers @end
@implementation NMProbeFixture
+ (BOOL)onPhysicalLAN:(NSString *)address{return NMSamePrivateSubnet(address,@"192.168.42.2",@"255.255.255.0");}
+ (NSURLSessionConfiguration *)sessionConfiguration{NSURLSessionConfiguration *c=[super sessionConfiguration];c.protocolClasses=@[NMProbeProtocol.class];return c;}
@end
static NSArray *probe(void){__block NSArray *result=nil;[NMProbeFixture probe:@[@{@"id":@"home",@"address":@"192.168.42.4",@"uuid":@"uuid:home"},@{@"id":@"away",@"address":@"192.168.1.4",@"uuid":@"uuid:home"},@{@"id":@"public",@"address":@"8.8.8.8",@"uuid":@"uuid:home"}] completion:^(NSArray *ids){result=ids;}];NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:6];while(!result&&deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.01]];check(result!=nil,@"probe completes");return result;}
int main(){@autoreleasepool{
 check(NMSamePrivateSubnet(@"192.168.42.4",@"192.168.42.2",@"255.255.255.0"),@"same LAN");
 for(NSString *value in @[@"127.0.0.1",@"8.8.8.8",@"192.168.1.4",@"192.168.42.2",@"localhost",@"192.168.42.4/path",@"10.0.0.1"])check(!NMSamePrivateSubnet(value,@"192.168.42.2",@"255.255.255.0"),@"exclude other networks, self and URL injection");
 check(!NMSpeakerIdentityMatches([@"<!DOCTYPE x><UDN>uuid:home</UDN>" dataUsingEncoding:NSUTF8StringEncoding],@"uuid:home"),@"XML entities/doctype rejected");
 check(!NMSpeakerIdentityMatches([@"<UDN>uuid:home</UDN><UDN>uuid:home</UDN>" dataUsingEncoding:NSUTF8StringEncoding],@"uuid:home"),@"ambiguous identity rejected");
 check([[probe() firstObject] isEqual:@"home"]&&requests==1,@"only matching local identity advertised");
 for(NSString *failure in @[@"mismatch",@"redirect",@"oversize"]){mode=failure;check(probe().count==0,failure);}
 __block NSURL *redirect=[NSURL URLWithString:@"https://example.com"];
 [[NMNearbySpeakers new] URLSession:NSURLSession.sharedSession task:[NSURLSession.sharedSession dataTaskWithURL:redirect] willPerformHTTPRedirection:[[NSHTTPURLResponse alloc] initWithURL:redirect statusCode:302 HTTPVersion:@"HTTP/1.1" headerFields:nil] newRequest:[NSURLRequest requestWithURL:redirect] completionHandler:^(NSURLRequest *r){redirect=r.URL;}];check(redirect==nil,@"redirects never followed");
 NSLog(@"PASS: private physical-subnet policy, bounded credential-free fixed endpoint probes, identity, redirects and oversize rejection; all network transport intercepted");
}return 0;}
