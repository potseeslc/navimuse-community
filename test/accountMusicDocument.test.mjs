import test from 'node:test';
import assert from 'node:assert/strict';

test('document music scope is immutable, tags media and requests, and preserves failure bodies', async () => {
  const client = await import('../src/services/apiClient.js');
  const a = 'queue-scope-v2:'+'a'.repeat(64), b = 'queue-scope-v2:'+'b'.repeat(64);
  assert.equal(client.apiRequestUrl('/api/navidrome/albums'),'/api/navidrome/albums');
  assert.throws(()=>client.initializeAccountMusicScope(null));
  assert.equal(client.initializeAccountMusicScope(a),true);
  assert.equal(client.initializeAccountMusicScope(a),true);
  assert.equal(client.initializeAccountMusicScope(b),false);
  assert.equal(new URL(client.apiRequestUrl('/api/navidrome/stream?id=one'),'http://fixture').searchParams.get('accountScope'),a);
  assert.throws(()=>client.apiRequestUrl('/api/navidrome/albums?accountScope='+b),/mismatch/);
  assert.equal(client.apiRequestUrl('/api/config'),'/api/config');
  const media = await import('../src/services/navidromeService.js');
  for (const path of [media.coverArtPath('cover',600), media.streamPath('song',{}), media.radioStreamPath('station')]) {
    assert.equal(new URL(path,'http://fixture').searchParams.get('accountScope'),a);
  }
  const saved = {fetch:globalThis.fetch,window:globalThis.window,CustomEvent:globalThis.CustomEvent};
  let events=0, requested;
  globalThis.window={dispatchEvent:()=>events++};
  globalThis.CustomEvent=class {constructor(type){this.type=type;}};
  globalThis.fetch=async url=>{requested=url;return new Response(JSON.stringify({code:'ACCOUNT_SCOPE_CHANGED'}),{status:409});};
  try {
    const response=await client.apiFetch('/api/navidrome/albums');
    assert.equal(new URL(requested,'http://fixture').searchParams.get('accountScope'),a);
    assert.equal(events,1);
    assert.deepEqual(await response.json(),{code:'ACCOUNT_SCOPE_CHANGED'});
    globalThis.fetch=async()=>new Response('{}',{status:409});
    await client.apiFetch('/api/navidrome/albums');assert.equal(events,1);
  } finally {Object.assign(globalThis,saved);}
});
