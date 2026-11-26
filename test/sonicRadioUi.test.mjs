import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundedSonicExclusions,
  cancelPendingSonicResume,
  consumePendingSonicResume,
  fetchSonicSimilarTracks,
  fetchArtistSongs,
  fetchGenreSongs,
  activeRadioProgressIds,
  queueIndexForSong,
  radioQueueItemForTrack,
  rawQueueSong,
  searchSonicFallback,
  sonicRadioStatusLabel
} from '../src/sonicRadioUi.js';

test('active Journey progression catches every candidate crossed by rapid queue skipping', () => {
  const queue = { items: ['seed', 'one', 'two', 'three'].map((id) => ({ song: { id } })), index: 3 };
  const state = { status: 'listening', seedSongId: 'seed', candidateIds: ['one', 'two', 'three'] };
  assert.deepEqual(activeRadioProgressIds(queue, state, 'three'), ['seed', 'one', 'two', 'three']);
  assert.deepEqual(activeRadioProgressIds(queue, state, 'manual-track'), []);
  assert.deepEqual(activeRadioProgressIds(queue, { ...state, status: 'stopped' }, 'three'), []);
});

test('active Journey progression survives queue entries that lost their transient session marker', () => {
  const queue = { items: [{ song: { id: 'seed' } }, { song: { id: 'next' } }], index: 1 };
  const state = { status: 'listening', seedSongId: 'seed', candidateIds: ['next'] };
  assert.deepEqual(activeRadioProgressIds(queue, state, 'next'), ['seed', 'next']);
});

function response(body, ok = true) {
  return { ok, json: async () => body };
}

test('similar-track adapter encodes the seed and normalizes successful tracks', async () => {
  let requestedUrl = '';
  const result = await fetchSonicSimilarTracks(async (url) => {
    requestedUrl = url;
    return response({
      ok: true,
      tracks: [{ id: 'two' }],
      candidateCount: 8,
      resolvedCount: 1,
      partial: true,
      resolutionIncomplete: true,
      timedOut: true,
      missingCount: 2,
      transientFailureCount: 1,
      exhausted: false
    });
  }, 'seed / one', 7, { excludeIds: ['played one', 'played one', 'pending/two'] });

  assert.equal(requestedUrl, '/api/audiomuse/similar_tracks?seed=seed+%2F+one&count=7&exclude=played+one&exclude=pending%2Ftwo');
  assert.deepEqual(result, {
    ok: true,
    tracks: [{ id: 'two' }],
    candidateCount: 8,
    resolvedCount: 1,
    partial: true,
    exhausted: false,
    resolutionIncomplete: true,
    timedOut: true,
    missingCount: 2,
    transientFailureCount: 1
  });
});

test('exact artist and genre adapters encode stable route identities', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    return response({ songs: [{ id: 'one' }] });
  };
  assert.deepEqual(await fetchArtistSongs(fetchFn, 'artist / one'), [{ id: 'one' }]);
  assert.deepEqual(await fetchGenreSongs(fetchFn, 'R&B / Soul'), [{ id: 'one' }]);
  assert.deepEqual(urls, [
    '/api/navidrome/artists/artist%20%2F%20one/songs',
    '/api/navidrome/genres/R%26B%20%2F%20Soul/songs'
  ]);
  await assert.rejects(fetchArtistSongs(async () => response({}, false), 'bad'));
});

test('similar-track adapter converts an AudioMuse failure into a degradable result', async () => {
  const result = await fetchSonicSimilarTracks(async () => response({ error: 'offline' }, false), 'seed');
  assert.deepEqual(result, { ok: false, tracks: [], partial: false, exhausted: false });
});

test('similar-track adapter bounds transmitted history while preserving recent exclusions', async () => {
  let requestedUrl = '';
  const ids = Array.from({ length: 400 }, (_, index) => `track-${index}`);
  await fetchSonicSimilarTracks(async (url) => {
    requestedUrl = url;
    return response({ ok: true, tracks: [] });
  }, 'seed', 12, { excludeIds: ids });
  const params = new URL(requestedUrl, 'http://navimuse.test').searchParams;
  assert.ok(requestedUrl.length < 7000);
  assert.ok(params.getAll('exclude').length > 150);
  assert.equal(params.getAll('exclude').at(-1), 'track-399');
});

