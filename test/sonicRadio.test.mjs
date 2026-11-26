import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Behavioral tests for the Sonic Radio orchestration controller.
 *
 * These tests exercise the controller directly (no React renderer needed)
 * with mock callbacks and deferred promises to verify real runtime behavior:
 *
 * - Defect 1: degraded retry performs a real fetch
 * - Defect 2: track-driven replenishment auto-triggers via state transition
 * - Defect 3: stale A→B session race and stop-during-generation
 */

import { createSonicRadioController, listeningModePolicies } from '../src/sonicRadioController.js';

// ── Test helpers ────────────────────────────────────────────────────

/**
 * Create a deferred promise that we can resolve on demand.
 * Returns { promise, resolve, reject }.
 */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Flush the microtask queue so queueMicrotask callbacks and .then() handlers run.
 */
function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('listening mode policies keep Journey refill separate from finite Artist DJ playback', () => {
  assert.deepEqual(listeningModePolicies.journey, { canReplenish: true, stopWhenExhausted: false });
  assert.deepEqual(listeningModePolicies['artist-dj'], { canReplenish: false, stopWhenExhausted: true });
});

/**
 * Wait for all pending timers (including setTimeout) to fire.
 */
function tick(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock queue snapshot.
 */
function mockQueue(items = []) {
  return {
    items: items.map((id) => ({ song: { id, title: id, duration: 200 }, album: null })),
    index: 0
  };
}

/**
 * Create a mock fetchSimilarTracks that returns a deferred we control.
 */
function mockFetchSimilarTracks(tracks) {
  const calls = [];
  let deferred_ = deferred();
  calls.push(deferred_);
  const fn = async (seedId, count) => {
    calls.push({ seedId, count });
    return deferred_.promise;
  };
  fn._deferred = deferred_;
  fn._resolve = (tracks) => deferred_.resolve({ ok: true, tracks });
  fn._reject = (err) => deferred_.reject(err);
  fn._calls = calls;
  return fn;
}

// ── Tests ───────────────────────────────────────────────────────────

test('controller initial state is idle', () => {
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [] })
  });
  assert.equal(ctrl.getState().status, 'idle');
  assert.equal(ctrl.getNotice(), '');
  assert.equal(ctrl.isRadioActive(), false);
  ctrl.destroy();
});

test('startSongRadio transitions seeding → generating → listening and calls replaceQueue + playTrack', async () => {
  const replacedQueues = [];
  const playedTracks = [];
  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => replacedQueues.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({
      ok: true,
      tracks: [{ id: 'sim1', title: 'Sim1' }, { id: 'sim2', title: 'Sim2' }]
    })
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');

  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().seedId, 'seed1');
  assert.equal(ctrl.getState().seedLabel, 'Seed1 Radio');
  assert.deepEqual(ctrl.getState().candidateIds, ['sim1', 'sim2']);

  assert.equal(replacedQueues.length, 1);
  assert.equal(replacedQueues[0].index, 0);
  assert.equal(replacedQueues[0].items.length, 3); // seed + 2 similar
  assert.equal(replacedQueues[0].items[0].song.id, 'seed1');
  assert.deepEqual(replacedQueues[0].items.map((item) => item.provenance), ['source', 'source', 'source']);

  assert.equal(playedTracks.length, 1);
  assert.equal(playedTracks[0].song.id, 'seed1');
  ctrl.destroy();
});

// ── Defect 3: Stale A→B session race ────────────────────────────────

test('defect 3: stale A→B race — B starts while A is pending; A resolves but does NOT overwrite B', async () => {
  const replacedQueues = [];
  const playedTracks = [];

  // We need two separate deferreds: one for A, one for B.
  const aDeferred = deferred();
  const bDeferred = deferred();

  let callCount = 0;
  const fetchSimilarTracks = async (seedId, count) => {
    callCount++;
    if (callCount === 1) return aDeferred.promise;
    return bDeferred.promise;
  };

  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => replacedQueues.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks
  });

  // Start A (don't await)
  const aPromise = ctrl.startSongRadio({ id: 'seedA', title: 'SeedA' }, 'A Radio');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'generating');

  // Start B while A is still pending
  const bPromise = ctrl.startSongRadio({ id: 'seedB', title: 'SeedB' }, 'B Radio');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'generating');

  // Resolve A first — A should bail because B took over the session
  aDeferred.resolve({ ok: true, tracks: [{ id: 'A1', title: 'A1' }] });
  await flushMicrotasks();

  // B's session should still be active; A should NOT have called replaceQueue
  assert.equal(replacedQueues.length, 0, 'A must not replace queue after B started');

  // Resolve B — B should replace queue and play
  bDeferred.resolve({ ok: true, tracks: [{ id: 'B1', title: 'B1' }] });
  await bPromise;
  await aPromise; // A should resolve without error

  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().seedId, 'seedB');
  assert.deepEqual(ctrl.getState().candidateIds, ['B1']);
  assert.equal(replacedQueues.length, 1);
  assert.equal(replacedQueues[0].items[0].song.id, 'seedB');
  assert.equal(playedTracks.length, 1);
  assert.equal(playedTracks[0].song.id, 'seedB');
  ctrl.destroy();
});

// ── Defect 3: Stop-during-generation ────────────────────────────────

test('defect 3: stop-during-generation — stop cancels pending generation; late resolve does NOT overwrite', async () => {
  const replacedQueues = [];
  const playedTracks = [];
  const genDeferred = deferred();

  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => replacedQueues.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => genDeferred.promise
  });

  // Start radio (don't await)
  const genPromise = ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'generating');

  // Stop while generation is pending
  ctrl.stopRadio();
  assert.equal(ctrl.getState().status, 'stopped');

  // Resolve the pending fetch — should bail because session was invalidated
  genDeferred.resolve({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] });
  await genPromise;
  await flushMicrotasks();

  // State should still be stopped, queue should NOT have been replaced
  assert.equal(ctrl.getState().status, 'stopped');
  assert.equal(replacedQueues.length, 0, 'stopped session must not replace queue');
  assert.equal(playedTracks.length, 0, 'stopped session must not call playTrack');
  ctrl.destroy();
});

test('fallback generation deduplicates the seed and repeated candidates', async () => {
  const replacedQueues = [];
  const ctrl = createSonicRadioController({
    replaceQueue: (items) => replacedQueues.push(items),
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: false, tracks: [] }),
    searchNavidrome: async () => [
      { id: 'seed1', title: 'Seed duplicate' },
      { id: 'fallback1', title: 'Fallback' },
      { id: 'fallback1', title: 'Fallback duplicate' }
    ]
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed' }, 'Seed Radio');

  assert.deepEqual(replacedQueues[0].map((item) => item.song.id), ['seed1', 'fallback1']);
  assert.deepEqual(ctrl.getState().candidateIds, ['fallback1']);
  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().degradedRetryAt, 0);
  ctrl.destroy();
});

