export const ATLAS_CONTRACT_VERSION = 'sonic-atlas/v1';
export const ATLAS_PERSISTENCE_VERSION = 1;
export const BRANCH_B_LIMITS = Object.freeze({
  minWaypoints: 2,
  maxWaypoints: 20,
  minTracksPerSegment: 10,
  defaultTracksPerSegment: 25,
  maxTracksPerSegment: 50,
  pathFixSize: false,
  maxTilePoints: 50_000,
  maxLods: 32,
  maxStops: 1_000,
  maxPublicMessageLength: 240
});

export const ATLAS_ERROR_CATALOG = Object.freeze({
  POINT_NOT_FOUND: Object.freeze({ message: 'This track is no longer in the Atlas projection.', retryable: false }),
  POINT_NOT_PLAYABLE: Object.freeze({ message: 'This Atlas track cannot be played.', retryable: false }),
  INVALID_REQUEST: Object.freeze({ message: 'The Journey request is invalid.', retryable: false }),
  UNSUPPORTED_CONTRACT: Object.freeze({ message: 'This Sonic Atlas contract version is not supported.', retryable: false }),
  IDENTITY_MISMATCH: Object.freeze({ message: 'Sonic Atlas data changed and must be reloaded.', retryable: true }),
  WAYPOINT_NOT_FOUND: Object.freeze({ message: 'A Journey waypoint is no longer available.', retryable: false }),
  WAYPOINT_NOT_PLAYABLE: Object.freeze({ message: 'A Journey waypoint cannot be played.', retryable: false }),
  ENDPOINT_NOT_PRESERVED: Object.freeze({ message: 'The planned Journey did not preserve its requested endpoints.', retryable: true }),
  STOP_NOT_RESOLVABLE: Object.freeze({ message: 'A Journey stop could not be resolved.', retryable: true }),
  STOP_NOT_PLAYABLE: Object.freeze({ message: 'A Journey stop cannot be played.', retryable: false }),
  RESULT_OUT_OF_BOUNDS: Object.freeze({ message: 'The planned Journey is outside the requested bounds.', retryable: true }),
  UPSTREAM_UNAVAILABLE: Object.freeze({ message: 'The Journey service is temporarily unavailable.', retryable: true }),
  UPSTREAM_INVALID_RESPONSE: Object.freeze({ message: 'The Journey service returned an invalid result.', retryable: true }),
  RESOLUTION_TIMEOUT: Object.freeze({ message: 'Journey resolution timed out.', retryable: true }),
  JOURNEY_STALE: Object.freeze({ message: 'This saved Journey needs to be revalidated.', retryable: true })
});
