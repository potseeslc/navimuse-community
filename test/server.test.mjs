import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { chmodSync, readdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { createPlaylist, updatePlaylist } from '../src/playlists.js';
import { sendPlaybackReport } from '../src/playbackReports.js';
import { shouldRetryPlaybackReport } from '../src/playerState.js';
import { createAtlasPointSelection } from '../src/atlasPointSelection.js';
import {
  authHeaders,
  decodeStaticPath,
  fetchAudioMuseSimilar,
  isInsideDirectory,
  isBlockedHostname,
  mediaResponseHeaders,
  normalizeAudioMuseCandidates,
  navidromeEndpoint,
  navidromeRequestHeaders,
  parseNavidromeResponse,
  proxyJson,
  publicServiceUrl,
  publicErrorMessage,
  redactText,
  readBoundedJsonResponse,
  server,
  serviceEndpoint,
  serviceUrl,
  streamParams,
  staticResponseCacheControl,
  staticFilePath,
  safeInternetRadioRedirectUrl,
  safeInternetRadioStreamUrl,
  validMediaResponse
} from '../server.mjs';

test('staticFilePath keeps normal assets inside dist', () => {
  const filePath = staticFilePath('/assets/index.js');
  assert.match(filePath, /\/dist\/assets\/index\.js$/);
});

test('static cache policy never makes the unversioned service worker immutable', () => {
  assert.equal(staticResponseCacheControl('/sw.js', '.js'), 'no-store');
  assert.equal(staticResponseCacheControl('/sw-v3.js', '.js'), 'no-store');
  assert.equal(staticResponseCacheControl('/sw-v4.js', '.js'), 'no-store');
  assert.equal(staticResponseCacheControl('/index.html', '.html'), 'no-store');
  assert.equal(staticResponseCacheControl('/assets/index-hash.js', '.js'), 'public, max-age=31536000, immutable');
});

test('staticFilePath falls back for path traversal attempts', () => {
  const filePath = staticFilePath('/../../etc/passwd');
  assert.match(filePath, /\/dist\/index\.html$/);
});

test('staticFilePath falls back for malformed or null-byte paths', () => {
  assert.match(staticFilePath('/bad/%zz'), /\/dist\/index\.html$/);
  assert.match(staticFilePath('/assets/index.js%00.png'), /\/dist\/index\.html$/);
});

test('decodeStaticPath handles root, malformed escapes, and null bytes', () => {
  assert.equal(decodeStaticPath('/'), '/index.html');
  assert.equal(decodeStaticPath('/album%20art.png'), '/album art.png');
  assert.equal(decodeStaticPath('/bad/%zz'), null);
  assert.equal(decodeStaticPath('/bad%00path'), null);
});

test('isInsideDirectory accepts parent and children only', () => {
  const parent = resolve('/tmp/navimuse/dist');
  assert.equal(isInsideDirectory(parent, parent), true);
  assert.equal(isInsideDirectory(parent, join(parent, 'assets/index.js')), true);
  assert.equal(isInsideDirectory(parent, resolve('/tmp/navimuse/dist-other/index.js')), false);
  assert.equal(isInsideDirectory(parent, resolve('/tmp/navimuse/etc/passwd')), false);
});

test('serviceUrl rejects non-http protocols', () => {
  assert.throws(() => serviceUrl('file:///etc/passwd', 'TEST_URL'), /http or https/);
});

test('serviceEndpoint preserves service origin and appends API path', () => {
  const base = serviceUrl('http://audiomuse-ai-flask-app:8000/');
  assert.equal(
    serviceEndpoint(base, '/api/health'),
    'http://audiomuse-ai-flask-app:8000/api/health'
  );
});

test('serviceEndpoint preserves base pathname prefixes', () => {
  const base = serviceUrl('https://example.test/navidrome/');
  assert.equal(serviceEndpoint(base, '/rest/ping'), 'https://example.test/navidrome/rest/ping');
});

test('publicServiceUrl uses env overrides for internal container names', () => {
  process.env.PUBLIC_NAVIDROME_URL = 'https://music.example.test';
  try {
    assert.equal(publicServiceUrl('http://navidrome:4533/'), 'https://music.example.test/');
  } finally {
    delete process.env.PUBLIC_NAVIDROME_URL;
  }
});

test('publicServiceUrl leaves internal URLs unchanged without env overrides', () => {
  assert.equal(publicServiceUrl('http://navidrome:4533/'), 'http://navidrome:4533/');
});

test('authHeaders omits authorization when no AudioMuse token is configured', () => {
  assert.deepEqual(authHeaders(), {});
});

test('normalizeAudioMuseCandidates accepts supported response shapes', () => {
  const candidates = [{ item_id: 'song-1' }];
  assert.deepEqual(normalizeAudioMuseCandidates(candidates), candidates);
  assert.deepEqual(normalizeAudioMuseCandidates({ similar_tracks: candidates }), candidates);
  assert.deepEqual(normalizeAudioMuseCandidates({ similarTracks: candidates }), candidates);
  assert.deepEqual(normalizeAudioMuseCandidates({ tracks: candidates }), candidates);
  assert.deepEqual(normalizeAudioMuseCandidates({}), []);
});

test('redactText removes AudioMuse query and authorization secrets', () => {
  const redacted = redactText('GET /api?item_id=song-secret&token=api-secret authorization: Bearer bearer-secret');
  assert.equal(redacted.includes('song-secret'), false);
  assert.equal(redacted.includes('api-secret'), false);
  assert.equal(redacted.includes('bearer-secret'), false);
  assert.equal(redacted, 'GET /api?item_id=[redacted]&token=[redacted] authorization: Bearer [redacted]');
});

test('fetchAudioMuseSimilar degrades safely when configuration resolution fails', async () => {
  const candidates = await fetchAudioMuseSimilar('seed', 2, {
    configResolver: () => {
      throw new Error('AudioMuse URL host is not allowed');
    }
  });
  assert.equal(candidates, null);
});

test('navidromeEndpoint adds JSON format by default and omits it for media', () => {
  const jsonUrl = new URL(navidromeEndpoint('/rest/ping.view'));
  assert.equal(jsonUrl.pathname, '/rest/ping.view');
  assert.equal(jsonUrl.searchParams.get('f'), 'json');
  assert.equal(jsonUrl.searchParams.get('c'), 'NaviMuse');

  const mediaUrl = new URL(navidromeEndpoint('/rest/stream.view', { id: 'abc' }, { formatJson: false }));
  assert.equal(mediaUrl.pathname, '/rest/stream.view');
  assert.equal(mediaUrl.searchParams.get('id'), 'abc');
  assert.equal(mediaUrl.searchParams.has('f'), false);
});

test('publicErrorMessage exposes only expected service setup errors', () => {
  assert.equal(publicErrorMessage({ status: 503, message: 'Navidrome credentials are not configured' }), 'Navidrome credentials are not configured');
  assert.equal(publicErrorMessage({ status: 400, message: 'Invalid JSON request body', publicMessage: 'Invalid JSON request body' }), 'Invalid JSON request body');
  assert.equal(publicErrorMessage({ status: 400, message: 'Leaky validation detail' }), 'Internal server error');
  assert.equal(publicErrorMessage(new Error('database exploded')), 'Internal server error');
});

test('parseNavidromeResponse returns successful Subsonic JSON payloads', async () => {
  const response = new Response(JSON.stringify({
    'subsonic-response': {
      status: 'ok',
      musicFolders: { musicFolder: [{ id: 1, name: 'Music' }] }
    }
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });

  const subsonic = await parseNavidromeResponse(response);
  assert.equal(subsonic.status, 'ok');
  assert.equal(subsonic.musicFolders.musicFolder[0].name, 'Music');
});

test('parseNavidromeResponse maps Subsonic and non-JSON failures to 502', async () => {
  const subsonicError = new Response(JSON.stringify({
    'subsonic-response': { status: 'failed', error: { code: 40 } }
  }), {
    headers: { 'content-type': 'application/json' }
  });

  await assert.rejects(() => parseNavidromeResponse(subsonicError), { status: 502 });

  const htmlError = new Response('<html>bad gateway</html>', {
    status: 502,
    headers: { 'content-type': 'text/html' }
  });

  await assert.rejects(() => parseNavidromeResponse(htmlError), { status: 502 });
});

test('navidromeRequestHeaders forwards Range only when present', () => {
  assert.deepEqual(navidromeRequestHeaders({ headers: {} }), {});
  assert.deepEqual(navidromeRequestHeaders({ headers: { range: 'bytes=10-99' } }), {
    Range: 'bytes=10-99'
  });
});

test('streamParams allows browser transcode options only', () => {
  const allowed = streamParams('track-1', new URLSearchParams('format=mp3&maxBitRate=320'));
  assert.deepEqual(allowed, { id: 'track-1', format: 'mp3', maxBitRate: '320' });

  const noLimit = streamParams('track-1', new URLSearchParams('format=raw&maxBitRate=0'));
  assert.deepEqual(noLimit, { id: 'track-1', format: 'raw', maxBitRate: '0' });

  const rejected = streamParams('track-2', new URLSearchParams('format=wav&maxBitRate=unlimited'));
  assert.deepEqual(rejected, { id: 'track-2' });
});

test('validMediaResponse rejects XML media error payloads', () => {
  assert.equal(validMediaResponse(new Response('jpg', {
    headers: { 'content-type': 'image/jpeg' }
  }), '/rest/getCoverArt.view'), true);

  assert.equal(validMediaResponse(new Response('jpg', {
    headers: { 'content-type': 'application/octet-stream' }
  }), '/rest/getCoverArt.view'), true);

  assert.equal(validMediaResponse(new Response('<error />', {
    headers: { 'content-type': 'application/xml' }
  }), '/rest/getCoverArt.view'), false);

  assert.equal(validMediaResponse(new Response('audio', {
    headers: { 'content-type': 'audio/mpeg' }
  }), '/rest/stream.view'), true);

  assert.equal(validMediaResponse(new Response('audio', {
    headers: { 'content-type': 'Audio/MPEG; charset=binary' }
  }), '/radio-stream'), true);

  assert.equal(validMediaResponse(new Response('hls', {
    headers: { 'content-type': 'application/vnd.apple.mpegurl' }
  }), '/radio-stream'), false);

  assert.equal(validMediaResponse(new Response('pls', {
    headers: { 'content-type': 'application/x-scpls' }
  }), '/radio-stream'), false);

  assert.equal(validMediaResponse(new Response('pls', {
    headers: { 'content-type': 'audio/x-scpls' }
  }), '/radio-stream'), false);

  assert.equal(validMediaResponse(new Response('video', {
    headers: { 'content-type': 'video/mp4' }
  }), '/radio-stream'), true);

  assert.equal(validMediaResponse(new Response('<html></html>', {
    headers: { 'content-type': 'text/html' }
  }), '/radio-stream'), false);
});

test('mediaResponseHeaders preserves range-related upstream headers', () => {
  const response = new Response('partial', {
    status: 206,
    headers: {
      'content-type': 'audio/flac',
      'accept-ranges': 'bytes',
      'content-range': 'bytes 10-99/1000',
      'content-length': '90'
    }
  });

  assert.deepEqual(mediaResponseHeaders(response, '/rest/stream.view'), {
    'content-type': 'audio/flac',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    'content-range': 'bytes 10-99/1000',
    'content-length': '90'
  });
});

test('internet radio stream safety blocks local and private hosts', () => {
  assert.equal(isBlockedHostname('127.0.0.1'), true);
  assert.equal(isBlockedHostname('10.0.0.5'), true);
  assert.equal(isBlockedHostname('192.168.1.10'), true);
  assert.equal(isBlockedHostname('172.16.4.20'), true);
  assert.equal(isBlockedHostname('100.64.0.1'), true);
  assert.equal(isBlockedHostname('100.127.255.255'), true);
  assert.equal(isBlockedHostname('[fe80::1]'), true);
  assert.equal(isBlockedHostname('[fc00::1]'), true);
  assert.equal(isBlockedHostname('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedHostname('[::ffff:10.0.0.1]'), true);
  assert.equal(isBlockedHostname('::ffff:7f00:1'), true);
  assert.equal(safeInternetRadioStreamUrl('http://2130706433/radio.mp3'), null);
  assert.equal(safeInternetRadioStreamUrl('http://0177.0.0.1/radio.mp3'), null);
  assert.equal(safeInternetRadioStreamUrl('http://[::ffff:127.0.0.1]/radio.mp3'), null);
  assert.equal(safeInternetRadioStreamUrl('ftp://radio.example/stream'), null);
  assert.equal(safeInternetRadioStreamUrl('https://ice1.somafm.com/groovesalad-128-mp3'), 'https://ice1.somafm.com/groovesalad-128-mp3');
  assert.equal(safeInternetRadioRedirectUrl('http://127.0.0.1/radio.mp3', 'https://ice1.somafm.com/stream'), null);
  assert.equal(
    safeInternetRadioRedirectUrl('/groovesalad-128-mp3', 'https://ice1.somafm.com/redirect'),
    'https://ice1.somafm.com/groovesalad-128-mp3'
  );
});

test('HTTP /api/config returns JSON service config', async () => {
  const response = await requestServer('/api/config');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  const body = await response.json();
  assert.equal(body.app, 'NaviMuse');
  assert.equal(body.services.navidrome, 'http://navidrome:4533/');
  assert.equal(body.services.audiomuse, 'http://audiomuse-ai-flask-app:8000/');
});

test('HTTP API allows credentialed Tauri origin reads without opening arbitrary browser origins', async () => {
  const nativeSession = await requestServer('/api/settings/session', server, {
    headers: { origin: 'tauri://localhost' }
  });
  assert.equal(nativeSession.status, 200);
  assert.equal(nativeSession.headers.get('access-control-allow-origin'), 'tauri://localhost');
  assert.equal(nativeSession.headers.get('access-control-allow-credentials'), 'true');
  assert.match(nativeSession.headers.get('vary'), /Origin/);

  const webSession = await requestServer('/api/settings/session', server, {
    headers: { origin: 'https://example.test' }
  });
  assert.equal(webSession.status, 200);
  assert.equal(webSession.headers.get('access-control-allow-origin'), null);
  assert.equal(webSession.headers.get('access-control-allow-credentials'), null);
});

test('HTTP API answers Tauri preflights while preserving write header requirements', async () => {
  const preflight = await requestServer('/api/settings', server, {
    method: 'OPTIONS',
    headers: {
      origin: 'tauri://localhost',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-requested-with'
    }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'tauri://localhost');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-requested-with/);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-request-id/);
});

test('HTTP requireAppAuth protects service BFF routes and preserves authenticated media ranges', async () => {
  let rejectOfflineAuth = false;
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': rejectOfflineAuth ? { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } : { status: 'ok' } }));
      return;
    }
    if (url.pathname === '/rest/getMusicFolders.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', musicFolders: { musicFolder: [] } } }));
      return;
    }
    if (url.pathname === '/rest/getAlbumList2.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', albumList2: { album: [] } } }));
      return;
    }
    if (url.pathname === '/rest/stream.view') {
      assert.equal(req.headers.range, 'bytes=10-19');
      res.writeHead(206, {
        'content-type': 'audio/mpeg',
        'accept-ranges': 'bytes',
        'content-range': 'bytes 10-19/100',
        'content-length': '10'
      });
      res.end('0123456789');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('bff-session-boundary', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const app = await openAppServer(module.server);
    try {
      const setup = await fetch(`${app.origin}/api/settings/admin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
      });
      assert.equal(setup.status, 200);
      const cookie = setup.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly; SameSite=Lax/);

      for (const path of [
        '/api/navidrome/offline-access',
        '/api/navidrome/bootstrap',
        '/api/navidrome/cover/cover-id',
        '/api/navidrome/stream/song-id',
        '/api/audiomuse/dashboard',
        '/api/audiomuse/clap/stats',
        '/api/audiomuse/waveform/song-id'
      ]) {
        const response = await fetch(`${app.origin}${path}`);
        assert.equal(response.status, 401, path);
      }

      const browse = await fetch(`${app.origin}/api/navidrome/bootstrap`, { headers: { cookie } });
      assert.equal(browse.status, 200);

      const leaseResponse = await fetch(`${app.origin}/api/navidrome/offline-access`, { headers: { cookie } });
      assert.equal(leaseResponse.status, 200);
      assert.equal(leaseResponse.headers.get('cache-control'), 'private, no-store');
      const lease = await leaseResponse.json();
      assert.match(lease.scope, /^queue-scope-v1:[a-f0-9]{64}$/);
      assert.equal(lease.expiresAt - lease.issuedAt, 30 * 86400000);
      assert.deepEqual(Object.keys(lease).sort(), ['expiresAt', 'issuedAt', 'navidromeIdFormat', 'scope', 'version']);
      assert.equal(lease.navidromeIdFormat,'legacy');
      const mismatchedLease=await fetch(`${app.origin}/api/navidrome/offline-access?accountScope=${'queue-scope-v1:'+ '0'.repeat(64)}`,{headers:{cookie}});
      assert.equal(mismatchedLease.status,409);assert.equal((await mismatchedLease.json()).expiresAt,undefined);
      assert.equal((await fetch(`${app.origin}/api/navidrome/offline-access?accountScope=${lease.scope}&accountScope=${lease.scope}`,{headers:{cookie}})).status,400);
      assert.equal((await fetch(`${app.origin}/api/navidrome/offline-access?accountScope=${lease.scope}`,{headers:{cookie}})).status,200);

      assert.equal((await fetch(`${app.origin}/api/navidrome/offline-access?expiresAt=9999999999999`, { headers: { cookie } })).status, 400);
      rejectOfflineAuth = true;
      const rejectedLease = await fetch(`${app.origin}/api/navidrome/offline-access`, { headers: { cookie } });
      assert.equal(rejectedLease.status, 403);
      assert.equal((await rejectedLease.json()).expiresAt, undefined);
      rejectOfflineAuth = false;

      const stream = await fetch(`${app.origin}/api/navidrome/stream/song-id`, {
        headers: { cookie, range: 'bytes=10-19' }
      });
      assert.equal(stream.status, 206);
      assert.equal(stream.headers.get('accept-ranges'), 'bytes');
      assert.equal(stream.headers.get('content-range'), 'bytes 10-19/100');
      assert.equal(await stream.text(), '0123456789');
    } finally {
      await app.close();
    }
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Pocket ID login uses authorization code flow with PKCE, state, nonce, and a secure transaction cookie', async () => {
  const provider = createHttpServer((req, res) => {
    if (req.url === '/.well-known/openid-configuration') {
      const origin = `http://127.0.0.1:${provider.address().port}`;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        jwks_uri: `${origin}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256']
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const issuer = `http://127.0.0.1:${provider.address().port}`;
  const { dataDir, module, restore } = await isolatedServerModule('pocket-id-login', {
    NAVIMUSE_OIDC_ISSUER: issuer,
    NAVIMUSE_OIDC_CLIENT_ID: 'client-id',
    NAVIMUSE_OIDC_CLIENT_SECRET: 'client-secret',
    NAVIMUSE_OIDC_REDIRECT_URI: 'http://navimuse.test/api/auth/callback',
    TRUST_PROXY: 'true'
  });

  try {
    const session = await requestServer('/api/settings/session', module.server);
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), {
      ok: true,
      adminConfigured: true,
      authenticated: false,
      authMode: 'oidc',
      loginUrl: '/api/auth/login',
      user: null
    });

    const login = await requestServer('/api/auth/login', module.server, {
      redirect: 'manual',
      headers: { 'x-forwarded-proto': 'https' }
    });
    assert.equal(login.status, 302);
    const authorization = new URL(login.headers.get('location'));
    assert.equal(authorization.origin, issuer);
    assert.equal(authorization.pathname, '/authorize');
    assert.equal(authorization.searchParams.get('client_id'), 'client-id');
    assert.equal(authorization.searchParams.get('redirect_uri'), 'http://navimuse.test/api/auth/callback');
    assert.equal(authorization.searchParams.get('response_type'), 'code');
    assert.equal(authorization.searchParams.get('scope'), 'openid profile email');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(authorization.searchParams.get('code_challenge'));
    assert.ok(authorization.searchParams.get('state'));
    assert.ok(authorization.searchParams.get('nonce'));
    assert.match(login.headers.get('set-cookie'), /^navimuse_oidc=.+; Path=\/api\/auth\/callback; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/);

    const settings = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'));
    assert.ok(settings.admin.sessionSecret.length >= 32);

    const settingsKey = readFileSync(join(dataDir, 'settings.key'));
    const signingSubkey = createHmac('sha256', settingsKey).update('navimuse:session-signing:v1').digest();
    const signingKey = createHmac('sha256', signingSubkey).update(settings.admin.sessionSecret).digest();
    const payload = Buffer.from(JSON.stringify({
      exp: Date.now() + 60_000,
      gen: 0,
      nonce: 'test-session',
      issuer,
      sub: 'pocket-id-user',
      name: 'Pocket ID User',
      email: 'user@example.test'
    })).toString('base64url');
    const sessionToken = `${payload}.${createHmac('sha256', signingKey).update(payload).digest('base64url')}`;
    const sessionCookie = `navimuse_session=${sessionToken}`;
    const authenticatedRoute = await requestServer('/api/navidrome/bootstrap', module.server, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(authenticatedRoute.status, 503);

    const legacyLogout = await requestServer('/api/settings/logout', module.server, {
      method: 'POST',
      headers: { cookie: sessionCookie }
    });
    assert.equal(legacyLogout.status, 409);
    assert.equal((await legacyLogout.json()).error, 'Use /api/auth/logout to sign out of Pocket ID mode');

    const logout = await requestServer('/api/auth/logout', module.server, {
      method: 'POST',
      headers: { cookie: sessionCookie }
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /^navimuse_session=; Path=\/; Max-Age=0;/);
    const revokedRoute = await requestServer('/api/navidrome/bootstrap', module.server, {
      headers: { cookie: sessionCookie }
    });
    assert.equal(revokedRoute.status, 401);

    const invalidCallback = await requestServer('/api/auth/callback?code=bad&state=bad', module.server, { redirect: 'manual' });
    assert.equal(invalidCallback.status, 302);
    assert.match(invalidCallback.headers.get('location'), /^\/?\?auth_error=/);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const retry = await requestServer('/api/auth/callback?code=bad&state=bad', module.server, { redirect: 'manual' });
      assert.equal(retry.status, 302);
    }
    const throttledCallback = await requestServer('/api/auth/callback?code=bad&state=bad', module.server, { redirect: 'manual' });
    assert.equal(throttledCallback.status, 302);
    assert.match(new URL(throttledCallback.headers.get('location'), 'http://navimuse.test').searchParams.get('auth_error'), /Too many sign-in attempts/);

    const protectedRoute = await requestServer('/api/navidrome/bootstrap', module.server);
    assert.equal(protectedRoute.status, 401);
    assert.equal((await protectedRoute.json()).error, 'Sign in with Pocket ID to access your music library');
  } finally {
    restore();
    await closeServer(provider);
  }
});

test('OIDC callback failures expose no provider details in ordinary logs or redirects', async () => {
  let tokenRequests = 0;
  const provider = createHttpServer((req, res) => {
    const origin = `http://127.0.0.1:${provider.address().port}`;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/.well-known/openid-configuration') {
      res.end(JSON.stringify({issuer: origin, authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`, jwks_uri: `${origin}/jwks`,
        response_types_supported: ['code'], subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256']}));
    } else if (req.url === '/token') {
      tokenRequests++;
      res.writeHead(400);
      res.end(JSON.stringify({error: 'invalid_grant', error_description: 'private-provider-detail user@example.test secret-token'}));
    } else { res.writeHead(404); res.end('{}'); }
  });
  provider.listen(0, '127.0.0.1');
  await once(provider, 'listening');
  const {module, restore} = await isolatedServerModule('oidc-private-error', {
    NAVIMUSE_OIDC_ISSUER: `http://127.0.0.1:${provider.address().port}`,
    NAVIMUSE_OIDC_CLIENT_ID: 'client-id', NAVIMUSE_OIDC_CLIENT_SECRET: 'client-secret',
    NAVIMUSE_OIDC_REDIRECT_URI: 'http://navimuse.test/api/auth/callback'
  });
  const originalWarn = console.warn;
  const warnings = [];
  try {
    const login = await requestServer('/api/auth/login', module.server, {redirect: 'manual'});
    const authorization = new URL(login.headers.get('location'));
    console.warn = (...args) => warnings.push(args);
    const response = await requestServer(`/api/auth/callback?code=test-code&state=${encodeURIComponent(authorization.searchParams.get('state'))}`,
      module.server, {redirect: 'manual', headers: {cookie: login.headers.get('set-cookie').split(';')[0]}});
    assert.equal(tokenRequests, 1);
    assert.equal(response.status, 302);
    assert.deepEqual(warnings, [['Pocket ID callback failed.']]);
    assert.equal(new URL(response.headers.get('location'), 'http://navimuse.test').searchParams.get('auth_error'),
      'Pocket ID sign-in could not be completed.');
    assert.match(response.headers.get('set-cookie'), /^navimuse_oidc=;.*Max-Age=0/);
    assert.doesNotMatch(response.headers.get('set-cookie'), /navimuse_session=/);
  } finally {
    console.warn = originalWarn;
    restore();
    await closeServer(provider);
  }
});

test('HTTP Navidrome JSON endpoints return 503 when credentials are missing', async () => {
  const {module,restore}=await isolatedServerModule('missing-credentials-authenticated');
  try {
  for (const endpoint of [
    '/api/navidrome/bootstrap',
    '/api/navidrome/playlists/example-playlist',
    '/api/navidrome/radios'
  ]) {
    const response = await requestAuthenticatedServer(endpoint,module.server);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'Navidrome credentials are not configured'
    });
  }
  } finally {restore();}
});

test('HTTP Navidrome bootstrap returns frequent albums for artist radio seeds', async () => {
  const albumListCalls = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/getMusicFolders.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          musicFolders: { musicFolder: [{ id: 'music', name: 'Music' }] }
        }
      }));
      return;
    }

    if (url.pathname === '/rest/getAlbumList2.view') {
      const type = url.searchParams.get('type');
      albumListCalls.push({
        type,
        size: url.searchParams.get('size'),
        musicFolderId: url.searchParams.get('musicFolderId')
      });
      const albums = {
        recent: [{ id: 'recent-1', title: 'Heard Album', artist: 'Heard Artist' }],
        newest: [{ id: 'newest-1', title: 'New Album', artist: 'Newest Artist' }],
        random: [{ id: 'random-1', title: 'Random Album', artist: 'Random Artist' }],
        frequent: [{ id: 'frequent-1', title: 'Frequent Album', artist: 'Top Artist', playCount: 42 }]
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          albumList2: { album: albums[type] || [] }
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-bootstrap-frequent', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const response = await requestAuthenticatedServer('/api/navidrome/bootstrap?musicFolderId=music', module.server);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.musicFolders[0].name, 'Music');
    assert.equal(body.newestAlbums[0].title, 'New Album');
    assert.equal(body.randomAlbums[0].title, 'Random Album');
    assert.equal(body.recentAlbums[0].title, 'Heard Album');
    assert.equal(body.recentAlbumsUnavailable, false);
    assert.equal(body.frequentAlbums[0].artist, 'Top Artist');
    assert.deepEqual(albumListCalls.sort((left, right) => left.type.localeCompare(right.type)), [
      { type: 'frequent', size: '24', musicFolderId: 'music' },
      { type: 'newest', size: '18', musicFolderId: 'music' },
      { type: 'random', size: '8', musicFolderId: 'music' },
      { type: 'recent', size: '18', musicFolderId: 'music' }
    ]);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome bootstrap tolerates unavailable frequent and recent albums', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/getMusicFolders.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          musicFolders: { musicFolder: [{ id: 'music', name: 'Music' }] }
        }
      }));
      return;
    }

    if (url.pathname === '/rest/getAlbumList2.view' && ['frequent', 'recent'].includes(url.searchParams.get('type'))) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'failed',
          error: { code: 70, message: 'Unsupported list type' }
        }
      }));
      return;
    }

    if (url.pathname === '/rest/getAlbumList2.view') {
      const type = url.searchParams.get('type');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          albumList2: { album: [{ id: `${type}-1`, title: `${type} album`, artist: `${type} artist` }] }
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-bootstrap-frequent-fallback', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const response = await requestAuthenticatedServer('/api/navidrome/bootstrap', module.server);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.newestAlbums[0].title, 'newest album');
    assert.equal(body.randomAlbums[0].title, 'random album');
    assert.deepEqual(body.frequentAlbums, []);
    assert.deepEqual(body.recentAlbums, []);
    assert.equal(body.recentAlbumsUnavailable, true);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome bootstrap reports unavailable upstreams without crashing the server', async () => {
  const unavailable = createHttpServer();
  unavailable.listen(0, '127.0.0.1');
  await once(unavailable, 'listening');
  const address = unavailable.address();
  await closeServer(unavailable);

  const { module, restore } = await isolatedServerModule('navidrome-bootstrap-unavailable', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const failed = await requestAuthenticatedServer('/api/navidrome/bootstrap', module.server);
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { ok: false, error: 'Navidrome is unavailable' });

    const followUp = await requestAuthenticatedServer('/api/health', module.server);
    assert.equal(followUp.status, 200);
  } finally {
    restore();
  }
});