// ── Defect 1: Degraded retry performs a real fetch ──────────────────

test('defect 1: degraded retry calls fetchSimilarTracks after degradedRetryAt elapses', async () => {
  const fetchCalls = [];
  const fetchSimilarTracks = async (seedId, count) => {
    fetchCalls.push({ seedId, count });
    // First call fails (causes degraded), second call succeeds (recovery)
    if (fetchCalls.length === 1) return { ok: false, tracks: [] };
    return { ok: true, tracks: [{ id: 'recovery1', title: 'Recovery1' }] };
  };

  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    appendToQueue: () => {},
    getQueueSnapshot: () => mockQueue(['recovery1']),
    fetchSimilarTracks,
    maxRetries: 3
  });

  // Start radio — will get degraded because first fetch returns ok:false
  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');

  assert.equal(ctrl.getState().status, 'degraded');
  assert.equal(fetchCalls.length, 1, 'first fetch should have happened');

  // The degraded retry timer fires after 60s — we can't wait 60s in a test.
  // Instead, manually call replenish() to simulate the timer firing.
  // This verifies that replenish() does NOT early-exit when status is 'degraded'.
  await ctrl.replenish();

  assert.equal(fetchCalls.length, 2, 'degraded retry should have called fetchSimilarTracks');
  assert.equal(ctrl.getState().status, 'listening', 'should recover to listening');
  assert.deepEqual(ctrl.getState().candidateIds, ['recovery1']);
  ctrl.destroy();
});

test('defect 1: degraded retry early-exit guard — replenish does NOT fetch for non-applicable statuses', async () => {
  const fetchCalls = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async (seedId, count) => {
      fetchCalls.push({ seedId, count });
      return { ok: true, tracks: [{ id: 'x', title: 'X' }] };
    }
  });

  // Idle state — replenish should early-exit
  await ctrl.replenish();
  assert.equal(fetchCalls.length, 0, 'replenish should not fetch when idle');

  // Stopped state — replenish should early-exit
  // Manually set to stopped via the controller's stopRadio
  // (but we need a session first)
  ctrl.destroy();
});

// ── Defect 2: Track-driven replenishment auto-triggers ──────────────

test('defect 2: onTrackPlayed triggers auto-replenishment when candidate count drops below threshold', async () => {
  const replacedQueues = [];
  const appendedItems = [];
  const fetchCalls = [];
  const fetchSimilarTracks = async (seedId, count) => {
    fetchCalls.push({ seedId, count });
    if (fetchCalls.length === 1) {
      // Initial generation: 3 candidates (above threshold)
      return { ok: true, tracks: [
        { id: 'sim1', title: 'Sim1', duration: 200 },
        { id: 'sim2', title: 'Sim2', duration: 200 },
        { id: 'sim3', title: 'Sim3', duration: 200 }
      ]};
    }
    // Replenishment: return 2 new tracks
    return { ok: true, tracks: [
      { id: 'sim4', title: 'Sim4', duration: 200 },
      { id: 'sim5', title: 'Sim5', duration: 200 }
    ]};
  };

  let queue = mockQueue(['seed1', 'sim1', 'sim2', 'sim3']);
  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => { replacedQueues.push({ items, index }); queue = { items, index }; },
    appendToQueue: (items) => { appendedItems.push(items); queue.items = [...queue.items, ...items]; },
    playTrack: () => {},
    getQueueSnapshot: () => queue,
    fetchSimilarTracks
  });

  // Start radio — gets 3 candidates
  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  assert.equal(ctrl.getState().status, 'listening');
  assert.deepEqual(ctrl.getState().candidateIds, ['sim1', 'sim2', 'sim3']);
  assert.equal(fetchCalls.length, 1);

  // Play sim1 — candidate count drops to 2 (below threshold of 3)
  // markRadioPlayed will transition to 'replenishing'
  // The controller's setState should auto-trigger replenish() via queueMicrotask
  ctrl.onTrackPlayed('sim1');
  assert.equal(ctrl.getState().status, 'replenishing');
  assert.deepEqual(ctrl.getState().candidateIds, ['sim2', 'sim3']);

  // Wait for the auto-triggered replenish microtask + async fetch to complete
  await flushMicrotasks();
  await flushMicrotasks(); // extra flush for the async replenish

  assert.equal(fetchCalls.length, 2, 'auto-replenishment should have called fetchSimilarTracks');
  assert.equal(ctrl.getState().status, 'listening');
  assert.deepEqual(ctrl.getState().candidateIds, ['sim2', 'sim3', 'sim4', 'sim5']);
  assert.equal(appendedItems.length, 1, 'should have appended new items to queue');
  assert.equal(appendedItems[0].length, 2);
  assert.deepEqual(appendedItems[0].map((item) => item.provenance), ['generated', 'generated']);
  ctrl.destroy();
});

test('automatic Journey extension can be disabled without losing played history', async () => {
  const fetchCalls = [];
  const appendedItems = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    appendToQueue: (items) => appendedItems.push(items),
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(['seed1', 'sim1', 'sim2', 'sim3']),
    shouldAutoExtend: false,
    fetchSimilarTracks: async () => {
      fetchCalls.push(true);
      return { ok: true, tracks: [
        { id: 'sim1', title: 'Sim1', duration: 200 },
        { id: 'sim2', title: 'Sim2', duration: 200 },
        { id: 'sim3', title: 'Sim3', duration: 200 }
      ] };
    }
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Journey');
  ctrl.onTrackPlayed('sim1');
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1, 'disabled automatic extension must not fetch a refill');
  assert.equal(appendedItems.length, 0);
  assert.equal(ctrl.getState().status, 'listening');
  assert.deepEqual(ctrl.getState().playedIds, ['sim1']);
  assert.deepEqual(ctrl.getState().candidateIds, ['sim2', 'sim3']);
  ctrl.destroy();
});

test('defect 2: onTrackPlayed does NOT trigger replenishment when above threshold', async () => {
  const fetchCalls = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    appendToQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(['seed1', 'sim1', 'sim2', 'sim3', 'sim4']),
    fetchSimilarTracks: async (seedId, count) => {
      fetchCalls.push({ seedId, count });
      return { ok: true, tracks: [
        { id: 'sim1', title: 'Sim1', duration: 200 },
        { id: 'sim2', title: 'Sim2', duration: 200 },
        { id: 'sim3', title: 'Sim3', duration: 200 },
        { id: 'sim4', title: 'Sim4', duration: 200 }
      ]};
    }
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(ctrl.getState().candidateIds, ['sim1', 'sim2', 'sim3', 'sim4']);

  // Play sim1 — 3 candidates remain, still at threshold (not below)
  ctrl.onTrackPlayed('sim1');
  assert.equal(ctrl.getState().status, 'listening', 'should stay listening when at threshold');
  assert.deepEqual(ctrl.getState().candidateIds, ['sim2', 'sim3', 'sim4']);

  await flushMicrotasks();
  assert.equal(fetchCalls.length, 1, 'should NOT have called fetchSimilarTracks');
  ctrl.destroy();
});

