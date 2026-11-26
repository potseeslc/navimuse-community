import { fitAtlasBounds } from './atlasOverviewGeometry.js';

export const atlasCameraModes = Object.freeze({ follow: 'follow', overview: 'overview', explore: 'explore' });

function coordinateBounds(points, fallback) {
  if (!points.length) return fallback;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const totalWidth = fallback.maxX - fallback.minX;
  const totalHeight = fallback.maxY - fallback.minY;
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const width = Math.max(totalWidth * 0.16, Math.max(...xs) - Math.min(...xs));
  const height = Math.max(totalHeight * 0.16, Math.max(...ys) - Math.min(...ys));
  return { minX: centerX - width / 2, maxX: centerX + width / 2, minY: centerY - height / 2, maxY: centerY + height / 2 };
}

export function overviewAtlasCamera(manifest, viewport) {
  // Let the nebula continue beyond the frame so the Atlas feels like an
  // atmosphere rather than a diagram with a visible outer silhouette.
  const fitted = fitAtlasBounds(manifest.coordinateSpace.bounds, viewport.width, viewport.height, 0.8);
  return Object.freeze({ centerX: fitted.centerX, centerY: fitted.centerY, width: fitted.width, height: fitted.height });
}

export function followAtlasCamera(manifest, journey, pins, viewport) {
  const current = pins.find(pin => pin.role === 'current');
  if (!current) return overviewAtlasCamera(manifest, viewport);
  const currentIndex = journey.stops.findIndex(stop => stop.pointId === current.pointId);
  const runway = journey.stops.slice(Math.max(0, currentIndex), currentIndex + 5).map(stop => stop.coordinate);
  const destination = pins.find(pin => pin.role === 'destination');
  const bounds = coordinateBounds([...runway, ...(destination ? [destination] : [])], manifest.coordinateSpace.bounds);
  const fitted = fitAtlasBounds(bounds, viewport.width, viewport.height, 1.25);
  return Object.freeze({ centerX: fitted.centerX, centerY: fitted.centerY, width: fitted.width, height: fitted.height });
}

export function clampExploreCamera(camera, manifest) {
  const bounds = manifest.coordinateSpace.bounds;
  const fullWidth = bounds.maxX - bounds.minX;
  const fullHeight = bounds.maxY - bounds.minY;
  const width = Math.max(fullWidth * 0.04, Math.min(fullWidth * 2, Number(camera.width) || fullWidth));
  const height = Math.max(fullHeight * 0.04, Math.min(fullHeight * 2, Number(camera.height) || fullHeight));
  const centerX = Math.max(bounds.minX - width / 2, Math.min(bounds.maxX + width / 2, Number(camera.centerX) || 0));
  const centerY = Math.max(bounds.minY - height / 2, Math.min(bounds.maxY + height / 2, Number(camera.centerY) || 0));
  return Object.freeze({ centerX, centerY, width, height });
}

export function zoomAtlasCamera(camera, factor, manifest) {
  const scale = Math.max(0.5, Math.min(2, Number(factor) || 1));
  return clampExploreCamera({ ...camera, width: camera.width * scale, height: camera.height * scale }, manifest);
}

export function panAtlasCamera(camera, deltaX, deltaY, viewport, manifest) {
  return clampExploreCamera({
    ...camera,
    centerX: camera.centerX - (deltaX / Math.max(1, viewport.width)) * camera.width,
    centerY: camera.centerY + (deltaY / Math.max(1, viewport.height)) * camera.height
  }, manifest);
}
