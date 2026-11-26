import { ATLAS_CONTRACT_VERSION } from '../../shared/sonic-atlas/index.js';
export const H='sha256:'+'a'.repeat(64),H2='sha256:'+'b'.repeat(64),H3='sha256:'+'c'.repeat(64),H4='sha256:'+'d'.repeat(64),H5='sha256:'+'e'.repeat(64),H6='sha256:'+'f'.repeat(64);
export const identity={contractVersion:ATLAS_CONTRACT_VERSION,projectionId:'projection-main',projectionVersion:'projection-v1',projectionDigest:H};
export const manifest={...identity,kind:'projection-manifest',manifestDigest:H2,coordinateSpace:{kind:'cartesian-2d',bounds:{minX:-1,minY:-1,maxX:1,maxY:1}},pointCount:4,lods:[
{lod:0,columns:1,rows:1,pointCount:1,tileCount:1,tiles:[{tileX:0,tileY:0,tileDigest:H3,pointCount:1}]},
{lod:1,columns:2,rows:2,pointCount:4,tileCount:4,tiles:[{tileX:0,tileY:0,tileDigest:H3,pointCount:1},{tileX:1,tileY:0,tileDigest:H4,pointCount:1},{tileX:0,tileY:1,tileDigest:H5,pointCount:1},{tileX:1,tileY:1,tileDigest:H6,pointCount:1}]}]};
export const tile={...identity,kind:'exact-point-lod-tile',manifestDigest:H2,lod:1,tileX:0,tileY:0,tileDigest:H3,points:[{pointId:'point-a',x:-.75,y:-.75}]};
export const request={contractVersion:ATLAS_CONTRACT_VERSION,kind:'ordered-waypoint-plan-request',requestId:'request-1',waypoints:[{waypointId:'w1',pointId:'point-a'},{waypointId:'w2',pointId:'point-b'}],segmentOptions:[{fromWaypointId:'w1',toWaypointId:'w2',targetTrackCount:25,pathFixSize:false}]};
export const journey={contractVersion:ATLAS_CONTRACT_VERSION,kind:'resolved-journey',requestId:'request-1',journeyId:'journey-1',frozenRevision:1,identity:{projectionId:'projection-main',projectionVersion:'projection-v1',projectionDigest:H,resolverVersion:'resolver-v1',plannerVersion:'audiomuse-v3.3.1'},waypoints:request.waypoints,segments:[{segmentId:'segment-1',fromWaypointId:'w1',toWaypointId:'w2',targetTrackCount:25,pathFixSize:false,startStopIndex:0,endStopIndex:2,returnedTrackCount:3}],stops:[
{stopId:'stop-1',pointId:'point-a',queueItemId:'queue-1',coordinate:{x:-.75,y:-.75},playback:{trackRef:'track-a',title:'Start',artist:'Artist A'}},
{stopId:'stop-2',pointId:'point-middle',queueItemId:'queue-2',coordinate:{x:0,y:0},playback:{trackRef:'track-m',title:'Middle',artist:'Artist M',durationSeconds:180}},
{stopId:'stop-3',pointId:'point-b',queueItemId:'queue-3',coordinate:{x:.75,y:.75},playback:{trackRef:'track-b',title:'End',artist:'Artist B'}}],frozenAt:'2026-08-28T00:00:00.000Z'};
export const persisted={contractVersion:ATLAS_CONTRACT_VERSION,kind:'persisted-journey',persistenceVersion:1,journey,queueBinding:{queueInstanceId:'queue-instance-1',entries:journey.stops.map(s=>({stopId:s.stopId,queueItemId:s.queueItemId}))},extensionHistory:[],savedAt:'2026-08-28T00:01:00.000Z'};
export const clone=value=>structuredClone(value);