test('replenishment expands the bounded candidate window and appends a second stable-ranked page', async () => {
  const requestCounts = [];
  const appended = [];
  const rankedTracks = Array.from({ length: 30 }, (_, index) => ({
    id: `ranked-${index + 1}`,
    title: `Ranked ${index + 1}`,
    duration: 200
  }));
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    appendToQueue: (items) => appended.push(...items),
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(rankedTracks.map((track) => track.id)),
    fetchSimilarTracks: async (_seedId, count) => {
      requestCounts.push(count);
      return { ok: true, tracks: rankedTracks.slice(0, count) };
    }
  });

  await ctrl.startSongRadio({ id: 'seed', title: 'Seed', duration: 200 });
  for (let index = 1; index <= 10; index += 1) ctrl.onTrackPlayed(`ranked-${index}`);
  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(requestCounts, [12, 24]);
  assert.deepEqual(appended.map((item) => item.song.id), rankedTracks.slice(12, 24).map((track) => track.id));
  ctrl.destroy();
});

test('replenishment escapes an exhausted 50-track neighborhood through a recently played seed', async () => {
  const requests = [];
  const appended = [];
  const originalNeighborhood = Array.from({ length: 50 }, (_, index) => ({
    id: `ranked-${index + 1}`, duration: 200
  }));
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    appendToQueue: (items) => appended.push(...items),
    playTrack: () => {},
    getQueueSnapshot: () => ({
      index: 0,
      items: originalNeighborhood.map((track) => ({ song: { ...track, duration: 0 }, album: null }))
    }),
    fetchSimilarTracks: async (seedId, count) => {
      requests.push([seedId, count]);
      if (seedId === 'ranked-1') {
        return { ok: true, tracks: [{ id: 'beyond-50', duration: 200 }] };
      }
      return { ok: true, tracks: originalNeighborhood.slice(0, count) };
    }
  });

  await ctrl.startSongRadio({ id: 'seed', duration: 200 });
  ctrl.onTrackPlayed('ranked-1');
  await ctrl.replenish();
  await ctrl.replenish();
  await ctrl.replenish();
  await ctrl.replenish();
  await ctrl.replenish();

  assert.ok(requests.some(([seedId, count]) => seedId === 'seed' && count === 50));
  assert.ok(requests.some(([seedId, count]) => seedId === 'ranked-1' && count === 12));
  assert.deepEqual(appended.map((item) => item.song.id).slice(-1), ['beyond-50']);
  assert.equal(ctrl.getState().status, 'listening');
  ctrl.destroy();
});

test('replenishment walks past barren alternate seeds in one pass', async () => {
  const requests = [];
  const appended = [];
  const neighborhood = Array.from({ length: 50 }, (_, index) => ({ id: `ranked-${index + 1}`, duration: 200 }));
  const ctrl = createSonicRadioController({
    replaceQueue: () => {}, appendToQueue: (items) => appended.push(...items), playTrack: () => {},
    getQueueSnapshot: () => mockQueue(neighborhood.map((track) => track.id)),
    fetchSimilarTracks: async (seedId, count) => {
      requests.push([seedId, count]);
      if (seedId === 'ranked-2') return { ok: true, tracks: [{ id: 'beyond-ranked-2', duration: 200 }] };
      return { ok: true, tracks: neighborhood.slice(0, count) };
    }
  });
  await ctrl.startSongRadio({ id: 'seed', duration: 200 });
  for (let index = 1; index <= 50; index += 1) ctrl.onTrackPlayed(`ranked-${index}`);
  for (let index = 0; index < 4; index += 1) await ctrl.replenish();

  assert.ok(requests.some(([seedId]) => seedId === 'ranked-1'));
  assert.ok(requests.some(([seedId]) => seedId === 'ranked-2'));
  assert.deepEqual(appended.map((item) => item.song.id).slice(-1), ['beyond-ranked-2']);
  assert.equal(ctrl.getState().status, 'listening');
  ctrl.destroy();
});

test('replenishment sends played and pending ids as similarity exclusions', async () => {
  const calls = [];
  const tracks = Array.from({ length: 24 }, (_, index) => ({ id: `exclude-${index + 1}`, duration: 200 }));
  const ctrl = createSonicRadioController({
    replaceQueue: () => {}, appendToQueue: () => {}, playTrack: () => {}, getQueueSnapshot: () => mockQueue(tracks.map((track) => track.id)),
    fetchSimilarTracks: async (_seedId, count, options) => {
      calls.push({ count, options });
      return { ok: true, tracks: tracks.slice(0, count) };
    }
  });
  await ctrl.startSongRadio({ id: 'seed', duration: 200 });
  for (let index = 1; index <= 10; index += 1) ctrl.onTrackPlayed(`exclude-${index}`);
  await flushMicrotasks();
  await flushMicrotasks();

  assert.deepEqual(calls[1].options.excludeIds, ['seed', ...tracks.slice(0, 12).map((track) => track.id)]);
  ctrl.destroy();
});

test('an incomplete similarity response retries instead of declaring exhaustion', async () => {
  const tracks = Array.from({ length: 12 }, (_, index) => ({ id: `partial-${index + 1}`, duration: 200 }));
  let calls = 0;
  const ctrl = createSonicRadioController({
    replaceQueue: () => {}, appendToQueue: () => {}, playTrack: () => {}, getQueueSnapshot: () => mockQueue(tracks.map((track) => track.id)),
    fetchSimilarTracks: async () => {
      calls += 1;
      return calls === 1 ? { ok: true, tracks } : { ok: true, tracks: [], partial: true, resolutionIncomplete: true };
    }
  });
  await ctrl.startSongRadio({ id: 'seed', duration: 200 });
  for (const track of tracks) ctrl.onTrackPlayed(track.id);
  await flushMicrotasks();

  assert.notEqual(ctrl.getState().status, 'stopped');
  assert.ok(calls >= 2, 'incomplete results remain retryable instead of ending the session');
  ctrl.destroy();
});

