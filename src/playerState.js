import { normalizeContinuationPreferences } from '../shared/playbackPreferences.js';

export function clampSeekRatio(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function restorablePlaybackPosition(position = 0, duration = 0, transportStatus = '') {
  const elapsed = Number.isFinite(Number(position)) ? Math.max(0, Number(position)) : 0;
  const total = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : 0;
  if (transportStatus === 'ended') return 0;
  if (!total) return elapsed;
  const completedTail = Math.min(5, Math.max(1, total * 0.01));
  return total - elapsed <= completedTail ? 0 : Math.min(elapsed, total);
}

function seekableRangeDuration(seekable) {
  if (!seekable || !Number.isFinite(seekable.length) || seekable.length <= 0) return null;
  try {
    const start = Number(seekable.start(0));
    const end = Number(seekable.end(seekable.length - 1));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return { start, duration: end - start };
    }
  } catch {
    return null;
  }
  return null;
}

export function seekTimeFromRatio(ratio, audioDuration = 0, expectedDuration = 0, seekable = null) {
  const realDuration = Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : 0;
  const seekableRange = realDuration ? null : seekableRangeDuration(seekable);
  const fallbackDuration = Number.isFinite(expectedDuration) && expectedDuration > 0 ? expectedDuration : 0;
  const duration = realDuration || seekableRange?.duration || fallbackDuration;
  const boundedRatio = clampSeekRatio(ratio);
  return {
    duration,
    currentTime: seekableRange ? seekableRange.start + seekableRange.duration * boundedRatio : duration * boundedRatio,
    usedExpectedDuration: !realDuration && !seekableRange && Boolean(fallbackDuration),
    usedSeekableRange: Boolean(seekableRange)
  };
}

export function sameResolvedUrl(left, right, baseHref = 'http://localhost/') {
  if (!left || !right) return false;
  try {
    return new URL(left, baseHref).href === new URL(right, baseHref).href;
  } catch {
    return left === right;
  }
}

export function endedPlaybackAction({ skipNextEnded = false, repeat = false, audioSrc = '', currentStreamUrl = '', baseHref = 'http://localhost/' } = {}) {
  if (skipNextEnded) return 'ignore';
  if (!repeat) return 'advance';
  if (currentStreamUrl && !sameResolvedUrl(audioSrc, currentStreamUrl, baseHref)) return 'source-changed';
  return 'repeat';
}

export function shouldSuppressEndedEvent({ guardRequestId = 0, playRequestId = 0 } = {}) {
  return Boolean(guardRequestId && guardRequestId === playRequestId);
}

export function queuePreviousIndex(queue) {
  const index = Number.isInteger(queue?.index) ? queue.index : -1;
  return index > 0 ? index - 1 : -1;
}

export function queueNextIndex(queue, controls = {}, random = Math.random) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const index = Number.isInteger(queue?.index) ? queue.index : -1;
  if (index < 0 || !items.length) return -1;
  if (!controls.shuffle) return index < items.length - 1 ? index + 1 : controls.repeatAll === true ? 0 : -1;
  // Simple shuffle fallback for callers that do not maintain a shuffle pool.
  // The player UI uses queueShuffleNextState so it can exhaust the pool first.
  if (items.length <= 1) return -1;

  const candidateIndexes = items.map((_, itemIndex) => itemIndex).filter((itemIndex) => itemIndex !== index);
  const randomValue = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return candidateIndexes[Math.floor(randomValue * candidateIndexes.length)];
}

export function queueShuffleNextState(queue, pool = [], random = Math.random) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const index = Number.isInteger(queue?.index) ? queue.index : -1;
  if (index < 0 || items.length <= 1) return { nextIndex: -1, pool: [] };

  let candidateIndexes = Array.isArray(pool)
    ? pool.filter((itemIndex) => Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < items.length && itemIndex !== index)
    : [];
  if (!candidateIndexes.length) {
    candidateIndexes = items.map((_, itemIndex) => itemIndex).filter((itemIndex) => itemIndex !== index);
  }
  const explicitIndex = candidateIndexes.find((itemIndex) => itemIndex > index && items[itemIndex]?.provenance === 'explicit');
  if (Number.isInteger(explicitIndex)) {
    return {
      nextIndex: explicitIndex,
      pool: candidateIndexes.filter((itemIndex) => itemIndex !== explicitIndex)
    };
  }
  const randomValue = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  const nextIndex = candidateIndexes[Math.floor(randomValue * candidateIndexes.length)];
  return {
    nextIndex,
    pool: candidateIndexes.filter((itemIndex) => itemIndex !== nextIndex)
  };
}

