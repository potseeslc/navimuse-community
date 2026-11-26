import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  continuationCapabilities,
  defaultContinuationPreferences,
  defaultTransitionPreferences,
  journeyExtensionEnabled,
  normalizeContinuationPreferences,
  normalizeTransitionPreferences
} from '../shared/playbackPreferences.js';

test('continuation preferences freeze conservative independent defaults', () => {
  assert.deepEqual(defaultContinuationPreferences, {
    continueThroughQueue: true,
    extendJourneysAutomatically: true,
    autoplayAfterQueue: false
  });
  assert.deepEqual(continuationCapabilities, {
    sonicJourneyExtension: true,
    atlasJourneyExtension: true,
    ordinaryAutoplay: true
  });
});

test('transition preferences migrate the inert gapless flag and clamp blend duration', () => {
  assert.deepEqual(defaultTransitionPreferences, { transitionStyle: 'smart', smartBlendSeconds: 4, gaplessAlbums:false });
  assert.deepEqual(normalizeTransitionPreferences({ gapless: false }), { transitionStyle: 'preserve', smartBlendSeconds: 4, gaplessAlbums:false });
  assert.deepEqual(normalizeTransitionPreferences({ gapless: true }), { transitionStyle: 'smart', smartBlendSeconds: 4, gaplessAlbums:false });
  assert.deepEqual(normalizeTransitionPreferences({ transitionStyle: 'crossfade', smartBlendSeconds: 99 }), { transitionStyle: 'crossfade', smartBlendSeconds: 12, gaplessAlbums:false });
  assert.deepEqual(normalizeTransitionPreferences({ transitionStyle: 'invalid', smartBlendSeconds: 0 }), { transitionStyle: 'smart', smartBlendSeconds: 1, gaplessAlbums:false });
});

test('legacy continuousQueue migrates only the committed-queue policy', () => {
  assert.deepEqual(normalizeContinuationPreferences({ continuousQueue: false }), {
    continueThroughQueue: false,
    extendJourneysAutomatically: true,
    autoplayAfterQueue: false
  });
  assert.equal(normalizeContinuationPreferences({
    continuousQueue: false,
    continueThroughQueue: true,
    extendJourneysAutomatically: false
  }).continueThroughQueue, true);
  assert.deepEqual(normalizeContinuationPreferences(null), defaultContinuationPreferences);
  assert.deepEqual(normalizeContinuationPreferences('malformed'), defaultContinuationPreferences);
});

test('ordinary autoplay fails closed while no provider capability exists', () => {
  assert.equal(normalizeContinuationPreferences({ autoplayAfterQueue: true }).autoplayAfterQueue, true);
  assert.equal(journeyExtensionEnabled({ playback: { extendJourneysAutomatically: false } }), false);
  assert.equal(journeyExtensionEnabled({}), true);
});