test('HTTP Navidrome media endpoints return 503 when credentials are missing', async () => {
  const {module,restore}=await isolatedServerModule('missing-credentials-authenticated');
  try {
  const response = await requestAuthenticatedServer('/api/navidrome/cover/example',module.server);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'Navidrome credentials are not configured'
  });
  } finally {restore();}
});

test('HTTP Navidrome media proxy validates upstream media content types', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/stream.view') {
      if (url.searchParams.get('id') === 'redirect-song') {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': 'audio/mpeg',
        'content-length': '5'
      });
      res.end('audio');
      return;
    }

    if (url.pathname === '/rest/getCoverArt.view' && url.searchParams.get('id') === 'bad-cover') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end('<error />');
      return;
    }

    if (url.pathname === '/rest/getCoverArt.view') {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': '3'
      });
      res.end('jpg');
      return;
    }

    res.writeHead(404);
    res.end();
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');

  const {module,restore}=await isolatedServerModule('media-proxy-test',{
    NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,
    NAVIDROME_USERNAME:'tester',NAVIDROME_PASSWORD:'secret',
  });
  try {
    const stream = await requestAuthenticatedServer('/api/navidrome/stream/song-1?format=mp3&maxBitRate=320', module.server);
    assert.equal(stream.status, 200);
    assert.equal(stream.headers.get('content-type'), 'audio/mpeg');
    assert.equal(await stream.text(), 'audio');

    const redirectedStream = await requestAuthenticatedServer('/api/navidrome/stream/redirect-song?format=mp3&maxBitRate=320', module.server);
    assert.equal(redirectedStream.status, 502);
    assert.deepEqual(await redirectedStream.json(), {
      ok: false,
      error: 'Navidrome media request failed'
    });

    const cover = await requestAuthenticatedServer('/api/navidrome/cover/good-cover', module.server);
    assert.equal(cover.status, 200);
    assert.equal(cover.headers.get('content-type'), 'application/octet-stream');
    assert.equal(await cover.text(), 'jpg');

    const invalidCover = await requestAuthenticatedServer('/api/navidrome/cover/bad-cover', module.server);
    assert.equal(invalidCover.status, 200);
    assert.match(invalidCover.headers.get('content-type'), /image\/svg\+xml/);
    assert.equal(invalidCover.headers.get('cache-control'), 'private, no-store');
    assert.match(await invalidCover.text(), /Missing album artwork/);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome library browse endpoints return artists albums playlists and genres', async () => {
  const seenFolderIds = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.searchParams.has('musicFolderId')) {
      seenFolderIds.push(`${url.pathname}:${url.searchParams.get('musicFolderId')}`);
    }
    if (url.pathname === '/rest/getArtists.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          artists: {
            index: [
              { name: 'B', artist: [{ id: 'artist-1', name: 'Beatles', albumCount: 12 }] },
              { name: 'P', artist: { id: 'artist-2', name: 'Prince', albumCount: 8 } }
            ]
          }
        }
      }));
      return;
    }

    if (url.pathname === '/rest/getPlaylists.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlists: { playlist: [{ id: 'playlist-1', name: 'Deep Cuts', songCount: 42 }] }
        }
      }));
      return;
    }

    if (url.pathname === '/rest/getAlbumList2.view') {
      assert.equal(url.searchParams.get('type'), 'alphabeticalByArtist');
      assert.equal(url.searchParams.get('size'), '500');
      assert.equal(url.searchParams.get('offset'), '0');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          albumList2: { album: [{ id: 'album-1', name: 'Abbey Road', artist: 'The Beatles' }] }
        }
      }));
      return;
    }

    if (url.pathname === '/rest/getGenres.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          genres: { genre: [{ value: 'Rock', songCount: 2500 }, { value: 'Jazz', songCount: 800 }] }
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-library-browse', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const artists = await requestAuthenticatedServer('/api/navidrome/library/artists?musicFolderId=music-folder-1', module.server);
    assert.equal(artists.status, 200);
    assert.deepEqual((await artists.json()).artists.map((artist) => artist.name), ['Beatles', 'Prince']);

    const playlists = await requestAuthenticatedServer('/api/navidrome/library/playlists', module.server);
    assert.equal(playlists.status, 200);
    assert.equal((await playlists.json()).playlists[0].name, 'Deep Cuts');

    const albums = await requestAuthenticatedServer('/api/navidrome/library/albums?sort=alphabeticalByArtist&musicFolderId=music-folder-1', module.server);
    assert.equal(albums.status, 200);
    const albumBody = await albums.json();
    assert.equal(albumBody.albums[0].name, 'Abbey Road');
    assert.deepEqual(albumBody.page, { offset: 0, limit: 500, nextOffset: null });

    const genres = await requestAuthenticatedServer('/api/navidrome/library/genres', module.server);
    assert.equal(genres.status, 200);
    assert.deepEqual((await genres.json()).genres.map((genre) => genre.value), ['Rock', 'Jazz']);
    assert.deepEqual(seenFolderIds, [
      '/rest/getArtists.view:music-folder-1',
      '/rest/getAlbumList2.view:music-folder-1'
    ]);

    const unknown = await requestAuthenticatedServer('/api/navidrome/library/unknown', module.server);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), {
      ok: false,
      error: 'Unknown library view'
    });
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome album pagination clamps parameters and terminates on a partial page', async () => {
  const seen = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname !== '/rest/getAlbumList2.view') {
      res.writeHead(404);
      res.end();
      return;
    }
    const size = Number(url.searchParams.get('size'));
    const offset = Number(url.searchParams.get('offset'));
    seen.push({ size, offset });
    const resultCount = offset === 500 ? 2 : size;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      'subsonic-response': {
        status: 'ok',
        albumList2: {
          album: Array.from({ length: resultCount }, (_, index) => ({
            id: `album-${offset + index}`,
            name: `Album ${offset + index}`
          }))
        }
      }
    }));
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-album-pagination', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const first = await requestAuthenticatedServer('/api/navidrome/library/albums?offset=-4&limit=900', module.server);
    assert.deepEqual((await first.json()).page, { offset: 0, limit: 500, nextOffset: 500 });

    const final = await requestAuthenticatedServer('/api/navidrome/library/albums?offset=500&limit=500', module.server);
    assert.deepEqual((await final.json()).page, { offset: 500, limit: 500, nextOffset: null });

    const defaults = await requestAuthenticatedServer('/api/navidrome/library/albums?offset=invalid&limit=invalid', module.server);
    assert.deepEqual((await defaults.json()).page, { offset: 0, limit: 500, nextOffset: 500 });
    assert.deepEqual(seen, [
      { size: 500, offset: 0 },
      { size: 500, offset: 500 },
      { size: 500, offset: 0 }
    ]);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome artist and genre song routes use exact decoded seeds and normalize songs', async () => {
  const upstreamCalls = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    upstreamCalls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
    res.writeHead(200, { 'content-type': 'application/json' });

    if (url.pathname === '/rest/getArtist.view') {
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          artist: { id: 'artist id', name: 'Exact Artist', album: [{ id: 'album-1' }, { id: 'album-2' }] }
        }
      }));
      return;
    }
    if (url.pathname === '/rest/getAlbum.view') {
      const song = url.searchParams.get('id') === 'album-1'
        ? [
            { id: 'exact-1', artistId: 'artist id' },
            { id: 'guest-track', artistId: 'another-artist' },
            { id: 'compilation-guest', artistId: 'featured-artist', albumArtistId: 'artist id' },
            { id: 'name-match', artist: ' exact artist ' },
            { id: 'name-miss', artist: 'Other Artist' }
          ]
        : { id: 'exact-2', albumArtistId: 'artist id' };
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', album: { song } } }));
      return;
    }
    if (url.pathname === '/rest/getSongsByGenre.view') {
      res.end(JSON.stringify({
        'subsonic-response': { status: 'ok', songsByGenre: { song: { id: 'genre-1', genre: 'Post Rock' } } }
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-journey-song-routes', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const artist = await requestAuthenticatedServer('/api/navidrome/artists/artist%20id/songs', module.server);
    assert.equal(artist.status, 200);
    assert.deepEqual(await artist.json(), {
      artist: { id: 'artist id', name: 'Exact Artist' },
      songs: [
        { id: 'exact-1', artistId: 'artist id' },
        { id: 'name-match', artist: ' exact artist ' },
        { id: 'exact-2', albumArtistId: 'artist id' }
      ]
    });

    const genre = await requestAuthenticatedServer('/api/navidrome/genres/Post%20Rock/songs', module.server);
    assert.equal(genre.status, 200);
    assert.deepEqual(await genre.json(), {
      genre: 'Post Rock',
      songs: [{ id: 'genre-1', genre: 'Post Rock' }]
    });

    assert.deepEqual(upstreamCalls.map(({ path, params }) => ({
      path,
      id: params.id,
      genre: params.genre,
      count: params.count,
      offset: params.offset
    })), [
      { path: '/rest/getArtist.view', id: 'artist id', genre: undefined, count: undefined, offset: undefined },
      { path: '/rest/getAlbum.view', id: 'album-1', genre: undefined, count: undefined, offset: undefined },
      { path: '/rest/getAlbum.view', id: 'album-2', genre: undefined, count: undefined, offset: undefined },
      { path: '/rest/getSongsByGenre.view', id: undefined, genre: 'Post Rock', count: '500', offset: '0' }
    ]);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome artist and genre song routes reject malformed path parameters', async () => {
  const { module, restore } = await isolatedServerModule('navidrome-journey-song-route-decode', {
    NAVIDROME_URL: 'http://127.0.0.1:1',
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });
  try {
    const artist = await requestAuthenticatedServer('/api/navidrome/artists/%E0%A4/songs', module.server);
    assert.equal(artist.status, 400);
    assert.deepEqual(await artist.json(), { ok: false, error: 'Invalid encoded path parameter' });
    const genre = await requestAuthenticatedServer('/api/navidrome/genres/%E0%A4/songs', module.server);
    assert.equal(genre.status, 400);
    assert.deepEqual(await genre.json(), { ok: false, error: 'Invalid encoded path parameter' });
  } finally {
    restore();
  }
});

test('HTTP Navidrome artist songs preserve healthy albums when one album lookup fails', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/getArtist.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          artist: { id: 'artist-1', name: 'Resilient Artist', album: [{ id: 'healthy' }, { id: 'broken' }] }
        }
      }));
      return;
    }
    if (url.pathname === '/rest/getAlbum.view' && url.searchParams.get('id') === 'healthy') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          album: { song: [{ id: 'healthy-song', artistId: 'artist-1' }] }
        }
      }));
      return;
    }
    if (url.pathname === '/rest/getAlbum.view') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'album unavailable' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-artist-songs-partial-album-failure', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const response = await requestAuthenticatedServer('/api/navidrome/artists/artist-1/songs', module.server);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      artist: { id: 'artist-1', name: 'Resilient Artist' },
      songs: [{ id: 'healthy-song', artistId: 'artist-1' }]
    });
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome playlist and internet radio endpoints return discovery payloads', async (t) => {
  let streamBase = '';
  let stationStreamPath = '/radio-redirect';
  const radioRangeHeaders = [];
  const radioUserAgents = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/radio.mp3') {
      radioRangeHeaders.push(req.headers.range || '');
      radioUserAgents.push(req.headers['user-agent'] || '');
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'icy-logo': `${streamBase}/logo.png` });
      res.end('fake-radio-audio');
      return;
    }

    if (url.pathname === '/radio.pls') {
      res.writeHead(200, { 'content-type': 'audio/x-scpls' });
      res.end(`[playlist]\nFile1=${streamBase}/radio.mp3\nTitle1=Station\n`); return;
    }
    if (url.pathname === '/radio-playlist.m3u') {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      res.end(`#EXTM3U\n${streamBase}/radio.pls\n`);
      return;
    }

    if (url.pathname === '/radio-redirect') {
      res.writeHead(302, { location: `${streamBase}/radio.mp3` });
      res.end();
      return;
    }

    if (url.pathname === '/rest/getPlaylist.view') {
      if (url.searchParams.get('id') === 'missing-playlist') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }));
        return;
      }

      assert.equal(url.searchParams.get('id'), 'playlist-1');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: {
            id: 'playlist-1',
            name: 'Deep Cuts From Frequent Artists',
            entry: { id: 'song-1', title: 'Album Cut', artist: 'The Band', duration: 181 }
          }
        }
      }));
      return;
    }

    if (url.pathname === '/rest/getInternetRadioStations.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          internetRadioStations: {
            internetRadioStation: [
              { id: 'radio-1', name: 'SOMA FM Groove Salad', streamUrl: `${streamBase}${stationStreamPath}` },
              { id: 'radio-playlist', name: 'Playlist Station', streamUrl: `${streamBase}/radio-playlist.m3u` }
            ]
          }
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  streamBase = `http://127.0.0.1:${address.port}`;
  const { module, restore } = await isolatedServerModule('navidrome-discovery-routes', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret',
    NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS: 'true'
  });

  try {
    const playlist = await requestAuthenticatedServer('/api/navidrome/playlists/playlist-1', module.server);
    assert.equal(playlist.status, 200);
    const playlistBody = await playlist.json();
    assert.equal(playlistBody.playlist.name, 'Deep Cuts From Frequent Artists');
    assert.equal(playlistBody.playlist.entry[0].title, 'Album Cut');

    const missingPlaylist = await requestAuthenticatedServer('/api/navidrome/playlists/missing-playlist', module.server);
    assert.equal(missingPlaylist.status, 404);
    assert.deepEqual(await missingPlaylist.json(), {
      ok: false,
      error: 'Playlist not found'
    });

    const radios = await requestAuthenticatedServer('/api/navidrome/radios', module.server);
    assert.equal(radios.status, 200);
    const radioBody = await radios.json();
    assert.equal(radioBody.radios[0].name, 'SOMA FM Groove Salad');
    assert.equal(radioBody.radios[0].artworkPath,null,'Unplayed station with no declared artwork has no guessed cover');
    assert.equal(radioRangeHeaders.length,0,'Listing stations never starts streams');

    const radioStream = await requestAuthenticatedServer('/api/navidrome/radios/radio-1/stream', module.server, {
      headers: { Range: 'bytes=0-1' }
    });
    assert.equal(radioStream.status, 200);
    assert.equal(radioStream.headers.get('content-type'), 'audio/mpeg');
    assert.equal(radioStream.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await radioStream.text(), 'fake-radio-audio');
    assert.deepEqual(radioRangeHeaders, ['']);
    assert.deepEqual(radioUserAgents, ['NaviMuse/1.0 Radio Proxy']);
    const withArt = await (await requestAuthenticatedServer('/api/navidrome/radios', module.server)).json();
    assert.match(withArt.radios[0].artworkPath,/^\/api\/navidrome\/radios\/radio-1\/artwork\?v=[a-f0-9]{16}$/);
    const metadata = await (await requestAuthenticatedServer('/api/navidrome/radios/radio-1/metadata', module.server)).json();
    assert.equal(withArt.radios[0].artworkPath,metadata.artwork,'Home and playback share the versioned first-party image');
    assert.equal(radioRangeHeaders.length,1,'Artwork discovery reuses cached stream metadata');
    stationStreamPath='/radio.mp3';
    const changed = await (await requestAuthenticatedServer('/api/navidrome/radios', module.server)).json();
    assert.equal(changed.radios[0].artworkPath,null,'Changing the stream invalidates its old artwork');
    stationStreamPath='/radio-redirect';


    const playlistRadioStream = await requestAuthenticatedServer('/api/navidrome/radios/radio-playlist/stream', module.server);
    assert.equal(playlistRadioStream.status, 200);
    assert.equal(await playlistRadioStream.text(), 'fake-radio-audio');

    const missingRadioStream = await requestAuthenticatedServer('/api/navidrome/radios/missing-radio/stream', module.server);
    assert.equal(missingRadioStream.status, 404);

    assert.equal(module.safeInternetRadioStreamUrl(`${streamBase}/radio.mp3`), `${streamBase}/radio.mp3`);
    const now=Date.now();t.mock.method(Date,'now',()=>now+900001);
    const expired=await (await requestAuthenticatedServer('/api/navidrome/radios',module.server)).json();
    assert.equal(expired.radios[0].artworkPath,null,'Expired playback art is not advertised on Home');
    assert.equal(radioRangeHeaders.length,2,'Repeated list/metadata reads never open another stream');

  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome playlist writes validate input and preserve repeated Subsonic parameters', async () => {
  const writes = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/createPlaylist.view') {
      writes.push({
        action: 'create',
        name: url.searchParams.get('name'),
        songIds: url.searchParams.getAll('songId')
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: { id: 'playlist-new', name: url.searchParams.get('name'), entry: [] }
        }
      }));
      return;
    }
    if (url.pathname === '/rest/updatePlaylist.view') {
      writes.push({
        action: 'update',
        playlistId: url.searchParams.get('playlistId'),
        name: url.searchParams.get('name'),
        addSongIds: url.searchParams.getAll('songIdToAdd'),
        removeIndexes: url.searchParams.getAll('songIndexToRemove')
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    if (url.pathname === '/rest/getPlaylist.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          playlist: { id: url.searchParams.get('id'), name: 'Renamed', entry: { id: 'song-c' } }
        }
      }));
      return;
    }
    if (url.pathname === '/rest/deletePlaylist.view') {
      writes.push({ action: 'delete', id: url.searchParams.get('id') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('navidrome-playlist-writes', {
    NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const locked = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({ name: 'Road Trip' })
    });
    assert.equal(locked.status, 401);

    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const adapterFetch = (pathname, init = {}) => requestServer(pathname, module.server, {
      ...init,
      headers: { ...init.headers, cookie }
    });
    const created = await createPlaylist(adapterFetch, {
      name: '  Road Trip  ',
      songIds: ['song-a', 'song-b', 'song-a']
    });
    assert.deepEqual(created.entry, []);

    const updated = await requestServer('/api/navidrome/playlists/playlist-new', module.server, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie, 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({
        name: 'Renamed',
        addSongIds: ['song-c', 'song-d'],
        removeSongIndexes: [3, 1, 3]
      })
    });
    assert.equal(updated.status, 200);
    assert.deepEqual((await updated.json()).playlist.entry, [{ id: 'song-c' }]);

    const unchanged = await updatePlaylist(adapterFetch, 'playlist-new', {
      addSongIdsIfMissing: ['song-c']
    });
    assert.deepEqual(unchanged.entry, [{ id: 'song-c' }]);
    assert.equal(writes.filter((write) => write.action === 'update').length, 1, 'an existing song must not trigger an update');

    await updatePlaylist(adapterFetch, 'playlist-new', {
      addSongIds: ['song-y'],
      addSongIdsIfMissing: ['song-c', 'song-z']
    });
    assert.deepEqual(writes.at(-1), {
      action: 'update',
      playlistId: 'playlist-new',
      name: null,
      addSongIds: ['song-y', 'song-z'],
      removeIndexes: []
    });

    const deleted = await requestServer('/api/navidrome/playlists/playlist-new', module.server, {
      method: 'DELETE',
      headers: { cookie, 'x-requested-with': 'NaviMuse' }
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { ok: true, deleted: true, playlistId: 'playlist-new' });

    assert.deepEqual(writes, [
      { action: 'create', name: 'Road Trip', songIds: ['song-a', 'song-b'] },
      {
        action: 'update',
        playlistId: 'playlist-new',
        name: 'Renamed',
        addSongIds: ['song-c', 'song-d'],
        removeIndexes: ['3', '1']
      },
      {
        action: 'update',
        playlistId: 'playlist-new',
        name: null,
        addSongIds: ['song-y', 'song-z'],
        removeIndexes: []
      },
      { action: 'delete', id: 'playlist-new' }
    ]);

    const invalid = await requestServer('/api/navidrome/playlists/playlist-new', module.server, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie, 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({ removeSongIndexes: [-1] })
    });
    assert.equal(invalid.status, 400);
    assert.equal(writes.length, 4);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome playlist CSRF boundary rejects cross-origin simple requests', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/createPlaylist.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': { status: 'ok', playlist: { id: 'pl-new', name: url.searchParams.get('name'), entry: [] } }
      }));
      return;
    }
    if (url.pathname === '/rest/updatePlaylist.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    if (url.pathname === '/rest/getPlaylist.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': { status: 'ok', playlist: { id: url.searchParams.get('id'), name: 'Renamed', entry: [] } }
      }));
      return;
    }
    if (url.pathname === '/rest/deletePlaylist.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('navidrome-playlist-csrf', {
    NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    // Cross-origin simple POST (no custom header) → 403
    const csrfPost = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', cookie },
      body: 'name=Cross-Origin'
    });
    assert.equal(csrfPost.status, 403);

    // Cross-origin simple PATCH (no custom header) → 403
    const csrfPatch = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'PATCH',
      headers: { 'content-type': 'text/plain', cookie },
      body: 'name=Cross-Origin'
    });
    assert.equal(csrfPatch.status, 403);

    // Cross-origin simple DELETE (no custom header) → 403
    const csrfDelete = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'DELETE',
      headers: { cookie }
    });
    assert.equal(csrfDelete.status, 403);

    // Valid client POST with custom header → 201
    const validPost = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({ name: 'Valid' })
    });
    assert.equal(validPost.status, 201);

    // Valid client PATCH with custom header → 200
    const validPatch = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie, 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({ name: 'Valid Rename' })
    });
    assert.equal(validPatch.status, 200);

    // Valid client DELETE with custom header → 200
    const validDelete = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'DELETE',
      headers: { cookie, 'x-requested-with': 'NaviMuse' }
    });
    assert.equal(validDelete.status, 200);

    // Server-to-server header also accepted
    const serverPost = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-requested-with': 'NaviMuse-Server' },
      body: JSON.stringify({ name: 'Server Created' })
    });
    assert.equal(serverPost.status, 201);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome playback reporting distinguishes now-playing from scrobbles', async () => {
  const reports = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/getSong.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({'subsonic-response':{status:'ok',song:{id:url.searchParams.get('id'),title:'Test song'}}}));
      return;
    }
    if (url.pathname === '/rest/scrobble.view') {
      reports.push({ id: url.searchParams.get('id'), submission: url.searchParams.get('submission'), ...(url.searchParams.has('time')?{time:url.searchParams.get('time')}:{}) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('navidrome-scrobble-lifecycle', {
    NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  module.server.listen(0, '127.0.0.1');
  await once(module.server, 'listening');
  const requestServer=(path,_server,init)=>fetch(`http://127.0.0.1:${module.server.address().port}${path}`,init);
  try {
    const beforeSetup = await requestServer('/api/navidrome/scrobble/song-a', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({ submission: true })
    });
    assert.equal(beforeSetup.status, 401);

    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');
    const blocked = await requestServer('/api/navidrome/scrobble/song-a', module.server, {
      method: 'POST', headers: { 'content-type': 'text/plain', cookie }, body: '{}'
    });
    assert.equal(blocked.status, 403);

    const playbackFetch = (input, init) => requestServer(input, module.server, {
      ...init,
      headers: { ...init.headers, cookie }
    });
    const nowPlaying = await sendPlaybackReport(playbackFetch, 'song-a', false);
    assert.deepEqual(await nowPlaying.json(), { ok: true, id: 'song-a', submission: false });
    const submitted = await sendPlaybackReport(playbackFetch, 'song-a', true);
    assert.deepEqual(await submitted.json(), { ok: true, id: 'song-a', submission: true });
    assert.deepEqual(reports, [
      { id: 'song-a', submission: 'false' },
      { id: 'song-a', submission: 'true' }
    ]);

    const nativeScope=(await (await requestServer('/api/settings/session',module.server,{headers:{cookie}})).json()).queueScope;
    const nativeEvent={id:'11111111-1111-4111-8111-111111111111',scope:nativeScope,songId:'overnight',time:Date.now()-3600000};
    const nativeSubmit=(body,headers={})=>requestServer('/api/navidrome/listening',module.server,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse',cookie,...headers},body:JSON.stringify(body)});
    assert.equal((await nativeSubmit({...nativeEvent,scope:'other-account'})).status,409);
    assert.equal((await nativeSubmit(nativeEvent,{'x-requested-with':''})).status,403);
    assert.equal((await nativeSubmit(nativeEvent,{cookie:''})).status,401);
    assert.equal((await nativeSubmit(nativeEvent)).status,200);
    const receipt=await nativeSubmit(nativeEvent);assert.equal((await receipt.json()).duplicate,true);
    assert.equal(reports.filter(r=>r.id==='overnight').length,1);
    assert.equal(reports.find(r=>r.id==='overnight').time,String(nativeEvent.time));

    await assert.rejects(
      sendPlaybackReport(() => Promise.resolve(new Response('upstream unavailable', { status: 503 })), 'song-a', true),
      (error) => error.message === 'upstream unavailable'
        && error.status === 503
        && shouldRetryPlaybackReport(error) === true
    );
    await assert.rejects(
      sendPlaybackReport(() => Promise.resolve(new Response('session expired', { status: 401 })), 'song-a', false),
      (error) => error.message === 'session expired'
        && error.status === 401
        && shouldRetryPlaybackReport(error) === false
    );
  } finally {
    await closeServer(module.server);
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome playlist writes reject unauthenticated PATCH/DELETE with 401', async () => {
  const upstream = createHttpServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('navidrome-playlist-auth', {
    NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    // Without admin setup, all writes should be 401 (requireSettingsAuth fires first)
    const unauthPost = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert.equal(unauthPost.status, 401);

    const unauthPatch = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse' },
      body: JSON.stringify({ name: 'Test' })
    });
    assert.equal(unauthPatch.status, 401);

    const unauthDelete = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'DELETE',
      headers: { 'x-requested-with': 'NaviMuse' }
    });
    assert.equal(unauthDelete.status, 401);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome playlist validation rejects empty, oversized, and control-char names', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/createPlaylist.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': { status: 'ok', playlist: { id: 'pl-new', name: url.searchParams.get('name'), entry: [] } }
      }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('navidrome-playlist-validation', {
    NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');
    const headers = { 'content-type': 'application/json', cookie, 'x-requested-with': 'NaviMuse' };

    // Empty name
    const emptyName = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST', headers, body: JSON.stringify({ name: '   ' })
    });
    assert.equal(emptyName.status, 400);

    // Oversized name (>200 chars)
    const oversizedName = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST', headers, body: JSON.stringify({ name: 'x'.repeat(201) })
    });
    assert.equal(oversizedName.status, 400);

    // Control characters in name
    const controlName = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST', headers, body: JSON.stringify({ name: 'bad\u0001name' })
    });
    assert.equal(controlName.status, 400);

    // Control characters in playlist ID via path param
    const controlId = await requestServer('/api/navidrome/playlists/bad%00id', module.server, {
      method: 'PATCH', headers, body: JSON.stringify({ name: 'Renamed' })
    });
    assert.equal(controlId.status, 400);

    // Oversized songIds array (>500)
    const oversizedSongs = await requestServer('/api/navidrome/playlists', module.server, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Big', songIds: Array(501).fill('song-x') })
    });
    assert.equal(oversizedSongs.status, 400);

    // Empty update (no name, no addSongIds, no removeSongIndexes)
    const emptyUpdate = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'PATCH', headers, body: JSON.stringify({})
    });
    assert.equal(emptyUpdate.status, 400);

    // Unsupported PUT method → 405
    const putMethod = await requestServer('/api/navidrome/playlists/pl-1', module.server, {
      method: 'PUT', headers, body: JSON.stringify({ name: 'Put' })
    });
    assert.equal(putMethod.status, 405);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome playlist GET detail decodes encoded path parameters', async () => {
  let requestedId = null;
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/getPlaylist.view') {
      requestedId = url.searchParams.get('id');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': { status: 'ok', playlist: { id: requestedId, name: 'Decoded', entry: [] } }
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('navidrome-playlist-decode', {
    NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    // URL-encoded ID with special characters should be decoded before passing to Navidrome
    const response = await requestAuthenticatedServer('/api/navidrome/playlists/' + encodeURIComponent('pl/with%20spaces'), module.server);
    assert.equal(response.status, 200);
    assert.equal(requestedId, 'pl/with%20spaces');
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome configured URLs with query strings forward query parameters', async () => {
  // Verify that a configured Navidrome URL containing a query string is not
  // rejected — serviceUrl preserves the query, and serviceEndpoint appends
  // the pathname. This documents the invariant: query strings on the
  // configured URL are forwarded to upstream requests but do not bypass
  // host allowlist checks.
  let pingQuery = '';
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      pingQuery = url.search;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const port = upstream.address().port;
  const { module, restore } = await isolatedServerModule('navidrome-url-query', {
    NAVIDROME_URL: `http://127.0.0.1:${port}?foo=bar`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret',
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    // Test the Navidrome connection through the settings test endpoint
    const testResult = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ url: `http://127.0.0.1:${port}?foo=bar`, username: 'tester', password: 'secret' })
    });
    assert.equal(testResult.status, 200);
    const testBody = await testResult.json();
    assert.equal(testBody.ok, true);

    // Verify the query string from the configured URL was forwarded upstream
    assert.ok(pingQuery.includes('foo=bar'), 'configured URL query string should be forwarded to upstream');
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome internet radio stream endpoint blocks private station URLs by default', async () => {
  let streamHitCount = 0;
  let streamBase = '';
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/radio.mp3') {
      streamHitCount += 1;
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end('should-not-stream');
      return;
    }

    if (url.pathname === '/rest/getInternetRadioStations.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          internetRadioStations: {
            internetRadioStation: [
              { id: 'blocked-radio', name: 'Blocked Local Radio', streamUrl: `${streamBase}/radio.mp3` }
            ]
          }
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  streamBase = `http://127.0.0.1:${address.port}`;
  const { module, restore } = await isolatedServerModule('navidrome-blocked-radio-stream', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const radioStream = await requestAuthenticatedServer('/api/navidrome/radios/blocked-radio/stream', module.server);
    assert.equal(radioStream.status, 400);
    assert.deepEqual(await radioStream.json(), {
      ok: false,
      error: 'Internet radio stream URL is blocked'
    });
    assert.equal(streamHitCount, 0);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP /api/navidrome/songs/:id returns shared track payloads and errors', async () => {
  const feedbackRequests = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (['/rest/star.view', '/rest/unstar.view', '/rest/setRating.view'].includes(url.pathname)) {
      feedbackRequests.push({
        pathname: url.pathname,
        id: url.searchParams.get('id'),
        rating: url.searchParams.get('rating')
      });
      if (url.pathname === '/rest/star.view' && url.searchParams.get('id') === 'star-fail-song') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: { code: 70, message: 'Star failed' }
          }
        }));
        return;
      }
      if (url.pathname === '/rest/setRating.view' && url.searchParams.get('id') === 'partial-song' && url.searchParams.get('rating') === '5') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: { code: 70, message: 'Rating failed' }
          }
        }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': { status: 'ok' }
      }));
      return;
    }

    if (url.pathname === '/rest/getSong.view') {
      if (url.searchParams.get('id') === 'missing-song') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'ok'
          }
        }));
        return;
      }

      if (url.searchParams.get('id') === 'error-song') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: { code: 70, message: 'Not found' }
          }
        }));
        return;
      }

      if (url.searchParams.get('id') === 'feedback-get-error') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'failed',
            error: { code: 70, message: 'Not found before feedback' }
          }
        }));
        return;
      }

      if (url.searchParams.get('id') === 'encoded song') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            song: { id: 'encoded song', title: 'Encoded Track', artist: 'NaviMuse', duration: 60 }
          }
        }));
        return;
      }

      if (url.searchParams.get('id') === 'partial-song') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            song: { id: 'partial-song', title: 'Partial Track', artist: 'NaviMuse', duration: 60, starred: false, userRating: 2 }
          }
        }));
        return;
      }

      if (url.searchParams.get('id') === 'star-fail-song') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            song: { id: 'star-fail-song', title: 'Star Fail Track', artist: 'NaviMuse', duration: 60, starred: false, userRating: 2 }
          }
        }));
        return;
      }

      if (url.searchParams.get('id') === 'favorite-only-song') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            song: { id: 'favorite-only-song', title: 'Favorite Only Track', artist: 'NaviMuse', duration: 60, starred: false, userRating: 3 }
          }
        }));
        return;
      }

      assert.equal(url.searchParams.get('id'), 'shared-song');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          song: { id: 'shared-song', title: 'Shared Track', artist: 'NaviMuse', duration: 240 }
        }
      }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-shared-song-route', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const response = await requestAuthenticatedServer('/api/navidrome/songs/shared-song', module.server);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.song.title, 'Shared Track');

    const missing = await requestAuthenticatedServer('/api/navidrome/songs/missing-song', module.server);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      ok: false,
      error: 'Song not found'
    });

    const post = await requestAuthenticatedServer('/api/navidrome/songs/shared-song', module.server, { method: 'POST' });
    assert.equal(post.status, 405);

    const unauthorizedFeedback = await requestServer('/api/navidrome/feedback/shared-song', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ favorite: true, rating: 4 })
    });
    assert.equal(unauthorizedFeedback.status, 401);

    const cookie=fixtureSessionCookies.get(module.server);

    const feedback = await requestAuthenticatedServer('/api/navidrome/feedback/shared-song', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: true, rating: 4 })
    });
    assert.equal(feedback.status, 200);
    assert.deepEqual(await feedback.json(), {
      ok: true,
      feedback: { favorite: true, rating: 4 }
    });
    assert.deepEqual(feedbackRequests, [
      { pathname: '/rest/star.view', id: 'shared-song', rating: null },
      { pathname: '/rest/setRating.view', id: 'shared-song', rating: '4' }
    ]);

    feedbackRequests.length = 0;
    const clearFeedback = await requestAuthenticatedServer('/api/navidrome/feedback/shared-song', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: false, rating: 0 })
    });
    assert.equal(clearFeedback.status, 200);
    assert.deepEqual(feedbackRequests, []);

    const radioFeedback = await requestAuthenticatedServer('/api/navidrome/feedback/radio%3Astation-1', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: true, rating: 5 })
    });
    assert.equal(radioFeedback.status, 400);

    const mockFeedback = await requestAuthenticatedServer('/api/navidrome/feedback/mock-track', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: true, rating: 5 })
    });
    assert.equal(mockFeedback.status, 400);

    feedbackRequests.length = 0;
    const partialFeedback = await requestAuthenticatedServer('/api/navidrome/feedback/partial-song', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: true, rating: 5 })
    });
    assert.equal(partialFeedback.status, 502);
    assert.deepEqual(feedbackRequests, [
      { pathname: '/rest/star.view', id: 'partial-song', rating: null },
      { pathname: '/rest/setRating.view', id: 'partial-song', rating: '5' },
      { pathname: '/rest/unstar.view', id: 'partial-song', rating: null },
      { pathname: '/rest/setRating.view', id: 'partial-song', rating: '2' }
    ]);

    feedbackRequests.length = 0;
    const starFailure = await requestAuthenticatedServer('/api/navidrome/feedback/star-fail-song', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: true, rating: 5 })
    });
    assert.equal(starFailure.status, 502);
    assert.deepEqual(feedbackRequests, [
      { pathname: '/rest/star.view', id: 'star-fail-song', rating: null }
    ]);

    feedbackRequests.length = 0;
    const favoriteOnly = await requestAuthenticatedServer('/api/navidrome/feedback/favorite-only-song', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: true, rating: 3 })
    });
    assert.equal(favoriteOnly.status, 200);
    assert.deepEqual(feedbackRequests, [
      { pathname: '/rest/star.view', id: 'favorite-only-song', rating: null }
    ]);

    feedbackRequests.length = 0;
    const getFailure = await requestAuthenticatedServer('/api/navidrome/feedback/feedback-get-error', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ favorite: true, rating: 5 })
    });
    assert.equal(getFailure.status, 502);
    assert.deepEqual(feedbackRequests, []);

    const upstreamError = await requestAuthenticatedServer('/api/navidrome/songs/error-song', module.server, { headers: { cookie } });
    assert.equal(upstreamError.status, 404, 'Subsonic code 70 is a confirmed missing track');

    const encoded = await requestAuthenticatedServer('/api/navidrome/songs/encoded%20song', module.server, { headers: { cookie } });
    assert.equal(encoded.status, 200);
    assert.equal((await encoded.json()).song.title, 'Encoded Track');

    const malformed = await requestAuthenticatedServer('/api/navidrome/songs/%E0%A4', module.server, { headers: { cookie } });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      ok: false,
      error: 'Invalid encoded path parameter'
    });
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP settings writes require NaviMuse admin setup', async () => {
  const { module, restore } = await isolatedServerModule('settings-auth-required');

  try {
    const response = await requestServer('/api/settings', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferences: { playback: { gapless: false } } })
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'NaviMuse admin setup is required'
    });
  } finally {
    restore();
  }
});

