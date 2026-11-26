import { BRANCH_B_LIMITS } from './constants.js';
import { parseAtlasDataIdentity } from './identity.js';
import { assertNoForbiddenAtlasFields, deeplyFreeze, exactKeys, fail, finite, opaqueId, safeInteger, sha256, unique } from './validation.js';

function gridEdges(min, max, count, path) {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) fail(path, 'coordinate span must be finite and positive');
  const edges = Array.from({ length: count + 1 }, (_, index) => index === count ? max : min + span * (index / count));
  for (let index = 0; index < edges.length; index++) {
    if (!Number.isFinite(edges[index])) fail(path, 'grid edge is not finite');
    if (index && !(edges[index] > edges[index - 1])) fail(path, 'grid edges must be strictly increasing');
  }
  return edges;
}

export function parseProjectionManifest(value) {
  const keys = ['contractVersion','kind','projectionId','projectionVersion','projectionDigest','manifestDigest','coordinateSpace','pointCount','lods'];
  exactKeys(value, keys, keys, 'manifest');
  if (!Array.isArray(value.lods) || value.lods.length < 1 || value.lods.length > BRANCH_B_LIMITS.maxLods) fail('manifest.lods','expected bounded non-empty array');
  assertNoForbiddenAtlasFields(value, 'manifest');
  const identity = parseAtlasDataIdentity({contractVersion:value.contractVersion,projectionId:value.projectionId,projectionVersion:value.projectionVersion,projectionDigest:value.projectionDigest}, 'manifest');
  if (value.kind !== 'projection-manifest') fail('manifest.kind', 'expected projection-manifest');
  exactKeys(value.coordinateSpace, ['kind','bounds'], ['kind','bounds'], 'manifest.coordinateSpace');
  if (value.coordinateSpace.kind !== 'cartesian-2d') fail('manifest.coordinateSpace.kind','expected cartesian-2d');
  exactKeys(value.coordinateSpace.bounds,['minX','minY','maxX','maxY'],['minX','minY','maxX','maxY'],'manifest.coordinateSpace.bounds');
  const bounds = Object.fromEntries(['minX','minY','maxX','maxY'].map(key=>[key,finite(value.coordinateSpace.bounds[key],`manifest.coordinateSpace.bounds.${key}`)]));
  const pointCount=safeInteger(value.pointCount,'manifest.pointCount',{min:1}),lods=[];let previous=-1,previousPoints=0;
  for(let i=0;i<value.lods.length;i++){
    const input=value.lods[i],path=`manifest.lods[${i}]`,allowed=['lod','columns','rows','pointCount','tileCount','tiles'];exactKeys(input,allowed,allowed,path);
    if(!Array.isArray(input.tiles))fail(`${path}.tiles`,'expected complete tile index');
    const lod=safeInteger(input.lod,`${path}.lod`),columns=safeInteger(input.columns,`${path}.columns`,{min:1,max:4096}),rows=safeInteger(input.rows,`${path}.rows`,{min:1,max:4096}),count=safeInteger(input.pointCount,`${path}.pointCount`,{min:1,max:pointCount}),tileCount=safeInteger(input.tileCount,`${path}.tileCount`,{min:1});
    if(lod<=previous)fail(`${path}.lod`,'LODs must be strictly ascending');if(count<previousPoints)fail(`${path}.pointCount`,'LOD point counts must be non-decreasing');if(tileCount!==columns*rows||input.tiles.length!==tileCount)fail(`${path}.tileCount`,'must equal columns * rows and complete tile index length');
    gridEdges(bounds.minX,bounds.maxX,columns,`${path}.columns`);gridEdges(bounds.minY,bounds.maxY,rows,`${path}.rows`);
    const addresses=new Set;let indexedPoints=0;
    const tiles=input.tiles.map((tile,tileIndex)=>{const p=`${path}.tiles[${tileIndex}]`;exactKeys(tile,['tileX','tileY','tileDigest','pointCount'],['tileX','tileY','tileDigest','pointCount'],p);const tileX=safeInteger(tile.tileX,`${p}.tileX`,{max:columns-1}),tileY=safeInteger(tile.tileY,`${p}.tileY`,{max:rows-1}),address=`${tileX}/${tileY}`;if(addresses.has(address))fail(p,'duplicate tile address');addresses.add(address);const tilePointCount=safeInteger(tile.pointCount,`${p}.pointCount`,{min:0,max:BRANCH_B_LIMITS.maxTilePoints});indexedPoints+=tilePointCount;return{tileX,tileY,tileDigest:sha256(tile.tileDigest,`${p}.tileDigest`),pointCount:tilePointCount}});
    if(indexedPoints!==count)fail(`${path}.tiles`,'tile index point counts must equal LOD pointCount');
    previous=lod;previousPoints=count;lods.push({lod,columns,rows,pointCount:count,tileCount,tiles});
  }
  unique(lods.map(item=>item.lod),'manifest.lods');if(lods.at(-1).pointCount!==pointCount)fail('manifest.lods','highest-detail LOD must equal manifest pointCount');
  return deeplyFreeze({...identity,kind:'projection-manifest',manifestDigest:sha256(value.manifestDigest,'manifest.manifestDigest'),coordinateSpace:{kind:'cartesian-2d',bounds},pointCount,lods});
}

