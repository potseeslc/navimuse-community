export function fitAtlasBounds(bounds, viewportWidth, viewportHeight, padding = 1.08) { const width=bounds.maxX-bounds.minX,height=bounds.maxY-bounds.minY,aspect=Math.max(1,viewportWidth)/Math.max(1,viewportHeight),dataAspect=width/height;const viewWidth=(aspect>=dataAspect?height*aspect:width)*padding,viewHeight=(aspect>=dataAspect?height:width/aspect)*padding;return Object.freeze({centerX:(bounds.minX+bounds.maxX)/2,centerY:(bounds.minY+bounds.maxY)/2,width:viewWidth,height:viewHeight}) }
export function atlasPointArray(tiles,expectedCount) { const seen=new Set,points=[];for(const [tileIndex,tile] of tiles.entries())for(const point of tile.points){if(seen.has(point.pointId))throw new TypeError(`Duplicate Atlas point across overview tiles at tile ${tileIndex}`);seen.add(point.pointId);points.push(point)}if(expectedCount!==undefined&&points.length!==expectedCount)throw new TypeError('Atlas overview point union does not match manifest LOD count');return Object.freeze(points) }
export function atlasPopulationDiagnostics(manifest, tiles, selection) {
  const points = atlasPointArray(tiles);
  const projectionCount = manifest?.pointCount || 0;
  const populatedTileCount = selection?.populatedTileCount || 0;
  const expectedTiles = new Map((selection?.tiles || []).map(tile => [`${selection.lod}/${tile.tileX}/${tile.tileY}`, tile]));
  const loadedAddresses = new Set();
  let tilePayloadsMatchIndex = true;
  for (const tile of tiles) {
    const address = `${tile.lod}/${tile.tileX}/${tile.tileY}`;
    if (loadedAddresses.has(address)) throw new TypeError(`Duplicate Atlas tile across overview population at ${address}`);
    loadedAddresses.add(address);
    const descriptor = expectedTiles.get(address);
    if (!descriptor) throw new TypeError(`Atlas overview tile is outside the selected population at ${address}`);
    if (tile.points.length !== descriptor.pointCount) tilePayloadsMatchIndex = false;
  }
  return Object.freeze({
    projectionCount,
    loadedCount: points.length,
    loadedTileCount: tiles.length,
    populatedTileCount,
    indexedTileCount: selection?.indexedTileCount || 0,
    lod: selection?.lod ?? null,
    detailPolicy: selection?.detailPolicy || 'unselected',
    complete: projectionCount > 0 && points.length === projectionCount && tiles.length === populatedTileCount && loadedAddresses.size === expectedTiles.size && tilePayloadsMatchIndex
  });
}
export function journeyLineCoordinates(journey) { return Object.freeze((journey?.stops||[]).flatMap(stop=>[stop.coordinate.x,stop.coordinate.y])) }
export function journeyRoutePath(journey, camera) {
  if (!camera || !journey?.stops || journey.stops.length < 2) return '';
  const points = journey.stops.map(stop => ({
    x: 50 + ((stop.coordinate.x - camera.centerX) / camera.width) * 100,
    y: 50 - ((stop.coordinate.y - camera.centerY) / camera.height) * 100
  }));
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return path;
}
export function journeyRouteScreenSpan(journey, camera) {
  if (!camera || !journey?.stops?.length) return Object.freeze({ width: 0, height: 0, diagonal: 0 });
  const points = journey.stops.map(stop => ({
    x: ((stop.coordinate.x - camera.centerX) / camera.width) * 100,
    y: ((stop.coordinate.y - camera.centerY) / camera.height) * 100
  }));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return Object.freeze({ width, height, diagonal: Math.hypot(width, height) });
}
export function atlasPinRoles(journey, fallback) {
  if (!journey) return Object.freeze([]);
  const stateByStop = new Map((fallback?.stops || []).map(stop => [stop.stopId, stop.state]));
  const pins = [];
  for (const [index, waypoint] of journey.waypoints.entries()) {
    const stop = journey.stops.find(candidate => candidate.pointId === waypoint.pointId);
    if (stop) pins.push({ pointId: stop.pointId, x: stop.coordinate.x, y: stop.coordinate.y, role: index === journey.waypoints.length - 1 ? 'destination' : 'waypoint' });
  }
  const current = journey.stops.find(stop => stateByStop.get(stop.stopId) === 'current');
  if (current) pins.push({ pointId: current.pointId, x: current.coordinate.x, y: current.coordinate.y, role: 'current' });
  return Object.freeze(pins.map(Object.freeze));
}
async function mapWithConcurrencyInternal(values,limit,mapper,onProgress){const output=new Array(values.length);let cursor=0,completed=0;await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{while(cursor<values.length){const index=cursor++;output[index]=await mapper(values[index],index);completed+=1;onProgress?.(output[index],index,completed,values.length)}}));return output}
export async function mapWithConcurrency(values,limit,mapper){return mapWithConcurrencyInternal(values,limit,mapper)}
export async function mapWithConcurrencyProgress(values,limit,mapper,onProgress){if(typeof onProgress!=='function')throw new TypeError('Atlas progress callback is required');return mapWithConcurrencyInternal(values,limit,mapper,onProgress)}
