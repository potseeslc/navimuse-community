import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  albumFromSong,
  blockedSeekNotice,
  canSeekWithState,
  clampSeekRatio,
  endedPlaybackAction,
  favoriteFeedbackPatch,
  nextTrackFeedbackState,
  pauseAfterCurrentBoundary,
  playbackReportRetryDelay,
  pruneTrackFeedback,
  queueAdvancePlan,
  queueEditIndexState,
  queueItem,
  queueNextIndex,
  queuePreviousIndex,
  restorablePlaybackPosition,
  queueSelectionHistory,
  queueSelectionShufflePool,
  queueShuffleNextState,
  queueShufflePreviousState,
  resolveQueueIndex,
  ratingFeedbackPatch,
  sameResolvedUrl,
  seekTimeFromRatio,
  scrobbleRequiredListenSeconds,
  sanitizeTrackFeedback,
  shouldSuppressEndedEvent,
  shouldAutoAdvanceQueue,
  shouldOpenFullPlayerOnPlay,
  shouldRetryPlaybackReport,
  shouldSubmitScrobble
} from '../src/playerState.js';

test('completed and near-complete playback never restore at the track duration', () => {
  assert.equal(restorablePlaybackPosition(41, 242, 'paused'), 41);
  assert.equal(restorablePlaybackPosition(242, 242, 'error'), 0);
  assert.equal(restorablePlaybackPosition(241, 242, 'paused'), 0);
  assert.equal(restorablePlaybackPosition(120, 242, 'ended'), 0);
  assert.equal(restorablePlaybackPosition(17, 0, 'restored'), 17);
});

test('scrobble threshold counts real listening time and caps long tracks at four minutes', () => {
  assert.equal(scrobbleRequiredListenSeconds(180), 90);
  assert.equal(scrobbleRequiredListenSeconds(900), 240);
  assert.equal(shouldSubmitScrobble(180, 89), false);
  assert.equal(shouldSubmitScrobble(180, 90), true);
  assert.equal(scrobbleRequiredListenSeconds(0), 240);
  assert.equal(shouldSubmitScrobble(0, 239), false);
  assert.equal(shouldSubmitScrobble(0, 240), true);
});

test('playback report retries back off exponentially and cap at one minute', () => {
  assert.equal(playbackReportRetryDelay(1), 2000);
  assert.equal(playbackReportRetryDelay(2), 4000);
  assert.equal(playbackReportRetryDelay(99), 60000);
});

test('playback reports retry transient failures but stop on permanent client errors', () => {
  assert.equal(shouldRetryPlaybackReport(new TypeError('network failure')), true);
  assert.equal(shouldRetryPlaybackReport({ status: 500 }), true);
  assert.equal(shouldRetryPlaybackReport({ status: 429 }), true);
  assert.equal(shouldRetryPlaybackReport({ status: 408 }), true);
  assert.equal(shouldRetryPlaybackReport({ status: 401 }), false);
  assert.equal(shouldRetryPlaybackReport({ status: 400 }), false);
});

test('queuePreviousIndex respects queue boundaries', () => {
  const queue = { items: [{}, {}, {}], index: 0 };
  assert.equal(queuePreviousIndex(queue), -1);
  assert.equal(queuePreviousIndex({ ...queue, index: 2 }), 1);
  assert.equal(queuePreviousIndex({ items: [], index: -1 }), -1);
});

test('queueNextIndex advances sequentially and respects queue boundaries', () => {
  const queue = { items: [{}, {}, {}], index: 0 };
  assert.equal(queueNextIndex(queue, { shuffle: false }), 1);
  assert.equal(queueNextIndex({ ...queue, index: 2 }, { shuffle: false }), -1);
  assert.equal(queueNextIndex({ items: [], index: -1 }, { shuffle: false }), -1);
});

test('queueNextIndex can pick any other queue item when shuffle is enabled', () => {
  const queue = { items: [{}, {}, {}, {}], index: 1 };
  assert.equal(queueNextIndex(queue, { shuffle: true }, () => 0), 0);
  assert.equal(queueNextIndex(queue, { shuffle: true }, () => 0.5), 2);
  assert.equal(queueNextIndex({ ...queue, index: 3 }, { shuffle: true }, () => 0.9999), 2);
  assert.equal(queueNextIndex({ items: [{}], index: 0 }, { shuffle: true }, () => 0), -1);
});

