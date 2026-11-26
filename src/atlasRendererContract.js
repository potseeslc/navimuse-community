import { deeplyFreeze, exactKeys, fail, finite, opaqueId, parseProjectionManifest, parseResolvedJourney, validateTileAgainstManifest } from '../shared/sonic-atlas/index.js';

export const ATLAS_RENDERER_INTERFACE_VERSION = 'navimuse-atlas-renderer/v2';

function parseCamera(value, bounds) {
  exactKeys(value, ['mode', 'view'], ['mode', 'view'], 'rendererFrame.camera');
  if (!['follow', 'overview', 'explore'].includes(value.mode)) fail('rendererFrame.camera.mode', 'unsupported camera mode');
  exactKeys(value.view, ['centerX', 'centerY', 'width', 'height'], ['centerX', 'centerY', 'width', 'height'], 'rendererFrame.camera.view');
  const view = {
    centerX: finite(value.view.centerX, 'rendererFrame.camera.view.centerX'),
    centerY: finite(value.view.centerY, 'rendererFrame.camera.view.centerY'),
    width: finite(value.view.width, 'rendererFrame.camera.view.width'),
    height: finite(value.view.height, 'rendererFrame.camera.view.height')
  };
  if (view.width <= 0 || view.height <= 0) fail('rendererFrame.camera.view', 'dimensions must be positive');
  const projectionWidth = bounds.maxX - bounds.minX;
  const projectionHeight = bounds.maxY - bounds.minY;
  if (view.width > projectionWidth * 2.01 || view.height > projectionHeight * 2.01) fail('rendererFrame.camera.view', 'dimensions exceed camera limit');
  return { mode: value.mode, view };
}

function parseAtlasRendererFrameWithStatic(value, staticFrame = null) {
  const keys = ['interfaceVersion', 'manifest', 'tiles', 'pins', 'journey', 'camera'];
  exactKeys(value, keys, keys, 'rendererFrame');
  if (value.interfaceVersion !== ATLAS_RENDERER_INTERFACE_VERSION) fail('rendererFrame.interfaceVersion', 'unsupported renderer interface');
  const reuseStatic = staticFrame?.manifestSource === value.manifest && staticFrame?.tilesSource === value.tiles;
  const manifest = reuseStatic ? staticFrame.parsedManifest : parseProjectionManifest(value.manifest);
  let tiles;
  if (reuseStatic) tiles = staticFrame.parsedTiles;
  else {
    if (!Array.isArray(value.tiles) || value.tiles.length < 1) fail('rendererFrame.tiles', 'expected non-empty array');
    const addresses = new Set();
    let frameLod;
    tiles = value.tiles.map((tile, index) => {
      const parsed = validateTileAgainstManifest(tile, manifest);
      if (frameLod === undefined) frameLod = parsed.lod;
      if (parsed.lod !== frameLod) fail(`rendererFrame.tiles[${index}].lod`, 'must match other frame tiles');
      const address = `${parsed.lod}/${parsed.tileX}/${parsed.tileY}`;
      if (addresses.has(address)) fail(`rendererFrame.tiles[${index}]`, 'duplicate tile address');
      addresses.add(address);
      return parsed;
    });
  }
  if (!Array.isArray(value.pins) || value.pins.length > 100) fail('rendererFrame.pins', 'expected bounded array');
  const bounds = manifest.coordinateSpace.bounds;
  const pins = value.pins.map((pin, index) => {
    const path = `rendererFrame.pins[${index}]`;
    exactKeys(pin, ['pointId', 'x', 'y', 'role'], ['pointId', 'x', 'y', 'role'], path);
    if (!['current', 'destination', 'waypoint', 'selection', 'focus', 'accessibility'].includes(pin.role)) fail(`${path}.role`, 'unsupported pin role');
    const x = finite(pin.x, `${path}.x`);
    const y = finite(pin.y, `${path}.y`);
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) fail(path, 'pin coordinate outside projection bounds');
    return { pointId: opaqueId(pin.pointId, `${path}.pointId`), x, y, role: pin.role };
  });
  const journey = value.journey === null ? null : parseResolvedJourney(value.journey);
  if (journey) for (const key of ['projectionId', 'projectionVersion', 'projectionDigest']) if (journey.identity[key] !== manifest[key]) fail(`rendererFrame.journey.identity.${key}`, 'does not match manifest');
  return deeplyFreeze({ interfaceVersion: ATLAS_RENDERER_INTERFACE_VERSION, manifest, tiles, pins, journey, camera: parseCamera(value.camera, bounds) });
}

export function parseAtlasRendererFrame(value) {
  return parseAtlasRendererFrameWithStatic(value);
}

export function assertAtlasRenderer(renderer) {
  for (const method of ['mount', 'render', 'setReducedMotion', 'suspend', 'resume', 'dispose']) if (typeof renderer?.[method] !== 'function') throw new TypeError(`Atlas renderer must implement ${method}()`);
  return renderer;
}

export function createAtlasRendererHost({ createRenderer, onFailure = () => {} } = {}) {
  let renderer = null, mounted = false, failed = false, disposedRenderer = null, staticFrame = null;
  function cleanup(error) { if (failed) return false; failed = true; mounted = false; staticFrame = null; const current = renderer; renderer = null; if (current && current !== disposedRenderer) { disposedRenderer = current; try { current.dispose(); } catch {} } onFailure(error); return false; }
  function guarded(method, ...args) { if (!mounted || failed || !renderer) return false; try { const result = renderer[method](...args); return result === undefined ? true : result; } catch (error) { return cleanup(error); } }
  return Object.freeze({
    mount(target) { if (failed) return false; if (mounted || renderer) throw new Error('Atlas renderer host is already mounted'); let candidate; try { candidate = assertAtlasRenderer(createRenderer(cleanup)); renderer = candidate; candidate.mount(target); mounted = true; return true; } catch (error) { renderer = candidate || renderer; return cleanup(error); } },
    // A successful static parse freezes the raw source graph. Identity therefore
    // implies immutable content, and this single slot releases the prior pair.
    render(frame) {
      let parsed;
      try {
        const staticChanged = staticFrame?.manifestSource !== frame.manifest || staticFrame?.tilesSource !== frame.tiles;
        if (staticChanged) staticFrame = null;
        parsed = parseAtlasRendererFrameWithStatic(frame, staticFrame);
        if (staticChanged) {
          const manifestSource = deeplyFreeze(frame.manifest);
          const tilesSource = deeplyFreeze(frame.tiles);
          staticFrame = { manifestSource, tilesSource, parsedManifest: parsed.manifest, parsedTiles: parsed.tiles };
        }
      } catch (error) { return cleanup(error); }
      return guarded('render', parsed);
    },
    setReducedMotion(value) { return guarded('setReducedMotion', value === true); }, suspend() { return guarded('suspend'); }, resume() { return guarded('resume'); },
    requestContextLossForEvidence() { return typeof renderer?.requestContextLossForEvidence === 'function' ? guarded('requestContextLossForEvidence') : false; },
    dispose() { const current = renderer; renderer = null; mounted = false; staticFrame = null; if (current && current !== disposedRenderer) { disposedRenderer = current; try { current.dispose(); } catch {} } },
    status() { return deeplyFreeze({ mounted, failed }); }
  });
}
