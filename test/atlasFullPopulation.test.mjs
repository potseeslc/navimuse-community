import assert from 'node:assert/strict';
import test from 'node:test';
import { selectFullAtlasPopulation } from '../src/atlasLod.js';
import { atlasPopulationDiagnostics } from '../src/atlasOverviewGeometry.js';

const AUDITED_POINT_COUNT = 94_736;
const POPULATED_TILE_COUNT = 256;

function fullPopulationFixture() {
  const buckets = Array.from({ length: POPULATED_TILE_COUNT }, () => []);
  for (let index = 0; index < AUDITED_POINT_COUNT; index += 1) {
    buckets[index % buckets.length].push({
      pointId: `audited-point-${index}`,
      x: ((index % 1024) / 1023) * 2 - 1,
      y: ((Math.floor(index / 1024) % 93) / 92) * 2 - 1
    });
  }
  const descriptors = buckets.map((points, index) => ({
    tileX: index % 16,
    tileY: Math.floor(index / 16),
    tileDigest: `sha256:${String(index).padStart(64, '0')}`,
    pointCount: points.length
  }));
  const manifest = {
    pointCount: AUDITED_POINT_COUNT,
    lods: [
      { lod: 0, columns: 1, rows: 1, pointCount: 128, tileCount: 1, tiles: [{ tileX: 0, tileY: 0, tileDigest: `sha256:${'a'.repeat(64)}`, pointCount: 128 }] },
      { lod: 2, columns: 16, rows: 16, pointCount: AUDITED_POINT_COUNT, tileCount: 256, tiles: descriptors }
    ]
  };
  const tiles = buckets.map((points, index) => ({ lod: 2, tileX: index % 16, tileY: Math.floor(index / 16), points }));
  return { manifest, tiles };
}

test('M8 full-map readiness proves 94,736 of 94,736 unique production-shaped points', () => {
  const { manifest, tiles } = fullPopulationFixture();
  const selection = selectFullAtlasPopulation(manifest);
  const diagnostics = atlasPopulationDiagnostics(manifest, tiles, selection);

  assert.equal(selection.lod, 2);
  assert.equal(selection.pointCount, AUDITED_POINT_COUNT);
  assert.equal(selection.tiles.length, POPULATED_TILE_COUNT);
  assert.deepEqual(diagnostics, {
    projectionCount: AUDITED_POINT_COUNT,
    loadedCount: AUDITED_POINT_COUNT,
    loadedTileCount: POPULATED_TILE_COUNT,
    populatedTileCount: POPULATED_TILE_COUNT,
    indexedTileCount: 256,
    lod: 2,
    detailPolicy: 'full-population',
    complete: true
  });
});

test('M8 full-map readiness rejects one missing or duplicated production point', () => {
  const missing = fullPopulationFixture();
  missing.tiles.at(-1).points.pop();
  assert.equal(atlasPopulationDiagnostics(missing.manifest, missing.tiles, selectFullAtlasPopulation(missing.manifest)).complete, false);

  const duplicated = fullPopulationFixture();
  duplicated.tiles.at(-1).points[0] = duplicated.tiles[0].points[0];
  assert.throws(() => atlasPopulationDiagnostics(duplicated.manifest, duplicated.tiles, selectFullAtlasPopulation(duplicated.manifest)), /Duplicate Atlas point/);
});

test('M8 full-map readiness rejects incomplete indexes and mismatched tile addresses', () => {
  const incompleteIndex = fullPopulationFixture();
  incompleteIndex.manifest.lods.at(-1).tiles.pop();
  assert.throws(() => selectFullAtlasPopulation(incompleteIndex.manifest), /tile index is incomplete/);

  const wrongAddress = fullPopulationFixture();
  wrongAddress.tiles.at(-1).tileX = 99;
  assert.throws(() => atlasPopulationDiagnostics(wrongAddress.manifest, wrongAddress.tiles, selectFullAtlasPopulation(wrongAddress.manifest)), /outside the selected population/);

  const duplicateAddress = fullPopulationFixture();
  duplicateAddress.tiles.at(-1).tileX = duplicateAddress.tiles[0].tileX;
  duplicateAddress.tiles.at(-1).tileY = duplicateAddress.tiles[0].tileY;
  assert.throws(() => atlasPopulationDiagnostics(duplicateAddress.manifest, duplicateAddress.tiles, selectFullAtlasPopulation(duplicateAddress.manifest)), /Duplicate Atlas tile/);
});
