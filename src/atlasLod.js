const DEFAULT_TILE_BUDGET = 128;

function visibleTileRange(bounds, view, columns, rows) {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const viewMinX = view.centerX - view.width / 2;
  const viewMaxX = view.centerX + view.width / 2;
  const viewMinY = view.centerY - view.height / 2;
  const viewMaxY = view.centerY + view.height / 2;
  if (viewMaxX < bounds.minX || viewMinX > bounds.maxX || viewMaxY < bounds.minY || viewMinY > bounds.maxY) return null;
  const minX = Math.max(bounds.minX, viewMinX);
  const maxX = Math.min(bounds.maxX, viewMaxX);
  const minY = Math.max(bounds.minY, viewMinY);
  const maxY = Math.min(bounds.maxY, viewMaxY);
  const index = (value, minimum, span, count) => Math.max(0, Math.min(count - 1, Math.floor(((value - minimum) / span) * count)));
  return {
    minTileX: index(minX, bounds.minX, spanX, columns),
    maxTileX: index(maxX, bounds.minX, spanX, columns),
    minTileY: index(minY, bounds.minY, spanY, rows),
    maxTileY: index(maxY, bounds.minY, spanY, rows)
  };
}

function visibleDescriptors(lod, bounds, view) {
  const range = visibleTileRange(bounds, view, lod.columns, lod.rows);
  if (!range) return [];
  return lod.tiles.filter(tile => tile.tileX >= range.minTileX && tile.tileX <= range.maxTileX && tile.tileY >= range.minTileY && tile.tileY <= range.maxTileY);
}

export function selectAtlasLod(manifest, view, tileBudget = DEFAULT_TILE_BUDGET) {
  if (!Number.isSafeInteger(tileBudget) || tileBudget < 1) throw new TypeError('Atlas tile budget must be a positive safe integer');
  const bounds = manifest.coordinateSpace.bounds;
  const fullWidth = bounds.maxX - bounds.minX;
  const fullHeight = bounds.maxY - bounds.minY;
  const visibleFraction = Math.max(view.width / fullWidth, view.height / fullHeight);
  const desiredIndex = Math.max(0, Math.min(manifest.lods.length - 1, Math.floor(Math.log2(1 / Math.max(Number.EPSILON, visibleFraction)))));

  for (let index = desiredIndex; index >= 0; index--) {
    const lod = manifest.lods[index];
    const tiles = visibleDescriptors(lod, bounds, view);
    if (tiles.length > 0 && tiles.length <= tileBudget) return Object.freeze({ lod: lod.lod, tiles: Object.freeze(tiles), desiredLod: manifest.lods[desiredIndex].lod });
  }
  throw new Error('Atlas view has no renderable tiles within the supported tile budget');
}

export function selectFullAtlasPopulation(manifest) {
  const lod = manifest?.lods?.at?.(-1);
  if (!lod || lod.pointCount !== manifest.pointCount) throw new TypeError('Atlas full-detail LOD must equal the projection population');
  if (lod.tileCount !== lod.tiles.length) throw new TypeError('Atlas full-detail tile index is incomplete');
  const tiles = lod.tiles.filter(tile => tile.pointCount > 0);
  if (!tiles.length || tiles.reduce((total, tile) => total + tile.pointCount, 0) !== manifest.pointCount) {
    throw new TypeError('Atlas full-detail tile index does not equal the projection population');
  }
  return Object.freeze({
    lod: lod.lod,
    tiles: Object.freeze(tiles),
    indexedTileCount: lod.tileCount,
    populatedTileCount: tiles.length,
    pointCount: lod.pointCount,
    detailPolicy: 'full-population'
  });
}
