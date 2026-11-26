import test from 'node:test';
import assert from 'node:assert/strict';
import { activeLyricsLineIndex, lyricsSeekRatio } from '../src/lyrics.js';

const lines = [
  { startMs: 1_000, value: 'First' },
  { startMs: 3_000, value: 'Second' },
  { startMs: 5_000, value: 'Third' }
];

test('activeLyricsLineIndex follows timestamp boundaries and applies source offsets', () => {
  assert.equal(activeLyricsLineIndex(lines, 0.9), -1);
  assert.equal(activeLyricsLineIndex(lines, 1), 0);
  assert.equal(activeLyricsLineIndex(lines, 4.2), 1);
  assert.equal(activeLyricsLineIndex(lines, 4.9, -200), 2);
  assert.equal(activeLyricsLineIndex([], 10), -1);
});

test('lyricsSeekRatio clamps synchronized line seeks and rejects unknown durations', () => {
  assert.equal(lyricsSeekRatio(lines[1], 10), 0.3);
  assert.equal(lyricsSeekRatio({ startMs: 20_000 }, 10), 1);
  assert.equal(lyricsSeekRatio({ startMs: 0 }, 10, -500), 0);
  assert.equal(lyricsSeekRatio(lines[0], 0), null);
  assert.equal(lyricsSeekRatio({ startMs: null }, 10), null);
});
