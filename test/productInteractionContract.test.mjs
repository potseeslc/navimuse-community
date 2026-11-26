import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TRACK_ACTIVATION,
  PLAYBACK_REPORTING_CONTRACT,
  QUEUE_ITEM_PROVENANCE,
  QUEUE_SOURCE_DESCRIPTOR_VERSION,
  QUEUE_SOURCE_KINDS,
  TRACK_ACTION_IDS,
  TRACK_ACTION_LABELS,
  createQueueSourceDescriptor,
  queueItemProvenance,
  validateQueueSourceDescriptor
} from '../src/productInteractionContract.js';
import {
  playbackReportRetryDelay,
  scrobbleRequiredListenSeconds,
  shouldRetryPlaybackReport,
  shouldSubmitScrobble
} from '../src/playerState.js';

test('M8 freezes one ordered track-action vocabulary', () => {
  assert.deepEqual(TRACK_ACTION_IDS, [
    'play-now',
    'play-next',
    'add-to-queue',
    'start-radio',
    'start-journey'
  ]);
  assert.deepEqual(TRACK_ACTION_IDS.map((id) => TRACK_ACTION_LABELS[id]), [
    'Play now',
    'Play next',
    'Add to queue',
    'Start radio',
    'Start Journey'
  ]);
  assert.deepEqual(DEFAULT_TRACK_ACTIVATION, {
    pointerSingle: 'select',
    pointerDouble: 'play-now',
    keyboardEnter: 'play-now',
    keyboardSpace: 'toggle-playback-unless-editing'
  });
});

test('queue source descriptors are bounded, serializable, and display safe', () => {
  assert.equal(QUEUE_SOURCE_DESCRIPTOR_VERSION, 1);
  assert.deepEqual(QUEUE_SOURCE_KINDS, [
    'album', 'playlist', 'search', 'radio', 'journey', 'artist', 'songs', 'ad-hoc', 'listenbrainz'
  ]);
  const descriptor = createQueueSourceDescriptor({
    kind: 'album',
    id: 'album-42',
    label: '  Midnight Signal  ',
    detail: '  Luna Harbor  '
  });
  assert.deepEqual(descriptor, {
    version: 1,
    kind: 'album',
    id: 'album-42',
    label: 'Midnight Signal',
    detail: 'Luna Harbor'
  });
  assert.equal(validateQueueSourceDescriptor(descriptor), descriptor);
  assert.equal(validateQueueSourceDescriptor({ ...descriptor, version: 2 }), null);
  assert.equal(validateQueueSourceDescriptor({ ...descriptor, kind: 'secret-provider' }), null);
  assert.equal(validateQueueSourceDescriptor({ ...descriptor, label: '' }), null);
  assert.equal(validateQueueSourceDescriptor({ ...descriptor, generatedBoundary: -1 }), null);
  assert.equal(Object.isFrozen(descriptor), true);
});

test('generated continuation boundary remains explicit in the same queue', () => {
  assert.deepEqual(createQueueSourceDescriptor({
    kind: 'radio',
    label: 'NaviMuse Radio',
    generatedBoundary: 12
  }), {
    version: 1,
    kind: 'radio',
    label: 'NaviMuse Radio',
    generatedBoundary: 12
  });
});

test('queue item provenance stays internal and fails conservatively to source', () => {
  assert.deepEqual(QUEUE_ITEM_PROVENANCE, ['source', 'explicit', 'generated']);
  assert.equal(queueItemProvenance('explicit'), 'explicit');
  assert.equal(queueItemProvenance('generated'), 'generated');
  assert.equal(queueItemProvenance('unknown'), 'source');
});

test('frozen reporting language matches the implemented thresholds and retry policy', () => {
  assert.equal(PLAYBACK_REPORTING_CONTRACT.maximumRequiredListenSeconds, 240);
  assert.equal(scrobbleRequiredListenSeconds(300), 150);
  assert.equal(scrobbleRequiredListenSeconds(900), 240);
  assert.equal(scrobbleRequiredListenSeconds(0), 240);
  assert.equal(shouldSubmitScrobble(300, 149.9), false);
  assert.equal(shouldSubmitScrobble(300, 150), true);
  assert.equal(shouldRetryPlaybackReport({ status: 408 }), true);
  assert.equal(shouldRetryPlaybackReport({ status: 429 }), true);
  assert.equal(shouldRetryPlaybackReport({ status: 503 }), true);
  assert.equal(shouldRetryPlaybackReport({ status: 401 }), false);
  assert.equal(playbackReportRetryDelay(99), PLAYBACK_REPORTING_CONTRACT.maximumRetryDelayMs);
});
