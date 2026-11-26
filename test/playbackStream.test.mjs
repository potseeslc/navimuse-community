import assert from 'node:assert/strict';
import test from 'node:test';
import { playbackStreamForCurrentQueueItem } from '../src/playbackStream.js';

test('restored Atlas playback keeps the opaque signed stream on the authoritative queue item', () => {
  const item = { song: { id: 'opaque-queue-item', streamUrl: '/api/atlas/tracks/atr1.signed/stream' } };
  assert.equal(
    playbackStreamForCurrentQueueItem(item, '/api/navidrome/stream/opaque-queue-item'),
    '/api/atlas/tracks/atr1.signed/stream'
  );
});

test('ordinary restored playback uses the Navidrome fallback URL', () => {
  assert.equal(
    playbackStreamForCurrentQueueItem({ song: { id: 'navidrome-id' } }, '/api/navidrome/stream/navidrome-id'),
    '/api/navidrome/stream/navidrome-id'
  );
});