test('similar-track adapter caps short exclusions at the server contract while retaining newest ids', async () => {
  let requestedUrl = '';
  const ids = Array.from({ length: 600 }, (_, index) => index.toString(36).padStart(2, '0'));
  await fetchSonicSimilarTracks(async (url) => {
    requestedUrl = url;
    return response({ ok: true, tracks: [] });
  }, 'seed', 12, { excludeIds: ids });
  const exclusions = new URL(requestedUrl, 'http://navimuse.test').searchParams.getAll('exclude');
  assert.equal(exclusions.length, 500);
  assert.equal(exclusions[0], ids[100]);
  assert.equal(exclusions.at(-1), ids[599]);
  assert.ok(requestedUrl.length < 7000);
});

test('similar-track exclusion budget handles maximum-length ids without oversized requests', async () => {
  let requestedUrl = '';
  const ids = Array.from({ length: 150 }, (_, index) => `${String(index).padStart(3, '0')}-${'x'.repeat(508)}`);
  await fetchSonicSimilarTracks(async (url) => {
    requestedUrl = url;
    return response({ ok: true, tracks: [] });
  }, 'seed', 12, { excludeIds: ids });
  const exclusions = new URL(requestedUrl, 'http://navimuse.test').searchParams.getAll('exclude');
  assert.ok(requestedUrl.length < 7000);
  assert.ok(exclusions.length > 0 && exclusions.length < ids.length);
  assert.equal(exclusions.at(-1), ids.at(-1));
  assert.deepEqual(exclusions, boundedSonicExclusions(ids));
});

test('manual playback cancellation prevents a pending Journey append from resuming', () => {
  const resumeRef = { current: 1000 };
  cancelPendingSonicResume(resumeRef);
  assert.equal(consumePendingSonicResume(resumeRef, 1100), false);

  resumeRef.current = 1000;
  assert.equal(consumePendingSonicResume(resumeRef, 1100), true);
  assert.equal(resumeRef.current, 0);

  resumeRef.current = 1000;
  assert.equal(consumePendingSonicResume(resumeRef, 89999), true);
  resumeRef.current = 1000;
  assert.equal(consumePendingSonicResume(resumeRef, 91001), false);
});

test('Navidrome fallback returns playable songs without throwing on service failure', async () => {
  assert.deepEqual(
    await searchSonicFallback(async () => response({ songs: [{ id: 'fallback' }] }), 'Track Radio'),
    [{ id: 'fallback' }]
  );
  await assert.rejects(searchSonicFallback(async () => response({}, false), 'Track Radio'));
});

test('radio status labels make generation, degraded playback, and stop explicit', () => {
  assert.equal(sonicRadioStatusLabel({ status: 'generating' }), 'Building a Journey...');
  assert.match(sonicRadioStatusLabel({ status: 'degraded' }), /current queue will keep playing/);
  assert.match(sonicRadioStatusLabel({ status: 'stopped' }), /current queue is unchanged/);
  assert.equal(sonicRadioStatusLabel({ status: 'listening', seedLabel: 'Night Journey' }), 'Journey: Night Journey is active.');
  assert.equal(
    sonicRadioStatusLabel({ status: 'listening', sessionKind: 'artist-dj', seedLabel: 'Radiohead Artist DJ' }),
    'Artist DJ: Radiohead Artist DJ is active.'
  );
  assert.equal(sonicRadioStatusLabel({ status: 'generating', sessionKind: 'artist-dj' }), 'Building an Artist DJ queue...');
  assert.equal(sonicRadioStatusLabel({ status: 'degraded' }, 'Specific notice'), 'Specific notice');
  assert.equal(sonicRadioStatusLabel({ status: 'stopped' }, 'Save this session?'), 'Save this session?');
});

test('queue helpers preserve raw seed metadata and only identify radio-owned playback', () => {
  const rawSong = { id: 'seed', title: 'Seed', duration: 247, coverArt: 'cover-1', suffix: 'flac' };
  const queue = {
    index: 1,
    items: [
      { song: { id: 'manual' } },
      { song: rawSong, radioSessionId: 'radio-1' }
    ]
  };
  assert.equal(rawQueueSong(queue, 'seed'), rawSong);
  assert.equal(radioQueueItemForTrack(queue, 'seed'), queue.items[1]);
  assert.equal(radioQueueItemForTrack(queue, 'manual'), null);
  assert.equal(queueIndexForSong(queue, 'seed'), 1);
  assert.equal(queueIndexForSong(queue, 'missing'), -1);
});
