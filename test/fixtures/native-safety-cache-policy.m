#import "../../src-tauri/ios/safety-cache-policy.h"
#include <assert.h>
int main(void){
 assert(NMSafetyShouldPause(NO,YES,YES,NO,NO,90)); // waiting always takes priority
 assert(NMSafetyShouldPause(NO,YES,NO,NO,NO,10));
 assert(NMSafetyShouldPause(YES,YES,NO,NO,NO,40)); // low/high watermark hysteresis
 assert(!NMSafetyShouldPause(NO,YES,NO,NO,NO,40));
 assert(!NMSafetyShouldPause(YES,YES,NO,NO,NO,65));
 assert(!NMSafetyShouldPause(YES,YES,NO,NO,YES,3)); // short fully buffered song
 assert(!NMSafetyShouldPause(YES,YES,NO,YES,NO,0)); // cache playback can refill
 assert(NMSafetyShouldPause(NO,NO,NO,YES,NO,0)); // user pause stops prefetch
 assert(NMSafetyHealthy(YES,NO,YES,NO,0,2000000,1000000,3));
 assert(!NMSafetyHealthy(YES,NO,YES,NO,0,2000000,1000000,46));
 assert(!NMSafetyHealthy(YES,NO,YES,NO,0,100000,1000000,3));
 assert(!NMSafetyHealthy(YES,YES,NO,NO,90,2000000,1000000,0));
 return 0;
}
