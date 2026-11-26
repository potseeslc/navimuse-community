import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const planner = await readFile(new URL('../src/AtlasJourneyPlanner.jsx', import.meta.url), 'utf8');
const sonic = await readFile(new URL('../src/sonicSettingsSurfaces.jsx', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

const between = (start, end) => planner.slice(planner.indexOf(start), planner.indexOf(end, planner.indexOf(start)));

test('planner searches and selects exactly one destination from the active library', () => {
  assert.match(planner, /navidromeSearch\(trimmed, libraryKey, \{ signal: controller\.signal \}\)/);
  assert.match(planner, /invalidatePreview\(\)/);
  assert.match(planner, /journey\.cancelPreview\(\)/);
  assert.match(planner, /setDestination\(song\)/);
  assert.match(planner, /setDestination\(null\)/);
  assert.match(planner, /String\(song\.id\) !== String\(nowPlaying\?\.id\)/);
  assert.match(planner, /aria-label="Destination song results"/);
});

test('explicit preview resolves stable track IDs before requesting the bounded plan', () => {
  const preview = between('const previewJourney = async', 'const startJourney =');
  assert.match(preview, /resolveAtlasTrackPoints\(knownStartPointId \? \[destinationId\] : \[startId, destinationId\], \{ requestId, signal: controller\.signal \}\)/);
  assert.match(preview, /await journey\.plan\(\{/);
  assert.match(preview, /waypoints: knownStartPointId \? \[knownStartPointId, resolved\.points\[0\]\.pointId\] : resolved\.points\.map\(\(point\) => point\.pointId\)/);
  assert.match(planner, /stop\.queueItemId === journey\.state\.currentQueueItemId/);
  assert.match(planner, /const knownStartPointId = activeCurrentStop\?\.pointId \|\| currentAtlasPointId/);
  assert.match(main, /currentAtlasPointId=\{playQueue\.items\?\.\[playQueue\.index\]\?\.atlas\?\.pointId \|\| ''\}/);
  assert.match(preview, /targetTrackCount/);
  assert.match(planner, /type="range" min=\{MIN_TRACKS\} max=\{MAX_TRACKS\}/);
  assert.match(planner, /const DEFAULT_TRACKS = 25/);
});

test('starting is explicit, does not directly play, and detach remains available', () => {
  const start = between('const startJourney =', 'return (');
  assert.match(start, /journey\.start\(\)/);
  assert.doesNotMatch(start, /play|audio|onPlay/i);
  assert.match(planner, /active \? 'Reroute Journey' : 'Start Journey'/);
  assert.match(planner, /onClick=\{journey\.detach\}>Detach Journey/);
});

test('preview and restored states expose truthful counts, short routes, errors, and ordered stops', () => {
  assert.match(planner, /Requested \{requestedCount\} tracks · Actual \{actualCount\} ordered stops/);
  assert.match(planner, /segment\.returnedTrackCount < segment\.targetTrackCount/);
  assert.match(planner, /role="alert"/);
  assert.match(planner, /aria-live="polite"/);
  assert.match(planner, /<ol>/);
  assert.match(planner, /stop\.playback\.title/);
  assert.match(planner, /Active Journey restored and attached/);
  assert.match(planner, /Restored Journey is detached/);
  assert.match(planner, /Latest route event:/);
});

test('an active Journey previews destination changes before a truthful reroute', () => {
  assert.match(planner, /active \? 'Preview reroute' : 'Preview Journey'/);
  assert.match(planner, /active \? 'Reroute Journey' : 'Start Journey'/);
  assert.match(planner, /latestEvent\.type\.replaceAll/);
});
