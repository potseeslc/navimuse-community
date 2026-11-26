import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openMusicProvisioning} from '../server/provisioning/scim.mjs';
import {createNavidromeProvisioner} from '../server/provisioning/navidrome.mjs';
const token='a'.repeat(43), userSchema='urn:ietf:params:scim:schemas:core:2.0:User';
const payload=(externalId,userName,active=true)=>({schemas:[userSchema],externalId,userName,active,displayName:userName,emails:[{value:userName+'@example.test',primary:true}]});

test('SCIM identity lifecycle is durable, isolated and retries partial work without granting incomplete access',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'nm-scim-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const nd=new Map([['owner-nd',{userName:'owner',isAdmin:true,password:'owner-password',id:'owner-nd'}],['listenerTwo-nd',{userName:'listenerTwo',isAdmin:false,password:'listenerTwo-password',id:'listenerTwo-nd'}]]);let failLibraries=false,failAfterCreate=false;const created=[];
 const upstream=createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;body=body?JSON.parse(body):null;
  const url=new URL(req.url,'http://localhost');let status=200,result;
  if(url.pathname==='/auth/login'){const u=[...nd.values()].find(u=>u.userName===body.username&&u.password===body.password);if(u)result={id:u.id,username:u.userName,isAdmin:u.isAdmin,token:u.isAdmin?'admin-token':'user-token'};else {status=401;result={error:'bad credentials'};}}
  else if(req.headers['x-nd-authorization']!=='Bearer admin-token'){status=401;result={};}
  else if(url.pathname==='/api/library/99'){result={id:99,totalSongs:0,defaultNewUsers:false};}
  else if(url.pathname==='/api/user'&&req.method==='POST'){
   if([...nd.values()].some(u=>u.userName===body.userName)){status=422;result={};}
   else {assert.equal(body.isAdmin,false);created.push(body.id);nd.set(body.id,{...body});result=body;if(failAfterCreate){failAfterCreate=false;res.destroy();return;}}
  } else {
   const match=url.pathname.match(/^\/api\/user\/([^/]+)(\/library)?$/);const u=match&&nd.get(match[1]);
   if(!u){status=404;result={};}
   else if(match[2]){if(failLibraries){status=503;result={};}else{assert.ok(body.libraryIds.length>0,'Navidrome requires one library');u.libraryIds=body.libraryIds;result=body.libraryIds.map(id=>({id}));}}
   else if(req.method==='PUT'){nd.set(u.id,{...u,...body,libraryIds:u.libraryIds});result=nd.get(u.id);}
   else result=u;
  }
  res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(result));
 });upstream.listen(0,'127.0.0.1');await once(upstream,'listening');t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const adapter=createNavidromeProvisioner({configuration:()=>({url:`http://127.0.0.1:${upstream.address().port}`,username:'owner',password:'owner-password'}),libraryIds:[1,2],disabledLibraryId:99});
 const options={directory,token,adapter,ownerSubject:'owner-sub',seeds:[{sub:'owner-sub',username:'owner',password:'owner-password',owner:true},{sub:'listenerTwo-sub',username:'listenerTwo',password:'listenerTwo-password',owner:false}]};
 let runtime=await openMusicProvisioning(options);
 const server=createServer((req,res)=>runtime.handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const call=async(path,method='GET',body,auth=token)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/scim/v2`+path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/scim+json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:r.status===204?null:await r.json()};};
 assert.equal((await call('/Users','GET',null,'wrong')).status,401);
 assert.equal((await call('/Users')).body.totalResults,2);
 assert.equal(runtime.get('listenerTwo-sub').username,'listenerTwo');
 const owner=(await call('/Users')).body.Resources.find(u=>u.externalId==='owner-sub');
 const beforeOwner=structuredClone(nd.get('owner-nd'));await call('/Users/'+owner.id,'PUT',payload('owner-sub','pocket-owner'));assert.deepEqual(nd.get('owner-nd'),beforeOwner);
 failAfterCreate=true;
 assert.equal((await call('/Users','POST',payload('test-sub','example-test'))).status,503);
 assert.equal(runtime.get('test-sub'),null);assert.equal(created.length,1);
 runtime=await openMusicProvisioning(options); // Recover ambiguous POST after restart.
 const retry=await call('/Users','POST',payload('test-sub','example-test'));assert.equal(retry.status,201);assert.equal(created.length,1);
 const id=retry.body.id;const identity=runtime.get('test-sub');assert.equal(identity.username,'example-test');assert.notEqual(identity.password,'owner-password');
 assert.deepEqual(nd.get(created[0]).libraryIds,[1,2]);assert.equal(nd.get(created[0]).isAdmin,false);
 assert.ok(!JSON.stringify(retry.body).includes(identity.password));assert.ok(!JSON.stringify((await call('/Users')).body).includes('password'));
 assert.equal((await call('/Users/'+id,'PUT',payload('different-sub','example-test'))).status,409);
 assert.equal((await call('/Users','POST',payload('another-sub','example-test'))).status,409);
 // Existing username without an explicit seed mapping must never be adopted.
 assert.equal((await call('/Users','POST',payload('collision-sub','owner'))).status,503);
 assert.equal(runtime.get('collision-sub'),null);assert.deepEqual(nd.get('owner-nd'),beforeOwner);
 failLibraries=true;
 assert.equal((await call('/Users/'+id,'PUT',payload('test-sub','renamed-user',false))).status,503);
 assert.equal(runtime.get('test-sub'),null);assert.equal(runtime.revision('test-sub'),1);
 failLibraries=false;
 assert.equal((await call('/Users/'+id,'PUT',payload('test-sub','renamed-user',false))).status,200);
 assert.deepEqual(nd.get(created[0]).libraryIds,[99]);assert.notEqual(nd.get(created[0]).password,identity.password);
 assert.equal((await call('/Users/'+id,'PUT',payload('test-sub','renamed-user',true))).status,200);
 assert.equal(runtime.get('test-sub').username,'example-test');assert.equal(runtime.revision('test-sub'),1);
 const group=await call('/Groups','POST',{schemas:['urn:ietf:params:scim:schemas:core:2.0:Group'],externalId:'family',displayName:'Family',members:[{value:id}]});assert.equal(group.status,201);
 assert.equal((await call('/Users?startIndex=1&count=1')).body.itemsPerPage,1);
 assert.equal((await call('/Users?filter='+encodeURIComponent('externalId eq "test-sub"'))).body.totalResults,1);
 assert.equal((await call('/Users/'+id,'DELETE')).status,204);assert.equal(runtime.get('test-sub'),null);assert.ok(nd.has(created[0]));
 assert.equal((await call('/Users/'+id)).status,404);
 runtime=await openMusicProvisioning(options);assert.equal(runtime.get('test-sub'),null);
 const back=await call('/Users','POST',payload('test-sub','renamed-user'));assert.equal(back.body.id,id);assert.equal(created.length,1);assert.equal(runtime.revision('test-sub'),2);
 // Seed removal survives process restart and cannot be undone by bootstrap.
 const listenerTwo=(await call('/Users')).body.Resources.find(u=>u.externalId==='listenerTwo-sub');await call('/Users/'+listenerTwo.id,'DELETE');runtime=await openMusicProvisioning(options);assert.equal(runtime.get('listenerTwo-sub'),null);
 assert.equal((await call('/Users','POST',{...payload('bad','bad'),active:'true'})).status,400);
 assert.equal((await call('/Groups/'+group.body.id,'DELETE')).status,204);
 const stored=JSON.parse(readFileSync(join(directory,'accounts.json')));assert.equal(stored.users.find(u=>u.externalId==='test-sub').navidromeId,created[0]);
 chmodSync(join(directory,'accounts.json'),0o644);await assert.rejects(openMusicProvisioning(options),/private/);
});
