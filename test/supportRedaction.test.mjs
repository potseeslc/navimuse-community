import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSupportText } from '../scripts/support-redaction.mjs';

test('support diagnostics redaction removes secrets without corrupting JSON text', () => {
  const source = JSON.stringify({
    url: 'https://navimuse.example/api?token=url-secret&item_id=track-secret',
    auth: 'authorization: Bearer bearer-secret',
    cookie: 'cookie: navimuse_session=session-secret; other=value',
    env: 'NAVIDROME_PASSWORD=navidrome-secret AUDIOMUSE_API_TOKEN=audio-secret'
  });
  const redacted = redactSupportText(source);
  assert.equal(redacted.includes('url-secret'), false);
  assert.equal(redacted.includes('track-secret'), false);
  assert.equal(redacted.includes('bearer-secret'), false);
  assert.equal(redacted.includes('session-secret'), false);
  assert.equal(redacted.includes('navidrome-secret'), false);
  assert.equal(redacted.includes('audio-secret'), false);
  assert.doesNotThrow(() => JSON.parse(redacted));
  assert.match(redacted, /token=\[redacted\]&item_id=\[redacted\]/);
  assert.match(redactSupportText('https://example.test/?u=page&p=2&t=tab&s=asc'), /\?u=page&p=2&t=tab&s=asc/);
});

test('support diagnostics redaction handles lowercase secret keys outside URLs', () => {
  const redacted = redactSupportText('password=secret token:abc session = cookie-secret');
  assert.equal(redacted.includes('secret'), false);
  assert.match(redacted, /password=\[redacted\]/);
  assert.match(redacted, /token:\[redacted\]/);
  assert.match(redacted, /session\s*=\s*\[redacted\]/);
});

test('support diagnostics redaction strips URL userinfo credentials', () => {
  const redacted = redactSupportText('origin=https://user:pass@example.test/api?token=query-secret\nsafe=https://example.test/path');
  assert.equal(redacted.includes('user:pass'), false);
  assert.equal(redacted.includes('query-secret'), false);
  assert.match(redacted, /https:\/\/\[redacted\]@example\.test\/api\?token=\[redacted\]/);
  assert.match(redacted, /safe=https:\/\/example\.test\/path/);
});

test('support diagnostics redaction handles hyphenated free-text secret keys', () => {
  const redacted = redactSupportText('API-TOKEN=hyphen-secret my-secret: another-secret\nSAFE-VALUE=visible');
  assert.equal(redacted.includes('hyphen-secret'), false);
  assert.equal(redacted.includes('another-secret'), false);
  assert.match(redacted, /API-TOKEN=\[redacted\]/);
  assert.match(redacted, /my-secret:\s*\[redacted\]/);
  assert.match(redacted, /SAFE-VALUE=visible/);
});

test('support diagnostics redaction handles unquoted secret values with spaces', () => {
  const redacted = redactSupportText('PASSWORD=my secret value\nNEXT_VISIBLE=value');
  assert.equal(redacted.includes('my secret value'), false);
  assert.match(redacted, /^PASSWORD=\[redacted\]\nNEXT_VISIBLE=value$/);
});

test('support diagnostics redaction handles delimiter characters inside free-text secrets', () => {
  const redacted = redactSupportText('PASSWORD=my;secret,with&delimiters NEXT_VISIBLE=value\nNAVIMUSE_SETUP_TOKEN=abc;def');
  for (const secret of ['my;secret,with&delimiters', 'abc;def']) {
    assert.equal(redacted.includes(secret), false);
  }
  assert.match(redacted, /^PASSWORD=\[redacted\]\nNAVIMUSE_SETUP_TOKEN=\[redacted\]$/);
});

test('support diagnostics redaction handles quoted free-text secrets', () => {
  const redacted = redactSupportText('PASSWORD="quoted secret" visible=text\nTOKEN=\'single quoted secret\' safe=value');
  assert.equal(redacted.includes('quoted secret'), false);
  assert.equal(redacted.includes('single quoted secret'), false);
  assert.match(redacted, /^PASSWORD=\[redacted\] visible=text\nTOKEN=\[redacted\] safe=value$/);
});

