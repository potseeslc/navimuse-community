// M8 freezes this product vocabulary before redesigned surfaces begin using it.
// This module owns names and serializable shapes only; queue mutation remains in
// the existing playerQueueState authority.

export const TRACK_ACTION_IDS = Object.freeze([
  'play-now',
  'play-next',
  'add-to-queue',
  'start-radio',
  'start-journey'
]);

export const TRACK_ACTION_LABELS = Object.freeze({
  'play-now': 'Play now',
  'play-next': 'Play next',
  'add-to-queue': 'Add to queue',
  'start-radio': 'Start radio',
  'start-journey': 'Start Journey'
});

export const DEFAULT_TRACK_ACTIVATION = Object.freeze({
  pointerSingle: 'select',
  pointerDouble: 'play-now',
  keyboardEnter: 'play-now',
  keyboardSpace: 'toggle-playback-unless-editing'
});

export const QUEUE_SOURCE_KINDS = Object.freeze([
  'album',
  'playlist',
  'search',
  'radio',
  'journey',
  'artist',
  'songs',
  'ad-hoc',
  'listenbrainz'
]);

export const QUEUE_SOURCE_DESCRIPTOR_VERSION = 1;
export const QUEUE_ITEM_PROVENANCE = Object.freeze(['source', 'explicit', 'generated']);

/**
 * Build the immutable, display-safe origin attached to one authoritative queue.
 * Private query text and service credentials are never part of this descriptor.
 */
export function createQueueSourceDescriptor(input = {}) {
  const kind = QUEUE_SOURCE_KINDS.includes(input.kind) ? input.kind : 'ad-hoc';
  const id = cleanText(input.id, 256);
  const label = cleanText(input.label, 160) || defaultQueueSourceLabel(kind);
  const detail = cleanText(input.detail, 240);
  const generatedBoundary = Number.isInteger(input.generatedBoundary) && input.generatedBoundary >= 0
    ? input.generatedBoundary
    : null;

  return Object.freeze({
    version: QUEUE_SOURCE_DESCRIPTOR_VERSION,
    kind,
    ...(id ? { id } : {}),
    label,
    ...(detail ? { detail } : {}),
    ...(generatedBoundary !== null ? { generatedBoundary } : {})
  });
}

export function validateQueueSourceDescriptor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.version !== QUEUE_SOURCE_DESCRIPTOR_VERSION) return null;
  if (!QUEUE_SOURCE_KINDS.includes(value.kind)) return null;
  if (!isBoundedText(value.label, 160, true)) return null;
  if (value.id !== undefined && !isBoundedText(value.id, 256, true)) return null;
  if (value.detail !== undefined && !isBoundedText(value.detail, 240, true)) return null;
  if (value.generatedBoundary !== undefined
    && (!Number.isInteger(value.generatedBoundary) || value.generatedBoundary < 0)) return null;
  return value;
}

export function queueItemProvenance(value, fallback = 'source') {
  return QUEUE_ITEM_PROVENANCE.includes(value) ? value : fallback;
}

export const PLAYBACK_REPORTING_CONTRACT = Object.freeze({
  nowPlaying: 'once-per-track-after-confirmed-playback',
  submission: '50-percent-or-240-seconds-whichever-comes-first',
  maximumRequiredListenSeconds: 240,
  retryableStatuses: Object.freeze([408, 429, '5xx']),
  maximumRetryDelayMs: 60000
});

function defaultQueueSourceLabel(kind) {
  return {
    album: 'Album',
    playlist: 'Playlist',
    search: 'Search results',
    radio: 'Radio',
    journey: 'Journey',
    artist: 'Artist',
    songs: 'Songs',
    'ad-hoc': 'Your queue'
  }[kind];
}

function cleanText(value, maximumLength) {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : '';
}

function isBoundedText(value, maximumLength, required = false) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return (!required || normalized.length > 0) && normalized === value && value.length <= maximumLength;
}
