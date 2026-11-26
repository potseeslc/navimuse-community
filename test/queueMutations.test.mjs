import assert from 'node:assert/strict';
import test from 'node:test';
import { appendExplicitQueueItem, clearPlayedQueue, clearUpcomingQueue, insertNextQueueItem, moveUpcomingQueueItem, normalizeOrdinaryQueue, queueCanEdit, reconcileGeneratedBoundary, removeGeneratedContinuation, removeUpcomingQueueItem } from '../src/queueMutations.js';
import { createQueueSourceDescriptor } from '../src/productInteractionContract.js';

const item = (id) => ({ queueItemId: id, song: { id, title: id } });
const queue = { items: ['played', 'current', 'next-a', 'next-b'].map(item), index: 1 };

test('queue edits preserve played and current items', () => {
  assert.deepEqual(removeUpcomingQueueItem(queue, 2).items.map((entry) => entry.song.id), ['played', 'current', 'next-b']);
  assert.strictEqual(removeUpcomingQueueItem(queue, 1), queue);
  assert.strictEqual(removeUpcomingQueueItem(queue, 0), queue);
  assert.equal(removeUpcomingQueueItem(queue, 2).index, 1);
});

test('queue reorder is bounded to Up Next', () => {
  assert.deepEqual(moveUpcomingQueueItem(queue, 3, 'up').items.map((entry) => entry.song.id), ['played', 'current', 'next-b', 'next-a']);
  assert.strictEqual(moveUpcomingQueueItem(queue, 2, 'up'), queue);
  assert.strictEqual(moveUpcomingQueueItem(queue, 3, 'down'), queue);
});

test('queue reorder cannot move generated continuation ahead of explicit intent', () => {
  const boundaryQueue = normalizeOrdinaryQueue({
    items: [item('current'), { ...item('manual'), provenance: 'explicit' }, { ...item('generated'), provenance: 'generated' }],
    index: 0,
    source: createQueueSourceDescriptor({ kind: 'radio', label: 'Radio', generatedBoundary: 2 })
  });
  assert.strictEqual(moveUpcomingQueueItem(boundaryQueue, 2, 'up'), boundaryQueue);
  assert.strictEqual(moveUpcomingQueueItem(boundaryQueue, 1, 'down'), boundaryQueue);
});

test('clear upcoming keeps the exact playing prefix', () => {
  const cleared = clearUpcomingQueue(queue);
  assert.deepEqual(cleared.items.map((entry) => entry.song.id), ['played', 'current']);
  assert.equal(cleared.index, 1);
});

test('clear played preserves the committed current item and shifts its cursor to zero', () => {
  const cleared = clearPlayedQueue(queue);
  assert.deepEqual(cleared.items.map((entry) => entry.song.id), ['current', 'next-a', 'next-b']);
  assert.equal(cleared.index, 0);
  assert.strictEqual(cleared.items[0], queue.items[1]);
  const unchanged = { ...queue, index: 0 };
  assert.strictEqual(clearPlayedQueue(unchanged), unchanged);
});

test('Atlas Journey queues remain immutable', () => {
  const atlasQueue = { ...queue, instanceId: 'atlas-queue' };
  assert.equal(queueCanEdit(atlasQueue), false);
  assert.strictEqual(removeUpcomingQueueItem(atlasQueue, 2), atlasQueue);
  assert.strictEqual(moveUpcomingQueueItem(atlasQueue, 3, 'up'), atlasQueue);
  assert.strictEqual(clearUpcomingQueue(atlasQueue), atlasQueue);
  assert.strictEqual(clearPlayedQueue(atlasQueue), atlasQueue);
  assert.strictEqual(removeGeneratedContinuation(atlasQueue), atlasQueue);
  assert.strictEqual(insertNextQueueItem(atlasQueue, item('manual')), atlasQueue);
  assert.strictEqual(appendExplicitQueueItem(atlasQueue, item('manual')), atlasQueue);
});

test('ordinary queues migrate to one source descriptor and source provenance', () => {
  const migrated = normalizeOrdinaryQueue({ ...queue, items: [...queue.items, { ...item('invalid'), provenance: 'unexpected' }] });
  assert.equal(migrated.source.label, 'Your queue');
  assert.deepEqual(migrated.items.map((entry) => entry.provenance), ['source', 'source', 'source', 'source', 'source']);
});

