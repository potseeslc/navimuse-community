import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAtlasPoint} from '../server/atlasPointInspectionService.js';
import {parseAtlasTrackRef} from '../server/atlasTrackRef.js';
const identity={contractVersion:'sonic-atlas/v1',projectionId:'p',projectionVersion:'v',projectionDigest:`sha256:${'a'.repeat(64)}`};
const request={contractVersion:'sonic-atlas/v1',kind:'atlas-point-inspection-request',requestId:'r',pointId:'point',identity};
const key=Buffer.alloc(32,1);
const point={pointId:'point',rawId:'private-id',coordinate:{x:.25,y:-.75}};
function dependencies(resolveSong=async()=>({id:'private-id',title:'Title',artist:'Artist',password:'private',path:'/private'})) {
 return {mapService:{lease:async()=>({manifest:identity,resolvePoint:id=>id==='point'?point:null})},resolveSong,trackRefKey:key};
}
test('inspection resolves inside one lease and returns a signed opaque playable reference',async()=>{
 const result=await inspectAtlasPoint(request,dependencies());
 assert.deepEqual(result.coordinate,point.coordinate);
 assert.equal(parseAtlasTrackRef(result.playback.trackRef,key).rawId,'private-id');
 assert.equal(JSON.stringify(result).includes('private'),false);
});
test('stale and absent points never trigger upstream song resolution',async()=>{
 let calls=0;const deps=dependencies(async()=>{calls++;});
 await assert.rejects(inspectAtlasPoint({...request,identity:{...identity,projectionVersion:'stale'}},deps),e=>e.atlasCode==='IDENTITY_MISMATCH');
 await assert.rejects(inspectAtlasPoint({...request,pointId:'absent'},deps),e=>e.atlasCode==='POINT_NOT_FOUND');assert.equal(calls,0);
});
test('denied or missing tracks are not inspectable and upstream identity must match',async()=>{
 for(const status of [401,403,404])await assert.rejects(inspectAtlasPoint(request,dependencies(async()=>{throw Object.assign(new Error('private detail'),{status});})),e=>e.atlasCode==='POINT_NOT_PLAYABLE'&&!e.message.includes('private'));
 await assert.rejects(inspectAtlasPoint(request,dependencies(async()=>({id:'other',title:'Title',artist:'Artist'}))),e=>e.atlasCode==='UPSTREAM_INVALID_RESPONSE');
});
test('deadline abort bounds an upstream that ignores its signal',async()=>{
 let started;const began=new Promise(resolve=>{started=resolve;});
 const controller=new AbortController();const pending=inspectAtlasPoint(request,{...dependencies(()=>{started();return new Promise(()=>{});}),signal:controller.signal});
 await began;
 controller.abort(new DOMException('deadline','TimeoutError'));
 await assert.rejects(pending,e=>e.atlasCode==='RESOLUTION_TIMEOUT'&&e.status===504);
});
