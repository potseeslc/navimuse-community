import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_RENDERER_INTERFACE_VERSION, createAtlasRendererHost } from '../src/atlasRendererContract.js';
import { clone, manifest, tile } from './contracts/sonicAtlasFixtures.mjs';

const camera = { mode: 'overview', view: { centerX: 0, centerY: 0, width: 2, height: 2 } };

test('renderer host validates immutable map sources once while keeping dynamic frame validation live', () => {
  let tileEnumerations = 0;
  const tiles = new Proxy([clone(tile)], {
    ownKeys(target) {
      tileEnumerations += 1;
      return Reflect.ownKeys(target);
    }
  });
  const frames = [];
  const host = createAtlasRendererHost({
    createRenderer: () => ({
      mount() {},
      render(frame) { frames.push(frame); },
      setReducedMotion() {},
      suspend() {},
      resume() {},
      dispose() {}
    })
  });
  assert.equal(host.mount({}), true);
  const staticManifest = clone(manifest);
  const base = { interfaceVersion: ATLAS_RENDERER_INTERFACE_VERSION, manifest: staticManifest, tiles, pins: [], journey: null, camera };
  assert.equal(host.render(base), true);
  assert.ok(Object.isFrozen(staticManifest));
  assert.ok(Object.isFrozen(tiles));
  assert.ok(Object.isFrozen(tiles[0].points));
  assert.ok(Object.isFrozen(tiles[0].points[0]));
  assert.throws(() => { tiles[0] = clone(tile); }, TypeError);
  assert.throws(() => { tiles[0].points[0].x = 99; }, TypeError);
  const firstEnumerationCount = tileEnumerations;
  assert.ok(firstEnumerationCount > 0);

  assert.equal(host.render({ ...base, pins: [{ pointId: 'point-a', x: -.75, y: -.75, role: 'current' }] }), true);
  assert.equal(tileEnumerations, firstEnumerationCount);
  assert.equal(frames[0].manifest, frames[1].manifest);
  assert.equal(frames[0].tiles, frames[1].tiles);
  assert.equal(frames[1].pins[0].role, 'current');
});

test('renderer host revalidates changed static references and still fails closed', () => {
  let failures = 0;
  const host = createAtlasRendererHost({
    createRenderer: () => ({ mount() {}, render() {}, setReducedMotion() {}, suspend() {}, resume() {}, dispose() {} }),
    onFailure: () => { failures += 1; }
  });
  assert.equal(host.mount({}), true);
  const base = { interfaceVersion: ATLAS_RENDERER_INTERFACE_VERSION, manifest: clone(manifest), tiles: [clone(tile)], pins: [], journey: null, camera };
  assert.equal(host.render(base), true);
  assert.equal(host.render({ ...base, tiles: [{ ...clone(tile), projectionVersion: 'wrong' }] }), false);
  assert.equal(failures, 1);
  assert.deepEqual(host.status(), { mounted: false, failed: true });
  assert.equal(host.render(base), false);
  assert.equal(failures, 1);
});

test('renderer host replaces a valid static cache without leaking the previous frame into later renders', () => {
  const frames = [];
  const host = createAtlasRendererHost({
    createRenderer: () => ({ mount() {}, render(frame) { frames.push(frame); }, setReducedMotion() {}, suspend() {}, resume() {}, dispose() {} })
  });
  assert.equal(host.mount({}), true);
  const first = { interfaceVersion: ATLAS_RENDERER_INTERFACE_VERSION, manifest: clone(manifest), tiles: [clone(tile)], pins: [], journey: null, camera };
  assert.equal(host.render(first), true);
  const replacement = { ...first, manifest: clone(manifest), tiles: [clone(tile)] };
  assert.equal(host.render(replacement), true);
  assert.notEqual(frames[1].manifest, frames[0].manifest);
  assert.notEqual(frames[1].tiles, frames[0].tiles);
  assert.equal(host.render({ ...replacement, pins: [{ pointId: 'point-a', x: -.75, y: -.75, role: 'destination' }] }), true);
  assert.equal(frames[2].manifest, frames[1].manifest);
  assert.equal(frames[2].tiles, frames[1].tiles);
  assert.equal(frames[2].pins[0].role, 'destination');
});
