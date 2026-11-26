import { ATLAS_CONTRACT_VERSION, ATLAS_ERROR_CATALOG } from './constants.js';
import { assertNoForbiddenAtlasFields, contractVersion, deeplyFreeze, exactKeys, fail, literal, opaqueId, optional, safeInteger } from './validation.js';

export function createPublicResolutionError({ requestId, code, location, incidentId }) {
  const catalog=ATLAS_ERROR_CATALOG[code];if(!catalog)fail('error.code','unknown error code');
  return parseAtlasResolutionError({contractVersion:ATLAS_CONTRACT_VERSION,kind:'atlas-resolution-error',requestId,code,message:catalog.message,retryable:catalog.retryable,...(location?{location}:{}),...(incidentId?{incidentId}:{})});
}
export function parseAtlasResolutionError(value) {
  const allowed=['contractVersion','kind','requestId','code','message','retryable','location','incidentId'],required=allowed.slice(0,6);exactKeys(value,allowed,required,'error');assertNoForbiddenAtlasFields(value,'error');contractVersion(value.contractVersion,'error.contractVersion');literal(value.kind,'atlas-resolution-error','error.kind');const catalog=ATLAS_ERROR_CATALOG[value.code];if(!catalog)fail('error.code','unknown error code');if(value.message!==catalog.message||value.retryable!==catalog.retryable)fail('error','message and retryable must match safe catalog');
  let location;if(value.location!==undefined){exactKeys(value.location,['waypointIndex','segmentIndex','stopIndex'],[],'error.location');location={};for(const key of ['waypointIndex','segmentIndex','stopIndex'])if(value.location[key]!==undefined)location[key]=safeInteger(value.location[key],`error.location.${key}`);if(!Object.keys(location).length)fail('error.location','expected at least one index')}
  return deeplyFreeze({contractVersion:ATLAS_CONTRACT_VERSION,kind:'atlas-resolution-error',requestId:opaqueId(value.requestId,'error.requestId'),code:value.code,message:catalog.message,retryable:catalog.retryable,...(location?{location}:{}),...(value.incidentId!==undefined?{incidentId:opaqueId(value.incidentId,'error.incidentId')}:{})});
}
