import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineAccessSnapshot} from '../server/offlineAccess.mjs';
test('offline access is bounded and exposes only verified opaque scope',()=>{
 for(const version of [1,2]){
  const scope=`queue-scope-v${version}:`+'a'.repeat(64),snapshot=offlineAccessSnapshot(scope,1000);
  assert.deepEqual(snapshot,{version:'navimuse-offline/v1',scope,issuedAt:1000,expiresAt:2592001000});
 }
 for(const scope of ['',null,'account-name','queue-scope-v2:fake'])assert.throws(()=>offlineAccessSnapshot(scope));
});
