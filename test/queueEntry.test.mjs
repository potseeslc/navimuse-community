import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishQueueEntry, setQueueEntry } from '../src/queueEntry.js';

function opener() {
  return { isConnected: true, focusCount: 0, focus() { this.focusCount += 1; } };
}

test('mini-player queue entry closes the expanded player and restores the exact opener', () => {
  const entryRef = { current: null };
  const button = opener();
  const calls = [];
  setQueueEntry(entryRef, button, true);
  finishQueueEntry(entryRef, {
    closePanel: () => calls.push('panel'),
    closePlayer: () => calls.push('player'),
    scheduleFocus: (callback) => callback()
  });
  assert.deepEqual(calls, ['player']);
  assert.equal(button.focusCount, 1);
  assert.deepEqual(entryRef.current, { opener: null, closePlayer: false });
});

test('full-player queue entry preserves the player and restores its own opener', () => {
  const entryRef = { current: null };
  const button = opener();
  const calls = [];
  setQueueEntry(entryRef, button, false);
  finishQueueEntry(entryRef, {
    closePanel: () => calls.push('panel'),
    closePlayer: () => calls.push('player'),
    scheduleFocus: (callback) => callback()
  });
  assert.deepEqual(calls, ['panel']);
  assert.equal(button.focusCount, 1);
});

test('queue selection preserves the player even after mini-player entry', () => {
  const entryRef = { current: null };
  const button = opener();
  const calls = [];
  setQueueEntry(entryRef, button, true);
  finishQueueEntry(entryRef, {
    closePanel: () => calls.push('panel'),
    closePlayer: () => calls.push('player'),
    preservePlayer: true,
    scheduleFocus: (callback) => callback()
  });
  assert.deepEqual(calls, ['panel']);
  assert.equal(button.focusCount, 1);
});

test('disconnected queue opener is not focused', () => {
  const entryRef = { current: null };
  const button = opener();
  button.isConnected = false;
  setQueueEntry(entryRef, button, true);
  finishQueueEntry(entryRef, {
    closePanel() {}, closePlayer() {}, scheduleFocus: (callback) => callback()
  });
  assert.equal(button.focusCount, 0);
});
