import test from 'node:test';
import assert from 'node:assert/strict';
import {sonicMixRequest} from '../server/sonicMixRequest.mjs';
test('sound and Alchemy requests whitelist inputs and bound analysis work',()=>{
  assert.deepEqual(sonicMixRequest({mode:'sound',query:'  warm   piano ',limit:12}),{path:'/api/clap/search',payload:{query:'warm piano',limit:24},limit:12});
  const items=[{id:'song1',type:'song',op:'ADD'},{id:'artist2',type:'artist',op:'SUBTRACT'}];
  assert.deepEqual(sonicMixRequest({mode:'blend',items,limit:50}),{path:'/api/alchemy',payload:{items,n:100},limit:50});
  for(const input of [null,[],{mode:'sound',query:'x'},{mode:'sound',query:'a\0bc'},{mode:'sound',query:'warm piano',server:'other'},
    {mode:'sound',query:'warm piano',limit:500},{mode:'sound',query:'warm piano',items:[]},
    {mode:'blend',items:[]},{mode:'blend',items:[items[1]]},{mode:'blend',items:[items[0],items[0]]},
    {mode:'blend',items:[{...items[0],type:'anchor'}]},{mode:'blend',items:[{...items[0],id:'https://other'}]},
    {mode:'blend',items:[{...items[0],embedding:[1,2]}]}]) assert.throws(()=>sonicMixRequest(input),error=>error.status===400);
});
