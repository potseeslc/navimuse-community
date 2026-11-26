// Presentation only: the BFF coordinator remains the playback authority.
const terminal = new Set(['released', 'external', 'error', 'ended']);
const active = new Set(['playing', 'paused', 'buffering']);
const transient = new Set(['starting', 'reconnecting', 'unreachable']);

// Keep uncertain ownership distinct from confirmed release. A network exception
// must not be converted to a successful null snapshot by the bridge.
export function remoteNowPlayingPublication(session, options = {}) {
  if (options.fetchFailed) return {kind:'retain'};
  if (session === null || (session && terminal.has(session.status))) return {kind:'end'};
  if (session && transient.has(session.status)) return {kind:'retain'};
  if (!session || !active.has(session.status)) throw new TypeError('Unknown remote playback state');
  return {kind:'update', attributes:remoteNowPlayingAttributes(session, options)};
}

export function remoteNowPlayingAttributes(session, {observedAt} = {}) {
  if (session === null || (session && terminal.has(session.status))) return null;
  if (!session || !active.has(session.status)) throw new TypeError('No confirmed remote playback snapshot');
  // Position belongs to the server observation, not the time a delayed client
  // response arrives. Callers may override this only for a known observation.
  const timestamp = observedAt ?? session.updatedAt;
  if (typeof session.id !== 'string' || !/^[a-f0-9-]{36}$/.test(session.id) ||
      !Number.isSafeInteger(session.revision) || session.revision < 0 ||
      !session.device?.id || !session.song?.id || !Number.isFinite(timestamp) ||
      !Number.isFinite(new Date(timestamp).getTime())) {
    throw new TypeError('Invalid remote playback snapshot');
  }
  const radio = Boolean(session.queue?.internetRadio);
  const duration = !radio && Number.isFinite(session.duration) && session.duration > 0 ? session.duration : null;
  const position = Number.isFinite(session.position) ? Math.max(0, session.position) : 0;
  const queue = session.queue;
  return {
    id:session.id, revision:session.revision, status:session.status,
    mediaKind:radio ? 'radio' : 'music',
    elapsedTime:radio ? 0 : duration === null ? position : Math.min(position,duration),
    timestamp:new Date(timestamp).toISOString(),
    deviceID:String(session.device.id), deviceName:String(session.device.name || 'Home speaker'),
    trackID:String(session.song.id), title:String(session.song.title || ''),
    artist:String(session.song.artist || ''), album:String(session.song.album || ''),
    duration, artworkID:session.song.coverArt ? String(session.song.coverArt) : null,
    canNext:!radio && (queue?.index < (queue?.items?.length || 0)-1),
    canPrevious:!radio && (queue?.index > 0 || position > 3),
    canSeek:!radio && duration !== null && ['playing','paused'].includes(session.status),
  };
}