export function atlasTileRequestKey(manifestValue, lodNumber, tileX, tileY) {
  const manifest=parseProjectionManifest(manifestValue),lod=manifest.lods.find(item=>item.lod===lodNumber);if(!lod)fail('request.lod','not present in manifest');safeInteger(tileX,'request.tileX',{max:lod.columns-1});safeInteger(tileY,'request.tileY',{max:lod.rows-1});return [manifest.contractVersion,manifest.projectionId,manifest.projectionVersion,manifest.projectionDigest,manifest.manifestDigest,lodNumber,tileX,tileY].join('/');
}

export function parseExactPointLodTile(value) {
  const keys=['contractVersion','kind','projectionId','projectionVersion','projectionDigest','manifestDigest','lod','tileX','tileY','tileDigest','points'];exactKeys(value,keys,keys,'tile');if(!Array.isArray(value.points)||value.points.length>BRANCH_B_LIMITS.maxTilePoints)fail('tile.points','expected bounded point array');assertNoForbiddenAtlasFields(value,'tile');if(value.kind!=='exact-point-lod-tile')fail('tile.kind','expected exact-point-lod-tile');
  const points=value.points.map((point,index)=>{const path=`tile.points[${index}]`;exactKeys(point,['pointId','x','y'],['pointId','x','y'],path);return{pointId:opaqueId(point.pointId,`${path}.pointId`),x:finite(point.x,`${path}.x`),y:finite(point.y,`${path}.y`)}});unique(points.map(point=>point.pointId),'tile.points.pointId');
  return deeplyFreeze({contractVersion:value.contractVersion,kind:'exact-point-lod-tile',projectionId:opaqueId(value.projectionId,'tile.projectionId'),projectionVersion:opaqueId(value.projectionVersion,'tile.projectionVersion'),projectionDigest:sha256(value.projectionDigest,'tile.projectionDigest'),manifestDigest:sha256(value.manifestDigest,'tile.manifestDigest'),lod:safeInteger(value.lod,'tile.lod'),tileX:safeInteger(value.tileX,'tile.tileX'),tileY:safeInteger(value.tileY,'tile.tileY'),tileDigest:sha256(value.tileDigest,'tile.tileDigest'),points});
}

