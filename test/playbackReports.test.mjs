import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendPlaybackReport } from '../src/playbackReports.js';

test('sendPlaybackReport sends the protected production request shape', async () => {
  const response = { ok: true, status: 200 };
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return response;
  };

  assert.equal(await sendPlaybackReport(fetchFn, 'song/id with spaces', true), response);
  assert.deepEqual(calls, [{
    url: '/api/navidrome/scrobble/song%2Fid%20with%20spaces',
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'NaviMuse'
      },
      body: JSON.stringify({ submission: true })
    }
  }]);
});

test('sendPlaybackReport preserves HTTP status for retry classification', async () => {
  const fetchFn = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Session expired'
  });

  await assert.rejects(
    sendPlaybackReport(fetchFn, 'song-a', false),
    (error) => error.message === 'Session expired' && error.status === 401
  );
});

test('sendPlaybackReport supplies a fallback message when the response body is unavailable', async () => {
  const fetchFn = async () => ({
    ok: false,
    status: 503,
    text: async () => { throw new Error('unreadable'); }
  });

  await assert.rejects(
    sendPlaybackReport(fetchFn, 'song-a', true),
    (error) => error.message === 'Playback report failed (503)' && error.status === 503
  );
});