function matchingQueueItemIndex(items, previousItem) {
  const exactIndex = items.indexOf(previousItem);
  if (exactIndex >= 0) return exactIndex;
  if (!previousItem?.queueItemId) return -1;
  return items.findIndex((item) => item?.queueItemId === previousItem.queueItemId);
}

export function remapQueueIndexes(previousQueue = {}, nextQueue = {}, indexes = []) {
  const previousItems = Array.isArray(previousQueue.items) ? previousQueue.items : [];
  const nextItems = Array.isArray(nextQueue.items) ? nextQueue.items : [];
  const mapped = [];
  for (const index of Array.isArray(indexes) ? indexes : []) {
    if (!Number.isInteger(index) || !previousItems[index]) continue;
    const nextIndex = matchingQueueItemIndex(nextItems, previousItems[index]);
    if (nextIndex >= 0 && !mapped.includes(nextIndex)) mapped.push(nextIndex);
  }
  return mapped;
}

export function queueEditIndexState(previousQueue = {}, nextQueue = {}, pool = [], history = []) {
  const nextItems = Array.isArray(nextQueue.items) ? nextQueue.items : [];
  const nextIndex = Number.isInteger(nextQueue.index) ? nextQueue.index : -1;
  const mappedPool = remapQueueIndexes(previousQueue, nextQueue, pool).filter((index) => index !== nextIndex);
  nextItems.forEach((item, index) => {
    if (index === nextIndex) return;
    const existed = matchingQueueItemIndex(previousQueue.items || [], item) >= 0;
    if (!existed && !mappedPool.includes(index)) mappedPool.push(index);
  });
  return {
    pool: mappedPool,
    history: remapQueueIndexes(previousQueue, nextQueue, history).filter((index) => index !== nextIndex)
  };
}

export function queueSelectionHistory(queue, nextIndex, history = [], maxEntries = 50, recordHistory = true) {
  const currentIndex = Number.isInteger(queue?.index) ? queue.index : -1;
  const targetIndex = Number.isInteger(nextIndex) ? nextIndex : -1;
  const limit = Math.max(0, Number(maxEntries) || 0);
  const existing = Array.isArray(history) ? history.filter(Number.isInteger) : [];
  if (!recordHistory || !limit || currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
    return existing.slice(-limit);
  }
  return [...existing, currentIndex].slice(-limit);
}

export function queueShufflePreviousState(queue, pool = [], history = []) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const index = Number.isInteger(queue?.index) ? queue.index : -1;
  const existingHistory = Array.isArray(history) ? history.filter(Number.isInteger) : [];
  const previousIndex = existingHistory.at(-1);
  if (!Number.isInteger(previousIndex) || previousIndex < 0 || previousIndex >= items.length) {
    return { previousIndex: -1, history: existingHistory, pool: Array.isArray(pool) ? pool.filter(Number.isInteger) : [] };
  }

  const existingPool = Array.isArray(pool)
    ? pool.filter((itemIndex) => Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < items.length)
    : [];
  return {
    previousIndex,
    history: existingHistory.slice(0, -1),
    pool: index >= 0 && index < items.length
      ? [index, ...existingPool.filter((itemIndex) => itemIndex !== index)]
      : existingPool
  };
}

export function queueSelectionShufflePool(pool = [], previousIndex = -1, nextIndex = -1, itemCount = 0, shuffle = false) {
  const count = Math.max(0, Number(itemCount) || 0);
  const nextPool = Array.isArray(pool)
    ? pool.filter((itemIndex) => Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < count && itemIndex !== nextIndex)
    : [];
  if (
    shuffle
    && Number.isInteger(previousIndex)
    && previousIndex >= 0
    && previousIndex < count
    && previousIndex !== nextIndex
    && !nextPool.includes(previousIndex)
  ) {
    return [previousIndex, ...nextPool];
  }
  return nextPool;
}

