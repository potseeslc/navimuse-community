#import <AVFoundation/AVFoundation.h>
// Check domains as well as codes, including wrapped AVFoundation errors.
static BOOL NMMediaServicesResetError(NSError *error) {
    for(NSUInteger depth=0;[error isKindOfClass:NSError.class] && depth<8;depth++) {
        if([error.domain isEqual:AVFoundationErrorDomain] && error.code==AVErrorMediaServicesWereReset)return YES;
        error=error.userInfo[NSUnderlyingErrorKey];
    }
    return NO;
}
