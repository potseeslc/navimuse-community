import { ATLAS_CONTRACT_VERSION } from './constants.js';
import { assertNoForbiddenAtlasFields, contractVersion, deeplyFreeze, exactKeys, object, opaqueId, safeInteger, sha256 } from './validation.js';

const identityKeys = ['contractVersion', 'projectionId', 'projectionVersion', 'projectionDigest'];
export function parseAtlasDataIdentity(value, path = 'identity') {
  exactKeys(value, identityKeys, identityKeys, path); assertNoForbiddenAtlasFields(value, path);
  return deeplyFreeze({ contractVersion: contractVersion(value.contractVersion, `${path}.contractVersion`), projectionId: opaqueId(value.projectionId, `${path}.projectionId`), projectionVersion: opaqueId(value.projectionVersion, `${path}.projectionVersion`), projectionDigest: sha256(value.projectionDigest, `${path}.projectionDigest`) });
}
export function parseAtlasTileIdentity(value, path = 'tileIdentity') {
  const keys = [...identityKeys, 'manifestDigest', 'lod', 'tileX', 'tileY', 'tileDigest'];
  exactKeys(value, keys, keys, path); const identity = parseAtlasDataIdentity(Object.fromEntries(identityKeys.map(key => [key, value[key]])), path);
  return deeplyFreeze({ ...identity, manifestDigest: sha256(value.manifestDigest, `${path}.manifestDigest`), lod: safeInteger(value.lod, `${path}.lod`), tileX: safeInteger(value.tileX, `${path}.tileX`), tileY: safeInteger(value.tileY, `${path}.tileY`), tileDigest: sha256(value.tileDigest, `${path}.tileDigest`) });
}
export function atlasTileCacheKey(value) {
  const id = parseAtlasTileIdentity(value);
  return [id.contractVersion, id.projectionId, id.projectionVersion, id.projectionDigest, id.manifestDigest, id.lod, id.tileX, id.tileY, id.tileDigest].join('/');
}
export function atlasManifestCacheNamespace(value) {
  const keys = [...identityKeys, 'manifestDigest']; exactKeys(value, keys, keys, 'manifestIdentity');
  const id = parseAtlasDataIdentity(Object.fromEntries(identityKeys.map(key => [key, value[key]])));
  return [ATLAS_CONTRACT_VERSION, id.projectionId, id.projectionVersion, id.projectionDigest, sha256(value.manifestDigest, 'manifestIdentity.manifestDigest')].join('/');
}
export function atlasIdentityMatches(left, right) {
  try { const a = parseAtlasDataIdentity(left); const b = parseAtlasDataIdentity(right); return identityKeys.every(key => a[key] === b[key]); } catch { return false; }
}
