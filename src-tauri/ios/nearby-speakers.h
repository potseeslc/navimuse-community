#import <Foundation/Foundation.h>
#import <ifaddrs.h>
#import <arpa/inet.h>
#import <net/if.h>

static BOOL NMPrivateIPv4(NSString *address,struct in_addr *parsed) {
 if(![address isKindOfClass:NSString.class] || inet_pton(AF_INET,address.UTF8String,parsed)!=1)return NO;
 uint32_t value=ntohl(parsed->s_addr);
 return (value>>24)==10 || (value>>16)==0xc0a8 || (value>>20)==0xac1;
}
static BOOL NMSamePrivateSubnet(NSString *address,NSString *local,NSString *mask) {
 struct in_addr target,own,subnet;
 if(!NMPrivateIPv4(address,&target)||!NMPrivateIPv4(local,&own)||inet_pton(AF_INET,mask.UTF8String,&subnet)!=1||!subnet.s_addr)return NO;
 return target.s_addr!=own.s_addr && (target.s_addr&subnet.s_addr)==(own.s_addr&subnet.s_addr);
}
static BOOL NMOnPhysicalLAN(NSString *address) {
 struct ifaddrs *interfaces=NULL;if(getifaddrs(&interfaces)!=0)return NO;BOOL found=NO;
 for(struct ifaddrs *i=interfaces;i;i=i->ifa_next){
  if(!i->ifa_addr||!i->ifa_netmask||i->ifa_addr->sa_family!=AF_INET||!(i->ifa_flags&IFF_UP)||strncmp(i->ifa_name,"en",2))continue;
  char local[INET_ADDRSTRLEN],mask[INET_ADDRSTRLEN];
  if(inet_ntop(AF_INET,&((struct sockaddr_in *)i->ifa_addr)->sin_addr,local,sizeof(local))&&inet_ntop(AF_INET,&((struct sockaddr_in *)i->ifa_netmask)->sin_addr,mask,sizeof(mask))&&NMSamePrivateSubnet(address,@(local),@(mask))){found=YES;break;}
 }
 freeifaddrs(interfaces);return found;
}
static BOOL NMSpeakerIdentityMatches(NSData *data,NSString *uuid) {
 if(data.length>262144)return NO;
 NSString *xml=[[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding];
 if(!xml || [xml rangeOfString:@"<!DOCTYPE" options:NSCaseInsensitiveSearch].location!=NSNotFound || [xml rangeOfString:@"<!ENTITY" options:NSCaseInsensitiveSearch].location!=NSNotFound)return NO;
 NSRegularExpression *re=[NSRegularExpression regularExpressionWithPattern:@"<(?:[\\w-]+:)?UDN(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?UDN>" options:0 error:NULL];
 NSArray *matches=[re matchesInString:xml options:0 range:NSMakeRange(0,xml.length)];
 if(matches.count!=1)return NO;
 NSString *value=[[xml substringWithRange:[matches[0] rangeAtIndex:1]] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
 return [value isEqual:uuid];
}
// Read-only, fixed-port identity probes. No multicast, credentials, cookies,
// redirects, arbitrary URL/path, or speaker-control commands are permitted.
@interface NMNearbySpeakers : NSObject <NSURLSessionDataDelegate>
@property(nonatomic) NSURLSession *session;
@property(nonatomic) NSMutableDictionary<NSNumber *,NSMutableDictionary *> *jobs;
@property(nonatomic) NSMutableArray *nearby;
@property(nonatomic,copy) void (^completion)(NSArray *);
+ (BOOL)onPhysicalLAN:(NSString *)address;
+ (NSURLSessionConfiguration *)sessionConfiguration;
+ (void)probe:(NSArray *)devices completion:(void (^)(NSArray *))completion;
@end
@implementation NMNearbySpeakers
+ (BOOL)onPhysicalLAN:(NSString *)address{return NMOnPhysicalLAN(address);}
+ (NSURLSessionConfiguration *)sessionConfiguration{return NSURLSessionConfiguration.ephemeralSessionConfiguration;}
+ (void)probe:(NSArray *)devices completion:(void (^)(NSArray *))completion {
 NMNearbySpeakers *probe=[self new];probe.jobs=[NSMutableDictionary new];probe.nearby=[NSMutableArray new];probe.completion=completion;
 NSURLSessionConfiguration *config=[self sessionConfiguration];
 config.HTTPCookieStorage=nil;config.HTTPShouldSetCookies=NO;config.URLCredentialStorage=nil;config.URLCache=nil;config.connectionProxyDictionary=@{};
 config.allowsCellularAccess=NO;config.allowsExpensiveNetworkAccess=NO;config.timeoutIntervalForRequest=3;config.timeoutIntervalForResource=4;config.HTTPMaximumConnectionsPerHost=1;
 probe.session=[NSURLSession sessionWithConfiguration:config delegate:probe delegateQueue:NSOperationQueue.mainQueue];
 for(id raw in devices){
  if(![raw isKindOfClass:NSDictionary.class])continue;NSDictionary *d=raw;
  if(![d[@"id"] isKindOfClass:NSString.class]||[d[@"id"] length]>64||![d[@"id"] length]||![d[@"uuid"] isKindOfClass:NSString.class]||[d[@"uuid"] length]>128||![d[@"uuid"] length]||![self onPhysicalLAN:d[@"address"]])continue;
  NSURL *url=[NSURL URLWithString:[NSString stringWithFormat:@"http://%@:49152/description.xml",d[@"address"]]];
  NSMutableURLRequest *request=[NSMutableURLRequest requestWithURL:url];request.HTTPMethod=@"GET";request.cachePolicy=NSURLRequestReloadIgnoringLocalCacheData;request.HTTPShouldHandleCookies=NO;
  NSURLSessionDataTask *task=[probe.session dataTaskWithRequest:request];probe.jobs[@(task.taskIdentifier)]=[@{@"id":d[@"id"],@"uuid":d[@"uuid"],@"data":[NSMutableData new]} mutableCopy];[task resume];
 }
 if(!probe.jobs.count){[probe.session invalidateAndCancel];completion(@[]);probe.completion=nil;}
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {completionHandler(nil);}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
 BOOL ok=[response isKindOfClass:NSHTTPURLResponse.class]&&[(NSHTTPURLResponse *)response statusCode]==200&&(response.expectedContentLength<0||response.expectedContentLength<=262144);
 completionHandler(ok?NSURLSessionResponseAllow:NSURLSessionResponseCancel);
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveData:(NSData *)data {
 NSMutableData *buffer=self.jobs[@(task.taskIdentifier)][@"data"];
 if(buffer.length+data.length>262144){[task cancel];return;}[buffer appendData:data];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
 NSDictionary *job=self.jobs[@(task.taskIdentifier)];
 if(job&&!error&&NMSpeakerIdentityMatches(job[@"data"],job[@"uuid"]))[self.nearby addObject:job[@"id"]];
 [self.jobs removeObjectForKey:@(task.taskIdentifier)];
 if(!self.jobs.count){[session finishTasksAndInvalidate];if(self.completion)self.completion([self.nearby copy]);self.completion=nil;}
}
@end
