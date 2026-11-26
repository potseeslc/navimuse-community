#import "../../src-tauri/ios/stream-recovery.h"
#include <assert.h>
#import "../../src-tauri/ios/download-validation.h"
int main(void){@autoreleasepool{
    assert(NMDownloadedDurationComplete(299,300));assert(!NMDownloadedDurationComplete(225,300));
    assert(!NMDownloadedDurationComplete(NAN,300));assert(NMDownloadedDurationComplete(30,0));
    NMStreamRecovery *state=[NMStreamRecovery new];
    NSURL *url=[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/song"];
    [state load:url];assert(![state reserveAttempt]);
    state.wantsPlayback=YES;[state observePosition:73.5];
    [state observePosition:0];[state observePosition:12];[state observePosition:NAN];assert(state.position==73.5);
    state.restoring=YES;[state observePosition:100];assert(state.position==73.5);
    assert(!NMRecoverySeekLanded(73.5,0));assert(NMRecoverySeekLanded(73.5,73.4));assert(!NMRecoverySeekLanded(73.5,NAN));
    NSURL *delivery=[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/hls/sessions/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/master.m3u8?accountScope=scope"];
    state.deliveryURL=delivery;assert([state.url isEqual:url]);assert([state.deliveryURL isEqual:delivery]);
    assert([state reserveAttempt]);assert([state reserveAttempt]);assert([state reserveAttempt]);assert(![state reserveAttempt]);
    assert(![state retryAllowedAt:100]);assert(![state retryAllowedAt:129]);assert([state retryAllowedAt:130]);assert(state.attempts==0);
    NSUInteger cookieRevision=state.revision;state.pending=YES;[state cancel];
    assert(state.revision!=cookieRevision && !state.pending && !state.wantsPlayback);
    assert(state.position==73.5 && state.restoring); // explicit play can restore even after a paused seek
    assert(![state reserveAttempt]);
    [state load:[NSURL URLWithString:@"https://navimuse.example.com/api/navidrome/stream/next"]];
    assert(state.position==0 && !state.restoring && state.attempts==0 && !state.wantsPlayback);
    [state load:nil];assert(!state.url);
    for(NSNumber *code in @[@(NSURLErrorTimedOut),@(NSURLErrorNetworkConnectionLost),@(NSURLErrorNotConnectedToInternet),@(NSURLErrorCannotFindHost),@(NSURLErrorCannotConnectToHost),@(NSURLErrorDNSLookupFailed)]) {
        NSError *error=[NSError errorWithDomain:NSURLErrorDomain code:code.integerValue userInfo:nil];
        assert(NMTransientStreamFailure(error,0));
        assert(!NMTransientStreamFailure(error,401));assert(!NMTransientStreamFailure(error,403));assert(!NMTransientStreamFailure(error,404));
        NSError *wrapped=[NSError errorWithDomain:@"AVFoundationErrorDomain" code:-11800 userInfo:@{NSUnderlyingErrorKey:error}];
        assert(NMTransientStreamFailure(wrapped,0));
    }
    assert(NMTransientStreamFailure(nil,408));assert(NMTransientStreamFailure(nil,429));assert(NMTransientStreamFailure(nil,503));
    assert(!NMTransientStreamFailure(nil,0));
    assert(!NMTransientStreamFailure([NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorServerCertificateUntrusted userInfo:nil],0));
    assert(!NMTransientStreamFailure([NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorCancelled userInfo:nil],0));
}return 0;}
