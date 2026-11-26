export const TRANSPORT_STATUS = Object.freeze({
  RESTORED: 'restored',
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  PAUSED_AFTER_CURRENT: 'paused-after-current',
  BUFFERING: 'buffering',
  RECOVERING: 'recovering',
  ENDED: 'ended',
  ERROR: 'error'
});

const START_EVENTS = new Set(['restore', 'load']);
const ACTIVE_STATUSES = new Set([
  TRANSPORT_STATUS.LOADING,
  TRANSPORT_STATUS.PLAYING,
  TRANSPORT_STATUS.BUFFERING,
  TRANSPORT_STATUS.RECOVERING
]);

export function initialTransportState() {
  return {
    status: TRANSPORT_STATUS.ENDED,
    requestId: 0,
    error: '',
    recoverable: false,
    restored: false
  };
}

export function transportStateForEvent(current = initialTransportState(), event = {}) {
  const type = String(event.type || '');
  const requestId = Number.isInteger(event.requestId) && event.requestId >= 0
    ? event.requestId
    : current.requestId;

  if (START_EVENTS.has(type)) {
    if (requestId < current.requestId) return current;
    return {
      status: type === 'restore' ? TRANSPORT_STATUS.RESTORED : TRANSPORT_STATUS.LOADING,
      requestId,
      error: '',
      recoverable: false,
      restored: type === 'restore' || Boolean(event.restored)
    };
  }

  if (requestId !== current.requestId) return current;

  switch (type) {
    case 'request-play':
      return {
        ...current,
        status: current.status === TRANSPORT_STATUS.ERROR
          ? TRANSPORT_STATUS.RECOVERING
          : TRANSPORT_STATUS.LOADING,
        error: '',
        recoverable: false
      };
    case 'ready':
      return {
        ...current,
        status: [TRANSPORT_STATUS.RESTORED, TRANSPORT_STATUS.PAUSED_AFTER_CURRENT].includes(current.status)
          ? current.status
          : TRANSPORT_STATUS.READY,
        error: '',
        recoverable: false
      };
    case 'playing':
      return { ...current, status: TRANSPORT_STATUS.PLAYING, error: '', recoverable: false };
    case 'waiting':
      if (!ACTIVE_STATUSES.has(current.status)) return current;
      return { ...current, status: TRANSPORT_STATUS.BUFFERING };
    case 'recover':
      return { ...current, status: TRANSPORT_STATUS.RECOVERING, error: '', recoverable: false };
    case 'pause':
      if ([TRANSPORT_STATUS.RESTORED, TRANSPORT_STATUS.ENDED, TRANSPORT_STATUS.ERROR, TRANSPORT_STATUS.PAUSED_AFTER_CURRENT].includes(current.status)) return current;
      if ([TRANSPORT_STATUS.LOADING, TRANSPORT_STATUS.RECOVERING].includes(current.status) && event.intentional !== true) return current;
      return { ...current, status: TRANSPORT_STATUS.PAUSED };
    case 'pause-after-current':
      return { ...current, status: TRANSPORT_STATUS.PAUSED_AFTER_CURRENT, error: '', recoverable: false };
    case 'ended':
      return { ...current, status: TRANSPORT_STATUS.ENDED, error: '', recoverable: false };
    case 'error':
      return {
        ...current,
        status: TRANSPORT_STATUS.ERROR,
        error: String(event.message || 'Playback could not continue.'),
        recoverable: event.recoverable !== false
      };
    default:
      return current;
  }
}

export function isAudiblyPlaying(transport) {
  return transport?.status === TRANSPORT_STATUS.PLAYING;
}

export function transportStatusMessage(transport, { position = 0, title = '' } = {}) {
  switch (transport?.status) {
    case TRANSPORT_STATUS.RESTORED:
      return position > 0
        ? `Restored at ${formatTransportTime(position)}. Play to continue.`
        : 'Restored. Play to continue.';
    case TRANSPORT_STATUS.LOADING:
      return title ? `Loading ${title}…` : 'Loading track…';
    case TRANSPORT_STATUS.READY:
      return 'Ready to play.';
    case TRANSPORT_STATUS.PAUSED_AFTER_CURRENT:
      return title ? `Paused before ${title}. Play to continue.` : 'Paused after the current track. Play to continue.';
    case TRANSPORT_STATUS.BUFFERING:
      return 'Loading audio…';
    case TRANSPORT_STATUS.RECOVERING:
      return 'Reconnecting playback…';
    case TRANSPORT_STATUS.ENDED:
      return title ? 'Playback ended.' : '';
    case TRANSPORT_STATUS.ERROR:
      return transport.error || 'Playback could not continue.';
    default:
      return '';
  }
}

function formatTransportTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
