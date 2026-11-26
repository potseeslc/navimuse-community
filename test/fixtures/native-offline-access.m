#import <Foundation/Foundation.h>
#import <TargetConditionals.h>
#import "../../src-tauri/ios/offline-access.h"
static void check(BOOL value, NSString *message) { if (!value) { NSLog(@"FAIL: %@",message); exit(1); } }
int main(int argc, char **argv) { @autoreleasepool {
    NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
    NSString *scope = [@"queue-scope-v2:" stringByAppendingString:[@"" stringByPaddingToLength:64 withString:@"a" startingAtIndex:0]];
    double now=1800000000000.0, window=30.0*86400000;
    NSDictionary *(^grant)(void)=^{ return @{@"version":@"navimuse-offline/v1",@"scope":scope,@"issuedAt":@(now),@"expiresAt":@(now+window)}; };
    NMOfflineAccess *gate=[[NMOfflineAccess alloc] initWithStateURL:url];
    check([gate contextAtMS:now uptime:1]==nil,@"fresh install is locked");
    check([gate acceptResponse:grant() expectedScope:scope nowMS:now uptime:1 error:NULL],@"authenticated grant accepted");
    check([[gate contextAtMS:now+1000 uptime:2][@"scope"] isEqual:scope],@"active scope exposed");
    gate=[[NMOfflineAccess alloc] initWithStateURL:url];
    check([gate contextAtMS:now+2000 uptime:1]!=nil,@"grant survives process restart");
    check([gate contextAtMS:now+1000 uptime:2]==nil,@"clock rollback locks persisted access");
    gate=[[NMOfflineAccess alloc] initWithStateURL:url];
    check([gate contextAtMS:now+3000 uptime:1]==nil,@"rollback invalidation survives restart");
    check([gate acceptResponse:grant() expectedScope:scope nowMS:now uptime:1 error:NULL],@"online renewal");
    check([gate contextAtMS:now+window uptime:2]==nil,@"expiry boundary locked");
    check([gate acceptResponse:grant() expectedScope:scope nowMS:now uptime:1 error:NULL],@"renew before monotonic test");
    check([gate contextAtMS:now+1 uptime:window/1000+2]==nil,@"monotonic elapsed expires despite slow clock");
    check([gate acceptResponse:grant() expectedScope:scope nowMS:now uptime:1 error:NULL],@"renew before sampling test");
    check([gate contextAtMS:now+1 uptime:1.002]!=nil,@"monotonic sample can lead wall sample slightly");
    check([gate contextAtMS:now+1.5 uptime:1.0025]!=nil,@"advancing wall samples are not a rollback");
    gate=[[NMOfflineAccess alloc] initWithStateURL:url];
    check([gate contextAtMS:now+2 uptime:1]!=nil,@"separate wall high-water survives restart");
    check([gate contextAtMS:now+1.5 uptime:1.001]==nil,@"actual sub-millisecond wall rollback remains locked");
    check([gate acceptResponse:grant() expectedScope:scope nowMS:now uptime:1 error:NULL],@"renew before signout");
    [gate invalidate]; gate=[[NMOfflineAccess alloc] initWithStateURL:url];
    check([gate contextAtMS:now uptime:2]==nil,@"signout persists");
    check([gate acceptResponse:grant() expectedScope:scope nowMS:now uptime:1 error:NULL],@"first account renewed");
    NSString *other=[scope stringByReplacingOccurrencesOfString:@"a" withString:@"b"];
    NSMutableDictionary *otherGrant=[grant() mutableCopy]; otherGrant[@"scope"]=other; otherGrant[@"credentials"]=@"must not persist";
    check([gate acceptResponse:otherGrant expectedScope:other nowMS:now uptime:1 error:NULL],@"account switch accepted");
    gate=[[NMOfflineAccess alloc] initWithStateURL:url];
    check([[gate contextAtMS:now+1000 uptime:1][@"scope"] isEqual:other],@"only new account survives restart");
    NSString *saved=[NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:NULL];
    check(![saved containsString:scope] && ![saved containsString:@"credentials"],@"old identity and unknown fields not persisted");
    NSNumber *excluded=nil; [url getResourceValue:&excluded forKey:NSURLIsExcludedFromBackupKey error:NULL];
    check(excluded.boolValue,@"grant excluded from backup");
    NSDictionary *attributes=[NSFileManager.defaultManager attributesOfItemAtPath:url.path error:NULL];
#if TARGET_OS_SIMULATOR
    NSLog(@"Simulator file protection reports %@; device enforcement remains a physical acceptance check", attributes[NSFileProtectionKey]);
#else
    check([attributes[NSFileProtectionKey] isEqual:NSFileProtectionCompleteUntilFirstUserAuthentication],@"native file protection applied");
#endif
    check(![gate acceptResponse:@{@"ok":@NO,@"error":@"Access denied"} expectedScope:scope nowMS:now uptime:1 error:NULL],@"HTTP 200 JSON error cannot become an offline grant");
    NSMutableDictionary *bad=[grant() mutableCopy];bad[@"expiresAt"]=@(now+window+1);
    check(![gate acceptResponse:bad expectedScope:scope nowMS:now uptime:1 error:NULL],@"oversized lifetime rejected");
    bad=[grant() mutableCopy];bad[@"scope"]=@"another-account";
    check(![gate acceptResponse:bad expectedScope:scope nowMS:now uptime:1 error:NULL],@"scope mismatch rejected");
    bad=[grant() mutableCopy];bad[@"issuedAt"]=@YES;
    check(![gate acceptResponse:bad expectedScope:scope nowMS:now uptime:1 error:NULL],@"boolean timestamp rejected");
    check(![gate acceptResponse:grant() expectedScope:scope nowMS:now-600000 uptime:1 error:NULL],@"large device clock skew rejected");
    [@"{\"scope\":\"fabricated\"}" writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:NULL];
    gate=[[NMOfflineAccess alloc] initWithStateURL:url];
    check([gate contextAtMS:now uptime:1]==nil,@"corrupt manifest locks access");
    puts("native offline access: restart, expiry, rollback, scope, signout and malformed grants passed");
} return 0; }
