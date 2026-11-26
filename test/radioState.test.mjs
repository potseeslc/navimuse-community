import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIdleRadioSession,
  beginRadioSeeding,
  beginRadioGeneration,
  acceptRadioCandidates,
  markRadioPlayed,
  degradeRadioSession,
  stopRadioSession,
  resetRadioSession,
  radioNeedsReplenishment,
  isRadioDuplicate
} from '../src/radioState.js';

test('createIdleRadioSession returns a valid idle state', () => {
  const state = createIdleRadioSession();
  assert.equal(state.status, 'idle');
  assert.equal(state.seedType, '');
  assert.equal(state.seedId, '');
  assert.equal(state.seedLabel, '');
  assert.deepEqual(state.playedIds, []);
  assert.deepEqual(state.candidateIds, []);
  assert.equal(state.replenishThreshold, 3);
  assert.equal(state.maxHistorySize, 50);
  assert.equal(state.startedAt, 0);
  assert.equal(state.degradedRetryAt, 0);
  assert.equal(state.seedSongId, '');
  assert.equal(state.sessionKind, 'journey');
  assert.equal(state.schemaVersion, 2);
});

test('beginRadioSeeding transitions from idle to seeding with seed info', () => {
  const idle = createIdleRadioSession();
  const seeding = beginRadioSeeding(idle, { seedType: 'song', seedId: 'song-1', seedLabel: 'Song Radio' });
  assert.equal(seeding.status, 'seeding');
  assert.equal(seeding.seedType, 'song');
  assert.equal(seeding.seedId, 'song-1');
  assert.equal(seeding.seedLabel, 'Song Radio');
  assert.ok(seeding.startedAt > 0);
  assert.deepEqual(seeding.playedIds, []);
  assert.deepEqual(seeding.candidateIds, []);
});

test('beginRadioGeneration transitions from seeding to generating', () => {
  const idle = createIdleRadioSession();
  const seeding = beginRadioSeeding(idle, { seedType: 'artist', seedId: 'beatles', seedLabel: 'Beatles Radio' });
  const generating = beginRadioGeneration(seeding);
  assert.equal(generating.status, 'generating');
});

test('beginRadioGeneration is a no-op from non-seeding states', () => {
  const idle = createIdleRadioSession();
  const result = beginRadioGeneration(idle);
  assert.equal(result.status, 'idle');
});

test('acceptRadioCandidates adds candidates and transitions to listening', () => {
  const idle = createIdleRadioSession();
  const seeding = beginRadioSeeding(idle, { seedType: 'genre', seedId: 'jazz', seedLabel: 'Jazz Radio' });
  const generating = beginRadioGeneration(seeding);
  const listening = acceptRadioCandidates(generating, ['song-a', 'song-b', 'song-c']);
  assert.equal(listening.status, 'listening');
  assert.deepEqual(listening.candidateIds, ['song-a', 'song-b', 'song-c']);
});

test('acceptRadioCandidates deduplicates seeds, history, pending items, and its input', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'replenishing',
    seedId: 'seed',
    playedIds: ['played'],
    candidateIds: ['pending']
  };
  const next = acceptRadioCandidates(state, ['seed', 'played', 'pending', 'new', 'new', '', null]);
  assert.deepEqual(next.candidateIds, ['pending', 'new']);
  assert.equal(next.status, 'listening');
});

test('artist identity remains distinct from the playable similarity seed', () => {
  const state = beginRadioSeeding(createIdleRadioSession(), {
    seedType: 'artist', seedId: 'artist-1', seedSongId: 'song-1',
    seedLabel: 'Artist Journey', sessionKind: 'journey'
  });
  assert.equal(state.seedId, 'artist-1');
  assert.equal(state.seedSongId, 'song-1');
  const listening = acceptRadioCandidates(beginRadioGeneration(state), ['song-1', 'song-2']);
  assert.deepEqual(listening.candidateIds, ['song-2']);
});

test('acceptRadioCandidates clears a stale degraded retry deadline on recovery', () => {
  const degraded = degradeRadioSession({
    ...createIdleRadioSession(),
    seedId: 'seed'
  });
  const recovered = acceptRadioCandidates(degraded, ['candidate']);
  assert.equal(recovered.status, 'listening');
  assert.equal(recovered.degradedRetryAt, 0);
});

test('acceptRadioCandidates rejects out-of-phase generation results', () => {
  const idle = createIdleRadioSession();
  assert.equal(acceptRadioCandidates(idle, ['late']), idle);
});

test('markRadioPlayed removes from candidates and adds to played history', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'listening',
    candidateIds: ['a', 'b', 'c', 'd', 'e'],
    replenishThreshold: 3
  };
  const next = markRadioPlayed(state, 'a');
  assert.deepEqual(next.playedIds, ['a']);
  assert.deepEqual(next.candidateIds, ['b', 'c', 'd', 'e']);
  assert.equal(next.status, 'listening');
});

