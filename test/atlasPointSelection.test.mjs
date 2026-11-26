import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtlasPointSelection } from '../src/atlasPointSelection.js';
import { createPublicResolutionError } from '../shared/sonic-atlas/index.js';

const identity = {contractVersion: 'sonic-atlas/v1', projectionId: 'p', projectionVersion: 'v', projectionDigest: `sha256:${'a'.repeat(64)}`};
const point = id => ({identity, pointId: id, coordinate: {x: 0.25, y: -0.75}});
const reply = request => ({contractVersion: request.contractVersion, kind: 'atlas-point-inspection', requestId: request.requestId, identity: request.identity, pointId: request.pointId, coordinate: {...point('').coordinate}, playback: {trackRef: 'signed.reference', title: request.pointId, artist: 'Artist'}});
function fixture() {
  const requests = [], states = [];
  const selection = createAtlasPointSelection({onChange: state => states.push(state), inspect: request => new Promise((resolve, reject) => requests.push({request, resolve, reject}))});
  selection.setScope('account-one/library-one');
  return {selection, requests, states};
}

test('only the latest selected point can publish when old transport ignores cancellation', async () => {
  const {selection, requests, states} = fixture();
  const first = selection.select(point('first'));
  const second = selection.select(point('second'));
  assert.equal(requests[0].request.signal.aborted, true);
  requests[1].resolve(reply(requests[1].request)); await second;
  requests[0].resolve(reply(requests[0].request)); await first;
  assert.equal(selection.getState().result.playback.title, 'second');
  assert.deepEqual(states.filter(s => s.status === 'ready').map(s => s.pointId), ['second']);
});

test('scope changes, clearing and disposal discard in-flight metadata and previous ready state', async () => {
  for (const action of [s => s.setScope('account-two/library-one'), s => s.setScope(null), s => s.clear(), s => s.dispose()]) {
    const {selection, requests, states} = fixture();
    const ready = selection.select(point('ready'));
    requests[0].resolve(reply(requests[0].request)); await ready;
    const pending = selection.select(point('late'));
    action(selection);
    assert.equal(selection.getState().status, 'idle');
    assert.equal(requests[1].request.signal.aborted, true);
    const count = states.length;
    requests[1].resolve(reply(requests[1].request)); await pending;
    assert.equal(states.length, count);
    assert.equal(selection.getState().status, 'idle');
  }
});

test('inspection must match the exact tile coordinate as well as the request identity', async () => {
  for (const mutate of [r => r.coordinate.x += 0.001, r => r.coordinate.y += 0.001, r => r.identity = {...identity, projectionVersion: 'stale'}]) {
    const {selection, requests} = fixture();
    const pending = selection.select(point('point'));
    const result = reply(requests[0].request); mutate(result);
    requests[0].resolve(result); await pending;
    assert.equal(selection.getState().status, 'failed');
    assert.equal(selection.getState().result, undefined);
  }
});

test('new projection selection supersedes old errors and freezes ready metadata', async () => {
  const {selection, requests} = fixture();
  const first = selection.select(point('point'));
  const nextPoint = {...point('point'), identity: {...identity, projectionVersion: 'new'}};
  const second = selection.select(nextPoint);
  requests[1].resolve(reply(requests[1].request)); await second;
  requests[0].reject(new Error('private upstream detail')); await first;
  assert.equal(selection.getState().result.identity.projectionVersion, 'new');
  assert.ok(Object.isFrozen(selection.getState().result.playback));
});

test('selection requires a scope and snapshots coordinates before awaiting metadata', async () => {
  const inactive = createAtlasPointSelection();
  await assert.rejects(inactive.select(point('point')), /active scope/);
  const {selection, requests} = fixture();
  const selected = point('point');
  const pending = selection.select(selected);
  selected.coordinate.x = 500;
  requests[0].resolve(reply(requests[0].request)); await pending;
  assert.equal(selection.getState().coordinate.x, 0.25);
  selection.dispose();
  await assert.rejects(selection.select(point('point')), /active scope/);
});

test('safe correlated errors retain recovery behavior without exposing arbitrary error text', async () => {
  const {selection, requests} = fixture();
  let pending = selection.select(point('missing'));
  requests[0].reject(Object.assign(new Error('private upstream detail'), {atlas: createPublicResolutionError({requestId: requests[0].request.requestId, code: 'POINT_NOT_PLAYABLE'})}));
  await pending;
  assert.equal(selection.getState().code, 'POINT_NOT_PLAYABLE');
  assert.equal(selection.getState().retryable, false);
  assert.equal(JSON.stringify(selection.getState()).includes('private'), false);
  pending = selection.select(point('retry'));
  requests[1].reject(Object.assign(new Error('private upstream detail'), {atlas: createPublicResolutionError({requestId: 'old-request', code: 'POINT_NOT_PLAYABLE'})}));
  await pending;
  assert.equal(selection.getState().code, undefined);
  assert.equal(selection.getState().retryable, true);
});
