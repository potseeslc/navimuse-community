import { ATLAS_CONTRACT_VERSION, BRANCH_B_LIMITS } from './constants.js';
import { assertNoForbiddenAtlasFields, contractVersion, deeplyFreeze, exactKeys, fail, isoTimestamp, literal, opaqueId, opaqueReference, safeInteger, sha256, unique } from './validation.js';

const REVALIDATION_LIMIT = BRANCH_B_LIMITS.maxStops;

function parseEntry(value, index) {
  const path = `journeyRevalidation.entries[${index}]`;
  exactKeys(value, ['stopIndex', 'stopId', 'pointId', 'trackRef'], ['stopIndex', 'stopId', 'pointId', 'trackRef'], path);
  return deeplyFreeze({
    stopIndex: safeInteger(value.stopIndex, `${path}.stopIndex`, { min: 0, max: BRANCH_B_LIMITS.maxStops - 1 }),
    stopId: opaqueId(value.stopId, `${path}.stopId`),
    pointId: opaqueId(value.pointId, `${path}.pointId`),
    trackRef: opaqueReference(value.trackRef, `${path}.trackRef`)
  });
}

export function createJourneyRevalidationRequest({ requestId, projectionDigest, entries } = {}) {
  return parseJourneyRevalidationRequest({
    contractVersion: ATLAS_CONTRACT_VERSION,
    kind: 'journey-revalidation-request',
    requestId,
    projectionDigest,
    entries
  });
}

export function parseJourneyRevalidationRequest(value) {
  exactKeys(value, ['contractVersion', 'kind', 'requestId', 'projectionDigest', 'entries'], ['contractVersion', 'kind', 'requestId', 'projectionDigest', 'entries'], 'journeyRevalidation');
  assertNoForbiddenAtlasFields(value, 'journeyRevalidation');
  contractVersion(value.contractVersion, 'journeyRevalidation.contractVersion');
  literal(value.kind, 'journey-revalidation-request', 'journeyRevalidation.kind');
  if (!Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > REVALIDATION_LIMIT) fail('journeyRevalidation.entries', 'expected bounded non-empty array');
  const entries = value.entries.map(parseEntry);
  unique(entries.map(entry => entry.stopId), 'journeyRevalidation.entries.stopId');
  for (let index = 1; index < entries.length; index++) {
    if (entries[index].stopIndex !== entries[index - 1].stopIndex + 1) fail('journeyRevalidation.entries', 'stop indexes must be contiguous');
  }
  return deeplyFreeze({
    contractVersion: ATLAS_CONTRACT_VERSION,
    kind: 'journey-revalidation-request',
    requestId: opaqueId(value.requestId, 'journeyRevalidation.requestId'),
    projectionDigest: sha256(value.projectionDigest, 'journeyRevalidation.projectionDigest'),
    entries
  });
}

function parseRepair(value) {
  if (value === undefined) return undefined;
  exactKeys(value, ['fromStopIndex', 'reason', 'waypoints', 'targetTrackCount'], ['fromStopIndex', 'reason', 'waypoints', 'targetTrackCount'], 'journeyRevalidation.repair');
  if (!Array.isArray(value.waypoints) || value.waypoints.length < 2 || value.waypoints.length > BRANCH_B_LIMITS.maxWaypoints) fail('journeyRevalidation.repair.waypoints', 'expected bounded ordered waypoints');
  return deeplyFreeze({
    fromStopIndex: safeInteger(value.fromStopIndex, 'journeyRevalidation.repair.fromStopIndex', { max: BRANCH_B_LIMITS.maxStops - 1 }),
    reason: opaqueId(value.reason, 'journeyRevalidation.repair.reason'),
    waypoints: value.waypoints.map((pointId, index) => opaqueId(pointId, `journeyRevalidation.repair.waypoints[${index}]`)),
    targetTrackCount: safeInteger(value.targetTrackCount, 'journeyRevalidation.repair.targetTrackCount', { min: BRANCH_B_LIMITS.minTracksPerSegment, max: BRANCH_B_LIMITS.maxTracksPerSegment })
  });
}

export function parseJourneyRevalidationResponse(value) {
  exactKeys(value, ['contractVersion', 'kind', 'requestId', 'status', 'projectionDigest', 'checkedAt', 'entries', 'repair'], ['contractVersion', 'kind', 'requestId', 'status', 'projectionDigest', 'checkedAt', 'entries'], 'journeyRevalidation');
  assertNoForbiddenAtlasFields(value, 'journeyRevalidation');
  contractVersion(value.contractVersion, 'journeyRevalidation.contractVersion');
  literal(value.kind, 'journey-revalidation', 'journeyRevalidation.kind');
  if (value.status !== 'valid' && value.status !== 'repair-required') fail('journeyRevalidation.status', 'expected valid or repair-required');
  const status = value.status;
  if (!Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > REVALIDATION_LIMIT) fail('journeyRevalidation.entries', 'expected bounded non-empty array');
  const entries = value.entries.map((entry, index) => {
    const path = `journeyRevalidation.entries[${index}]`;
    exactKeys(entry, ['stopIndex', 'stopId', 'state'], ['stopIndex', 'stopId', 'state'], path);
    return deeplyFreeze({
      stopIndex: safeInteger(entry.stopIndex, `${path}.stopIndex`, { min: 0, max: BRANCH_B_LIMITS.maxStops - 1 }),
      stopId: opaqueId(entry.stopId, `${path}.stopId`),
      state: (() => { if (entry.state !== 'playable' && entry.state !== 'stale') fail(`${path}.state`, 'expected playable or stale'); return entry.state; })()
    });
  });
  return deeplyFreeze({
    contractVersion: ATLAS_CONTRACT_VERSION,
    kind: 'journey-revalidation',
    requestId: opaqueId(value.requestId, 'journeyRevalidation.requestId'),
    status,
    projectionDigest: sha256(value.projectionDigest, 'journeyRevalidation.projectionDigest'),
    checkedAt: isoTimestamp(value.checkedAt, 'journeyRevalidation.checkedAt'),
    entries,
    ...(value.repair !== undefined ? { repair: parseRepair(value.repair) } : {})
  });
}
