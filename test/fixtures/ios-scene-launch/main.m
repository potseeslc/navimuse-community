#import <UIKit/UIKit.h>
#import "../../../src-tauri/ios/carplay.h"
@interface ProbeSession : NSObject
@property(nonatomic,strong) NSString *role;
@end
@implementation ProbeSession
@end
extern void scene_probe_start(void);
extern bool scene_probe_ready(void);
int main(void) {
    @autoreleasepool {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            UIApplication *app = UIApplication.sharedApplication;
            UIWindowScene *scene = (UIWindowScene *)app.connectedScenes.anyObject;
            BOOL ok = scene_probe_ready() && app.connectedScenes.count == 1 && !app.supportsMultipleScenes && scene.windows.count == 1 && scene.windows.firstObject.rootViewController != nil && !scene.windows.firstObject.hidden;
            ProbeSession *probe=[ProbeSession new];probe.role=@"CPTemplateApplicationSceneSessionRoleApplication";
            UISceneConfiguration *car=[app.delegate application:app configurationForConnectingSceneSession:(UISceneSession *)probe options:nil];
            ok=ok && [car.name isEqual:@"NaviMuseCarPlay"] && car.delegateClass==NMCarPlaySceneDelegate.class && car.sceneClass==CPTemplateApplicationScene.class;
            fprintf(stdout, "SCENE_PROBE ready=%d scenes=%lu multi=%d windows=%lu visible=%d result=%s\n", scene_probe_ready(), (unsigned long)app.connectedScenes.count, app.supportsMultipleScenes, (unsigned long)scene.windows.count, !scene.windows.firstObject.hidden, ok ? "PASS" : "FAIL");
            fflush(stdout);
            exit(ok ? 0 : 1);
        });
        scene_probe_start();
    }
}
