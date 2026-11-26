import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATLAS_EXTENSION_MIN_UPCOMING_STOPS,
  ATLAS_EXTENSION_RUNWAY_SECONDS,
  atlasJourneyRunway
} from '../src/atlasContinuation.js';

const item = duration => ({ song: { duration } });

test('Atlas runway extends near the committed tail without firing for an inactive queue', () => {
  assert.deepEqual(atlasJourneyRunway({ items: [], index: -1 }), {
    upcomingStops: 0,
    upcomingDurationSeconds: 0,
    needsExtension: false,
    atFinalStop: false
  });
  const nearTail = atlasJourneyRunway({ items: [item(300), item(300), item(300)], index: 0 });
  assert.equal(nearTail.upcomingStops, ATLAS_EXTENSION_MIN_UPCOMING_STOPS);
  assert.equal(nearTail.needsExtension, true);
  assert.equal(atlasJourneyRunway({ items: [item(300)], index: 0 }).atFinalStop, true);
});

test('Atlas runway uses known remaining duration as a second extension trigger', () => {
  const short = atlasJourneyRunway({ items: [item(300), item(200), item(200), item(200), item(200)], index: 0 });
  assert.equal(short.upcomingStops, 4);
  assert.equal(short.upcomingDurationSeconds, 800);
  assert.equal(short.needsExtension, false);
  const withinWindow = atlasJourneyRunway({ items: [item(300), item(150), item(150), item(150), item(150)], index: 0 });
  assert.equal(withinWindow.upcomingDurationSeconds, ATLAS_EXTENSION_RUNWAY_SECONDS);
  assert.equal(withinWindow.needsExtension, true);
});

test('automatic Atlas extension attempts only once per frozen revision', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /const attemptKey = `\$\{journey\.journeyId\}:\$\{journey\.frozenRevision\}`/);
  assert.doesNotMatch(source, /const attemptKey = `[^`]*playQueue\.index/);
});
