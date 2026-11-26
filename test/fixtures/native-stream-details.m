// Silent metadata inspection. Stream tests prepare muted players, never play.
#import "../../src-tauri/ios/stream-details.h"
#include <assert.h>
static NSDictionary *inspect(AVAsset *asset) {
    __block NSDictionary *result=nil;
    NMLoadStreamDetails(asset,^(NSDictionary *details){dispatch_async(dispatch_get_main_queue(),^{result=details;});});
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:10];
    while(!result && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
    assert(result);return result;
}
static NSDictionary *inspectStream(NSString *url, NSString *codec, int sampleRate) {
    AVPlayerItem *item=[AVPlayerItem playerItemWithURL:[NSURL URLWithString:url]];
    AVPlayer *player=[AVPlayer playerWithPlayerItem:item];player.muted=YES;
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:15];
    while((item.status!=AVPlayerItemStatusReadyToPlay || !NMSelectedAudioTrack(item)) && item.status!=AVPlayerItemStatusFailed && deadline.timeIntervalSinceNow>0)
        [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
    assert(item.status==AVPlayerItemStatusReadyToPlay);assert(NMSelectedAudioTrack(item));
    __block NSDictionary *result=nil;
    NMLoadTrackStreamDetails(NMSelectedAudioTrack(item),^(NSDictionary *details){dispatch_async(dispatch_get_main_queue(),^{result=details;});});
    while(!result && deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
    assert([result[@"codec"] isEqual:codec]);assert([result[@"sampleRate"] intValue]==sampleRate);
    assert([result[@"channels"] intValue]==1);assert(player.rate==0);
    [player replaceCurrentItemWithPlayerItem:nil];assert(!NMSelectedAudioTrack(player.currentItem));
    return result;
}
int main(int argc,char **argv){@autoreleasepool{
    assert(argc==6);
    NSDictionary *pcm=inspect([AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:@(argv[1])] options:nil]);
    assert([pcm[@"codec"] isEqual:@"PCM"]);assert([pcm[@"sampleRate"] intValue]==44100);assert([pcm[@"channels"] intValue]==1);assert([pcm[@"bitDepth"] intValue]==16);
    NSDictionary *aac=inspect([AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:@(argv[2])] options:nil]);
    assert([aac[@"codec"] isEqual:@"AAC"]);assert([aac[@"sampleRate"] intValue]==44100);assert([aac[@"channels"] intValue]==1);
    assert(inspect([AVMutableComposition composition]).count==0);
    AVURLAsset *opusAsset=[AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:@(argv[3])] options:nil];
    NSDictionary *opus=inspect(opusAsset);
    __block BOOL loaded=NO;
    [opusAsset loadValuesAsynchronouslyForKeys:@[@"playable"] completionHandler:^{dispatch_async(dispatch_get_main_queue(),^{loaded=YES;});}];
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:10];while(!loaded&&deadline.timeIntervalSinceNow>0)[NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.02]];
    assert(loaded);BOOL supported=[AVURLAsset isPlayableExtendedMIMEType:@"audio/ogg; codecs=opus"];
    if(supported){assert(opusAsset.playable);assert([opus[@"codec"] isEqual:@"Opus"]);}
    NSDictionary *streamMP3=inspectStream(@(argv[4]),@"MP3",44100);
    NSDictionary *streamOpus=supported?inspectStream(@(argv[5]),@"Opus",48000):@{};
    NSDictionary *result=@{@"streamMP3":streamMP3,@"streamOpus":streamOpus,@"opusDeclaredSupported":@(supported),@"opusPlayable":@(opusAsset.playable),@"opus":opus,@"pcm":pcm,@"aac":aac,@"noAudio":@"unavailable"};
    puts([[NSString alloc]initWithData:[NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:nil] encoding:NSUTF8StringEncoding].UTF8String);
    return 0;
}}
