import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUEUE_PERSISTENCE_KEY,
  QUEUE_PERSISTENCE_SCHEMA_VERSION,
  loadPersistedQueue,
  savePersistedQueue,
  validatePersistedQueue,
  buildPersistedQueueState
} from '../src/queueStore.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('queue persistence key and schema version are stable constants', () => {
  assert.equal(QUEUE_PERSISTENCE_KEY, 'navimuse.queue.v1');
  assert.equal(QUEUE_PERSISTENCE_SCHEMA_VERSION, 1);
});

test('validatePersistedQueue accepts a well-formed state object', () => {
  const valid = {
    version: QUEUE_PERSISTENCE_SCHEMA_VERSION,
    items: [{ song: { id: 'a' }, album: null }],
    index: 0,
    shufflePool: [],
    playHistory: [],
    controls: { shuffle: false, repeat: false },
    position: 0,
    timestamp: Date.now()
  };
  const migrated = validatePersistedQueue(valid);
  assert.equal(migrated.source.label, 'Your queue');
  assert.equal(migrated.items[0].provenance, 'source');
  assert.equal(migrated.controls.pauseAfterCurrent, false);
});

test('validatePersistedQueue rejects malformed or missing fields', () => {
  const valid = {
    version: QUEUE_PERSISTENCE_SCHEMA_VERSION,
    items: [{ song: { id: 'a' }, album: null }],
    index: 0,
    shufflePool: [],
    playHistory: [],
    controls: { shuffle: false, repeat: false },
    position: 0,
    timestamp: Date.now()
  };
  assert.equal(validatePersistedQueue(null), null);
  assert.equal(validatePersistedQueue(undefined), null);
  assert.equal(validatePersistedQueue('string'), null);
  assert.equal(validatePersistedQueue([]), null);
  assert.equal(validatePersistedQueue({}), null);
  assert.equal(validatePersistedQueue({ items: [], index: 0 }), null);
  assert.equal(validatePersistedQueue({ items: 'not-array', index: 0, shufflePool: [], playHistory: [], controls: { shuffle: false, repeat: false } }), null);
  assert.equal(validatePersistedQueue({ items: [], index: -2, shufflePool: [], playHistory: [], controls: { shuffle: false, repeat: false } }), null);
  assert.equal(validatePersistedQueue({ items: [], index: 0, shufflePool: [], playHistory: [], controls: { shuffle: 'yes', repeat: false } }), null);
  assert.equal(validatePersistedQueue({ items: [], index: 0, shufflePool: [], playHistory: [], controls: { repeat: false } }), null);
  assert.equal(validatePersistedQueue({ ...valid, version: 2 }), null);
  assert.equal(validatePersistedQueue({ ...valid, controls: { ...valid.controls, pauseAfterCurrent: 'later' } }), null);
  assert.equal(validatePersistedQueue({ ...valid, index: 1 }), null);
  assert.equal(validatePersistedQueue({ ...valid, shufflePool: [0] }), null);
  assert.equal(validatePersistedQueue({ ...valid, playHistory: [1] }), null);
  assert.equal(validatePersistedQueue({ ...valid, items: [{ song: {} }] }), null);
  assert.equal(validatePersistedQueue({ ...valid, position: -1 }), null);
  assert.equal(validatePersistedQueue({ ...valid, timestamp: Number.NaN }), null);
});

test('buildPersistedQueueState creates a valid snapshot from current state', () => {
  const queue = { items: [{ song: { id: 'a' }, album: null }, { song: { id: 'b' }, album: null }], index: 1 };
  const shufflePool = [0];
  const playHistory = [0];
  const controls = { shuffle: true, repeat: false, pauseAfterCurrent: true };
  const snapshot = buildPersistedQueueState(queue, shufflePool, playHistory, controls, 42);
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.source.label, 'Your queue');
  assert.deepEqual(snapshot.items.map((entry) => entry.provenance), ['source', 'source']);
  assert.equal(snapshot.version, QUEUE_PERSISTENCE_SCHEMA_VERSION);
  assert.equal(snapshot.index, 1);
  assert.deepEqual(snapshot.shufflePool, [0]);
  assert.deepEqual(snapshot.playHistory, [0]);
  assert.equal(snapshot.controls.shuffle, true);
  assert.equal(snapshot.controls.repeat, false);
  assert.equal(snapshot.controls.pauseAfterCurrent, true);
  assert.equal(snapshot.position, 42);
  assert.ok(snapshot.timestamp > 0);
  // The snapshot should pass validation
  assert.deepEqual(validatePersistedQueue(snapshot), snapshot);
});

test('buildPersistedQueueState handles missing or malformed inputs defensively', () => {
  const snapshot = buildPersistedQueueState(null, null, null, null);
  assert.equal(snapshot.items.length, 0);
  assert.equal(snapshot.index, -1);
  assert.deepEqual(snapshot.shufflePool, []);
  assert.deepEqual(snapshot.playHistory, []);
  assert.equal(snapshot.controls.shuffle, false);
  assert.equal(snapshot.controls.repeat, false);
  assert.equal(snapshot.controls.pauseAfterCurrent, false);
  assert.equal(snapshot.position, 0);

  const sanitized = buildPersistedQueueState(
    { items: [{ song: { id: 'a' } }], index: 7 },
    [0, 0, 4],
    [0, -1, 0],
    { shuffle: true, repeat: false },
    Number.POSITIVE_INFINITY
  );
  assert.equal(sanitized.index, 0);
  assert.deepEqual(sanitized.shufflePool, []);
  assert.deepEqual(sanitized.playHistory, [0]);
  assert.equal(sanitized.position, 0);
  assert.deepEqual(validatePersistedQueue(sanitized), sanitized);
});

test('savePersistedQueue and loadPersistedQueue round-trip a valid snapshot', () => {
  const storage = memoryStorage();
  const queue = { items: [{ song: { id: 'song-a' }, album: null }], index: 0 };
  const saved = savePersistedQueue(storage, queue, [], [], { shuffle: false, repeat: true, pauseAfterCurrent: true }, 17);
  assert.equal(saved.position, 17);
  assert.equal(saved.controls.pauseAfterCurrent, true);
  assert.deepEqual(loadPersistedQueue(storage), saved);
});

test('queue persistence retains source identity and explicit provenance in schema v1', () => {
  const storage = memoryStorage();
  const queue = {
    source: { version: 1, kind: 'album', id: 'album-a', label: 'Midnight Signal', detail: 'Luna Harbor' },
    items: [{ song: { id: 'song-a' }, album: null, provenance: 'explicit' }],
    index: 0
  };
  const saved = savePersistedQueue(storage, queue, [], [], { shuffle: false, repeat: false }, 9);
  const restored = loadPersistedQueue(storage);
  assert.deepEqual(restored.source, queue.source);
  assert.equal(restored.items[0].provenance, 'explicit');
  assert.equal(saved.version, 1);
});

test('loadPersistedQueue ignores malformed storage', () => {
  const storage = memoryStorage();
  storage.setItem(QUEUE_PERSISTENCE_KEY, '{not-json');
  assert.equal(loadPersistedQueue(storage), null);
});