test('markRadioPlayed triggers replenishment when candidates drop below threshold', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'listening',
    candidateIds: ['a', 'b'],
    replenishThreshold: 3
  };
  const next = markRadioPlayed(state, 'a');
  assert.equal(next.status, 'replenishing');
  assert.deepEqual(next.candidateIds, ['b']);
});

test('markRadioPlayed bounds played history to maxHistorySize', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'listening',
    candidateIds: ['new'],
    playedIds: Array.from({ length: 50 }, (_, i) => `old-${i}`),
    maxHistorySize: 50
  };
  const next = markRadioPlayed(state, 'new');
  assert.equal(next.playedIds.length, 50);
  assert.equal(next.playedIds[49], 'new');
  assert.equal(next.playedIds[0], 'old-1');
});

test('degradeRadioSession transitions to degraded status', () => {
  const state = { ...createIdleRadioSession(), status: 'listening' };
  const degraded = degradeRadioSession(state);
  assert.equal(degraded.status, 'degraded');
  assert.ok(degraded.degradedRetryAt > Date.now());
});

test('stopRadioSession retains seed and played history until reset', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'listening',
    seedId: 'seed',
    seedLabel: 'Seed Radio',
    candidateIds: ['a'],
    playedIds: ['b']
  };
  const stopped = stopRadioSession(state);
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(stopped.candidateIds, []);
  assert.deepEqual(stopped.playedIds, ['b']);
  assert.equal(stopped.seedId, 'seed');
  assert.equal(stopped.seedLabel, 'Seed Radio');
  assert.equal(resetRadioSession().status, 'idle');
});

test('radioNeedsReplenishment detects low candidate count', () => {
  const listening = { ...createIdleRadioSession(), status: 'listening', candidateIds: ['a', 'b'], replenishThreshold: 3 };
  assert.equal(radioNeedsReplenishment(listening), true);
  const healthy = { ...createIdleRadioSession(), status: 'listening', candidateIds: ['a', 'b', 'c', 'd'], replenishThreshold: 3 };
  assert.equal(radioNeedsReplenishment(healthy), false);
  const replenishing = { ...createIdleRadioSession(), status: 'replenishing' };
  assert.equal(radioNeedsReplenishment(replenishing), true);
});

test('isRadioDuplicate detects played and pending candidates', () => {
  const state = {
    ...createIdleRadioSession(),
    playedIds: ['a', 'b'],
    candidateIds: ['c', 'd']
  };
  assert.equal(isRadioDuplicate(state, 'a'), true);
  assert.equal(isRadioDuplicate(state, 'c'), true);
  assert.equal(isRadioDuplicate(state, 'e'), false);
});

test('stopRadioSession clears degradedRetryAt', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'degraded',
    degradedRetryAt: Date.now() + 30000,
    playedIds: ['a']
  };
  const stopped = stopRadioSession(state);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.degradedRetryAt, 0);
  assert.deepEqual(stopped.playedIds, ['a']);
});

test('radioNeedsReplenishment triggers on low remaining duration', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'listening',
    candidateIds: ['a', 'b', 'c', 'd'],
    replenishThreshold: 3
  };
  const queue = {
    items: [
      { song: { id: 'a', duration: 60 } },
      { song: { id: 'b', duration: 60 } },
      { song: { id: 'c', duration: 60 } },
      { song: { id: 'd', duration: 60 } }
    ]
  };
  // 4 candidates × 60s = 240s < 300s → needs replenishment
  assert.equal(radioNeedsReplenishment(state, queue), true);
});

test('radioNeedsReplenishment false when remaining duration is sufficient', () => {
  const state = {
    ...createIdleRadioSession(),
    status: 'listening',
    candidateIds: ['a', 'b', 'c', 'd'],
    replenishThreshold: 3
  };
  const queue = {
    items: [
      { song: { id: 'a', duration: 120 } },
      { song: { id: 'b', duration: 120 } },
      { song: { id: 'c', duration: 120 } },
      { song: { id: 'd', duration: 120 } }
    ]
  };
  // 4 candidates × 120s = 480s > 300s → no replenishment needed
  assert.equal(radioNeedsReplenishment(state, queue), false);
});

test('radioNeedsReplenishment works without queue (count-only)', () => {
  const listening = { ...createIdleRadioSession(), status: 'listening', candidateIds: ['a', 'b'], replenishThreshold: 3 };
  assert.equal(radioNeedsReplenishment(listening), true);
  const healthy = { ...createIdleRadioSession(), status: 'listening', candidateIds: ['a', 'b', 'c', 'd'], replenishThreshold: 3 };
  assert.equal(radioNeedsReplenishment(healthy), false);
});
