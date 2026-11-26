import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openRecoverableJson} from '../server/recoverableJson.mjs';
import {createControllerAccess} from '../server/plex/controllers.mjs';
import {createPlexSource} from '../server/plex/source.mjs';

test('durable state recovers a validated generation, ignores torn temp files, and preserves corruption evidence',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'nm-recovery-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'state.json');
 const options={initial:{n:0},validate:v=>Number.isInteger(v?.n)};
 let store=await openRecoverableJson(file,options);await store.save({n:1});await store.save({n:2});
 await writeFile(file+'.tmp','broken');store=await openRecoverableJson(file,options);assert.equal(store.value.n,2);
 await writeFile(file,'{"n":"invalid schema"}');store=await openRecoverableJson(file,options);assert.equal(store.recovery,'backup');assert.equal(store.value.n,1);
 assert.ok((await readdir(dir)).some(n=>n.includes('.corrupt-')));assert.equal((await stat(file)).mode&0o777,0o600);
 await assert.rejects(store.save({n:'bad'}));assert.equal(JSON.parse(await readFile(file)).n,1);
 await writeFile(file,'invalid');await writeFile(file+'.bak','invalid');store=await openRecoverableJson(file,options);assert.equal(store.recovery,'empty-after-corruption');assert.equal(store.value.n,0);
});

test('second-device account pairing is scoped, durable, expires, and rejects other accounts and cross-origin requests',async t=>{
 let now=10000,owner=null,saved={};const r={id:'receiver-a',name:'Living Room',accountId:'123',scope:'scope-a'};
 const source={config:{advertisedUrl:'http://192.168.1.2:18099'},principalFor:r=>({scope:r.scope}),advertisedReceivers:()=>[r],beginControllerLink:async()=>({code:'ABCD',id:'1'}),finishControllerLink:async()=>owner};
 const store={value:saved,save:async v=>{saved=v;}};let access=createControllerAccess({source,store,now:()=>now});t.after(()=>access.close());
 const server=createServer(async(req,res)=>{await access.handle(req,res,new URL(req.url,'http://receiver'));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});const url=`http://127.0.0.1:${server.address().port}`;
 access.observe('127.0.0.1','android',r);access.observe('192.168.1.99','stranger',r);
 const page=await (await fetch(url+'/pair')).text();assert.equal((page.match(/<form/g)||[]).length,1);const action=page.match(/action="([^"]+)"/)[1];
 assert.equal((await fetch(url+action,{method:'POST',headers:{Origin:'https://evil.test'}})).status,403);
 const begin=()=>fetch(url+action,{method:'POST',headers:{Origin:source.config.advertisedUrl},redirect:'manual'});
 let flow=(await begin()).headers.get('location');assert.match(await (await fetch(url+flow)).text(),/ABCD/);
 owner='999';now+=4000;assert.equal((await fetch(url+flow)).status,403);assert.equal(access.allowed('127.0.0.1','android',r),false);
 flow=(await begin()).headers.get('location');owner='123';now+=4000;await access.checkApprovals();assert.equal(access.allowed('127.0.0.1','android',r),true,'approval completes without another browser request');assert.match(await (await fetch(url+flow)).text(),/Connected/);
 assert.equal(access.allowed('127.0.0.1','android',r),true);
 // Docker Desktop can forward phone and tablet through the same peer address.
 // An approved tablet must disappear from the list, not be paired a second time.
 access.observe('127.0.0.1','iphone',r);
 const phonePage=await (await fetch(url+'/pair')).text();assert.equal((phonePage.match(/<form/g)||[]).length,1);
 const phoneAction=phonePage.match(/action="([^"]+)"/)[1];assert.notEqual(phoneAction,action);
 const phoneStart=await fetch(url+phoneAction,{method:'POST',headers:{Origin:source.config.advertisedUrl},redirect:'manual'});assert.equal(phoneStart.status,303);
 now+=4000;await access.checkApprovals();assert.equal(access.allowed('127.0.0.1','iphone',r),true);assert.equal(access.allowed('127.0.0.1','android',r),true,'authorizing phone retains tablet control');
 assert.doesNotMatch(await (await fetch(url+'/pair')).text(),/<form/);
 assert.equal(access.allowed('127.0.0.1','other',r),false);assert.equal(access.allowed('192.168.1.99','android',r),false);
 assert.equal(access.allowed('127.0.0.1','android',{...r,scope:'relinked'}),false);
 await access.close();access=createControllerAccess({source,store:{value:saved},now:()=>now});assert.equal(access.allowed('127.0.0.1','android',r),true);
 now+=31*86400000;assert.equal(access.allowed('127.0.0.1','android',r),false);
 assert.doesNotMatch(JSON.stringify(saved),/android|127\.0|ABCD/);
});

test('automatic receiver identity is restored before discovery and remains authorized while offline',async()=>{
 const config={version:1,autoDiscover:true,server:{url:'http://192.168.1.2:32400',machineIdentifier:'server123'},advertisedUrl:'http://192.168.1.2:18099',receivers:[{id:'receiver-master',deviceId:'bedroom',name:'Bedroom',accountId:'123',token:'master-private-token'}]};
 let saved={};const fakeFetch=async url=>String(url).endsWith('/pins')?Response.json({id:12,code:'CODE'}):String(url).endsWith('/pins/link')?new Response(''):String(url).endsWith('/pins/12')?Response.json({authToken:'child-private-token'}):Response.json({id:123});
 let source=createPlexSource(config,{fetchImpl:fakeFetch,saveDiscoveryCredentials:async v=>{saved=v;}});
 source.syncOutputs([{id:'living-room',uuid:'uuid:AA-BB-CC',name:'Living Room',available:true}]);const child=source.config.receivers.find(r=>r.deviceId==='living-room');await source.ensureReceiverLinked(child);const principal=source.principalFor(child);
 source=createPlexSource(config,{discoveryCredentials:saved});assert.equal(await source.authorize(principal),true);assert.equal(source.advertisedReceivers().some(r=>r.id===child.id),false);
 source.syncOutputs([]);assert.equal(await source.authorize(principal),true);
 const relinked=createPlexSource({...config,receivers:[{...config.receivers[0],token:'new-private-token'}]},{discoveryCredentials:saved});assert.equal(await relinked.authorize(principal),false);
});
