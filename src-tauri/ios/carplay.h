#import <CarPlay/CarPlay.h>

// CarPlay presents the existing queue; it never owns a second player or credentials.
@interface NMCarPlayHub : NSObject
@property(nonatomic,strong) CPInterfaceController *interface;
@property(nonatomic,strong) CPTabBarTemplate *tabs;
@property(nonatomic,copy) NSDictionary *snapshot;
@property(nonatomic,copy) void (^send)(NSDictionary *);
@property(nonatomic,copy) NSString *pendingID;
@property(nonatomic,copy) void (^pendingCompletion)(void);
+ (instancetype)shared;
- (void)clear;
- (BOOL)accept:(NSDictionary *)snapshot;
- (void)render;
- (void)finish:(NSDictionary *)result;
@end
@implementation NMCarPlayHub
+ (instancetype)shared {static NMCarPlayHub *hub;static dispatch_once_t once;dispatch_once(&once,^{hub=[self new];});return hub;}
- (void)completePending {void (^done)(void)=self.pendingCompletion;self.pendingCompletion=nil;self.pendingID=nil;if(done)done();}
- (void)cancelPending {if(self.pendingID && self.send)self.send(@{@"type":@"carplay",@"action":@"cancel",@"requestId":self.pendingID});[self completePending];}
- (void)clear {[self cancelPending];self.snapshot=nil;[self render];}
- (BOOL)accept:(NSDictionary *)snapshot {
 if(![snapshot isKindOfClass:NSDictionary.class]||![snapshot[@"scope"] isKindOfClass:NSString.class]||[snapshot[@"scope"] length]>512||![snapshot[@"revision"] isKindOfClass:NSString.class]||[snapshot[@"revision"] length]>100)return NO;
 NSArray *sections=snapshot[@"sections"];if(![sections isKindOfClass:NSArray.class]||sections.count>4)return NO;
 for(id section in sections){if(![section isKindOfClass:NSDictionary.class]||![section[@"title"] isKindOfClass:NSString.class]||[section[@"title"] length]>80||![section[@"items"] isKindOfClass:NSArray.class]||[section[@"items"] count]>40)return NO;
  for(id item in section[@"items"]){if(![item isKindOfClass:NSDictionary.class])return NO;for(NSString *key in @[@"id",@"title",@"detail"])if(![item[key] isKindOfClass:NSString.class]||[item[key] length]>512)return NO;}
 }
 if(![self.snapshot[@"scope"] isEqual:snapshot[@"scope"]])[self cancelPending];
 self.snapshot=[snapshot copy];[self render];return YES;
}
- (void)notice:(NSString *)text {
 if(!self.interface)return;
 __weak NMCarPlayHub *weak=self;
 CPAlertAction *ok=[[CPAlertAction alloc]initWithTitle:@"OK" style:CPAlertActionStyleDefault handler:^(CPAlertAction *action){[weak.interface dismissTemplateAnimated:YES completion:nil];}];
 [self.interface presentTemplate:[[CPAlertTemplate alloc]initWithTitleVariants:@[text] actions:@[ok]] animated:YES completion:nil];
}
- (void)select:(NSString *)identifier revision:(NSString *)revision completion:(void (^)(void))completion {
 BOOL found=NO;for(NSDictionary *section in self.snapshot[@"sections"])for(NSDictionary *item in section[@"items"])if(identifier.length && [identifier isEqual:item[@"id"]])found=YES;
 if(!found||self.pendingID||![revision isEqual:self.snapshot[@"revision"]]||!self.send){completion();return;}
 NSString *request=NSUUID.UUID.UUIDString;self.pendingID=request;self.pendingCompletion=completion;
 self.send(@{@"type":@"carplay",@"action":@"select",@"id":identifier,@"requestId":request,@"revision":revision,@"scope":self.snapshot[@"scope"]?:@"",@"expiresAt":@(NSDate.date.timeIntervalSince1970*1000+8000)});
 __weak NMCarPlayHub *weak=self;
 dispatch_after(dispatch_time(DISPATCH_TIME_NOW,8*NSEC_PER_SEC),dispatch_get_main_queue(),^{NMCarPlayHub *hub=weak;if(![hub.pendingID isEqual:request])return;[hub cancelPending];[hub notice:@"Unable to start. Open NaviMuse on your iPhone when parked, then try again."];});
}
- (void)finish:(NSDictionary *)result {
 if(![result[@"requestId"] isEqual:self.pendingID])return;
 [self completePending];
 if([result[@"ok"] isEqual:@YES]){if(self.interface.topTemplate!=CPNowPlayingTemplate.sharedTemplate)[self.interface pushTemplate:CPNowPlayingTemplate.sharedTemplate animated:YES completion:nil];}
 else [self notice:@"Music is unavailable. Check your connection or choose a download."];
}
- (void)render {
 if(!self.interface)return;
 NSArray *sections=self.snapshot[@"sections"];
 if(!sections.count)sections=@[@{@"title":@"NaviMuse",@"items":@[@{@"id":@"",@"title":@"Open NaviMuse on your iPhone",@"detail":@"Sign in and choose music while parked."}]}];
 NSMutableArray *templates=[NSMutableArray new];NSArray *symbols=@[@"play.circle",@"arrow.down.circle",@"music.note.list",@"sparkles"];
 NSString *revision=self.snapshot[@"revision"]?:@"";__weak NMCarPlayHub *weak=self;
 for(NSDictionary *section in sections){NSMutableArray *items=[NSMutableArray new];for(NSDictionary *value in section[@"items"]){CPListItem *item=[[CPListItem alloc]initWithText:value[@"title"] detailText:value[@"detail"] image:[UIImage systemImageNamed:symbols[MIN(templates.count,3)]]];
  NSString *identifier=value[@"id"];item.enabled=identifier.length>0;
  if(identifier.length)item.handler=^(id<CPSelectableListItem> selected,void (^done)(void)){[weak select:identifier revision:revision completion:done];};
  [items addObject:item];}
  if(!items.count){CPListItem *empty=[[CPListItem alloc]initWithText:@"No music available" detailText:@"Choose music on your iPhone while parked."];empty.enabled=NO;[items addObject:empty];}
  CPListTemplate *list=[[CPListTemplate alloc]initWithTitle:section[@"title"] sections:@[[[CPListSection alloc]initWithItems:items]]];list.tabTitle=section[@"title"];list.tabImage=[UIImage systemImageNamed:symbols[MIN(templates.count,3)]];[templates addObject:list];
 }
 if(self.tabs && self.tabs.templates.count==templates.count){for(NSUInteger i=0;i<templates.count;i++)[(CPListTemplate *)self.tabs.templates[i] updateSections:[(CPListTemplate *)templates[i] sections]];}
 else {self.tabs=[[CPTabBarTemplate alloc]initWithTemplates:templates];[self.interface setRootTemplate:self.tabs animated:NO completion:nil];}
}
@end

@interface NMCarPlaySceneDelegate : UIResponder <CPTemplateApplicationSceneDelegate>
@end
@implementation NMCarPlaySceneDelegate
- (void)templateApplicationScene:(CPTemplateApplicationScene *)scene didConnectInterfaceController:(CPInterfaceController *)controller {
 NMCarPlayHub *hub=NMCarPlayHub.shared;hub.interface=controller;hub.tabs=nil;[hub render];if(hub.send)hub.send(@{@"type":@"carplay",@"action":@"refresh"});
}
- (void)templateApplicationScene:(CPTemplateApplicationScene *)scene didDisconnectInterfaceController:(CPInterfaceController *)controller {
 NMCarPlayHub *hub=NMCarPlayHub.shared;if(hub.interface==controller){[hub cancelPending];hub.interface=nil;hub.tabs=nil;}
}
@end
