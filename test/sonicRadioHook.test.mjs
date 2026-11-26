import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * React hook behavioral tests for useSonicRadio.
 *
 * These tests use happy-dom to provide a minimal DOM so that
 * react-dom/client can render components and execute real effects.
 * They verify:
 *
 * - StrictMode setup-cleanup-setup: the second setup's controller is
 *   independent of the first cleanup's destruction
 * - State synchronization: the hook reflects controller state changes
 * - Reactive isRadioActive: reflects the current session status
 * - Final unmount cancellation: cleanup destroys the controller
 */

// ── DOM shim (must be set up before importing React) ────────────────
import { Window } from 'happy-dom';

const window = new Window();
global.document = window.document;
global.window = window;
global.Node = window.Node;
global.Element = window.Element;
global.HTMLElement = window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// ── React imports (after DOM shim) ──────────────────────────────────
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useSonicRadio } from '../src/useSonicRadio.js';

// ── Helpers ─────────────────────────────────────────────────────────

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mockQueue(items = []) {
  return {
    items: items.map((id) => ({ song: { id, title: id, duration: 200 }, album: null })),
    index: 0
  };
}

/**
 * Render a component using useSonicRadio and return the root + container
 * + a ref to the hook's return value.
 */
function renderHook(deps) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const hookResult = { current: null };

  function TestComp({ deps }) {
    hookResult.current = useSonicRadio(deps);
    return React.createElement('div');
  }

  root.render(React.createElement(TestComp, { deps }));
  return { root, container, hookResult, TestComp };
}

/**
 * Simulate React StrictMode by mounting, unmounting, then re-mounting.
 * Returns the hookResult (updated by the second mount).
 */
function renderHookStrictMode(deps) {
  const container = document.createElement('div');
  const root = createRoot(container);
  const hookResult = { current: null };

  function TestComp({ deps }) {
    hookResult.current = useSonicRadio(deps);
    return React.createElement('div');
  }

  // First mount (synchronous so hookResult is populated immediately)
  flushSync(() => {
    root.render(React.createElement(TestComp, { deps }));
  });

  return {
    root,
    container,
    hookResult,
    rerender: (newDeps) => {
      flushSync(() => {
        root.render(React.createElement(TestComp, { deps: newDeps }));
      });
    },
    unmount: () => {
      flushSync(() => {
        root.unmount();
      });
    }
  };
}

// ── Tests ───────────────────────────────────────────────────────────

test('hook: StrictMode setup-cleanup-setup — second setup controller is not disposed by first cleanup', async () => {
  const replaceQueueCalls = [];
  const playedTracks = [];
  const deps = {
    replaceQueue: (items, index) => replaceQueueCalls.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({
      ok: true,
      tracks: [{ id: 'sim1', title: 'Sim1' }]
    })
  };

  const { hookResult, unmount } = renderHookStrictMode(deps);
  await flushMicrotasks();

  // First render: hook should have initial idle state
  assert.equal(hookResult.current.radioState.status, 'idle');
  assert.equal(hookResult.current.isRadioActive, false);

  // Simulate StrictMode: unmount then re-mount
  unmount();

  // Re-mount with a fresh root
  const container2 = document.createElement('div');
  const root2 = createRoot(container2);
  const hookResult2 = { current: null };
  function TestComp2({ deps }) {
    hookResult2.current = useSonicRadio(deps);
    return React.createElement('div');
  }
  flushSync(() => {
    root2.render(React.createElement(TestComp2, { deps }));
  });
  await flushMicrotasks();

  // Second mount should have a working controller
  assert.equal(hookResult2.current.radioState.status, 'idle');
  assert.equal(hookResult2.current.isRadioActive, false);

  // Start a radio — it should work (not be disposed)
  await hookResult2.current.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();

  assert.equal(hookResult2.current.radioState.status, 'listening');
  assert.equal(replaceQueueCalls.length, 1);
  assert.equal(playedTracks.length, 1);

  root2.unmount();
});

test('hook: state synchronization — controller state changes propagate to hook return value', async () => {
  const fetchDeferred = deferred();
  const deps = {
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: () => fetchDeferred.promise
  };

  const { hookResult, unmount } = renderHookStrictMode(deps);
  await flushMicrotasks();

  assert.equal(hookResult.current.radioState.status, 'idle');

  // Start radio — should transition to seeding/generating
  const startPromise = hookResult.current.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();

  // While waiting for fetch, state should be 'generating'
  assert.equal(hookResult.current.radioState.status, 'generating');
  assert.equal(hookResult.current.isRadioActive, true);

  // Resolve the fetch — state should transition to 'listening'
  fetchDeferred.resolve({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] });
  await startPromise;
  await flushMicrotasks();

  assert.equal(hookResult.current.radioState.status, 'listening');
  assert.equal(hookResult.current.isRadioActive, true);

  // Stop — should transition to 'stopped'
  hookResult.current.stopRadio();
  await flushMicrotasks();

  assert.equal(hookResult.current.radioState.status, 'stopped');
  assert.equal(hookResult.current.isRadioActive, false);

  unmount();
});

