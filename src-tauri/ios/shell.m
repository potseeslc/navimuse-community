#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

extern void navimuse_install_native_audio(WKWebView *, const char *);

void navimuse_install_ios_shell(void *pointer, const char *javascript) {

    WKWebView *webview = (__bridge WKWebView *)pointer;
    UIView *parent = webview.superview;
    if (parent) {
        parent.backgroundColor = [UIColor colorWithRed:9/255.0 green:13/255.0 blue:15/255.0 alpha:1];
        webview.translatesAutoresizingMaskIntoConstraints = NO;
        // Backgrounds fill the device; CSS safe-area insets protect controls.
        [NSLayoutConstraint activateConstraints:@[
            [webview.topAnchor constraintEqualToAnchor:parent.topAnchor],
            [webview.bottomAnchor constraintEqualToAnchor:parent.bottomAnchor],
            [webview.leadingAnchor constraintEqualToAnchor:parent.leadingAnchor],
            [webview.trailingAnchor constraintEqualToAnchor:parent.trailingAnchor]
        ]];
        webview.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    }
    if (@available(iOS 27.0, *)) {
        Class bridge = NSClassFromString(@"NMRemoteSpeakerBridge");
        SEL install = NSSelectorFromString(@"installOn:");
        if (bridge && [bridge respondsToSelector:install]) {
            void (*invoke)(id, SEL, WKWebView *) = (void (*)(id, SEL, WKWebView *))[bridge methodForSelector:install];
            invoke(bridge, install, webview);
        }
    }
    navimuse_install_native_audio(webview, javascript);
}
