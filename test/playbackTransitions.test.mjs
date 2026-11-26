import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSITION_MODE,
  SWEET_FADE_MICRO_SECONDS,
  canUsePreparedDeck,
  effectiveSweetFadeSeconds,
  shouldPrepareTransition,
  shouldStartSweetFade,
  sweetFadeSeconds,
  transitionDeckVolumes,
  transitionDecisionFor,
  transitionEventForDecision,
  transitionEventState,
  TRANSITION_EVENT,
  transitionModeFor
} from '../src/playbackTransitions.js';

const track = (id, duration = 180, extra = {}) => ({ id, duration, ...extra });
const item = (id, duration = 180, extra = {}) => ({ queueItemId: `queue-${id}`, song: track(id, duration, extra) });

test('web transition decisions preserve authored album boundaries without claiming unproven gapless playback', () => {
  const decision = transitionDecisionFor({
    queueRevision: 7,
    context: 'album',
    outgoingItem: item('a', 180, { albumId: 'album-1', discNumber: 1, track: 2 }),
    incomingItem: item('b', 180, { albumId: 'album-1', discNumber: 1, track: 3 })
  });
  assert.deepEqual(decision.pair, { outgoingQueueItemId: 'queue-a', incomingQueueItemId: 'queue-b' });
  assert.equal(decision.queueRevision, 7);
  assert.equal(decision.mode, TRANSITION_MODE.HARD);
  assert.equal(decision.reasonCode, 'adapter-gapless-unverified');
  assert.equal(decision.degradedFrom, TRANSITION_MODE.GAPLESS);
  assert.equal(decision.durationMs, 0);
  assert.equal(decision.incomingOffsetMs, 0);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.pair), true);

  const accepted = transitionDecisionFor({
    queueRevision: 8,
    outgoingItem: item('a', 180, { albumId: 'album-1', track: 2 }),
    incomingItem: item('b', 180, { albumId: 'album-1', track: 3 }),
    capabilities: { authoredGapless: true }
  });
  assert.equal(accepted.mode, TRANSITION_MODE.GAPLESS);
  assert.equal(accepted.reasonCode, 'authored-album-pair');
});

test('Smart Blend is deterministic for prepared mixed contexts', () => {
  const playlist = transitionDecisionFor({
    queueRevision: 3,
    context: 'playlist',
    outgoingItem: item('a'),
    incomingItem: item('b'),
    preferences: { transitionStyle: 'smart', smartBlendSeconds: 4 }
  });
  assert.equal(playlist.mode, TRANSITION_MODE.SWEET_FADE);
  assert.equal(playlist.durationMs, 4000);
  assert.equal(playlist.curve, 'equal-power');
  assert.equal(playlist.requiredReadiness, 'can-play');
  assert.equal(playlist.reasonCode, 'mixed-context');
  assert.equal(transitionModeFor({ sessionKind: 'journey', currentTrack: track('a'), nextTrack: track('b') }), TRANSITION_MODE.SWEET_FADE);
  assert.equal(transitionModeFor({ sessionKind: 'artist-dj', currentTrack: track('a'), nextTrack: track('b') }), TRANSITION_MODE.SWEET_FADE);
});

test('standard transitions name every non-overlap and degraded reason', () => {
  assert.equal(transitionModeFor({ repeat: true, currentTrack: track('a'), nextTrack: track('b') }), TRANSITION_MODE.HARD);
  assert.equal(transitionModeFor({ currentTrack: track('radio:one'), nextTrack: track('b') }), TRANSITION_MODE.HARD);
  assert.equal(transitionModeFor({ sessionKind: 'journey', currentTrack: track('a', 0), nextTrack: track('b') }), TRANSITION_MODE.HARD);
  assert.equal(transitionModeFor({ sessionKind: 'journey', currentTrack: track('a', 10), nextTrack: track('b') }), TRANSITION_MODE.HARD);
  assert.equal(transitionDecisionFor({ outgoingItem: item('a'), incomingItem: item('b'), manual: true }).reasonCode, 'manual-boundary');
  assert.equal(transitionDecisionFor({ outgoingItem: item('a'), incomingItem: item('b'), preferences: { transitionStyle: 'preserve' } }).reasonCode, 'preference-preserve');
  assert.equal(transitionDecisionFor({ outgoingItem: item('a', 0), incomingItem: item('b') }).reasonCode, 'duration-unknown');
  assert.equal(transitionDecisionFor({ outgoingItem: item('a', 8), incomingItem: item('b') }).reasonCode, 'track-too-short');
  assert.equal(transitionDecisionFor({ outgoingItem: item('a', 180, { albumId: 'album-1', discNumber: 1 }), incomingItem: item('b', 180, { albumId: 'album-1', discNumber: 2 }) }).reasonCode, 'disc-boundary');
});

test('fixed crossfade uses the accepted bounded duration and fails closed without capability', () => {
  const fixed = transitionDecisionFor({ outgoingItem: item('a'), incomingItem: item('b'), preferences: { transitionStyle: 'crossfade', smartBlendSeconds: 8 } });
  assert.equal(fixed.mode, TRANSITION_MODE.FIXED_CROSSFADE);
  assert.equal(fixed.durationMs, 8000);
  const unavailable = transitionDecisionFor({ outgoingItem: item('a'), incomingItem: item('b'), preferences: { transitionStyle: 'crossfade' }, capabilities: { fixedCrossfade: false } });
  assert.equal(unavailable.mode, TRANSITION_MODE.HARD);
  assert.equal(unavailable.reasonCode, 'adapter-capability-unavailable');
  assert.equal(unavailable.degradedFrom, TRANSITION_MODE.FIXED_CROSSFADE);
});

