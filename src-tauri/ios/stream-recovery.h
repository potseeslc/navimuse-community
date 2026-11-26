#import <Foundation/Foundation.h>
#include <math.h>

// Per-deck intent survives an AVPlayer item replacement. Revisions invalidate
// timers, cookie reads and seeks; a pause must never restart audio asynchronously.
@interface NMStreamRecovery : NSObject
@property(nonatomic) BOOL wantsPlayback;
@property(nonatomic) BOOL pending;
@property(nonatomic) BOOL restoring;
@property(nonatomic) NSUInteger revision;
@property(nonatomic) NSUInteger attempts;
@property(nonatomic) double position;
@property(nonatomic) double stableSince;
@property(nonatomic) double waitingSince;
@property(nonatomic,copy) NSURL *url;
@property(nonatomic,copy) NSURL *deliveryURL;
@property(nonatomic) double retryAfter;
- (void)observePosition:(double)position;
- (void)cancel;
- (void)load:(NSURL *)url;
- (BOOL)reserveAttempt;
- (BOOL)retryAllowedAt:(double)now;
@end
@implementation NMStreamRecovery
// Failed/replaced items can report zero. Only an explicit successful user seek
// may move the recovery checkpoint backwards within a loaded occurrence.
- (void)observePosition:(double)position {if(!self.restoring && isfinite(position) && position>self.position)self.position=position;}

- (void)cancel {self.wantsPlayback=NO;self.pending=NO;self.waitingSince=0;self.revision++;}
- (void)load:(NSURL *)url {[self cancel];self.url=url;self.deliveryURL=url;self.retryAfter=0;self.attempts=0;self.position=0;self.stableSince=0;self.restoring=NO;}
- (BOOL)retryAllowedAt:(double)now {
    if(!self.wantsPlayback)return NO;
    if(self.attempts<3)return YES;
    if(self.retryAfter==0)self.retryAfter=now+30;
    if(now<self.retryAfter)return NO;
    self.attempts=0;self.retryAfter=0;return YES;
}
- (BOOL)reserveAttempt {if(!self.wantsPlayback||self.attempts>=3)return NO;self.attempts++;return YES;}
@end

static BOOL NMTransientStreamFailure(NSError *error, NSInteger httpStatus) {
    // Explicit HTTP rejection wins over a nested network error.
    if(httpStatus>=400)return httpStatus==408||httpStatus==429||httpStatus>=500;
    for(NSUInteger depth=0;error && depth<8;depth++,error=error.userInfo[NSUnderlyingErrorKey]) {
        if([error.domain isEqual:NSURLErrorDomain])switch(error.code) {
            case NSURLErrorTimedOut:case NSURLErrorCannotFindHost:
            case NSURLErrorCannotConnectToHost:case NSURLErrorNetworkConnectionLost:
            case NSURLErrorDNSLookupFailed:case NSURLErrorNotConnectedToInternet:return YES;
            default:break;
        }
    }
    return NO;
}

static BOOL NMRecoverySeekLanded(double target,double actual) {
    return isfinite(actual) && actual>=0 && fabs(actual-target)<=1.0;
}
