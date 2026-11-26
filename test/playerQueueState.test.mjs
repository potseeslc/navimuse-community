import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { usePlayerQueueState } from '../src/playerQueueState.js';

function renderQueueHook(defaultControls = { shuffle: false, repeat: false, pauseAfterCurrent: false, panel: '' }, options = {}) {
  let api;
  function Harness() {
    api = usePlayerQueueState(defaultControls, options);
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  return api;
}

const item = (id) => ({ song: { id, title: id }, album: null });

test('usePlayerQueueState replaces queues and advances sequentially', () => {
  const api = renderQueueHook();
  const queue = { items: [item('a'), item('b'), item('c')], index: 0 };
  api.replaceQueue(queue);
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['a', 'b', 'c']);
  assert.equal(api.queueRef.current.source.label, 'Your queue');

  const next = api.advanceQueue('next');
  assert.equal(next.nextIndex, 1);
  assert.equal(next.item.song.id, 'b');

  api.replaceQueue({ ...queue, index: 1 }, { preserveHistory: true });
  const previous = api.advanceQueue('previous');
  assert.equal(previous.nextIndex, 0);
  assert.equal(previous.item.song.id, 'a');
});

test('usePlayerQueueState updates controls and shuffle history behavior', () => {
  const api = renderQueueHook();
  const queue = { items: [item('a'), item('b'), item('c')], index: 0 };
  api.replaceQueue(queue);
  api.updateControls({ shuffle: true });
  assert.equal(api.controlsRef.current.shuffle, true);
  api.updateControls({ pauseAfterCurrent: true });
  assert.equal(api.controlsRef.current.pauseAfterCurrent, true);

  const next = api.advanceQueue('next', { random: () => 0 });
  assert.equal(next.item.song.id, 'b');
  api.replaceQueue({ ...queue, index: next.nextIndex }, { preserveHistory: true });

  const previous = api.advanceQueue('previous');
  assert.equal(previous.item.song.id, 'a');
  assert.equal(api.controlsRef.current.pauseAfterCurrent, true, 'manual queue navigation must not consume the armed boundary');
});

test('usePlayerQueueState owns an atomic Atlas queue and Journey transaction', async () => {
  const previousWindow=globalThis.window,value=new Map;globalThis.window={localStorage:{getItem:key=>value.get(key)||null,setItem:(key,next)=>value.set(key,next),removeItem:key=>value.delete(key)}};
  try { const {journey,persisted}=await import('./contracts/sonicAtlasFixtures.mjs'),{atlasJourneyQueueItems}=await import('../src/atlasJourneyQueue.js'),api=renderQueueHook(),queue={instanceId:'queue-instance-1',items:atlasJourneyQueueItems(journey),index:0};api.replaceQueue({items:[item('ordinary-current'),item('ordinary-next')],index:0});assert.equal(api.removeQueueItem(1),true);const saved=api.commitAtlasTransaction({queue,journey:persisted,position:12});assert.equal(api.undoQueueEdit(),false);assert.equal(api.queueRef.current.instanceId,'queue-instance-1');assert.equal(saved.journey.journeyId,'journey-1');assert.ok(value.has('navimuse.sonic-atlas.queue-transaction.v1'));const history={...saved,routeHistory:[{type:'skip',occurredAt:'2026-08-28T00:00:30.000Z',journeyId:'journey-1',stopId:'stop-1',queueItemId:'queue-1',destinationPointId:'point-b',reason:'manual-next'}]};api.persistAtlasJourney(history,23);assert.equal(JSON.parse(value.get('navimuse.sonic-atlas.queue-transaction.v1')).journey.routeHistory.length,1);api.replaceQueue({...queue,index:1},{preserveHistory:true,preserveAtlasTransaction:true});api.selectQueueIndex(1,{...queue,index:1},{recordHistory:true});api.updateControls({repeat:true});api.persist(37);const refreshed=JSON.parse(value.get('navimuse.sonic-atlas.queue-transaction.v1'));assert.equal(refreshed.queue.index,1);assert.equal(refreshed.queue.position,37);assert.equal(refreshed.queue.controls.shuffle,false);assert.equal(refreshed.queue.controls.repeat,true);assert.equal(refreshed.journey.routeHistory.length,1);assert.equal(value.has('navimuse.sonic-atlas.queue-transaction.v1'),true);assert.throws(()=>api.replaceQueue({...queue,items:[...queue.items].reverse()},{preserveAtlasTransaction:true}),/identity changed/);const detached=api.detachAtlasJourney(41);assert.equal(value.has('navimuse.sonic-atlas.queue-transaction.v1'),false);assert.equal(detached.instanceId,undefined);assert.equal(detached.source.kind,'ad-hoc');assert.equal(detached.source.label,'Detached Journey queue');assert.equal(detached.index,1);const ordinary=JSON.parse(value.get('navimuse.queue.v1'));assert.equal(ordinary.position,41);assert.equal(ordinary.items.length,queue.items.length); } finally { globalThis.window=previousWindow; }
});