test('HTTP settings admin session saves preferences and redacts Navidrome password', async () => {
  const upstream = await openPingServer();
  const { dataDir, module, restore } = await isolatedServerModule('settings-redaction', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: upstream.host
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');
    assert.match(cookie, /navimuse_session=/);

    const preferences = await requestServer('/api/settings', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ preferences: { library: { defaultView: 'list' } } })
    });
    assert.equal(preferences.status, 200);
    assert.equal((await preferences.json()).preferences.library.defaultView, 'list');

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        url: upstream.origin,
        username: 'music-user',
        password: 'super-secret-password'
      })
    });
    assert.equal(saved.status, 200);
    const rawBody = await saved.text();
    assert.doesNotMatch(rawBody, /super-secret-password/);
    const body = JSON.parse(rawBody);
    assert.equal(body.services.navidrome.configured, true);
    assert.equal(body.services.navidrome.username, 'music-user');
    assert.equal(body.services.navidrome.passwordSet, true);
    const settingsFile = readFileSync(join(dataDir, 'settings.json'), 'utf8');
    assert.doesNotMatch(settingsFile, /super-secret-password/);
    assert.match(settingsFile, /enc:v1:/);

    const resaved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        url: upstream.origin,
        username: 'music-user',
        password: ''
      })
    });
    assert.equal(resaved.status, 200);
    const resavedBody = await resaved.json();
    assert.equal(resavedBody.services.navidrome.configured, true);
    assert.equal(resavedBody.services.navidrome.passwordSet, true);

    const publicSettings = await requestServer('/api/settings', module.server);
    assert.equal(publicSettings.status, 200);
    const publicBody = await publicSettings.json();
    assert.equal(publicBody.services.navidrome.configured, true);
    assert.equal(publicBody.services.navidrome.username, '');
    assert.equal(publicBody.services.navidrome.usernameSet, false);
    assert.equal(publicBody.services.navidrome.passwordSet, false);
    assert.equal(publicBody.services.navidrome.source, '');

    const privateSettings = await requestServer('/api/settings', module.server, {
      headers: { cookie }
    });
    assert.equal(privateSettings.status, 200);
    assert.equal((await privateSettings.json()).services.navidrome.username, 'music-user');

    const invalidTest = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        url: 'file:///etc/passwd',
        username: 'music-user',
        password: ''
      })
    });
    assert.equal(invalidTest.status, 400);
    assert.deepEqual(await invalidTest.json(), {
      ok: false,
      error: 'Navidrome URL must use http or https'
    });

    const cleared = await requestServer('/api/settings/navidrome', module.server, {
      method: 'DELETE',
      headers: { cookie }
    });
    assert.equal(cleared.status, 200);
    const clearedBody = await cleared.json();
    assert.equal(clearedBody.services.navidrome.source, 'environment');
    assert.equal(clearedBody.services.navidrome.configured, false);
  } finally {
    restore();
    await upstream.close();
  }
});

