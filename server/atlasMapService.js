import { createHash, createHmac } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import {
  ATLAS_CONTRACT_VERSION,
  createPublicResolutionError,
  parseExactPointLodTile,
  parseProjectionManifest,
  validateTileAgainstManifest
} from '../shared/sonic-atlas/index.js';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_UPSTREAM_POINTS = 500_000;
const LOD_POLICIES = Object.freeze([
  Object.freeze({ lod: 0, columns: 8, rows: 8, maxPointsPerTile: 128 }),
  Object.freeze({ lod: 1, columns: 16, rows: 16, maxPointsPerTile: 512 }),
  Object.freeze({ lod: 2, columns: 32, rows: 32, maxPointsPerTile: Infinity })
]);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
function digest(value) { return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`; }
function opaquePointId(rawId, aliasKey) { return createHmac('sha256', aliasKey).update('sonic-atlas-point-v1\0').update(rawId).digest('hex'); }
function finiteCoordinate(value, path) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`); return value === 0 ? 0 : value; }
function tileIndex(value, min, max, count) { if (value === max) return count - 1; return Math.max(0, Math.min(count - 1, Math.floor(((value - min) / (max - min)) * count))); }
function tileAddress(x, y) { return `${x}/${y}`; }
function safeProjectionLabel(value) { const label=String(value||'precomputed').toLowerCase().replace(/[^a-z0-9._~-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);return label||'precomputed'; }

export function normalizeAudioMuseMap(payload, aliasKey) {
  if (!Buffer.isBuffer(aliasKey) || aliasKey.length < 32) throw new TypeError('Atlas alias key must be at least 32 bytes');
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > MAX_UPSTREAM_POINTS) throw new TypeError('AudioMuse map payload is unavailable or outside bounds');
  const ids=new Set,points=[],rawIdEntries=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const [index,item] of payload.items.entries()) {
    if (!item || typeof item.item_id !== 'string' || item.item_id.length < 1 || item.item_id.length > 512 || !Array.isArray(item.embedding_2d) || item.embedding_2d.length !== 2) throw new TypeError(`AudioMuse map item ${index} is invalid`);
    const pointId=opaquePointId(item.item_id,aliasKey);if(ids.has(pointId))throw new TypeError('AudioMuse map contains duplicate item identifiers');ids.add(pointId);
    const x=finiteCoordinate(item.embedding_2d[0],`items[${index}].x`),y=finiteCoordinate(item.embedding_2d[1],`items[${index}].y`);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);points.push({pointId,x,y});rawIdEntries.push([pointId,item.item_id]);
  }
  if (!(minX<maxX&&minY<maxY)) throw new TypeError('AudioMuse map coordinate bounds are degenerate');
  points.sort((a,b)=>a.pointId < b.pointId ? -1 : a.pointId > b.pointId ? 1 : 0);
  return Object.freeze({projectionLabel:safeProjectionLabel(payload.projection),bounds:Object.freeze({minX,minY,maxX,maxY}),points:Object.freeze(points.map(Object.freeze)),rawIdEntries:Object.freeze(rawIdEntries.map(Object.freeze))});
}

function selectLodPoints(allPoints, bounds, policy) {
  const buckets=new Map;
  for(const point of allPoints){const x=tileIndex(point.x,bounds.minX,bounds.maxX,policy.columns),y=tileIndex(point.y,bounds.minY,bounds.maxY,policy.rows),key=tileAddress(x,y),bucket=buckets.get(key)||[];bucket.push(point);buckets.set(key,bucket)}
  const selected=new Map;
  for(let y=0;y<policy.rows;y++)for(let x=0;x<policy.columns;x++){const key=tileAddress(x,y),bucket=buckets.get(key)||[];selected.set(key,Number.isFinite(policy.maxPointsPerTile)?bucket.slice(0,policy.maxPointsPerTile):bucket)}
  return selected;
}

export function buildAtlasProjectionSnapshot(payload, { aliasKey, generatedAt = new Date().toISOString() } = {}) {
  const normalized=normalizeAudioMuseMap(payload,aliasKey),projectionCore={method:normalized.projectionLabel,bounds:normalized.bounds,points:normalized.points},projectionDigest=digest(projectionCore),projectionId='audiomuse-main-map',projectionVersion=`${normalized.projectionLabel}-${projectionDigest.slice(-16)}`;
  const tileDrafts=[],lodDrafts=[];
  for(const policy of LOD_POLICIES){const buckets=selectLodPoints(normalized.points,normalized.bounds,policy);let pointCount=0;const descriptors=[];for(let y=0;y<policy.rows;y++)for(let x=0;x<policy.columns;x++){const points=buckets.get(tileAddress(x,y))||[];pointCount+=points.length;const tileCore={contractVersion:ATLAS_CONTRACT_VERSION,kind:'exact-point-lod-tile',projectionId,projectionVersion,projectionDigest,lod:policy.lod,tileX:x,tileY:y,points},tileDigest=digest(tileCore);descriptors.push({tileX:x,tileY:y,tileDigest,pointCount:points.length});tileDrafts.push({...tileCore,tileDigest})}lodDrafts.push({lod:policy.lod,columns:policy.columns,rows:policy.rows,pointCount,tileCount:policy.columns*policy.rows,tiles:descriptors})}
  const manifestCore={contractVersion:ATLAS_CONTRACT_VERSION,kind:'projection-manifest',projectionId,projectionVersion,projectionDigest,coordinateSpace:{kind:'cartesian-2d',bounds:normalized.bounds},pointCount:normalized.points.length,lods:lodDrafts},manifestDigest=digest(manifestCore),manifest=parseProjectionManifest({...manifestCore,manifestDigest}),tiles=new Map;
  for(const draft of tileDrafts){const tile=parseExactPointLodTile({...draft,manifestDigest}),lod=manifest.lods.find(item=>item.lod===tile.lod),descriptor=lod?.tiles.find(item=>item.tileX===tile.tileX&&item.tileY===tile.tileY);if(!descriptor||descriptor.tileDigest!==tile.tileDigest||descriptor.pointCount!==tile.points.length)throw new TypeError('Generated Atlas tile does not match manifest index');tiles.set(tileAddressKey(tile.lod,tile.tileX,tile.tileY),tile)}
  return Object.freeze({manifest,tiles,generatedAt,sourcePointCount:normalized.points.length,rawIdEntries:normalized.rawIdEntries,reverseRawIdEntries:normalized.rawIdEntries.map(([pointId,rawId])=>[rawId,pointId]),pointEntries:normalized.points.map(point=>[point.pointId,point])});
}
function tileAddressKey(lod,x,y){return `${lod}/${x}/${y}`;}

