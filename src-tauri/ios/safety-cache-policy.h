#import <Foundation/Foundation.h>

// Independent of Wi-Fi/cellular labels. Downloads yield to playback and a
// completed cache stays selected until measured recovery survives a hold period.
static BOOL NMSafetyShouldPause(BOOL paused, BOOL playing, BOOL waiting, BOOL local, BOOL complete, double buffer) {
    if(!playing || (!local && (waiting || (!complete && buffer<20))))return YES;
    if(local || complete || buffer>=60)return NO;
    return paused;
}
static BOOL NMSafetyHealthy(BOOL playing, BOOL waiting, BOOL local, BOOL complete, double buffer, double measured, double required, double sampleAge) {
    return playing&&!waiting&&sampleAge>=0&&sampleAge<45&&measured>required*1.5&&(local||complete||buffer>=60);
}
