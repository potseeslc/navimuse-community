import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtlasProjectionSnapshot } from '../server/atlasMapService.js';
import { createAtlasJourneyService } from '../server/atlasJourneyService.js';
import { createAtlasTrackRef } from '../server/atlasTrackRef.js';
import { createJourneyExtensionRequest, createOrderedWaypointPlanRequest, parseJourneyRevalidationResponse } from '../shared/sonic-atlas/index.js';

const payload = { projection: 'precomputed', items: [
  { item_id: 'raw-a', embedding_2d: [-1, -1] },
  { item_id: 'raw-m', embedding_2d: [0, 0] },
  { item_id: 'raw-b', embedding_2d: [1, 1] },
  { item_id: 'raw-c', embedding_2d: [.5, .5] }
] };
const key = Buffer.alloc(32, 7);
const trackKey = Buffer.alloc(32, 9);
const snapshot = buildAtlasProjectionSnapshot(payload, { aliasKey: key });
const rawByAlias = new Map(snapshot.rawIdEntries), pointByAlias = new Map(snapshot.pointEntries);
const mapService = {
  manifest: async () => snapshot.manifest,
  lease: async () => ({ manifest: snapshot.manifest, resolvePoint: pointId => rawByAlias.has(pointId) ? { pointId, rawId: rawByAlias.get(pointId), coordinate: pointByAlias.get(pointId) } : null, resolveRawId: rawId => { for (const [pointId,candidate] of rawByAlias) if(candidate===rawId) return {pointId,rawId,coordinate:pointByAlias.get(pointId)}; return null; } }),
  resolvePoint: async pointId => rawByAlias.has(pointId) ? { pointId, rawId: rawByAlias.get(pointId), coordinate: pointByAlias.get(pointId) } : null,
  resolveRawId: async rawId => { for (const [pointId, candidate] of rawByAlias) if (candidate === rawId) return { pointId, rawId, coordinate: pointByAlias.get(pointId) }; return null; }
};
const aliases = Object.fromEntries(snapshot.rawIdEntries.map(([pointId, rawId]) => [rawId, pointId]));
const songs = Object.fromEntries(['raw-a','raw-m','raw-b','raw-c'].map((id,index)=>[id,{id,title:`Song ${index}`,artist:`Artist ${index}`,album:'Album',duration:180,coverArt:'private-cover'}]));
const request = createOrderedWaypointPlanRequest({ requestId: 'request-1', waypoints: [aliases['raw-a'], aliases['raw-b']], targetTrackCount: 25 });
function service(overrides = {}) {
  return createAtlasJourneyService({
    mapService, aliasKey: key, trackRefKey: trackKey, now: () => '2026-08-28T00:00:00.000Z',
    resolveSong: async id => { if (!songs[id]) throw Object.assign(new Error('missing'), { status: 404 }); return songs[id]; },
    findSimilar: async () => [],
    planSegment: async () => ({ path: [{ item_id: 'raw-a', title: 'private' }, { item_id: 'raw-m', embedding_vector: [1] }, { item_id: 'raw-b' }] }),
    ...overrides
  });
}

test('Journey service requires the similarity provider when continuation is enabled', () => {
  assert.throws(() => createAtlasJourneyService({
    mapService,
    aliasKey: key,
    trackRefKey: trackKey,
    resolveSong: async id => songs[id],
    planSegment: async () => ({ path: [] })
  }), /dependencies/);
});

test('Journey service returns strict frozen contract with opaque ids and exact coordinates', async () => {
  const result = await service().plan(request);
  assert.equal(result.stops.length, 3);
  assert.equal(result.stops[0].pointId, aliases['raw-a']);
  assert.match(result.stops[0].playback.trackRef, /^atr1\./);
  const text = JSON.stringify(result);
  for (const secret of ['raw-a','raw-m','raw-b','private-cover','embedding_vector']) assert.equal(text.includes(secret), false);
  assert.ok(Object.isFrozen(result)); assert.equal(result.segments[0].pathFixSize, false);
});

