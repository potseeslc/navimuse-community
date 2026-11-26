/**
 * Media Session API contract — defines the stable interface for wiring
 * the browser Media Session (lock screen / media keys / Bluetooth controls).
 *
 * Pure helpers for the App's Media Session wiring.
 */

/**
 * @typedef {Object} MediaSessionMetadata
 * @property {string} title - Track title
 * @property {string} artist - Track artist
 * @property {string} album - Album name
 * @property {{src: string}[]} artwork - Media Session artwork entries
 */

/**
 * @typedef {Object} MediaSessionState
 * @property {MediaSessionMetadata|null} metadata - Current track metadata
 * @property {'none'|'paused'|'playing'} playbackState - Playback state
 * @property {number} position - Current playback position (seconds)
 * @property {number} duration - Track duration (seconds)
 */

/**
 * Builds MediaSession-compatible metadata from a nowPlaying track object.
 *
 * @param {Object|null} nowPlaying - Normalized track from App state
 * @returns {MediaSessionMetadata|null}
 */
export function buildMediaSessionMetadata(nowPlaying) {
  if (!nowPlaying?.id) return null;
  const broadcastTitle = String(nowPlaying.id).startsWith('radio:') && nowPlaying.radioTitle;
  return {
    title: broadcastTitle || nowPlaying.title || 'Unknown Track',
    artist: broadcastTitle ? nowPlaying.title || 'Internet Radio' : nowPlaying.artist || 'Unknown Artist',
    album: nowPlaying.album || 'Unknown Album',
    artwork: nowPlaying.artwork ? [{ src: nowPlaying.artwork }] : []
  };
}

/**
 * Creates the browser-native MediaMetadata value required by MediaSession.
 * Keeping construction at this boundary prevents plain objects from reaching
 * navigator.mediaSession.metadata, which throws in Chromium.
 *
 * @param {Object|null} nowPlaying - Normalized track from App state
 * @param {Function|undefined} MediaMetadataCtor - Browser MediaMetadata constructor
 * @returns {MediaMetadata|null}
 */
export function createMediaSessionMetadata(nowPlaying, MediaMetadataCtor = globalThis.MediaMetadata) {
  const metadata = buildMediaSessionMetadata(nowPlaying);
  if (!metadata || typeof MediaMetadataCtor !== 'function') return null;
  return new MediaMetadataCtor(metadata);
}

/**
 * Maps an internal playback state to the MediaSession playbackState string.
 *
 * @param {boolean} isPlaying - Whether audio is currently playing
 * @param {Object|null} nowPlaying - Whether a track is loaded
 * @returns {'none'|'paused'|'playing'}
 */
export function mediaSessionPlaybackState(isPlaying, nowPlaying) {
  if (!nowPlaying?.id) return 'none';
  return isPlaying ? 'playing' : 'paused';
}

/**
 * Defines the action handlers that App must wire to navigator.mediaSession.
 * Each handler is a no-op stub until #73 implements it.
 *
 * @typedef {Object} MediaSessionActionHandlers
 * @property {() => void} play - Resume playback
 * @property {() => void} pause - Pause playback
 * @property {() => void} previoustrack - Go to previous track
 * @property {() => void} nexttrack - Go to next track
 * @property {() => void} seekbackward - Seek backward
 * @property {() => void} seekforward - Seek forward
 * @property {() => void} seekto - Seek to absolute position
 * @property {() => void} stop - Stop playback
 */

/**
 * Returns the set of Media Session action names that NaviMuse supports.
 * Used by #73 to wire navigator.mediaSession.setActionHandler.
 *
 * @returns {string[]}
 */
export function supportedMediaSessionActions() {
  return ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'stop'];
}

export function mediaSessionPositionState(playbackState = {}, nowPlaying = null) {
  const duration = Number(playbackState.duration || nowPlaying?.duration || 0);
  const position = Number(playbackState.currentTime || 0);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return null;
  return { duration, position: Math.max(0, Math.min(duration, position)), playbackRate: 1 };
}

// Music exposes track navigation. Explicitly clear relative-seek actions so the
// system does not prefer podcast-style skip intervals over Previous/Next.
let actionDiagnostics = { actions: {}, lastAction: 'none' };

export function bindMediaSessionActions(media, handlers) {
  const current = { actions: {}, lastAction: 'none' };
  actionDiagnostics = current;
  const supported = supportedMediaSessionActions();
  const actions = [...supported, 'seekbackward', 'seekforward'];
  for (const action of actions) {
    const handler = supported.includes(action) && typeof handlers[action] === 'function' ? handlers[action] : null;
    try {
      media.setActionHandler(action, handler ? event => { current.lastAction = action; return handler(event); } : null);
      current.actions[action] = handler ? 'accepted' : 'cleared';
    } catch { current.actions[action] = 'rejected'; }
  }
  return () => {
    for (const action of actions) {
      try { media.setActionHandler(action, null); current.actions[action] = 'cleared'; }
      catch { current.actions[action] = 'rejected'; }
    }
  };
}

// Explicit local snapshot only: no track text, URLs, credentials or event history.
export function mediaSessionDiagnosticSnapshot(media = globalThis.navigator?.mediaSession) {
  return {
    revision: 'media-controls-2',
    available: Boolean(media),
    actions: { ...actionDiagnostics.actions },
    lastAction: actionDiagnostics.lastAction,
    playbackState: ['none', 'paused', 'playing'].includes(media?.playbackState) ? media.playbackState : 'unknown',
    metadataPresent: Boolean(media?.metadata),
    artworkPresent: Boolean(media?.metadata?.artwork?.length)
  };
}
