#import "../../src-tauri/ios/native-audio.m"
#include <assert.h>
@interface NMOriginalDelegate : NSObject <WKNavigationDelegate>
@property(nonatomic) NSInteger failures;
@property(nonatomic) NSInteger terminations;
@property(nonatomic) NSInteger policies;
@property(nonatomic) NSInteger authentications;
@end
@implementation NMOriginalDelegate
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {self.failures++;}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {self.failures++;}
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {self.terminations++;}
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))handler {self.policies++;handler(WKNavigationActionPolicyCancel);}
- (void)webView:(WKWebView *)webView didReceiveAuthenticationChallenge:(NSURLAuthenticationChallenge *)challenge completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition,NSURLCredential *))handler {self.authentications++;handler(NSURLSessionAuthChallengeCancelAuthenticationChallenge,nil);}
@end
@interface NMStartupController : NMNativeAudio
@property(nonatomic,copy) NSString *message;
@property(nonatomic) BOOL retryVisible;
@property(nonatomic) NSInteger resets;
@end
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wobjc-designated-initializers"
@implementation NMStartupController
- (instancetype)init{return self;}
- (void)showLoadingMessage:(NSString *)message retry:(BOOL)retry {self.message=message;self.retryVisible=retry;}
- (void)reset{self.resets++;}
@end
#pragma clang diagnostic pop
// Nil WebKit arguments are deliberate inert fixtures, never forwarded to WebKit.
#pragma clang diagnostic ignored "-Wnonnull"
int main(void){@autoreleasepool{
    NMNavigationRecovery *proxy=[NMNavigationRecovery new];NMOriginalDelegate *original=[NMOriginalDelegate new];proxy.original=original;
    NMStartupController *controller=[NMStartupController new];controller.page=@"old-page";
    __block NSInteger failures=0;
    proxy.failure=^(NSError *error){failures++;[controller navigationFailed:error];};
    proxy.terminated=^{[controller contentProcessTerminated];};
    NSError *cancel=[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorCancelled userInfo:nil];
    [proxy webView:nil didFailProvisionalNavigation:nil withError:cancel];
    assert(failures==0 && original.failures==1);
    NSError *offline=[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNotConnectedToInternet userInfo:@{NSLocalizedDescriptionKey:@"secret query token"}];
    [proxy webView:nil didFailProvisionalNavigation:nil withError:offline];
    assert(failures==1 && original.failures==2 && controller.retryVisible);
    assert([controller.message containsString:@"offline"] && ![controller.message containsString:@"secret"]);
    NSError *timeout=[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorTimedOut userInfo:nil];
    [proxy webView:nil didFailNavigation:nil withError:timeout];
    assert(failures==2 && original.failures==3 && [controller.message containsString:@"connect"]);
    [proxy webViewWebContentProcessDidTerminate:nil];
    assert(original.terminations==1 && controller.resets==0 && !controller.page && controller.retryVisible);
    SEL policy=@selector(webView:decidePolicyForNavigationAction:decisionHandler:);
    assert([proxy respondsToSelector:policy]);__block BOOL policyCalled=NO;
    [(id<WKNavigationDelegate>)proxy webView:nil decidePolicyForNavigationAction:nil decisionHandler:^(WKNavigationActionPolicy choice){assert(choice==WKNavigationActionPolicyCancel);policyCalled=YES;}];
    assert(policyCalled && original.policies==1);
    __block BOOL authCalled=NO;
    [(id<WKNavigationDelegate>)proxy webView:nil didReceiveAuthenticationChallenge:nil completionHandler:^(NSURLSessionAuthChallengeDisposition choice,NSURLCredential *credential){assert(choice==NSURLSessionAuthChallengeCancelAuthenticationChallenge);authCalled=YES;}];
    assert(authCalled && original.authentications==1);
    assert(![proxy respondsToSelector:@selector(webView:didFinishNavigation:)]);
    NSLog(@"PASS: startup failures show retry, cancellation is ignored, process termination clears page while retaining native audio, host policy/auth callbacks remain authoritative");
    exit(0); // fixture bypasses production observer setup/teardown
}return 1;}
