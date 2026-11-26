import test from 'node:test';
import assert from 'node:assert/strict';
import {musicConnections,accountMusicConnection,saveAccountMusicConnection} from '../src/services/ownerConnectionService.js';
const id='00000000-0000-4000-8000-000000000001';
test('owner music access validates approved projections and sends one revision-bound write',async(t)=>{
 const calls=[];let value={connections:[{reference:'music',label:'Music',password:'private'}]},status=200;
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json(value,{status});});
 assert.deepEqual(await musicConnections(),[{reference:'music',label:'Music'}]);
 value={revision:4,credentialRef:'music',private:'hidden'};assert.deepEqual(await accountMusicConnection(id),{revision:4,credentialRef:'music'});
 value={ok:true,revision:5,reauthenticate:false};assert.deepEqual(await saveAccountMusicConnection(id,{expectedRevision:4,credentialRef:null}),{revision:5,reauthenticate:false});
 assert.equal(calls.at(-1).init.method,'PUT');assert.deepEqual(JSON.parse(calls.at(-1).init.body),{expectedRevision:4,credentialRef:null});
 const before=calls.length;value={code:'UPSTREAM_BINDING_CHANGED'};status=409;
 await assert.rejects(saveAccountMusicConnection(id,{expectedRevision:4,credentialRef:'music'}),e=>e.status===409&&e.code==='UPSTREAM_BINDING_CHANGED');assert.equal(calls.length,before+1);
 status=200;value={connections:[{reference:'music',label:'Music'},{reference:'music',label:'Duplicate'}]};await assert.rejects(musicConnections());
 value={revision:-1,credentialRef:null};await assert.rejects(accountMusicConnection(id));
 const controller=new AbortController();controller.abort();const callsBeforeAbort=calls.length;await assert.rejects(musicConnections({signal:controller.signal}));assert.equal(calls.length,callsBeforeAbort);
 await assert.rejects(accountMusicConnection('../other'));await assert.rejects(saveAccountMusicConnection(id,{expectedRevision:0,credentialRef:'unknown/unsafe'}));
});
