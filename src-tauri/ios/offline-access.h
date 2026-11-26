#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
// Native-only gate. Only the downloader's authenticated first-party response may
// enter acceptResponse; never expose it as a JavaScript command.
@interface NMOfflineAccess : NSObject
- (instancetype)initWithStateURL:(NSURL *)stateURL;
- (BOOL)acceptResponse:(NSDictionary *)response expectedScope:(NSString *)scope
                nowMS:(double)now uptime:(double)uptime error:(NSError **)error;
- (nullable NSDictionary *)contextAtMS:(double)now uptime:(double)uptime;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
