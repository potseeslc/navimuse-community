import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasAnimationIntervalMs, atlasPointStyle } from '../src/reglAtlasRenderer.js';

test('Overview compensates for full-population camera density without hiding points', () => {
  const overview = atlasPointStyle('overview', 94_736, 1);
  const explore = atlasPointStyle('explore', 94_736, 1);
  assert.ok(overview.pointSize >= explore.pointSize * .95);
  assert.ok(overview.pointAlpha > explore.pointAlpha * 1.25);
  assert.ok(overview.starThreshold < explore.starThreshold);
  assert.ok(overview.pointAlpha <= .42);
});

test('Atlas point styling keeps device-pixel scaling bounded', () => {
  const oneX = atlasPointStyle('overview', 94_736, 1);
  const twoX = atlasPointStyle('overview', 94_736, 3);
  assert.equal(twoX.pointSize, oneX.pointSize * 2);
  assert.equal(twoX.starSize, oneX.starSize * 2);
  assert.equal(twoX.pointAlpha, oneX.pointAlpha);
});

test('full-population Atlas animation keeps slow nebular motion without saturating the WebView', () => {
  assert.equal(atlasAnimationIntervalMs(94_736), 125);
  assert.equal(atlasAnimationIntervalMs(40_000), 80);
  assert.equal(atlasAnimationIntervalMs(39_999), 40);
});