export function queueAdvancePlan(queue, controls = {}, options = {}) {
  const direction = options.direction === 'previous' ? 'previous' : 'next';
  const history = Array.isArray(options.history) ? options.history.filter(Number.isInteger) : [];
  const pool = Array.isArray(options.pool) ? options.pool.filter(Number.isInteger) : [];
  const shuffle = controls?.shuffle === true;

  if (direction === 'previous' && shuffle) {
    if (!history.length) {
      return {
        nextIndex: -1,
        history,
        pool,
        recordHistory: false,
        notice: options.fromEnded ? '' : 'This is the first track in the shuffle history.'
      };
    }
    const previousState = queueShufflePreviousState(queue, pool, history);
    return {
      nextIndex: previousState.previousIndex,
      history: previousState.history,
      pool: previousState.pool,
      recordHistory: false,
      notice: previousState.previousIndex < 0 && !options.fromEnded ? 'This is the first track in the shuffle history.' : ''
    };
  }

  if (direction === 'previous') {
    const nextIndex = queuePreviousIndex(queue);
    return {
      nextIndex,
      history,
      pool,
      recordHistory: false,
      notice: nextIndex < 0 && !options.fromEnded ? 'This is the first track in the queue.' : ''
    };
  }

  if (shuffle) {
    const shuffleState = queueShuffleNextState(queue, pool, options.random);
    return {
      nextIndex: shuffleState.nextIndex<0 && controls.repeatAll && queue?.items?.length ? 0 : shuffleState.nextIndex,
      history,
      pool: shuffleState.pool,
      recordHistory: true,
      notice: shuffleState.nextIndex < 0
        ? (options.fromEnded ? 'Reached the end of the queue.' : 'This is the last track in the queue.')
        : ''
    };
  }

  const nextIndex = queueNextIndex(queue, controls);
  return {
    nextIndex,
    history,
    pool,
    recordHistory: true,
    notice: nextIndex < 0
      ? (options.fromEnded ? 'Reached the end of the queue.' : 'This is the last track in the queue.')
      : ''
  };
}

export function shouldAutoAdvanceQueue(preferences = {}) {
  return normalizeContinuationPreferences(preferences?.playback).continueThroughQueue;
}

export function pauseAfterCurrentBoundary(controls = {}, { naturalEnd = false } = {}) {
  if (!naturalEnd || controls?.pauseAfterCurrent !== true) {
    return { shouldPause: false, controls };
  }
  return {
    shouldPause: true,
    controls: { ...controls, pauseAfterCurrent: false }
  };
}

export function shouldOpenFullPlayerOnPlay(playbackPreferences = {}, queueOptions = {}) {
  return playbackPreferences?.startFullScreen === true && queueOptions?.fromEnded !== true;
}

export function canSeekWithState(seekState = {}, audio = {}) {
  if (!seekState || typeof seekState !== 'object') return false;
  if (!seekState.duration) return false;
  if (!audio) return false;
  const seekableRange = seekableRangeDuration(audio.seekable);
  const finiteAudioDuration = Number.isFinite(audio.duration) && audio.duration > 0;
  if (audio.seekable && !seekableRange) return false;
  if (seekState.usedExpectedDuration) {
    return Boolean(seekableRange);
  }
  return finiteAudioDuration || !audio.seekable || Boolean(seekableRange);
}

export function blockedSeekNotice(seekState = {}, audio = {}) {
  if (audio?.duration === Infinity) {
    return 'This stream does not support seeking.';
  }
  if (seekState?.usedExpectedDuration && seekState.duration) {
    return 'Seeking will be available when this stream exposes a seekable range.';
  }
  return 'Seeking will be available after the track is loaded.';
}

export function sanitizeTrackFeedback(feedback = {}) {
  return {
    favorite: Boolean(feedback.favorite),
    rating: Math.max(0, Math.min(5, Number(feedback.rating) || 0))
  };
}

export function favoriteFeedbackPatch() {
  return (previous = {}) => ({ favorite: !Boolean(previous.favorite) });
}

export function ratingFeedbackPatch(rating) {
  const nextRating = Math.max(0, Math.min(5, Number(rating) || 0));
  return (previous = {}) => ({
    rating: Number(previous.rating) === nextRating ? 0 : nextRating
  });
}

