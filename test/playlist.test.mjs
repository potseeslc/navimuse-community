import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fetchPlaylists,
  fetchPlaylistDetail,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  saveSonicRadioPlaylist
} from '../src/playlists.js';

/**
 * Minimal mock fetch that records calls and returns canned responses.
 * Mirrors the `protectedApiFetch` signature: (input, init) => Promise<Response-like>.
 */
function mockFetch(responses) {
  const calls = [];
  const fn = async (input, init) => {
    calls.push({ url: typeof input === 'string' ? input : input.url, init });
    const key = `${init?.method || 'GET'} ${typeof input === 'string' ? input : input.url}`;
    const entry = responses[key] || responses['default'];
    if (!entry) throw new Error(`No mock for ${key}`);
    return {
      ok: entry.ok !== false,
      status: entry.status || (entry.ok !== false ? 200 : 400),
      json: async () => entry.body
    };
  };
  fn.calls = calls;
  return fn;
}

test('fetchPlaylists returns array from BFF payload', async () => {
  const fetchFn = mockFetch({
    'GET /api/navidrome/library/playlists': {
      body: { playlists: [{ id: 'p1', name: 'Mix' }, { id: 'p2', name: 'Road Trip' }] }
    }
  });
  const result = await fetchPlaylists(fetchFn);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Mix');
});

test('fetchPlaylists returns empty array when no playlists key', async () => {
  const fetchFn = mockFetch({
    'GET /api/navidrome/library/playlists': { body: {} }
  });
  const result = await fetchPlaylists(fetchFn);
  assert.deepEqual(result, []);
});

test('fetchPlaylists throws on server error', async () => {
  const fetchFn = mockFetch({
    'GET /api/navidrome/library/playlists': { ok: false, status: 503, body: { error: 'Navidrome credentials are not configured' } }
  });
  await assert.rejects(fetchPlaylists(fetchFn), /Navidrome credentials are not configured/);
});

test('fetchPlaylistDetail requires playlist ID', async () => {
  const fetchFn = mockFetch({});
  await assert.rejects(() => fetchPlaylistDetail(fetchFn, ''), /Playlist ID is required/);
});

test('fetchPlaylistDetail returns playlist with entries', async () => {
  const fetchFn = mockFetch({
    'GET /api/navidrome/playlists/p1': {
      body: { playlist: { id: 'p1', name: 'Mix', entry: [{ id: 's1' }, { id: 's2' }] } }
    }
  });
  const result = await fetchPlaylistDetail(fetchFn, 'p1');
  assert.equal(result.name, 'Mix');
  assert.equal(result.entry.length, 2);
});

test('fetchPlaylistDetail encodes playlist ID', async () => {
  const fetchFn = mockFetch({
    'GET /api/navidrome/playlists/pl%20id': {
      body: { playlist: { id: 'pl id', name: 'X', entry: [] } }
    }
  });
  const result = await fetchPlaylistDetail(fetchFn, 'pl id');
  assert.equal(result.id, 'pl id');
  assert.equal(fetchFn.calls[0].url, '/api/navidrome/playlists/pl%20id');
});

test('createPlaylist sends POST with name and songIds', async () => {
  const fetchFn = mockFetch({
    'POST /api/navidrome/playlists': {
      status: 201,
      body: { ok: true, playlist: { id: 'new1', name: 'My Mix', entry: [] } }
    }
  });
  const result = await createPlaylist(fetchFn, { name: 'My Mix', songIds: ['s1', 's2'] });
  assert.equal(result.id, 'new1');
  assert.equal(fetchFn.calls[0].init.method, 'POST');
  const sent = JSON.parse(fetchFn.calls[0].init.body);
  assert.equal(sent.name, 'My Mix');
  assert.deepEqual(sent.songIds, ['s1', 's2']);
});

test('createPlaylist works without songIds', async () => {
  const fetchFn = mockFetch({
    'POST /api/navidrome/playlists': {
      status: 201,
      body: { ok: true, playlist: { id: 'empty1', name: 'Empty', entry: [] } }
    }
  });
  const result = await createPlaylist(fetchFn, { name: 'Empty' });
  assert.equal(result.id, 'empty1');
  const sent = JSON.parse(fetchFn.calls[0].init.body);
  assert.equal(sent.name, 'Empty');
  assert.equal(sent.songIds, undefined);
});

test('createPlaylist throws on validation error', async () => {
  const fetchFn = mockFetch({
    'POST /api/navidrome/playlists': {
      ok: false, status: 400,
      body: { error: 'Playlist name must be between 1 and 200 characters' }
    }
  });
  await assert.rejects(createPlaylist(fetchFn, { name: '' }), /Playlist name must be between/);
});

