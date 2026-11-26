#import "../src-tauri/ios/native-audio.m"
@interface NMSilentOfflineAudio : NMNativeAudio @end
@implementation NMSilentOfflineAudio
- (BOOL)activate{return NO;} // Fixture cannot activate audio, AirPlay or speakers.
@end
@interface NMOfflineStartupFixture : UIResponder <UIApplicationDelegate>
@property(nonatomic,strong) UIWindow *window;
@end
@implementation NMOfflineStartupFixture
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
 self.window=[[UIWindow alloc]initWithFrame:UIScreen.mainScreen.bounds];UIViewController *root=[UIViewController new];self.window.rootViewController=root;[self.window makeKeyAndVisible];
 WKWebView *web=[[WKWebView alloc]initWithFrame:root.view.bounds];web.autoresizingMask=UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;[root.view addSubview:web];
 NSString *bridge=[NSString stringWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"track-controls" ofType:@"js"] encoding:NSUTF8StringEncoding error:NULL];
 navimuse_install_native_audio(web,bridge.UTF8String);
 NMNativeAudio *audio=objc_getAssociatedObject(web,@selector(firstPartyCookies:));object_setClass(audio,NMSilentOfflineAudio.class);
 NSString *html=[NSString stringWithContentsOfFile:[NSBundle.mainBundle pathForResource:@"fixture" ofType:@"html"] encoding:NSUTF8StringEncoding error:NULL];navimuse_install_offline_shell(html.UTF8String);
 NSArray *args=NSProcessInfo.processInfo.arguments;
 NSString *scope=[@"queue-scope-v2:" stringByAppendingString:[@"" stringByPaddingToLength:64 withString:@"a" startingAtIndex:0]];
 if([args containsObject:@"seed"]){
  NMOfflineAccess *gate=[audio.downloads valueForKey:@"access"];double now=NSDate.date.timeIntervalSince1970*1000;
  [gate acceptResponse:@{@"version":@"navimuse-offline/v1",@"scope":scope,@"issuedAt":@(now),@"expiresAt":@(now+86400000)} expectedScope:scope nowMS:now uptime:NSProcessInfo.processInfo.systemUptime error:NULL];
  for(NSString *songID in @[@"cold-one",@"cold-two"]){
   NSString *ticket=[audio.downloads.store beginSong:@{@"id":songID,@"title":[@"Saved " stringByAppendingString:songID],@"artist":@"Silent fixture",@"duration":@12} error:NULL];
   if(ticket){[audio.downloads.store setState:@"downloading" songID:songID ticket:ticket message:nil error:NULL];
    NSURL *temp=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
    [NSFileManager.defaultManager copyItemAtPath:[NSBundle.mainBundle pathForResource:@"silence" ofType:@"wav"] toPath:temp.path error:NULL];
    [audio.downloads.store installFile:temp mimeType:@"audio/wav" songID:songID ticket:ticket error:NULL];}
  }
 }
 if([args containsObject:@"local"]||[args containsObject:@"remote"]){[audio.downloads.store setOutputOwnership:@{@"state":[args containsObject:@"local"]?@"local":@"remote"} scope:scope error:NULL];}
 NSString *probe=@"window.fixtureFetches=[];window.fetch=(...args)=>{window.fixtureFetches.push(String(args[0]));return Promise.reject(Error('No network in fixture'));};";
 [web.configuration.userContentController addUserScript:[[WKUserScript alloc]initWithSource:probe injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
 [audio openOffline];
 NSMutableDictionary *checks=[NSMutableDictionary new];BOOL exercise=[args containsObject:@"exercise"];
 void (^runChecks)(void)=^{
 if(exercise){
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,3*NSEC_PER_SEC),dispatch_get_main_queue(),^{[web evaluateJavaScript:@"Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Play downloads')?.click()" completionHandler:nil];});
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC),dispatch_get_main_queue(),^{
   checks[@"firstReady"]=@((BOOL)(audio.players[0].currentItem.status==AVPlayerItemStatusReadyToPlay));checks[@"firstFile"]=@([(AVURLAsset *)audio.players[0].currentItem.asset URL].isFileURL);
   [web evaluateJavaScript:@"(()=>{const sliders=Array.from(document.querySelectorAll('[aria-label=\"Seek playback\"]'));const target=sliders.at(-1);target?.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',bubbles:true}));return JSON.stringify({count:sliders.length,role:target?.getAttribute('role')});})()" completionHandler:^(id result,NSError *error){checks[@"seekControl"]=result?:error.localizedDescription?:@"none";}];
  });
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,6*NSEC_PER_SEC),dispatch_get_main_queue(),^{
   double position=CMTimeGetSeconds(audio.players[0].currentTime);checks[@"seekSeconds"]=@(isfinite(position)?position:0);
   [web evaluateJavaScript:@"document.querySelector('[aria-label=\"Next track\"]')?.click()" completionHandler:nil];
  });
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,7*NSEC_PER_SEC),dispatch_get_main_queue(),^{checks[@"secondSong"]=audio.downloadedDecks[0][@"songID"]?:@"";checks[@"stillSilent"]=@((BOOL)(audio.players[0].rate==0 && audio.players[1].rate==0));});
 }
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(exercise?8:3)*NSEC_PER_SEC),dispatch_get_main_queue(),^{
  NSString *directory=NSSearchPathForDirectoriesInDomains(NSDocumentDirectory,NSUserDomainMask,YES).firstObject;
  [web evaluateJavaScript:@"JSON.stringify({text:document.body.innerText,fetches:window.fixtureFetches,audio:document.querySelectorAll('audio').length,playDisabled:Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Play downloads')?.disabled})" completionHandler:^(id result,NSError *error){NSMutableDictionary *record=[[NSJSONSerialization JSONObjectWithData:[(NSString *)(result?:@"{}") dataUsingEncoding:NSUTF8StringEncoding] options:NSJSONReadingMutableContainers error:NULL] mutableCopy];record[@"checks"]=checks;NSString *json=[[NSString alloc]initWithData:[NSJSONSerialization dataWithJSONObject:record options:0 error:NULL] encoding:NSUTF8StringEncoding];[json writeToFile:[directory stringByAppendingPathComponent:@"startup.json"] atomically:YES encoding:NSUTF8StringEncoding error:NULL];}];
  [web takeSnapshotWithConfiguration:nil completionHandler:^(UIImage *image,NSError *error){if(image)[UIImagePNGRepresentation(image) writeToFile:[directory stringByAppendingPathComponent:@"startup.png"] atomically:YES];}];
 });
 };
 const NSTimeInterval deadline=NSProcessInfo.processInfo.systemUptime+20;
 __block void (^waitForDownloads)(void);
 waitForDownloads=^{
  [web evaluateJavaScript:@"document.querySelectorAll('.download-track').length===2 && document.querySelectorAll('audio').length===2 && !document.body.innerText.includes('Reading downloaded music')" completionHandler:^(id ready,NSError *error){
   if([ready respondsToSelector:@selector(boolValue)]&&[ready boolValue]){checks[@"downloadsReady"]=@YES;waitForDownloads=nil;runChecks();}
   else if(NSProcessInfo.processInfo.systemUptime>=deadline){checks[@"downloadsReady"]=@NO;waitForDownloads=nil;runChecks();}
   else dispatch_after(dispatch_time(DISPATCH_TIME_NOW,100*NSEC_PER_MSEC),dispatch_get_main_queue(),waitForDownloads);
  }];
 };
 waitForDownloads();
 return YES;
}
@end
int main(int argc,char **argv){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(NMOfflineStartupFixture.class));}}