test('queueShuffleNextState consumes the shuffle pool before refilling it', () => {
  const queue = { items: [{}, {}, {}, {}], index: 0 };
  assert.deepEqual(queueShuffleNextState(queue, [1, 2, 3], () => 0), {
    nextIndex: 1,
    pool: [2, 3]
  });
  assert.deepEqual(queueShuffleNextState(queue, [2, 3], () => 0.9), {
    nextIndex: 3,
    pool: [2]
  });
  assert.deepEqual(queueShuffleNextState(queue, [], () => 0.5), {
    nextIndex: 2,
    pool: [1, 3]
  });
  assert.deepEqual(queueShuffleNextState({ items: [{}], index: 0 }, [], () => 0), {
    nextIndex: -1,
    pool: []
  });
});

test('shuffle honors explicit queue intent before random source candidates', () => {
  const queue = {
    index: 0,
    items: [{ provenance: 'source' }, { provenance: 'explicit' }, { provenance: 'source' }]
  };
  assert.deepEqual(queueShuffleNextState(queue, [1, 2], () => 0.99), { nextIndex: 1, pool: [2] });
});

test('queue edit index state remaps pool and history by stable queue item identity', () => {
  const queueItem = (id) => ({ queueItemId: id, song: { id } });
  const previous = { index: 1, items: ['played', 'current', 'next-a', 'next-b'].map(queueItem) };
  const next = { index: 0, items: [previous.items[1], previous.items[3], queueItem('manual')] };
  assert.deepEqual(queueEditIndexState(previous, next, [2, 3], [0, 1]), {
    pool: [1, 2],
    history: []
  });
});

test('queueSelectionHistory records manual queue jumps for shuffle previous', () => {
  const queue = { items: [{}, {}, {}, {}], index: 1 };
  assert.deepEqual(queueSelectionHistory(queue, 3, [0], 50, true), [0, 1]);
  assert.deepEqual(queueSelectionHistory(queue, 1, [0], 50, true), [0]);
  assert.deepEqual(queueSelectionHistory(queue, 3, [0], 50, false), [0]);
  assert.deepEqual(queueSelectionHistory(queue, 3, [0, 1, 2], 2, true), [2, 1]);
});

test('shuffle previous restores the current item for the next shuffle selection', () => {
  const items = [{}, {}, {}, {}];
  const queue = { items, index: 0 };
  const firstNext = queueShuffleNextState(queue, [1, 2, 3], () => 0);
  const history = queueSelectionHistory(queue, firstNext.nextIndex, [], 50, true);
  assert.deepEqual(firstNext, { nextIndex: 1, pool: [2, 3] });
  assert.deepEqual(history, [0]);

  const restoredPool = [firstNext.nextIndex, ...firstNext.pool.filter((itemIndex) => itemIndex !== firstNext.nextIndex)];
  const afterPreviousQueue = { items, index: history.at(-1) };
  const filteredForPreviousTrack = restoredPool.filter((itemIndex) => itemIndex !== afterPreviousQueue.index);
  assert.deepEqual(filteredForPreviousTrack, [1, 2, 3]);

  const secondNext = queueShuffleNextState(afterPreviousQueue, filteredForPreviousTrack, () => 0);
  assert.deepEqual(secondNext, { nextIndex: 1, pool: [2, 3] });
});

test('queueShufflePreviousState restores history and returns current item to pool', () => {
  const queue = { items: [{}, {}, {}, {}], index: 2 };
  assert.deepEqual(queueShufflePreviousState(queue, [0, 3], [1]), {
    previousIndex: 1,
    history: [],
    pool: [2, 0, 3]
  });
  assert.deepEqual(queueShufflePreviousState(queue, [0, 2, 3], [3, 1]), {
    previousIndex: 1,
    history: [3],
    pool: [2, 0, 3]
  });
  assert.deepEqual(queueShufflePreviousState(queue, [0, 3], []), {
    previousIndex: -1,
    history: [],
    pool: [0, 3]
  });
});

