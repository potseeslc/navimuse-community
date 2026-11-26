import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const main = source('main.jsx');
const library = source('librarySearchSurfaces.jsx');
const sonic = source('sonicSettingsSurfaces.jsx');
const home = source('homeSurface.jsx');
const player = source('playerChrome.jsx');
const atlas = source('AtlasOverview.jsx');

test('one shared additive action pair reaches every supported track-bearing surface', () => {
  assert.match(main, /const playTrackNext = useCallback/);
  assert.match(main, /const addTrackToQueue = useCallback/);
  assert.match(main, /<HomeSurface[\s\S]*?onPlayNext=\{playTrackNext\}[\s\S]*?onAddToQueue=\{addTrackToQueue\}/);
  assert.match(main, /<LibrarySurface[\s\S]*?onPlayNext=\{playTrackNext\}[\s\S]*?onAddToQueue=\{addTrackToQueue\}/);
  assert.match(main, /<SearchSurface[\s\S]*?onPlayNext=\{playTrackNext\}[\s\S]*?onAddToQueue=\{addTrackToQueue\}/);
  assert.match(main, /<SonicSurface[\s\S]*?onPlayNext=\{playTrackNext\}[\s\S]*?onAddToQueue=\{addTrackToQueue\}/);
  assert.match(main, /<PlayerSheet[\s\S]*?onPlayNext=\{playTrackNext\}[\s\S]*?onAddToQueue=\{addTrackToQueue\}/);
  assert.match(library, /<TrackQueueActions[^>]*onPlayNext=\{onPlayNext\}[^>]*onAddToQueue=\{onAddToQueue\}/);
  assert.match(sonic, /<TrackQueueActions[^>]*onPlayNext=\{onPlayNext\}[^>]*onAddToQueue=\{onAddToQueue\}/);
  assert.match(home, /<DiscoveryResults[\s\S]*?onAddToQueue=\{onAddToQueue\}[\s\S]*?onPlayNext=\{onPlayNext\}/);
  assert.match(player, />Play next<\/button>/);
  assert.match(player, />Add to queue<\/button>/);
  assert.match(atlas, /Journey order is locked\. Detach the Journey before adding tracks\./);
  assert.match(atlas, /disabled aria-describedby="atlas-queue-action-reason">Play next/);
  assert.match(atlas, /disabled aria-describedby="atlas-queue-action-reason">Add to queue/);
});

test('search queue sources stay generic and additive actions cannot mutate an attached Journey', () => {
  assert.match(main, /kind: 'search', label: 'Search results'/);
  assert.doesNotMatch(main, /kind: 'search'[\s\S]{0,120}query/);
  assert.match(main, /Journey order is locked\. Detach the Journey before adding tracks\./);
  assert.match(main, /cancelTransitionRef\.current\(\);[\s\S]*?will play next/);
});