test('an explicitly exhausted empty window rotates instead of degrading', async () => {
  const requests = [];
  const tracks = Array.from({ length: 12 }, (_, index) => ({ id: `empty-window-${index + 1}`, duration: 200 }));
  const appended = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {}, appendToQueue: (items) => appended.push(...items), playTrack: () => {},
    getQueueSnapshot: () => mockQueue(tracks.map((track) => track.id)),
    fetchSimilarTracks: async (seedId, count) => {
      requests.push([seedId, count]);
      if (seedId === 'empty-window-1') {
        return { ok: true, tracks: [{ id: 'rotated-fresh', duration: 200 }], partial: true };
      }
      if (count === 12) return { ok: true, tracks };
      return { ok: true, tracks: [], partial: true, exhausted: true };
    }
  });
  await ctrl.startSongRadio({ id: 'seed', duration: 200 });
  for (const track of tracks) ctrl.onTrackPlayed(track.id);
  await flushMicrotasks();
  await flushMicrotasks();

  assert.ok(requests.some(([seedId, count]) => seedId === 'seed' && count === 50));
  assert.ok(requests.some(([seedId]) => seedId === 'empty-window-1'));
  assert.deepEqual(appended.map((item) => item.song.id).slice(-1), ['rotated-fresh']);
  assert.equal(ctrl.getState().status, 'listening');
  ctrl.destroy();
});

test('a transient alternate-seed failure remains eligible for the next replenish', async () => {
  const requests = [];
  const neighborhood = Array.from({ length: 50 }, (_, index) => ({ id: `ranked-${index + 1}`, duration: 200 }));
  let rankedOneAttempts = 0;
  const appended = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {}, appendToQueue: (items) => appended.push(...items), playTrack: () => {},
    getQueueSnapshot: () => mockQueue(neighborhood.map((track) => track.id)),
    fetchSimilarTracks: async (seedId, count) => {
      requests.push([seedId, count]);
      if (seedId === 'ranked-1') {
        rankedOneAttempts += 1;
        return rankedOneAttempts === 1 ? { ok: false, tracks: [] } : { ok: true, tracks: [{ id: 'recovered', duration: 200 }] };
      }
      return { ok: true, tracks: neighborhood.slice(0, count) };
    }
  });
  await ctrl.startSongRadio({ id: 'seed', duration: 200 });
  for (let index = 1; index <= 50; index += 1) ctrl.onTrackPlayed(`ranked-${index}`);
  for (let index = 0; index < 4; index += 1) await ctrl.replenish();
  await flushMicrotasks();

  assert.ok(requests.filter(([seedId]) => seedId === 'ranked-1').length >= 2);
  assert.deepEqual(appended.map((item) => item.song.id).slice(-1), ['recovered']);
  assert.equal(ctrl.getState().status, 'listening');
  ctrl.destroy();
});

test('radio-owned track changes keep degraded state authoritative and do not bypass retry timing', async () => {
  let fetchCalls = 0;
  const tracks = Array.from({ length: 12 }, (_, index) => ({ id: `track-${index + 1}`, duration: 200 }));
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    appendToQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(tracks.map((track) => track.id)),
    fetchSimilarTracks: async () => {
      fetchCalls += 1;
      return fetchCalls === 1 ? { ok: true, tracks } : { ok: false, tracks: [] };
    },
    maxRetries: 3
  });

  await ctrl.startSongRadio({ id: 'seed', title: 'Seed' });
  for (let index = 1; index <= 10; index += 1) ctrl.onTrackPlayed(`track-${index}`);
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'degraded');
  assert.equal(fetchCalls, 2);

  ctrl.onTrackPlayed('track-11');
  ctrl.onTrackPlayed('track-12');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'degraded');
  assert.equal(fetchCalls, 2, 'track transitions must not trigger immediate degraded retries');
  ctrl.destroy();
});

test('stable exhausted candidate pool stops when the final pending track is consumed', async () => {
  const requestCounts = [];
  const tracks = Array.from({ length: 12 }, (_, index) => ({ id: `only-${index + 1}`, duration: 200 }));
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    appendToQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(tracks.map((track) => track.id)),
    fetchSimilarTracks: async (_seedId, count) => {
      requestCounts.push(count);
      return { ok: true, tracks };
    }
  });

  await ctrl.startSongRadio({ id: 'seed', title: 'Seed' }, 'Finite Radio');
  for (const track of tracks) {
    ctrl.onTrackPlayed(track.id);
    await flushMicrotasks();
  }
  await flushMicrotasks();

  assert.ok(requestCounts.includes(50), 'the bounded window is exhausted before declaring termination');
  assert.equal(ctrl.getState().status, 'stopped');
  assert.match(ctrl.getNotice(), /Save Finite Radio/);
  ctrl.destroy();
});

// ── Additional behavioral tests ─────────────────────────────────────

test('stopRadio invalidates session and transitions to stopped with save prompt', async () => {
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] })
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  assert.equal(ctrl.getState().status, 'listening');

  ctrl.onTrackPlayed('sim1');
  ctrl.stopRadio();

  assert.equal(ctrl.getState().status, 'stopped');
  assert.deepEqual(ctrl.getState().playedIds, ['sim1']);
  assert.match(ctrl.getNotice(), /Save.*Seed1 Radio.*playlist/);
  ctrl.destroy();
});

test('saveAsPlaylist deduplicates playedIds and calls saveAsPlaylistFn', async () => {
  const savedPlaylists = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] }),
    saveAsPlaylistFn: async (name, songIds) => {
      savedPlaylists.push({ name, songIds });
      return { id: 'pl1', name };
    }
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  ctrl.onTrackPlayed('sim1');
  ctrl.onTrackPlayed('sim1'); // duplicate play
  ctrl.stopRadio();

  await ctrl.saveAsPlaylist('My Radio');

  assert.equal(savedPlaylists.length, 1);
  assert.equal(savedPlaylists[0].name, 'My Radio');
  assert.deepEqual(savedPlaylists[0].songIds, ['seed1', 'sim1']); // seed retained; plays deduplicated
  assert.equal(ctrl.getState().status, 'idle');
  ctrl.destroy();
});

test('saveAsPlaylist handles non-Error rejections without throwing a second error', async () => {
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] }),
    saveAsPlaylistFn: async () => { throw null; }
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  ctrl.stopRadio();
  await ctrl.saveAsPlaylist('My Radio');
  assert.equal(ctrl.getNotice(), 'Could not save playlist: unknown error');
  ctrl.destroy();
});

test('dismissSavePrompt resets to idle', async () => {
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] })
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  ctrl.stopRadio();
  assert.equal(ctrl.getState().status, 'stopped');

  ctrl.dismissSavePrompt();
  assert.equal(ctrl.getState().status, 'idle');
  assert.equal(ctrl.getNotice(), '');
  ctrl.destroy();
});

test('isRadioActive reflects session state', async () => {
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] })
  });

  assert.equal(ctrl.isRadioActive(), false);
  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  assert.equal(ctrl.isRadioActive(), true);
  ctrl.stopRadio();
  assert.equal(ctrl.isRadioActive(), false); // stopped is not active
  ctrl.destroy();
});

test('queue items carry radioSessionId', async () => {
  const replacedQueues = [];
  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => replacedQueues.push({ items, index }),
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] })
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  assert.ok(replacedQueues[0].items[0].radioSessionId, 'items should have radioSessionId');
  assert.ok(replacedQueues[0].items[0].radioSessionId.startsWith('radio-'));
  ctrl.destroy();
});

