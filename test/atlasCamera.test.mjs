import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasCameraModes, followAtlasCamera, overviewAtlasCamera, panAtlasCamera, zoomAtlasCamera } from '../src/atlasCamera.js';
import { atlasPinRoles } from '../src/atlasOverviewGeometry.js';
import { journey, manifest } from './contracts/sonicAtlasFixtures.mjs';

const viewport = { width: 800, height: 400 };

test('camera modes expose the exact Follow, Overview, and Explore vocabulary', () => {
  assert.deepEqual(atlasCameraModes, { follow: 'follow', overview: 'overview', explore: 'explore' });
});

test('Overview immerses the viewport while Follow frames current runway and destination', () => {
  const overview = overviewAtlasCamera(manifest, viewport);
  const fallback = { stops: journey.stops.map((stop, index) => ({ stopId: stop.stopId, state: index === 1 ? 'current' : 'upcoming' })) };
  const follow = followAtlasCamera(manifest, journey, atlasPinRoles(journey, fallback), viewport);
  assert.equal(overview.centerX, 0);
  assert.equal(overview.width, 3.2, 'overview should carry the projection beyond the viewport edge');
  assert.ok(follow.width <= overview.width);
  assert.ok(follow.centerX > 0, 'current runway should shift toward the remaining route');
});

test('Explore pan and zoom remain bounded to the projection envelope', () => {
  const overview = overviewAtlasCamera(manifest, viewport);
  const zoomed = zoomAtlasCamera(overview, .5, manifest);
  assert.ok(zoomed.width < overview.width);
  const panned = panAtlasCamera(zoomed, 100000, -100000, viewport, manifest);
  assert.ok(panned.centerX >= manifest.coordinateSpace.bounds.minX - panned.width / 2);
  assert.ok(panned.centerY <= manifest.coordinateSpace.bounds.maxY + panned.height / 2);
});
