import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerCreationClient as client} from '../src/services/ownerCreationService.js';
const account={id:'00000000-0000-4000-8000-000000000001',username:'listener',displayName:'Listener',roles:['listener'],disabled:false,musicConfigured:false,bindingRevision:0};
const input={username:' Listener ',displayName:' Listener ',password:'Synthetic initial password'};
test('creation client projects exact fields and rejects uncertain results without retrying',async t=>{
 const calls=[];let status=201,value={ok:true,account};
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return Response.json(value,{status});});
 assert.deepEqual(await client.create({...input,owner:true}),account);
 assert.equal(calls[0].url,'/api/auth/v1/accounts');assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.cache,'no-store');assert.equal(calls[0].init.redirect,'error');
 assert.deepEqual(JSON.parse(calls[0].init.body),{username:'listener',displayName:'Listener',password:input.password});
 for(const change of [{username:'other'},{roles:['owner','listener']},{musicConfigured:true},{private:'secret'}]){
  value={ok:true,account:{...account,...change}};const before=calls.length;await assert.rejects(client.create(input),/Uncertain/);assert.equal(calls.length,before+1);
 }
 status=409;value={code:'USERNAME_UNAVAILABLE',message:'private response detail'};await assert.rejects(client.create(input),e=>e.code==='USERNAME_UNAVAILABLE'&&!e.message.includes('private'));
 const controller=new AbortController();controller.abort();const before=calls.length;await assert.rejects(client.create(input,{signal:controller.signal}));assert.equal(calls.length,before);
});
