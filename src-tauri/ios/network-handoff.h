#import <Foundation/Foundation.h>
// Give a still-viable HLS item one bounded opportunity to reconnect. Never
// extend recovery for a failed item, ordinary progressive stream, or indefinitely.
static BOOL NMHLSHandoffGrace(BOOL hls, BOOL failed, double now, double changedAt, double waitingSince) {
 return hls&&!failed&&changedAt>0&&waitingSince>0&&now>=changedAt&&now-changedAt<12&&now-waitingSince<16;
}
