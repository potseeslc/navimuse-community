import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtlasPointPicker} from '../src/atlasPointPicking.js';
import {manifest as base, tile as baseTile, clone} from './contracts/sonicAtlasFixtures.mjs';

const camera = {centerX: 0, centerY: 0, width: 2, height: 2};
function dataset(points) {
  const manifest = clone(base);
  manifest.pointCount = points.length;
  manifest.lods = [{lod: 0, columns: 1, rows: 1, pointCount: points.length, tileCount: 1, tiles: [{tileX: 0, tileY: 0, tileDigest: baseTile.tileDigest, pointCount: points.length}]}];
  return {manifest, tiles: [{...clone(baseTile), lod: 0, points}]};
}
const query = (extra = {}) => ({x: 100, y: 100, width: 200, height: 200, camera, ...extra});

test('picking uses CSS coordinates, camera pan/zoom and the upward world Y axis', () => {
  const data = dataset([{pointId: 'target', x: 0.5, y: 0.5}]);
  const picker = createAtlasPointPicker(data.manifest, data.tiles);
  assert.equal(picker.pick(query({x: 150, y: 50})).pointId, 'target');
  assert.equal(picker.pick(query()), null);
  assert.equal(picker.pick(query({camera: {centerX: 0.5, centerY: 0.5, width: 1, height: 1}})).pointId, 'target');
  for (const dpr of [1, 1.5, 2, 3]) {
    const hit = picker.pick(query({x: 150, y: 50, devicePixelRatio: dpr}));
    assert.deepEqual(hit.coordinate, {x: 0.5, y: 0.5});
    assert.ok(Object.isFrozen(hit.coordinate));
  }
  data.tiles[0].points[0].x = -0.5;
  assert.equal(picker.pick(query({x: 150, y: 50})).coordinate.x, 0.5);
});

test('nearest point uses circular CSS-pixel distance and deterministic ties', () => {
  const points = [{pointId: 'z', x: 0, y: 0}, {pointId: 'a', x: 0, y: 0}, {pointId: 'near', x: 0.04, y: 0}];
  for (const ordered of [points, [...points].reverse()]) {
    const data = dataset(ordered), picker = createAtlasPointPicker(data.manifest, data.tiles);
    assert.equal(picker.pick(query()).pointId, 'a');
    assert.equal(picker.pick(query({x: 104})).pointId, 'near');
    assert.equal(picker.pick(query({x: 110, y: 106})), null);
    assert.equal(picker.pick(query({x: 110})).pointId, 'near');
  }
});

test('offscreen points and invalid viewports cannot become selections', () => {
  const data = dataset([{pointId: 'edge', x: 0.99, y: 0}]);
  const picker = createAtlasPointPicker(data.manifest, data.tiles);
  assert.equal(picker.pick(query({x: 199})).pointId, 'edge');
  assert.equal(picker.pick(query({x: 201})), null);
  assert.equal(picker.pick(query({x: 200, camera: {...camera, width: 1.96}})), null);
  for (const extra of [{width: 0}, {height: NaN}, {radius: 17}, {camera: {...camera, width: -1}}]) assert.throws(() => picker.pick(query(extra)), TypeError);
});

test('picker rejects incomplete, stale, duplicate and sampled populations', () => {
  const data = dataset([{pointId: 'point', x: 0, y: 0}]);
  assert.throws(() => createAtlasPointPicker(data.manifest, []), /complete/);
  assert.throws(() => createAtlasPointPicker(data.manifest, [...data.tiles, ...data.tiles]), /Duplicate/);
  assert.throws(() => createAtlasPointPicker(data.manifest, [{...data.tiles[0], projectionVersion: 'old'}]), /match manifest/);
  const low = {...clone(baseTile), lod: 0};
  assert.throws(() => createAtlasPointPicker(base, [low]), /match request/);
});

test('all 96000 synthetic points remain individually selectable across the full projection', () => {
  const columns = 320, rows = 300;
  const data = dataset([{pointId: 'placeholder', x: 0, y: 0}]);
  const tiles = [0, 1, 2, 3].map(tileX => ({...data.tiles[0], tileX, points: []}));
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    tiles[Math.floor(column / 80)].points.push({pointId: `p-${row}-${column}`, x: -1 + (column + 0.5) * 2 / columns, y: -1 + (row + 0.5) * 2 / rows});
  }
  data.manifest.pointCount = columns * rows;
  data.manifest.lods = [{lod: 0, columns: 4, rows: 1, pointCount: columns * rows, tileCount: 4, tiles: tiles.map(tile => ({tileX: tile.tileX, tileY: 0, tileDigest: tile.tileDigest, pointCount: tile.points.length}))}];
  const picker = createAtlasPointPicker(data.manifest, tiles);
  assert.equal(picker.pointCount, 96000);
  // Zoom to every exact point: no LOD sampling, representative substitution or
  // framebuffer rounding may remove a point from the selectable population.
  for (const tile of tiles) for (const point of tile.points) {
    const hit = picker.pick(query({camera: {centerX: point.x, centerY: point.y, width: 0.04, height: 0.04}}));
    assert.equal(hit.pointId, point.pointId);
    assert.deepEqual(hit.coordinate, {x: point.x, y: point.y});
  }
});
