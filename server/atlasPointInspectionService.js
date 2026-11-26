import { atlasIdentityMatches, parseAtlasPointInspectionRequest, validateAtlasPointInspectionAgainstRequest } from '../shared/sonic-atlas/index.js';
import { createAtlasTrackRef } from './atlasTrackRef.js';

export class AtlasPointInspectionError extends Error {
  constructor(atlasCode, status) { super(atlasCode); this.atlasCode = atlasCode; this.status = status; }
}
const failure = (code, status) => new AtlasPointInspectionError(code, status);
function abortError(signal) {
  return failure(signal?.reason?.name === 'TimeoutError' ? 'RESOLUTION_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', signal?.reason?.name === 'TimeoutError' ? 504 : 499);
}
async function bounded(operation, signal) {
  if (signal?.aborted) throw abortError(signal);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(abortError(signal));
    signal?.addEventListener('abort', onAbort, {once:true});
  });
  try { return await Promise.race([Promise.resolve().then(operation), aborted]); }
  finally { signal?.removeEventListener('abort', onAbort); }
}

export async function inspectAtlasPoint(input, {mapService, resolveSong, trackRefKey, signal} = {}) {
  const request = parseAtlasPointInspectionRequest(input);
  if (!mapService?.lease || typeof resolveSong !== 'function' || !Buffer.isBuffer(trackRefKey) || trackRefKey.length !== 32) throw new TypeError('Atlas inspection dependencies are required');
  let lease;
  try { lease = await bounded(() => mapService.lease({signal}), signal); }
  catch (error) { if (error instanceof AtlasPointInspectionError) throw error; throw failure('UPSTREAM_UNAVAILABLE', 502); }
  const identity = {contractVersion:'sonic-atlas/v1', projectionId:lease.manifest.projectionId, projectionVersion:lease.manifest.projectionVersion, projectionDigest:lease.manifest.projectionDigest};
  if (!atlasIdentityMatches(identity, request.identity)) throw failure('IDENTITY_MISMATCH', 409);
  const point = lease.resolvePoint(request.pointId);
  if (!point) throw failure('POINT_NOT_FOUND', 404);
  let song;
  try { song = await bounded(() => resolveSong(point.rawId, {signal}), signal); }
  catch (error) {
    if (error instanceof AtlasPointInspectionError) throw error;
    if ([401,403,404].includes(error?.status)) throw failure('POINT_NOT_PLAYABLE', 404);
    throw failure('UPSTREAM_UNAVAILABLE', 502);
  }
  if (signal?.aborted) throw abortError(signal);
  if (!song || song.id !== point.rawId || typeof song.title !== 'string' || !song.title.trim() || typeof song.artist !== 'string' || !song.artist.trim()) throw failure('UPSTREAM_INVALID_RESPONSE', 502);
  const duration = Number(song.duration);
  const playback = {
    trackRef:createAtlasTrackRef({rawId:point.rawId, projectionDigest:identity.projectionDigest}, trackRefKey),
    title:song.title.trim().slice(0,300), artist:song.artist.trim().slice(0,300),
    ...(typeof song.album === 'string' && song.album.trim() ? {album:song.album.trim().slice(0,300)} : {}),
    ...(Number.isFinite(duration) && duration >= 0 ? {durationSeconds:duration} : {})
  };
  return validateAtlasPointInspectionAgainstRequest({...request, kind:'atlas-point-inspection', coordinate:{x:point.coordinate.x,y:point.coordinate.y}, playback}, request);
}
