import test from 'node:test';
import assert from 'node:assert/strict';
import { repairRestoredQueue } from '../src/queueRestore.js';
const snapshot = { version: 1, items: ['a','b','c','d'].map(id => ({ song: { id } })), index: 1, position: 48, timestamp: 1, controls: { shuffle: true, repeat: false }, shufflePool: [0,2,3], playHistory: [0] };
const missing = () => Object.assign(new Error('Not found'), { status: 404 });
test('repair skips missing current track and remaps remaining history and shuffle', async () => {
  const result = await repairRestoredQueue(snapshot, async id => { if (id === 'b') throw missing(); return { song: { id, title: id } }; });
  assert.deepEqual(result.state.items.map(item => item.song.id), ['a','c','d']);
  assert.equal(result.state.index, 1);
  assert.equal(result.state.position, 0);
  assert.deepEqual(result.state.shufflePool, [0,2]);
  assert.deepEqual(result.state.playHistory, [0]);
  assert.equal(result.removedCount, 1);
  assert.equal(snapshot.items.length, 4);
});
test('repair retains current position and duplicate queue occurrences', async () => {
  const state = { ...snapshot, items: [snapshot.items[0], snapshot.items[0], ...snapshot.items.slice(2)] };
  const result = await repairRestoredQueue(state, async id => ({ song: { id } }));
  assert.equal(result.state.position, 48);
  assert.equal(result.state.items.length, 4);
  assert.equal(result.currentChanged, false);
});
test('network or authentication errors cannot be interpreted as deleted tracks', async () => {
  for (const status of [401, 403, 500, 503]) await assert.rejects(repairRestoredQueue(snapshot, async () => { throw Object.assign(new Error('Unavailable'), { status }); }), { status });
});
test('all deleted tracks restore an empty paused candidate', async () => {
  const result = await repairRestoredQueue(snapshot, async () => { throw missing(); });
  assert.equal(result.state.index, -1);
  assert.equal(result.state.position, 0);
  assert.deepEqual(result.state.shufflePool, []);
});
test('cancelled restore does not return a candidate', async () => {
  const controller = new AbortController();
  await assert.rejects(repairRestoredQueue(snapshot, async id => { controller.abort(); return { song: { id } }; }, { signal: controller.signal }), { name: 'AbortError' });
});

test('repair rejects an unsupported persisted schema before resolving any songs', async () => {
  let calls = 0;
  await assert.rejects(repairRestoredQueue({...snapshot,version:2}, async id => {calls++; return {song:{id}};}), /Invalid queue restore snapshot/);
  assert.equal(calls,0);
});
