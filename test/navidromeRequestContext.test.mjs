import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavidromeRequestContext} from '../server/navidromeRequestContext.mjs';

test('concurrent and nested async request contexts preserve their own client and never leak into fallback',async()=>{
 const context=createNavidromeRequestContext(),a={id:'a'},b={id:'b'},legacy={id:'legacy'};
 let release;const barrier=new Promise(resolve=>{release=resolve;});
 const first=context.run(async()=>{context.bind(()=>a);await barrier;assert.equal(context.client(()=>legacy),a);
  await context.run(async()=>{context.bind(()=>b);await Promise.resolve();assert.equal(context.client(()=>legacy),b);});
  assert.equal(context.client(()=>legacy),a);
 });
 await context.run(async()=>{context.bind(()=>b);await Promise.resolve();assert.equal(context.client(()=>legacy),b);release();});
 await first;assert.equal(context.client(()=>legacy),legacy);
 assert.throws(()=>context.bind(()=>a),/Invalid Navidrome request context/);
});
test('a bound failure cannot fall back to a different service identity or be rebound',()=>{
 const context=createNavidromeRequestContext();
 context.run(()=>{
  context.bind(()=>{throw new Error('Unavailable captured credentials');});
  assert.throws(()=>context.client(()=>assert.fail('must not fall back')),/Unavailable captured credentials/);
  assert.throws(()=>context.bind(()=>({})),/Invalid Navidrome request context/);
 });
});
