import { apiJson, apiRequestUrl, jsonRequest } from './apiClient.js';

// Bound Library reads through both response headers and JSON consumption. A
// stalled request must release the existing explicit Retry UI, never retry itself.
async function libraryReadJson(path, init, fallbackError) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal.reason);
  if (init.signal?.aborted) abortFromCaller();
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  let rejectAborted;
  const aborted = new Promise((resolve, reject) => { rejectAborted = reject; });
  const onAbort = () => rejectAborted(controller.signal.reason);
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Library request timed out', 'TimeoutError')), 15000);
  try {
    controller.signal.throwIfAborted();
    return await Promise.race([apiJson(path, { ...init, signal: controller.signal }, fallbackError), aborted]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}


export function scopedLibraryPath(path, musicFolderId, baseHref) {
  const url = new URL(path, baseHref || 'http://navimuse.local');
  if (musicFolderId) url.searchParams.set('musicFolderId', musicFolderId);
  return `${url.pathname}${url.search}`;
}

export function navidromeBootstrap(musicFolderId, init = {}) {
  return libraryReadJson(
    scopedLibraryPath('/api/navidrome/bootstrap', musicFolderId),
    init,
    'Navidrome is not ready for NaviMuse yet'
  );
}

export function navidromeSearch(query, musicFolderId, init = {}) {
  const path = scopedLibraryPath(`/api/navidrome/search?q=${encodeURIComponent(query)}`, musicFolderId);
  return apiJson(path, init, 'Search failed');
}

export function navidromeAlbum(albumId, init = {}) {
  return apiJson(`/api/navidrome/albums/${encodeURIComponent(albumId)}`, init, 'NaviMuse could not load that album.');
}

export function navidromeLibraryBrowse(kind, params = {}, init = {}) {
  const query = new URLSearchParams(params);
  return libraryReadJson(
    `/api/navidrome/library/${encodeURIComponent(kind)}?${query.toString()}`,
    init,
    'NaviMuse could not load that library view.'
  );
}

export function navidromeLibraryAlbums(params = {}, init = {}) {
  const query = new URLSearchParams(params);
  return libraryReadJson(
    `/api/navidrome/library/albums?${query.toString()}`,
    init,
    'NaviMuse could not load more albums.'
  );
}

export function navidromePlaylists(musicFolderId, init = {}) {
  return apiJson(
    scopedLibraryPath('/api/navidrome/library/playlists', musicFolderId),
    init,
    'NaviMuse could not load playlists.'
  );
}

export function navidromePlaylistDetail(playlistId, init = {}) {
  return apiJson(
    `/api/navidrome/playlists/${encodeURIComponent(playlistId)}`,
    init,
    'NaviMuse could not load that playlist.'
  );
}

export function navidromeRadios(init = {}) {
  return apiJson('/api/navidrome/radios', init, 'NaviMuse could not load radio stations.');
}

export function navidromeGenres(musicFolderId, init = {}) {
  return apiJson(
    scopedLibraryPath('/api/navidrome/library/genres', musicFolderId),
    init,
    'NaviMuse could not load genres.'
  );
}

export function navidromeArtists(musicFolderId, init = {}) {
  return apiJson(
    scopedLibraryPath('/api/navidrome/library/artists', musicFolderId),
    init,
    'NaviMuse could not load artists.'
  );
}

export function navidromeSong(songId, init = {}) {
  return apiJson(`/api/navidrome/songs/${encodeURIComponent(songId)}`, init, 'NaviMuse could not load that shared track.');
}

export function navidromeLyrics(songId, init = {}) {
  return libraryReadJson(`/api/navidrome/lyrics/${encodeURIComponent(songId)}`, init, 'Lyrics are temporarily unavailable.');
}

export function navidromeFeedback(songId, feedback, init = {}) {
  return apiJson(
    `/api/navidrome/feedback/${encodeURIComponent(songId)}`,
    jsonRequest('POST', {
      favorite: Boolean(feedback.favorite),
      rating: Math.max(0, Math.min(5, Number(feedback.rating) || 0))
    }, init),
    'Navidrome rejected the feedback update.'
  );
}

// Version the artwork URL once so previously cached placeholder responses are bypassed.
// Keep the key stable so successful covers retain normal browser caching.
export function coverArtPath(coverArt, size, fallbackSize = '600') {
  const coverSize = ['300', '600', '1000'].includes(String(size)) ? String(size) : String(fallbackSize);
  return coverArt ? apiRequestUrl(`/api/navidrome/cover/${encodeURIComponent(coverArt)}?size=${coverSize}&artwork=v3`) : '';
}

export function streamPath(songId, streamPreference) {
  const params = new URLSearchParams(streamPreference);
  return apiRequestUrl(`/api/navidrome/stream/${encodeURIComponent(songId)}?${params.toString()}`);
}

export function radioStreamPath(stationId) {
  return apiRequestUrl(`/api/navidrome/radios/${encodeURIComponent(stationId)}/stream`);
}

export function createInternetRadio(station, init = {}) {
  return apiJson('/api/navidrome/radios', jsonRequest('POST', station, init), 'Could not add the station. Check your Navidrome permissions.');
}

export function navidromeRadioFeedback(init={}) {
  return libraryReadJson('/api/navidrome/radio-feedback',init,'Could not load saved station feedback.');
}
export function saveRadioFeedback(id,feedback,init={}) {
  return apiJson(`/api/navidrome/radio-feedback/${encodeURIComponent(id)}`,jsonRequest('POST',feedback,{...init,headers:{...init.headers,'x-requested-with':'NaviMuse'}}),'Could not save station feedback.');
}

export function navidromeArtistProfile(id,init={}){return libraryReadJson(`/api/navidrome/artists/${encodeURIComponent(id)}/profile`,init,'Artist details unavailable.');}
