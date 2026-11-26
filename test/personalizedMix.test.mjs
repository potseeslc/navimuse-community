import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPersonalizedMixStore} from '../server/personalizedMix.mjs';

test('personalized mixes persist separately by account binding and keep previous result on failure or empty history',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'personalized-mix-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createPersonalizedMixStore(directory,{now:()=>123});
 const first=await store.refresh('person-a:binding-1',async()=>[{id:'a'}]);
 await store.refresh('person-b:binding-1',async()=>[{id:'b'}]);
 await assert.rejects(store.refresh('person-a:binding-1',async()=>{throw Error('offline');}));
 assert.deepEqual(await store.refresh('person-a:binding-1',async()=>[]),{mix:first.mix,empty:true});
 assert.equal(await store.read('person-a:binding-2'),null);
 const reopened=createPersonalizedMixStore(directory);
 assert.deepEqual((await reopened.read('person-a:binding-1')).tracks,[{id:'a'}]);
 assert.deepEqual((await reopened.read('person-b:binding-1')).tracks,[{id:'b'}]);
});

test('Home and Sonic concurrent refresh requests share one generation',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'personalized-mix-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createPersonalizedMixStore(directory);let finish,calls=0;
 const generate=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
 const a=store.refresh('person',generate),b=store.refresh('person',generate);
 finish([{id:'one'}]);assert.deepEqual(await a,await b);assert.equal(calls,1);
});