test('HTTP settings session cookie ignores spoofed forwarded proto without trusted proxy', async () => {
  const { module, restore } = await isolatedServerModule('settings-forwarded-proto');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https'
      },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    assert.doesNotMatch(setup.headers.get('set-cookie'), /;\s*Secure/i);
  } finally {
    restore();
  }
});

test('HTTP settings session cookie uses Secure with trusted forwarded proto', async () => {
  const { module, restore } = await isolatedServerModule('settings-forwarded-proto-trusted', {
    TRUST_PROXY: 'true'
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https'
      },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    assert.match(setup.headers.get('set-cookie'), /;\s*Secure/i);
  } finally {
    restore();
  }
});

test('HTTP settings preserves invalid JSON error message', async () => {
  const { module, restore } = await isolatedServerModule('settings-invalid-json');

  try {
    const response = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad json'
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'Invalid JSON request body'
    });
  } finally {
    restore();
  }
});

test('HTTP settings rejects non-JSON request bodies', async () => {
  const { module, restore } = await isolatedServerModule('settings-non-json-content-type');

  try {
    const response = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'Content-Type must be application/json'
    });
  } finally {
    restore();
  }
});

test('HTTP settings treats null JSON bodies as empty objects', async () => {
  const { module, restore } = await isolatedServerModule('settings-null-json');

  try {
    const nullSetup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null'
    });
    assert.equal(nullSetup.status, 401);

    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const nullLogin = await requestServer('/api/settings/login', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null'
    });
    assert.equal(nullLogin.status, 401);

    const nullSettings = await requestServer('/api/settings', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: 'null'
    });
    assert.equal(nullSettings.status, 200);
  } finally {
    restore();
  }
});

test('HTTP settings preferences are sanitized and clamped', async () => {
  const { module, restore } = await isolatedServerModule('settings-sanitize');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');

    const response = await requestServer('/api/settings', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        preferences: {
          streaming: { cellularFormat: 'wav', wifiFormat: 'flac' },
          playback: {
            replayGain: 'loud',
            continuousQueue: false,
            extendJourneysAutomatically: false,
            autoplayAfterQueue: true
          },
          discovery: { homeSonicMixes: false, smartPlaylistScope: 'archive' },
          library: { defaultView: 'cassette', artworkSize: '9000', offlineLimitGb: 999 }
        }
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.preferences.streaming.cellularFormat, 'opus');
    assert.equal(body.preferences.streaming.wifiFormat, 'raw');
    assert.equal(body.preferences.playback.replayGain, 'album');
    assert.equal(body.preferences.playback.continueThroughQueue, false);
    assert.equal(body.preferences.playback.extendJourneysAutomatically, false);
    assert.equal(body.preferences.playback.autoplayAfterQueue, true);
    assert.equal(body.preferences.playback.continuousQueue, undefined);
    assert.equal(body.preferences.discovery.homeArtistRadios, false);
    assert.equal(body.preferences.discovery.homeSonicMixes, false);
    assert.equal(body.preferences.discovery.smartPlaylistScope, 'music');
    assert.equal(body.preferences.library.defaultView, 'grid');
    assert.equal(body.preferences.library.artworkSize, '600');
    assert.equal(body.preferences.library.offlineLimitGb, undefined);
  } finally {
    restore();
  }
});

test('HTTP settings concurrent writes preserve previous settings updates', async () => {
  const upstream = await openPingServer();
  const { module, restore } = await isolatedServerModule('settings-concurrent-writes', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: upstream.host
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');
    const app = await openAppServer(module.server);

    try {
      const [preferences, navidrome] = await Promise.all([
        fetch(`${app.origin}/api/settings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie
          },
          body: JSON.stringify({ preferences: { library: { defaultView: 'list' } } })
        }),
        fetch(`${app.origin}/api/settings/navidrome`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie
          },
          body: JSON.stringify({ url: upstream.origin, username: 'music-user', password: 'secret' })
        })
      ]);

      assert.equal(preferences.status, 200);
      assert.equal(navidrome.status, 200);

      const settings = await fetch(`${app.origin}/api/settings`, { headers: { cookie } });
      assert.equal(settings.status, 200);
      const body = await settings.json();
      assert.equal(body.preferences.library.defaultView, 'list');
      assert.equal(body.services.navidrome.username, 'music-user');
      assert.equal(body.services.navidrome.passwordSet, true);
    } finally {
      await app.close();
    }
  } finally {
    restore();
    await upstream.close();
  }
});

test('HTTP config and health tolerate stale disallowed saved Navidrome URL', async () => {
  const { module, dataDir, restore } = await isolatedServerModule('settings-stale-navidrome-url');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const settingsPath = join(dataDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.services = {
      ...(settings.services || {}),
      navidrome: {
        ...(settings.services?.navidrome || {}),
        url: 'http://old-navidrome:4533'
      }
    };
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    const staleModule = await import(`../server.mjs?settings-stale-navidrome-url-reload=${Date.now()}`);

    const config = await requestServer('/api/config', staleModule.server);
    assert.equal(config.status, 200);
    assert.equal((await config.json()).services.navidrome, 'http://navidrome:4533/');

    const health = await requestServer('/api/health', staleModule.server);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.services.navidrome.name, 'navidrome');

    const publicSettings = await requestServer('/api/settings', staleModule.server);
    assert.equal(publicSettings.status, 200);
    const publicBody = await publicSettings.json();
    assert.equal(publicBody.services.navidrome.url, 'http://navidrome:4533/');
    assert.equal(publicBody.services.navidrome.urlAllowed, true);

    const privateSettings = await requestServer('/api/settings', staleModule.server, {
      headers: { cookie }
    });
    assert.equal(privateSettings.status, 200);
    const privateBody = await privateSettings.json();
    assert.equal(privateBody.services.navidrome.url, 'http://old-navidrome:4533');
    assert.equal(privateBody.services.navidrome.urlAllowed, false);
    assert.equal(privateBody.services.navidrome.activeUrl, 'http://navidrome:4533/');
  } finally {
    restore();
  }
});

test('HTTP settings tolerate malformed stored Navidrome URL', async () => {
  const { module, dataDir, restore } = await isolatedServerModule('settings-malformed-navidrome-url');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const settingsPath = join(dataDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.services = {
      ...(settings.services || {}),
      navidrome: {
        ...(settings.services?.navidrome || {}),
        url: 'ftp://old-navidrome:4533'
      }
    };
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    const malformedModule = await import(`../server.mjs?settings-malformed-navidrome-url-reload=${Date.now()}`);

    const config = await requestServer('/api/config', malformedModule.server);
    assert.equal(config.status, 200);
    assert.equal((await config.json()).services.navidrome, 'http://navidrome:4533/');

    const privateSettings = await requestServer('/api/settings', malformedModule.server, {
      headers: { cookie }
    });
    assert.equal(privateSettings.status, 200);
    const privateBody = await privateSettings.json();
    assert.equal(privateBody.services.navidrome.url, 'ftp://old-navidrome:4533');
    assert.equal(privateBody.services.navidrome.urlAllowed, false);
    assert.equal(privateBody.services.navidrome.activeUrl, 'http://navidrome:4533/');
  } finally {
    restore();
  }
});

test('HTTP Navidrome proxy falls back when stored URL becomes disallowed', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    const body = { 'subsonic-response': { status: 'ok' } };
    if (url.pathname === '/rest/getMusicFolders.view') {
      body['subsonic-response'].musicFolders = { musicFolder: [{ id: '1', name: 'Music' }] };
    } else if (url.pathname === '/rest/getAlbumList2.view') {
      body['subsonic-response'].albumList2 = { album: [] };
    } else {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();

  const { dataDir, restore } = await isolatedServerModule('settings-stale-navidrome-proxy', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'music-user',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const settingsPath = join(dataDir, 'settings.json');
    writeFileSync(settingsPath, `${JSON.stringify({
      services: {
        navidrome: {
          url: 'http://old-navidrome:4533'
        }
      }
    }, null, 2)}\n`);
    const staleModule = await import(`../server.mjs?settings-stale-navidrome-proxy-reload=${Date.now()}`);

    const response = await requestAuthenticatedServer('/api/navidrome/bootstrap', staleModule.server);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.musicFolders, [{ id: '1', name: 'Music' }]);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP admin setup requires bootstrap token', async () => {
  const { module, restore } = await isolatedServerModule('settings-setup-token');

  try {
    const response = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery' })
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'NaviMuse setup token is required'
    });
  } finally {
    restore();
  }
});

test('HTTP admin setup fails fast when env setup token is too short', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'navimuse-short-setup-token-'));
  const previousEnv = {
    NAVIMUSE_DATA_DIR: process.env.NAVIMUSE_DATA_DIR,
    NAVIMUSE_SETUP_TOKEN: process.env.NAVIMUSE_SETUP_TOKEN
  };

  try {
    process.env.NAVIMUSE_DATA_DIR = dataDir;
    process.env.NAVIMUSE_SETUP_TOKEN = 'short';
    await assert.rejects(
      import(`../server.mjs?short-setup-token=${Date.now()}`),
      /NAVIMUSE_SETUP_TOKEN must be at least 16 characters/
    );
  } finally {
    restoreEnv(previousEnv);
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('HTTP admin setup rejects duplicate setup after admin is configured', async () => {
  const { module, restore } = await isolatedServerModule('settings-setup-duplicate');

  try {
    const first = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(first.status, 200);

    const second = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'another correct horse', setupToken: 'test-setup-token' })
    });
    assert.equal(second.status, 409);
    assert.deepEqual(await second.json(), {
      ok: false,
      error: 'NaviMuse admin is already configured'
    });
  } finally {
    restore();
  }
});

test('HTTP admin setup throttles repeated bad setup tokens', async () => {
  const { module, restore } = await isolatedServerModule('settings-setup-throttle');

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await requestServer('/api/settings/admin', module.server, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'correct horse battery', setupToken: 'wrong-token' })
      });
      assert.equal(response.status, 401);
    }

    const throttled = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'wrong-token' })
    });
    assert.equal(throttled.status, 429);
  } finally {
    restore();
  }
});

test('HTTP admin login throttles repeated failures', async () => {
  const { module, restore } = await isolatedServerModule('settings-login-throttle');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await requestServer('/api/settings/login', module.server, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'wrong password' })
      });
      assert.equal(response.status, 401);
    }

    const throttled = await requestServer('/api/settings/login', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong password' })
    });
    assert.equal(throttled.status, 429);
  } finally {
    restore();
  }
});

test('HTTP admin login throttles repeated malformed JSON bodies', async () => {
  const { module, restore } = await isolatedServerModule('settings-login-malformed-json-throttle');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await requestServer('/api/settings/login', module.server, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad json'
      });
      assert.equal(response.status, 400);
    }

    const throttled = await requestServer('/api/settings/login', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery' })
    });
    assert.equal(throttled.status, 429);
  } finally {
    restore();
  }
});

test('HTTP settings logout revokes the current session token', async () => {
  const { module, restore } = await isolatedServerModule('settings-logout');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const beforeLogout = await requestServer('/api/settings', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ preferences: { playback: { gapless: false } } })
    });
    assert.equal(beforeLogout.status, 200);

    const logout = await requestServer('/api/settings/logout', module.server, {
      method: 'POST',
      headers: { cookie }
    });
    assert.equal(logout.status, 200);

    const afterLogout = await requestServer('/api/settings', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ preferences: { playback: { gapless: true } } })
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    restore();
  }
});

test('HTTP settings logout requires an authenticated session', async () => {
  const { module, restore } = await isolatedServerModule('settings-logout-auth');

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const unauthorizedLogout = await requestServer('/api/settings/logout', module.server, {
      method: 'POST'
    });
    assert.equal(unauthorizedLogout.status, 401);

    const stillAuthenticated = await requestServer('/api/settings', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ preferences: { playback: { gapless: true } } })
    });
    assert.equal(stillAuthenticated.status, 200);
  } finally {
    restore();
  }
});

test('HTTP Navidrome settings test requires auth and validates invalid URLs', async () => {
  const { module, restore } = await isolatedServerModule('settings-navidrome-test');

  try {
    const unauthorized = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://navidrome:4533' })
    });
    assert.equal(unauthorized.status, 401);

    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');

    const invalidUrl = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: 'ftp://navidrome.local', username: 'user', password: 'secret' })
    });
    assert.equal(invalidUrl.status, 400);
    assert.deepEqual(await invalidUrl.json(), {
      ok: false,
      error: 'Navidrome URL must use http or https'
    });

    const disallowedUrl = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: 'http://169.254.169.254', username: 'user', password: 'secret' })
    });
    assert.equal(disallowedUrl.status, 400);
    assert.deepEqual(await disallowedUrl.json(), {
      ok: false,
      error: 'Navidrome URL host is not allowed'
    });

    const disallowedSave = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: 'http://169.254.169.254', username: 'user', password: 'secret' })
    });
    assert.equal(disallowedSave.status, 400);
    assert.deepEqual(await disallowedSave.json(), {
      ok: false,
      error: 'Navidrome URL host is not allowed'
    });

    const wrongPortSave = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: 'http://navidrome:80', username: 'user', password: 'secret' })
    });
    assert.equal(wrongPortSave.status, 400);
    assert.deepEqual(await wrongPortSave.json(), {
      ok: false,
      error: 'Navidrome URL host is not allowed'
    });
  } finally {
    restore();
  }
});

test('HTTP Navidrome settings normalizes IPv6 allow-list entries', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '::1');
  await once(upstream, 'listening');
  const address = upstream.address();

  const { module, restore } = await isolatedServerModule('settings-navidrome-ipv6-allow-list', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `::1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: `http://[::1]:${address.port}`, username: 'user', password: 'secret' })
    });
    assert.equal(saved.status, 200);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome settings test succeeds against a Subsonic ping endpoint', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();

  const { module, restore } = await isolatedServerModule('settings-navidrome-test-success', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');

    const response = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        url: `http://127.0.0.1:${address.port}`,
        username: 'music-user',
        password: 'secret'
      })
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome settings test does not follow redirects', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();

  const { module, restore } = await isolatedServerModule('settings-navidrome-test-redirect', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');

    const response = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        url: `http://127.0.0.1:${address.port}`,
        username: 'music-user',
        password: 'secret'
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'Navidrome login test failed'
    });
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome settings can opt out of the URL allow-list', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();

  const { module, restore } = await isolatedServerModule('settings-navidrome-allow-any-url', {
    NAVIMUSE_ALLOW_ANY_NAVIDROME_URL: 'true'
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: `http://127.0.0.1:${address.port}`, username: 'user', password: 'secret' })
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).services.navidrome.urlAllowed, true);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP settings exposes raw Navidrome URL so public URL is not saved back internally', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const previousPublicUrl = process.env.PUBLIC_NAVIDROME_URL;
  process.env.PUBLIC_NAVIDROME_URL = 'https://music.example.test';
  const rawUrl = `http://127.0.0.1:${address.port}`;
  const { module, dataDir, restore } = await isolatedServerModule('settings-raw-navidrome-url', {
    NAVIDROME_URL: rawUrl,
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const settings = await requestServer('/api/settings', module.server, {
      headers: { cookie }
    });
    assert.equal(settings.status, 200);
    const settingsBody = await settings.json();
    assert.equal(settingsBody.services.navidrome.url, `${rawUrl}/`);

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({
        url: settingsBody.services.navidrome.url,
        username: 'music-user',
        password: 'secret'
      })
    });
    assert.equal(saved.status, 200);

    const stored = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'));
    assert.equal(stored.services.navidrome.url, `${rawUrl}/`);
  } finally {
    restore();
    await closeServer(upstream);
    if (previousPublicUrl === undefined) {
      delete process.env.PUBLIC_NAVIDROME_URL;
    } else {
      process.env.PUBLIC_NAVIDROME_URL = previousPublicUrl;
    }
  }
});

test('HTTP Navidrome settings test reuses stored password when form password is blank', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();

  const { module, restore } = await isolatedServerModule('settings-navidrome-test-stored-password', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');
    const url = `http://127.0.0.1:${address.port}`;

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url, username: 'music-user', password: 'secret' })
    });
    assert.equal(saved.status, 200);

    const response = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url, username: 'music-user', password: '' })
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome settings save rejects failed login and preserves stored credentials', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      const username = url.searchParams.get('u');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        'subsonic-response': username === 'music-user'
          ? { status: 'ok' }
          : { status: 'failed', error: { code: 40, message: 'Wrong username or password' } }
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();

  const { module, restore } = await isolatedServerModule('settings-navidrome-save-preserves-good-credentials', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');
    const url = `http://127.0.0.1:${address.port}`;

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url, username: 'music-user', password: 'secret' })
    });
    assert.equal(saved.status, 200);

    const rejected = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url, username: 'bad-user', password: 'bad-secret' })
    });
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), {
      ok: false,
      error: 'Navidrome login test failed'
    });

    const settings = await requestServer('/api/settings', module.server, {
      headers: { cookie }
    });
    assert.equal(settings.status, 200);
    const settingsBody = await settings.json();
    assert.equal(settingsBody.services.navidrome.username, 'music-user');

    const stillWorks = await requestServer('/api/settings/navidrome/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url, username: 'music-user', password: '' })
    });
    assert.equal(stillWorks.status, 200);
    assert.equal((await stillWorks.json()).ok, true);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP Navidrome encrypted credentials survive module reload with persisted settings key', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');

  const dataDir = mkdtempSync(join(tmpdir(), 'navimuse-settings-key-persistence-'));
  const previousEnv = {
    NAVIMUSE_DATA_DIR: process.env.NAVIMUSE_DATA_DIR,
    NAVIMUSE_SETUP_TOKEN: process.env.NAVIMUSE_SETUP_TOKEN,
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: process.env.NAVIMUSE_ALLOWED_NAVIDROME_HOSTS,
    NAVIMUSE_ALLOW_ANY_NAVIDROME_URL: process.env.NAVIMUSE_ALLOW_ANY_NAVIDROME_URL,
    NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS: process.env.NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS,
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: process.env.NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS,
    NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL: process.env.NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL,
    AUDIOMUSE_URL: process.env.AUDIOMUSE_URL,
    AUDIOMUSE_API_TOKEN: process.env.AUDIOMUSE_API_TOKEN,
    NAVIDROME_URL: process.env.NAVIDROME_URL,
    NAVIDROME_USERNAME: process.env.NAVIDROME_USERNAME,
    NAVIDROME_PASSWORD: process.env.NAVIDROME_PASSWORD
  };

  try {
    const address = upstream.address();
    process.env.NAVIMUSE_DATA_DIR = dataDir;
    process.env.NAVIMUSE_SETUP_TOKEN = 'test-setup-token';
    process.env.NAVIMUSE_ALLOWED_NAVIDROME_HOSTS = `127.0.0.1:${address.port}`;
    delete process.env.NAVIMUSE_ALLOW_ANY_NAVIDROME_URL;
    delete process.env.NAVIDROME_URL;
    delete process.env.NAVIDROME_USERNAME;
    delete process.env.NAVIDROME_PASSWORD;

    const firstModule = await import(`../server.mjs?settings-key-first=${Date.now()}`);
    const setup = await requestServer('/api/settings/admin', firstModule.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');
    const url = `http://127.0.0.1:${address.port}`;

    const saved = await requestServer('/api/settings/navidrome', firstModule.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url, username: 'music-user', password: 'secret' })
    });
    assert.equal(saved.status, 200);

    const firstKey = readFileSync(join(dataDir, 'settings.key')).toString('hex');
    const secondModule = await import(`../server.mjs?settings-key-second=${Date.now()}`);
    const secondKey = readFileSync(join(dataDir, 'settings.key')).toString('hex');
    assert.equal(secondKey, firstKey);

    const response = await requestServer('/api/settings/navidrome/test', secondModule.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url, username: 'music-user', password: '' })
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    restoreEnv(previousEnv);
    rmSync(dataDir, { recursive: true, force: true });
    await closeServer(upstream);
  }
});