export function buildAtlasProjectionSnapshotInWorker(payload, aliasKey) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./atlasMapWorker.js', import.meta.url));
    worker.once('message', result => { worker.terminate(); result.ok ? resolve(Object.freeze({ manifest: result.manifest, tiles: new Map(result.tiles), generatedAt: result.generatedAt, sourcePointCount: result.sourcePointCount, rawIds: new Map(result.rawIdEntries), pointIdsByRawId: new Map(result.reverseRawIdEntries), points: new Map(result.pointEntries) })) : reject(Object.assign(new Error(result.message), { atlasCode: 'UPSTREAM_INVALID_RESPONSE', status: 502 })); });
    worker.once('error', error => { worker.terminate(); reject(Object.assign(new Error('Atlas snapshot worker failed'), { atlasCode: 'UPSTREAM_INVALID_RESPONSE', status: 502, cause: error })); });
    worker.postMessage({ payload, aliasKey });
  });
}

export function createAtlasMapService({ fetchMap, aliasKey, ttlMs = DEFAULT_TTL_MS, now = () => Date.now(), buildSnapshot = buildAtlasProjectionSnapshotInWorker } = {}) {
  if (typeof fetchMap !== 'function') throw new TypeError('fetchMap is required');
  let snapshot=null,pending=null,expiresAt=0,generation=0;
  async function refresh(refreshGeneration){const payload=await fetchMap(),resolvedAliasKey=typeof aliasKey==='function'?aliasKey():aliasKey;const value=await buildSnapshot(payload,resolvedAliasKey);if(refreshGeneration!==generation)throw Object.assign(new Error('Atlas refresh was superseded'),{atlasCode:'IDENTITY_MISMATCH',status:409});return value;}
  async function current({force=false}={}){if(!force&&snapshot&&now()<expiresAt)return snapshot;if(!pending||pending.generation!==generation){const record={generation,promise:null};record.promise=refresh(record.generation).then(value=>{if(record.generation!==generation)throw Object.assign(new Error('Atlas refresh was superseded'),{atlasCode:'IDENTITY_MISMATCH',status:409});snapshot=value;expiresAt=now()+ttlMs;return value}).finally(()=>{if(pending===record)pending=null});pending=record}return pending.promise;}
  return Object.freeze({
    async manifest(options){return (await current(options)).manifest;},
    async tile(lod,x,y,options){const snap=await current(options),tile=snap.tiles.get(tileAddressKey(lod,x,y));if(!tile)throw Object.assign(new Error('Atlas tile not found'),{atlasCode:'INVALID_REQUEST',status:404});return tile;},
    async resolvePoint(pointId,options){const snap=await current(options),rawId=snap.rawIds.get(pointId),point=snap.points.get(pointId);return rawId&&point?Object.freeze({pointId,rawId,coordinate:Object.freeze({x:point.x,y:point.y}),identity:snap.manifest}):null;},
    async resolveRawId(rawId,options){const snap=await current(options),pointId=snap.pointIdsByRawId.get(rawId),point=snap.points.get(pointId);return pointId&&point?Object.freeze({pointId,rawId,coordinate:Object.freeze({x:point.x,y:point.y}),identity:snap.manifest}):null;},
    async lease(options){const snap=await current(options);return Object.freeze({manifest:snap.manifest,resolvePoint(pointId){const rawId=snap.rawIds.get(pointId),point=snap.points.get(pointId);return rawId&&point?Object.freeze({pointId,rawId,coordinate:Object.freeze({x:point.x,y:point.y})}):null},resolveRawId(rawId){const pointId=snap.pointIdsByRawId.get(rawId),point=snap.points.get(pointId);return pointId&&point?Object.freeze({pointId,rawId,coordinate:Object.freeze({x:point.x,y:point.y})}):null}});},
    invalidate(){generation+=1;snapshot=null;expiresAt=0;pending=null;},
    status(){return Object.freeze({ready:Boolean(snapshot),expiresAt,manifestDigest:snapshot?.manifest.manifestDigest||null,pointCount:snapshot?.manifest.pointCount||0});}
  });
}

export function atlasPublicError(error, requestId = 'atlas-request') {
  const code=error?.atlasCode||(/timeout/i.test(error?.name||'')?'RESOLUTION_TIMEOUT':'UPSTREAM_UNAVAILABLE');
  return createPublicResolutionError({requestId,code,incidentId:`incident-${createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0,20)}`});
}
