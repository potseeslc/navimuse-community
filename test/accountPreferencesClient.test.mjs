import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountPreferencesClient} from '../src/services/accountPreferencesService.js';
import {defaultAccountPreferences} from '../shared/accountPreferences.js';
const id='10000000-0000-4000-8000-000000000001';
const value=()=>({version:'navimuse-preferences/v1',accountId:id,revision:0,preferences:defaultAccountPreferences()});

test('preference client rejects mismatched and malformed snapshots and never retries conflicting writes',async()=>{
 const previous=globalThis.fetch;
 const client=createAccountPreferencesClient(id);
 let reply=value(),status=200,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json(reply,{status});};
 try {
  const loaded=await client.read();assert.deepEqual(loaded,value());
  assert.equal(calls[0].init.credentials,'include');assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.cache,'no-store');
  for(const invalid of [{...value(),accountId:'another-account'},{...value(),revision:-1},{...value(),secret:'unexpected'}, {...value(),preferences:{}}]){
   reply=invalid;await assert.rejects(client.read());
  }
  reply={...value(),ok:true,revision:1};
  const saved=await client.save(0,loaded.preferences);assert.equal(saved.revision,1);
  const write=calls.at(-1);assert.equal(write.init.method,'PUT');assert.equal(write.init.headers['X-Requested-With'],'NaviMuse');
  assert.deepEqual(JSON.parse(write.init.body),{expectedAccountId:id,expectedRevision:0,preferences:loaded.preferences});
  status=409;reply={code:'PREFERENCES_CHANGED'};const count=calls.length;
  await assert.rejects(client.save(0,loaded.preferences),error=>error.code==='PREFERENCES_CHANGED');
  assert.equal(calls.length,count+1);
  assert.deepEqual(loaded,value(),'save/conflict cannot mutate the caller snapshot');
 } finally {globalThis.fetch=previous;}
});