export function pruneTrackFeedback(feedback = {}, maxEntries = 500) {
  const limit = Math.max(0, Number(maxEntries) || 0);
  if (!feedback || typeof feedback !== 'object' || Array.isArray(feedback) || !limit) return {};
  const entries = Object.entries(feedback)
    .map(([id, value], index) => {
      const updatedAt = Number(value?.updatedAt);
      return {
        id,
        feedback: sanitizeTrackFeedback(value),
        index,
        updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : index + 1
      };
    })
    .sort((left, right) => left.updatedAt - right.updatedAt || left.index - right.index)
    .slice(-limit);
  return Object.fromEntries(entries.map(({ id, feedback, updatedAt }) => [
    id,
    { ...feedback, updatedAt }
  ]));
}

export function nextTrackFeedbackState(currentFeedback = {}, songId, patch, updatedAt = Date.now(), maxEntries = 500) {
  if (!songId) {
    return { changed: false, feedback: currentFeedback || {}, prunedCount: 0, reason: 'missing-song' };
  }
  const safeCurrent = currentFeedback && typeof currentFeedback === 'object' && !Array.isArray(currentFeedback) ? currentFeedback : {};
  const limit = Math.max(0, Number(maxEntries) || 0);
  if (!limit) {
    return { changed: false, feedback: {}, prunedCount: Object.keys(safeCurrent).length, reason: 'max-entries-zero' };
  }
  const previous = { favorite: false, rating: 0, ...(safeCurrent[songId] || {}) };
  const nextPatch = typeof patch === 'function' ? patch(previous) : patch;
  const next = {
    ...sanitizeTrackFeedback({ ...previous, ...nextPatch }),
    updatedAt
  };
  if (previous.favorite === next.favorite && previous.rating === next.rating) {
    return {
      changed: false,
      feedback: safeCurrent,
      prunedCount: 0,
      reason: 'unchanged'
    };
  }
  const { [songId]: _previousValue, ...rest } = safeCurrent;
  const prunedRest = pruneTrackFeedback(rest, limit - 1);
  const prunedCount = Math.max(0, Object.keys(rest).length - Object.keys(prunedRest).length);
  const feedback = {
    ...prunedRest,
    [songId]: next
  };
  return {
    changed: true,
    feedback,
    prunedCount,
    reason: 'updated'
  };
}

export function resolveQueueIndex(items, songId, explicitIndex) {
  if (Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < items.length) return explicitIndex;
  return items.findIndex((item) => String((item?.song || item)?.id) === String(songId));
}

export function albumFromSong(song) {
  if (!song) return null;
  if (!song.album && !song.coverArt) return null;
  return {
    id: song.albumId || song.parent || '',
    title: song.album || 'Unknown Album',
    name: song.album || 'Unknown Album',
    artist: song.albumArtist || song.artist || 'Unknown Artist',
    coverArt: song.coverArt
  };
}

export function queueItem(song, album = null) {
  return {
    song,
    album: album || albumFromSong(song)
  };
}

export function albumQueueItems(album) {
  const {song: songs, ...metadata}=album || {};
  if(!Array.isArray(songs))return [];
  // Keep the album response's cover for every track, including automatic
  // advance and shuffle. Track-level cover IDs can be absent or different.
  return songs.filter(song=>song?.id).map(song=>queueItem(song,metadata));
}

export function scrobbleRequiredListenSeconds(duration) {
  const seconds = Number(duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return 240;
  return Math.min(seconds * 0.5, 240);
}

export function shouldSubmitScrobble(duration, listenedSeconds) {
  const listened = Number(listenedSeconds);
  return Number.isFinite(listened) && listened >= scrobbleRequiredListenSeconds(duration);
}

export function playbackReportRetryDelay(attempt) {
  const retry = Math.max(1, Math.floor(Number(attempt) || 1));
  return Math.min(60000, 1000 * (2 ** retry));
}

export function shouldRetryPlaybackReport(error) {
  const status = Number(error?.status);
  if (!Number.isFinite(status) || status <= 0) return true;
  return status === 408 || status === 429 || status >= 500;
}
