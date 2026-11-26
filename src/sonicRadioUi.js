export const sonicExcludeBudgetBytes = 6000;
export const sonicExcludeMaxEntries = 500;

export function boundedSonicExclusions(excludeIds = [], budgetBytes = sonicExcludeBudgetBytes) {
  const uniqueIds = [...new Set(excludeIds)].filter(Boolean).map(String);
  const selected = [];
  let usedBytes = 0;
  for (let index = uniqueIds.length - 1; index >= 0; index -= 1) {
    if (selected.length >= sonicExcludeMaxEntries) break;
    const id = uniqueIds[index];
    const encodedBytes = encodeURIComponent(id).length + 9;
    if (usedBytes + encodedBytes > budgetBytes) break;
    selected.push(id);
    usedBytes += encodedBytes;
  }
  return selected.reverse();
}

export function cancelPendingSonicResume(resumeRef) {
  resumeRef.current = 0;
}

export function consumePendingSonicResume(resumeRef, now = Date.now(), maxAgeMs = 90000) {
  const requestedAt = resumeRef.current;
  resumeRef.current = 0;
  return Boolean(requestedAt && now - requestedAt <= maxAgeMs);
}

export async function fetchSonicSimilarTracks(fetchFn, seedId, count = 12, options = {}) {
  const params = new URLSearchParams({ seed: seedId, count: String(count) });
  for (const id of boundedSonicExclusions(options.excludeIds)) {
    params.append('exclude', id);
  }
  const response = await fetchFn(`/api/audiomuse/similar_tracks?${params}`, options.signal ? {signal:options.signal} : undefined);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, tracks: [], partial: false, exhausted: false };
  return {
    ok: payload.ok === true,
    tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
    candidateCount: Math.max(0, Number(payload.candidateCount) || 0),
    resolvedCount: Math.max(0, Number(payload.resolvedCount) || 0),
    partial: payload.partial === true,
    exhausted: payload.exhausted === true,
    resolutionIncomplete: payload.resolutionIncomplete === true,
    timedOut: payload.timedOut === true,
    missingCount: Math.max(0, Number(payload.missingCount) || 0),
    transientFailureCount: Math.max(0, Number(payload.transientFailureCount) || 0)
  };
}

async function fetchSeedSongs(fetchFn, path) {
  const response = await fetchFn(path);
  if (!response.ok) throw new Error('Track lookup failed');
  const payload = await response.json();
  if (!Array.isArray(payload?.songs)) throw new Error('Invalid track lookup response');
  return payload.songs;
}

export function searchSonicFallback(fetchFn, query) {
  return fetchSeedSongs(fetchFn, `/api/navidrome/search?q=${encodeURIComponent(query)}`);
}

export function fetchArtistSongs(fetchFn, artistId) {
  return fetchSeedSongs(fetchFn, `/api/navidrome/artists/${encodeURIComponent(artistId)}/songs`);
}

export function fetchGenreSongs(fetchFn, genre) {
  return fetchSeedSongs(fetchFn, `/api/navidrome/genres/${encodeURIComponent(genre)}/songs`);
}

export function rawQueueSong(queue, trackId) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const currentIndex = Number.isInteger(queue?.index) ? queue.index : -1;
  const current = items[currentIndex];
  if (current?.song?.id === trackId) return current.song;
  return items.find((item) => item?.song?.id === trackId)?.song || null;
}

export function radioQueueItemForTrack(queue, trackId) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const currentIndex = Number.isInteger(queue?.index) ? queue.index : -1;
  const current = items[currentIndex];
  if (current?.song?.id === trackId && current.radioSessionId) return current;
  return items.find((item) => item?.song?.id === trackId && item.radioSessionId) || null;
}

export function activeRadioProgressIds(queue, state, trackId) {
  if (!trackId || !state || ['idle', 'stopped'].includes(state.status)) return [];
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const currentIndex = items.findIndex((item) => String(item?.song?.id || '') === String(trackId));
  if (currentIndex < 0) return [];
  const playedIds = new Set((Array.isArray(state.playedIds) ? state.playedIds : []).map(String));
  const activeIds = new Set([
    playedIds.has(String(state.seedSongId || '')) ? '' : state.seedSongId,
    ...(Array.isArray(state.candidateIds) ? state.candidateIds : [])
  ].filter(Boolean).map(String));
  if (!activeIds.has(String(trackId)) && !radioQueueItemForTrack(queue, trackId)) return [];
  // React can coalesce several fast Next actions into one visible track update.
  // Reconcile every still-pending Journey item crossed by the queue position so
  // the controller reaches its refill threshold even when intermediate renders
  // were skipped. Already-played ids are absent from activeIds, making normal
  // one-track progression idempotent.
  return [...new Set(items.slice(0, currentIndex + 1)
    .map((item) => String(item?.song?.id || ''))
    .filter((id) => activeIds.has(id)))];
}

export function queueIndexForSong(queue, songId) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  return items.findIndex((item) => item?.song?.id === songId);
}

export function sonicRadioStatusLabel(state, notice = '') {
  if (notice) return notice;
  const artistDj = state?.sessionKind === 'artist-dj';
  const mode = artistDj ? 'Artist DJ' : 'Journey';
  if (state?.status === 'stopped') return `${mode} stopped. Your current queue is unchanged.`;
  if (!state) return '';
  if (state.status === 'seeding' || state.status === 'generating') return artistDj ? 'Building an Artist DJ queue...' : 'Building a Journey...';
  if (state.status === 'replenishing') return 'Finding more Journey tracks...';
  if (state.status === 'listening') return `${mode}: ${state.seedLabel || mode} is active.`;
  if (state.status === 'degraded') return `${mode} generation is unavailable. Your current queue will keep playing.`;
  return '';
}
