import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const playerChromeSource = await readFile(new URL('../src/playerChrome.jsx', import.meta.url), 'utf8');
const librarySearchSource = await readFile(new URL('../src/librarySearchSurfaces.jsx', import.meta.url), 'utf8');

test('playlist picker is a modal dialog reachable from track actions', () => {
  assert.match(playerChromeSource, /function PlaylistPicker\(/);
  assert.match(playerChromeSource, /role="dialog" aria-modal="true"/);
  assert.match(playerChromeSource, />Add to Playlist\.\.\.<\/button>/);
  assert.match(playerChromeSource, /querySelectorAll\('button:not\(:disabled\), input:not\(:disabled\)'\)/);
  assert.match(playerChromeSource, /event\.stopImmediatePropagation\(\)/);
});

test('playlist manager wires create rename remove and delete operations', () => {
  assert.match(librarySearchSource, /function PlaylistManager\(/);
  assert.match(librarySearchSource, /createPlaylist\(protectedApiFetch, \{ name \}\)/);
  assert.match(librarySearchSource, /updatePlaylist\(protectedApiFetch, detail\.id, \{ name \}\)/);
  assert.match(librarySearchSource, /removeSongIndexes: \[trackIndex\]/);
  assert.match(librarySearchSource, /deletePlaylist\(protectedApiFetch, detail\.id\)/);
  assert.match(librarySearchSource, /className="playlist-delete-confirmation" role="group"/);
  assert.match(librarySearchSource, /onClick=\{\(\) => setDeleteConfirming\(true\)\}/);
  assert.doesNotMatch(librarySearchSource, /window\.confirm/);
});

test('playlist detail exposes real ordered and shuffled playback from fetched entries', () => {
  assert.match(mainSource, /const playPlaylist = \(playlistEntries, shouldShuffle = false, playlist = null, selectedIndex = null\)/);
  assert.match(mainSource, /playlistPlaybackPlan\(playlistEntries, shouldShuffle, shuffled, selectedIndex\)/);
  assert.match(mainSource, /queueSongs: playbackPlan\.queueSongs/);
  assert.match(mainSource, /queueIndex: playbackPlan\.queueIndex/);
  assert.match(librarySearchSource, /onPlayPlaylist\?\.\(entries, false, detail\)/);
  assert.match(librarySearchSource, /onPlayPlaylist\?\.\(entries, true, detail\)/);
  assert.match(librarySearchSource, /role="table"/);
});

test('playlist removal refreshes and validates the positional entry before writing', () => {
  assert.match(librarySearchSource, /const latest = await fetchPlaylistDetail\(protectedApiFetch, detail\.id\)/);
  assert.match(librarySearchSource, /String\(latestEntry\.id\) !== String\(song\?\.id\)/);
  assert.match(librarySearchSource, /This playlist changed elsewhere\. Review the refreshed tracks and try again\./);
});

test('playlist mutations invalidate Library caches', () => {
  assert.match(mainSource, /setPlaylistRevision\(\(current\) => current \+ 1\)/);
  assert.match(librarySearchSource, /\[albumSort, browseKey, libraryKey, playlistRevision, remoteBrowse, browseAttempt\]/);
});