test('HTTP settings key permissions are repaired on module load', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'navimuse-settings-key-permissions-'));
  const previousEnv = {
    NAVIMUSE_DATA_DIR: process.env.NAVIMUSE_DATA_DIR,
    NAVIMUSE_SETUP_TOKEN: process.env.NAVIMUSE_SETUP_TOKEN
  };

  try {
    process.env.NAVIMUSE_DATA_DIR = dataDir;
    process.env.NAVIMUSE_SETUP_TOKEN = 'test-setup-token';
    const keyPath = join(dataDir, 'settings.key');
    writeFileSync(keyPath, Buffer.alloc(32, 7), { mode: 0o644 });
    chmodSync(keyPath, 0o644);

    const module = await import(`../server.mjs?settings-key-permissions=${Date.now()}`);
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);
  } finally {
    restoreEnv(previousEnv);
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('HTTP admin session secret is added to legacy settings on module load', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'navimuse-admin-session-secret-'));
  const previousEnv = {
    NAVIMUSE_DATA_DIR: process.env.NAVIMUSE_DATA_DIR,
    NAVIMUSE_SETUP_TOKEN: process.env.NAVIMUSE_SETUP_TOKEN
  };

  try {
    process.env.NAVIMUSE_DATA_DIR = dataDir;
    process.env.NAVIMUSE_SETUP_TOKEN = 'test-setup-token';
    const settingsPath = join(dataDir, 'settings.json');
    writeFileSync(settingsPath, `${JSON.stringify({
      admin: {
        passwordHash: 'pbkdf2_sha256$310000$0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      }
    }, null, 2)}\n`);

    await import(`../server.mjs?admin-session-secret-migration=${Date.now()}`);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    assert.match(settings.admin.sessionSecret, /^[A-Za-z0-9_-]{40,}$/);
  } finally {
    restoreEnv(previousEnv);
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('HTTP settings decryption warning clears after a successful decrypt', async () => {
  const upstream = await openPingServer();
  const { module, dataDir, restore } = await isolatedServerModule('settings-decryption-recovery', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: upstream.host
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: upstream.origin, username: 'user', password: 'secret' })
    });
    assert.equal(saved.status, 200);

    const settingsPath = join(dataDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.services.navidrome.password = 'enc:v1:bad:bad:bad';
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

    const corruptedModule = await import(`../server.mjs?settings-decryption-corrupt=${Date.now()}`);
    const failedBootstrap = await requestServer('/api/navidrome/bootstrap', corruptedModule.server, { headers: { cookie } });
    assert.equal(failedBootstrap.status, 503);
    assert.deepEqual(await failedBootstrap.json(), {
      ok: false,
      error: 'Stored Navidrome credentials could not be decrypted. Re-save them in Settings.'
    });

    const warning = await requestServer('/api/settings', corruptedModule.server, {
      headers: { cookie }
    });
    assert.equal(warning.status, 200);
    assert.equal((await warning.json()).security.decryptionFailed, true);

    const recovered = await requestServer('/api/settings/navidrome', corruptedModule.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: upstream.origin, username: 'user', password: 'new-secret' })
    });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).security.decryptionFailed, false);
  } finally {
    restore();
    await upstream.close();
  }
});

test('HTTP Navidrome settings delete clears app-stored credentials', async () => {
  const upstream = await openPingServer();
  const { module, restore } = await isolatedServerModule('settings-navidrome-delete', {
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: upstream.host
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');

    const saved = await requestServer('/api/settings/navidrome', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: upstream.origin, username: 'user', password: 'secret' })
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).services.navidrome.configured, true);

    const cleared = await requestServer('/api/settings/navidrome', module.server, {
      method: 'DELETE',
      headers: { cookie }
    });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).services.navidrome.configured, false);
  } finally {
    restore();
    await upstream.close();
  }
});

test('HTTP AudioMuse settings save tests health and redacts API token', async () => {
  const seenAuth = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/api/health') {
      seenAuth.push(req.headers.authorization || '');
      res.writeHead(req.headers.authorization === 'Bearer audio-secret' ? 200 : 401, {
        'content-type': 'application/json'
      });
      res.end(JSON.stringify({ ok: req.headers.authorization === 'Bearer audio-secret' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const { dataDir, module, restore } = await isolatedServerModule('settings-audiomuse-save', {
    AUDIOMUSE_URL: origin,
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const unauthorized = await requestServer('/api/settings/audiomuse/test', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: origin })
    });
    assert.equal(unauthorized.status, 401);

    const missingTokenSave = await requestServer('/api/settings/audiomuse', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: origin })
    });
    assert.equal(missingTokenSave.status, 400);
    assert.deepEqual(await missingTokenSave.json(), {
      ok: false,
      error: 'AudioMuse authentication failed'
    });

    const failed = await requestServer('/api/settings/audiomuse/test', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: origin, token: 'wrong-token' })
    });
    assert.equal(failed.status, 200);
    assert.deepEqual(await failed.json(), {
      ok: false,
      error: 'AudioMuse authentication failed'
    });

    const saved = await requestServer('/api/settings/audiomuse', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: origin, token: 'audio-secret' })
    });
    assert.equal(saved.status, 200);
    const rawBody = await saved.text();
    assert.doesNotMatch(rawBody, /audio-secret/);
    const body = JSON.parse(rawBody);
    assert.equal(body.services.audiomuse.url, `${origin}/`);
    assert.equal(body.services.audiomuse.tokenSet, true);

    const settingsFile = readFileSync(join(dataDir, 'settings.json'), 'utf8');
    assert.doesNotMatch(settingsFile, /audio-secret/);
    assert.match(settingsFile, /enc:v1:/);

    const health = await requestServer('/api/health', module.server);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).services.audiomuse.ok, true);
    assert.ok(seenAuth.includes('Bearer audio-secret'));

    const publicSettings = await requestServer('/api/settings', module.server);
    assert.equal(publicSettings.status, 200);
    const publicBody = await publicSettings.json();
    assert.equal(publicBody.services.audiomuse.tokenSet, false);
    assert.equal(publicBody.services.audiomuse.source, '');
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP AudioMuse settings validates URL allow-list and clears app-stored settings', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const { module, restore } = await isolatedServerModule('settings-audiomuse-delete-allow-list', {
    AUDIOMUSE_URL: origin,
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const disallowed = await requestServer('/api/settings/audiomuse', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: 'http://example.test:8000', token: 'audio-secret' })
    });
    assert.equal(disallowed.status, 400);
    assert.deepEqual(await disallowed.json(), {
      ok: false,
      error: 'AudioMuse URL host is not allowed'
    });

    const saved = await requestServer('/api/settings/audiomuse', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: origin, token: 'audio-secret' })
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).services.audiomuse.source, 'app');

    const cleared = await requestServer('/api/settings/audiomuse', module.server, {
      method: 'DELETE',
      headers: { cookie }
    });
    assert.equal(cleared.status, 200);
    const clearedBody = await cleared.json();
    assert.equal(clearedBody.services.audiomuse.source, 'environment');
    assert.equal(clearedBody.services.audiomuse.tokenSet, false);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP AudioMuse settings use environment URL and token fallback', async () => {
  const seenAuth = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/api/health') {
      seenAuth.push(req.headers.authorization || '');
      res.writeHead(req.headers.authorization === 'Bearer env-audio-token' ? 200 : 401, {
        'content-type': 'application/json'
      });
      res.end(JSON.stringify({ ok: req.headers.authorization === 'Bearer env-audio-token' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const { module, restore } = await isolatedServerModule('settings-audiomuse-env-fallback', {
    AUDIOMUSE_URL: origin,
    AUDIOMUSE_API_TOKEN: 'env-audio-token',
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const health = await requestServer('/api/health', module.server);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).services.audiomuse.ok, true);
    assert.ok(seenAuth.includes('Bearer env-audio-token'));

    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    const cookie = setup.headers.get('set-cookie');

    const settings = await requestServer('/api/settings', module.server, {
      headers: { cookie }
    });
    assert.equal(settings.status, 200);
    const body = await settings.json();
    assert.equal(body.services.audiomuse.source, 'environment');
    assert.equal(body.services.audiomuse.tokenSet, true);
    assert.equal(body.services.audiomuse.url, `${origin}/`);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP lyrics route preserves synchronized library timing and returns a safe unavailable state', async () => {
  const seenIds = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/getSong.view' && url.searchParams.get('id') === 'legacy-song') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({'subsonic-response': {status:'ok',song:{id:'legacy-song',title:'Legacy title',artist:'Legacy artist'}}})); return;
    }
    if (url.pathname === '/rest/getLyrics.view') {
      assert.equal(url.searchParams.get('title'), 'Legacy title');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({'subsonic-response': {status:'ok',lyrics:{value:'First plain line\nSecond plain line'}}})); return;
    }
    if (url.pathname !== '/rest/getLyricsBySongId.view') {
      res.writeHead(404);
      res.end();
      return;
    }
    const id = url.searchParams.get('id');
    seenIds.push(id);
    const structuredLyrics = ['empty-song','legacy-song'].includes(id) ? [] : [
      { kind: 'main', lang: 'en', synced: false, line: [{ value: 'Plain fallback' }] },
      {
        kind: 'main', lang: 'eng', synced: true, offset: -100,
        line: [
          { start: 0, value: ' First line ' },
          { start: 2_000, value: 'Second line' }
        ]
      }
    ];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      'subsonic-response': { status: 'ok', lyricsList: { structuredLyrics } }
    }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const { module, restore } = await isolatedServerModule('navidrome-lyrics-route', {
    NAVIDROME_URL: `http://127.0.0.1:${address.port}`,
    NAVIDROME_USERNAME: 'tester',
    NAVIDROME_PASSWORD: 'secret'
  });

  try {
    const synced = await requestAuthenticatedServer('/api/navidrome/lyrics/song%2Fone', module.server);
    assert.equal(synced.status, 200);
    assert.deepEqual(await synced.json(), {
      songId: 'song/one',
      status: 'ready',
      source: 'library',
      synced: true,
      language: 'eng',
      offsetMs: -100,
      lines: [
        { value: 'First line', startMs: 0 },
        { value: 'Second line', startMs: 2_000 }
      ]
    });

    const unavailable = await requestAuthenticatedServer('/api/navidrome/lyrics/empty-song', module.server);
    assert.equal(unavailable.status, 200);
    assert.deepEqual(await unavailable.json(), {
      songId: 'empty-song', status: 'unavailable', source: 'library', synced: false, language: '', offsetMs: 0, lines: []
    });
    const legacy = await requestAuthenticatedServer('/api/navidrome/lyrics/legacy-song', module.server);
    const legacyBody = await legacy.json();
    assert.equal(legacyBody.status, 'ready');
    assert.equal(legacyBody.synced, false);
    assert.deepEqual(legacyBody.lines.map(line=>line.value), ['First plain line','Second plain line']);
    assert.deepEqual(seenIds, ['song/one', 'empty-song','legacy-song']);

    const disallowed = await requestAuthenticatedServer('/api/navidrome/lyrics/song%2Fone', module.server, { method: 'POST' });
    assert.equal(disallowed.status, 405);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP AudioMuse waveform proxy forwards item id with environment token', async () => {
  const seen = [];
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/api/waveform') {
      seen.push({
        auth: req.headers.authorization || '',
        itemId: url.searchParams.get('item_id')
      });
      res.writeHead(req.headers.authorization === 'Bearer env-audio-token' ? 200 : 401, {
        'content-type': 'application/json'
      });
      res.end(JSON.stringify({ peaks: [-0.2, 0.4], title: 'Wave Test' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const { module, restore } = await isolatedServerModule('audiomuse-waveform-proxy', {
    AUDIOMUSE_URL: origin,
    AUDIOMUSE_API_TOKEN: 'env-audio-token',
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const response = await requestAuthenticatedServer('/api/audiomuse/waveform/song%2Fone', module.server);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { peaks: [-0.2, 0.4], title: 'Wave Test' });
    assert.deepEqual(seen, [{ auth: 'Bearer env-audio-token', itemId: 'song/one' }]);

    const disallowed = await requestAuthenticatedServer('/api/audiomuse/waveform/song%2Fone', module.server, { method: 'POST' });
    assert.equal(disallowed.status, 405);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('HTTP AudioMuse proxy failures return a controlled response without escaping the request boundary', async () => {
  const unavailable = createHttpServer();
  unavailable.listen(0, '127.0.0.1');
  await once(unavailable, 'listening');
  const address = unavailable.address();
  const origin = `http://127.0.0.1:${address.port}`;
  await closeServer(unavailable);

  const { module, restore } = await isolatedServerModule('audiomuse-proxy-unavailable', {
    AUDIOMUSE_URL: origin,
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const failed = await requestAuthenticatedServer('/api/audiomuse/clap/stats', module.server);
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { ok: false, error: 'Upstream service is unavailable' });

    const followUp = await requestAuthenticatedServer('/api/health', module.server);
    assert.equal(followUp.status, 200);
  } finally {
    restore();
  }
});

test('AudioMuse proxy timeouts map to a controlled 504 error', async () => {
  const upstream = createHttpServer(() => {});
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();

  try {
    await assert.rejects(
      () => proxyJson({}, `http://127.0.0.1:${address.port}/slow`, {}, 20),
      (error) => {
        assert.equal(error.status, 504);
        assert.equal(error.publicMessage, 'Upstream service timed out');
        return true;
      }
    );
  } finally {
    await closeServer(upstream);
  }
});

test('HTTP AudioMuse similarity resolves only playable Navidrome candidates with token-file auth', async () => {
  const tokenDir = mkdtempSync(join(tmpdir(), 'navimuse-audiomuse-token-'));
  const tokenFile = join(tokenDir, 'token');
  writeFileSync(tokenFile, 'file-audio-token\n', { mode: 0o600 });
  const seen = [];
  const resolvedSongIds = [];
  let similarityStatus = 200;
  let similarityCandidates = [
    { item_id: 'seed' },
    { item_id: 'playable-1' },
    { item_id: 'missing' },
    { item_id: 'playable-1' },
    { item_id: 'playable-2' }
  ];
  const audiomuse = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://audiomuse.test');
    if (url.pathname === '/api/similar_tracks') {
      seen.push({
        auth: req.headers.authorization || '',
        itemId: url.searchParams.get('item_id'),
        count: url.searchParams.get('n'),
        dedupe: url.searchParams.get('eliminate_duplicates'),
        mood: url.searchParams.get('mood_similarity')
      });
      res.writeHead(similarityStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ similar_tracks: similarityCandidates }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  const navidrome = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://navidrome.test');
    if (url.pathname === '/rest/getSong.view') {
      const id = url.searchParams.get('id');
      resolvedSongIds.push(id);
      if (id === 'transient') {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'temporary failure' }));
        return;
      }
      const song = id.startsWith('playable-') ? { id, title: id, artist: 'Test Artist' } : null;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': song
        ? { status: 'ok', version: '1.16.1', song }
        : { status: 'failed', version: '1.16.1', error: { code: 70, message: 'Not found' } } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  audiomuse.listen(0, '127.0.0.1');
  navidrome.listen(0, '127.0.0.1');
  await Promise.all([once(audiomuse, 'listening'), once(navidrome, 'listening')]);
  const audiomuseOrigin = `http://127.0.0.1:${audiomuse.address().port}`;
  const navidromeOrigin = `http://127.0.0.1:${navidrome.address().port}`;
  const { module, restore } = await isolatedServerModule('audiomuse-similarity', {
    AUDIOMUSE_URL: audiomuseOrigin,
    AUDIOMUSE_API_TOKEN_FILE: tokenFile,
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${audiomuse.address().port}`,
    NAVIDROME_URL: navidromeOrigin,
    NAVIDROME_USERNAME: 'test-user',
    NAVIDROME_PASSWORD: 'test-password',
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${navidrome.address().port}`
  });

  try {
    const initialHealth = await requestAuthenticatedServer('/api/health', module.server);
    assert.equal('audioMuseSimilarity' in await initialHealth.json(), false);

    const response = await requestAuthenticatedServer('/api/audiomuse/similar_tracks?seed=seed&count=2', module.server);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.tracks.map((track) => track.id), ['playable-1', 'playable-2']);
    assert.equal(body.resolvedCount, 2);
    assert.equal(body.partial, false);
    assert.equal(body.resolutionIncomplete, false);
    assert.equal(body.exhausted, false);
    assert.equal(body.timedOut, false);
    assert.equal(body.missingCount, 1);
    assert.deepEqual(seen, [{ auth: 'Bearer file-audio-token', itemId: 'seed', count: '12', dedupe: 'true', mood: 'true' }]);

    resolvedSongIds.length = 0;
    const excluded = await requestAuthenticatedServer(
      '/api/audiomuse/similar_tracks?seed=seed&count=1&exclude=playable-1&exclude=playable-1',
      module.server
    );
    assert.equal(excluded.status, 200);
    const excludedBody = await excluded.json();
    assert.deepEqual(excludedBody.tracks.map((track) => track.id), ['playable-2']);
    assert.deepEqual(resolvedSongIds, ['missing', 'playable-2']);
    assert.equal(seen.at(-1).count, '10');

    const exhausted = await requestAuthenticatedServer(
      '/api/audiomuse/similar_tracks?seed=seed&count=1&exclude=playable-1&exclude=playable-2',
      module.server
    );
    const exhaustedBody = await exhausted.json();
    assert.deepEqual(exhaustedBody.tracks, []);
    assert.equal(exhaustedBody.exhausted, true);
    assert.equal(exhaustedBody.resolutionIncomplete, true);
    assert.equal(exhaustedBody.timedOut, false);
    assert.equal(exhaustedBody.missingCount, 1);

    const health = await requestAuthenticatedServer('/api/health', module.server);
    const healthBody = await health.json();
    assert.deepEqual(healthBody.audioMuseSimilarity, {
      ok: true,
      status: 200,
      count: 5,
      checkedAt: healthBody.audioMuseSimilarity.checkedAt
    });
    assert.equal('message' in healthBody.audioMuseSimilarity, false);

    for (const path of [
      '/api/audiomuse/similar_tracks?seed=&count=2',
      '/api/audiomuse/similar_tracks?seed=bad%2Fseed&count=2',
      `/api/audiomuse/similar_tracks?seed=${'a'.repeat(513)}&count=2`
    ]) {
      const invalidSeed = await requestAuthenticatedServer(path, module.server);
      assert.equal(invalidSeed.status, 400);
    }
    assert.equal(seen.length, 3);

    similarityCandidates = [{ item_id: 'transient' }];
    const transient = await requestAuthenticatedServer('/api/audiomuse/similar_tracks?seed=seed&count=1', module.server);
    const transientBody = await transient.json();
    assert.deepEqual(transientBody.tracks, []);
    assert.equal(transientBody.resolutionIncomplete, true);
    assert.equal(transientBody.exhausted, false);
    assert.equal(transientBody.timedOut, false);
    assert.equal(transientBody.missingCount, 0);
    assert.equal(transientBody.transientFailureCount, 1);

    similarityCandidates = [
      { item_id: 'seed' },
      { item_id: 'playable-1' },
      { item_id: 'missing' },
      { item_id: 'playable-2' }
    ];

    const clampedCount = await requestAuthenticatedServer('/api/audiomuse/similar_tracks?seed=seed&count=100', module.server);
    assert.equal(clampedCount.status, 200);
    assert.equal(seen.at(-1).count, '108');

    similarityStatus = 500;
    const unavailable = await requestAuthenticatedServer('/api/audiomuse/similar_tracks?seed=seed&count=2', module.server);
    assert.equal(unavailable.status, 503);
    const unavailableBody = await unavailable.json();
    assert.equal(unavailableBody.error, 'AudioMuse similarity is temporarily unavailable');
    assert.equal('message' in unavailableBody.telemetry, false);

    const ordinaryPlayback = await requestAuthenticatedServer('/api/navidrome/songs/playable-1', module.server);
    assert.equal(ordinaryPlayback.status, 200);
    assert.equal((await ordinaryPlayback.json()).song.id, 'playable-1');
  } finally {
    restore();
    rmSync(tokenDir, { recursive: true, force: true });
    await Promise.all([closeServer(audiomuse), closeServer(navidrome)]);
  }
});

test('HTTP AudioMuse lyrics discovery resolves safe playable tracks without exposing analysis fields', async () => {
  const seen = [];
  let lyricsStatus = 200;
  const audiomuse = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://audiomuse.test');
    if (url.pathname !== '/api/lyrics/search/text') {
      res.writeHead(404);
      res.end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({
      auth: req.headers.authorization || '',
      contentType: req.headers['content-type'],
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    });
    res.writeHead(lyricsStatus, { 'content-type': 'application/json' });
    res.end(JSON.stringify(lyricsStatus === 404 ? { results: [] } : {
      query: 'heartbreak in the rain',
      count: 3,
      results: [
        { item_id: 'playable-lyric-1', similarity: 0.92, mood_vector: [0.1, 0.8], top_mood: 'sad' },
        { item_id: 'missing-lyric', similarity: 0.84, other_features: { secret: true } },
        { item_id: 'playable-lyric-2', similarity: 0.8, author: 'Private upstream value' }
      ]
    }));
  });
  const navidrome = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://navidrome.test');
    if (url.pathname !== '/rest/getSong.view') {
      res.writeHead(404);
      res.end();
      return;
    }
    const id = url.searchParams.get('id');
    const song = id?.startsWith('playable-lyric-') ? { id, title: `Song ${id.at(-1)}`, artist: 'Test Artist' } : null;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': song
      ? { status: 'ok', version: '1.16.1', song }
      : { status: 'failed', version: '1.16.1', error: { code: 70, message: 'Not found' } } }));
  });
  audiomuse.listen(0, '127.0.0.1');
  navidrome.listen(0, '127.0.0.1');
  await Promise.all([once(audiomuse, 'listening'), once(navidrome, 'listening')]);
  const { module, restore } = await isolatedServerModule('audiomuse-lyrics', {
    AUDIOMUSE_URL: `http://127.0.0.1:${audiomuse.address().port}`,
    AUDIOMUSE_API_TOKEN: 'lyrics-token',
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${audiomuse.address().port}`,
    NAVIDROME_URL: `http://127.0.0.1:${navidrome.address().port}`,
    NAVIDROME_USERNAME: 'test-user',
    NAVIDROME_PASSWORD: 'test-password',
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: `127.0.0.1:${navidrome.address().port}`
  });

  try {
    const missingCsrf = await requestAuthenticatedServer('/api/audiomuse/lyrics/search', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'heartbreak in the rain' })
    });
    assert.equal(missingCsrf.status, 403);

    const response = await requestAuthenticatedServer('/api/audiomuse/lyrics/search', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse-Server' },
      body: JSON.stringify({ query: '  heartbreak   in the rain  ', limit: 2 })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.tracks.map((track) => track.id), ['playable-lyric-1', 'playable-lyric-2']);
    assert.equal(body.query, 'heartbreak in the rain');
    assert.equal(body.resolvedCount, 2);
    assert.equal(body.partial, false);
    assert.equal(JSON.stringify(body).includes('mood_vector'), false);
    assert.equal(JSON.stringify(body).includes('similarity'), false);
    assert.equal(JSON.stringify(body).includes('other_features'), false);
    assert.deepEqual(seen, [{
      auth: 'Bearer lyrics-token',
      contentType: 'application/json',
      body: { query: 'heartbreak in the rain', limit: 6 }
    }]);

    for (const invalidBody of [
      { query: 'x' },
      { query: 'valid\u0000words' },
      { query: 'valid words', limit: 0 },
      { query: 'valid words', unexpected: true }
    ]) {
      const invalid = await requestAuthenticatedServer('/api/audiomuse/lyrics/search', module.server, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse-Server' },
        body: JSON.stringify(invalidBody)
      });
      assert.equal(invalid.status, 400);
    }

    lyricsStatus = 404;
    const empty = await requestAuthenticatedServer('/api/audiomuse/lyrics/search', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse-Server' },
      body: JSON.stringify({ query: 'no such lyrical theme' })
    });
    assert.equal(empty.status, 200);
    assert.deepEqual((await empty.json()).tracks, []);

    lyricsStatus = 500;
    const unavailable = await requestAuthenticatedServer('/api/audiomuse/lyrics/search', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse-Server' },
      body: JSON.stringify({ query: 'temporary upstream failure' })
    });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { ok: false, error: 'Lyrics discovery is temporarily unavailable' });
  } finally {
    restore();
    await Promise.all([closeServer(audiomuse), closeServer(navidrome)]);
  }
});

