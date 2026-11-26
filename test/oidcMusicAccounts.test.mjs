import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {loadOidcMusicAccounts} from '../server/oidcMusicAccounts.mjs';
test('OIDC mappings fail closed and concurrent users retain separate upstream credentials, preferences and logout',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nm-oidc-accounts-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const password=join(dir,'listener-password'),mapping=join(dir,'accounts.json');writeFileSync(password,'listener-password-12345',{mode:0o600});
 writeFileSync(mapping,JSON.stringify([{sub:'owner',owner:true},{sub:'listener',username:'listenerTwo',passwordFile:password}]),{mode:0o600});
 assert.equal(loadOidcMusicAccounts(mapping).get('unknown'),null);
 chmodSync(password,0o644);assert.throws(()=>loadOidcMusicAccounts(mapping),/configuration is invalid/);chmodSync(password,0o600);
 const seen=[];const upstream=createServer(async(req,res)=>{const u=new URL(req.url,'http://test');seen.push(u.searchParams.get('u'));assert.equal(u.searchParams.get('t'),createHash('md5').update((u.searchParams.get('u')==='listenerTwo'?'listener-password-12345':'owner-password')+u.searchParams.get('s')).digest('hex'));await new Promise(r=>setTimeout(r,u.searchParams.get('u')==='listenerTwo'?30:5));if(u.pathname==='/rest/stream.view'){res.writeHead(200,{'content-type':'audio/mpeg'});res.end(u.searchParams.get('u'));return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({'subsonic-response':{status:'ok',song:{id:u.searchParams.get('id'),title:'Test song',artist:'Test artist'},searchResult3:{song:[{id:u.searchParams.get('u'),title:u.searchParams.get('u')}]}}}));});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');t.after(()=>{upstream.closeAllConnections();upstream.close();});
 Object.assign(process.env,{NODE_ENV:'test',NAVIMUSE_DATA_DIR:dir,NAVIMUSE_OIDC_ISSUER:'https://identity.example.test',NAVIMUSE_OIDC_CLIENT_ID:'client',NAVIMUSE_OIDC_CLIENT_SECRET:'test-secret',NAVIMUSE_OIDC_REDIRECT_URI:'https://music.example.test/api/auth/callback',NAVIMUSE_OIDC_MUSIC_ACCOUNTS_FILE:mapping,NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'owner-music',NAVIDROME_PASSWORD:'owner-password',TRUST_PROXY:'true'});
 writeFileSync(join(dir,'settings.key'),Buffer.alloc(32,7),{mode:0o600});
 const {server,wiimRequestFor}=await import('../server.mjs?oidc-music-test');server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const origin=`http://127.0.0.1:${server.address().port}`;
 const settings=JSON.parse(readFileSync(join(dir,'settings.json'))),key=readFileSync(join(dir,'settings.key'));const subkey=createHmac('sha256',key).update('navimuse:session-signing:v1').digest();const signing=createHmac('sha256',subkey).update(settings.admin.sessionSecret).digest();
 const cookie=(sub,extra={})=>{const p=Buffer.from(JSON.stringify({sub,gen:0,exp:Date.now()+60000,nonce:'test',issuer:'https://identity.example.test',...extra})).toString('base64url');return 'navimuse_session='+p+'.'+createHmac('sha256',signing).update(p).digest('base64url');};
 const request=(sub,path,body)=>fetch(origin+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{cookie:cookie(sub),origin,'content-type':'application/json','x-requested-with':'NaviMuse'}});
 // Existing valid Pocket ID cookies migrate once; new sessions have a fixed
 // 90-day lifetime and still use the same identity/revocation boundary.
 const sessionRequest=value=>fetch(origin+'/api/settings/session',{headers:{cookie:value,'x-forwarded-proto':'https'}});
 const migrated=await sessionRequest(cookie('listener'));
 const setCookie=migrated.headers.get('set-cookie');
 assert.match(setCookie,/Max-Age=7776000/);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Lax/);assert.match(setCookie,/Secure/);
 const remembered=setCookie.split(';')[0];
 const payload=JSON.parse(Buffer.from(remembered.split('=')[1].split('.')[0],'base64url'));
 assert.equal(payload.exp-payload.issuedAt,90*24*60*60*1000);
 assert.equal(payload.sub,'listener');
 const repeat=await sessionRequest(remembered);assert.equal((await repeat.json()).authenticated,true);assert.equal(repeat.headers.get('set-cookie'),null);
 const restarted=(await import('../server.mjs?oidc-session-restart-test')).server;
 restarted.listen(0,'127.0.0.1');await once(restarted,'listening');
 try {
  const retained=await fetch(`http://127.0.0.1:${restarted.address().port}/api/settings/session`,{headers:{cookie:remembered}});
  assert.equal((await retained.json()).authenticated,true);
 } finally {restarted.closeAllConnections();await new Promise(resolve=>restarted.close(resolve));}
 const realNow=Date.now;
 try {
  Date.now=()=>payload.issuedAt+89*24*60*60*1000;
  assert.equal((await (await sessionRequest(remembered)).json()).authenticated,true);
  Date.now=()=>payload.exp;
  const expired=await sessionRequest(remembered);assert.equal((await expired.json()).authenticated,false);assert.equal(expired.headers.get('set-cookie'),null);
 } finally {Date.now=realNow;}
 for(const invalid of [cookie('unknown'),cookie('listener',{exp:Date.now()-1}),cookie('listener',{exp:'invalid'}),remembered+'tampered','']) {
  const denied=await sessionRequest(invalid);assert.equal((await denied.json()).authenticated,false);assert.equal(denied.headers.get('set-cookie'),null);
 }
 const results=await Promise.all(['owner','listener','owner','listener'].map(async sub=>{const r=await request(sub,'/api/navidrome/search?q=hello');assert.equal(r.status,200);return [sub,await r.json()];}));
 for(const [sub,result] of results)assert.equal(result.songs[0].id,sub==='owner'?'owner-music':'listenerTwo');
 const count=seen.length;assert.equal((await request('unknown','/api/navidrome/search?q=hello')).status,401);assert.equal(seen.length,count);
 assert.equal((await request('listener','/api/settings/navidrome',{username:'owner-music',password:'wrong'})).status,403);
 assert.equal((await request('listener','/api/settings',{preferences:{library:{selectedFolders:['2']}}})).status,200);
 const own=await (await request('owner','/api/settings')).json(),other=await (await request('listener','/api/settings')).json();assert.deepEqual(other.preferences.library.selectedFolders,['2']);assert.equal(own.preferences.library.selectedFolders,null);assert.equal(other.services.navidrome.managed,true);assert.equal(other.services.navidrome.username,undefined);assert.equal(other.services.navidrome.url,undefined);assert.equal(other.security.canManageServices,false);assert.equal(own.security.canManageServices,true);
 assert.equal((await request('listener','/api/navidrome/scrobble/song',{submission:true})).status,200);assert.equal(seen.at(-1),'listenerTwo');
 assert.equal(await (await request('listener','/api/navidrome/stream/song')).text(),'listenerTwo');
 const ownerScope=(await (await request('owner','/api/settings/session')).json()).queueScope;const listenerScope=(await (await request('listener','/api/settings/session')).json()).queueScope;assert.notEqual(ownerScope,listenerScope);
 const listening={scope:listenerScope,id:'33333333-3333-4333-8333-333333333333',songId:'overnight',time:Date.now()-600000};
 assert.equal((await request('listener','/api/navidrome/listening',listening)).status,200);assert.equal(seen.at(-1),'listenerTwo');
 const reportCount=seen.length;
 assert.equal((await request('owner','/api/navidrome/listening',listening)).status,409);assert.equal(seen.length,reportCount);
 assert.equal((await request('listener','/api/navidrome/listening',listening)).status,200);assert.equal(seen.length,reportCount);
 const binding=(username,password)=>createHmac('sha256',createHmac('sha256',key).update('navimuse:wiim-binding:v1').digest()).update(JSON.stringify([process.env.NAVIDROME_URL+'/',username,password])).digest('hex');
 const legacyOwner={id:ownerScope,scope:ownerScope,mode:'legacy',generation:0,binding:binding('owner-music','owner-password')};
 await wiimRequestFor(legacyOwner,'/rest/ping.view');assert.equal(seen.at(-1),'owner-music');
 const listener={id:listenerScope,scope:listenerScope,mode:'legacy',generation:0,oidcSubject:'listener',binding:binding('listenerTwo','listener-password-12345')};
 await wiimRequestFor(listener,'/rest/ping.view');assert.equal(seen.at(-1),'listenerTwo');
 await assert.rejects(wiimRequestFor({...legacyOwner,oidcSubject:'listener'},'/rest/ping.view'));
 await assert.rejects(wiimRequestFor({...legacyOwner,id:listenerScope,scope:listenerScope},'/rest/ping.view'));
 assert.equal((await request('listener','/api/auth/logout',{})).status,200);
 assert.equal((await (await sessionRequest(remembered)).json()).authenticated,false);
 assert.equal((await sessionRequest(remembered)).headers.get('set-cookie'),null);
 assert.equal((await (await request('owner','/api/settings/session')).json()).authenticated,true);
 assert.equal((await (await request('listener','/api/settings/session')).json()).authenticated,false);await assert.rejects(wiimRequestFor(listener,'/rest/ping.view'));await wiimRequestFor(legacyOwner,'/rest/ping.view');
});
