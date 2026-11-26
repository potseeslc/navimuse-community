#import <AVFoundation/AVFoundation.h>
#import <CoreMedia/CoreMedia.h>

// Read the opened asset, never library tags or requested URL parameters. This is
// received media information, not the DAC/AirPlay output format or bit-perfectness.
static NSString *NMCodecName(AudioFormatID format) {
    switch(format) {
        case kAudioFormatMPEGLayer3:return @"MP3";
        case kAudioFormatMPEG4AAC:return @"AAC";
        case kAudioFormatMPEG4AAC_HE:return @"HE-AAC";
        case kAudioFormatMPEG4AAC_HE_V2:return @"HE-AAC v2";
        case kAudioFormatAppleLossless:return @"ALAC";
        case kAudioFormatFLAC:return @"FLAC";
        case kAudioFormatOpus:return @"Opus";
        case kAudioFormatLinearPCM:return @"PCM";
        default:return nil;
    }
}
// Live/chunked streams can have no asset tracks even while the player has
// decoded audio. Inspect its enabled audio track, excluding timed metadata.
static AVAssetTrack *NMSelectedAudioTrack(AVPlayerItem *item) {
    AVAssetTrack *selected=nil;
    for(AVPlayerItemTrack *track in item.tracks) {
        if(!track.enabled || ![track.assetTrack.mediaType isEqual:AVMediaTypeAudio])continue;
        if(selected)return nil; // Multiple enabled audio tracks are ambiguous.
        selected=track.assetTrack;
    }
    return selected;
}
static void NMLoadTrackStreamDetails(AVAssetTrack *track, void (^completion)(NSDictionary *)) {
    if(!track){completion(@{});return;}
    [track loadValuesAsynchronouslyForKeys:@[@"formatDescriptions",@"estimatedDataRate"] completionHandler:^{
        if([track statusOfValueForKey:@"formatDescriptions" error:nil]!=AVKeyValueStatusLoaded || track.formatDescriptions.count!=1){completion(@{});return;}
        CMAudioFormatDescriptionRef format=(__bridge CMAudioFormatDescriptionRef)track.formatDescriptions.firstObject;
        const AudioStreamBasicDescription *description=CMAudioFormatDescriptionGetStreamBasicDescription(format);
        if(!description){completion(@{});return;}
        NSMutableDictionary *details=[NSMutableDictionary new];
        NSString *codec=NMCodecName(description->mFormatID);if(codec)details[@"codec"]=codec;
        if(isfinite(description->mSampleRate)&&description->mSampleRate>0)details[@"sampleRate"]=@(description->mSampleRate);
        if(description->mChannelsPerFrame>0)details[@"channels"]=@(description->mChannelsPerFrame);
        if(description->mBitsPerChannel>0)details[@"bitDepth"]=@(description->mBitsPerChannel);
        if([track statusOfValueForKey:@"estimatedDataRate" error:nil]==AVKeyValueStatusLoaded && isfinite(track.estimatedDataRate) && track.estimatedDataRate>0)details[@"estimatedBitRate"]=@(track.estimatedDataRate);
        completion(details);
    }];
}
static void NMLoadStreamDetails(AVAsset *asset, void (^completion)(NSDictionary *)) {
    [asset loadTracksWithMediaType:AVMediaTypeAudio completionHandler:^(NSArray<AVAssetTrack *> *tracks,NSError *error){
        NMLoadTrackStreamDetails(!error && tracks.count==1?tracks.firstObject:nil,completion);
    }];
}
