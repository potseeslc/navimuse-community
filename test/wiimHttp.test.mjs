import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {once} from 'node:events';
import {createWiiMHttpHandler} from '../server/wiim/http.mjs';
import {PlaybackError} from '../shared/wiim/contract.js';
async function fixture(t,{radio=false}={}){
 let valid=true,requests=0;const calls=[],received=[];const token='a'.repeat(32);
 const handler=createWiiMHttpHandler({
  coordinator:{receivedMedia:(...args)=>received.push(args),grant:async(g,kind)=>{if(!valid||g!==token||kind!=='audio')throw new PlaybackError('Media grant expired',403);return {principal:{id:'owner'},songId:radio?'radio:station-1':'song',isRadio:radio};},snapshot:async p=>({owner:p.id})},
  principalFor:async(req,res)=>{if(req.headers.authorization==='test-owner')return {id:'owner'};res.writeHead(401);res.end();return null;},
  requestFor:async(principal,path,params,options)=>{requests++;calls.push({principal,path,params,options});return new Response('abcd',{status:options.headers.Range?206:200,headers:{'content-type':'audio/flac','content-length':'4','accept-ranges':'bytes',...(options.headers.Range?{'content-range':'bytes 0-3/100'}:{}),'set-cookie':'private','location':'http://private-upstream'}});},
  radioMediaFor:async(principal,id,options)=>{calls.push({principal,id,options});return new Response('radio-audio',{headers:{'content-type':'audio/mpeg'}});},
  readBody:async()=>({})});
 const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 return {url:`http://127.0.0.1:${server.address().port}`,token,calls,received,requests:()=>requests,revoke:()=>{valid=false;}};
}
test('speaker grants are reusable with Range and HEAD and never forward private headers',async t=>{
 const f=await fixture(t);const url=`${f.url}/media/wiim/${f.token}/audio`;
 const first=await fetch(url,{headers:{Range:'bytes=0-3'}});assert.equal(first.status,206);assert.equal(first.headers.get('content-range'),'bytes 0-3/100');assert.equal(await first.text(),'abcd');
 assert.equal(first.headers.get('set-cookie'),null);assert.equal(first.headers.get('location'),null);assert.equal(first.headers.get('cache-control'),'private, no-store');
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(url)).status,200);assert.equal(f.requests(),3);assert.deepEqual(f.received,[[f.token,'audio/flac'],[f.token,'audio/flac']]);assert.deepEqual(f.calls[0].params,{id:'song',format:'raw'});
});
test('media grants cannot authorize controls, other resources, methods or arbitrary URLs',async t=>{
 const f=await fixture(t);const url=`${f.url}/media/wiim/${f.token}`;
 assert.equal((await fetch(`${f.url}/api/playback/wiim/session?token=${f.token}`)).status,401);
 assert.equal((await fetch(`${url}/art.jpg`)).status,403);
 assert.equal((await fetch(`${url}/audio?url=http://example.com`)).status,404);
 assert.equal((await fetch(`${url}/audio`,{method:'POST'})).status,405);
 assert.equal((await fetch(`${url}/audio`,{headers:{Range:'bytes=0-1,4-5'}})).status,400);
 f.revoke();assert.equal((await fetch(`${url}/audio`)).status,403);assert.equal(f.requests(),0);
});


test('radio speaker grants use the live source adapter without library requests or byte-range forwarding',async t=>{
 const f=await fixture(t,{radio:true});const url=`${f.url}/media/wiim/${f.token}/audio`;
 const response=await fetch(url,{headers:{Range:'bytes=0-3',Authorization:'untrusted-client'}});
 assert.equal(response.status,200);assert.equal(await response.text(),'radio-audio');assert.equal(f.requests(),0);
 assert.equal(f.calls[0].id,'radio:station-1');assert.equal(f.calls[0].options.artwork,false);assert.equal(f.calls[0].options.headers,undefined);
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 f.revoke();assert.equal((await fetch(url)).status,403);assert.equal(f.calls.length,2);
});
