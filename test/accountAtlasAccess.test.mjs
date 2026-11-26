import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createAccountUpstreamAccess} from '../server/accountUpstreamAccess.mjs';
import {createAccountAtlasAccess} from '../server/accountAtlasAccess.mjs';
import {createOrderedWaypointPlanRequest} from '../shared/sonic-atlas/index.js';
import {createAtlasTrackRef,parseAtlasTrackRef} from '../server/atlasTrackRef.js';
import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';
const binding={serverId:'10000000-0000-4000-8000-000000000001',username:'MusicOwner',credentialRef:'music-owner'};
const otherBinding={...binding,username:'OtherMusic',credentialRef:'other-music'};
const payload={projection:'fixture',items:[{item_id:'a',embedding_2d:[0,0]},{item_id:'b',embedding_2d:[1,1]}]};
async function fixture(t,maxScopes=4) {
 const dir=await mkdtemp(join(tmpdir(),'navimuse-atlas-access-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await openAccountStoreWorker(dir);t.after(()=>store.close());
 const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential);
 const listener=await store.createListener(owner.id,{username:'listener',displayName:'Listener'},credential);
 const issue=async id=>(await store.issuePasswordSession(id,{expectedGeneration:(await store.getAccount(id)).authorizationGeneration,expectedRevision:1,remember:false})).token;
 const approve=async(id,selected=binding)=>store.setUpstreamBinding(owner.id,id,{expectedRevision:0,binding:selected});
 const secret=randomBytes(32);let mapCalls=0,songCalls=0,songResponse=id=>new Response(JSON.stringify({'subsonic-response':{status:'ok',song:{id,title:id,artist:'Fixture',duration:100}}}));
 const upstreamAccess=createAccountUpstreamAccess({store,queueSecret:secret,clients:[binding,otherBinding].map(value=>({...value,request:async(path,params)=>{assert.equal(path,'/rest/getSong.view');songCalls++;return songResponse(params.id);}}))});
 const data={serverId:binding.serverId,username:binding.username,datasetId:'20000000-0000-4000-8000-000000000002',revision:1,grantFullProjection:true,
  fetchMap:async()=>{mapCalls++;return payload;},planSegment:async({startRawId,endRawId})=>({path:[{item_id:startRawId},{item_id:endRawId}]}),findSimilar:async()=>[]};
 const atlas=createAccountAtlasAccess({upstreamAccess,secret,datasets:[data],maxScopes});
 return {store,owner,listener,approve,issue,atlas,data,upstreamAccess,secret,mapCalls:()=>mapCalls,songCalls:()=>songCalls,setSongResponse:value=>{songResponse=value;}};
}
test('real account sessions isolate map snapshots, point aliases and encrypted references',async t=>{
 const f=await fixture(t);await f.approve(f.owner.id);await f.approve(f.listener.id);
 const a=await f.issue(f.owner.id),b=await f.issue(f.listener.id);
 const view=async({map,trackRefKey})=>{
  const lease=await map.lease(),point=lease.resolveRawId('a');
  return {manifest:lease.manifest,point:point.pointId,key:trackRefKey()};
 };
 const [ra,rb]=await Promise.all([f.atlas.withAtlas(a,view),f.atlas.withAtlas(b,view)]);
 assert.equal(ra.ok,true);assert.equal(rb.ok,true);assert.equal(f.mapCalls(),2);
 assert.notEqual(ra.value.point,rb.value.point);assert.notEqual(ra.value.manifest.projectionDigest,rb.value.manifest.projectionDigest);
 const ref=createAtlasTrackRef({rawId:'a',projectionDigest:ra.value.manifest.projectionDigest},ra.value.key);
 assert.equal(parseAtlasTrackRef(ref,rb.value.key),null);
 const foreign=await f.atlas.withAtlas(b,async({map})=>map.resolvePoint(ra.value.point));assert.equal(foreign.value,null);
 await f.atlas.withAtlas(a,view);assert.equal(f.mapCalls(),2);
 await f.store.setUpstreamBinding(f.owner.id,f.listener.id,{expectedRevision:1,binding:null});
 assert.deepEqual(await f.atlas.withAtlas(b,view),{ok:false,code:'SIGN_IN_REQUIRED'});assert.equal(f.mapCalls(),2);
 await f.store.setUpstreamBinding(f.owner.id,f.listener.id,{expectedRevision:2,binding});
 const rebound=await f.atlas.withAtlas(await f.issue(f.listener.id),view);
 assert.equal(rebound.ok,true);assert.notEqual(rebound.value.point,rb.value.point);
 const oldRef=createAtlasTrackRef({rawId:'a',projectionDigest:rb.value.manifest.projectionDigest},rb.value.key);
 assert.equal(parseAtlasTrackRef(oldRef,rebound.value.key),null);assert.equal(f.mapCalls(),3);
});
test('music approval alone grants no Atlas dataset and input IDs cannot act as sessions',async t=>{
 const f=await fixture(t);await f.approve(f.owner.id);const token=await f.issue(f.owner.id);
 const absent=createAccountAtlasAccess({upstreamAccess:f.upstreamAccess,secret:f.secret});
 assert.deepEqual(await absent.withAtlas(token,()=>assert.fail()),{ok:false,code:'ATLAS_UNASSIGNED'});
 assert.deepEqual(await f.atlas.withAtlas(f.owner.id,()=>assert.fail()),{ok:false,code:'SIGN_IN_REQUIRED'});
 const wrong=createAccountAtlasAccess({upstreamAccess:f.upstreamAccess,secret:f.secret,datasets:[{...f.data,username:'musicowner'}]});
 assert.deepEqual(await wrong.withAtlas(token,()=>assert.fail()),{ok:false,code:'ATLAS_UNASSIGNED'});assert.equal(f.mapCalls(),0);
 for(const datasets of [[{...f.data,grantFullProjection:false}],[f.data,f.data],[{...f.data,revision:0}]]) {
  assert.throws(()=>createAccountAtlasAccess({upstreamAccess:f.upstreamAccess,secret:f.secret,datasets}),/Invalid account Atlas configuration/);
 }
});
test('busy scopes cannot be evicted and failed operations release capacity without sharing data',async t=>{
 const f=await fixture(t,1);await f.approve(f.owner.id);await f.approve(f.listener.id);
 const a=await f.issue(f.owner.id),b=await f.issue(f.listener.id);let release,entered;
 const waiting=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const pending=f.atlas.withAtlas(a,async()=>{entered();await gate;throw new Error('private dataset details');});
 await waiting;
 try {assert.deepEqual(await f.atlas.withAtlas(b,()=>assert.fail()),{ok:false,code:'ATLAS_BUSY'});}
 finally {release();}
 assert.deepEqual(await pending,{ok:false,code:'ATLAS_UNAVAILABLE'});
 assert.equal((await f.atlas.withAtlas(b,({map})=>map.manifest())).ok,true);
 assert.equal((await f.atlas.withAtlas(a,({map})=>map.manifest())).ok,true);assert.equal(f.mapCalls(),2);
});

test('scoped Journey resolves every stop through the approved music client and bounds metadata',async t=>{
 const f=await fixture(t);await f.approve(f.owner.id);const token=await f.issue(f.owner.id);
 const plan=async({map,journey})=>{
  const lease=await map.lease();
  return journey.plan(createOrderedWaypointPlanRequest({requestId:'scoped-plan',waypoints:['a','b'].map(id=>lease.resolveRawId(id).pointId),targetTrackCount:10}));
 };
 const result=await f.atlas.withAtlas(token,plan);assert.equal(result.ok,true);assert.equal(result.value.stops.length,2);assert.equal(f.songCalls(),2);
 f.setSongResponse(()=>new Response('x'.repeat(1024*1024+1)));
 assert.deepEqual(await f.atlas.withAtlas(token,plan),{ok:false,code:'ATLAS_UNAVAILABLE'});
 f.setSongResponse(()=>new Response(JSON.stringify({'subsonic-response':{status:'ok',song:{id:'wrong',title:'wrong',artist:'wrong'}}})));
 assert.deepEqual(await f.atlas.withAtlas(token,plan),{ok:false,code:'ATLAS_UNAVAILABLE'});
});

test('different approved upstream identities load only their explicitly granted datasets',async t=>{
 const f=await fixture(t);await f.approve(f.owner.id);await f.approve(f.listener.id,otherBinding);
 const other={...f.data,username:otherBinding.username,datasetId:'30000000-0000-4000-8000-000000000003',fetchMap:async()=>({projection:'other',items:[{item_id:'c',embedding_2d:[0,0]},{item_id:'d',embedding_2d:[1,1]}]})};
 const atlas=createAccountAtlasAccess({upstreamAccess:f.upstreamAccess,secret:f.secret,datasets:[f.data,other]});
 const inspect=async({map})=>{const lease=await map.lease();return ['a','c'].map(id=>Boolean(lease.resolveRawId(id)));};
 assert.deepEqual((await atlas.withAtlas(await f.issue(f.owner.id),inspect)).value,[true,false]);
 assert.deepEqual((await atlas.withAtlas(await f.issue(f.listener.id),inspect)).value,[false,true]);
});
