import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerAccounts} from '../src/services/ownerAccountsService.js';
const id='10000000-0000-4000-8000-000000000001';
const item={id,username:'owner',displayName:'Owner',roles:['owner','listener'],disabled:false,musicConfigured:true,bindingRevision:1};
test('owner overview client validates ordered pages and projects only display fields',async t=>{
 let payload={ok:true,accounts:[{...item,privateField:'must not escape'}],page:{limit:50,nextAfter:id}};let requested;
 t.mock.method(globalThis,'fetch',async(url,init)=>{requested={url,init};return Response.json(payload);});
 assert.deepEqual(await ownerAccounts(),{accounts:[item],nextAfter:id});assert.equal(requested.init.cache,'no-store');
 payload={...payload,accounts:[item,item]};await assert.rejects(ownerAccounts(),/Invalid account overview/);
 payload={...payload,accounts:[item],page:{limit:50,nextAfter:'10000000-0000-4000-8000-000000000002'}};await assert.rejects(ownerAccounts(),/Invalid account cursor/);
 payload={...payload,page:{limit:50,nextAfter:null}};await assert.rejects(ownerAccounts({after:id}),/Invalid account overview/);
});
test('permission denial remains identifiable even with a malformed response body',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('not json',{status:403}));
 await assert.rejects(ownerAccounts(),{status:403});
});
