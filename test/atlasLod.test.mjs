import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAtlasLod, selectFullAtlasPopulation } from '../src/atlasLod.js';

const digest = value => `sha256:${value.repeat(64)}`;
const lod = (level, grid) => ({ lod: level, columns: grid, rows: grid, pointCount: grid * grid, tileCount: grid * grid, tiles: Array.from({ length: grid * grid }, (_, index) => ({ tileX: index % grid, tileY: Math.floor(index / grid), tileDigest: digest(String(level + 1)), pointCount: 1 })) });
const manifest = { pointCount: 32 * 32, coordinateSpace: { bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 } }, lods: [lod(0, 8), lod(1, 16), lod(2, 32)] };

test('semantic LOD increases detail as the camera narrows', () => {
  assert.equal(selectAtlasLod(manifest, { centerX: 0, centerY: 0, width: 2.2, height: 2.2 }).lod, 0);
  assert.equal(selectAtlasLod(manifest, { centerX: 0, centerY: 0, width: 1, height: 1 }).lod, 1);
  assert.equal(selectAtlasLod(manifest, { centerX: 0, centerY: 0, width: .5, height: .5 }).lod, 2);
});

test('visible tile selection is spatial and falls back to fit its budget', () => {
  const focused = selectAtlasLod(manifest, { centerX: .75, centerY: .75, width: .5, height: .5 }, 128);
  assert.equal(focused.lod, 2);
  assert.ok(focused.tiles.every(tile => tile.tileX >= 24 && tile.tileY >= 24));
  const bounded = selectAtlasLod(manifest, { centerX: 0, centerY: 0, width: 1, height: 1 }, 32);
  assert.equal(bounded.desiredLod, 1);
  assert.equal(bounded.lod, 0);
  assert.ok(bounded.tiles.length <= 32);
});

test('selection fails explicitly when no LOD fits the tile budget', () => {
  assert.throws(() => selectAtlasLod(manifest, { centerX: 0, centerY: 0, width: 2, height: 2 }, 1), /no renderable tiles/);
  assert.throws(() => selectAtlasLod(manifest, { centerX: 10, centerY: 10, width: 1, height: 1 }), /no renderable tiles/);
});

test('full population selection uses every non-empty tile from the highest exact LOD', () => {
  const selection = selectFullAtlasPopulation(manifest);
  assert.equal(selection.lod, 2);
  assert.equal(selection.pointCount, manifest.pointCount);
  assert.equal(selection.populatedTileCount, manifest.lods.at(-1).tileCount);
  assert.equal(selection.indexedTileCount, manifest.lods.at(-1).tileCount);
  assert.equal(selection.detailPolicy, 'full-population');
});

test('full population selection fails closed when the tile index is sampled or incomplete', () => {
  const incomplete = structuredClone(manifest);
  incomplete.lods.at(-1).tiles[0].pointCount = 0;
  assert.throws(() => selectFullAtlasPopulation(incomplete), /does not equal/);
});
