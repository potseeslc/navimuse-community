import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountMusicTransport} from '../src/services/accountMusicTransport.js';

test('music transports capture separate scopes for requests and media without accepting URL-selected identity',async t=>{
 const before=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response('{}');};t.after(()=>{globalThis.fetch=before;});
 const aScope='queue-scope-v2:'+'a'.repeat(64),bScope='queue-scope-v2:'+'b'.repeat(64);
 const a=createAccountMusicTransport(aScope),b=createAccountMusicTransport(bScope);
 await a.request('/api/navidrome/albums/one?accountScope=forged',{method:'GET'});
 await b.request('/api/navidrome/playlists',{method:'POST',body:'{}'});
 await a.request('/api/navidrome/albums/two');
 assert.deepEqual(calls.map(({url})=>new URL(url,'http://fixture').searchParams.get('accountScope')),[aScope,bScope,aScope]);
 assert.ok(calls.every(({init})=>init.credentials==='include'));
 assert.equal(new URL(a.mediaUrl('/api/navidrome/stream/one?maxBitRate=320'),'http://fixture').searchParams.get('maxBitRate'),'320');
 assert.notEqual(a.mediaUrl('/api/navidrome/cover/one'),b.mediaUrl('/api/navidrome/cover/one'));
 for(const scope of [null,'','queue-scope-v1:'+'a'.repeat(64)])assert.throws(()=>createAccountMusicTransport(scope));
 for(const path of ['https://evil.example/api/navidrome/one','//evil.example/api/navidrome/one','/api/navidrome/../auth/login','/api/navidrome/one#fragment'])assert.throws(()=>a.mediaUrl(path));
});