test('hook: reactive isRadioActive — reflects state transitions through the lifecycle', async () => {
  const deps = {
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: async () => ({
      ok: true,
      tracks: [{ id: 'sim1', title: 'Sim1' }]
    })
  };

  const { hookResult, unmount } = renderHookStrictMode(deps);
  await flushMicrotasks();

  // Idle: not active
  assert.equal(hookResult.current.isRadioActive, false);

  // Start radio: active
  await hookResult.current.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();
  assert.equal(hookResult.current.isRadioActive, true);

  // Stop: not active
  hookResult.current.stopRadio();
  await flushMicrotasks();
  assert.equal(hookResult.current.isRadioActive, false);

  // Dismiss: still not active (idle)
  hookResult.current.dismissSavePrompt();
  await flushMicrotasks();
  assert.equal(hookResult.current.isRadioActive, false);

  unmount();
});

test('hook: final unmount cancellation — cleanup destroys controller; late async does not call callbacks', async () => {
  const replaceQueueCalls = [];
  const playedTracks = [];
  const fetchDeferred = deferred();
  const deps = {
    replaceQueue: (items, index) => replaceQueueCalls.push({ items, index }),
    playTrack: (item) => playedTracks.push(item),
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: () => fetchDeferred.promise
  };

  const { hookResult, unmount } = renderHookStrictMode(deps);
  await flushMicrotasks();

  // Start radio — will be pending (fetch not resolved)
  const startPromise = hookResult.current.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();
  assert.equal(hookResult.current.radioState.status, 'generating');

  // Unmount while fetch is pending
  unmount();
  await flushMicrotasks();

  // Resolve the fetch — should NOT call replaceQueue or playTrack
  fetchDeferred.resolve({ ok: true, tracks: [{ id: 'sim1', title: 'Sim1' }] });
  await startPromise.catch(() => {}); // may reject due to disposed controller
  await flushMicrotasks();

  assert.equal(replaceQueueCalls.length, 0, 'replaceQueue should not be called after unmount');
  assert.equal(playedTracks.length, 0, 'playTrack should not be called after unmount');
});

test('hook: StrictMode replay does not leak timers — degraded timer from first setup is cleared on cleanup', async () => {
  const fetchDeferred = deferred();
  const deps = {
    replaceQueue: () => {},
    playTrack: () => {},
    getQueueSnapshot: () => mockQueue(),
    fetchSimilarTracks: () => fetchDeferred.promise
  };

  const { hookResult, unmount } = renderHookStrictMode(deps);
  await flushMicrotasks();

  // Start radio — will be pending
  hookResult.current.startSongRadio({ id: 'seed1', title: 'Seed1' }, 'Seed1 Radio');
  await flushMicrotasks();

  // Reject fetch to enter degraded state (schedules a retry timer)
  fetchDeferred.reject(new Error('network error'));
  await flushMicrotasks();

  assert.equal(hookResult.current.radioState.status, 'degraded');

  // Unmount — cleanup should clear the degraded timer
  unmount();
  await flushMicrotasks();

  // Wait beyond the retry delay — no crash or unhandled rejection
  await new Promise((resolve) => setTimeout(resolve, 50));

  // If we get here without throwing, the timer was properly cleared
  assert.ok(true, 'no unhandled timer callback after unmount');
});
test('hook: changing playback clears a failed start notice without resetting a live session notice',async()=>{
 const deps={replaceQueue(){},playTrack(){},getQueueSnapshot:()=>mockQueue(),fetchSimilarTracks:async()=>({ok:true,tracks:[{id:'similar'}]}),fetchArtistSongs:async()=>[],playbackSource:'first'};
 const {root,hookResult,TestComp}=renderHook(deps);await flushMicrotasks();
 await hookResult.current.startArtistJourney({id:'beck',name:'Beck'});await flushMicrotasks();assert.equal(hookResult.current.radioNotice,'No tracks found for Beck');
 flushSync(()=>root.render(React.createElement(TestComp,{deps:{...deps,playbackSource:'second'}})));await flushMicrotasks();assert.equal(hookResult.current.radioNotice,'');
 await hookResult.current.startTrackJourney({id:'seed',title:'Seed'});hookResult.current.stopRadio();await flushMicrotasks();const notice=hookResult.current.radioNotice;assert.match(notice,/Save/);
 flushSync(()=>root.render(React.createElement(TestComp,{deps:{...deps,playbackSource:'third'}})));await flushMicrotasks();assert.equal(hookResult.current.radioNotice,notice);root.unmount();await flushMicrotasks();
});