test('degraded recovery respects maxRetries', async () => {
  const fetchCalls = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => {
      fetchCalls.push(Date.now());
      return { ok: false, tracks: [] }; // always fail
    },
    maxRetries: 2
  });

  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  assert.equal(ctrl.getState().status, 'degraded');
  assert.equal(fetchCalls.length, 1);

  // Simulate the two allowed degraded retries.
  await ctrl.replenish();
  assert.equal(fetchCalls.length, 2);
  assert.equal(ctrl.getState().status, 'degraded');

  await ctrl.replenish();
  assert.equal(fetchCalls.length, 3);
  assert.equal(ctrl.getState().status, 'degraded');

  // Direct calls obey the same retry budget as scheduled retries.
  await ctrl.replenish();
  assert.equal(fetchCalls.length, 3);
  assert.equal(ctrl.getState().status, 'degraded');
  ctrl.destroy();
});

test('startSongRadio with no song id sets error notice and does not fetch', async () => {
  const fetchCalls = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => { fetchCalls.push(1); return { ok: true, tracks: [] }; }
  });

  await ctrl.startSongRadio({ id: '', title: 'NoId' }, 'NoId Radio');
  assert.equal(ctrl.getState().status, 'idle');
  assert.match(ctrl.getNotice(), /Cannot start radio/);
  assert.equal(fetchCalls.length, 0);
  ctrl.destroy();
});

test('hook source: useSonicRadio imports createSonicRadioController and does not import excluded modules', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = dirname(fileURLToPath(import.meta.url));
  const hookSource = readFileSync(resolve(root, '../src/useSonicRadio.js'), 'utf8');

  assert.match(hookSource, /createSonicRadioController/);
  assert.doesNotMatch(hookSource, /from\s+['"].*playerQueueState/);
  assert.doesNotMatch(hookSource, /from\s+['"].*queueStore/);
  assert.doesNotMatch(hookSource, /from\s+['"].*main\.jsx/);
  assert.doesNotMatch(hookSource, /audioRef/);
  assert.doesNotMatch(hookSource, /audio\.play/);
  assert.doesNotMatch(hookSource, /audio\.pause/);
});

// ── Lifecycle fix 1: Destroy during generation ─────────────────────

test('lifecycle 1: destroy during generation — late resolve does NOT call replaceQueue/playTrack after unmount', async () => {
  const replacedQueues = [];
  const playedTracks = [];
  const genDeferred = deferred();

  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => replacedQueues.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => genDeferred.promise
  });

  // Start radio (don't await) — enters generating
  const genPromise = ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'generating');

  // Destroy (unmount) while generation is pending
  ctrl.destroy();
  assert.equal(ctrl.isRadioActive(), false);

  // Resolve the pending fetch — should bail because disposed
  genDeferred.resolve({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] });
  await genPromise;
  await flushMicrotasks();

  assert.equal(replacedQueues.length, 0, 'destroyed controller must not replace queue');
  assert.equal(playedTracks.length, 0, 'destroyed controller must not call playTrack');
});

// ── Lifecycle fix 1b: Destroy after scheduling a replenish microtask ─

test('lifecycle 1b: destroy after scheduling replenish microtask — microtask does NOT start a fetch', async () => {
  const fetchCalls = [];
  let queue = mockQueue(['seed1', 'sim1', 'sim2', 'sim3']);

  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => { queue = { items, index }; },
    appendToQueue: (items) => { queue.items = [...queue.items, ...items]; },
    playTrack: () => {},
    getQueueSnapshot: () => queue,
    fetchSimilarTracks: async (seedId, count) => {
      fetchCalls.push({ seedId, count });
      if (fetchCalls.length === 1) {
        return { ok: true, tracks: [
          { id: 'sim1', title: 'Sim1', duration: 200 },
          { id: 'sim2', title: 'Sim2', duration: 200 },
          { id: 'sim3', title: 'Sim3', duration: 200 }
        ]};
      }
      return { ok: true, tracks: [{ id: 'sim4', title: 'Sim4', duration: 200 }] };
    }
  });

  // Start radio — gets 3 candidates
  await ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  assert.equal(fetchCalls.length, 1);

  // Play sim1 — drops candidate count to 2 (below threshold 3)
  // This transitions to 'replenishing' and schedules a microtask.
  ctrl.onTrackPlayed('sim1');
  assert.equal(ctrl.getState().status, 'replenishing');

  // Destroy BEFORE the microtask fires
  ctrl.destroy();

  // Now flush microtasks — the microtask should check disposed and bail
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(fetchCalls.length, 1, 'destroyed controller must not start replenish fetch');
});

// ── Lifecycle fix 2: Save-A then start-B before save resolves ───────

test('lifecycle 2: save-A then start-B before save resolves — save completion does NOT erase B', async () => {
  const replacedQueues = [];
  const playedTracks = [];
  const saveDeferred = deferred();
  const bDeferred = deferred();

  let fetchCallCount = 0;
  const fetchSimilarTracks = async (seedId, count) => {
    fetchCallCount++;
    if (fetchCallCount === 1) {
      // A's initial generation
      return { ok: true, tracks: [{ id: 'simA', title: 'SimA' }] };
    }
    // B's generation
    return bDeferred.promise;
  };

  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => replacedQueues.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks,
    saveAsPlaylistFn: async () => saveDeferred.promise
  });

  // Start radio A
  await ctrl.startSongRadio({ id: 'seedA', title: 'SeedA' }, 'A Radio');
  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().seedId, 'seedA');

  // Stop and start save
  ctrl.stopRadio();
  assert.equal(ctrl.getState().status, 'stopped');

  const savePromise = ctrl.saveAsPlaylist('My A Radio');

  // While save is pending, start radio B (don't await)
  const bPromise = ctrl.startSongRadio({ id: 'seedB', title: 'SeedB' }, 'B Radio');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'generating');
  assert.equal(ctrl.getState().seedId, 'seedB');

  // Resolve the save — A's save completion should bail because B took over
  saveDeferred.resolve({ id: 'pl1', name: 'My A Radio' });
  await savePromise;
  await flushMicrotasks();

  // B's session should still be active; A's save completion should NOT have reset
  assert.equal(ctrl.getState().status, 'generating', 'B should still be generating');
  assert.equal(ctrl.getState().seedId, 'seedB', 'B should still own the session');

  // Resolve B's fetch
  bDeferred.resolve({ ok: true, tracks: [{ id: 'simB', title: 'SimB' }] });
  await bPromise;
  await flushMicrotasks();

  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().seedId, 'seedB');
  assert.deepEqual(ctrl.getState().candidateIds, ['simB']);
});

