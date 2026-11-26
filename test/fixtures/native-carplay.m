#import <UIKit/UIKit.h>
#import "../../src-tauri/ios/carplay.h"
#import "../../src-tauri/ios/network-handoff.h"
#define CHECK(...) do {if(!(__VA_ARGS__)){NSLog(@"FAIL line %d",__LINE__);exit(1);}}while(0)
int main(){@autoreleasepool{
 NMCarPlayHub *hub=NMCarPlayHub.shared;__block NSDictionary *sent;hub.send=^(NSDictionary *event){sent=event;};
 NSDictionary *snapshot=@{@"scope":@"owner",@"revision":@"r",@"sections":@[@{@"title":@"Listen",@"items":@[@{@"id":@"resume",@"title":@"Resume",@"detail":@"Song"}]}]};
 CHECK([hub accept:snapshot]);CHECK(![hub accept:@{@"scope":@"owner",@"revision":@"r",@"sections":@[@{@"title":@1,@"items":@[]}]}]);
 __block int completed=0;
 [hub select:@"unknown" revision:@"r" completion:^{completed++;}];CHECK(completed==1&&!sent);
 [hub select:@"resume" revision:@"old" completion:^{completed++;}];CHECK(completed==2&&!sent);
 [hub select:@"resume" revision:@"r" completion:^{completed++;}];CHECK(sent && completed==2);CHECK([sent[@"scope"] isEqual:@"owner"]);CHECK([sent[@"expiresAt"] doubleValue]>NSDate.date.timeIntervalSince1970*1000);
 [hub finish:@{@"requestId":@"wrong",@"ok":@YES}];CHECK(completed==2);
 [hub clear];CHECK(completed==3&&hub.snapshot==nil&&hub.pendingID==nil);
 [hub finish:@{@"requestId":sent[@"requestId"],@"ok":@YES}];CHECK(completed==3);
 CHECK(NMHLSHandoffGrace(YES,NO,108,104,100));CHECK(!NMHLSHandoffGrace(YES,NO,116,115,100));CHECK(!NMHLSHandoffGrace(YES,YES,108,104,100));CHECK(!NMHLSHandoffGrace(NO,NO,108,104,100));CHECK(!NMHLSHandoffGrace(YES,NO,108,0,100));
 NSLog(@"PASS: CarPlay bounded catalog, stale/unknown selection rejection, scoped expiry, exactly-once completion, reset and bounded HLS handoff grace");
}return 0;}
