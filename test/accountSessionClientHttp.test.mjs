import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openLocalAccountRuntime} from '../server/accountRuntime.mjs';
import {createAccountSessionClient} from '../src/services/accountSessionService.js';

test('client drives actual setup, password login, remembered renewal and logout through the account runtime',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'navimuse-client-http-'));let runtime;
 const server=createServer(async(req,res)=>{if(!runtime || !await runtime.handleAccountRequest(req,res)){res.writeHead(404);res.end('{}');}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{if(runtime)await runtime.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
 const origin=`http://127.0.0.1:${server.address().port}`;
 runtime=await openLocalAccountRuntime({directory,initialize:true,legacyConfigured:false,boundaryOptions:{canonicalOrigin:origin,developmentLoopback:true},navidromeEntries:[],assertAllowedNavidromeUrl:()=>assert.fail('no upstream configured'),verifySetupToken:async token=>token==='fixture-client-setup-token',passwordOptions:{screenPassword:async()=> 'allowed'}});
 // Node cookie harness with Path matching. Browser HttpOnly/SameSite acceptance
 // is separate; the production client never reads or stores these cookie values.
 const cookies=new Map();let loseLogoutResponse=false;
 const fetchImpl=async(url,init)=>{
  const path=new URL(url).pathname;
  const cookie=[...cookies].filter(([,value])=>path===value.path||path.startsWith(value.path.endsWith('/')?value.path:value.path+'/')).map(([name,value])=>name+'='+value.value).join('; ');
  const result=await fetch(url,{...init,headers:{...init.headers,...(cookie?{Cookie:cookie}:{})}});
  if(loseLogoutResponse && path.endsWith('/logout')) {
   loseLogoutResponse=false;await result.arrayBuffer();throw new Error('simulated lost logout response');
  }
  for(const line of result.headers.getSetCookie()) {
   const parts=line.split(';').map(x=>x.trim()),at=parts[0].indexOf('='),name=parts[0].slice(0,at),value=parts[0].slice(at+1),cookiePath=parts.find(x=>x.startsWith('Path='))?.slice(5)||'/';
   if(!value)cookies.delete(name);else cookies.set(name,{value,path:cookiePath});
  }
  return result;
 };
 const client=createAccountSessionClient({baseUrl:origin+'/api/auth/v1',fetchImpl,locks:{request:(_name,_options,operation)=>operation()}});
 assert.equal((await client.readSession()).state,'setup-required');
 const password='Actual Argon2 fixture client password!';
 assert.deepEqual(await client.setup({setupToken:'fixture-client-setup-token',username:'owner',displayName:'Owner',password}),{ok:true,next:'sign-in'});
 await assert.rejects(client.login({username:'owner',password:'wrong'}),error=>error.code==='INVALID_CREDENTIALS'&&error.status===401);
 const signed=await client.login({username:'owner',password,remember:true});assert.equal(signed.state,'authenticated');assert.equal(signed.queueScope,null);
 cookies.delete('navimuse_session_v1_dev');
 const renewed=await client.renew();assert.equal(renewed.account.id,signed.account.id);assert.equal(renewed.session.authenticatedAt,signed.session.authenticatedAt);
 assert.deepEqual(await client.logout(),{ok:true});assert.equal((await client.readSession()).state,'signed-out');assert.equal(cookies.size,0);
 // The server commits revocation, but the client receives neither response nor
 // clearing cookies. Do not report confirmed logout or retain an invented identity.
 await client.login({username:'owner',password,remember:true});
 loseLogoutResponse=true;
 await assert.rejects(client.logout(),error=>error.code==='ACCOUNT_UNAVAILABLE');
 assert.equal(cookies.size,2,'fixture retains both stale cookies after losing the response');
 assert.equal((await client.readSession()).state,'signed-out','authoritative recovery observes committed revocation');
 assert.deepEqual(await client.logout(),{ok:true},'explicit logout retry is safe');
 assert.equal(cookies.size,0);

});
