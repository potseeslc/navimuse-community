import { apiJson, apiRequestUrl, jsonRequest } from './apiClient.js';
import { createJourneyExtensionRequest, createJourneyRevalidationRequest, createOrderedWaypointPlanRequest, parseAtlasResolutionError, parseJourneyRevalidationResponse, parseResolvedJourney } from '../../shared/sonic-atlas/index.js';

export function atlasTrackStreamPath(trackRef) { if(typeof trackRef!=='string'||trackRef.length<1||trackRef.length>1024)throw new TypeError('Atlas track reference is invalid');return apiRequestUrl(`/api/atlas/tracks/${encodeURIComponent(trackRef)}/stream`); }
export async function planAtlasJourney({ requestId, waypoints, targetTrackCount, signal } = {}) {
  const request=createOrderedWaypointPlanRequest({requestId,waypoints,targetTrackCount});
  try{return parseResolvedJourney(await apiJson('/api/atlas/journeys/plan',jsonRequest('POST',request,{signal,headers:{'x-requested-with':'NaviMuse','x-request-id':request.requestId}}),'Sonic Atlas could not plan that Journey.'))}catch(error){if(error?.payload)try{error.atlas=parseAtlasResolutionError(error.payload)}catch{}throw error}
}
export async function extendAtlasJourney({ requestId, journey, targetTrackCount, signal } = {}) {
  const request=createJourneyExtensionRequest({requestId,journey,targetTrackCount});
  try{return parseResolvedJourney(await apiJson('/api/atlas/journeys/extend',jsonRequest('POST',request,{signal,headers:{'x-requested-with':'NaviMuse','x-request-id':request.requestId}}),'Sonic Atlas could not extend that Journey.'))}catch(error){if(error?.payload)try{error.atlas=parseAtlasResolutionError(error.payload)}catch{}throw error}
}
export async function revalidateAtlasJourney({ requestId, projectionDigest, entries, signal } = {}) {
  const request=createJourneyRevalidationRequest({requestId,projectionDigest,entries});
  try{return parseJourneyRevalidationResponse(await apiJson('/api/atlas/journeys/revalidate',jsonRequest('POST',request,{signal,headers:{'x-requested-with':'NaviMuse','x-request-id':request.requestId}}),'Sonic Atlas could not revalidate that saved Journey.'))}catch(error){if(error?.payload)try{error.atlas=parseAtlasResolutionError(error.payload)}catch{}throw error}
}