test('usePlayerQueueState records manual selections and rejects invalid indexes', () => {
  const api = renderQueueHook();
  const queue = { items: [item('a'), item('b')], index: 0 };
  api.replaceQueue(queue);
  assert.equal(api.selectQueueIndex(9, queue), null);
  assert.equal(api.selectQueueIndex(1, queue, { recordHistory: true }).song.id, 'b');
});

test('usePlayerQueueState edits Up Next and restores one exact undo snapshot', () => {
  const api = renderQueueHook();
  const queue = { items: [item('played'), item('current'), item('next-a'), item('next-b')], index: 1 };
  api.replaceQueue(queue);
  api.updateControls({ pauseAfterCurrent: true });
  assert.equal(api.moveQueueItem(3, 'up'), true);
  assert.equal(api.controlsRef.current.pauseAfterCurrent, true, 'reordering must preserve the armed boundary');
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['played', 'current', 'next-b', 'next-a']);
  assert.equal(api.removeQueueItem(2), true);
  assert.equal(api.controlsRef.current.pauseAfterCurrent, true, 'removal must preserve the armed boundary');
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['played', 'current', 'next-a']);
  assert.equal(api.undoQueueEdit(), true);
  assert.equal(api.controlsRef.current.pauseAfterCurrent, true, 'undo must preserve the armed boundary');
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['played', 'current', 'next-b', 'next-a']);
  assert.equal(api.undoQueueEdit(), false);
  assert.equal(api.clearUpcoming(), true);
  assert.equal(api.controlsRef.current.pauseAfterCurrent, true, 'clearing upcoming tracks must preserve the armed boundary');
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['played', 'current']);
  api.updateControls({ pauseAfterCurrent: false });
  assert.equal(api.controlsRef.current.pauseAfterCurrent, false, 'explicit cancellation clears the boundary');
});

test('usePlayerQueueState owns non-interrupting Play next and Add to queue ordering', () => {
  const api = renderQueueHook();
  api.replaceQueue({ items: [item('current'), item('source-next')], index: 0 });
  assert.equal(api.playNext(item('manual-next')), true);
  assert.equal(api.addToQueue(item('manual-last')), true);
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['current', 'manual-next', 'source-next', 'manual-last']);
  assert.equal(api.queueRef.current.index, 0);
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.provenance), ['source', 'explicit', 'source', 'explicit']);
});

test('usePlayerQueueState clears played/generated items and restores queue index state on undo', () => {
  const api = renderQueueHook({ shuffle: true, repeat: false, panel: '' });
  const queue = {
    items: [item('played'), item('current'), { ...item('manual'), provenance: 'explicit' }, { ...item('generated'), provenance: 'generated' }],
    index: 1,
    source: { version: 1, kind: 'radio', label: 'Radio', generatedBoundary: 3 }
  };
  api.replaceQueue(queue);
  assert.equal(api.clearPlayed(), true);
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['current', 'manual', 'generated']);
  assert.equal(api.queueRef.current.index, 0);
  assert.equal(api.clearGenerated(), true);
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['current', 'manual']);
  assert.equal(api.undoQueueEdit(), true);
  assert.deepEqual(api.queueRef.current.items.map((entry) => entry.song.id), ['current', 'manual', 'generated']);
  assert.equal(api.advanceQueue('next', { random: () => 0.99 }).item.song.id, 'manual');
});

test('usePlayerQueueState tolerates blocked localStorage and keeps an empty usable queue', () => {const previous=globalThis.window;globalThis.window={get localStorage(){throw new DOMException('blocked','SecurityError')}};try{const api=renderQueueHook();assert.deepEqual(api.queueRef.current,{items:[],index:-1});assert.equal(api.persist(0),null)}finally{globalThis.window=previous}});

test('prepared shuffle decisions commit once and do not replay consumed tracks', () => {
  const api = renderQueueHook();
  api.replaceQueue({ items: [item('a'), item('b'), item('c')], index: 0 });
  api.updateControls({ shuffle: true });
  const reserved = api.prepareAdvance('next', { random: () => 0 });
  assert.equal(api.prepareAdvance('next', { random: () => .99 }), reserved);
  assert.deepEqual(api.playHistoryRef.current, []);
  const committed = api.commitAdvance(reserved);
  assert.equal(committed.item.song.id, 'b');
  assert.equal(api.commitAdvance(reserved), null);
  api.replaceQueue({ ...api.queueRef.current, index: committed.nextIndex }, { preserveHistory: true, queueAdvanced: true });
  assert.equal(api.advanceQueue('next', { random: () => 0 }).item.song.id, 'c');
  assert.deepEqual(api.playHistoryRef.current, [0, 1]);
});