test('lifecycle 2b: save-A then start-B before save rejects — save error does NOT overwrite B notice', async () => {
  const saveDeferred = deferred();
  const bDeferred = deferred();

  let fetchCallCount = 0;
  const fetchSimilarTracks = async () => {
    fetchCallCount++;
    if (fetchCallCount === 1) return { ok: true, tracks: [{ id: 'simA', title: 'SimA' }] };
    return bDeferred.promise;
  };

  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks,
    saveAsPlaylistFn: async () => saveDeferred.promise
  });

  // Start A, stop, save
  await ctrl.startSongRadio({ id: 'seedA', title: 'SeedA' }, 'A Radio');
  ctrl.stopRadio();
  const savePromise = ctrl.saveAsPlaylist('A Radio');

  // Start B while save is pending
  const bPromise = ctrl.startSongRadio({ id: 'seedB', title: 'SeedB' }, 'B Radio');
  await flushMicrotasks();

  // Reject the save — error should NOT overwrite B's notice
  saveDeferred.reject(new Error('Network failure'));
  await savePromise.catch(() => {}); // swallow expected rejection
  await flushMicrotasks();

  assert.equal(ctrl.getState().seedId, 'seedB');
  assert.match(ctrl.getNotice(), /Finding tracks for SeedB|Starting/, 'B notice should be intact, not save error');

  // Resolve B
  bDeferred.resolve({ ok: true, tracks: [{ id: 'simB', title: 'SimB' }] });
  await bPromise;
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'listening');
  ctrl.destroy();
});

// ── Lifecycle fix 3: Invalid start while A is active ────────────────

test('lifecycle 3: invalid startSongRadio (no song id) while A is active does NOT change session token', async () => {
  const fetchCalls = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async (seedId, count) => {
      fetchCalls.push({ seedId, count });
      return { ok: true, tracks: [{ id: 'simA', title: 'SimA' }] };
    }
  });

  // Start A
  await ctrl.startSongRadio({ id: 'seedA', title: 'SeedA' }, 'A Radio');
  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().seedId, 'seedA');
  assert.equal(fetchCalls.length, 1);

  // Invalid start: no song id — should set notice but NOT change session
  await ctrl.startSongRadio({ id: '', title: 'NoId' }, 'NoId Radio');
  assert.match(ctrl.getNotice(), /Cannot start radio/);
  assert.equal(ctrl.getState().status, 'listening', 'A should still be listening');
  assert.equal(ctrl.getState().seedId, 'seedA', 'A should still own the session');

  // onTrackPlayed should still work for A's session
  ctrl.onTrackPlayed('simA');
  assert.deepEqual(ctrl.getState().playedIds, ['simA'], 'tracking should still work for A');
  ctrl.destroy();
});

test('lifecycle 3b: invalid startArtistRadio (no search) while A is active does NOT change session token', async () => {
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'simA', title: 'SimA' }] }),
    // No searchNavidrome provided
  });

  // Start A
  await ctrl.startSongRadio({ id: 'seedA', title: 'SeedA' }, 'A Radio');
  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().seedId, 'seedA');

  // Invalid artist start: no search available — should NOT change session
  await ctrl.startArtistRadio('Some Artist', 'Some Artist Radio');
  assert.match(ctrl.getNotice(), /Cannot start artist radio/);
  assert.equal(ctrl.getState().status, 'listening', 'A should still be listening');
  assert.equal(ctrl.getState().seedId, 'seedA', 'A should still own the session');
  ctrl.destroy();
});

test('artist search failure stops without retrying similarity with an artist name', async () => {
  const similarityCalls = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async (seedId) => {
      similarityCalls.push(seedId);
      return { ok: true, tracks: [] };
    },
    searchNavidrome: async () => { throw new Error('search unavailable'); }
  });

  await ctrl.startArtistRadio('Artist Name', 'Artist Name Radio');
  assert.equal(ctrl.getState().status, 'stopped');
  assert.match(ctrl.getNotice(), /Could not load tracks/);
  await ctrl.replenish();
  assert.deepEqual(similarityCalls, []);
  ctrl.destroy();
});

test('artist radio uses the first search result as its song seed and preserves the label', async () => {
  const similarityCalls = [];
  const playedTracks = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async (seedId) => {
      similarityCalls.push(seedId);
      return { ok: true, tracks: [{ id: 'similar-1', title: 'Similar' }] };
    },
    searchNavidrome: async () => [{ id: 'artist-song-1', title: 'Seed Song' }]
  });

  await ctrl.startArtistRadio('Artist Name', 'Custom Artist Radio');
  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getState().seedId, 'artist-song-1');
  assert.equal(ctrl.getState().seedLabel, 'Custom Artist Radio');
  assert.deepEqual(similarityCalls, ['artist-song-1']);
  assert.equal(playedTracks[0].song.id, 'artist-song-1');
  ctrl.destroy();
});

test('Artist Journey retains stable artist identity and guarantees a mixed queue', async () => {
  const queues = [];
  const similaritySeeds = [];
  const ctrl = createSonicRadioController({
    replaceQueue: (items) => queues.push(items),
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchArtistSongs: async (artistId) => {
      assert.equal(artistId, 'artist-1');
      return [{ id: 'seed-song', title: 'Seed', artistId: 'artist-1' }];
    },
    fetchSimilarTracks: async (seedId) => {
      similaritySeeds.push(seedId);
      return { ok: true, tracks: [
        { id: 'same', artistId: 'artist-1' },
        { id: 'other', artistId: 'artist-2' }
      ] };
    }
  });
  await ctrl.startArtistJourney({ id: 'artist-1', name: 'Artist One' });
  assert.deepEqual(similaritySeeds, ['seed-song']);
  assert.equal(ctrl.getState().seedType, 'artist');
  assert.equal(ctrl.getState().seedId, 'artist-1');
  assert.equal(ctrl.getState().seedSongId, 'seed-song');
  assert.equal(queues[0][0].song.id, 'seed-song');
  assert.equal(queues[0][1].song.id, 'other');
  ctrl.destroy();
});

test('Track Journey uses the exact song seed and preserves its Journey label', async () => {
  const similaritySeeds = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async (seedId) => {
      similaritySeeds.push(seedId);
      return { ok: true, tracks: [{ id: 'similar-1', artistId: 'artist-2' }] };
    }
  });
  await ctrl.startTrackJourney({ id: 'track-1', title: 'Seed Track' }, 'Seed Track Journey');
  assert.deepEqual(similaritySeeds, ['track-1']);
  assert.equal(ctrl.getState().seedType, 'song');
  assert.equal(ctrl.getState().seedId, 'track-1');
  assert.equal(ctrl.getState().seedSongId, 'track-1');
  assert.equal(ctrl.getState().seedLabel, 'Seed Track Journey');
  ctrl.destroy();
});