test('queueSelectionShufflePool restores the previous item after manual shuffle selection', () => {
  assert.deepEqual(queueSelectionShufflePool([1, 3], 0, 2, 4, true), [0, 1, 3]);
  assert.deepEqual(queueSelectionShufflePool([0, 1, 2, 3], 0, 2, 4, true), [0, 1, 3]);
  assert.deepEqual(queueSelectionShufflePool([0, 1, 3], 0, 2, 4, false), [0, 1, 3]);
  assert.deepEqual(queueSelectionShufflePool([0, 1, 99], 3, 1, 4, true), [3, 0]);
});

test('queueAdvancePlan keeps shuffle previous inside shuffle history', () => {
  const queue = { items: [{}, {}, {}, {}], index: 2 };
  assert.deepEqual(queueAdvancePlan(queue, { shuffle: true }, {
    direction: 'previous',
    history: [],
    pool: [0, 1, 3]
  }), {
    nextIndex: -1,
    history: [],
    pool: [0, 1, 3],
    recordHistory: false,
    notice: 'This is the first track in the shuffle history.'
  });
  assert.deepEqual(queueAdvancePlan(queue, { shuffle: true }, {
    direction: 'previous',
    history: [1],
    pool: [0, 3]
  }), {
    nextIndex: 1,
    history: [],
    pool: [2, 0, 3],
    recordHistory: false,
    notice: ''
  });
});

test('queueAdvancePlan advances sequential and shuffle queues with updated pool state', () => {
  const queue = { items: [{}, {}, {}, {}], index: 1 };
  assert.deepEqual(queueAdvancePlan(queue, { shuffle: false }, { direction: 'next' }), {
    nextIndex: 2,
    history: [],
    pool: [],
    recordHistory: true,
    notice: ''
  });
  assert.deepEqual(queueAdvancePlan(queue, { shuffle: true }, {
    direction: 'next',
    history: [0],
    pool: [0, 2, 3],
    random: () => 0.99
  }), {
    nextIndex: 3,
    history: [0],
    pool: [0, 2],
    recordHistory: true,
    notice: ''
  });
});

test('shouldAutoAdvanceQueue follows the committed queue preference and migrates legacy settings', () => {
  assert.equal(shouldAutoAdvanceQueue({ playback: { continueThroughQueue: true } }), true);
  assert.equal(shouldAutoAdvanceQueue({ playback: { continueThroughQueue: false } }), false);
  assert.equal(shouldAutoAdvanceQueue({ playback: { continuousQueue: false } }), false);
  assert.equal(shouldAutoAdvanceQueue({ playback: {
    continueThroughQueue: true,
    extendJourneysAutomatically: false,
    autoplayAfterQueue: false
  } }), true, 'generated-continuation policies must not stop committed queue items');
  assert.equal(shouldAutoAdvanceQueue({ playback: {} }), true);
  assert.equal(shouldAutoAdvanceQueue({}), true);
});

test('pause after current fires only on natural end and clears only itself', () => {
  const armed = {
    shuffle: true,
    repeat: true,
    pauseAfterCurrent: true,
    panel: 'queue'
  };
  const manualNext = pauseAfterCurrentBoundary(armed, { naturalEnd: false });
  assert.equal(manualNext.shouldPause, false);
  assert.strictEqual(manualNext.controls, armed);

  const naturalEnd = pauseAfterCurrentBoundary(armed, { naturalEnd: true });
  assert.equal(naturalEnd.shouldPause, true);
  assert.deepEqual(naturalEnd.controls, {
    shuffle: true,
    repeat: true,
    pauseAfterCurrent: false,
    panel: 'queue'
  });
  assert.deepEqual(pauseAfterCurrentBoundary({}, { naturalEnd: true }), {
    shouldPause: false,
    controls: {}
  });
});

test('shouldOpenFullPlayerOnPlay skips background auto-advance', () => {
  assert.equal(shouldOpenFullPlayerOnPlay({ startFullScreen: true }, {}), true);
  assert.equal(shouldOpenFullPlayerOnPlay({ startFullScreen: true }, { fromEnded: true }), false);
  assert.equal(shouldOpenFullPlayerOnPlay({ startFullScreen: false }, {}), false);
  assert.equal(shouldOpenFullPlayerOnPlay({}, {}), false);
});

