import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createPasswordService} from '../server/passwordCredentials.mjs';
import {navidromeFeedback} from '../src/services/navidromeService.js';

test('real BFF local mode serves approved account albums/media without legacy credential fallback',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'navimuse-local-bff-'));
 let rejectOfflineAuth=false;
 const feedbackState={favorite:false,rating:0};
 const calls=[],audio=Buffer.from('synthetic stream bytes'),art=Buffer.from('synthetic cover bytes');
 const upstream=createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture'),p=url.searchParams;calls.push({path:url.pathname,user:p.get('u')});
  const valid=p.get('u')==='MusicOwner' && p.get('t')===createHash('md5').update('fixture-music-password'+p.get('s')).digest('hex');
  if(!valid){res.writeHead(403);res.end();return;}
  if(rejectOfflineAuth && url.pathname==='/rest/ping.view'){res.writeHead(403);res.end();return;}
  if(url.pathname==='/rest/stream.view' || url.pathname==='/rest/getCoverArt.view') {
   const bytes=url.pathname==='/rest/stream.view'?audio:art;
   res.writeHead(200,{'content-type':bytes===audio?'audio/flac':'image/png','content-length':bytes.length});res.end(bytes);return;
  }
  if(url.pathname==='/rest/getSong.view') {
   res.setHeader('content-type','application/json');res.end(JSON.stringify({'subsonic-response':{status:'ok',song:{id:'song-1',title:'Fixture song',artist:'Fixture',userRating:feedbackState.rating,...(feedbackState.favorite?{starred:'2026-09-10T00:00:00Z'}:{})}}}));return;
  }
  if(url.pathname==='/rest/star.view')feedbackState.favorite=true;
  if(url.pathname==='/rest/unstar.view')feedbackState.favorite=false;
  if(url.pathname==='/rest/setRating.view')feedbackState.rating=Number(p.get('rating'));
  if(url.pathname==='/rest/createPlaylist.view') {
   res.setHeader('content-type','application/json');res.end(JSON.stringify({'subsonic-response':{status:'ok',playlist:{id:'playlist-1',name:p.get('name'),songCount:1,entry:[]}}}));return;
  }
  res.setHeader('content-type','application/json');
  res.end(JSON.stringify({'subsonic-response':{status:'ok',...(url.pathname==='/rest/getAlbum.view'?{album:{id:'album-1',name:'Fixture album',song:[{id:'song-1',title:'Fixture song',artist:'Fixture'}]}}:{})}}));
 });upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const holder=createServer();holder.listen(0,'127.0.0.1');await once(holder,'listening');const port=holder.address().port;await new Promise(resolve=>holder.close(resolve));
 const origin=`http://127.0.0.1:${port}`,musicOrigin=`http://127.0.0.1:${upstream.address().port}`,registry=join(directory,'registry.json');
 await writeFile(registry,JSON.stringify({version:'navimuse-navidrome-registry/v1',entries:[{credentialRef:'music-owner',serverId:'10000000-0000-4000-8000-000000000001',url:musicOrigin,username:'MusicOwner',password:'fixture-music-password'}]}),{mode:0o600});
 const env={NAVIMUSE_DATA_DIR:directory,NAVIMUSE_SETUP_TOKEN:'fixture-local-bff-setup-token',NAVIMUSE_ACCOUNT_MODE:'local',NAVIMUSE_ACCOUNT_INITIALIZE:'true',
  NAVIMUSE_ACCOUNT_ORIGIN:origin,NAVIMUSE_ACCOUNT_DEVELOPMENT_LOOPBACK:'true',NAVIMUSE_ACCOUNT_NAVIDROME_REGISTRY_FILE:registry,
  NAVIDROME_URL:musicOrigin,NAVIDROME_USERNAME:'legacy-shared-user',NAVIDROME_PASSWORD:'legacy-shared-password'};
 const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const actualFetch=globalThis.fetch;
 // Isolate only the breach-screen transport. Password hashing, all account routes,
 // binding verification and metadata/media requests are real production code.
 globalThis.fetch=(url,init)=>String(url).startsWith('https://api.pwnedpasswords.com/range/')?
  Promise.resolve(new Response('0'.repeat(35)+':0')):actualFetch(url,init);
 let server;
 t.after(async()=>{
  globalThis.fetch=actualFetch;
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await rm(directory,{recursive:true,force:true});
 });
 ({server}=await import('../server.mjs?local-account-bff'));server.listen(port,'127.0.0.1');await once(server,'listening');
 let scope=null;
 const call=(path,{body,cookie,method=body?'POST':'GET',headers={},scopeOverride=scope}={})=>actualFetch(origin+path+(path.startsWith('/api/navidrome/')&&scopeOverride?'?accountScope='+encodeURIComponent(scopeOverride):''),{method,headers:{'X-Requested-With':'NaviMuse',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 const cookieOf=response=>response.headers.getSetCookie().find(x=>x.startsWith('navimuse_session_v1_dev=')).split(';')[0];
 assert.equal((await call('/api/config').then(r=>r.json())).accountMode,'local');
 assert.equal((await call('/api/navidrome/albums/album-1')).status,401);assert.equal(calls.length,0);
 const password='Real local BFF fixture password 2026!';
 assert.equal((await call('/api/auth/v1/setup',{body:{setupToken:env.NAVIMUSE_SETUP_TOKEN,username:'owner',displayName:'Owner',password}})).status,201);
 let signed=await call('/api/auth/v1/password/login',{body:{username:'owner',password,remember:true}}),cookie=cookieOf(signed),session=await signed.json();
 assert.equal(session.state,'authenticated');assert.equal(session.queueScope,null);
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie})).status,403);assert.equal(calls.length,0);
 const approved=await call(`/api/auth/v1/accounts/${session.account.id}/upstream-binding`,{method:'PUT',cookie,body:{expectedRevision:0,credentialRef:'music-owner'}});
 assert.equal(approved.status,200);assert.equal((await approved.json()).reauthenticate,true);
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie})).status,401);
 signed=await call('/api/auth/v1/password/login',{body:{username:'owner',password}});cookie=cookieOf(signed);scope=(await signed.json()).queueScope;
 const afterApproval=calls.length;
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie,scopeOverride:null})).status,400);
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie,scopeOverride:'queue-scope-v2:'+ '0'.repeat(64)})).status,409);
 assert.equal((await call('/api/navidrome/stream/song-1',{cookie,scopeOverride:'queue-scope-v2:'+ '0'.repeat(64)})).status,409);
 assert.equal(calls.length,afterApproval,'stale UI scope cannot dispatch any metadata or media');
 const listen={id:crypto.randomUUID(),songId:'song-1',time:Date.now()-1000,scope};
 assert.equal((await call('/api/navidrome/listening-history/recent')).status,401);
 assert.equal((await call('/api/navidrome/listening-history/recent',{cookie,scopeOverride:'queue-scope-v2:'+'0'.repeat(64)})).status,409);
 assert.equal((await call('/api/navidrome/listening',{cookie,body:{...listen,scope:'wrong'}})).status,409);
 assert.equal((await call('/api/navidrome/listening',{cookie,body:listen})).status,200);
 assert.equal((await call('/api/navidrome/listening',{cookie,body:listen})).status,200);
 const history=await call('/api/navidrome/listening-history/recent',{cookie}).then(r=>r.json());
 assert.equal(history.source,'navimuse');assert.equal(history.items.length,1);assert.equal(history.items[0].title,'Fixture song');
 const charts=await call('/api/navidrome/listening-history/recordings',{cookie}).then(r=>r.json());assert.equal(charts.items[0].count,1);
 const deniedOffline=await call('/api/navidrome/offline-access');assert.equal(deniedOffline.status,401);
 assert.equal((await call('/api/navidrome/offline-access',{cookie,scopeOverride:'queue-scope-v2:'+'0'.repeat(64)})).status,409);
 const leaseResponse=await call('/api/navidrome/offline-access',{cookie});assert.equal(leaseResponse.status,200);assert.equal(leaseResponse.headers.get('cache-control'),'private, no-store');
 const lease=await leaseResponse.json();assert.equal(lease.version,'navimuse-offline/v1');assert.equal(lease.scope,scope);assert.equal(lease.expiresAt-lease.issuedAt,30*86400000);assert.deepEqual(Object.keys(lease).sort(),['expiresAt','issuedAt','navidromeIdFormat','scope','version']);
 assert.equal((await call('/api/navidrome/offline-access',{cookie,method:'POST'})).status,405);
 rejectOfflineAuth=true;
 const rejectedLease=await call('/api/navidrome/offline-access',{cookie});assert.equal(rejectedLease.status,403);assert.equal((await rejectedLease.json()).expiresAt,undefined);
 rejectOfflineAuth=false;
 const album=await call('/api/navidrome/albums/album-1',{cookie});assert.equal(album.status,200);assert.equal((await album.json()).album.id,'album-1');
 for(const [path,bytes] of [['/api/navidrome/stream/song-1',audio],['/api/navidrome/cover/cover-1',art]]) {
  const response=await call(path,{cookie});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 }
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie,headers:{Origin:'https://evil.example'}})).status,403);
 const playlist=await call('/api/navidrome/playlists',{cookie,body:{name:'Disposable fixture',songIds:['song-1']}});
 assert.equal(playlist.status,201);assert.equal((await playlist.json()).playlist.id,'playlist-1');
 assert.equal((await call('/api/navidrome/scrobble/song-1',{cookie,body:{submission:true}})).status,200);
 // Exercise the real frontend service, not the helper that inserts the CSRF
 // header itself. Only emulate browser cookie/origin and the verified scope.
 const priorFetch=globalThis.fetch;
 globalThis.fetch=(path,init)=>String(path).startsWith('/api/')?actualFetch(origin+path+'?accountScope='+encodeURIComponent(scope),{...init,headers:{...init.headers,Cookie:cookie,Origin:origin}}):priorFetch(path,init);
 try {
  const feedback=await navidromeFeedback('song-1',{favorite:true,rating:4});
  assert.deepEqual(feedback,{ok:true,feedback:{favorite:true,rating:4}});
  assert.ok(calls.some(c=>c.path==='/rest/star.view'));
  assert.ok(calls.some(c=>c.path==='/rest/setRating.view'));
  assert.deepEqual(feedbackState,{favorite:true,rating:4});
 }finally{globalThis.fetch=priorFetch;}
 const before=calls.length;
 assert.equal((await call('/api/navidrome/playlists',{cookie,body:{name:'Blocked fixture',songIds:['song-1']},headers:{'X-Requested-With':''}})).status,403);
 assert.equal((await call('/api/settings/navidrome',{cookie,body:{username:'replacement',password:'fixture'}})).status,503);
 for(const path of ['/api/settings','/api/settings/session','/api/auth/login','/api/health','/api/atlas/projection','/api/audiomuse/dashboard']) {
  assert.equal((await call(path,{cookie})).status,503);
 }
 assert.equal(calls.length,before);assert.ok(calls.every(call=>call.user==='MusicOwner'));
 // Create a second account through the private store, then use real HTTP owner
 // approval and password login. Both map to the same music identity but must
 // still have different browser cache/queue namespaces.
 const passwords=await createPasswordService({screenPassword:async()=> 'allowed'});
 const store=await openAccountStoreWorker(join(directory,'accounts'));let listener;
 try {listener=await store.createListener(session.account.id,{username:'listener',displayName:'Listener'},await passwords.enrollPassword(password));}
 finally {await store.close();}
 assert.equal((await call(`/api/auth/v1/accounts/${listener.id}/upstream-binding`,{method:'PUT',cookie,body:{expectedRevision:0,credentialRef:'music-owner'}})).status,200);
 const second=await call('/api/auth/v1/password/login',{body:{username:'listener',password}}),secondCookie=cookieOf(second),secondScope=(await second.json()).queueScope;
 assert.notEqual(secondScope,scope);
 const feedbackFromSecondSession=await call('/api/navidrome/songs/song-1',{cookie:secondCookie,scopeOverride:secondScope}).then(r=>r.json());
 assert.equal(feedbackFromSecondSession.song.userRating,4);assert.ok(feedbackFromSecondSession.song.starred,'a separately authenticated session sees upstream feedback');
 const beforeSwitch=calls.length;
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie:secondCookie})).status,409);
 assert.equal((await call('/api/navidrome/cover/cover-1',{cookie:secondCookie})).status,409);
 assert.equal(calls.length,beforeSwitch,'new cookie plus old tab scope cannot reach the upstream');
 cookie=secondCookie;scope=secondScope;
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie})).status,200);
 const duplicate=await actualFetch(origin+'/api/navidrome/albums/album-1?accountScope='+encodeURIComponent(scope)+'&accountScope='+encodeURIComponent(scope),{headers:{Cookie:cookie}});
 assert.equal(duplicate.status,400);
 assert.equal((await call('/api/auth/v1/logout',{method:'POST',cookie})).status,200);
 assert.equal((await call('/api/navidrome/albums/album-1',{cookie})).status,401);
});