test('Artist Journey refuses an all-same-artist result without replacing the queue', async () => {
  let replacements = 0;
  const ctrl = createSonicRadioController({
    replaceQueue: () => { replacements += 1; },
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchArtistSongs: async () => [{ id: 'seed-song', artistId: 'artist-1' }],
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'same', artistId: 'artist-1' }] })
  });
  await ctrl.startArtistJourney({ id: 'artist-1', name: 'Artist One' });
  assert.equal(replacements, 0);
  assert.equal(ctrl.getState().status, 'stopped');
  assert.match(ctrl.getNotice(), /mixed Artist Journey/);
  ctrl.destroy();
});

test('Genre Journey retains genre identity while similarity and replenishment use a song id', async () => {
  const seeds = [];
  const ctrl = createSonicRadioController({
    replaceQueue: () => {}, appendToQueue: () => {}, playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchGenreSongs: async (genre) => {
      assert.equal(genre, 'Jazz');
      return [{ id: 'jazz-seed', genre: 'Jazz' }];
    },
    fetchSimilarTracks: async (seedId) => {
      seeds.push(seedId);
      return { ok: true, tracks: [{ id: `candidate-${seeds.length}` }] };
    }
  });
  await ctrl.startGenreJourney({ value: 'Jazz' });
  assert.equal(ctrl.getState().seedType, 'genre');
  assert.equal(ctrl.getState().seedId, 'Jazz');
  assert.equal(ctrl.getState().seedSongId, 'jazz-seed');
  await ctrl.replenish();
  assert.deepEqual(seeds, ['jazz-seed', 'jazz-seed']);
  ctrl.destroy();
});

test('Artist DJ is finite, exact-artist-only, and never invokes similarity', async () => {
  const queues = [];
  let similarityCalls = 0;
  const ctrl = createSonicRadioController({
    replaceQueue: (items) => queues.push(items), playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchArtistSongs: async () => [
      { id: 'one', artistId: 'artist-1' },
      { id: 'two', artistId: 'artist-1' }
    ],
    fetchSimilarTracks: async () => { similarityCalls += 1; return { ok: true, tracks: [] }; }
  });
  await ctrl.startArtistDj({ id: 'artist-1', name: 'Artist One' });
  assert.equal(ctrl.getState().sessionKind, 'artist-dj');
  assert.equal(ctrl.getState().seedId, 'artist-1');
  assert.deepEqual(queues[0].map((item) => item.song.id), ['one', 'two']);
  ctrl.onTrackPlayed('one');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'listening');
  assert.equal(ctrl.getNotice(), '');
  assert.equal(similarityCalls, 0);
  ctrl.onTrackPlayed('two');
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'stopped');
  assert.equal(similarityCalls, 0);
  ctrl.destroy();
});

// ── Lifecycle fix 2c: Dismiss while save pending, then rejection ───

test('lifecycle 2c: dismiss while save pending — late rejection does NOT resurrect error notice', async () => {
  const firstSaveDeferred = deferred();
  const secondSaveDeferred = deferred();
  let saveCallCount = 0;

  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'simA', title: 'SimA' }] }),
    saveAsPlaylistFn: async () => {
      saveCallCount += 1;
      return saveCallCount === 1 ? firstSaveDeferred.promise : secondSaveDeferred.promise;
    }
  });

  // Start A, stop, start save
  await ctrl.startSongRadio({ id: 'seedA', title: 'SeedA' }, 'A Radio');
  ctrl.stopRadio();
  assert.equal(ctrl.getState().status, 'stopped');

  const savePromise = ctrl.saveAsPlaylist('A Radio');
  await flushMicrotasks();

  // Dismiss the save prompt while the save is pending
  ctrl.dismissSavePrompt();
  assert.equal(ctrl.getState().status, 'idle');
  assert.equal(ctrl.getNotice(), '');

  // Reject the save — the stale rejection should bail, NOT set an error notice
  firstSaveDeferred.reject(new Error('Network failure'));
  await savePromise.catch(() => {});
  await flushMicrotasks();

  assert.equal(ctrl.getState().status, 'idle', 'dismissed save rejection must not resurrect stopped state');
  assert.equal(ctrl.getNotice(), '', 'dismissed save rejection must not set error notice');

  await ctrl.startSongRadio({ id: 'seedB', title: 'SeedB' }, 'B Radio');
  ctrl.stopRadio();
  const secondSave = ctrl.saveAsPlaylist('B Radio');
  await flushMicrotasks();
  assert.equal(saveCallCount, 2, 'a later session must issue a new save request');
  assert.equal(ctrl.getNotice(), 'Saving playlist...', 'a later session must not inherit a stuck save lock');
  secondSaveDeferred.resolve({ id: 'playlist-b' });
  await secondSave;
  assert.equal(ctrl.getState().status, 'idle');
  assert.equal(ctrl.getNotice(), '');
  ctrl.destroy();
});

// ── Lifecycle fix 2d: playlist saves are single-flight ───────────

test('lifecycle 2d: repeated save requests create only one playlist while pending', async () => {
  const saveDeferred = deferred();
  let saveCallCount = 0;
  const saveAsPlaylistFn = async () => {
    saveCallCount += 1;
    return saveDeferred.promise;
  };

  const ctrl = createSonicRadioController({
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'simA', title: 'SimA' }] }),
    saveAsPlaylistFn
  });

  await ctrl.startSongRadio({ id: 'seedA', title: 'SeedA' }, 'A Radio');
  ctrl.stopRadio();
  assert.equal(ctrl.getState().status, 'stopped');

  const save1Promise = ctrl.saveAsPlaylist('Save 1');
  await flushMicrotasks();
  const save2Promise = ctrl.saveAsPlaylist('Save 2');
  await flushMicrotasks();
  assert.equal(saveCallCount, 1);

  saveDeferred.resolve({ id: 'pl1', name: 'Save 1' });
  await save1Promise;
  await save2Promise;
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'idle');
  assert.equal(ctrl.getNotice(), '');
  ctrl.destroy();
});

// ── Retry reset after successful recovery ───────────────────────────

