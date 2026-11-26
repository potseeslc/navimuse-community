import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { offlineShellPlugin } from '../scripts/offline-shell-plugin.mjs';

const assets = ['/index.html', '/assets/app.js', '/assets/atlas.js', '/assets/app.css', '/manifest.webmanifest', '/icon.svg'];
const template = readFileSync(new URL('../scripts/offline-shell-worker.js', import.meta.url), 'utf8');
function harness() {
  const handlers = {}, buckets = new Map(), fetched = [];
  let offline = false, failure = '', claimed = false;
  const keyFor = input => new URL(typeof input === 'string' ? input : input.url, 'https://music.test').pathname;
  const caches = {
    async open(name) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const entries = buckets.get(name);
      return { async put(key, response) { entries.set(keyFor(key), response.clone()); }, async match(key) { return entries.get(keyFor(key))?.clone(); } };
    },
    async keys() { return [...buckets.keys()]; },
    async delete(name) { return buckets.delete(name); }
  };
  vm.runInNewContext(template.replace('__CACHE_NAME__', JSON.stringify('navimuse-shell-v4-new')).replace('__APP_SHELL__', JSON.stringify(assets)), {
    self: { location: { origin: 'https://music.test' }, clients: { async claim() { claimed = true; } }, addEventListener(name, handler) { handlers[name] = handler; } },
    caches, URL, Request, Response,
    async fetch(request) {
      const path = keyFor(request); fetched.push(path);
      if (offline) throw new Error('offline');
      const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
      return new Response(path, { status: path === failure ? 503 : 200, headers: { 'content-type': type } });
    }
  });
  return {
    buckets, caches, fetched, setOffline(value) { offline = value; }, fail(path) { failure = path; },
    get claimed() { return claimed; },
    async lifecycle(name) { let done; handlers[name]({ waitUntil(promise) { done = promise; } }); await done; },
    async request(path, mode = 'cors', method = 'GET') {
      let response;
      handlers.fetch({ request: { url: new URL(path, 'https://music.test').href, mode, method }, respondWith(promise) { response = promise; } });
      return response;
    }
  };
}

test('release shell installs executable assets and serves a complete deep-linked offline launch', async () => {
  const h = harness();
  await h.lifecycle('install');
  assert.deepEqual(h.fetched.sort(), [...assets].sort());
  h.setOffline(true);
  assert.equal(await (await h.request('/?view=library', 'navigate')).text(), '/index.html');
  for (const asset of assets) assert.equal(await (await h.request(asset)).text(), asset);
  assert.equal(await h.request('/api/settings/session'), undefined);
  assert.equal(await h.request('/api/auth/callback', 'navigate'), undefined);
  assert.equal(await h.request('/api/navidrome/stream/track'), undefined);
  assert.equal(await h.request('https://other.test/asset.js'), undefined);
  assert.equal(await h.request('/index.html', 'cors', 'POST'), undefined);
});

test('a partial update fails installation without deleting the previous release', async () => {
  const h = harness();
  await h.caches.open('navimuse-shell-v4-old');
  await h.caches.open('another-app');
  h.fail('/assets/atlas.js');
  await assert.rejects(h.lifecycle('install'), /installation failed/);
  assert.deepEqual(await h.caches.keys(), ['navimuse-shell-v4-old', 'another-app']);
});

test('activation retires only NaviMuse shell caches and missing assets are repaired online', async () => {
  const h = harness();
  await h.caches.open('navimuse-shell-v3');
  await h.caches.open('another-app');
  await h.lifecycle('install');
  await h.lifecycle('activate');
  assert.equal(h.claimed, true);
  assert.deepEqual(await h.caches.keys(), ['another-app', 'navimuse-shell-v4-new']);
  h.buckets.get('navimuse-shell-v4-new').delete('/assets/atlas.js');
  assert.equal(await (await h.request('/assets/atlas.js')).text(), '/assets/atlas.js');
  h.setOffline(true);
  assert.equal(await (await h.request('/assets/atlas.js')).text(), '/assets/atlas.js');
});

test('build manifest includes dynamic chunks and changes its cache key with release content', () => {
  const plugin = offlineShellPlugin();
  const bundle = {
    'index.html': { type: 'asset', source: '<html>release</html>' },
    'assets/app.js': { type: 'chunk', code: 'import("./atlas.js")' },
    'assets/atlas.js': { type: 'chunk', code: 'export const atlas = true' },
    'assets/app.css': { type: 'asset', source: 'body {}' }
  };
  let emitted;
  const build = () => { plugin.generateBundle.call({ emitFile(value) { emitted = value; } }, {}, bundle); return emitted; };
  const first = build();
  for (const path of Object.keys(bundle)) assert.ok(first.source.includes(`/${path}`));
  assert.equal(first.fileName, 'sw-v4.js');
  assert.ok(!first.source.includes('__APP_SHELL__'));
  bundle['assets/app.css'].source = 'body { color: white }';
  assert.notEqual(first.source.match(/const CACHE_NAME = (.*);/)[1], build().source.match(/const CACHE_NAME = (.*);/)[1]);
});