test('updatePlaylist sends PATCH with name, append modes, and removeSongIndexes', async () => {
  const fetchFn = mockFetch({
    'PATCH /api/navidrome/playlists/p1': {
      body: { playlist: { id: 'p1', name: 'Renamed', entry: [{ id: 's1' }, { id: 's3' }] } }
    }
  });
  const result = await updatePlaylist(fetchFn, 'p1', {
    name: 'Renamed',
    addSongIds: ['s3'],
    addSongIdsIfMissing: ['s4'],
    removeSongIndexes: [1]
  });
  assert.equal(result.name, 'Renamed');
  assert.equal(fetchFn.calls[0].init.method, 'PATCH');
  const sent = JSON.parse(fetchFn.calls[0].init.body);
  assert.equal(sent.name, 'Renamed');
  assert.deepEqual(sent.addSongIds, ['s3']);
  assert.deepEqual(sent.addSongIdsIfMissing, ['s4']);
  assert.deepEqual(sent.removeSongIndexes, [1]);
});

test('updatePlaylist requires playlist ID', async () => {
  const fetchFn = mockFetch({});
  await assert.rejects(() => updatePlaylist(fetchFn, '', { name: 'X' }), /Playlist ID is required/);
});

test('updatePlaylist can rename only', async () => {
  const fetchFn = mockFetch({
    'PATCH /api/navidrome/playlists/p1': {
      body: { playlist: { id: 'p1', name: 'New Name', entry: [] } }
    }
  });
  const result = await updatePlaylist(fetchFn, 'p1', { name: 'New Name' });
  assert.equal(result.name, 'New Name');
  const sent = JSON.parse(fetchFn.calls[0].init.body);
  assert.equal(sent.name, 'New Name');
  assert.equal(sent.addSongIds, undefined);
  assert.equal(sent.removeSongIndexes, undefined);
});

test('updatePlaylist throws on no changes error', async () => {
  const fetchFn = mockFetch({
    'PATCH /api/navidrome/playlists/p1': {
      ok: false, status: 400,
      body: { error: 'At least one playlist change is required' }
    }
  });
  await assert.rejects(updatePlaylist(fetchFn, 'p1', {}), /At least one playlist change is required/);
});

test('deletePlaylist sends DELETE and returns confirmation', async () => {
  const fetchFn = mockFetch({
    'DELETE /api/navidrome/playlists/p1': {
      body: { ok: true, deleted: true, playlistId: 'p1' }
    }
  });
  const result = await deletePlaylist(fetchFn, 'p1');
  assert.equal(result.deleted, true);
  assert.equal(result.playlistId, 'p1');
  assert.equal(fetchFn.calls[0].init.method, 'DELETE');
});

test('deletePlaylist requires playlist ID', async () => {
  const fetchFn = mockFetch({});
  await assert.rejects(() => deletePlaylist(fetchFn, ''), /Playlist ID is required/);
});

test('deletePlaylist throws on not found', async () => {
  const fetchFn = mockFetch({
    'DELETE /api/navidrome/playlists/missing': {
      ok: false, status: 404,
      body: { error: 'Playlist not found' }
    }
  });
  await assert.rejects(deletePlaylist(fetchFn, 'missing'), /Playlist not found/);
});

test('saveSonicRadioPlaylist dedupes playedIds and creates playlist', async () => {
  const fetchFn = mockFetch({
    'POST /api/navidrome/playlists': {
      status: 201,
      body: { ok: true, playlist: { id: 'radio-1', name: 'Sonic Radio: Artist X', entry: [] } }
    }
  });
  const result = await saveSonicRadioPlaylist(fetchFn, 'Sonic Radio: Artist X', ['s1', 's2', 's1', '', 's3', 's2']);
  assert.equal(result.id, 'radio-1');
  const sent = JSON.parse(fetchFn.calls[0].init.body);
  assert.deepEqual(sent.songIds, ['s1', 's2', 's3']);
});

test('saveSonicRadioPlaylist handles empty playedIds', async () => {
  const fetchFn = mockFetch({
    'POST /api/navidrome/playlists': {
      status: 201,
      body: { ok: true, playlist: { id: 'empty-radio', name: 'Sonic Radio', entry: [] } }
    }
  });
  const result = await saveSonicRadioPlaylist(fetchFn, 'Sonic Radio', []);
  assert.equal(result.id, 'empty-radio');
  const sent = JSON.parse(fetchFn.calls[0].init.body);
  assert.deepEqual(sent.songIds, []);
});

test('playlist adapter functions handle non-JSON error responses', async () => {
  const fetchFn = async () => ({
    ok: false,
    status: 500,
    json: async () => { throw new Error('parse error'); }
  });
  await assert.rejects(fetchPlaylists(fetchFn), /Could not load playlists/);
  await assert.rejects(fetchPlaylistDetail(fetchFn, 'p1'), /Could not load playlist/);
  await assert.rejects(createPlaylist(fetchFn, { name: 'X' }), /Could not create playlist/);
  await assert.rejects(updatePlaylist(fetchFn, 'p1', { name: 'X' }), /Could not update playlist/);
  await assert.rejects(deletePlaylist(fetchFn, 'p1'), /Could not delete playlist/);
});