test('Journey service enforces endpoint order, count, projection membership and playable resolution', async () => {
  await assert.rejects(() => service({ planSegment: async () => ({ path: [{ item_id: 'raw-m' }, { item_id: 'raw-b' }] }) }).plan(request), { atlasCode: 'ENDPOINT_NOT_PRESERVED' });
  await assert.rejects(() => service({ planSegment: async () => ({ path: Array.from({ length: 26 }, (_, i) => ({ item_id: i === 0 ? 'raw-a' : i === 25 ? 'raw-b' : 'raw-m' })) }) }).plan(request), { atlasCode: 'RESULT_OUT_OF_BOUNDS' });
  await assert.rejects(() => service({ planSegment: async () => ({ path: [{ item_id: 'raw-a' }, { item_id: 'outside' }, { item_id: 'raw-b' }] }) }).plan(request), { atlasCode: 'STOP_NOT_RESOLVABLE' });
  await assert.rejects(() => service({ resolveSong: async id => { if (id === 'raw-m') throw Object.assign(new Error('missing'), { status: 404 }); return songs[id]; } }).plan(request), { atlasCode: 'STOP_NOT_RESOLVABLE' });
});

test('Journey service concatenates adjacent segments with shared boundary exactly once', async () => {
  const multi = createOrderedWaypointPlanRequest({ requestId: 'request-2', waypoints: [aliases['raw-a'], aliases['raw-b'], aliases['raw-c']], targetTrackCount: 10 });
  let calls = 0;
  const planner = service({ planSegment: async ({ startRawId, pathFixSize }) => {
    calls += 1; assert.equal(pathFixSize, false);
    return { path: startRawId === 'raw-a' ? [{ item_id: 'raw-a' }, { item_id: 'raw-m' }, { item_id: 'raw-b' }] : [{ item_id: 'raw-b' }, { item_id: 'raw-c' }] };
  } });
  const result = await planner.plan(multi);
  assert.equal(calls, 2);
  assert.deepEqual(result.stops.map(stop => stop.pointId), [aliases['raw-a'], aliases['raw-m'], aliases['raw-b'], aliases['raw-c']]);
  assert.equal(result.segments[1].startStopIndex, result.segments[0].endStopIndex);
});

test('Journey extension appends a similarity-selected segment without changing the frozen prefix', async () => {
  const planner = service({
    findSimilar: async ({ seedRawId }) => {
      assert.equal(seedRawId, 'raw-b');
      return ['raw-a', 'raw-c'];
    },
    planSegment: async ({ startRawId, endRawId, targetTrackCount, pathFixSize }) => {
      assert.deepEqual({ startRawId, endRawId, targetTrackCount, pathFixSize }, {
        startRawId: 'raw-b', endRawId: 'raw-c', targetTrackCount: 10, pathFixSize: false
      });
      return { path: [{ item_id: 'raw-b' }, { item_id: 'raw-c' }] };
    }
  });
  const current = await service().plan(request);
  const extended = await planner.extend(createJourneyExtensionRequest({ requestId: 'extension-1', journey: current, targetTrackCount: 10 }));
  assert.equal(extended.journeyId, current.journeyId);
  assert.equal(extended.requestId, current.requestId);
  assert.equal(extended.frozenRevision, 2);
  assert.deepEqual(extended.stops.slice(0, current.stops.length), current.stops);
  assert.deepEqual(extended.segments.slice(0, current.segments.length), current.segments);
  assert.equal(extended.segments.at(-1).startStopIndex, current.stops.length - 1);
  assert.equal(extended.stops.at(-1).pointId, aliases['raw-c']);
  assert.equal(JSON.stringify(extended).includes('raw-'), false);
});

test('Journey extension removes already-played intermediates from a valid upstream path', async () => {
  const current = await service().plan(request);
  const planner = service({
    findSimilar: async () => ['raw-c'],
    planSegment: async () => ({ path: [
      { item_id: 'raw-b' },
      { item_id: 'raw-a' },
      { item_id: 'raw-m' },
      { item_id: 'raw-c' }
    ] })
  });
  const extended = await planner.extend(createJourneyExtensionRequest({ requestId: 'extension-overlap', journey: current, targetTrackCount: 10 }));
  assert.deepEqual(extended.stops.slice(0, current.stops.length), current.stops);
  assert.equal(extended.stops.length, current.stops.length + 1);
  assert.equal(extended.stops.at(-1).pointId, aliases['raw-c']);
  assert.equal(extended.segments.at(-1).returnedTrackCount, 2);
  assert.equal(extended.segments.at(-1).startStopIndex, current.stops.length - 1);
  assert.equal(extended.segments.at(-1).endStopIndex, current.stops.length);
});

