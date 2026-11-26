import {createHmac} from 'node:crypto';
import {createAtlasMapService} from './atlasMapService.js';
import {createAtlasJourneyService} from './atlasJourneyService.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pair=(serverId,username)=>JSON.stringify([serverId,username]);
async function resolveSong(request,rawId,signal) {
  const deadline=AbortSignal.timeout(8000);
  const response=await request('/rest/getSong.view',{id:rawId},{signal:signal?AbortSignal.any([signal,deadline]):deadline});
  if (!response.ok || !response.body) {await response.body?.cancel();throw new Error('Song unavailable');}
  const reader=response.body.getReader();let size=0;const chunks=[];
  try {
    for (;;) {
      const {done,value}=await reader.read();if (done) break;
      size+=value.byteLength;if (size>1024*1024) throw new Error('Song unavailable');chunks.push(Buffer.from(value));
    }
    const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)))?.['subsonic-response'];
    if (body?.status!=='ok' || !body.song || body.song.id!==rawId) throw new Error('Song unavailable');
    return body.song;
  } finally {try {await reader.cancel();} catch {}reader.releaseLock();}
}


// Private startup grants. The operator explicitly authorizes the entire dataset
// for this upstream identity; a valid music session alone never grants its map.
export function createAccountAtlasAccess({upstreamAccess,secret,datasets=[],maxScopes=4}) {
  if (typeof upstreamAccess?.withUpstream!=='function' || !Buffer.isBuffer(secret) || secret.length!==32 ||
      !Array.isArray(datasets) || datasets.length>256 || !Number.isSafeInteger(maxScopes) || maxScopes<1 || maxScopes>16) throw new TypeError('Invalid account Atlas configuration');
  const key=Buffer.from(secret),grants=new Map(),scopes=new Map();
  for (const data of datasets) {
    const fields=['serverId','username','datasetId','revision','grantFullProjection','fetchMap','planSegment','findSimilar'];
    if (!data || typeof data!=='object' || Object.keys(data).length!==fields.length || fields.some(field=>!Object.hasOwn(data,field)) ||
        typeof data.serverId!=='string' || !uuid.test(data.serverId) || typeof data.datasetId!=='string' || !uuid.test(data.datasetId) || typeof data.username!=='string' || !data.username.isWellFormed() ||
        !data.username.trim() || data.username!==data.username.trim() || Buffer.byteLength(data.username)>256 || /[\u0000-\u001f\u007f]/.test(data.username) ||
        !Number.isSafeInteger(data.revision) || data.revision<1 || data.grantFullProjection!==true ||
        ['fetchMap','planSegment','findSimilar'].some(field=>typeof data[field]!=='function') || grants.has(pair(data.serverId,data.username))) throw new TypeError('Invalid account Atlas configuration');
    grants.set(pair(data.serverId,data.username),Object.freeze({...data}));
  }
  async function withAtlas(token,operation) {
    if (typeof operation!=='function') throw new TypeError('Invalid Atlas operation');
    const authorized=await upstreamAccess.withUpstream(token,async(request,identity)=>{
      const data=grants.get(pair(identity.upstream.serverId,identity.upstream.username));
      if (!data) return {ok:false,code:'ATLAS_UNASSIGNED'};
      const scopeId=JSON.stringify([identity.queueScope,identity.bindingRevision,data.datasetId,data.revision]);
      let scope=scopes.get(scopeId);
      if (!scope) {
        if (scopes.size>=maxScopes) {
          const idle=[...scopes].find(([,value])=>value.active===0);
          if (!idle) return {ok:false,code:'ATLAS_BUSY'};
          idle[1].services.map.invalidate();scopes.delete(idle[0]);
        }
        const derive=purpose=>createHmac('sha256',key).update('navimuse-account-atlas:v1\0').update(purpose).update('\0').update(scopeId).digest();
        const trackKey=derive('track'),map=createAtlasMapService({fetchMap:data.fetchMap,aliasKey:derive('point')});
        const journey=createAtlasJourneyService({mapService:map,aliasKey:derive('journey'),trackRefKey:trackKey,
          planSegment:data.planSegment,findSimilar:data.findSimilar,
          resolveSong:(rawId,{signal}={})=>resolveSong(request,rawId,signal)});
        scope={active:0,services:Object.freeze({map,journey,trackRefKey:()=>Buffer.from(trackKey)})};
        scopes.set(scopeId,scope);
      }
      // LRU among idle entries; active operations cannot be evicted or replaced.
      scopes.delete(scopeId);scopes.set(scopeId,scope);scope.active++;
      try {return {ok:true,value:await operation(scope.services)};}
      catch {return {ok:false,code:'ATLAS_UNAVAILABLE'};}
      finally {scope.active--;}
    });
    return authorized.ok?authorized.value:authorized;
  }
  return Object.freeze({withAtlas});
}