test('transition events stay bound to the decision queue revision and ignore stale outcomes', () => {
  const decision = transitionDecisionFor({ queueRevision: 12, outgoingItem: item('a'), incomingItem: item('b') });
  const requested = transitionEventForDecision(decision, TRANSITION_EVENT.REQUESTED);
  const ready = transitionEventForDecision(decision, TRANSITION_EVENT.READY);
  assert.deepEqual(requested, {
    type: 'requested',
    queueRevision: 12,
    pair: decision.pair,
    mode: TRANSITION_MODE.SWEET_FADE,
    reasonCode: 'mixed-context'
  });
  assert.equal(Object.isFrozen(requested), true);
  assert.equal(transitionEventForDecision(decision, 'invented'), null);
  assert.equal(transitionEventForDecision(decision, TRANSITION_EVENT.READY, { queueRevision: 13 }), null);
  assert.strictEqual(transitionEventState(requested, ready, 13), requested);
  assert.strictEqual(transitionEventState(requested, ready, 12), ready);
});

test('Sweet Fade duration is bounded by both tracks', () => {
  assert.equal(sweetFadeSeconds(180, 180), 4);
  assert.equal(sweetFadeSeconds(12, 180, 6), 4);
  assert.equal(sweetFadeSeconds(180, 12), 4);
  assert.equal(sweetFadeSeconds(180, 12, 2), 2);
  assert.equal(sweetFadeSeconds(0, 180), 0);
});

test('preload and fade scheduling happen before natural end only', () => {
  assert.equal(shouldPrepareTransition({ mode: TRANSITION_MODE.GAPLESS, currentTime: 150, duration: 180 }), true);
  assert.equal(shouldPrepareTransition({ mode: TRANSITION_MODE.HARD, currentTime: 150, duration: 180 }), false);
  assert.equal(shouldPrepareTransition({ mode: TRANSITION_MODE.GAPLESS, currentTime: 180, duration: 180 }), false);
  assert.equal(shouldStartSweetFade({ currentTime: 176, duration: 180, fadeSeconds: 4 }), true);
  assert.equal(shouldStartSweetFade({ currentTime: 175.9, duration: 180, fadeSeconds: 4 }), false);
  assert.equal(shouldStartSweetFade({ currentTime: 180, duration: 180, fadeSeconds: 4 }), false);
  assert.equal(effectiveSweetFadeSeconds({ currentTime: 178, duration: 180, fadeSeconds: 4 }), 2);
  assert.equal(effectiveSweetFadeSeconds({ currentTime: 176, duration: 180, fadeSeconds: 4 }), 4);
  assert.equal(effectiveSweetFadeSeconds({ currentTime: 180, duration: 180, fadeSeconds: 4 }), 0);
});

test('prepared deck requires the expected source to be ready through', () => {
  assert.equal(canUsePreparedDeck({ expectedUrl: '/stream/b', actualUrl: 'https://music.example/stream/b', readyState: 4, baseHref: 'https://music.example/app' }), true);
  assert.equal(canUsePreparedDeck({ expectedUrl: '/api/navidrome/stream/song-1?format=mp3&maxBitRate=320', actualUrl: 'https://music.example/api/navidrome/stream/song-1?maxBitRate=320&format=mp3', readyState: 3, baseHref: 'https://music.example/app' }), true);
  assert.equal(canUsePreparedDeck({ expectedUrl: '/api/navidrome/stream/song-1?format=mp3', actualUrl: 'https://music.example/api/navidrome/stream/song-1?format=mp3&maxBitRate=320', readyState: 3, baseHref: 'https://music.example/app' }), true);
  assert.equal(canUsePreparedDeck({ expectedUrl: '/stream/b', actualUrl: 'http://localhost/stream/c', readyState: 4 }), false);
  assert.equal(canUsePreparedDeck({ expectedUrl: '/stream/b?x=1', actualUrl: 'http://localhost/stream/b?y=2', readyState: 4 }), false);
  assert.equal(canUsePreparedDeck({ expectedUrl: '/stream/b', actualUrl: 'http://localhost/stream/b', readyState: 4, error: {} }), false);
});

test('micro-fade fallback replaces a zero-fade hard swap', () => {
  // When the requested fade has no room (effectiveSweetFadeSeconds returns 0),
  // main.jsx falls back to a short crossfade so the outgoing still ducks
  // instead of cutting abruptly. The micro fade must be a positive, short span
  // and the equal-power ramp must drive the outgoing to 0 by its end.
  assert.ok(SWEET_FADE_MICRO_SECONDS > 0 && SWEET_FADE_MICRO_SECONDS <= 0.5);
  // Same tolerance pattern as the equal-power ramp test below: cos(PI/2) is a
  // tiny float (~6.1e-17), not exactly 0, so compare within epsilon.
  const levels = transitionDeckVolumes(1, 1);
  assert.ok(Math.abs(levels.incoming - 1) < 1e-9);
  assert.ok(Math.abs(levels.outgoing - 0) < 1e-9);
});

test('Sweet Fade volume ramps preserve the selected target volume', () => {
  assert.deepEqual(transitionDeckVolumes(0.8, 0), { incoming: 0, outgoing: 0.8 });
  const nearly = (actual, expected) => {
    assert.ok(Math.abs(actual.incoming - expected.incoming) < 1e-9);
    assert.ok(Math.abs(actual.outgoing - expected.outgoing) < 1e-9);
  };
  nearly(transitionDeckVolumes(0.8, 0.5), {
    incoming: 0.565685424949238,
    outgoing: 0.565685424949238
  });
  nearly(transitionDeckVolumes(0.8, 1), { incoming: 0.8, outgoing: 0 });
  assert.deepEqual(transitionDeckVolumes(2, -1), { incoming: 0, outgoing: 1 });
});
