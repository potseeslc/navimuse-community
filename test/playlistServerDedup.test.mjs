import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingPlaylistSongIds } from '../server.mjs';

test('playlist add-if-missing returns no IDs when every candidate is present', () => {
  const playlist = { entry: [{ id: 'song-a' }, { id: 'song-c' }] };
  assert.deepEqual(missingPlaylistSongIds(playlist, ['song-a', 'song-c']), []);
});

test('playlist add-if-missing returns every candidate for an empty playlist', () => {
  assert.deepEqual(missingPlaylistSongIds({ entry: [] }, ['song-a', 'song-b']), ['song-a', 'song-b']);
});

test('playlist add-if-missing filters a mixed set and preserves missing order', () => {
  const playlist = { entry: [{ id: 'song-a' }, { id: 'song-c' }] };
  assert.deepEqual(
    missingPlaylistSongIds(playlist, ['song-a', 'song-b', 'song-c', 'song-d']),
    ['song-b', 'song-d']
  );
});

test('playlist add-if-missing treats an absent entry payload as empty', () => {
  assert.deepEqual(missingPlaylistSongIds({}, ['song-a']), ['song-a']);
});

test('playlist add-if-missing normalizes a scalar entry payload', () => {
  assert.deepEqual(missingPlaylistSongIds({ entry: { id: 'song-a' } }, ['song-a', 'song-b']), ['song-b']);
});