test('retry reset: degraded retries consume budget, then successful recovery resets it for a fresh cycle', async () => {
  const replacedQueues = [];
  const playedTracks = [];
  const fetchDeferreds = [];

  function makeFetchDeferred() {
    const d = deferred();
    fetchDeferreds.push(d);
    return d;
  }

  let fetchIndex = 0;
  const fetchFn = async (seedId, count) => {
    fetchIndex++;
    const d = makeFetchDeferred();
    return d.promise;
  };

  const ctrl = createSonicRadioController({
    replaceQueue: (items, index) => replacedQueues.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: fetchFn,
    maxRetries: 3
  });

  // Start radio — first fetch is the initial generation
  const startPromise = ctrl.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();

  // Fetch 0 (initial generation) — fail to enter degraded
  fetchDeferreds[0].resolve({ ok: false, tracks: [] });
  await startPromise;
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'degraded');

  // Manually call replenish() to simulate the retry timer firing
  // (avoids waiting 60 seconds for the real timer)
  const replenish1 = ctrl.replenish();
  await flushMicrotasks();

  // Fetch 1 (retry 1) — fail again
  fetchDeferreds[1].resolve({ ok: false, tracks: [] });
  await replenish1;
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'degraded');

  // Manually call replenish() again for retry 2
  const replenish2 = ctrl.replenish();
  await flushMicrotasks();

  // Fetch 2 (retry 2) — succeed, should reset retryCount to 0
  fetchDeferreds[2].resolve({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] });
  await replenish2;
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'listening');

  // Now trigger a new independent degradation cycle by failing replenishment
  const replenish3 = ctrl.replenish();
  await flushMicrotasks();

  // Fetch 3 (new degradation) — fail to enter degraded
  fetchDeferreds[3].resolve({ ok: false, tracks: [] });
  await replenish3;
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'degraded');

  // The new degradation cycle should have a fresh retry budget (maxRetries=3)
  // because retryCount was reset after the successful recovery.
  // Manually call replenish() for retry 1 of the new cycle
  const replenish4 = ctrl.replenish();
  await flushMicrotasks();

  // Fetch 4 (retry 1 of new cycle) — succeed
  fetchDeferreds[4].resolve({ ok: true, tracks: [{ id: 'sim2', title: 'Sim2' }] });
  await replenish4;
  await flushMicrotasks();
  assert.equal(ctrl.getState().status, 'listening',
    'should recover in the new degradation cycle with a fresh retry budget');

  ctrl.destroy();
});

test('stop invalidates pending exact seed lookups before they can replace playback', async () => {
  for (const method of ['startArtistJourney', 'startGenreJourney', 'startArtistDj']) {
    const lookup = deferred();
    const replacedQueues = [];
    const playedTracks = [];
    const ctrl = createSonicRadioController({
      replaceQueue: (items) => replacedQueues.push(items),
      playTrack: (item) => playedTracks.push(item),
      getQueueSnapshot: () => mockQueue(),
      fetchSimilarTracks: async () => ({ ok: true, tracks: [{ id: 'other', artistId: 'other-artist' }] }),
      fetchArtistSongs: async () => lookup.promise,
      fetchGenreSongs: async () => lookup.promise
    });
    const start = method === 'startGenreJourney'
      ? ctrl[method]({ value: 'Jazz' })
      : ctrl[method]({ id: 'artist-1', name: 'Artist One' });
    ctrl.stopRadio();
    lookup.resolve([{ id: 'seed', artistId: 'artist-1' }]);
    await start;
    await flushMicrotasks();
    assert.equal(replacedQueues.length, 0, `${method} replaced the queue after stop`);
    assert.equal(playedTracks.length, 0, `${method} played after stop`);
    assert.equal(ctrl.getState().status, 'stopped');
    ctrl.destroy();
  }
});

test('destroy invalidates a pending Artist DJ lookup before it can replace playback', async () => {
  const lookup = deferred();
  const replacedQueues = [];
  const playedTracks = [];
  const ctrl = createSonicRadioController({
    replaceQueue: (items) => replacedQueues.push(items),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchArtistSongs: async () => lookup.promise,
    fetchSimilarTracks: async () => ({ ok: true, tracks: [] })
  });
  const start = ctrl.startArtistDj({ id: 'artist-1', name: 'Artist One' });
  ctrl.destroy();
  lookup.resolve([{ id: 'seed', artistId: 'artist-1' }]);
  await start;
  await flushMicrotasks();
  assert.equal(replacedQueues.length, 0);
  assert.equal(playedTracks.length, 0);
});

test('Artist Journey does not use fuzzy fallback when AudioMuse is unavailable', async () => {
  const replacedQueues = [];
  let fallbackCalls = 0;
  const ctrl = createSonicRadioController({
    replaceQueue: (items) => replacedQueues.push(items),
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({ ok: false, tracks: [] }),
    fetchArtistSongs: async () => [{ id: 'seed', artistId: 'artist-1' }],
    searchNavidrome: async () => { fallbackCalls += 1; return [{ id: 'fuzzy' }]; }
  });
  await ctrl.startArtistJourney({ id: 'artist-1', name: 'Artist One' });
  assert.equal(fallbackCalls, 0);
  assert.equal(replacedQueues.length, 0);
  assert.equal(ctrl.getState().status, 'stopped');
  assert.match(ctrl.getNotice(), /AudioMuse similarity is unavailable/);
  ctrl.destroy();
});

test('Journey survives queue serialization and refills beyond 13 songs without taking over playback',async()=>{
 let q={items:[],index:0},requests=0,starts=0;
 const deps={replaceQueue:(items,index)=>{q={items,index,source:{kind:'radio'}};},appendToQueue:items=>q.items.push(...items),playTrack:()=>starts++,getQueueSnapshot:()=>q,fetchSimilarTracks:async()=>({ok:true,tracks:Array.from({length:12},(_,i)=>({id:`batch${requests}-${i}`,duration:180}))})};
 const fetch=deps.fetchSimilarTracks;deps.fetchSimilarTracks=async()=>{requests++;return fetch();};
 let controller=createSonicRadioController(deps);await controller.startTrackJourney({id:'seed',title:'Seed'});assert.equal(q.items.length,13);controller.destroy();
 q=JSON.parse(JSON.stringify({...q,index:10}));controller=createSonicRadioController(deps);
 assert.equal(controller.restoreQueueSession(q),true);assert.equal(starts,1,'restoration does not call playTrack');assert.equal(requests,1,'restoration does not fetch until listening');
 for(let i=10;i<40;i++){q.index=i;assert.ok(q.items[i],`Journey has track ${i+1}`);controller.onTrackPlayed(q.items[i].song.id);await flushMicrotasks();}
 assert.ok(q.items.length>40);assert.equal(new Set(q.items.map(x=>x.song.id)).size,q.items.length);controller.stopRadio();assert.equal(controller.restoreQueueSession(q),false,'stopped Journey stays stopped');controller.destroy();
});
test('restored Artist DJ remains finite and ordinary queues never acquire a feeder',async()=>{
 let q;const deps={replaceQueue:(items,index)=>q={items,index,source:{kind:'radio'}},playTrack:()=>{},getQueueSnapshot:()=>q,fetchArtistSongs:async()=>[{id:'a'},{id:'b'}],fetchSimilarTracks:async()=>{throw new Error('finite DJ cannot generate');}};
 let controller=createSonicRadioController(deps);await controller.startArtistDj({id:'artist',name:'Artist'});controller.destroy();controller=createSonicRadioController(deps);
 assert.equal(controller.restoreQueueSession({...q,source:{kind:'album'}}),false);assert.equal(controller.restoreQueueSession(q),true);controller.onTrackPlayed('a');controller.onTrackPlayed('b');assert.equal(controller.getState().status,'stopped');controller.destroy();
});
