import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';

test('Pocket ID SCIM activates real BFF mappings and permanently invalidates old sessions on revocation',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'nm-scim-server-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const users=new Map([['owner-nd',{id:'owner-nd',userName:'owner',password:'owner-password',isAdmin:true}]]);
 const upstream=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://test');let body='';for await(const c of req)body+=c;body=body?JSON.parse(body):{};
  let result,status=200;
  if(url.pathname==='/auth/login'){result={id:'owner-nd',isAdmin:true,token:'admin-token'};}
  else if(url.pathname==='/api/library/99'){result={id:99,totalSongs:0,defaultNewUsers:false};}
  else if(url.pathname==='/api/user'&&req.method==='POST'){users.set(body.id,body);result=body;}
  else if(url.pathname.startsWith('/api/user/')){const id=url.pathname.split('/')[3];const u=users.get(id);if(!u){status=404;result={};}else if(url.pathname.endsWith('/library'))result=body.libraryIds.map(id=>({id}));else if(req.method==='PUT'){users.set(id,{...u,...body});result=users.get(id);}else result=u;}
  else {
   const username=url.searchParams.get('u'),u=[...users.values()].find(u=>u.userName===username);assert.ok(u);assert.equal(url.searchParams.get('t'),createHash('md5').update(u.password+url.searchParams.get('s')).digest('hex'));
   result={'subsonic-response':{status:'ok',searchResult3:{song:[{id:username,title:username}]}}};
  }
  res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(result));
 });upstream.listen(0,'127.0.0.1');await once(upstream,'listening');t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const mapping=join(dir,'mapping.json'),tokenFile=join(dir,'scim-token'),token='s'.repeat(43);
 writeFileSync(mapping,JSON.stringify([{sub:'owner-sub',owner:true}]),{mode:0o600});writeFileSync(tokenFile,token,{mode:0o600});writeFileSync(join(dir,'settings.key'),Buffer.alloc(32,3),{mode:0o600});
 Object.assign(process.env,{NODE_ENV:'test',NAVIMUSE_DATA_DIR:dir,NAVIMUSE_OIDC_ISSUER:'https://identity.example.test',NAVIMUSE_OIDC_CLIENT_ID:'client',NAVIMUSE_OIDC_CLIENT_SECRET:'test-secret',NAVIMUSE_OIDC_REDIRECT_URI:'https://music.example.test/api/auth/callback',NAVIMUSE_OIDC_MUSIC_ACCOUNTS_FILE:mapping,NAVIMUSE_SCIM_TOKEN_FILE:tokenFile,NAVIMUSE_SCIM_LIBRARY_IDS:'[1,2]',NAVIMUSE_SCIM_DISABLED_LIBRARY_ID:'99',NAVIDROME_URL:`http://127.0.0.1:${upstream.address().port}`,NAVIDROME_USERNAME:'owner',NAVIDROME_PASSWORD:'owner-password',TRUST_PROXY:'true'});
 const {server,wiimRequestFor}=await import('../server.mjs');server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const origin=`http://127.0.0.1:${server.address().port}`;
 const settings=JSON.parse(readFileSync(join(dir,'settings.json'))),key=readFileSync(join(dir,'settings.key'));const signing=createHmac('sha256',createHmac('sha256',key).update('navimuse:session-signing:v1').digest()).update(settings.admin.sessionSecret).digest();
 const cookie=(sub,musicRevision=0)=>{const p=Buffer.from(JSON.stringify({sub,gen:0,musicRevision,exp:Date.now()+60000})).toString('base64url');return 'navimuse_session='+p+'.'+createHmac('sha256',signing).update(p).digest('base64url');};
 const request=(sub,path,rev=0)=>fetch(origin+path,{headers:{cookie:cookie(sub,rev)}});
 const scim=(path,method,body)=>fetch(origin+'/api/scim/v2'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/scim+json'},body:body?JSON.stringify(body):undefined});
 const input={schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],externalId:'new-sub',userName:'new-user',active:true};
 assert.equal((await request('new-sub','/api/navidrome/search?q=hello')).status,401);
 const created=await scim('/Users','POST',input);assert.equal(created.status,201);const resource=await created.json();
 const result=await (await request('new-sub','/api/navidrome/search?q=hello')).json();assert.equal(result.songs[0].id,'new-user');
 const remembered=(await request('new-sub','/api/settings/session')).headers.get('set-cookie').split(';')[0];
 const rememberedSession=()=>fetch(origin+'/api/settings/session',{headers:{cookie:remembered}});
 const config=await (await request('new-sub','/api/settings')).json();assert.equal(config.services.navidrome.managed,true);assert.equal(config.services.navidrome.username,undefined);assert.equal(config.services.navidrome.url,undefined);assert.ok(!JSON.stringify(config).includes(users.get([...users.keys()][1]).password));
 assert.equal((await fetch(origin+'/api/settings/navidrome',{method:'POST',headers:{cookie:cookie('new-sub'),origin,'content-type':'application/json'},body:'{}'})).status,403);
 const ownerSession=await (await request('owner-sub','/api/settings/session')).json();const ownerScope=ownerSession.queueScope;
 const binding=createHmac('sha256',createHmac('sha256',key).update('navimuse:wiim-binding:v1').digest()).update(JSON.stringify([process.env.NAVIDROME_URL+'/','owner','owner-password'])).digest('hex');
 const legacy={id:ownerScope,scope:ownerScope,mode:'legacy',generation:0,binding};await wiimRequestFor(legacy,'/rest/ping.view');
 assert.equal((await scim('/Users/'+resource.id,'PUT',{...input,active:false})).status,200);
 assert.equal((await request('new-sub','/api/navidrome/search?q=hello')).status,401);
 assert.equal((await (await rememberedSession()).json()).authenticated,false);
 assert.equal((await scim('/Users/'+resource.id,'PUT',input)).status,200);
 const revoked=await rememberedSession();assert.equal((await revoked.json()).authenticated,false);assert.equal(revoked.headers.get('set-cookie'),null);
 assert.equal((await request('new-sub','/api/navidrome/search?q=hello')).status,401);
 assert.equal((await request('new-sub','/api/navidrome/search?q=hello',1)).status,200);
 assert.equal((await request('owner-sub','/api/navidrome/search?q=hello')).status,200);await wiimRequestFor(legacy,'/rest/ping.view');
});
