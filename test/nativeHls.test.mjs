import test from 'node:test';import assert from 'node:assert/strict';
import {configureNativeHls,canTryNativeHls,resolveNativeHls,saveHlsPilot,pilotProgressiveURL} from '../src/nativeHls.js';
let preference='false';globalThis.window={location:{href:'https://navimuse.example.com/'},localStorage:{getItem:()=>preference,setItem:(_,value)=>{preference=value;}}};
const stream='https://navimuse.example.com/api/navidrome/stream/song';
const path='/api/navidrome/hls/sessions/'+'a'.repeat(48)+'/master.m3u8?accountScope=scope';
test('pilot is gated by opt-in, native capability, scope and local track source',()=>{
 configureNativeHls({scope:'scope',enabled:true});assert.equal(canTryNativeHls({hls:true},stream),false);saveHlsPilot(true);
 assert.equal(canTryNativeHls({hls:true},stream),true);assert.equal(canTryNativeHls({},stream),false);
 assert.equal(canTryNativeHls({hls:true,routeKind:'AirPlay'},stream),false);
 assert.equal(canTryNativeHls({hls:true},stream.replace('/stream/song','/radios/station/stream')),false);
 assert.equal(canTryNativeHls({hls:true},stream.replace('navimuse.example.com','evil.example')),false);
});
test('only a ready first-party scoped manifest is selected; timeout and failures fall back',async()=>{
 configureNativeHls({scope:'scope',enabled:true});saveHlsPilot(true);
 const result=await resolveNativeHls(stream,{fetchFn:async()=>Response.json({state:'ready',url:path})});assert.equal(result,'https://navimuse.example.com'+path);
 for(const response of [Response.json({state:'preparing'},{status:202}),Response.json({state:'ready',url:'https://evil.example'+path}),Response.json({state:'ready',url:path.replace('accountScope=scope','accountScope=other')}),new Response('',{status:503})])assert.equal(await resolveNativeHls(stream,{fetchFn:async()=>response}),null);
 assert.equal(await resolveNativeHls(stream,{timeoutMs:10,fetchFn:()=>new Promise(()=>{})}),null);
});
test('account changes while preparing cannot select an old manifest',async()=>{
 configureNativeHls({scope:'scope',enabled:true});let finish;const result=resolveNativeHls(stream,{fetchFn:()=>new Promise(r=>finish=r)});
 configureNativeHls({scope:'other',enabled:true});finish(Response.json({state:'ready',url:path}));assert.equal(await result,null);
});

test('pilot progressive startup pins one MP3 profile and retains account identity',()=>{const u=new URL(pilotProgressiveURL(stream+'?accountScope=scope&format=opus&maxBitRate=64'));assert.equal(u.searchParams.get('format'),'mp3');assert.equal(u.searchParams.get('maxBitRate'),'192');assert.equal(u.searchParams.get('accountScope'),'scope');});