test('sanitizeTrackFeedback prevents global or invalid rating leakage', () => {
  assert.deepEqual(sanitizeTrackFeedback({ favorite: 1, rating: 9 }), { favorite: true, rating: 5 });
  assert.deepEqual(sanitizeTrackFeedback({ favorite: 0, rating: -4 }), { favorite: false, rating: 0 });
  assert.deepEqual(sanitizeTrackFeedback({ favorite: true, rating: '3' }), { favorite: true, rating: 3 });
});

test('feedback patch helpers compute from latest previous feedback', () => {
  const toggleFavorite = favoriteFeedbackPatch();
  assert.deepEqual(toggleFavorite({ favorite: false, rating: 4 }), { favorite: true });
  assert.deepEqual(toggleFavorite({ favorite: true, rating: 4 }), { favorite: false });

  const selectFour = ratingFeedbackPatch(4);
  assert.deepEqual(selectFour({ favorite: true, rating: 2 }), { rating: 4 });
  assert.deepEqual(selectFour({ favorite: true, rating: 4 }), { rating: 0 });
  assert.deepEqual(ratingFeedbackPatch(9)({ rating: 1 }), { rating: 5 });
  assert.deepEqual(ratingFeedbackPatch(-1)({ rating: 1 }), { rating: 0 });
});

test('pruneTrackFeedback caps entries and keeps the most recently updated feedback', () => {
  const feedback = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [
    `song-${index}`,
    { favorite: index % 2, rating: index + 1, updatedAt: index + 10 }
  ]));
  assert.deepEqual(pruneTrackFeedback(feedback, 3), {
    'song-2': { favorite: false, rating: 3, updatedAt: 12 },
    'song-3': { favorite: true, rating: 4, updatedAt: 13 },
    'song-4': { favorite: false, rating: 5, updatedAt: 14 }
  });
  assert.deepEqual(pruneTrackFeedback(null, 3), {});
  assert.deepEqual(pruneTrackFeedback(feedback, 0), {});
});

test('pruneTrackFeedback uses timestamps rather than numeric id ordering', () => {
  const feedback = {
    42: { favorite: true, rating: 5, updatedAt: 300 },
    1337: { favorite: true, rating: 4, updatedAt: 100 },
    7: { favorite: false, rating: 2, updatedAt: 400 }
  };
  assert.deepEqual(pruneTrackFeedback(feedback, 2), {
    42: { favorite: true, rating: 5, updatedAt: 300 },
    7: { favorite: false, rating: 2, updatedAt: 400 }
  });
});

test('nextTrackFeedbackState updates, sanitizes, and prunes track feedback', () => {
  const current = {
    older: { favorite: true, rating: 5, updatedAt: 10 },
    current: { favorite: false, rating: 1, updatedAt: 20 }
  };
  const result = nextTrackFeedbackState(current, 'current', { favorite: true, rating: 9 }, 30, 2);
  assert.equal(result.changed, true);
  assert.equal(result.prunedCount, 0);
  assert.deepEqual(result.feedback.current, { favorite: true, rating: 5, updatedAt: 30 });
  assert.deepEqual(result.feedback.older, current.older);
});

test('nextTrackFeedbackState reports unchanged feedback without cloning state', () => {
  const current = {
    song: { favorite: true, rating: 4, updatedAt: 10 }
  };
  const result = nextTrackFeedbackState(current, 'song', { favorite: true, rating: 4 }, 20, 10);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'unchanged');
  assert.deepEqual(result.feedback, current);
  assert.equal(result.prunedCount, 0);
});

test('nextTrackFeedbackState skips pruning work for unchanged feedback', () => {
  const current = {
    old: { favorite: false, rating: 1, updatedAt: 10 },
    song: { favorite: true, rating: 3, updatedAt: 20 }
  };
  const result = nextTrackFeedbackState(current, 'song', { favorite: true, rating: 3 }, 30, 1);
  assert.equal(result.changed, false);
  assert.equal(result.prunedCount, 0);
  assert.deepEqual(result.feedback, current);
  assert.equal(result.reason, 'unchanged');
});

test('nextTrackFeedbackState supports functional patches and returns prune count', () => {
  const current = {
    a: { favorite: false, rating: 1, updatedAt: 100 },
    b: { favorite: false, rating: 2, updatedAt: 200 }
  };
  const result = nextTrackFeedbackState(current, 'c', (previous) => ({
    favorite: !previous.favorite,
    rating: 3
  }), 300, 2);
  assert.equal(result.changed, true);
  assert.equal(result.prunedCount, 1);
  assert.deepEqual(Object.keys(result.feedback), ['b', 'c']);
  assert.deepEqual(result.feedback.c, { favorite: true, rating: 3, updatedAt: 300 });
});

