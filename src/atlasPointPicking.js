import { parseProjectionManifest, validateTileAgainstManifest } from '../shared/sonic-atlas/index.js';

// Application-side picking over the same exact coordinates sent to the renderer.
// Pointer positions and radius are CSS pixels; framebuffer DPR is irrelevant.
export function createAtlasPointPicker(manifestValue, tileValues) {
  const manifest = parseProjectionManifest(manifestValue);
  const detail = manifest.lods.at(-1);
  if (!Array.isArray(tileValues)) throw new TypeError('Atlas picking requires full-detail tiles');
  const addresses = new Set(), ids = new Set(), points = [];
  for (const value of tileValues) {
    const tile = validateTileAgainstManifest(value, manifest, {lod: detail.lod});
    const address = `${tile.tileX}/${tile.tileY}`;
    if (addresses.has(address)) throw new TypeError('Duplicate Atlas picking tile');
    addresses.add(address);
    for (const point of tile.points) {
      if (ids.has(point.pointId)) throw new TypeError('Duplicate Atlas picking point');
      ids.add(point.pointId);
      points.push(point);
    }
  }
  if (points.length !== manifest.pointCount || detail.tiles.some(tile => tile.pointCount > 0 && !addresses.has(`${tile.tileX}/${tile.tileY}`))) throw new TypeError('Atlas picking requires the complete full-detail population');
  points.sort((a, b) => a.x - b.x || (a.pointId < b.pointId ? -1 : a.pointId > b.pointId ? 1 : 0));
  const identity = Object.freeze(Object.fromEntries(['contractVersion', 'projectionId', 'projectionVersion', 'projectionDigest'].map(key => [key, manifest[key]])));
  return Object.freeze({
    identity,
    pointCount: points.length,
    pick({x, y, width, height, camera, radius = 6}) {
      if (![x, y, width, height, radius, camera?.centerX, camera?.centerY, camera?.width, camera?.height].every(Number.isFinite) || width <= 0 || height <= 0 || camera.width <= 0 || camera.height <= 0 || radius <= 0 || radius > 16) throw new TypeError('Invalid Atlas picking viewport');
      if (x < 0 || y < 0 || x > width || y > height) return null;
      const worldX = camera.centerX + (x / width - 0.5) * camera.width;
      const reachX = radius / width * camera.width;
      // Expand only the broad-phase interval for inverse-transform rounding.
      // The final screen-distance check still enforces the exact click radius.
      const roundoff = Number.EPSILON * Math.max(1, Math.abs(worldX), camera.width) * 8;
      const minX = worldX - reachX - roundoff, maxX = worldX + reachX + roundoff;
      let low = 0, high = points.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (points[middle].x < minX) low = middle + 1;
        else high = middle;
      }
      let chosen = null, distance = radius * radius;
      for (let index = low; index < points.length && points[index].x <= maxX; index++) {
        const point = points[index];
        const screenX = (0.5 + (point.x - camera.centerX) / camera.width) * width;
        const screenY = (0.5 - (point.y - camera.centerY) / camera.height) * height;
        if (screenX < 0 || screenY < 0 || screenX > width || screenY > height) continue;
        const squared = (screenX - x) ** 2 + (screenY - y) ** 2;
        if (squared < distance || (squared === distance && (!chosen || point.pointId < chosen.pointId))) {
          distance = squared; chosen = point;
        }
      }
      return chosen ? Object.freeze({identity, pointId: chosen.pointId, coordinate: Object.freeze({x: chosen.x, y: chosen.y})}) : null;
    }
  });
}
