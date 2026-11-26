import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, apiJson, apiNavigationUrl, apiRequestUrl, configuredBffOrigin, nativeFirstPartyBffRedirectTarget, sessionRequiredEvent } from '../src/services/apiClient.js';
import {
  coverArtPath,
  navidromeFeedback,
  navidromeArtists,
  navidromeGenres,
  navidromeLibraryAlbums,
  navidromeLibraryBrowse,
  navidromeLyrics,
  navidromePlaylistDetail,
  navidromePlaylists,
  navidromeRadios,
  navidromeSearch,
  radioStreamPath,
  scopedLibraryPath,
  streamPath
} from '../src/services/navidromeService.js';
import * as settingsService from '../src/services/settingsService.js';

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json' }
  });
}

test('apiFetch dispatches session-required on 401 responses', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events = new EventTarget();
  let dispatched = false;
  globalThis.window = {
    dispatchEvent(event) {
      dispatched = events.dispatchEvent(event);
      return dispatched;
    }
  };
  globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
      this.detail = options.detail;
    }
  };
  events.addEventListener(sessionRequiredEvent, () => {
    dispatched = true;
  });
  globalThis.fetch = async () => jsonResponse({ error: 'locked' }, { status: 401 });

  try {
    const response = await apiFetch('/api/settings');
    assert.equal(response.status, 401);
    assert.equal(dispatched, true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('apiJson throws server error messages for non-ok JSON responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ error: 'specific failure' }, { status: 503 });

  try {
    await assert.rejects(
      () => apiJson('/api/example', {}, 'fallback failure'),
      /specific failure/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('navidromeLyrics uses the authenticated BFF route without exposing upstream credentials', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return jsonResponse({ songId: 'song/one', status: 'ready', synced: false, lines: [{ startMs: null, value: 'Words' }] });
  };
  try {
    const payload = await navidromeLyrics('song/one');
    assert.equal(payload.status, 'ready');
    assert.equal(calls[0].input, '/api/navidrome/lyrics/song%2Fone');
    assert.equal(calls[0].init.headers?.authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('api client resolves native BFF origins explicitly', () => {
  const originalOrigin = globalThis.__NAVIMUSE_BFF_ORIGIN__;
  try {
    delete globalThis.__NAVIMUSE_BFF_ORIGIN__;
    assert.equal(configuredBffOrigin(), '');
    assert.equal(apiRequestUrl('/api/settings'), '/api/settings');

    globalThis.__NAVIMUSE_BFF_ORIGIN__ = 'https://navimuse.example.test/';
    assert.equal(configuredBffOrigin(), 'https://navimuse.example.test');
    assert.equal(apiRequestUrl('/api/settings/session'), 'https://navimuse.example.test/api/settings/session');
    assert.equal(apiNavigationUrl('/api/auth/login'), 'https://navimuse.example.test/api/auth/login');
    assert.equal(apiRequestUrl('/assets/index.js'), '/assets/index.js');

    globalThis.__NAVIMUSE_BFF_ORIGIN__ = 'file:///tmp/navimuse';
    assert.equal(configuredBffOrigin(), '');
    assert.equal(apiRequestUrl('/api/settings'), '/api/settings');
  } finally {
    if (originalOrigin === undefined) {
      delete globalThis.__NAVIMUSE_BFF_ORIGIN__;
    } else {
      globalThis.__NAVIMUSE_BFF_ORIGIN__ = originalOrigin;
    }
  }
});

test('apiFetch sends session cookies to a configured native BFF without embedding service credentials', async () => {
  const originalFetch = globalThis.fetch;
  const originalOrigin = globalThis.__NAVIMUSE_BFF_ORIGIN__;
  const calls = [];
  globalThis.__NAVIMUSE_BFF_ORIGIN__ = 'https://navimuse.example.test';
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return jsonResponse({ ok: true });
  };

  try {
    const response = await apiFetch('/api/settings/session', { headers: { accept: 'application/json' } });
    assert.equal(response.status, 200);
    assert.equal(calls[0].input, 'https://navimuse.example.test/api/settings/session');
    assert.equal(calls[0].init.credentials, 'include');
    assert.equal(calls[0].init.headers.accept, 'application/json');
    assert.equal(calls[0].init.headers.authorization, undefined);
    assert.equal(calls[0].init.headers['x-navidrome-password'], undefined);
    assert.equal(calls[0].init.headers['x-audiomuse-token'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOrigin === undefined) {
      delete globalThis.__NAVIMUSE_BFF_ORIGIN__;
    } else {
      globalThis.__NAVIMUSE_BFF_ORIGIN__ = originalOrigin;
    }
  }
});

test('native first-party redirect moves packaged Tauri launches onto the BFF origin for session recovery', () => {
  const originalOrigin = globalThis.__NAVIMUSE_BFF_ORIGIN__;
  try {
    globalThis.__NAVIMUSE_BFF_ORIGIN__ = 'https://navimuse.example.test/';
    assert.equal(nativeFirstPartyBffRedirectTarget({
      protocol: 'tauri:',
      pathname: '/',
      search: '?view=settings',
      hash: '#player'
    }), 'https://navimuse.example.test/?view=settings#player');

    assert.equal(nativeFirstPartyBffRedirectTarget({
      protocol: 'https:',
      pathname: '/',
      search: '?view=settings',
      hash: ''
    }), '');

    delete globalThis.__NAVIMUSE_BFF_ORIGIN__;
    assert.equal(nativeFirstPartyBffRedirectTarget({
      protocol: 'tauri:',
      pathname: '/',
      search: '',
      hash: ''
    }), '');
  } finally {
    if (originalOrigin === undefined) {
      delete globalThis.__NAVIMUSE_BFF_ORIGIN__;
    } else {
      globalThis.__NAVIMUSE_BFF_ORIGIN__ = originalOrigin;
    }
  }
});

test('Navidrome library paths apply music folder scoping predictably', () => {
  assert.equal(
    scopedLibraryPath('/api/navidrome/search?q=jazz', 'folder 7'),
    '/api/navidrome/search?q=jazz&musicFolderId=folder+7'
  );
  assert.equal(
    scopedLibraryPath('/api/navidrome/bootstrap', ''),
    '/api/navidrome/bootstrap'
  );
});

test('Navidrome media URL builders preserve endpoint contracts', () => {
  assert.equal(coverArtPath('cover/id', '1000'), '/api/navidrome/cover/cover%2Fid?size=1000&artwork=v3');
  assert.equal(coverArtPath('cover/id', '1200'), '/api/navidrome/cover/cover%2Fid?size=600&artwork=v3');
  assert.equal(
    streamPath('song/id', { format: 'opus', maxBitRate: '128' }),
    '/api/navidrome/stream/song%2Fid?format=opus&maxBitRate=128'
  );
  assert.equal(radioStreamPath('station/id'), '/api/navidrome/radios/station%2Fid/stream');
});

test('Navidrome service methods call stable endpoints and methods', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return jsonResponse({ ok: true, feedback: { rating: 5 } });
  };

  try {
    await navidromeSearch('Miles Davis', 'jazz');
    await navidromeLibraryBrowse('albums', { sort: 'recent', musicFolderId: 'jazz' });
    await navidromeLibraryAlbums({ offset: '20', limit: '40' });
    await navidromePlaylists('jazz');
    await navidromePlaylistDetail('playlist/id');
    await navidromeRadios();
    await navidromeGenres('jazz');
    await navidromeArtists('jazz');
    await navidromeFeedback('song-1', { favorite: true, rating: 9 });

    assert.equal(calls[0].input, '/api/navidrome/search?q=Miles+Davis&musicFolderId=jazz');
    assert.equal(calls[1].input, '/api/navidrome/library/albums?sort=recent&musicFolderId=jazz');
    assert.equal(calls[2].input, '/api/navidrome/library/albums?offset=20&limit=40');
    assert.equal(calls[3].input, '/api/navidrome/library/playlists?musicFolderId=jazz');
    assert.equal(calls[4].input, '/api/navidrome/playlists/playlist%2Fid');
    assert.equal(calls[5].input, '/api/navidrome/radios');
    assert.equal(calls[6].input, '/api/navidrome/library/genres?musicFolderId=jazz');
    assert.equal(calls[7].input, '/api/navidrome/library/artists?musicFolderId=jazz');
    assert.equal(calls[8].input, '/api/navidrome/feedback/song-1');
    assert.equal(calls[8].init.method, 'POST');
    assert.equal(calls[8].init.headers['x-requested-with'], 'NaviMuse');
    assert.deepEqual(JSON.parse(calls[8].init.body), { favorite: true, rating: 5 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('settings service uses the BFF settings boundary', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    return jsonResponse({ ok: true });
  };

  try {
    await settingsService.settings();
    await settingsService.savePreferences({ playback: { continueThroughQueue: false } });
    await settingsService.clearAudiomuse();

    assert.equal(calls[0].input, '/api/settings');
    assert.equal(calls[1].input, '/api/settings');
    assert.equal(calls[1].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[1].init.body), { preferences: { playback: { continueThroughQueue: false } } });
    assert.equal(calls[2].input, '/api/settings/audiomuse');
    assert.equal(calls[2].init.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('logout sends the write-origin header required by the speaker/auth boundary and preserves failures', async () => {
  const originalFetch=globalThis.fetch;
  try {
    const calls=[];
    globalThis.fetch=async(path,options)=>{
      calls.push(path);
      assert.equal(options.method,'POST');
      assert.equal(options.headers['x-requested-with'],'NaviMuse');
      return jsonResponse({ok:true});
    };
    await settingsService.logoutAdmin('oidc');
    await settingsService.logoutAdmin('password');
    assert.deepEqual(calls,['/api/auth/logout','/api/settings/logout']);
    globalThis.fetch=async()=>jsonResponse({error:'Remote logout could not be completed'},{status:503});
    await assert.rejects(settingsService.logoutAdmin('oidc'),/Remote logout/);
  } finally {globalThis.fetch=originalFetch;}
});
