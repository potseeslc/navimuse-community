import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:http';import {once} from 'node:events';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';import {createAccountHttpBoundary} from '../server/accountHttpBoundary.mjs';import {createAccountHttpRoutes} from '../server/accountHttpRoutes.mjs';import {accountCredentialFixture as credential} from '../test-support/accountCredentialFixture.mjs';import {parseAccountPreferences as build14Reader} from './fixtures/build14-accountPreferences.js';

test('Build 14 preferences remain readable and old saves preserve new themes/libraries across clients',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'navimuse-preferences-compat-')),store=await openAccountStoreWorker(directory);let handler;
 const server=createServer((req,res)=>handler(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await store.close();await rm(directory,{recursive:true,force:true});});
 const origin=`http://127.0.0.1:${server.address().port}`,boundary=createAccountHttpBoundary({canonicalOrigin:origin,developmentLoopback:true});handler=createAccountHttpRoutes({boundary,store,mode:'local',methods:{password:true,passkey:false,oidc:false},legacyConfigured:false,queueScopeForAccount:async()=>null});
 const account=await store.createFirstOwner({username:'owner',displayName:'Owner'},credential),session=await store.issuePasswordSession(account.id,{expectedGeneration:1,expectedRevision:1,remember:false});
 const cookie=boundary.cookie('session',session.token,session.session.expiresAt).split(';')[0];
 const request=async(expanded,body)=>{const response=await fetch(origin+'/api/auth/v1/preferences',{method:body?'PUT':'GET',headers:{Cookie:cookie,Origin:origin,'X-Requested-With':'NaviMuse',...(expanded?{'X-NaviMuse-Preferences':expanded===3?'3':'2'}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};};
 const modern=(await request(3)).data;modern.preferences.playback.gaplessAlbums=true;assert.throws(()=>build14Reader(modern.preferences),'reproduces the old client rejection of new response fields');
 const legacy=(await request(false)).data;assert.deepEqual(build14Reader(legacy.preferences),legacy.preferences);
 modern.preferences.appearance={theme:'light',accent:'violet'};modern.preferences.library.selectedFolders=['1','2'];
 let saved=await request(true,{expectedAccountId:account.id,expectedRevision:0,preferences:modern.preferences});assert.equal(saved.status,200);
 const old=(await request(false)).data;old.preferences.playback.startFullScreen=false;
 saved=await request(false,{expectedAccountId:account.id,expectedRevision:old.revision,preferences:old.preferences});assert.equal(saved.status,200);assert.doesNotThrow(()=>build14Reader(saved.data.preferences));
 const restored=(await request(3)).data;assert.equal(restored.preferences.playback.gaplessAlbums,true,'older clients preserve the new preference');assert.equal(Object.hasOwn((await request(true)).data.preferences.playback,'gaplessAlbums'),false,'v2 readers retain their exact schema');assert.deepEqual(restored.preferences.appearance,modern.preferences.appearance);assert.deepEqual(restored.preferences.library.selectedFolders,['1','2']);assert.equal(restored.preferences.playback.startFullScreen,false);
 const stale=await request(false,{expectedAccountId:account.id,expectedRevision:old.revision,preferences:old.preferences});assert.equal(stale.status,409);assert.doesNotThrow(()=>build14Reader(stale.data.current.preferences));
 // Already-shipped Build 15 sends full preferences but lacks the new header.
 restored.preferences.appearance.accent='blue';saved=await request(false,{expectedAccountId:account.id,expectedRevision:restored.revision,preferences:restored.preferences});assert.equal(saved.data.preferences.appearance.accent,'blue');
});
