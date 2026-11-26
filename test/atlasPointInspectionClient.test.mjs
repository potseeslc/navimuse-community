import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectAtlasPoint } from '../src/services/atlasPointInspectionService.js';
import { createPublicResolutionError } from '../shared/sonic-atlas/index.js';

const identity = { contractVersion: 'sonic-atlas/v1', projectionId: 'p', projectionVersion: 'v', projectionDigest: `sha256:${'a'.repeat(64)}` };
const input = { identity, pointId: 'point', requestId: 'click' };
const response = () => ({ ...input, contractVersion: 'sonic-atlas/v1', kind: 'atlas-point-inspection', coordinate: {x: 0.25, y: -0.75}, playback: { trackRef: 'signed.reference', title: 'Track', artist: 'Artist' } });

test('inspection sends only the versioned point identity through authenticated BFF transport', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/atlas/points/inspect');
    assert.equal(init.credentials, 'include');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['x-request-id'], 'click');
    assert.equal(init.headers['x-requested-with'], 'NaviMuse');
    assert.deepEqual(JSON.parse(init.body), { ...input, contractVersion: 'sonic-atlas/v1', kind: 'atlas-point-inspection-request' });
    return Response.json(response());
  });
  const result = await inspectAtlasPoint(input);
  assert.equal(result.playback.trackRef, 'signed.reference');
  assert.ok(Object.isFrozen(result.playback));
});

test('inspection rejects a response for another request, point or projection', async t => {
  let payload;
  t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
  for (const mutate of [r => r.requestId = 'old', r => r.pointId = 'other', r => r.identity = {...identity, projectionVersion: 'old'}, r => r.identity = {...identity, projectionDigest: `sha256:${'b'.repeat(64)}`}, r => r.playback.streamUrl = 'https://private/stream']) {
    payload = response(); mutate(payload);
    await assert.rejects(inspectAtlasPoint(input), /could not be loaded/);
  }
});

test('inspection preserves only correlated public failure details', async t => {
  let payload = createPublicResolutionError({requestId: 'click', code: 'POINT_NOT_PLAYABLE'});
  t.mock.method(globalThis, 'fetch', async () => Response.json(payload, {status: 404}));
  await assert.rejects(inspectAtlasPoint(input), e => e.status === 404 && e.atlas?.code === 'POINT_NOT_PLAYABLE');
  payload = createPublicResolutionError({requestId: 'old', code: 'POINT_NOT_FOUND'});
  await assert.rejects(inspectAtlasPoint(input), e => !e.atlas);
  payload = {error: 'private upstream credentials'};
  await assert.rejects(inspectAtlasPoint(input), e => !e.message.includes('private') && !e.payload && !e.atlas);
});

test('cancellation rejects promptly even when transport ignores its signal and later completes', async t => {
  let finish; let calls = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const controller = new AbortController();
  const pending = inspectAtlasPoint({...input, signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, e => e.name === 'AbortError');
  finish(Response.json(response()));
  await assert.rejects(inspectAtlasPoint({...input, signal: controller.signal}), e => e.name === 'AbortError');
  assert.equal(calls, 1);
});

test('invalid point identity fails before network access', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected fetch'); });
  await assert.rejects(inspectAtlasPoint({...input, pointId: '../private'}), TypeError);
  assert.equal(fetch.mock.callCount(), 0);
});