test('Journey uses one immutable map lease even if the backing service changes',async()=>{let leases=0;const leased={...mapService,lease:async()=>{leases++;const frozen=await mapService.lease();mapService.resolveRawId=async()=>null;return frozen}};const result=await service({mapService:leased,planSegment:async()=>({path:[{item_id:'raw-a'},{item_id:'raw-b'}]})}).plan(request);assert.equal(leases,1);assert.equal(result.stops.length,2)});
test('Journey deduplicates song resolution and resolves stops with bounded concurrency',async()=>{let calls=0,active=0,maxActive=0;const repeated={...request,segmentOptions:[{...request.segmentOptions[0],targetTrackCount:10}]};const result=await service({planSegment:async()=>({path:[{item_id:'raw-a'},{item_id:'raw-m'},{item_id:'raw-m'},{item_id:'raw-b'}]}),resolveSong:async id=>{calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;return songs[id]}}).plan(repeated);assert.equal(result.stops.length,4);assert.equal(calls,3);assert.ok(maxActive<=3)});
test('Journey abort and malformed upstream ids fail with safe codes',async()=>{const controller=new AbortController;controller.abort(new DOMException('deadline','TimeoutError'));await assert.rejects(()=>service().plan(request,{signal:controller.signal}),{atlasCode:'RESOLUTION_TIMEOUT'});for(const entry of [{item_id:123},{item_id:'a',id:'b'},{item_id:'bad\u0000id'}])await assert.rejects(()=>service({planSegment:async()=>({path:[entry,{item_id:'raw-b'}]})}).plan(request),{atlasCode:'UPSTREAM_INVALID_RESPONSE'})});
test('Journey revalidation checks opaque remaining stops without exposing raw ids',async()=>{const result=await service().revalidate({contractVersion:'sonic-atlas/v1',kind:'journey-revalidation-request',requestId:'revalidate-1',projectionDigest:snapshot.manifest.projectionDigest,entries:['raw-m','raw-b'].map((rawId,index)=>({stopIndex:index+1,stopId:`stop-${index+1}`,pointId:aliases[rawId],trackRef:createAtlasTrackRef({rawId,projectionDigest:snapshot.manifest.projectionDigest},trackKey)}))});assert.equal(result.status,'valid');assert.deepEqual(result.entries.map(entry=>entry.state),['playable','playable']);assert.equal(JSON.stringify(result).includes('raw-'),false)});
test('Journey revalidation returns visible repair waypoints from the playable prefix',async()=>{const result=await service().revalidate({contractVersion:'sonic-atlas/v1',kind:'journey-revalidation-request',requestId:'revalidate-2',projectionDigest:snapshot.manifest.projectionDigest,entries:['raw-a','raw-m','raw-b'].map((rawId,index)=>({stopIndex:index,stopId:`stop-${index}`,pointId:index===1?aliases['raw-c']:aliases[rawId],trackRef:createAtlasTrackRef({rawId,projectionDigest:snapshot.manifest.projectionDigest},trackKey)}))});assert.equal(result.status,'repair-required');assert.deepEqual(result.repair.waypoints,[aliases['raw-a'],aliases['raw-b']]);assert.equal(result.repair.fromStopIndex,0);assert.equal(JSON.stringify(result).includes('raw-'),false)});
test('Journey revalidation can report stale state without inventing repair waypoints',async()=>{const staleDigest='sha256:'+'b'.repeat(64),result=await service().revalidate({contractVersion:'sonic-atlas/v1',kind:'journey-revalidation-request',requestId:'revalidate-3',projectionDigest:staleDigest,entries:['raw-m','raw-b'].map((rawId,index)=>({stopIndex:index+1,stopId:`stop-${index+1}`,pointId:aliases[rawId],trackRef:createAtlasTrackRef({rawId,projectionDigest:staleDigest},trackKey)}))});assert.equal(result.status,'repair-required');assert.equal(result.repair,undefined);assert.equal(JSON.stringify(result).includes('raw-'),false)});
test('Journey revalidation response rejects invalid stop states',()=>{assert.throws(()=>parseJourneyRevalidationResponse({contractVersion:'sonic-atlas/v1',kind:'journey-revalidation',requestId:'bad-state',status:'valid',projectionDigest:snapshot.manifest.projectionDigest,checkedAt:'2026-08-28T00:00:00.000Z',entries:[{stopIndex:0,stopId:'stop-0',state:'unknown'}]}),/expected playable or stale/)});
