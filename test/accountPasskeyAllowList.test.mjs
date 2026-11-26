import test from 'node:test';
import assert from 'node:assert/strict';
import {createUsernamePasskeyAllowList} from '../server/accountPasskeyAllowList.mjs';

test('allow-list mitigation has a stable fixed count without real-entry position or transport markers',()=>{
 const build=createUsernamePasskeyAllowList(Buffer.alloc(32,1));
 const credential={id:Buffer.alloc(128,9).toString('base64url'),transports:['usb']};
 const missing=build('missing',[]),one=build('owner',[credential]);
 assert.equal(missing.length,20);assert.equal(one.length,20);assert(one.some(c=>c.id===credential.id));
 assert.deepEqual(build('missing',[]),missing);assert.deepEqual(build('owner',[credential]),one);
 assert.notDeepEqual(build('another',[]),missing);
 assert(one.every(c=>Object.keys(c).join(',')==='type,id'&&c.type==='public-key'));
 const all=Array.from({length:20},(_,i)=>({id:Buffer.alloc(32,i).toString('base64url')}));assert.deepEqual(new Set(build('full',all).map(c=>c.id)),new Set(all.map(c=>c.id)));
 assert.throws(()=>build('too-many',[...all,credential]));
 // Real credential lengths remain visible; this test deliberately does not claim
 // arbitrary hardware IDs are indistinguishable from imaginary IDs.
 assert.equal(Buffer.from(one.find(c=>c.id===credential.id).id,'base64url').length,128);
});
