import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAtlasPointInspectionRequest, parseAtlasPointInspection, validateAtlasPointInspectionAgainstRequest, createPublicResolutionError } from '../shared/sonic-atlas/index.js';
const identity = { contractVersion: 'sonic-atlas/v1', projectionId: 'projection-one', projectionVersion: 'version-one', projectionDigest: `sha256:${'a'.repeat(64)}` };
const request = () => ({ contractVersion: 'sonic-atlas/v1', kind: 'atlas-point-inspection-request', requestId: 'click-one', identity: {...identity}, pointId: 'point-one' });
const response = () => ({ ...request(), kind: 'atlas-point-inspection', coordinate: {x: -0.25, y: 0.75}, playback: {trackRef: 'opaque.signed-reference', title: 'A track', artist: 'An artist', album: 'An album', durationSeconds: 200, artworkRef: 'art-one'} });

test('point inspection preserves exact coordinates and freezes correlated safe metadata', () => {
  const value = response(), parsed = validateAtlasPointInspectionAgainstRequest(value, request());
  assert.deepEqual(parsed.coordinate, value.coordinate);
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.coordinate) && Object.isFrozen(parsed.playback));
  value.playback.title = 'changed';
  assert.equal(parsed.playback.title, 'A track');
  assert.ok(Object.isFrozen(parseAtlasPointInspectionRequest(request()).identity));
});

test('inspection rejects a stale response for another click, point or projection', () => {
  for (const mutate of [r => r.requestId = 'click-two', r => r.pointId = 'point-two', r => r.identity.projectionId = 'projection-two', r => r.identity.projectionVersion = 'version-two', r => r.identity.projectionDigest = `sha256:${'b'.repeat(64)}`]) {
    const value = response(); mutate(value);
    assert.throws(() => validateAtlasPointInspectionAgainstRequest(value, request()), /does not match request/);
  }
});

test('inspection rejects private fields, invented request coordinates and invalid metadata', () => {
  for (const mutate of [r => r.coordinate = {x: 0,y: 0}, r => r.trackId = 'raw-upstream-id', r => r.pointId = '../escape', r => r.identity.projectionDigest = 'bad', r => delete r.requestId]) {
    const value = request(); mutate(value); assert.throws(() => parseAtlasPointInspectionRequest(value), TypeError);
  }
  for (const mutate of [r => r.coordinate.x = NaN, r => r.coordinate.y = Infinity, r => r.playback.streamUrl = 'https://private/stream', r => r.playback.trackRef = 'https://private/stream', r => r.playback.durationSeconds = -1, r => r.playback.title = 'x'.repeat(301), r => r.playback.credentials = {password:'secret'}, r => r.extra = true]) {
    const value = response(); mutate(value); assert.throws(() => parseAtlasPointInspection(value), TypeError);
  }
  const value = response(); let getterRan = false;
  Object.defineProperty(value.playback, 'title', {enumerable:true, get(){ getterRan = true; return 'unsafe'; }});
  assert.throws(() => parseAtlasPointInspection(value), /accessor/);
  assert.equal(getterRan, false);
});

test('point missing and unplayable outcomes use fixed public errors', () => {
  for (const code of ['POINT_NOT_FOUND', 'POINT_NOT_PLAYABLE']) {
    const error = createPublicResolutionError({requestId:'click-one',code});
    assert.equal(error.code,code); assert.equal(error.retryable,false);
    assert.equal(error.kind,'atlas-resolution-error');
  }
});
