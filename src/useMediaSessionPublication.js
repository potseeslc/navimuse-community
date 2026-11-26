import { nativeAudioTransport, publishNativeMetadata } from './nativeAudio.js';
import { useEffect } from 'react';
import { createMediaSessionMetadata, mediaSessionPlaybackState, mediaSessionPositionState } from './mediaSession.js';

export function useMediaSessionPublication(nowPlaying, isPlaying, playbackState) {
  const media = nativeAudioTransport() ? null : globalThis.navigator?.mediaSession;
  // Replacing MediaMetadata also replaces the browser's artwork loader. Keep it
  // independent of frequent position updates and unchanged track objects.
  useEffect(() => {
    if (nativeAudioTransport()) { publishNativeMetadata(nowPlaying); return; }
    if (!media) return;
    try { media.metadata = createMediaSessionMetadata(nowPlaying); } catch { media.metadata = null; }
  }, [media, nowPlaying?.id, nowPlaying?.title, nowPlaying?.artist, nowPlaying?.album, nowPlaying?.artwork, nowPlaying?.radioTitle]);

  useEffect(() => {
    if (!media) return;
    media.playbackState = mediaSessionPlaybackState(isPlaying, nowPlaying);
    const position = mediaSessionPositionState(playbackState, nowPlaying);
    if (position && typeof media.setPositionState === 'function') { try { media.setPositionState(position); } catch {} }
  }, [media, nowPlaying?.id, nowPlaying?.duration, isPlaying, playbackState]);
}
