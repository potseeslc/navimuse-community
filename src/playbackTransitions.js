export const TRANSITION_MODE = Object.freeze({
  HARD: 'standard',
  GAPLESS: 'authored-gapless',
  SWEET_FADE: 'smart-blend',
  FIXED_CROSSFADE: 'fixed-crossfade'
});

export const DEFAULT_SWEET_FADE_SECONDS = 4;
export const MIN_SWEET_FADE_TRACK_SECONDS = 12;
// Short crossfade used when the requested fade has no room (e.g. the outgoing
// is already near its end and `effectiveSweetFadeSeconds` clamps to 0). Replaces
// the old hard-swap so the outgoing still ducks instead of cutting on desktop.
export const SWEET_FADE_MICRO_SECONDS = 0.35;

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export const WEB_TRANSITION_CAPABILITIES = Object.freeze({
  authoredGapless: false,
  smartBlend: true,
  fixedCrossfade: true
});

export const TRANSITION_EVENT = Object.freeze({
  REQUESTED: 'requested',
  BUFFERING: 'buffering',
  READY: 'ready',
  STARTED: 'started',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DEGRADED: 'degraded'
});

const transitionEvents = new Set(Object.values(TRANSITION_EVENT));

const transitionStyles = new Set(['smart', 'preserve', 'crossfade']);

function trackFor(item) {
  return item?.song || item || {};
}

function queueItemId(item) {
  const track = trackFor(item);
  return String(item?.queueItemId || track.id || '');
}

function albumIdentity(track) {
  return String(track?.albumId || track?.parent || '').trim();
}

