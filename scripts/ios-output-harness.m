// Local simulator fixture. No production account, audio source or deployment.
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <AVKit/AVKit.h>
extern void navimuse_install_ios_shell(void *, const char *);

@interface NMFixtureDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation NMFixtureDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    self.window=[[UIWindow alloc]initWithFrame:UIScreen.mainScreen.bounds];
    UIViewController *root=[UIViewController new];self.window.rootViewController=root;
    WKWebViewConfiguration *config=[WKWebViewConfiguration new];config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
    WKWebView *web=[[WKWebView alloc]initWithFrame:root.view.bounds configuration:config];web.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;
    [root.view addSubview:web];[self.window makeKeyAndVisible];
    NSString *bridge=[NSString stringWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"track-controls" ofType:@"js"] encoding:NSUTF8StringEncoding error:nil];
    navimuse_install_ios_shell((__bridge void *)web,bridge.UTF8String);
    NSString *html=[NSString stringWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"fixture" ofType:@"html"] encoding:NSUTF8StringEncoding error:nil];
    [web loadHTMLString:html baseURL:[NSURL URLWithString:@"https://navimuse.example.com"]];
    if([NSProcessInfo.processInfo.arguments containsObject:@"speaker-volume"])dispatch_after(dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        [web evaluateJavaScript:@"window.fixtureOwnSpeaker()" completionHandler:nil];
    });
    if([NSProcessInfo.processInfo.arguments containsObject:@"home-speakers"])dispatch_after(dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        [web evaluateJavaScript:@"document.querySelector('.output-remote-preference input').click()" completionHandler:nil];
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        [web evaluateJavaScript:@"JSON.stringify({url:location.href,origin:location.origin,bridge:!!window.__nmAudioTransport,audioFormats:window.__nmAudioTransport?.audioFormats,viewport:[innerWidth,innerHeight],anchor:document.querySelector('.native-route-row,.native-route-anchor')?.getBoundingClientRect().toJSON(),dialogOpen:document.querySelector('dialog')?.open,text:document.body.innerText})" completionHandler:^(id result,NSError *error){
            NSMutableDictionary *record=[NSMutableDictionary dictionary];record[@"dom"]=result?:@"";record[@"error"]=error.localizedDescription?:@"";record[@"webFrame"]=NSStringFromCGRect(web.frame);
            for(UIView *v in web.subviews)if([v isKindOfClass:AVRoutePickerView.class]){
                record[@"pickerFrame"]=NSStringFromCGRect(v.frame);
                CGPoint center=[v convertPoint:CGPointMake(CGRectGetMidX(v.bounds),CGRectGetMidY(v.bounds)) toView:root.view];
                UIView *hit=[root.view hitTest:center withEvent:nil];record[@"hitClass"]=NSStringFromClass(hit.class);record[@"pickerReceivesTouch"]=@([hit isDescendantOfView:v]);
                NSMutableArray *rowHits=[NSMutableArray new];
                for(NSNumber *x in @[@10,@(v.bounds.size.width/2),@(v.bounds.size.width-10)]){
                    CGPoint point=[v convertPoint:CGPointMake(x.doubleValue,v.bounds.size.height/2) toView:root.view];
                    UIView *target=[root.view hitTest:point withEvent:nil];
                    [rowHits addObject:@{@"class":NSStringFromClass(target.class)?:@"nil",@"native":@([target isDescendantOfView:v])}];
                }
                record[@"rowHits"]=rowHits;
            }
            NSString *directory=NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject;
            [web takeSnapshotWithConfiguration:nil completionHandler:^(UIImage *image,NSError *snapshotError){
                if(image)[UIImagePNGRepresentation(image) writeToFile:[directory stringByAppendingPathComponent:@"output.png"] atomically:YES];
            }];
            [[NSJSONSerialization dataWithJSONObject:record options:NSJSONWritingPrettyPrinted error:nil] writeToFile:[directory stringByAppendingPathComponent:@"diagnostics.json"] atomically:YES];
        }];
    });
    return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(NMFixtureDelegate.class));}}
