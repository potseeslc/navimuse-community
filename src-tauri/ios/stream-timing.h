#import <AVFoundation/AVFoundation.h>

// VBR Opus can have a substantially wrong bitrate-based duration estimate.
// Ask AVFoundation to read precise timing for finite library assets, including
// restored streams and cached files. Live radio keeps its streaming behavior.
static AVURLAsset *NMPlaybackAsset(NSURL *url, NSDictionary *options) {
    NSMutableDictionary *timed=[options mutableCopy]?:[NSMutableDictionary new];
    if(![url.path containsString:@"/radios/"])timed[AVURLAssetPreferPreciseDurationAndTimingKey]=@YES;
    return [AVURLAsset URLAssetWithURL:url options:timed];
}
