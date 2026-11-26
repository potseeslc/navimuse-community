#import "../../src-tauri/ios/listening-ledger.h"
#include <assert.h>
int main(void){@autoreleasepool{
 NSURL *file=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
 NMListeningLedger *l=[[NMListeningLedger alloc]initWithFile:file];l.scope=@"account-a";
 NSURL *url=[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/song"];
 [l loadURL:url deck:0];
 assert(![l sampleDeck:0 position:0 duration:60 playing:YES uptime:100]);
 assert(![l sampleDeck:0 position:20 duration:60 playing:YES uptime:120]);
 [l resetSample:0]; // explicit seek is not listening
 assert(![l sampleDeck:0 position:50 duration:60 playing:YES uptime:121]);
 assert(![l sampleDeck:0 position:50 duration:60 playing:NO uptime:140]);
 assert(![l sampleDeck:0 position:50 duration:60 playing:YES uptime:160]);
 assert([l sampleDeck:0 position:60 duration:60 playing:YES uptime:170]);
 assert(![l sampleDeck:0 position:61 duration:60 playing:YES uptime:171]);
 NSArray *records=[l recordsForScope:@"account-a"];assert(records.count==1);
 NSString *identifier=records[0][@"id"];
 NMListeningLedger *reopened=[[NMListeningLedger alloc]initWithFile:file];assert([reopened recordsForScope:@"account-a"].count==1);
 assert([reopened recordsForScope:@"account-b"].count==0);
 [reopened acknowledge:identifier scope:@"account-b"];assert([reopened recordsForScope:@"account-a"].count==1);
 [reopened acknowledge:identifier scope:@"account-a"];assert([reopened recordsForScope:@"account-a"].count==0);
 [l loadURL:url deck:0];[l sampleDeck:0 position:0 duration:60 playing:YES uptime:200];
 assert(![l sampleDeck:0 position:60 duration:60 playing:YES uptime:201]); // unexplained seek
 l.scope=@"account-b";assert(![l sampleDeck:0 position:90 duration:60 playing:YES uptime:231]);
 [l loadURL:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/song?accountScope=account-a"] deck:0];
 assert(![l sampleDeck:0 position:0 duration:60 playing:YES uptime:1000]);assert(![l sampleDeck:0 position:60 duration:60 playing:YES uptime:1060]);
 [l loadURL:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/radios/live/stream"] deck:0];
 assert(![l sampleDeck:0 position:1000 duration:60 playing:YES uptime:2000]);
 [NSFileManager.defaultManager removeItemAtURL:file error:NULL];
 NSLog(@"PASS native listening survives reopen, separates accounts, ignores seeks/stalls and reports once");
}return 0;}
