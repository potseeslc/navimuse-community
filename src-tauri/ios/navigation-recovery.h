#import <WebKit/WebKit.h>

// Preserve the host's navigation policy, authentication and download delegate.
// Only add recovery notifications; never make a navigation decision here.
@interface NMNavigationRecovery : NSObject <WKNavigationDelegate>
@property(nonatomic,strong) id<WKNavigationDelegate> original;
@property(nonatomic,copy) void (^failure)(NSError *);
@property(nonatomic,copy) void (^terminated)(void);
@end
@implementation NMNavigationRecovery
- (BOOL)respondsToSelector:(SEL)selector {
    return [super respondsToSelector:selector] || [self.original respondsToSelector:selector];
}
- (id)forwardingTargetForSelector:(SEL)selector {
    return [self.original respondsToSelector:selector] ? self.original : [super forwardingTargetForSelector:selector];
}
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    if(!(error.code==NSURLErrorCancelled && [error.domain isEqual:NSURLErrorDomain]) && self.failure)self.failure(error);
    if([self.original respondsToSelector:_cmd])[self.original webView:webView didFailProvisionalNavigation:navigation withError:error];
}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    if(!(error.code==NSURLErrorCancelled && [error.domain isEqual:NSURLErrorDomain]) && self.failure)self.failure(error);
    if([self.original respondsToSelector:_cmd])[self.original webView:webView didFailNavigation:navigation withError:error];
}
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    if(self.terminated)self.terminated();
    if([self.original respondsToSelector:_cmd])[self.original webViewWebContentProcessDidTerminate:webView];
}
@end