export function validateTileAgainstManifest(tileValue, manifestValue, requested = {}) {
  const tile=parseExactPointLodTile(tileValue),manifest=parseProjectionManifest(manifestValue),lod=manifest.lods.find(item=>item.lod===tile.lod);if(!lod)fail('tile.lod','not present in manifest');
  for(const key of ['contractVersion','projectionId','projectionVersion','projectionDigest','manifestDigest'])if(tile[key]!==manifest[key])fail(`tile.${key}`,'does not match manifest');
  if(tile.tileX>=lod.columns||tile.tileY>=lod.rows)fail('tile','tile address outside LOD grid');const descriptor=lod.tiles.find(item=>item.tileX===tile.tileX&&item.tileY===tile.tileY);if(!descriptor||descriptor.tileDigest!==tile.tileDigest||descriptor.pointCount!==tile.points.length)fail('tile','content identity/count does not match manifest tile index');
  if(requested.lod!==undefined&&tile.lod!==requested.lod)fail('tile.lod','does not match request');if(requested.tileX!==undefined&&tile.tileX!==requested.tileX)fail('tile.tileX','does not match request');if(requested.tileY!==undefined&&tile.tileY!==requested.tileY)fail('tile.tileY','does not match request');
  const bounds=manifest.coordinateSpace.bounds,xEdges=gridEdges(bounds.minX,bounds.maxX,lod.columns,'manifest.coordinateSpace.x'),yEdges=gridEdges(bounds.minY,bounds.maxY,lod.rows,'manifest.coordinateSpace.y'),minX=xEdges[tile.tileX],maxX=xEdges[tile.tileX+1],minY=yEdges[tile.tileY],maxY=yEdges[tile.tileY+1],lastX=tile.tileX===lod.columns-1,lastY=tile.tileY===lod.rows-1;
  for(const [index,point] of tile.points.entries())if(point.x<minX||point.x>maxX||(!lastX&&point.x===maxX)||point.y<minY||point.y>maxY||(!lastY&&point.y===maxY))fail(`tile.points[${index}]`,'coordinate outside deterministic tile bounds');
  return tile;
}

export function validatePointCoordinatesAcrossLods(tiles) {const known=new Map;for(const [tileIndex,value] of tiles.entries()){const tile=parseExactPointLodTile(value);for(const point of tile.points){const previous=known.get(point.pointId);if(previous&&(!Object.is(previous.x,point.x)||!Object.is(previous.y,point.y)))fail(`tiles[${tileIndex}].points`,'point coordinate drift across LODs');known.set(point.pointId,point)}}return true;}

export function validateProjectionTileSet(tileValues, manifestValue) {
  const manifest=parseProjectionManifest(manifestValue),addresses=new Set,pointsByLod=new Map,coordinates=new Map;
  for(const [index,value] of tileValues.entries()){const tile=validateTileAgainstManifest(value,manifest),address=`${tile.lod}/${tile.tileX}/${tile.tileY}`;if(addresses.has(address))fail(`tiles[${index}]`,'duplicate tile address');addresses.add(address);const ids=pointsByLod.get(tile.lod)||new Set;for(const point of tile.points){if(ids.has(point.pointId))fail(`tiles[${index}].points`,'point appears in multiple tiles at same LOD');ids.add(point.pointId);const previous=coordinates.get(point.pointId);if(previous&&(!Object.is(previous.x,point.x)||!Object.is(previous.y,point.y)))fail(`tiles[${index}].points`,'point coordinate drift across LODs');coordinates.set(point.pointId,point)}pointsByLod.set(tile.lod,ids)}
  for(const lod of manifest.lods){const ids=pointsByLod.get(lod.lod)||new Set,actualAddresses=[...addresses].filter(value=>value.startsWith(`${lod.lod}/`)).length;if(ids.size!==lod.pointCount)fail('tiles',`LOD ${lod.lod} union does not equal declared pointCount`);if(actualAddresses!==lod.tileCount)fail('tiles',`LOD ${lod.lod} does not include every tile address`)}
  const full=pointsByLod.get(manifest.lods.at(-1).lod);for(const lod of manifest.lods.slice(0,-1))for(const id of pointsByLod.get(lod.lod)||[])if(!full.has(id))fail('tiles','lower-detail point is absent from full-detail set');return true;
}
