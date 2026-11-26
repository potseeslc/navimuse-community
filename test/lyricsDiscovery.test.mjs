import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { audiomuseLyricsSearch } from '../src/services/audiomuseService.js';

test('lyrics discovery client sends a protected bounded search request', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ ok: true, query: 'winter moon', tracks: [{ id: 'one' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    const payload = await audiomuseLyricsSearch('winter moon', { limit: 7 });
    assert.deepEqual(payload.tracks, [{ id: 'one' }]);
    assert.equal(request.url, '/api/audiomuse/lyrics/search');
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.headers['x-requested-with'], 'NaviMuse');
    assert.deepEqual(JSON.parse(request.init.body), { query: 'winter moon', limit: 7 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
