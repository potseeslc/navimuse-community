import { atlasIdentityMatches, parseAtlasDataIdentity } from './identity.js';
import { parseAtlasPlaybackMetadata } from './playbackMetadata.js';
import { assertNoForbiddenAtlasFields, contractVersion, deeplyFreeze, exactKeys, fail, finite, literal, opaqueId } from './validation.js';

function envelope(value, kind, additional = []) {
  const path = 'pointInspection';
  assertNoForbiddenAtlasFields(value, path, { maxNodes: 100, maxDepth: 4 });
  const keys = ['contractVersion', 'kind', 'requestId', 'identity', 'pointId', ...additional];
  exactKeys(value, keys, keys, path);
  return {
    contractVersion: contractVersion(value.contractVersion),
    kind: literal(value.kind, kind, `${path}.kind`),
    requestId: opaqueId(value.requestId, `${path}.requestId`),
    identity: parseAtlasDataIdentity(value.identity),
    pointId: opaqueId(value.pointId, `${path}.pointId`)
  };
}

export function parseAtlasPointInspectionRequest(value) {
  return deeplyFreeze(envelope(value, 'atlas-point-inspection-request'));
}

export function parseAtlasPointInspection(value) {
  const result = envelope(value, 'atlas-point-inspection', ['coordinate', 'playback']);
  exactKeys(value.coordinate, ['x', 'y'], ['x', 'y'], 'pointInspection.coordinate');
  return deeplyFreeze({
    ...result,
    coordinate: {
      x: finite(value.coordinate.x, 'pointInspection.coordinate.x'),
      y: finite(value.coordinate.y, 'pointInspection.coordinate.y')
    },
    playback: parseAtlasPlaybackMetadata(value.playback, 'pointInspection.playback')
  });
}

// Syntax validation is not authorization or proof of projection membership.
// The BFF must resolve the point inside an authenticated, matching projection lease.
export function validateAtlasPointInspectionAgainstRequest(response, request) {
  const result = parseAtlasPointInspection(response);
  const expected = parseAtlasPointInspectionRequest(request);
  if (result.requestId !== expected.requestId) fail('pointInspection.requestId', 'does not match request');
  if (result.pointId !== expected.pointId) fail('pointInspection.pointId', 'does not match request');
  if (!atlasIdentityMatches(result.identity, expected.identity)) fail('pointInspection.identity', 'does not match request');
  return result;
}
