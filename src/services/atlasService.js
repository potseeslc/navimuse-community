import { apiJson } from './apiClient.js';
import { parseExactPointLodTile, parseProjectionManifest, validateTileAgainstManifest } from '../../shared/sonic-atlas/index.js';

export async function atlasProjectionManifest({ signal } = {}) {
  return parseProjectionManifest(await apiJson('/api/atlas/projection', { signal }, 'Sonic Atlas map is unavailable.'));
}
export async function atlasProjectionTile(manifestValue, { lod, tileX, tileY, signal } = {}) {
  const manifest = parseProjectionManifest(manifestValue), descriptor = manifest.lods.find(item => item.lod === lod);
  if (!descriptor || !Number.isSafeInteger(tileX) || tileX < 0 || tileX >= descriptor.columns || !Number.isSafeInteger(tileY) || tileY < 0 || tileY >= descriptor.rows) throw new TypeError('Atlas tile address is outside the projection manifest.');
  const payload = await apiJson(`/api/atlas/tiles/${lod}/${tileX}/${tileY}`, { signal }, 'Sonic Atlas map detail is unavailable.');
  return validateTileAgainstManifest(parseExactPointLodTile(payload), manifest, { lod, tileX, tileY });
}
