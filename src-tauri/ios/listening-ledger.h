#import <Foundation/Foundation.h>
#include <math.h>

// Main-thread native accounting survives WebView suspension. Only qualifying
// listens are durable; unsent records stay isolated by server/account scope.
@interface NMListeningLedger : NSObject
@property(nonatomic,strong) NSURL *file;
@property(nonatomic,strong) NSMutableArray *pending;
@property(nonatomic,strong) NSMutableDictionary *decks;
@property(nonatomic,copy) NSString *scope;
- (instancetype)initWithFile:(NSURL *)file;
- (void)loadURL:(NSURL *)url deck:(NSInteger)deck;
- (BOOL)sampleDeck:(NSInteger)deck position:(double)position duration:(double)duration playing:(BOOL)playing uptime:(double)uptime;
- (void)resetSample:(NSInteger)deck;
- (NSArray *)recordsForScope:(NSString *)scope;
- (BOOL)acknowledge:(NSString *)identifier scope:(NSString *)scope;
@end
@implementation NMListeningLedger
- (instancetype)initWithFile:(NSURL *)file {
    if(!(self=[super init]))return nil;
    _file=file;_decks=[NSMutableDictionary new];_scope=@"";
    id saved=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfURL:file]?:[NSData data] options:NSJSONReadingMutableContainers error:NULL];
    _pending=[saved isKindOfClass:NSArray.class]?[saved mutableCopy]:[NSMutableArray new];return self;
}
- (BOOL)persist {
    [NSFileManager.defaultManager createDirectoryAtURL:self.file.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:nil error:NULL];
    NSData *data=[NSJSONSerialization dataWithJSONObject:self.pending options:0 error:NULL];
    return data && [data writeToURL:self.file options:NSDataWritingAtomic error:NULL];
}
- (void)setScope:(NSString *)scope {if(![_scope isEqual:scope]){_scope=[scope copy];[self.decks removeAllObjects];}}
- (void)loadURL:(NSURL *)url deck:(NSInteger)deck {
    [self.decks removeObjectForKey:@(deck)];
    NSString *prefix=@"/api/navidrome/stream/";
    if(!self.scope.length || ![url.path hasPrefix:prefix])return;
    NSArray *query=[NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO].queryItems;
    NSMutableArray *scopes=[NSMutableArray new];for(NSURLQueryItem *item in query)if([item.name isEqual:@"accountScope"])[scopes addObject:item.value?:@""];
    if(scopes.count>1 || (scopes.count==1 && ![scopes.firstObject isEqual:self.scope]) || ([self.scope hasPrefix:@"queue-scope-v2:"] && scopes.count!=1))return;
    NSString *song=[url.path substringFromIndex:prefix.length];
    if(!song.length || [song containsString:@"/"] || [song hasPrefix:@"radio:"] || [song hasPrefix:@"mock-"])return;
    self.decks[@(deck)]=[@{@"id":NSUUID.UUID.UUIDString,@"songId":song,@"scope":self.scope,@"seconds":@0,@"sent":@NO} mutableCopy];
}
- (void)resetSample:(NSInteger)deck {NSMutableDictionary *entry=self.decks[@(deck)];[entry removeObjectForKey:@"position"];[entry removeObjectForKey:@"uptime"];entry[@"playing"]=@NO;}
- (BOOL)sampleDeck:(NSInteger)deck position:(double)position duration:(double)duration playing:(BOOL)playing uptime:(double)uptime {
    NSMutableDictionary *entry=self.decks[@(deck)];if(!entry)return NO;
    if(!isfinite(position)||position<0||!isfinite(uptime)){[self resetSample:deck];return NO;}
    double delta=position-[entry[@"position"] doubleValue],elapsed=uptime-[entry[@"uptime"] doubleValue];
    // A seek must not count as listening. Negative time after replacement also
    // resets the baseline; pause/stall intervals are excluded.
    if(entry[@"position"] && [entry[@"playing"] boolValue] && playing && elapsed>0 && delta>0 && delta<=elapsed+1)
        entry[@"seconds"]=@([entry[@"seconds"] doubleValue]+MIN(delta,elapsed));
    if(playing && !entry[@"time"])entry[@"time"]=@((long long)(NSDate.date.timeIntervalSince1970*1000));
    entry[@"position"]=@(position);entry[@"uptime"]=@(uptime);entry[@"playing"]=@(playing);
    double threshold=isfinite(duration)&&duration>0?MIN(duration*.5,240):240;
    if([entry[@"sent"] boolValue] || [entry[@"seconds"] doubleValue]<threshold || !entry[@"time"] || self.pending.count>=5000)return NO;
    NSDictionary *record=@{@"id":entry[@"id"],@"songId":entry[@"songId"],@"scope":entry[@"scope"],@"time":entry[@"time"]};
    [self.pending addObject:record];if(![self persist]){[self.pending removeLastObject];return NO;}
    entry[@"sent"]=@YES;return YES;
}
- (NSArray *)recordsForScope:(NSString *)scope {
    NSMutableArray *records=[NSMutableArray new];
    for(NSDictionary *record in self.pending)if([record[@"scope"] isEqual:scope] && records.count<100)[records addObject:record];
    return records;
}
- (BOOL)acknowledge:(NSString *)identifier scope:(NSString *)scope {
    NSMutableArray *before=[self.pending mutableCopy];
    NSIndexSet *matches=[self.pending indexesOfObjectsPassingTest:^BOOL(NSDictionary *record,NSUInteger i,BOOL *stop){return [record[@"id"] isEqual:identifier] && [record[@"scope"] isEqual:scope];}];
    [self.pending removeObjectsAtIndexes:matches];if([self persist])return YES;self.pending=before;return NO;
}
@end
