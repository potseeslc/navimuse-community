import test from 'node:test';
import assert from 'node:assert/strict';
import { navidromeLibraryAlbums, navidromeLibraryBrowse, navidromeBootstrap } from '../src/services/navidromeService.js';

for (const [name, read] of [['album page',()=>navidromeLibraryAlbums({offset:'500',limit:'500'})],['Home bootstrap',()=>navidromeBootstrap('music')]]) for (const phase of ['headers', 'body']) {
  test(`${name} deadline releases a stalled ${phase} read and permits explicit same-cursor retry`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls = [];
    let stuck = true;
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      calls.push({ url, signal: init.signal });
      if (stuck) {
        if (phase === 'headers') return new Promise(() => {});
        return { ok: true, status: 200, json: () => new Promise(() => {}) };
      }
      return Response.json({ albums: [{ id: 'later' }], page: { nextOffset: null } });
    });
    const pending = read();
    const rejected = assert.rejects(pending, { name: 'TimeoutError' });
    await Promise.resolve();
    t.mock.timers.tick(14999);
    assert.equal(calls[0].signal.aborted, false);
    t.mock.timers.tick(1);
    await rejected;
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(calls.length, 1, 'deadline must not automatically retry');
    stuck = false;
    assert.equal((await read()).albums[0].id, 'later');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, calls[0].url);
    t.mock.timers.tick(15000);
    assert.equal(calls[1].signal.aborted, false, 'successful reads clear the deadline');
  });
}

test('Library browse preserves caller cancellation and skips already aborted requests', async t => {
  let signal;
  let count = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    count++;
    signal = init.signal;
    return new Promise(() => {});
  });
  const caller = new AbortController();
  const pending = navidromeLibraryBrowse('artists', {}, { signal: caller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  caller.abort();
  await rejected;
  assert.equal(signal.aborted, true);
  await assert.rejects(navidromeLibraryBrowse('genres', {}, { signal: caller.signal }), { name: 'AbortError' });
  assert.equal(count, 1);
});
