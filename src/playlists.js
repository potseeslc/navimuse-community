/**
 * Client-side playlist adapter for NaviMuse BFF endpoints.
 *
 * All functions use `protectedApiFetch` (or a compatible fetch) so that 401
 * responses trigger the session-required event.  Every function throws an
 * Error with a human-readable `.message` on failure — callers should catch
 * and surface the message rather than swallowing.
 */

/**
 * Fetch the full playlist list from the BFF.
 * @param {function} fetchFn - protectedApiFetch or compatible
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<object>>} array of playlist summaries
 */
export async function fetchPlaylists(fetchFn, signal) {
  const response = await fetchFn('/api/navidrome/library/playlists', { signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not load playlists');
  return payload.playlists || [];
}

/**
 * Fetch a single playlist with its entries.
 * @param {function} fetchFn
 * @param {string} playlistId
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} playlist detail { id, name, entry, ... }
 */
export async function fetchPlaylistDetail(fetchFn, playlistId, signal) {
  if (!playlistId) throw new Error('Playlist ID is required');
  const response = await fetchFn(`/api/navidrome/playlists/${encodeURIComponent(playlistId)}`, { signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not load playlist');
  return payload.playlist || null;
}

/**
 * Create a new playlist via the BFF.
 * @param {function} fetchFn
 * @param {object} options
 * @param {string} options.name - playlist name (1–200 chars)
 * @param {string[]} [options.songIds] - initial song IDs (deduped server-side)
 * @returns {Promise<object>} created playlist { id, name, entry, ... }
 */
export async function createPlaylist(fetchFn, { name, songIds } = {}) {
  const body = { name };
  if (songIds) body.songIds = songIds;
  const response = await fetchFn('/api/navidrome/playlists', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not create playlist');
  return payload.playlist || null;
}

/**
 * Update a playlist: rename, add songs, and/or remove songs by index.
 * At least one change must be provided.
 * @param {function} fetchFn
 * @param {string} playlistId
 * @param {object} options
 * @param {string} [options.name] - new name
 * @param {string[]} [options.addSongIds] - song IDs to append
 * @param {string[]} [options.addSongIdsIfMissing] - song IDs to append only when absent
 * @param {number[]} [options.removeSongIndexes] - zero-based indexes to remove
 * @returns {Promise<object>} updated playlist detail
 */
export async function updatePlaylist(fetchFn, playlistId, { name, addSongIds, addSongIdsIfMissing, removeSongIndexes } = {}) {
  if (!playlistId) throw new Error('Playlist ID is required');
  const body = {};
  if (name !== undefined) body.name = name;
  if (addSongIds !== undefined) body.addSongIds = addSongIds;
  if (addSongIdsIfMissing !== undefined) body.addSongIdsIfMissing = addSongIdsIfMissing;
  if (removeSongIndexes !== undefined) body.removeSongIndexes = removeSongIndexes;
  const response = await fetchFn(`/api/navidrome/playlists/${encodeURIComponent(playlistId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not update playlist');
  return payload.playlist || null;
}

/**
 * Delete a playlist permanently.
 * @param {function} fetchFn
 * @param {string} playlistId
 * @returns {Promise<object>} { ok, deleted, playlistId }
 */
export async function deletePlaylist(fetchFn, playlistId) {
  if (!playlistId) throw new Error('Playlist ID is required');
  const response = await fetchFn(`/api/navidrome/playlists/${encodeURIComponent(playlistId)}`, {
    method: 'DELETE',
    headers: { 'x-requested-with': 'NaviMuse' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not delete playlist');
  return { ok: true, deleted: true, playlistId };
}

/**
 * Save a collection of played song IDs as a new playlist.
 * Convenience wrapper used by #75 Sonic Radio "Save as Playlist".
 * Dedupes the IDs while preserving order.
 * @param {function} fetchFn
 * @param {string} name - playlist name
 * @param {string[]} playedIds - song IDs to include
 * @returns {Promise<object>} created playlist
 */
export async function saveSonicRadioPlaylist(fetchFn, name, playedIds = []) {
  const deduped = [...new Set(playedIds.filter(Boolean))];
  return createPlaylist(fetchFn, { name, songIds: deduped });
}

/** Move one saved occurrence through the reviewed BFF contract; never retry writes. */
export async function reorderPlaylist(fetchFn, playlistId, entries, from, to) {
  if (!playlistId || !Array.isArray(entries) || entries.length < 2 || entries.length > 10000 ||
      !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= entries.length || to >= entries.length || from === to) {
    throw new Error('Choose two valid playlist positions to reorder.');
  }
  const expectedSongIds = entries.map(entry => String(entry?.id || ''));
  if (expectedSongIds.some(id => !id.trim())) throw new Error('Refresh this playlist before reordering unavailable tracks.');
  const order = entries.map((_, index) => index);
  order.splice(to, 0, order.splice(from, 1)[0]);
  const response = await fetchFn(`/api/navidrome/playlists/${encodeURIComponent(playlistId)}`, {
    method: 'PATCH', headers: {'content-type':'application/json','x-requested-with':'NaviMuse'},
    body: JSON.stringify({reorder:{version:1,expectedSongIds,order}})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || 'The playlist order could not be saved. Refresh before trying again.'), {status:response.status});
  if (!payload.playlist || String(payload.playlist.id) !== String(playlistId) || !Array.isArray(payload.playlist.entry) ||
      payload.playlist.entry.length !== order.length || payload.playlist.entry.some((entry,index) => String(entry?.id || '') !== expectedSongIds[order[index]])) {
    throw new Error('The saved order was not confirmed. Refresh before trying again.');
  }
  return payload.playlist;
}
