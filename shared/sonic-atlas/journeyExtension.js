import { ATLAS_CONTRACT_VERSION, BRANCH_B_LIMITS } from './constants.js';
import { parseResolvedJourney } from './resolvedJourney.js';
import { assertNoForbiddenAtlasFields, contractVersion, deeplyFreeze, exactKeys, literal, opaqueId, safeInteger } from './validation.js';

export function createJourneyExtensionRequest({ requestId, journey, targetTrackCount = BRANCH_B_LIMITS.minTracksPerSegment } = {}) {
  return parseJourneyExtensionRequest({
    contractVersion: ATLAS_CONTRACT_VERSION,
    kind: 'journey-extension-request',
    requestId,
    journey,
    targetTrackCount
  });
}

export function parseJourneyExtensionRequest(value) {
  const keys = ['contractVersion', 'kind', 'requestId', 'journey', 'targetTrackCount'];
  exactKeys(value, keys, keys, 'journeyExtension');
  assertNoForbiddenAtlasFields(value, 'journeyExtension', { maxNodes: 60_000 });
  contractVersion(value.contractVersion, 'journeyExtension.contractVersion');
  literal(value.kind, 'journey-extension-request', 'journeyExtension.kind');
  return deeplyFreeze({
    contractVersion: ATLAS_CONTRACT_VERSION,
    kind: 'journey-extension-request',
    requestId: opaqueId(value.requestId, 'journeyExtension.requestId'),
    journey: parseResolvedJourney(value.journey),
    targetTrackCount: safeInteger(value.targetTrackCount, 'journeyExtension.targetTrackCount', {
      min: BRANCH_B_LIMITS.minTracksPerSegment,
      max: BRANCH_B_LIMITS.maxTracksPerSegment
    })
  });
}
