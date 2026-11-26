import test from 'node:test';import assert from 'node:assert/strict';
import {createJourneySource} from '../server/wiim/journeySource.mjs';
test('Journey analysis is bounded, filters duplicates and resolves songs through the same principal',async()=>{
 const principal={mode:'legacy',id:'owner'};const seen=[];
 const source=createJourneySource({authorize:async p=>{assert.equal(p,principal);seen.push('auth');},configuration:()=>({url:'http://analysis.test/api/similar_tracks',headers:{authorization:'Bearer private'}}),fetchImpl:async(url,init)=>{assert.equal(url.searchParams.get('item_id'),'seed');assert.equal(url.searchParams.get('n'),'100');assert.equal(init.redirect,'manual');assert.equal(init.headers.authorization,'Bearer private');seen.push('analysis');return new Response(JSON.stringify({results:[{item_id:'seed'},{item_id:'played'},{item_id:'../bad'},{item_id:'one',embedding:[1,2]},{item_id:'one'},{item_id:'missing'},{item_id:'two'}]}));},readJson:async(response,bytes)=>{assert.equal(bytes,2*1024*1024);return response.json();},resolveSong:async(p,id,signal)=>{assert.equal(p,principal);assert.ok(signal);seen.push(id);if(id==='missing')throw Object.assign(Error('missing'),{status:404});return{id,title:'Safe '+id};}});
 assert.deepEqual(await source(principal,'seed',{excludeIds:['played']}),[{id:'one',title:'Safe one'},{id:'two',title:'Safe two'}]);assert.deepEqual(seen,['auth','analysis','one','missing','two']);
});
test('account mode, revoked bindings, redirects and canceled requests never fall back to service credentials',async()=>{
 let touched=0;const never=()=>{touched++;throw Error('must not read global configuration');};
 const account=createJourneySource({authorize:never,configuration:never});await assert.rejects(account({mode:'account'},'seed',{}),e=>e.status===503);assert.equal(touched,0);
 const denied=createJourneySource({authorize:async()=>{throw Object.assign(Error('revoked'),{status:403});},configuration:never});await assert.rejects(denied({mode:'legacy'},'seed',{}),e=>e.status===403);assert.equal(touched,0);
 const source=createJourneySource({authorize:async()=>{},configuration:()=>({url:'http://analysis.test/api/similar_tracks',headers:{}}),fetchImpl:async(_url,init)=>{init.signal.throwIfAborted();return new Response('',{status:302});},readJson:never,resolveSong:never});
 await assert.rejects(source({mode:'legacy'},'seed',{}),e=>e.status===503);assert.equal(touched,0);
 const controller=new AbortController();controller.abort();await assert.rejects(source({mode:'legacy'},'seed',{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(touched,0);
});