test('nextTrackFeedbackState always retains the just-updated track when pruning', () => {
  const current = {
    old: { favorite: false, rating: 1, updatedAt: 1000 },
    older: { favorite: true, rating: 2, updatedAt: 900 }
  };
  const result = nextTrackFeedbackState(current, 'current', { favorite: true, rating: 4 }, 10, 2);
  assert.equal(result.changed, true);
  assert.equal(result.prunedCount, 1);
  assert.deepEqual(result.feedback, {
    old: { favorite: false, rating: 1, updatedAt: 1000 },
    current: { favorite: true, rating: 4, updatedAt: 10 }
  });
});

test('resolveQueueIndex does not silently map missing songs to the first queue item', () => {
  const items = [{ song: { id: 'a' } }, { song: { id: 'b' } }];
  assert.equal(resolveQueueIndex(items, 'b'), 1);
  assert.equal(resolveQueueIndex(items, 'missing'), -1);
  assert.equal(resolveQueueIndex(items, 'a', 1), 1);
  assert.equal(resolveQueueIndex(items, 'a', 10), 0);
});

test('resolveQueueIndex accepts raw song items defensively', () => {
  assert.equal(resolveQueueIndex([{ id: 'a' }, { id: 'b' }], 'b'), 1);
  assert.equal(resolveQueueIndex([{ id: 'a' }, { song: { id: 'b' } }], 'b'), 1);
});

test('queueItem preserves album metadata from search-result songs', () => {
  const song = {
    id: 'song-1',
    album: 'The Beatles (stereo)',
    albumArtist: 'The Beatles',
    coverArt: 'cover-1',
    parent: 'album-1'
  };
  assert.deepEqual(albumFromSong(song), {
    id: 'album-1',
    title: 'The Beatles (stereo)',
    name: 'The Beatles (stereo)',
    artist: 'The Beatles',
    coverArt: 'cover-1'
  });
  assert.deepEqual(queueItem(song).album, albumFromSong(song));
});

test('clampSeekRatio keeps waveform seek positions in range', () => {
  assert.equal(clampSeekRatio(-0.5), 0);
  assert.equal(clampSeekRatio(0.42), 0.42);
  assert.equal(clampSeekRatio(1.5), 1);
  assert.equal(clampSeekRatio(Number.NaN), 0);
});

test('seekTimeFromRatio prefers real audio duration and falls back to expected duration', () => {
  assert.deepEqual(seekTimeFromRatio(0.5, 180, 300), {
    duration: 180,
    currentTime: 90,
    usedExpectedDuration: false,
    usedSeekableRange: false
  });
  assert.deepEqual(seekTimeFromRatio(0.5, Number.NaN, 300), {
    duration: 300,
    currentTime: 150,
    usedExpectedDuration: true,
    usedSeekableRange: false
  });
  assert.deepEqual(seekTimeFromRatio(0.25, Infinity, 120), {
    duration: 120,
    currentTime: 30,
    usedExpectedDuration: true,
    usedSeekableRange: false
  });
  assert.deepEqual(seekTimeFromRatio(0.5, Number.NaN, 300, {
    length: 1,
    start: () => 10,
    end: () => 210
  }), {
    duration: 200,
    currentTime: 110,
    usedExpectedDuration: false,
    usedSeekableRange: true
  });
  assert.deepEqual(seekTimeFromRatio(0.5, Infinity, 300, {
    length: 1,
    start: () => 20,
    end: () => 220
  }), {
    duration: 200,
    currentTime: 120,
    usedExpectedDuration: false,
    usedSeekableRange: true
  });
  assert.deepEqual(seekTimeFromRatio(0.5, 0, 0), {
    duration: 0,
    currentTime: 0,
    usedExpectedDuration: false,
    usedSeekableRange: false
  });
  assert.deepEqual(seekTimeFromRatio(1.5, 180, 300), {
    duration: 180,
    currentTime: 180,
    usedExpectedDuration: false,
    usedSeekableRange: false
  });
});

