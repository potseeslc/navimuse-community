#import "offline-access.h"
#import <math.h>
#import <TargetConditionals.h>

static BOOL NMOfflineScope(id value) {
    return [value isKindOfClass:NSString.class] && [value rangeOfString:@"^queue-scope-v[12]:[a-f0-9]{64}$" options:NSRegularExpressionSearch].location != NSNotFound;
}
static BOOL NMOfflineNumber(id value) {
    return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value) != CFBooleanGetTypeID() && isfinite([value doubleValue]);
}
static const double NMOfflineWindowMS = 30.0 * 86400000.0;

@interface NMOfflineAccess ()
@property(nonatomic) NSURL *stateURL;
@property(nonatomic, nullable) NSMutableDictionary *state;
@property(nonatomic) double observedUptime;
@property(nonatomic) double observedWallMS;
@end

@implementation NMOfflineAccess
- (instancetype)initWithStateURL:(NSURL *)stateURL {
    if ((self = [super init])) {
        _stateURL = stateURL;
        NSData *data = [NSData dataWithContentsOfURL:stateURL];
        id saved = data ? [NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:NULL] : nil;
        if ([saved isKindOfClass:NSDictionary.class]) _state = [saved mutableCopy];
        _observedUptime = -1;
    }
    return self;
}
- (BOOL)save:(NSError **)error {
    NSURL *directory = self.stateURL.URLByDeletingLastPathComponent;
    NSFileManager *fm = NSFileManager.defaultManager;
    NSDictionary *attributes = @{};
#if TARGET_OS_IPHONE
    attributes = @{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication};
#endif
    if (![fm createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:attributes error:error]) return NO;
    if (![directory setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:error]) return NO;
    NSData *data = [NSJSONSerialization dataWithJSONObject:self.state options:0 error:error];
    if (!data || ![data writeToURL:self.stateURL options:NSDataWritingAtomic error:error]) return NO;
    if (attributes.count && ![fm setAttributes:attributes ofItemAtPath:self.stateURL.path error:error]) return NO;
    return [self.stateURL setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:error];
}
- (void)invalidate {
    // Write a tombstone atomically before removing the file. If removal fails the
    // next process still sees no valid grant. In-memory access always locks first.
    self.state = [NSMutableDictionary dictionary];
    [self save:NULL];
    [NSFileManager.defaultManager removeItemAtURL:self.stateURL error:NULL];
    self.state = nil;
    self.observedUptime = -1;
}
- (BOOL)acceptResponse:(NSDictionary *)response expectedScope:(NSString *)scope nowMS:(double)now uptime:(double)uptime error:(NSError **)error {
    [self invalidate];
    BOOL valid = [response isKindOfClass:NSDictionary.class] && NMOfflineScope(scope) &&
        [response[@"version"] isEqual:@"navimuse-offline/v1"] && [response[@"scope"] isEqual:scope] &&
        NMOfflineNumber(response[@"issuedAt"]) && NMOfflineNumber(response[@"expiresAt"]) &&
        isfinite(now) && now >= 0 && isfinite(uptime) && uptime >= 0;
    double issued = valid ? [response[@"issuedAt"] doubleValue] : 0;
    double expires = valid ? [response[@"expiresAt"] doubleValue] : 0;
    valid = valid && issued >= 0 && expires > now && expires > issued &&
        expires - issued <= NMOfflineWindowMS && fabs(issued - now) <= 300000;
    if (!valid) {
        if (error) *error = [NSError errorWithDomain:@"NaviMuseOffline" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Offline access could not be verified. Reconnect and check the device clock."}];
        return NO;
    }
    // Never retain unrecognized server fields or credentials. Client clock skew
    // cannot lengthen access beyond thirty days from this authenticated receipt.
    self.state = [@{@"version":@"navimuse-offline/v1", @"scope":scope,
        @"issuedAt":@(issued), @"expiresAt":@(MIN(expires, now + NMOfflineWindowMS)), @"lastSeen":@(now), @"lastWall":@(now)} mutableCopy];
    if([response[@"navidromeIdFormat"] isEqual:@"canonical-v1"])self.state[@"navidromeIdFormat"]=@"canonical-v1";
    if (![self save:error]) { [self invalidate]; return NO; }
    self.observedUptime = uptime;
    self.observedWallMS = now;
    return YES;
}
- (NSDictionary *)contextAtMS:(double)now uptime:(double)uptime {
    NSDictionary *s = self.state;
    BOOL valid = [s[@"version"] isEqual:@"navimuse-offline/v1"] && NMOfflineScope(s[@"scope"]) &&
        NMOfflineNumber(s[@"issuedAt"]) && NMOfflineNumber(s[@"expiresAt"]) && NMOfflineNumber(s[@"lastSeen"]) && (!s[@"lastWall"] || NMOfflineNumber(s[@"lastWall"])) &&
        isfinite(now) && now >= 0 && isfinite(uptime) && uptime >= 0;
    double last = valid ? [s[@"lastSeen"] doubleValue] : 0;
    double wall = valid ? [(s[@"lastWall"]?:s[@"lastSeen"]) doubleValue] : 0;
    double expires = valid ? [s[@"expiresAt"] doubleValue] : 0;
    double issued = valid ? [s[@"issuedAt"] doubleValue] : 0;
    // Monotonic elapsed time protects this process against wall-clock changes;
    // persisted high-water time protects restart. Compare raw wall samples for
    // rollback: a monotonic-derived expiry clock may legitimately lead them by
    // a fraction of a millisecond because the two clocks are read separately.
    if (self.observedUptime >= 0) {
        valid = valid && uptime >= self.observedUptime;
        last = MAX(last, self.observedWallMS + MAX(0, uptime - self.observedUptime) * 1000);
    }
    valid = valid && issued >= 0 && issued <= now + 300000 && expires > issued && expires - issued <= NMOfflineWindowMS &&
        wall >= 0 && now >= wall && [s[@"lastSeen"] doubleValue] >= wall && MAX(now, last) < expires;
    if (!valid) { if (self.state) [self invalidate]; return nil; }
    self.state[@"lastSeen"] = @(MAX(now, last));
    self.state[@"lastWall"] = @(now);
    if (![self save:NULL]) { [self invalidate]; return nil; }
    self.observedWallMS = MAX(now, last);
    self.observedUptime = uptime;
    return @{ @"scope":s[@"scope"], @"expiresAt":s[@"expiresAt"], @"version":s[@"version"], @"navidromeIdFormat":[s[@"navidromeIdFormat"] isEqual:@"canonical-v1"]?@"canonical-v1":@"legacy" };
}
@end
