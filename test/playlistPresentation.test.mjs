import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playablePlaylistEntries, playlistDurationSeconds, playlistPlaybackPlan, samePlaylistEntryOrder, trackDurationSeconds } from '../src/playlistPresentation.js';

test('playlist duration totals finite positive seconds and ignores malformed metadata', () => {
  assert.equal(playlistDurationSeconds([
    { duration: 120 },
    { duration: '61.5' },
    { duration: '' },
    { duration: '4:49' },
    { duration: Number.NaN },
    { duration: -12 },
    null
  ]), 470.5);
});

test('track duration accepts seconds and normalizes clock strings', () => {
  assert.equal(trackDurationSeconds('4:49'), 289);
  assert.equal(trackDurationSeconds('1:02:03'), 3723);
  assert.equal(trackDurationSeconds('1:99'), 159);
  assert.equal(trackDurationSeconds('not-a-duration'), 0);
});

test('playlist duration is stable for missing entries', () => {
  assert.equal(playlistDurationSeconds(), 0);
  assert.equal(playlistDurationSeconds([]), 0);
});

test('playable playlist entries require an explicit array of object tracks with IDs', () => {
  const valid = { id: 'song-1', title: 'Midnight Signal' };
  assert.deepEqual(playablePlaylistEntries([valid, null, {}, { id: '  ' }, 'song-2']), [valid]);
  assert.deepEqual(playablePlaylistEntries({ entry: [valid] }), []);
  assert.deepEqual(playablePlaylistEntries(), []);
});

test('shuffled playlist playback starts at the first song in the preserved shuffled queue', () => {
  const entries = [
    { id: 'song-1', title: 'Midnight Signal' },
    { id: 'song-2', title: 'Neon Static' },
    { id: 'song-3', title: 'Last Light' }
  ];
  const plan = playlistPlaybackPlan(entries, true, (songs) => songs.reverse());

  assert.deepEqual(plan.queueSongs.map((song) => song.id), ['song-3', 'song-2', 'song-1']);
  assert.equal(plan.firstSong.id, 'song-3');
  assert.equal(plan.queueIndex, 0);
  assert.deepEqual(entries.map((song) => song.id), ['song-1', 'song-2', 'song-3']);
});

test('playlist playback plan rejects empty and malformed queues', () => {
  assert.equal(playlistPlaybackPlan([], false), null);
  assert.equal(playlistPlaybackPlan([{ title: 'Missing ID' }], true, (songs) => songs), null);
});

test('selected playlist occurrence preserves order and maps past invalid entries', () => {
  const duplicate = {id:'same',title:'Repeated song'};
  const entries = [{title:'Unavailable'},duplicate,{id:'middle'},duplicate,{id:'last'}];
  const plan = playlistPlaybackPlan(entries,false,undefined,3);
  assert.equal(plan.firstSong,duplicate);
  assert.equal(plan.queueIndex,2);
  assert.deepEqual(plan.queueSongs.map(song=>song.id),['same','middle','same','last']);
  for (const index of [0,-1,1.5,9]) assert.equal(playlistPlaybackPlan(entries,false,undefined,index),null);
  assert.equal(entries.length,5);
});

test('positional playlist edits reject changed order, length and missing identities', () => {
  const entries = [{id: 'a'}, {id: 'b'}, {id: 'a'}, {id: 'c'}];
  assert.equal(samePlaylistEntryOrder(entries, entries.map(entry => ({...entry, title: 'Updated metadata'}))), true);
  assert.equal(samePlaylistEntryOrder(entries, [entries[0], entries[3], entries[2], entries[1]]), false);
  assert.equal(samePlaylistEntryOrder(entries, [...entries, {id: 'a'}]), false);
  assert.equal(samePlaylistEntryOrder(entries, entries.slice(1)), false);
  assert.equal(samePlaylistEntryOrder([{}], [{}]), false);
  assert.equal(samePlaylistEntryOrder(entries, null), false);
});
