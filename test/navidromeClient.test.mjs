import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createNavidromeClient} from '../server/navidromeClient.mjs';
async function fixture(t,handler) {
 const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 return `http://127.0.0.1:${server.address().port}`;
}
test('private client pins server credentials and supports repeated playlist parameters and media ranges',async t=>{
 const seen=[];
 const url=await fixture(t,(req,res)=>{const parsed=new URL(req.url,'http://fixture');seen.push({parsed,headers:req.headers});
  const q=parsed.searchParams;
  assert.equal(q.get('u'),'MusicOwner');assert.equal(q.get('t'),createHash('md5').update('fixture-password'+q.get('s')).digest('hex'));
  res.writeHead(req.headers.range?206:200,{'Content-Type':'application/json'});res.end('{}');
 });
 const config={url:url+'/music',username:'MusicOwner',password:'fixture-password'},client=createNavidromeClient(config);
 config.url='https://untrusted.invalid';config.username='other';config.password='changed';
 await (await client.request('/rest/updatePlaylist.view',{playlistId:'list',songIdToAdd:['one','two']})).json();
 await (await client.request('/rest/stream.view',{id:'one'},{formatJson:false,headers:{Range:'bytes=10-99'}})).json();
 assert.equal(seen[0].parsed.pathname,'/music/rest/updatePlaylist.view');
 assert.deepEqual(seen[0].parsed.searchParams.getAll('songIdToAdd'),['one','two']);
 assert.equal(seen[0].parsed.searchParams.get('f'),'json');
 assert.equal(seen[1].parsed.searchParams.has('f'),false);assert.equal(seen[1].headers.range,'bytes=10-99');
 assert.notEqual(seen[0].parsed.searchParams.get('s'),seen[1].parsed.searchParams.get('s'));
 assert.equal(seen[0].headers.cookie,undefined);assert.equal(seen[0].parsed.searchParams.has('p'),false);
});
test('credential, header, destination and unapproved endpoint overrides reject before transport',async()=>{
 let calls=0;
 const client=createNavidromeClient({url:'http://music.internal',username:'owner',password:'fixture'},{fetchImpl:async()=>{calls++;assert.fail('must not fetch');}});
 for (const key of ['u','p','s','t','apiKey','APIKEY','v','c','f']) await assert.rejects(client.request('/rest/ping.view',{[key]:'attacker'}),/Invalid Navidrome request/);
 for (const path of ['https://other.invalid/rest/ping.view','/rest/../admin','/rest/ping.view?u=attacker','/rest/createUser.view','/rest/%70ing.view']) await assert.rejects(client.request(path),/Invalid Navidrome request/);
 for (const options of [{headers:{Cookie:'secret'}},{headers:{Authorization:'secret'}},{headers:{Host:'other'}},{headers:{Range:'invalid'}},{redirect:'follow'},{method:'POST'}]) await assert.rejects(client.request('/rest/ping.view',{},options),/Invalid Navidrome request/);
 assert.equal(calls,0);
 for (const url of ['http://owner:password@music.internal','http://music.internal?u=other','file:///etc/passwd']) assert.throws(()=>createNavidromeClient({url,username:'owner',password:'fixture'}),/Invalid Navidrome request/);
});
test('redirects never forward credentials and abort reaches the real upstream fetch',async t=>{
 let redirected=0;
 const target=await fixture(t,(_req,res)=>{redirected++;res.end('unexpected');});
 const source=await fixture(t,(req,res)=>{
  if(new URL(req.url,'http://fixture').searchParams.get('id')==='slow') return;
  res.writeHead(302,{Location:target+'/rest/ping.view'});res.end();
 });
 const client=createNavidromeClient({url:source,username:'owner',password:'fixture'});
 const response=await client.request('/rest/ping.view');assert.equal(response.status,302);await response.body.cancel();assert.equal(redirected,0);
 await assert.rejects(client.request('/rest/getSong.view',{id:'slow'},{signal:AbortSignal.timeout(50)}));
});

test('transport failures do not expose credential-bearing URLs or nested causes',async()=>{
 const client=createNavidromeClient({url:'http://music.internal',username:'owner',password:'fixture'},
  {fetchImpl:async url=>{throw new Error('private-url:'+url,{cause:new Error('private credential')});}});
 await assert.rejects(client.request('/rest/ping.view'),error=>{
  assert.equal(error.message,'Navidrome request failed');assert.equal(error.status,502);
  assert.equal(error.cause,undefined);assert.equal(error.stack.includes('private-url'),false);return true;
 });
});

test('playlist form POST retains captured identity and duplicate occurrences without credentials in URL',async t=>{
 const seen=[];
 const url=await fixture(t,async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  seen.push({url:new URL(req.url,'http://fixture'),method:req.method,headers:req.headers,form:new URLSearchParams(body)});
  res.writeHead(200,{'content-type':'application/json'});res.end('{}');
 });
 const config={url,username:'original',password:'fixture-password'};
 const client=createNavidromeClient(config);config.username='replacement';config.password='changed';
 await (await client.request('/rest/getOpenSubsonicExtensions.view')).json();
 await (await client.request('/rest/createPlaylist.view',{playlistId:'qa',songId:['a','a','b']},{formPost:true})).json();
 const write=seen[1];assert.equal(write.method,'POST');assert.equal(write.url.search,'');
 assert.equal(write.headers['content-type'],'application/x-www-form-urlencoded');
 assert.deepEqual(write.form.getAll('songId'),['a','a','b']);assert.equal(write.form.get('u'),'original');
 assert.equal(write.form.get('t'),createHash('md5').update('fixture-password'+write.form.get('s')).digest('hex'));
 assert.equal(write.form.has('p'),false);assert.equal(write.headers.cookie,undefined);
});

test('form POST option cannot change unrelated endpoint methods or inject headers',async()=>{
 let calls=0;const client=createNavidromeClient({url:'http://music.internal',username:'owner',password:'fixture'},
  {fetchImpl:async()=>{calls++;throw new Error('unexpected request');}});
 for(const [path,options] of [['/rest/ping.view',{formPost:true}],['/rest/createPlaylist.view',{formPost:'true'}],['/rest/createPlaylist.view',{formPost:true,headers:{Range:'bytes=0-1'}}]]) {
  await assert.rejects(client.request(path,{},options),/Invalid Navidrome request/);
 }
 assert.equal(calls,0);
});