test('HTTP AudioMuse health tolerates a missing optional token file', async () => {
  let authorization = 'unseen';
  const audiomuse = createHttpServer((req, res) => {
    authorization = req.headers.authorization || '';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  audiomuse.listen(0, '127.0.0.1');
  await once(audiomuse, 'listening');
  const origin = `http://127.0.0.1:${audiomuse.address().port}`;
  const { module, restore } = await isolatedServerModule('audiomuse-missing-token-file', {
    AUDIOMUSE_URL: origin,
    AUDIOMUSE_API_TOKEN: '',
    AUDIOMUSE_API_TOKEN_FILE: join(tmpdir(), `navimuse-missing-token-${Date.now()}`),
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${audiomuse.address().port}`
  });

  try {
    const health = await requestServer('/api/health', module.server);
    assert.equal(health.status, 200);
    assert.equal(authorization, '');
  } finally {
    restore();
    await closeServer(audiomuse);
  }
});

test('HTTP AudioMuse settings decryption warning clears after token recovery', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/api/health') {
      res.writeHead(req.headers.authorization === 'Bearer audio-secret' ? 200 : 401, {
        'content-type': 'application/json'
      });
      res.end(JSON.stringify({ ok: req.headers.authorization === 'Bearer audio-secret' }));
      return;
    }

    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const { dataDir, module, restore } = await isolatedServerModule('settings-audiomuse-decryption-recovery', {
    AUDIOMUSE_URL: origin,
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: `127.0.0.1:${address.port}`
  });

  try {
    const setup = await requestServer('/api/settings/admin', module.server, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' })
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie');

    const saved = await requestServer('/api/settings/audiomuse', module.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: origin, token: 'audio-secret' })
    });
    assert.equal(saved.status, 200);

    const settingsPath = join(dataDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.services.audiomuse.token = 'enc:v1:bad:bad:bad';
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

    const corruptedModule = await import(`../server.mjs?settings-audiomuse-decryption-corrupt=${Date.now()}`);
    const failedHealth = await requestServer('/api/health', corruptedModule.server);
    assert.equal(failedHealth.status, 200);
    const failedHealthBody = await failedHealth.json();
    assert.equal(failedHealthBody.services.audiomuse.status, 401);

    const warning = await requestServer('/api/settings', corruptedModule.server, {
      headers: { cookie }
    });
    assert.equal(warning.status, 200);
    const warningBody = await warning.json();
    assert.equal(warningBody.security.decryptionFailed, true);
    assert.deepEqual(warningBody.security.decryptionFailedServices, ['audiomuse']);
    assert.equal(warningBody.services.audiomuse.decryptionFailed, true);

    const recovered = await requestServer('/api/settings/audiomuse', corruptedModule.server, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      body: JSON.stringify({ url: origin, token: 'audio-secret' })
    });
    assert.equal(recovered.status, 200);
    const recoveredBody = await recovered.json();
    assert.equal(recoveredBody.security.decryptionFailed, false);
    assert.deepEqual(recoveredBody.security.decryptionFailedServices, []);
    assert.equal(recoveredBody.services.audiomuse.decryptionFailed, false);
    assert.equal(recoveredBody.services.audiomuse.tokenSet, true);
  } finally {
    restore();
    await closeServer(upstream);
  }
});

test('first-run bootstrap does not make configured upstream music services public', async () => {
  let upstreamRequests=0;
  const upstream=createHttpServer((req,res)=>{
    upstreamRequests++;
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({'subsonic-response':{status:'ok',artists:{index:[]}}}));
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const origin=`http://127.0.0.1:${upstream.address().port}`;
  const {module,restore}=await isolatedServerModule('first-run-private-upstreams',{
    NAVIDROME_URL:origin,NAVIDROME_USERNAME:'synthetic-owner',NAVIDROME_PASSWORD:'synthetic-secret',AUDIOMUSE_URL:origin,
  });
  try {
    for (const [path,method] of [
      ['/api/navidrome/library/artists','GET'],['/api/navidrome/stream/song','GET'],
      ['/api/navidrome/cover/album','HEAD'],['/api/audiomuse/health','GET'],
      ['/api/atlas/map/manifest','GET'],['/api/atlas/points/inspect','POST'],
    ]) {
      const response=await requestServer(path,module.server,{method,headers:{'x-requested-with':'NaviMuse'}});
      assert.equal(response.status,401,path);
      if (method!=='HEAD') assert.deepEqual(await response.json(),{ok:false,error:'NaviMuse admin setup is required'});
    }
    assert.equal(upstreamRequests,0,'No configured upstream is called before setup');
    assert.equal((await requestServer('/api/settings',module.server)).status,200);
    const setup=await requestServer('/api/settings/admin',module.server,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'}),
    });
    assert.equal(setup.status,200,'Controlled first-run setup stays reachable');
    assert.equal((await requestServer('/api/navidrome/library/artists',module.server)).status,401);
    const authorized=await requestServer('/api/navidrome/library/artists',module.server,{headers:{cookie:setup.headers.get('set-cookie')}});
    assert.equal(authorized.status,200);assert.ok(upstreamRequests>0);
  } finally {restore();await closeServer(upstream);}
});

// Business-endpoint fixtures explicitly authenticate through controlled setup.
// Authorization tests keep requestServer and never receive an implicit cookie.
const fixtureSessionCookies=new WeakMap();
async function requestAuthenticatedServer(pathname,appServer,init={}) {
  assert.ok(appServer,'An isolated server is required for authenticated fixtures');
  let cookie=fixtureSessionCookies.get(appServer);
  if (!cookie) {
    const setup=await requestServer('/api/settings/admin',appServer,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'}),
    });
    assert.equal(setup.status,200,'Fixture must establish its administrator');
    cookie=setup.headers.get('set-cookie');assert.ok(cookie);fixtureSessionCookies.set(appServer,cookie);
  }
  return requestServer(pathname,appServer,{...init,headers:{...init.headers,cookie}});
}

async function requestServer(pathname, appServer = server, init = {}) {
  return requestAppServer(pathname, appServer, init);
}

async function requestAppServer(pathname, appServer, init = {}) {
  appServer.listen(0, '127.0.0.1');
  await once(appServer, 'listening');

  try {
    const address = appServer.address();
    return await fetch(`http://127.0.0.1:${address.port}${pathname}`, init);
  } finally {
    await closeServer(appServer);
  }
}

async function isolatedServerModule(label, envOverrides = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), `navimuse-${label}-`));
  const previousEnv = {
    NAVIMUSE_DATA_DIR: process.env.NAVIMUSE_DATA_DIR,
    NAVIMUSE_SETUP_TOKEN: process.env.NAVIMUSE_SETUP_TOKEN,
    NAVIMUSE_ALLOWED_NAVIDROME_HOSTS: process.env.NAVIMUSE_ALLOWED_NAVIDROME_HOSTS,
    NAVIMUSE_ALLOW_ANY_NAVIDROME_URL: process.env.NAVIMUSE_ALLOW_ANY_NAVIDROME_URL,
    NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS: process.env.NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS,
    NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS: process.env.NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS,
    NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL: process.env.NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL,
    AUDIOMUSE_URL: process.env.AUDIOMUSE_URL,
    AUDIOMUSE_API_TOKEN: process.env.AUDIOMUSE_API_TOKEN,
    AUDIOMUSE_API_TOKEN_FILE: process.env.AUDIOMUSE_API_TOKEN_FILE,
    NAVIDROME_URL: process.env.NAVIDROME_URL,
    NAVIDROME_USERNAME: process.env.NAVIDROME_USERNAME,
    NAVIDROME_PASSWORD: process.env.NAVIDROME_PASSWORD,
    PUBLIC_NAVIDROME_URL: process.env.PUBLIC_NAVIDROME_URL,
    TRUST_PROXY: process.env.TRUST_PROXY,
    NAVIMUSE_OIDC_ISSUER: process.env.NAVIMUSE_OIDC_ISSUER,
    NAVIMUSE_OIDC_CLIENT_ID: process.env.NAVIMUSE_OIDC_CLIENT_ID,
    NAVIMUSE_OIDC_CLIENT_SECRET: process.env.NAVIMUSE_OIDC_CLIENT_SECRET,
    NAVIMUSE_OIDC_CLIENT_SECRET_FILE: process.env.NAVIMUSE_OIDC_CLIENT_SECRET_FILE,
    NAVIMUSE_OIDC_REDIRECT_URI: process.env.NAVIMUSE_OIDC_REDIRECT_URI
  };

  process.env.NAVIMUSE_DATA_DIR = dataDir;
  process.env.NAVIMUSE_SETUP_TOKEN = 'test-setup-token';
  delete process.env.NAVIDROME_URL;
  delete process.env.NAVIDROME_USERNAME;
  delete process.env.NAVIDROME_PASSWORD;
  delete process.env.NAVIMUSE_ALLOWED_NAVIDROME_HOSTS;
  delete process.env.NAVIMUSE_ALLOW_ANY_NAVIDROME_URL;
  delete process.env.NAVIMUSE_ALLOW_PRIVATE_RADIO_STREAMS;
  delete process.env.NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS;
  delete process.env.NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL;
  delete process.env.AUDIOMUSE_URL;
  delete process.env.AUDIOMUSE_API_TOKEN;
  delete process.env.AUDIOMUSE_API_TOKEN_FILE;
  delete process.env.TRUST_PROXY;
  delete process.env.NAVIMUSE_OIDC_ISSUER;
  delete process.env.NAVIMUSE_OIDC_CLIENT_ID;
  delete process.env.NAVIMUSE_OIDC_CLIENT_SECRET;
  delete process.env.NAVIMUSE_OIDC_CLIENT_SECRET_FILE;
  delete process.env.NAVIMUSE_OIDC_REDIRECT_URI;
  Object.entries(envOverrides).forEach(([key, value]) => {
    process.env[key] = value;
  });

  const module = await import(`../server.mjs?${label}=${Date.now()}`);
  return {
    dataDir,
    module,
    restore: () => {
      restoreEnv(previousEnv);
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

async function openAppServer(appServer) {
  appServer.listen(0, '127.0.0.1');
  await once(appServer, 'listening');
  const address = appServer.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(appServer)
  };
}

async function openPingServer(host = '127.0.0.1') {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname === '/rest/ping.view') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ 'subsonic-response': { status: 'ok' } }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  upstream.listen(0, host);
  await once(upstream, 'listening');
  const address = upstream.address();
  const hostname = host === '::1' ? '[::1]' : '127.0.0.1';
  return {
    origin: `http://${hostname}:${address.port}`,
    host: `${host}:${address.port}`,
    close: () => closeServer(upstream)
  };
}

function restoreEnv(values) {
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
}