test('editing a queue or changing shuffle invalidates a prepared decision', () => {
  const api = renderQueueHook();
  api.replaceQueue({ items: [item('a'), item('b'), item('c')], index: 0 });
  const reserved = api.prepareAdvance();
  api.removeQueueItem(1);
  assert.equal(api.commitAdvance(reserved), null);
  const next = api.prepareAdvance();
  api.updateControls({ shuffle: true });
  assert.equal(api.commitAdvance(next), null);
  assert.equal(api.advanceQueue().item.song.id, 'c');
});

test('natural end and manual Next consume the same prepared selection', () => {
  for (const fromEnded of [true, false]) {
    const api = renderQueueHook();
    api.replaceQueue({ items: [item('a'), item('b'), item('c')], index: 0 });
    api.updateControls({ shuffle: true });
    const prepared = api.prepareAdvance('next', { fromEnded: true, random: () => .99 });
    const next = api.advanceQueue('next', { fromEnded, random: () => 0 });
    assert.equal(next.nextIndex, prepared.plan.nextIndex);
    assert.equal(next.item.song.id, 'c');
    assert.deepEqual(api.playHistoryRef.current, [0]);
    assert.equal(api.commitAdvance(prepared), null);
  }
});

test('restore repair cannot overwrite a queue edit or changed transport controls', () => {
  const api = renderQueueHook();
  api.replaceQueue({ items: [item('a'), item('b')], index: 0 });
  const snapshot = api.restorationSnapshot();
  const revision = api.queueRevisionRef.current;
  const controls = api.controlsRef.current;
  api.updateControls({ shuffle: true });
  assert.equal(api.commitRestorationRepair(snapshot, revision, controls), false);
  const nextControls = api.controlsRef.current;
  api.addToQueue(item('c'));
  assert.equal(api.commitRestorationRepair(snapshot, revision, nextControls), false);
  assert.deepEqual(api.queueRef.current.items.map(entry => entry.song.id), ['a','b','c']);
});

test('account queue storage isolates restore, Atlas writes and late callbacks from another account and legacy keys', async () => {
  const { createAccountStorage } = await import('../src/accountStorage.js');
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    const legacy = renderQueueHook();
    legacy.replaceQueue({items:[item('legacy')],index:0}); legacy.persist(1);
    const legacyBefore = storage.getItem('navimuse.queue.v1');
    const a = createAccountStorage('queue-scope-v2:' + 'a'.repeat(64), storage);
    const b = createAccountStorage('queue-scope-v2:' + 'b'.repeat(64), storage);
    const apiA = renderQueueHook(undefined, {storage:a});
    assert.equal(apiA.queueRef.current.items.length, 0);
    apiA.replaceQueue({items:[item('account-a')],index:0}); apiA.persist(12);
    const apiB = renderQueueHook(undefined, {storage:b});
    assert.equal(apiB.queueRef.current.items.length, 0);
    apiB.replaceQueue({items:[item('account-b')],index:0}); apiB.persist(23);
    apiA.persist(34); // Completion from the old player after another player mounts.
    assert.equal(renderQueueHook(undefined,{storage:a}).queueRef.current.items[0].song.id,'account-a');
    assert.equal(renderQueueHook(undefined,{storage:b}).queueRef.current.items[0].song.id,'account-b');
    const {journey,persisted} = await import('./contracts/sonicAtlasFixtures.mjs');
    const {atlasJourneyQueueItems} = await import('../src/atlasJourneyQueue.js');
    apiA.commitAtlasTransaction({queue:{instanceId:'queue-instance-1',items:atlasJourneyQueueItems(journey),index:0},journey:persisted,position:12});
    assert.equal(renderQueueHook(undefined,{storage:a}).queueRef.current.instanceId,'queue-instance-1');
    assert.equal(b.getItem('navimuse.sonic-atlas.queue-transaction.v1'),null);
    apiA.detachAtlasJourney(18);
    assert.equal(a.getItem('navimuse.sonic-atlas.queue-transaction.v1'),null);
    assert.equal(renderQueueHook(undefined,{storage:b}).queueRef.current.items[0].song.id,'account-b');
    assert.equal(storage.getItem('navimuse.queue.v1'),legacyBefore);
    assert.throws(()=>createAccountStorage(null,storage),/Verified account/);
    const unavailable = renderQueueHook(undefined,{storage:null});
    assert.equal(unavailable.queueRef.current.items.length,0);
    assert.equal(unavailable.persist(0),null);
  } finally { globalThis.window = previousWindow; }
});
