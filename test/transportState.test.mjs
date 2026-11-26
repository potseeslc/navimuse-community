import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialTransportState,
  isAudiblyPlaying,
  TRANSPORT_STATUS,
  transportStateForEvent,
  transportStatusMessage
} from '../src/transportState.js';

test('transport follows restored load through one-action audible playback', () => {
  let state = transportStateForEvent(initialTransportState(), { type: 'restore', requestId: 4 });
  assert.equal(state.status, TRANSPORT_STATUS.RESTORED);
  assert.match(transportStatusMessage(state, { position: 92 }), /1:32/);

  state = transportStateForEvent(state, { type: 'ready', requestId: 4 });
  assert.equal(state.status, TRANSPORT_STATUS.RESTORED);
  state = transportStateForEvent(state, { type: 'request-play', requestId: 4 });
  assert.equal(state.status, TRANSPORT_STATUS.LOADING);
  assert.equal(isAudiblyPlaying(state), false);
  state = transportStateForEvent(state, { type: 'playing', requestId: 4 });
  assert.equal(state.status, TRANSPORT_STATUS.PLAYING);
  assert.equal(isAudiblyPlaying(state), true);
});

test('transport distinguishes buffering, pause, natural end, and retryable error', () => {
  let state = transportStateForEvent(initialTransportState(), { type: 'load', requestId: 8 });
  state = transportStateForEvent(state, { type: 'playing', requestId: 8 });
  state = transportStateForEvent(state, { type: 'waiting', requestId: 8 });
  assert.equal(state.status, TRANSPORT_STATUS.BUFFERING);
  assert.match(transportStatusMessage(state), /Loading audio/);
  state = transportStateForEvent(state, { type: 'playing', requestId: 8 });
  state = transportStateForEvent(state, { type: 'pause', requestId: 8 });
  assert.equal(state.status, TRANSPORT_STATUS.PAUSED);
  state = transportStateForEvent(state, { type: 'error', requestId: 8, message: 'Stream unavailable' });
  assert.equal(state.status, TRANSPORT_STATUS.ERROR);
  assert.equal(state.recoverable, true);
  state = transportStateForEvent(state, { type: 'recover', requestId: 8 });
  assert.equal(state.status, TRANSPORT_STATUS.RECOVERING);
  state = transportStateForEvent(state, { type: 'ended', requestId: 8 });
  assert.equal(state.status, TRANSPORT_STATUS.ENDED);
});

test('transport ignores stale events from superseded loads', () => {
  const active = transportStateForEvent(initialTransportState(), { type: 'load', requestId: 12 });
  assert.equal(transportStateForEvent(active, { type: 'playing', requestId: 11 }), active);
  assert.equal(transportStateForEvent(active, { type: 'error', requestId: 11 }), active);
  assert.equal(transportStateForEvent(active, { type: 'load', requestId: 10 }), active);
  assert.equal(transportStateForEvent(active, { type: 'playing', requestId: 12 }).status, TRANSPORT_STATUS.PLAYING);
});

test('pause-after-current is a stable ready boundary and resumes through one play action', () => {
  let state = transportStateForEvent(initialTransportState(), { type: 'load', requestId: 21 });
  state = transportStateForEvent(state, { type: 'pause-after-current', requestId: 21 });
  assert.equal(state.status, TRANSPORT_STATUS.PAUSED_AFTER_CURRENT);
  assert.equal(isAudiblyPlaying(state), false);
  assert.match(transportStatusMessage(state, { title: 'Next Light' }), /Paused before Next Light/);

  state = transportStateForEvent(state, { type: 'ready', requestId: 21 });
  assert.equal(state.status, TRANSPORT_STATUS.PAUSED_AFTER_CURRENT);
  state = transportStateForEvent(state, { type: 'pause', requestId: 21 });
  assert.equal(state.status, TRANSPORT_STATUS.PAUSED_AFTER_CURRENT);
  state = transportStateForEvent(state, { type: 'request-play', requestId: 21 });
  assert.equal(state.status, TRANSPORT_STATUS.LOADING);
  state = transportStateForEvent(state, { type: 'playing', requestId: 21 });
  assert.equal(state.status, TRANSPORT_STATUS.PLAYING);
});