test('support diagnostics redaction handles multiline quoted free-text secrets', () => {
  const redacted = redactSupportText('PASSWORD="line one\nline two" visible=text\nSAFE=value');
  assert.equal(redacted.includes('line one'), false);
  assert.equal(redacted.includes('line two'), false);
  assert.match(redacted, /^PASSWORD=\[redacted\] visible=text\nSAFE=value$/);
});

test('support diagnostics redaction handles arbitrary authorization schemes', () => {
  const redacted = redactSupportText('authorization: Digest digest-secret\nAuthorization: Custom custom secret\nauthorization: "Bearer quoted-auth-secret"');
  assert.equal(redacted.includes('digest-secret'), false);
  assert.equal(redacted.includes('custom secret'), false);
  assert.equal(redacted.includes('quoted-auth-secret'), false);
  assert.match(redacted, /^authorization: \[redacted\]\nAuthorization: \[redacted\]\nauthorization: \[redacted\]$/);
});

test('support diagnostics redaction handles JSON secret keys', () => {
  const source = JSON.stringify({
    password: 'lower-secret',
    api_key: 'api-key-secret',
    apiToken: 'mixed-secret',
    nested: { client_secret: 'client-secret' },
    authorization: 'Bearer json-auth-secret',
    safe: 'visible'
  });
  const redacted = redactSupportText(source);
  const parsed = JSON.parse(redacted);
  assert.equal(parsed.password, '[redacted]');
  assert.equal(parsed.api_key, '[redacted]');
  assert.equal(parsed.apiToken, '[redacted]');
  assert.equal(parsed.nested.client_secret, '[redacted]');
  assert.equal(parsed.authorization, '[redacted]');
  assert.equal(parsed.safe, 'visible');
  assert.equal(redacted.includes('lower-secret'), false);
  assert.equal(redacted.includes('api-key-secret'), false);
  assert.equal(redacted.includes('mixed-secret'), false);
  assert.equal(redacted.includes('client-secret'), false);
  assert.equal(redacted.includes('json-auth-secret'), false);
});

test('support diagnostics redaction handles numeric JSON secret values', () => {
  const redacted = redactSupportText('{"token":1234567890,"api_key":-42,"safeCount":123}');
  const parsed = JSON.parse(redacted);
  assert.equal(parsed.token, '[redacted]');
  assert.equal(parsed.api_key, '[redacted]');
  assert.equal(parsed.safeCount, 123);
  assert.equal(redacted.includes('1234567890'), false);
  assert.equal(redacted.includes('-42'), false);
});

test('support diagnostics redaction handles Atlas and AudioMuse item identifiers', () => {
  const source = JSON.stringify({
    url: 'https://navimuse.example/api?track_id=url-track&pointId=url-point',
    item_id: 'json-item',
    providerTrackId: 'json-provider-track',
    nested: { atlas_point_id: 'json-point' },
    freeText: 'AudioMuse itemId=free-item raw_track_id:free-track song_id=song-secret'
  });
  const redacted = redactSupportText(source);
  const parsed = JSON.parse(redacted);
  assert.match(parsed.url, /track_id=\[redacted\]&pointId=\[redacted\]/);
  assert.equal(parsed.item_id, '[redacted]');
  assert.equal(parsed.providerTrackId, '[redacted]');
  assert.equal(parsed.nested.atlas_point_id, '[redacted]');
  assert.match(parsed.freeText, /itemId=\[redacted\]/);
  assert.match(parsed.freeText, /raw_track_id[:=]\[redacted\]/);
  assert.match(parsed.freeText, /song_id=\[redacted\]/);
  for (const secret of ['url-track', 'url-point', 'json-item', 'json-provider-track', 'json-point', 'free-item', 'free-track', 'song-secret']) {
    assert.equal(redacted.includes(secret), false);
  }
});
