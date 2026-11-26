#import <UIKit/UIKit.h>
#import "../../src-tauri/ios/carplay.h"
@interface FixtureScene : UIResponder <UIWindowSceneDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation FixtureScene
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
 self.window=[[UIWindow alloc]initWithWindowScene:(UIWindowScene *)scene];UIViewController *vc=[UIViewController new];vc.view.backgroundColor=UIColor.blackColor;UILabel *label=[[UILabel alloc]initWithFrame:CGRectMake(20,100,350,150)];label.text=@"NaviMuse CarPlay template fixture\nOpen the CarPlay external display.";label.textColor=UIColor.whiteColor;label.numberOfLines=0;[vc.view addSubview:label];self.window.rootViewController=vc;[self.window makeKeyAndVisible];
}
@end
@interface FixtureApp : UIResponder <UIApplicationDelegate>
@end
@implementation FixtureApp
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
 NSMutableArray *sections=[NSMutableArray new];NSArray *names=@[@"Listen",@"Downloads",@"Playlists",@"Journeys"];
 NSArray *titles=@[@"Resume listening",@"Downloaded album",@"Road trip",@"Continue current Journey"];
 for(NSUInteger i=0;i<4;i++)[sections addObject:@{@"title":names[i],@"items":@[@{@"id":[NSString stringWithFormat:@"item%lu",(unsigned long)i],@"title":titles[i],@"detail":i==1?@"12 songs ready offline":@"CarPlay interface verification"}]}];
 [NMCarPlayHub.shared accept:@{@"scope":@"fixture",@"revision":@"r",@"sections":sections}];
 NMCarPlayHub.shared.send=^(NSDictionary *event){if([event[@"action"] isEqual:@"select"])[NMCarPlayHub.shared finish:@{@"requestId":event[@"requestId"],@"ok":@NO}];};
 return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,@"FixtureApp");}}
