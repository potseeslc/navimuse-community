// Real AVPlayer cookie propagation and complete-VOD seek probe; muted simulator only.
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
int main(int argc,const char **argv){@autoreleasepool{
 if(argc!=2)return 2;
 NSHTTPCookie *cookie=[NSHTTPCookie cookieWithProperties:@{NSHTTPCookieDomain:@"127.0.0.1",NSHTTPCookiePath:@"/",NSHTTPCookieName:@"navimuse_session",NSHTTPCookieValue:@"fixture"}];
 AVURLAsset *asset=[AVURLAsset URLAssetWithURL:[NSURL URLWithString:@(argv[1])] options:@{AVURLAssetHTTPCookiesKey:@[cookie]}];
 AVPlayer *player=[AVPlayer playerWithPlayerItem:[AVPlayerItem playerItemWithAsset:asset]];player.muted=YES;[player play];
 double start=NSProcessInfo.processInfo.systemUptime;BOOL requested=NO;__block BOOL sought=NO;
 while(NSProcessInfo.processInfo.systemUptime-start<18){
  [[NSRunLoop currentRunLoop]runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.1]];
  if(player.currentItem.status==AVPlayerItemStatusFailed){NSLog(@"FAIL: %@",player.currentItem.error);return 1;}
  double position=CMTimeGetSeconds(player.currentTime);
  if(position>=2&&!requested){requested=YES;[player seekToTime:CMTimeMakeWithSeconds(12,600) toleranceBefore:kCMTimeZero toleranceAfter:kCMTimeZero completionHandler:^(BOOL done){sought=done;}];}
  if(sought&&position>=12&&position<15){[player pause];puts("PASS: authenticated HLS playback and seek to 12 seconds");return 0;}
 }
 [player pause];puts("FAIL: HLS did not start/seek before deadline");return 1;
}}
