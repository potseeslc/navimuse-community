// Authored component fixture snapshots only. No personal app/screen capture.
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
extern void navimuse_install_ios_shell(void *, const char *);
@interface NMLayoutFixture : UIResponder <UIApplicationDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation NMLayoutFixture
- (UIInterfaceOrientationMask)application:(UIApplication *)application supportedInterfaceOrientationsForWindow:(UIWindow *)window {return NSProcessInfo.processInfo.arguments.count>1?[NSProcessInfo.processInfo.arguments[1] doubleValue]>500?UIInterfaceOrientationMaskLandscape:UIInterfaceOrientationMaskPortrait:UIInterfaceOrientationMaskLandscape;}
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
 self.window=[[UIWindow alloc]initWithFrame:UIScreen.mainScreen.bounds];UIViewController *root=[UIViewController new];self.window.rootViewController=root;[self.window makeKeyAndVisible];
 NSArray *args=NSProcessInfo.processInfo.arguments;double width=args.count>1?[args[1] doubleValue]:874,height=args.count>2?[args[2] doubleValue]:350;
 WKWebViewConfiguration *config=[WKWebViewConfiguration new];config.websiteDataStore=WKWebsiteDataStore.nonPersistentDataStore;
 WKWebView *web=[[WKWebView alloc]initWithFrame:root.view.bounds configuration:config];web.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;[root.view addSubview:web];
 NSString *bridge=[NSString stringWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"track-controls" ofType:@"js"] encoding:NSUTF8StringEncoding error:nil];
 navimuse_install_ios_shell((__bridge void *)web,bridge.UTF8String);
 NSString *html=[NSString stringWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"fixture" ofType:@"html"] encoding:NSUTF8StringEncoding error:nil];
 [web loadHTMLString:html baseURL:[NSURL URLWithString:@"https://navimuse.example.com"]];
 [self captureReadyWeb:web args:args attempt:0];return YES;
}
- (void)captureReadyWeb:(WKWebView *)web args:(NSArray *)args attempt:(NSInteger)attempt {
 NSString *check=@"Boolean(document.querySelector('.player-panel, .settings-save-dock, .playlist-dialog'))";
 if([args containsObject:@"menu"])check=@"(() => {if(document.querySelector('.player-action-panel'))return true;const button=Array.from(document.querySelectorAll('[aria-label=\"More track actions\"]')).find(e=>e.getBoundingClientRect().width>0 && getComputedStyle(e).visibility!=='hidden');if(button)button.click();return false;})()";
 if([args containsObject:@"home-art"])check=@"(() => {const close=document.querySelector('.player-sheet.open [aria-label=\"Close player\"]');if(close){close.click();return false;}const art=document.querySelector('.smart-playlist-art');if(!art)return false;const images=[...document.querySelectorAll('.smart-playlist-art img,.radio-home-art img,.personalized-mix-home img')];images.forEach(img=>img.loading='eager');art.scrollIntoView({block:'start'});return images.length>0&&images.every(img=>img.complete&&img.naturalWidth>0);})()";
 [web evaluateJavaScript:check completionHandler:^(id ready,NSError *error){
  if(![ready boolValue] && attempt<150){dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_main_queue(),^{[self captureReadyWeb:web args:args attempt:attempt+1];});return;}
  if([args containsObject:@"picker-input"])[web evaluateJavaScript:@"document.querySelector(\".playlist-dialog input\")?.focus()" completionHandler:nil];
  if([args containsObject:@"settings"])[web evaluateJavaScript:@"document.querySelector('.downloads-settings').open=true" completionHandler:nil];
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,500*NSEC_PER_MSEC),dispatch_get_main_queue(),^{
  NSString *directory=NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject;
  NSString *name=[NSString stringWithFormat:@"layout-%.0fx%.0f%@",web.bounds.size.width,web.bounds.size.height,[args containsObject:@"menu"]?@"-menu":[args containsObject:@"settings"]?@"-settings":@""];
  [web evaluateJavaScript:@"JSON.stringify({...window.fixtureMetrics?.(),error:document.body.innerText,errors:window.fixtureErrors||[],state:document.readyState,root:document.getElementById('root')?.innerHTML})" completionHandler:^(id result,NSError *error){[(NSString *)(result?:error.localizedDescription) writeToFile:[directory stringByAppendingPathComponent:[name stringByAppendingString:@".json"]] atomically:YES encoding:NSUTF8StringEncoding error:nil];}];
  [web takeSnapshotWithConfiguration:nil completionHandler:^(UIImage *image,NSError *error){if(image)[UIImagePNGRepresentation(image) writeToFile:[directory stringByAppendingPathComponent:[name stringByAppendingString:@".png"]] atomically:YES];}];
  });
 }];
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(NMLayoutFixture.class));}}