async function closeServer(serverToClose) {
  await new Promise((resolveClose, rejectClose) => {
    serverToClose.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

test('HTTP Atlas map boundary authenticates, aliases metadata, validates tiles, and caches snapshot', async () => {
  let mapCalls = 0;
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url || '/', 'http://upstream.test');
    if (url.pathname !== '/api/map' || url.searchParams.get('percent') !== '100') { res.writeHead(404); res.end(); return; }
    assert.equal(req.headers.authorization, 'Bearer atlas-secret');
    mapCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ projection: 'precomputed', items: [
      { item_id: 'raw-a', embedding_2d: [-1, -1], title: 'Private title', artist: 'Private artist', mood_vector: [1] },
      { item_id: 'raw-b', embedding_2d: [1, -1] },
      { item_id: 'raw-c', embedding_2d: [-1, 1] },
      { item_id: 'raw-d', embedding_2d: [1, 1] }
    ] }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('atlas-map-boundary', {
    AUDIOMUSE_URL: `http://127.0.0.1:${upstream.address().port}`,
    AUDIOMUSE_API_TOKEN: 'atlas-secret',
    NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL: 'true'
  });
  try {
    const setup = await requestServer('/api/settings/admin', module.server, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct horse battery', setupToken: 'test-setup-token' }) });
    const cookie = setup.headers.get('set-cookie');
    const unauthorized = await requestServer('/api/atlas/projection', module.server);
    assert.equal(unauthorized.status, 401);
    const response = await requestServer('/api/atlas/projection', module.server, { headers: { cookie, 'x-request-id': 'atlas-test' } });
    assert.equal(response.status, 200); assert.match(response.headers.get('etag'), /^"sha256:/);
    const manifest = await response.json();
    assert.equal(manifest.kind, 'projection-manifest'); assert.equal(manifest.pointCount, 4);
    assert.equal(JSON.stringify(manifest).includes('raw-a'), false);
    const descriptor = manifest.lods.at(-1).tiles.find(tile => tile.pointCount > 0);
    const tileResponse = await requestServer(`/api/atlas/tiles/${manifest.lods.at(-1).lod}/${descriptor.tileX}/${descriptor.tileY}`, module.server, { headers: { cookie } });
    assert.equal(tileResponse.status, 200); assert.match(tileResponse.headers.get('etag'), /^"sha256:/);
    const tile = await tileResponse.json(); assert.equal(tile.points.length, descriptor.pointCount);
    const serialized = JSON.stringify(tile); for (const secret of ['raw-a','Private title','Private artist','atlas-secret','mood_vector']) assert.equal(serialized.includes(secret), false);
    const head = await requestServer('/api/atlas/projection', module.server, { method: 'HEAD', headers: { cookie } }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    const cached = await requestServer('/api/atlas/projection', module.server, { headers: { cookie, 'if-none-match': `W/${response.headers.get('etag')}, \"other\"` } }); assert.equal(cached.status, 304); assert.equal(await cached.text(), '');
    const wildcard = await requestServer('/api/atlas/projection', module.server, { headers: { cookie, 'if-none-match': '*' } }); assert.equal(wildcard.status, 304);
    const malformed = await requestServer('/api/atlas/tiles/-1/0/0', module.server, { headers: { cookie } }); assert.equal(malformed.status, 400);
    const huge = await requestServer('/api/atlas/tiles/999999999999999999999/0/0', module.server, { headers: { cookie } }); assert.equal(huge.status, 400);
    const missing = await requestServer('/api/atlas/tiles/99/0/0', module.server, { headers: { cookie, 'x-request-id': 'atlas-safe-error' } }); assert.equal(missing.status, 404); const error = await missing.json(); assert.equal(error.kind, 'atlas-resolution-error'); assert.equal(error.requestId, 'atlas-safe-error'); assert.equal(JSON.stringify(error).includes('127.0.0.1'), false);
    assert.equal(mapCalls, 1);
  } finally { restore(); await closeServer(upstream); }
});

test('HTTP Atlas map rejects upstream redirects and oversized bodies without following', async () => {
  let redirectedHits = 0;
  const redirectTarget = createHttpServer((_req,res)=>{ redirectedHits += 1; res.end('{}'); });redirectTarget.listen(0,'127.0.0.1');await once(redirectTarget,'listening');
  const upstream=createHttpServer((req,res)=>{const url=new URL(req.url||'/','http://x');if(url.searchParams.get('mode')==='large'){res.writeHead(200,{'content-type':'application/json','content-length':String(65*1024*1024)});res.end('{}');return}res.writeHead(302,{location:`http://127.0.0.1:${redirectTarget.address().port}/metadata`});res.end()});upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const {module,restore}=await isolatedServerModule('atlas-map-redirect',{AUDIOMUSE_URL:`http://127.0.0.1:${upstream.address().port}`,AUDIOMUSE_API_TOKEN:'secret',NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL:'true'});
  try{const setup=await requestServer('/api/settings/admin',module.server,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'})});const cookie=setup.headers.get('set-cookie');const response=await requestServer('/api/atlas/projection',module.server,{headers:{cookie}});assert.equal(response.status,502);assert.equal(redirectedHits,0);}finally{restore();await closeServer(upstream);await closeServer(redirectTarget)}
});

test('bounded Atlas upstream JSON reader enforces declared and streamed byte ceilings', async () => {
  await assert.rejects(() => readBoundedJsonResponse(new Response('{}', { headers: { 'content-length': '1000' } }), 10), /too large/);
  await assert.rejects(() => readBoundedJsonResponse(new Response('x'.repeat(20)), 10), /too large/);
  assert.deepEqual(await readBoundedJsonResponse(new Response('{"ok":true}'), 20), { ok: true });
  await assert.rejects(() => readBoundedJsonResponse(new Response('{bad'), 20), /invalid JSON/);
});

test('HTTP Atlas Journey planner preserves endpoints, resolves stops, redacts upstream data, and freezes response', async () => {
  const mapItems=[{item_id:'raw-a',embedding_2d:[-1,-1]},{item_id:'raw-m',embedding_2d:[0,0]},{item_id:'raw-b',embedding_2d:[1,1]}],songs={
    'raw-a':{id:'raw-a',title:'Start',artist:'Artist A',album:'Album A',duration:180,coverArt:'cover-a'},
    'raw-m':{id:'raw-m',title:'Middle',artist:'Artist M',duration:181},
    'raw-b':{id:'raw-b',title:'End',artist:'Artist B',duration:182}
  };let pathQuery=null;
  const audio=createHttpServer((req,res)=>{const url=new URL(req.url||'/','http://audio');assert.equal(req.headers.authorization,'Bearer atlas-secret');if(url.pathname==='/api/map'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({projection:'precomputed',items:mapItems}));return}if(url.pathname==='/api/find_path'){pathQuery=Object.fromEntries(url.searchParams);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({path:[{item_id:'raw-a',title:'leak'},{item_id:'raw-m',embedding_vector:[1,2]},{item_id:'raw-b',mood_vector:[3]}],total_distance:1.5}));return}res.writeHead(404);res.end()});
  const nav=createHttpServer((req,res)=>{const url=new URL(req.url||'/','http://nav');if(url.pathname==='/rest/getSong.view'){const song=songs[url.searchParams.get('id')];res.writeHead(song?200:404,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':song?{status:'ok',song}:{status:'failed',error:{code:70}}}));return}if(url.pathname==='/rest/stream.view'){assert.equal(url.searchParams.get('id'),'raw-a');res.writeHead(200,{'content-type':'audio/mpeg','content-length':'3'});res.end('abc');return}res.writeHead(404);res.end()});
  audio.listen(0,'127.0.0.1');nav.listen(0,'127.0.0.1');await Promise.all([once(audio,'listening'),once(nav,'listening')]);
  const {module,restore}=await isolatedServerModule('atlas-journey-plan',{AUDIOMUSE_URL:`http://127.0.0.1:${audio.address().port}`,AUDIOMUSE_API_TOKEN:'atlas-secret',NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL:'true',NAVIDROME_URL:`http://127.0.0.1:${nav.address().port}`,NAVIDROME_USERNAME:'tester',NAVIDROME_PASSWORD:'secret'});
  try{const setup=await requestServer('/api/settings/admin',module.server,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'})}),cookie=setup.headers.get('set-cookie');const manifest=await (await requestServer('/api/atlas/projection',module.server,{headers:{cookie}})).json(),full=manifest.lods.at(-1),tiles=[];for(const descriptor of full.tiles.filter(t=>t.pointCount)){tiles.push(await (await requestServer(`/api/atlas/tiles/${full.lod}/${descriptor.tileX}/${descriptor.tileY}`,module.server,{headers:{cookie}})).json())}const aliases=new Map;for(const tile of tiles)for(const point of tile.points){if(point.x===-1)aliases.set('start',point.pointId);if(point.x===1)aliases.set('end',point.pointId)}const body={contractVersion:'sonic-atlas/v1',kind:'ordered-waypoint-plan-request',requestId:'journey-http-1',waypoints:[{waypointId:'w1',pointId:aliases.get('start')},{waypointId:'w2',pointId:aliases.get('end')}],segmentOptions:[{fromWaypointId:'w1',toWaypointId:'w2',targetTrackCount:25,pathFixSize:false}]};const csrf=await requestServer('/api/atlas/journeys/plan',module.server,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)});assert.equal(csrf.status,403);const response=await requestServer('/api/atlas/journeys/plan',module.server,{method:'POST',headers:{'content-type':'application/json',cookie,'x-requested-with':'NaviMuse','x-request-id':'journey-http-1'},body:JSON.stringify(body)});assert.equal(response.status,200);const journey=await response.json();assert.equal(journey.kind,'resolved-journey');assert.equal(journey.stops.length,3);assert.deepEqual(pathQuery,{start_song_id:'raw-a',end_song_id:'raw-b',max_steps:'25',path_fix_size:'false',path_space:'audio'});const serialized=JSON.stringify(journey);for(const secret of ['raw-a','raw-m','raw-b','atlas-secret','cover-a','embedding_vector','mood_vector'])assert.equal(serialized.includes(secret),false);assert.equal(journey.stops[0].pointId,aliases.get('start'));assert.equal(journey.stops.at(-1).pointId,aliases.get('end'));const stream=await requestServer(`/api/atlas/tracks/${encodeURIComponent(journey.stops[0].playback.trackRef)}/stream`,module.server,{headers:{cookie}});assert.equal(stream.status,200);const revalidation=await requestServer('/api/atlas/journeys/revalidate',module.server,{method:'POST',headers:{'content-type':'application/json',cookie,'x-requested-with':'NaviMuse','x-request-id':'journey-revalidate-http-1'},body:JSON.stringify({contractVersion:'sonic-atlas/v1',kind:'journey-revalidation-request',requestId:'journey-revalidate-http-1',projectionDigest:journey.identity.projectionDigest,entries:journey.stops.slice(1).map((stop,index)=>({stopIndex:index+1,stopId:stop.stopId,pointId:stop.pointId,trackRef:stop.playback.trackRef}))})});assert.equal(revalidation.status,200);const checked=await revalidation.json();assert.equal(checked.kind,'journey-revalidation');assert.equal(checked.status,'valid');assert.deepEqual(checked.entries.map(entry=>entry.state),['playable','playable']);assert.equal(JSON.stringify(checked).includes('raw-'),false);const repairResponse=await requestServer('/api/atlas/journeys/revalidate',module.server,{method:'POST',headers:{'content-type':'application/json',cookie,'x-requested-with':'NaviMuse','x-request-id':'journey-revalidate-http-2'},body:JSON.stringify({contractVersion:'sonic-atlas/v1',kind:'journey-revalidation-request',requestId:'journey-revalidate-http-2',projectionDigest:journey.identity.projectionDigest,entries:journey.stops.map((stop,index)=>({stopIndex:index,stopId:stop.stopId,pointId:index===1?journey.stops[0].pointId:stop.pointId,trackRef:stop.playback.trackRef}))})});assert.equal(repairResponse.status,200);const repaired=await repairResponse.json();assert.equal(repaired.status,'repair-required');assert.deepEqual(repaired.repair.waypoints,[journey.stops[0].pointId,journey.stops.at(-1).pointId]);assert.equal(JSON.stringify(repaired).includes('raw-'),false)}finally{restore();await closeServer(audio);await closeServer(nav)}
});

test('HTTP Atlas point resolver maps playable Navidrome tracks to opaque projection points', async()=>{const audio=createHttpServer((req,res)=>{const url=new URL(req.url||'/','http://audio');if(url.pathname==='/api/map'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({projection:'precomputed',items:[{item_id:'raw-a',embedding_2d:[-1,-1]},{item_id:'raw-b',embedding_2d:[1,1]}]}));return}res.writeHead(404);res.end()});const nav=createHttpServer((req,res)=>{const url=new URL(req.url||'/','http://nav');if(url.pathname==='/rest/getSong.view'&&['raw-a','raw-b'].includes(url.searchParams.get('id'))){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':{status:'ok',song:{id:url.searchParams.get('id'),title:'Private',artist:'Private'}}}));return}res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':{status:'failed',error:{code:70}}}))});audio.listen(0,'127.0.0.1');nav.listen(0,'127.0.0.1');await Promise.all([once(audio,'listening'),once(nav,'listening')]);const {module,restore}=await isolatedServerModule('atlas-point-resolution',{AUDIOMUSE_URL:`http://127.0.0.1:${audio.address().port}`,AUDIOMUSE_API_TOKEN:'secret',NAVIMUSE_ALLOW_ANY_AUDIOMUSE_URL:'true',NAVIDROME_URL:`http://127.0.0.1:${nav.address().port}`,NAVIDROME_USERNAME:'u',NAVIDROME_PASSWORD:'p'});try{const setup=await requestServer('/api/settings/admin',module.server,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'})}),cookie=setup.headers.get('set-cookie'),response=await requestServer('/api/atlas/points/resolve',module.server,{method:'POST',headers:{cookie,'content-type':'application/json','x-requested-with':'NaviMuse','x-request-id':'point-http'},body:JSON.stringify({trackIds:['raw-a','raw-b']})});assert.equal(response.status,200);const body=await response.json();assert.equal(body.kind,'atlas-point-resolution');assert.equal(body.points.length,2);const serialized=JSON.stringify(body);assert.equal(serialized.includes('raw-a'),false);assert.equal(serialized.includes('Private'),false);
const inspectBody={contractVersion:'sonic-atlas/v1',kind:'atlas-point-inspection-request',requestId:'inspect-http',pointId:body.points[0].pointId,identity:{contractVersion:'sonic-atlas/v1',...body.identity}};
const inspectInit={method:'POST',headers:{cookie,'content-type':'application/json','x-requested-with':'NaviMuse','x-request-id':'inspect-http'},body:JSON.stringify(inspectBody)};
const inspected=await requestServer('/api/atlas/points/inspect',module.server,inspectInit);assert.equal(inspected.status,200);assert.equal(inspected.headers.get('cache-control'),'no-store');const inspection=await inspected.json();assert.equal(inspection.playback.title,'Private');assert.equal(inspection.pointId,body.points[0].pointId);assert.equal(JSON.stringify(inspection).includes('raw-a'),false);assert.deepEqual(inspection.coordinate,body.points[0].coordinate);
// Exercise the production client and selection lifecycle against this real HTTP
// BFF, while only Navidrome/AudioMuse are local synthetic upstream services.
const originalFetch = globalThis.fetch;
const selection = createAtlasPointSelection();
try {
  globalThis.fetch = (input, init) => input === '/api/atlas/points/inspect'
    ? requestServer(input, module.server, {...init, headers: {...init.headers, cookie}})
    : originalFetch(input, init);
  selection.setScope('fixture-appliance/library');
  const picked = {identity: inspectBody.identity, pointId: inspectBody.pointId, coordinate: body.points[0].coordinate};
  await selection.select(picked);
  assert.equal(selection.getState().status, 'ready');
  assert.equal(selection.getState().result.playback.title, 'Private');
  assert.deepEqual(selection.getState().result.coordinate, picked.coordinate);
  assert.equal(JSON.stringify(selection.getState()).includes('raw-a'), false);
  await selection.select({...picked, coordinate: {...picked.coordinate, x: picked.coordinate.x + 0.01}});
  assert.equal(selection.getState().status, 'failed');
  assert.equal(selection.getState().result, undefined);
  await selection.select({...picked, identity: {...picked.identity, projectionVersion: 'stale-version'}});
  assert.equal(selection.getState().status, 'failed');
  assert.equal(selection.getState().code, 'IDENTITY_MISMATCH');
  selection.setScope(null);
  assert.equal(selection.getState().status, 'idle');
} finally {
  selection.dispose();
  globalThis.fetch = originalFetch;
}
const unauth=await requestServer('/api/atlas/points/inspect',module.server,{...inspectInit,headers:{...inspectInit.headers,cookie:''}});assert.equal(unauth.status,401);
const cross=await requestServer('/api/atlas/points/inspect',module.server,{...inspectInit,headers:{...inspectInit.headers,origin:'https://evil.example'}});assert.equal(cross.status,403);
const stale=await requestServer('/api/atlas/points/inspect',module.server,{...inspectInit,body:JSON.stringify({...inspectBody,identity:{...inspectBody.identity,projectionDigest:`sha256:${'b'.repeat(64)}`}})});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'IDENTITY_MISMATCH');
const absent=await requestServer('/api/atlas/points/inspect',module.server,{...inspectInit,body:JSON.stringify({...inspectBody,pointId:'unknown-point'})});assert.equal(absent.status,404);assert.equal((await absent.json()).code,'POINT_NOT_FOUND');
const mismatch=await requestServer('/api/atlas/points/inspect',module.server,{...inspectInit,body:JSON.stringify({...inspectBody,requestId:'other-click'})});assert.equal(mismatch.status,400);
const bodyOnlyHeaders = {...inspectInit.headers}; delete bodyOnlyHeaders['x-request-id'];
const bodyOnly = await requestServer('/api/atlas/points/inspect', module.server, {...inspectInit, headers: bodyOnlyHeaders});
assert.equal(bodyOnly.status, 200); assert.equal((await bodyOnly.json()).requestId, 'inspect-http');
const bodyOnlyStale = await requestServer('/api/atlas/points/inspect', module.server, {...inspectInit, headers: bodyOnlyHeaders, body: JSON.stringify({...inspectBody, identity: {...inspectBody.identity, projectionVersion: 'old-version'}})});
assert.equal(bodyOnlyStale.status, 409);
const staleWithoutHeader = await bodyOnlyStale.json();
assert.equal(staleWithoutHeader.requestId, 'inspect-http'); assert.equal(staleWithoutHeader.code, 'IDENTITY_MISMATCH');
const noRequestId = {...inspectBody}; delete noRequestId.requestId;
for (const invalidBody of [null, [], 42, 'not-an-object', noRequestId, {...inspectBody, requestId: 'invalid/id'}, {...inspectBody, requestId: ''}, {...inspectBody, requestId: 'x'.repeat(129)}]) {
  const rejected = await requestServer('/api/atlas/points/inspect', module.server, {...inspectInit, headers: bodyOnlyHeaders, body: JSON.stringify(invalidBody)});
  assert.equal(rejected.status, 400, `invalid inspection body ${JSON.stringify(invalidBody)}`);
  assert.equal(rejected.headers.get('cache-control'), 'no-store');
  const errorBody = await rejected.json();
  assert.equal(errorBody.code, 'INVALID_REQUEST');
  assert.match(errorBody.requestId, /^[A-Za-z0-9._~-]{1,128}$/);
}
for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
  const deniedNative = await requestServer('/api/atlas/points/inspect', module.server, {...inspectInit, headers: {...inspectInit.headers, cookie: '', origin}});
  assert.equal(deniedNative.status, 401, 'native Origin must never substitute for authentication');
}
const method=await requestServer('/api/atlas/points/inspect',module.server,{headers:{cookie}});assert.equal(method.status,405);assert.equal(method.headers.get('allow'),'POST');
const missing=await requestServer('/api/atlas/points/resolve',module.server,{method:'POST',headers:{cookie,'content-type':'application/json','x-requested-with':'NaviMuse','x-request-id':'missing'},body:JSON.stringify({trackIds:['missing']})});assert.equal(missing.status,404);assert.equal((await missing.json()).code,'WAYPOINT_NOT_FOUND')}finally{restore();await closeServer(audio);await closeServer(nav)}});

test('HTTP library details and genre overview enforce the selected folder', async () => {
  const upstream = createHttpServer((req, res) => {
    const url = new URL(req.url, 'http://upstream');
    let payload;
    if (url.pathname.endsWith('/getArtist.view')) payload = { artist: { album: [{ id: 'selected' }, { id: 'elsewhere' }] } };
    else if (url.pathname.endsWith('/getGenres.view')) payload = { genres: { genre: [{ value: 'Jazz', songCount: 99 }, { value: 'Rock', songCount: 10 }] } };
    else if (url.pathname.endsWith('/getAlbumList2.view')) {
      assert.equal(url.searchParams.get('musicFolderId'), 'folder');
      payload = { albumList2: { album: url.searchParams.get('genre') === 'Rock' ? [] : [{ id: 'selected' }, { id: 'unrelated' }] } };
    } else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', ...payload } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const { module, restore } = await isolatedServerModule('library-detail-scope', {
    NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`, NAVIDROME_USERNAME: 'tester', NAVIDROME_PASSWORD: 'secret'
  });
  try {
    const detail = await requestAuthenticatedServer('/api/navidrome/library/albums?artistId=artist&musicFolderId=folder', module.server);
    assert.equal(detail.status, 200);
    assert.deepEqual((await detail.json()).albums, [{ id: 'selected' }]);
    const genres = await requestAuthenticatedServer('/api/navidrome/library/genres?musicFolderId=folder', module.server);
    assert.equal(genres.status, 200);
    assert.deepEqual((await genres.json()).genres, [{ value: 'Jazz' }]);
    const invalid = await requestAuthenticatedServer('/api/navidrome/library/albums?artistId=artist&genre=Jazz', module.server);
    assert.equal(invalid.status, 400);
  } finally { restore(); await closeServer(upstream); }
});

test('song metadata preserves a confirmed missing-track response for queue repair', async () => {
  const upstream = createHttpServer((req,res) => {
    const id = new URL(req.url,'http://upstream').searchParams.get('id');
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({'subsonic-response':{status:'failed',error:{code:id==='missing'?70:40,message:'Unavailable'}}}));
  });
  upstream.listen(0,'127.0.0.1'); await once(upstream,'listening');
  const {module,restore} = await isolatedServerModule('queue-missing-song',{NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'tester',NAVIDROME_PASSWORD:'secret'});
  try {
    const missing = await requestAuthenticatedServer('/api/navidrome/songs/missing',module.server);
    assert.equal(missing.status,404);
    const denied = await requestAuthenticatedServer('/api/navidrome/songs/denied',module.server);
    assert.equal(denied.status,502);
  } finally {restore();await closeServer(upstream);}
});

test('session queue scope is opaque, authenticated, stable across refreshes and isolated by deployment', async (t) => {
  const upstream = createHttpServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':{status:'ok'}}));});
  upstream.listen(0,'127.0.0.1'); await once(upstream,'listening');
  t.after(()=>closeServer(upstream));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
  const scopes = [];
  for (const label of ['one','two']) {
    const {module,restore} = await isolatedServerModule(`queue-scope-${label}`, {NAVIDROME_URL:upstreamUrl,NAVIDROME_USERNAME:'private-upstream-user',NAVIDROME_PASSWORD:'private-upstream-password'});
    try {
      const anonymous = await requestServer('/api/settings/session',module.server);
      assert.equal((await anonymous.json()).queueScope,undefined);
      const setup = await requestServer('/api/settings/admin',module.server,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'})});
      const cookie = setup.headers.get('set-cookie');
      const read = async () => (await (await requestServer('/api/settings/session',module.server,{headers:{cookie}})).json()).queueScope;
      const first = await read();
      assert.match(first,/^queue-scope-v1:[a-f0-9]{64}$/);
      const injectedScope = 'queue-scope-v1:' + 'f'.repeat(64);
      assert.notEqual(first,injectedScope);
      const injected = await requestServer(`/api/settings/session?queueScope=${injectedScope}`,module.server,{headers:{cookie,'x-queue-scope':injectedScope}});
      assert.equal(injected.status,200);
      const injectedStatus = await injected.json();
      assert.equal(injectedStatus.authenticated,true,'the original signed principal remains authenticated');
      assert.equal(injectedStatus.queueScope,first,'query/header input cannot replace the signed principal namespace');
      const forged = await requestServer('/api/settings/session?queueScope=forged',module.server,{headers:{cookie:'navimuse_session=forged','x-queue-scope':first}});
      const forgedStatus = await forged.json();
      assert.equal(forgedStatus.authenticated,false);
      assert.equal(forgedStatus.queueScope,undefined,'a supplied namespace cannot authenticate a forged session');
      const [signedPayload, signature] = cookie.split(';')[0].slice('navimuse_session='.length).split('.');
      const originalClaims = JSON.parse(Buffer.from(signedPayload, 'base64url').toString('utf8'));
      for (const injectedClaims of [{queueScope: first}, {sub: 'different-account'}, {sub: 'different-account', queueScope: first}]) {
        const alteredPayload = Buffer.from(JSON.stringify({...originalClaims, ...injectedClaims})).toString('base64url');
        const alteredCookie = `navimuse_session=${alteredPayload}.${signature}`;
        const attackHeaders = {cookie: alteredCookie, 'x-queue-scope': first};
        const status = await (await requestServer(`/api/settings/session?queueScope=${encodeURIComponent(first)}`, module.server, {headers: attackHeaders})).json();
        assert.equal(status.authenticated, false, 'editing a genuine signed cookie cannot impersonate another principal');
        assert.equal(status.queueScope, undefined, 'an injected valid namespace cannot rescue an invalid signature');
        const protectedRead = await requestServer('/api/navidrome/bootstrap', module.server, {headers: attackHeaders});
        assert.equal(protectedRead.status, 401, 'the forged payload cannot access protected music routes');
      }
      // Exercise the real authenticatedOverride=true login path, not just
      // GET /session. Success issues a new cookie but cannot authenticate
      // claims from the unverified incoming cookie in that same request.
      const loginAttackPayload = Buffer.from(JSON.stringify({...originalClaims,sub:'injected-principal',queueScope:injectedScope})).toString('base64url');
      const login = await requestServer(`/api/settings/login?queueScope=${injectedScope}`,module.server,{
        method:'POST',headers:{'content-type':'application/json',cookie:`navimuse_session=${loginAttackPayload}.${signature}`,'x-queue-scope':injectedScope},
        body:JSON.stringify({password:'correct horse battery'})
      });
      assert.equal(login.status,200);
      const loginStatus = await login.json();
      assert.equal(loginStatus.authenticated,true,'the valid password completes login');
      assert.equal(loginStatus.queueScope,undefined,'authenticatedOverride cannot supply an unverified queue principal');
      assert.equal(loginStatus.user,null,'the forged incoming principal is not projected into the response');
      const newlySignedCookie = login.headers.get('set-cookie');
      assert.ok(newlySignedCookie);
      const verifiedLogin = await (await requestServer('/api/settings/session',module.server,{headers:{cookie:newlySignedCookie}})).json();
      assert.equal(verifiedLogin.authenticated,true);
      assert.equal(verifiedLogin.queueScope,first,'only a subsequent request presenting the new signed cookie exposes the real namespace');
      assert.equal(await read(),first);
      assert.equal(first.includes('private-upstream'),false);
      scopes.push(first);
      const change = await requestServer('/api/settings/navidrome',module.server,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({url:upstreamUrl,username:'another-music-account',password:'another-password'})});
      assert.equal(change.status,200,await change.text());
      const changed = await read();
      assert.notEqual(changed,first,'changing the upstream account selects another namespace');
      const rotate = await requestServer('/api/settings/navidrome',module.server,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({url:upstreamUrl,username:'another-music-account',password:'rotated-password'})});
      assert.equal(rotate.status,200);
      assert.equal(await read(),changed,'credential rotation does not discard the same account queue');
      const logout = await requestServer('/api/settings/logout',module.server,{method:'POST',headers:{cookie}});
      assert.equal(logout.status,200);
      assert.equal(await read(),undefined,'a revoked signed session cannot recover a queue namespace');
    } finally {restore();}
  }
  assert.notEqual(scopes[0],scopes[1]);
});

test('HTTP playlist reorder validates a positional permutation and preserves duplicates with form POST', async () => {
  let entries = ['a', 'b', 'a', 'c'];
  let formSupported = true;
  let failWrite = false;
  const writes = [];
  const upstream = createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://upstream.test');
    let payload;
    if (url.pathname === '/rest/getOpenSubsonicExtensions.view') payload = {openSubsonicExtensions: formSupported ? [{name: 'formPost', versions: [1]}] : []};
    else if (url.pathname === '/rest/getPlaylist.view') payload = {playlist: {id: 'p', name: 'Keep name', comment: 'Keep comment', public: false, entry: entries.map(id => ({id}))}};
    else if (url.pathname === '/rest/createPlaylist.view') {
      if (failWrite) {res.writeHead(503); res.end(); return;}
      let body = ''; for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      writes.push({method: req.method, query: url.search, type: req.headers['content-type'], id: form.get('playlistId'), ids: form.getAll('songId'), hasName: form.has('name')});
      entries = form.getAll('songId');
      payload = {playlist: {id: 'p', name: 'Keep name', comment: 'Keep comment', public: false, entry: entries.map(id => ({id}))}};
    } else {res.writeHead(404); res.end(); return;}
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({'subsonic-response': {status: 'ok', ...payload}}));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const {module, restore} = await isolatedServerModule('playlist-reorder', {NAVIDROME_URL: `http://127.0.0.1:${upstream.address().port}`, NAVIDROME_USERNAME: 'tester', NAVIDROME_PASSWORD: 'secret'});
  try {
    const reorder = {version: 1, expectedSongIds: ['a', 'b', 'a', 'c'], order: [2, 0, 3, 1]};
    const path = '/api/navidrome/playlists/p';
    const send = (payload, headers) => requestServer(path, module.server, {method: 'PATCH', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(payload)});
    assert.equal((await send({reorder}, {'x-requested-with': 'NaviMuse'})).status, 401);
    const setup = await requestServer('/api/settings/admin', module.server, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({password: 'correct horse battery', setupToken: 'test-setup-token'})});
    const cookie = setup.headers.get('set-cookie');
    assert.equal((await send({reorder}, {cookie})).status, 403);
    const headers = {cookie, 'x-requested-with': 'NaviMuse'};
    for (const invalid of [{...reorder, version: 2}, {...reorder, order: [0, 0, 2, 3]}, {...reorder, order: [0, 1, 2, 4]}, {...reorder, expectedSongIds: ['a', null, 'a', 'c']}]) {
      assert.equal((await send({reorder: invalid}, headers)).status, 400);
    }
    assert.equal((await send({reorder, name: 'Other'}, headers)).status, 400);
    formSupported = false;
    assert.equal((await send({reorder}, headers)).status, 501);
    formSupported = true;
    entries = ['a', 'c', 'a', 'b'];
    assert.equal((await send({reorder}, headers)).status, 409);
    assert.equal(writes.length, 0);
    entries = [...reorder.expectedSongIds];
    const result = await send({reorder}, headers);
    assert.equal(result.status, 200);
    const playlist = (await result.json()).playlist;
    assert.deepEqual(playlist.entry.map(entry => entry.id), ['a', 'a', 'c', 'b']);
    assert.equal(playlist.name, 'Keep name');
    assert.equal(playlist.comment, 'Keep comment');
    assert.equal(playlist.public, false);
    assert.deepEqual(writes[0], {method: 'POST', query: '', type: 'application/x-www-form-urlencoded', id: 'p', ids: ['a', 'a', 'c', 'b'], hasName: false});
    // Large lists cross the old JSON-body and upstream URL/header limits.
    entries = Array.from({length: 3000}, (_, index) => String(index).padStart(32, '0'));
    const large = {version: 1, expectedSongIds: [...entries], order: entries.map((_, index) => entries.length - index - 1)};
    const largeResult = await send({reorder: large}, headers);
    assert.equal(largeResult.status, 200);
    assert.deepEqual(writes.at(-1).ids, [...large.expectedSongIds].reverse());
    const beforeFailure = [...entries];
    failWrite = true;
    assert.equal((await send({reorder: {...large, expectedSongIds: beforeFailure}}, headers)).status, 502);
    assert.deepEqual(entries, beforeFailure);
  } finally {restore(); await closeServer(upstream);}
});

test('HTTP in-flight genre browsing keeps its captured identity while owner Settings changes credentials',async()=>{
  let release,enteredResolve,held=false;const entered=new Promise(resolve=>{enteredResolve=resolve;});const seen=[];
  const upstream=createHttpServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');
    const send=payload=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':{status:'ok',...payload}}));};
    if(url.pathname.endsWith('/getGenres.view')) {
      seen.push(['genres',url.searchParams.get('u')]);
      if(!held) {held=true;release=()=>send({genres:{genre:[{value:'Jazz'}]}});enteredResolve();return;}
      return send({genres:{genre:[{value:'Jazz'}]}});
    }
    if(url.pathname.endsWith('/getAlbumList2.view')) {seen.push(['albums',url.searchParams.get('u')]);return send({albumList2:{album:[{id:'one'}]}});}
    send({});
  });upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const upstreamUrl=`http://127.0.0.1:${upstream.address().port}`;
  const {module,restore}=await isolatedServerModule('request-client-isolation',{NAVIDROME_URL:upstreamUrl,NAVIDROME_USERNAME:'original-user',NAVIDROME_PASSWORD:'original-password'});
  let pending;
  try {
    const setup=await requestServer('/api/settings/admin',module.server,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'})});
    assert.equal(setup.status,200);const cookie=setup.headers.get('set-cookie');
    module.server.listen(0,'127.0.0.1');await once(module.server,'listening');const origin=`http://127.0.0.1:${module.server.address().port}`;
    pending=fetch(origin+'/api/navidrome/library/genres?musicFolderId=folder',{headers:{cookie}});
    await Promise.race([entered,pending.then(()=>{throw new Error('Browse finished before reaching the upstream fixture');})]);
    const save=await fetch(origin+'/api/settings/navidrome',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({url:upstreamUrl,username:'replacement-user',password:'replacement-password'})});
    assert.equal(save.status,200);await save.json();release();release=undefined;
    const first=await pending;assert.equal(first.status,200);await first.json();
    const second=await fetch(origin+'/api/navidrome/library/genres?musicFolderId=folder',{headers:{cookie}});assert.equal(second.status,200);await second.json();
    assert.deepEqual(seen,[['genres','original-user'],['albums','original-user'],['genres','replacement-user'],['albums','replacement-user']]);
  } finally {
    release?.();if(pending) await pending.catch(()=>{});
    if(module.server.listening) {module.server.closeAllConnections();await closeServer(module.server);}
    restore();upstream.closeAllConnections();await closeServer(upstream);
  }
});

test('temporary cover failure does not cache the placeholder and the same URL recovers',async()=>{
 let failing=true,requests=0;
 const upstream=createHttpServer((req,res)=>{
  requests++;
  if(failing){res.writeHead(503,{'content-type':'text/plain','cache-control':'public, max-age=86400'});res.end('temporary upstream failure');return;}
  res.writeHead(200,{'content-type':'image/png'});res.end('fixture artwork');
 });upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const {module,restore}=await isolatedServerModule('artwork-failure-recovery',{NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'fixture',NAVIDROME_PASSWORD:'fixture'});
 try{
  const path='/api/navidrome/cover/same-album?size=600&artwork=v2';
  const fallback=await requestAuthenticatedServer(path,module.server);
  assert.equal(fallback.status,200);assert.equal(fallback.headers.get('cache-control'),'private, no-store');assert.match(await fallback.text(),/Missing album artwork/);
  failing=false;
  const recovered=await requestAuthenticatedServer(path,module.server);
  assert.equal(recovered.status,200);assert.equal(recovered.headers.get('content-type'),'image/png');assert.equal(await recovered.text(),'fixture artwork');
  assert.equal(recovered.headers.get('cache-control'),'public, max-age=86400');assert.equal(requests,2);
 }finally{restore();await closeServer(upstream);}
});

test('Internet radio creation validates links and forwards an authenticated Navidrome write', async () => {
 const calls=[];
 const upstream=createHttpServer((req,res)=>{const url=new URL(req.url,'http://localhost');calls.push({path:url.pathname,name:url.searchParams.get('name'),stream:url.searchParams.get('streamUrl')});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':{status:'ok'}}));});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const {module,restore}=await isolatedServerModule('radio-create',{NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'tester',NAVIDROME_PASSWORD:'secret'});
 try {
  const send=body=>requestAuthenticatedServer('/api/navidrome/radios',module.server,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse'},body:JSON.stringify(body)});
  const rejected=await send({name:'Local',streamUrl:'http://127.0.0.1/private'});assert.equal(rejected.status,400);assert.equal(calls.length,0);
  const created=await send({name:'Example FM',streamUrl:'https://radio.example.com/live.mp3',homePageUrl:''});assert.equal(created.status,201);assert.equal(calls.at(-1).path,'/rest/createInternetRadioStation.view');assert.equal(calls.at(-1).name,'Example FM');
 } finally {await restore();await new Promise(resolve=>upstream.close(resolve));}
});

test('radio feedback HTTP boundary authenticates, validates station and restores server values',async()=>{
 const upstream=createHttpServer((req,res)=>{
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({'subsonic-response':{status:'ok',internetRadioStations:{internetRadioStation:[{id:'station-one'}]}}}));
 });
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const {dataDir,module,restore}=await isolatedServerModule('radio-feedback',{NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'tester',NAVIDROME_PASSWORD:'secret'});
 try{
  assert.equal((await requestServer('/api/navidrome/radio-feedback',module.server)).status,401);
  const setup=await requestServer('/api/settings/admin',module.server,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'correct horse battery',setupToken:'test-setup-token'})});
  const cookie=setup.headers.get('set-cookie');
  const post=(id,extra={})=>requestServer('/api/navidrome/radio-feedback/'+encodeURIComponent(id),module.server,{method:'POST',headers:{cookie,'content-type':'application/json','x-requested-with':'NaviMuse',...extra},body:JSON.stringify({favorite:true,rating:4})});
  assert.equal((await post('radio:station-one',{'x-requested-with':''})).status,403);
  assert.equal((await post('radio:unknown')).status,404);
  assert.equal((await post('radio:station-one')).status,200);
  const result=await requestServer('/api/navidrome/radio-feedback',module.server,{headers:{cookie}});
  const data=await result.json();assert.equal(data.feedback['radio:station-one'].rating,4);assert.equal(data.feedback['radio:station-one'].favorite,true);
  assert.equal(result.headers.get('cache-control'),'no-store');
  const forged=await requestServer('/api/navidrome/radio-feedback?accountScope=queue-scope-v2:'+('f'.repeat(64)),module.server,{headers:{cookie}});
  assert.deepEqual((await forged.json()).feedback,data.feedback,'legacy scope is derived from session, not query');
  const stored=join(dataDir,'radio-feedback',readdirSync(join(dataDir,'radio-feedback'))[0]);
  writeFileSync(stored,'{private corrupt bytes');
  const failed=await requestServer('/api/navidrome/radio-feedback',module.server,{headers:{cookie}});
  assert.equal(failed.status,500);
  assert.equal((await failed.json()).error,'Saved station feedback is temporarily unavailable.');
  assert.equal((await post('radio:station-one')).status,500);
  assert.equal(readFileSync(stored,'utf8'),'{private corrupt bytes');
  assert.equal((await requestServer('/api/health',module.server)).status,200,'storage failure does not crash the server');
 }finally{upstream.close();restore();}
});

test('HTTP artist profile requires authentication and uses the configured Navidrome metadata provider',async()=>{
 const calls=[];const upstream=createHttpServer((req,res)=>{const url=new URL(req.url,'http://upstream');calls.push(url);assert.equal(url.searchParams.get('u'),'tester');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':{status:'ok',...(url.pathname.endsWith('getArtist.view')?{artist:{id:'artist',name:'Miles Davis',coverArt:'ar-artist'}}:url.pathname.endsWith('getArtistInfo2.view')?{artistInfo2:{biography:'<p>Jazz artist biography.</p>',lastFmUrl:'https://www.last.fm/music/Miles+Davis'}}:{topSongs:{song:[{id:'song',artistId:'artist',albumId:'album',title:'So What'}]}})}}));});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');const {module,restore}=await isolatedServerModule('artist-profile',{NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'tester',NAVIDROME_PASSWORD:'secret'});
 try{const denied=await requestServer('/api/navidrome/artists/artist/profile',module.server);assert.equal(denied.status,401);assert.equal(calls.length,0);const allowed=await requestAuthenticatedServer('/api/navidrome/artists/artist/profile',module.server);assert.equal(allowed.status,200);const value=await allowed.json();assert.equal(value.artist.coverArt,'ar-artist');assert.equal(value.popular[0].title,'So What');assert.equal(calls.find(url=>url.pathname.endsWith('getTopSongs.view')).searchParams.get('artist'),'Miles Davis');assert.deepEqual(value.biography,{text:'Jazz artist biography.',sourceUrl:'https://www.last.fm/music/Miles+Davis'});assert.equal(calls.find(url=>url.pathname.endsWith('getArtistInfo2.view')).searchParams.get('id'),'artist');assert.doesNotMatch(JSON.stringify(value),/secret|tester/);}finally{restore();await closeServer(upstream);}
});

test('HTTP Sonic mix preview authenticates, validates, resolves playable songs, and sanitizes upstream failures', async () => {
  const seen=[];let upstreamStatus=200;
  const audiomuse=createHttpServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    seen.push({path:req.url,auth:req.headers.authorization,body:JSON.parse(Buffer.concat(chunks))});
    res.writeHead(upstreamStatus,{'content-type':'application/json',...(upstreamStatus===302?{location:'http://untrusted.test'}:{})});
    res.end(JSON.stringify({results:[{item_id:'playable',embedding:[1,2]},{item_id:'missing'},{item_id:'playable'}],centroid:[1,2]}));
  });
  const navidrome=createHttpServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');const id=url.searchParams.get('id');
    const result=id==='missing'?{status:'failed',error:{code:70,message:'Not found'}}:{status:'ok',song:{id,title:'Warm piano',artist:'Test'},artist:{id,name:'Test'}};
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':result}));
  });
  audiomuse.listen(0,'127.0.0.1');navidrome.listen(0,'127.0.0.1');await Promise.all([once(audiomuse,'listening'),once(navidrome,'listening')]);
  const {module,restore}=await isolatedServerModule('sonic-mix',{
    AUDIOMUSE_URL:`http://127.0.0.1:${audiomuse.address().port}`,AUDIOMUSE_API_TOKEN:'mix-token',NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS:`127.0.0.1:${audiomuse.address().port}`,
    NAVIDROME_URL:`http://127.0.0.1:${navidrome.address().port}`,NAVIDROME_USERNAME:'test',NAVIDROME_PASSWORD:'test',NAVIMUSE_ALLOWED_NAVIDROME_HOSTS:`127.0.0.1:${navidrome.address().port}`
  });
  const path='/api/audiomuse/mixes/preview';
  const request=body=>requestAuthenticatedServer(path,module.server,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse'},body:JSON.stringify(body)});
  try {
    assert.equal((await requestServer(path,module.server,{method:'POST',body:'{}'})).status,401);
    assert.equal((await requestAuthenticatedServer(path,module.server,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
    assert.equal((await requestAuthenticatedServer(path,module.server)).status,405);
    assert.equal((await request({mode:'sound',query:'ok sound',server:'other'})).status,400);
    assert.equal(seen.length,0);
    const result=await request({mode:'sound',query:'warm piano',limit:3});assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{ok:true,tracks:[{id:'playable',title:'Warm piano',artist:'Test'}],partial:true,resolutionIncomplete:false});
    assert.deepEqual(seen[0],{path:'/api/clap/search',auth:'Bearer mix-token',body:{query:'warm piano',limit:6}});
    const items=[{id:'playable',type:'song',op:'ADD'},{id:'artist',type:'artist',op:'SUBTRACT'}];
    assert.equal((await request({mode:'blend',items,limit:3})).status,200);
    assert.deepEqual(seen[1].body,{items,n:6});assert.equal(seen[1].path,'/api/alchemy');
    assert.equal((await request({mode:'blend',items:[{id:'missing',type:'song',op:'ADD'}]})).status,404);
    assert.equal(seen.length,2,'Unavailable seeds are rejected before analysis');
    for(const status of [302,404,503]) {upstreamStatus=status;const failure=await request({mode:'sound',query:'warm piano'});assert.equal(failure.status,503);assert.doesNotMatch(JSON.stringify(await failure.json()),/centroid|embedding|token|untrusted/);}
  } finally {restore();await Promise.all([closeServer(audiomuse),closeServer(navidrome)]);}
});

test('cover IDs containing a disc separator are decoded exactly once before the upstream request',async()=>{
 const ids=[];const upstream=createHttpServer((req,res)=>{ids.push(new URL(req.url,'http://fixture').searchParams.get('id'));res.writeHead(200,{'content-type':'image/jpeg'});res.end('album cover');});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const {module,restore}=await isolatedServerModule('disc-cover-id',{NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'fixture',NAVIDROME_PASSWORD:'fixture'});
 try{
  const response=await requestAuthenticatedServer('/api/navidrome/cover/dc-album%3A1_0?size=1000&artwork=v3',module.server);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(await response.text(),'album cover');assert.deepEqual(ids,['dc-album:1_0']);
 }finally{restore();await closeServer(upstream);}
});

test('personalized mix HTTP uses saved credentials, caches only resolved tracks and retains the mix on failure',async()=>{
 const seen=[];let failed=false;
 const analysis=createHttpServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;seen.push(JSON.parse(body));res.writeHead(failed?503:200,{'content-type':'application/json'});res.end(JSON.stringify([{item_id:'one',embedding:[42]},{item_id:'missing'}]));});
 const music=createHttpServer((req,res)=>{const id=new URL(req.url,'http://fixture').searchParams.get('id');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':id==='missing'?{status:'failed',error:{code:70,message:'Not found'}}:{status:'ok',song:{id,title:'Personal track',artist:'Artist'}}}));});
 analysis.listen(0,'127.0.0.1');music.listen(0,'127.0.0.1');await Promise.all([once(analysis,'listening'),once(music,'listening')]);
 const {module,restore}=await isolatedServerModule('personalized-mix',{
  AUDIOMUSE_URL:`http://127.0.0.1:${analysis.address().port}`,NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS:`127.0.0.1:${analysis.address().port}`,
  NAVIDROME_URL:`http://127.0.0.1:${music.address().port}`,NAVIDROME_USERNAME:'personal-user',NAVIDROME_PASSWORD:'private-fixture',NAVIMUSE_ALLOWED_NAVIDROME_HOSTS:`127.0.0.1:${music.address().port}`
 });
 const path='/api/navidrome/personalized-mix';
 const refresh=body=>requestAuthenticatedServer(path,module.server,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse'},body:JSON.stringify(body)});
 try{
  assert.equal((await requestServer(path,module.server)).status,401);
  assert.equal((await requestAuthenticatedServer(path,module.server,{method:'POST',body:'{}'})).status,403);
  assert.equal((await refresh({navidrome_user:'someone-else'})).status,400);assert.equal(seen.length,0);
  const response=await refresh({});assert.equal(response.status,200);const result=await response.json();
  assert.deepEqual(result.mix.tracks,[{id:'one',title:'Personal track',artist:'Artist'}]);
  assert.deepEqual(seen,[{n:100,navidrome_user:'personal-user',navidrome_password:'private-fixture'}]);
  assert.doesNotMatch(JSON.stringify(result),/embedding|private-fixture|personal-user/);
  const cached=await requestAuthenticatedServer(path,module.server);assert.match(cached.headers.get('cache-control'),/private/);assert.deepEqual((await cached.json()).mix,result.mix);assert.equal(seen.length,1);
  failed=true;assert.equal((await refresh({})).status,503);
  assert.deepEqual((await (await requestAuthenticatedServer(path,module.server)).json()).mix,result.mix);
 }finally{restore();await Promise.all([closeServer(analysis),closeServer(music)]);}
});

test('migrated Navidrome keeps cached mix references playable and grants scoped native ID aliases',async()=>{
 const old='0123456789abcdef0123456789abcdef',current='0296TIIbB3u904riPYGPJJ',seen=[];
 const music=createHttpServer((req,res)=>{
  const url=new URL(req.url,'http://fixture');seen.push(url);
  assert.equal(url.searchParams.get('u'),'listener');
  if(url.pathname.endsWith('/stream.view')) {
   assert.equal(url.searchParams.get('id'),current);assert.equal(url.searchParams.get('format'),'opus');
   res.writeHead(200,{'content-type':'audio/ogg'});res.end('OggS fixture');return;
  }
  if(url.pathname.endsWith('/getSong.view'))assert.equal(url.searchParams.get('id'),current);
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({'subsonic-response':{status:'ok',type:'navidrome',serverVersion:'0.64.0',...(url.pathname.endsWith('/getSong.view')?{song:{id:current,title:'Retained mix track',artist:'Artist'}}:{})}}));
 });
 const analysis=createHttpServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify([{item_id:old}]));});
 music.listen(0,'127.0.0.1');analysis.listen(0,'127.0.0.1');await Promise.all([once(music,'listening'),once(analysis,'listening')]);
 const {module,restore}=await isolatedServerModule('canonical-mix',{
  NAVIDROME_URL:`http://127.0.0.1:${music.address().port}`,NAVIDROME_USERNAME:'listener',NAVIDROME_PASSWORD:'fixture',
  AUDIOMUSE_URL:`http://127.0.0.1:${analysis.address().port}`,NAVIMUSE_ALLOWED_AUDIOMUSE_HOSTS:`127.0.0.1:${analysis.address().port}`
 });
 try {
  const generated=await requestAuthenticatedServer('/api/navidrome/personalized-mix',module.server,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse'},body:'{}'});
  assert.equal(generated.status,200);assert.equal((await generated.json()).mix.tracks[0].id,old);
  const before=seen.length;
  const cached=await (await requestAuthenticatedServer('/api/navidrome/personalized-mix',module.server)).json();
  assert.equal(cached.mix.tracks[0].id,old);assert.equal(seen.length,before,'cached mixes remain available without network revalidation');
  const song=await requestAuthenticatedServer(`/api/navidrome/songs/${old}`,module.server);
  assert.equal(song.status,200);assert.equal((await song.json()).song.id,old);
  const stream=await requestAuthenticatedServer(`/api/navidrome/stream/${old}?format=opus&maxBitRate=128`,module.server);
  assert.equal(stream.status,200);assert.equal(await stream.text(),'OggS fixture');
  const access=await requestAuthenticatedServer('/api/navidrome/offline-access',module.server);
  assert.equal((await access.json()).navidromeIdFormat,'canonical-v1');
 }finally{restore();await Promise.all([closeServer(music),closeServer(analysis)]);}
});

test('ListenBrainz connection routes require authentication, matching scope and write origin',async()=>{
 const {module,restore}=await isolatedServerModule('listenbrainz-http');
 try{
  const base='/api/navidrome/listenbrainz/connection';
  assert.equal((await requestServer(base,module.server)).status,401);
  const session=await (await requestAuthenticatedServer('/api/settings/session',module.server)).json();
  assert.equal((await requestAuthenticatedServer(base+'?accountScope=another',module.server)).status,409);
  const path=base+'?accountScope='+encodeURIComponent(session.queueScope);
  assert.deepEqual(await (await requestAuthenticatedServer(path,module.server)).json(),{username:'',revision:0});
  const body=JSON.stringify({username:'',revision:0});
  assert.equal((await requestAuthenticatedServer(path,module.server,{method:'POST',headers:{'content-type':'application/json'},body})).status,403);
  const saved=await requestAuthenticatedServer(path,module.server,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'NaviMuse'},body});
  assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
 }finally{restore();}
});

test('HLS routes stay authenticated, scope-bound and default off; writes require origin',async()=>{
 const {module,restore}=await isolatedServerModule('hls-http');
 try{
  const base='/api/navidrome/hls/';
  assert.equal((await requestServer(base+'capabilities',module.server)).status,401);
  const session=await (await requestAuthenticatedServer('/api/settings/session',module.server)).json();
  assert.equal((await requestAuthenticatedServer(base+'capabilities?accountScope=another',module.server)).status,409);
  const suffix='?accountScope='+encodeURIComponent(session.queueScope);
  assert.deepEqual(await (await requestAuthenticatedServer(base+'capabilities'+suffix,module.server)).json(),{enabled:false});
  const init={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({songId:'song'})};
  assert.equal((await requestAuthenticatedServer(base+'sessions'+suffix,module.server,init)).status,403);
  init.headers['x-requested-with']='NaviMuse';const response=await requestAuthenticatedServer(base+'sessions'+suffix,module.server,init);
  assert.equal(response.status,202);assert.deepEqual(await response.json(),{state:'disabled'});
 }finally{restore();}
});
