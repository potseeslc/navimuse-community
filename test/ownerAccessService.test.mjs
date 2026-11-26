import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerAccessClient as client} from '../src/services/ownerAccessService.js';
const id='00000000-0000-4000-8000-000000000001';
test('access client projects exact target state and never retries an uncertain write',async t=>{
 const calls=[];let status=200,value={accountId:id,owner:false,disabled:false,revision:1};
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json(value,{status});});
 assert.deepEqual(await client.read(id),value);
 value={...value,disabled:true,revision:2};await client.save(id,{expectedGeneration:1,owner:false,disabled:true,actorId:'ignored'});
 assert.deepEqual(JSON.parse(calls.at(-1).init.body),{expectedGeneration:1,owner:false,disabled:true});
 const count=calls.length;value={...value,accountId:'wrong'};await assert.rejects(client.save(id,{expectedGeneration:1,owner:false,disabled:true}),/Uncertain/);assert.equal(calls.length,count+1);
 status=409;value={code:'ACCOUNT_ACCESS_CHANGED',message:'private'};await assert.rejects(client.save(id,{expectedGeneration:1,owner:false,disabled:true}),e=>e.code==='ACCOUNT_ACCESS_CHANGED'&&!e.message.includes('private'));
 const controller=new AbortController();controller.abort();const before=calls.length;await assert.rejects(client.read(id,{signal:controller.signal}));assert.equal(calls.length,before);
});
