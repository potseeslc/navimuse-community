#import <Foundation/Foundation.h>
#include <math.h>
// Library duration can be rounded or slightly inaccurate. Reject substantial
// truncation even when a partial MP3 is independently decodable/playable.
static BOOL NMDownloadedDurationComplete(double actual,double expected) {
    if(!isfinite(actual)||actual<=0)return NO;
    if(!isfinite(expected)||expected<=0)return YES;
    return actual>=expected-MAX(3,expected*.02);
}