test('canSeekWithState requires real or seekable duration for seeking', () => {
  assert.equal(canSeekWithState({ duration: 180, usedExpectedDuration: false }, {}), true);
  assert.equal(canSeekWithState({ duration: 300, usedExpectedDuration: true }, { readyState: 1 }), false);
  assert.equal(canSeekWithState({ duration: 300, usedExpectedDuration: true }, {
    readyState: 2,
    seekable: { length: 1, start: () => 0, end: () => 300 }
  }), true);
  assert.equal(canSeekWithState({ duration: 300, usedExpectedDuration: true }, {
    duration: Infinity,
    readyState: 2,
    seekable: { length: 1, start: () => 10, end: () => 310 }
  }), true);
  assert.equal(canSeekWithState({ duration: 300, usedExpectedDuration: true }, { duration: Infinity, readyState: 4 }), false);
  assert.equal(canSeekWithState({ duration: 200, usedExpectedDuration: false, usedSeekableRange: true }, { duration: Infinity, readyState: 4 }), true);
  assert.equal(canSeekWithState({ duration: 180, usedExpectedDuration: false }, { duration: 180, seekable: { length: 0 } }), false);
  assert.equal(canSeekWithState({ duration: 180, usedExpectedDuration: false }, { duration: 180, seekable: { length: 1, start: () => 0, end: () => 0 } }), false);
  assert.equal(canSeekWithState({ duration: 180, usedExpectedDuration: false }, { duration: Infinity, seekable: { length: 0 } }), false);
  assert.equal(canSeekWithState({ duration: 0, usedExpectedDuration: false }, {}), false);
  assert.equal(canSeekWithState(null, {}), false);
});

test('blockedSeekNotice distinguishes loading from non-seekable streams', () => {
  assert.equal(
    blockedSeekNotice({ duration: 0, usedExpectedDuration: false }, { duration: Number.NaN }),
    'Seeking will be available after the track is loaded.'
  );
  assert.equal(
    blockedSeekNotice({ duration: 300, usedExpectedDuration: true }, { duration: Infinity }),
    'This stream does not support seeking.'
  );
  assert.equal(
    blockedSeekNotice({ duration: 300, usedExpectedDuration: true }, { duration: Number.NaN }),
    'Seeking will be available when this stream exposes a seekable range.'
  );
});

test('sameResolvedUrl compares stream URLs after browser-style resolution', () => {
  const base = 'http://127.0.0.1:8099/app/';
  assert.equal(sameResolvedUrl('/api/navidrome/stream?id=1', 'http://127.0.0.1:8099/api/navidrome/stream?id=1', base), true);
  assert.equal(sameResolvedUrl('track.mp3', 'http://127.0.0.1:8099/app/track.mp3', base), true);
  assert.equal(sameResolvedUrl('/api/navidrome/stream?id=1', '/api/navidrome/stream?id=2', base), false);
  assert.equal(sameResolvedUrl('', '/api/navidrome/stream?id=1', base), false);
});

test('endedPlaybackAction guards repeat against stale ended events', () => {
  const base = 'http://127.0.0.1:8099/app/';
  assert.equal(endedPlaybackAction({ skipNextEnded: true, repeat: true }), 'ignore');
  assert.equal(endedPlaybackAction({ repeat: false }), 'advance');
  assert.equal(endedPlaybackAction({
    repeat: true,
    audioSrc: '/api/navidrome/stream?id=1',
    currentStreamUrl: 'http://127.0.0.1:8099/api/navidrome/stream?id=1',
    baseHref: base
  }), 'repeat');
  assert.equal(endedPlaybackAction({
    repeat: true,
    audioSrc: '/api/navidrome/stream?id=2',
    currentStreamUrl: 'http://127.0.0.1:8099/api/navidrome/stream?id=1',
    baseHref: base
  }), 'source-changed');
});

test('shouldSuppressEndedEvent keeps source-change guards active until cleared', () => {
  assert.equal(shouldSuppressEndedEvent({ guardRequestId: 4, playRequestId: 4 }), true);
  assert.equal(shouldSuppressEndedEvent({ guardRequestId: 3, playRequestId: 4 }), false);
  assert.equal(shouldSuppressEndedEvent({ guardRequestId: 0, playRequestId: 4 }), false);
});