function discNumber(track) {
  const value = Number(track?.discNumber ?? track?.disc ?? 1);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function trackNumber(track) {
  const value = Number(track?.trackNumber ?? track?.track);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function transitionContextFor({ context = '', sessionKind = '', queueSource } = {}) {
  const session = String(sessionKind).toLowerCase();
  if (['journey', 'artist-dj', 'radio'].includes(session)) return session;
  const requested = String(context || queueSource?.kind || '').toLowerCase();
  if (requested === 'album') return 'album';
  if (requested === 'playlist') return 'playlist';
  if (requested === 'journey') return 'journey';
  if (requested === 'artist') return 'artist-dj';
  if (requested === 'radio') return 'radio';
  if (requested === 'manual') return 'manual';
  return 'playlist';
}

export function transitionEventForDecision(decision, type, { queueRevision = decision?.queueRevision, reasonCode = '' } = {}) {
  if (!decision || !transitionEvents.has(type) || queueRevision !== decision.queueRevision) return null;
  return Object.freeze({
    type,
    queueRevision,
    pair: decision.pair,
    mode: decision.mode,
    reasonCode: String(reasonCode || decision.reasonCode || '')
  });
}

export function transitionEventState(current, event, activeQueueRevision) {
  if (!event || event.queueRevision !== activeQueueRevision) return current;
  return event;
}

export function transitionDecisionFor({
  queueRevision = 0,
  context = '',
  sessionKind = '',
  queueSource,
  outgoingItem,
  incomingItem,
  currentTrack,
  nextTrack,
  repeat = false,
  manual = false,
  preferences = {},
  capabilities = WEB_TRANSITION_CAPABILITIES
} = {}) {
  const outgoing = trackFor(outgoingItem || currentTrack);
  const incoming = trackFor(incomingItem || nextTrack);
  const outgoingId = queueItemId(outgoingItem || currentTrack);
  const incomingId = queueItemId(incomingItem || nextTrack);
  const resolvedContext = manual ? 'manual' : transitionContextFor({ context, sessionKind, queueSource });
  const requestedStyle = transitionStyles.has(preferences?.transitionStyle)
    ? preferences.transitionStyle
    : 'smart';
  const requestedSeconds = Math.max(1, Math.min(12, Math.round(Number(preferences?.smartBlendSeconds) || DEFAULT_SWEET_FADE_SECONDS)));
  const currentDuration = finitePositive(outgoing.duration);
  const nextDuration = finitePositive(incoming.duration);
  const currentAlbum = albumIdentity(outgoing);
  const nextAlbum = albumIdentity(incoming);
  const sameAlbum = Boolean(currentAlbum && currentAlbum === nextAlbum);
  const sameDisc = sameAlbum && discNumber(outgoing) === discNumber(incoming);
  const currentNumber = trackNumber(outgoing);
  const nextNumber = trackNumber(incoming);
  const consecutiveAlbumPair = sameDisc && currentNumber > 0 && nextNumber === currentNumber + 1;
  const liveStream = String(outgoingId).startsWith('radio:') || String(incomingId).startsWith('radio:') || resolvedContext === 'radio';

  let mode = TRANSITION_MODE.HARD;
  let durationMs = 0;
  let reasonCode = 'preserve-track-boundary';
  let degradedFrom = null;

  if (!outgoingId || !incomingId) {
    reasonCode = 'missing-pair-identity';
  } else if (manual) {
    reasonCode = 'manual-boundary';
  } else if (repeat) {
    reasonCode = 'repeat-one';
  } else if (liveStream) {
    reasonCode = 'live-stream';
  } else if (sameAlbum) {
    if (consecutiveAlbumPair && capabilities?.authoredGapless === true) {
      mode = TRANSITION_MODE.GAPLESS;
      reasonCode = 'authored-album-pair';
    } else {
      reasonCode = consecutiveAlbumPair ? 'adapter-gapless-unverified' : sameDisc ? 'album-order-unverified' : 'disc-boundary';
      degradedFrom = consecutiveAlbumPair ? TRANSITION_MODE.GAPLESS : null;
    }
  } else if (requestedStyle === 'preserve') {
    reasonCode = 'preference-preserve';
  } else if (!currentDuration || !nextDuration) {
    reasonCode = 'duration-unknown';
    degradedFrom = requestedStyle === 'crossfade' ? TRANSITION_MODE.FIXED_CROSSFADE : TRANSITION_MODE.SWEET_FADE;
  } else if (currentDuration < MIN_SWEET_FADE_TRACK_SECONDS || nextDuration < MIN_SWEET_FADE_TRACK_SECONDS) {
    reasonCode = 'track-too-short';
    degradedFrom = requestedStyle === 'crossfade' ? TRANSITION_MODE.FIXED_CROSSFADE : TRANSITION_MODE.SWEET_FADE;
  } else if (requestedStyle === 'crossfade' && capabilities?.fixedCrossfade !== false) {
    mode = TRANSITION_MODE.FIXED_CROSSFADE;
    durationMs = sweetFadeSeconds(currentDuration, nextDuration, requestedSeconds) * 1000;
    reasonCode = 'fixed-crossfade';
  } else if (requestedStyle === 'smart' && capabilities?.smartBlend !== false) {
    mode = TRANSITION_MODE.SWEET_FADE;
    durationMs = sweetFadeSeconds(currentDuration, nextDuration, requestedSeconds) * 1000;
    reasonCode = 'mixed-context';
  } else {
    reasonCode = 'adapter-capability-unavailable';
    degradedFrom = requestedStyle === 'crossfade' ? TRANSITION_MODE.FIXED_CROSSFADE : TRANSITION_MODE.SWEET_FADE;
  }

  return Object.freeze({
    pair: Object.freeze({ outgoingQueueItemId: outgoingId, incomingQueueItemId: incomingId }),
    queueRevision: Math.max(0, Number.isInteger(queueRevision) ? queueRevision : 0),
    context: resolvedContext,
    mode,
    durationMs: Math.max(0, Math.round(durationMs)),
    curve: mode === TRANSITION_MODE.HARD || mode === TRANSITION_MODE.GAPLESS ? 'linear' : 'equal-power',
    incomingOffsetMs: 0,
    outgoingGainDb: 0,
    incomingGainDb: 0,
    peakLimited: false,
    requiredReadiness: mode === TRANSITION_MODE.HARD ? 'none' : 'can-play',
    reasonCode,
    degradedFrom
  });
}

export function isBlendTransition(mode) {
  return mode === TRANSITION_MODE.SWEET_FADE || mode === TRANSITION_MODE.FIXED_CROSSFADE;
}

export function transitionModeFor({
  sessionKind = '',
  repeat = false,
  currentTrack,
  nextTrack
} = {}) {
  return transitionDecisionFor({
    sessionKind,
    currentTrack,
    nextTrack,
    repeat
  }).mode;
}

export function sweetFadeSeconds(currentDuration, nextDuration, preferred = DEFAULT_SWEET_FADE_SECONDS) {
  const outgoing = finitePositive(currentDuration);
  const incoming = finitePositive(nextDuration);
  const requested = finitePositive(preferred);
  if (!outgoing || !incoming || !requested) return 0;
  return Math.min(requested, outgoing / 3, incoming / 3);
}

export function shouldPrepareTransition({
  mode,
  currentTime,
  duration,
  preloadLeadSeconds = 30
} = {}) {
  if (mode === TRANSITION_MODE.HARD) return false;
  const total = finitePositive(duration);
  const elapsed = Math.max(0, Number(currentTime) || 0);
  const lead = finitePositive(preloadLeadSeconds);
  return total > 0 && lead > 0 && total - elapsed <= lead && total - elapsed > 0;
}

export function shouldStartSweetFade({ currentTime, duration, fadeSeconds } = {}) {
  const total = finitePositive(duration);
  const fade = finitePositive(fadeSeconds);
  const elapsed = Math.max(0, Number(currentTime) || 0);
  return total > 0 && fade > 0 && total - elapsed <= fade && total - elapsed > 0;
}

export function effectiveSweetFadeSeconds({ currentTime, duration, fadeSeconds } = {}) {
  const total = finitePositive(duration);
  const requested = finitePositive(fadeSeconds);
  const elapsed = Math.max(0, Number(currentTime) || 0);
  if (!total || !requested || elapsed >= total) return 0;
  return Math.min(requested, total - elapsed);
}

export function transitionDeckVolumes(volume, ratio) {
  const target = Math.max(0, Math.min(1, Number(volume) || 0));
  const progress = Math.max(0, Math.min(1, Number(ratio) || 0));
  const theta = (progress * Math.PI) / 2;
  return {
    incoming: target * Math.sin(theta),
    outgoing: target * Math.cos(theta)
  };
}

function normalizeCandidateUrl(value, baseHref = 'http://localhost/') {
  const parsed = new URL(value, baseHref);
  const params = parsed.searchParams;
  const expectedEntries = Array.from(params.entries());
  expectedEntries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }
    return leftKey.localeCompare(rightKey);
  });
  return {
    origin: parsed.origin,
    pathname: parsed.pathname,
    queryEntries: expectedEntries
  };
}

export function canUsePreparedDeck({ expectedUrl, actualUrl, readyState, error, baseHref = 'http://localhost/' } = {}) {
  if (error || !expectedUrl || !actualUrl || readyState < 2) return false;
  try {
    const expected = normalizeCandidateUrl(expectedUrl, baseHref);
    const actual = normalizeCandidateUrl(actualUrl, baseHref);
    if (expected.origin !== actual.origin || expected.pathname !== actual.pathname) return false;
    for (const [name, value] of expected.queryEntries) {
      if (!actual.queryEntries.some((entry) => entry[0] === name && entry[1] === value)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