test('Play next inserts immediately after current without interrupting it', () => {
  const next = insertNextQueueItem(normalizeOrdinaryQueue(queue), item('manual-next'));
  assert.equal(next.index, queue.index);
  assert.deepEqual(next.items.map((entry) => entry.song.id), ['played', 'current', 'manual-next', 'next-a', 'next-b']);
  assert.equal(next.items[2].provenance, 'explicit');
});

test('Add to queue stays after explicit items and before generated continuation', () => {
  const generatedQueue = normalizeOrdinaryQueue({
    items: [item('current'), { ...item('manual-a'), provenance: 'explicit' }, { ...item('generated-a'), provenance: 'generated' }],
    index: 0,
    source: createQueueSourceDescriptor({ kind: 'radio', label: 'Radio', generatedBoundary: 2 })
  });
  const next = appendExplicitQueueItem(generatedQueue, item('manual-b'));
  assert.deepEqual(next.items.map((entry) => entry.song.id), ['current', 'manual-a', 'manual-b', 'generated-a']);
  assert.deepEqual(next.items.map((entry) => entry.provenance), ['source', 'explicit', 'explicit', 'generated']);
  assert.equal(next.source.generatedBoundary, 3);
  const removed = removeUpcomingQueueItem(next, 1);
  assert.equal(removed.source.generatedBoundary, 2);
});

test('generated replenishment establishes the visible boundary at its first item', () => {
  const reconciled = reconcileGeneratedBoundary(normalizeOrdinaryQueue({
    items: [item('current'), item('source-next'), { ...item('generated-a'), provenance: 'generated' }],
    index: 0,
    source: createQueueSourceDescriptor({ kind: 'radio', label: 'Sonic Journey' })
  }));
  assert.equal(reconciled.source.generatedBoundary, 2);
  assert.deepEqual(reconciled.items.map((entry) => entry.provenance), ['source', 'source', 'generated']);
  assert.strictEqual(
    reconcileGeneratedBoundary(reconciled).source,
    reconciled.source,
    'reconciling an already-correct boundary is idempotent'
  );
  const repaired = reconcileGeneratedBoundary({
    ...reconciled,
    source: createQueueSourceDescriptor({ ...reconciled.source, generatedBoundary: 1 })
  });
  assert.equal(repaired.source.generatedBoundary, 2, 'stale boundaries are repaired from item provenance');
});

test('generated continuation removal preserves current and explicit queue items', () => {
  const generatedQueue = normalizeOrdinaryQueue({
    items: [item('played'), item('current'), { ...item('manual'), provenance: 'explicit' }, { ...item('generated-a'), provenance: 'generated' }, { ...item('generated-b'), provenance: 'generated' }],
    index: 1,
    source: createQueueSourceDescriptor({ kind: 'radio', label: 'Radio', generatedBoundary: 3 })
  });
  const removed = removeGeneratedContinuation(generatedQueue);
  assert.deepEqual(removed.items.map((entry) => entry.song.id), ['played', 'current', 'manual']);
  assert.equal(removed.source.generatedBoundary, undefined);
  assert.strictEqual(removeGeneratedContinuation(removed), removed);
});

test('drag destinations move one occurrence atomically without crossing generated tracks',()=>{
 const queue={index:0,items:[{queueItemId:'current',song:{id:'same'}},{queueItemId:'one',song:{id:'same'}},{queueItemId:'two',song:{id:'two'}},{queueItemId:'three',song:{id:'three'}},{queueItemId:'generated',song:{id:'four'},provenance:'generated'}]};
 const next=moveUpcomingQueueItem(queue,1,3);
 assert.deepEqual(next.items.map(x=>x.queueItemId),['current','two','three','one','generated']);
 assert.equal(next.items[0],queue.items[0]);assert.equal(next.index,0);
 assert.equal(moveUpcomingQueueItem(queue,1,4),queue);
 assert.equal(moveUpcomingQueueItem(queue,1,0),queue);
 assert.equal(moveUpcomingQueueItem(queue,1.5,3),queue);
 assert.equal(moveUpcomingQueueItem(queue,9,'up'),queue);
});
