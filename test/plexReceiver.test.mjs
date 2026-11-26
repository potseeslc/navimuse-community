import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createPlexSource,validatePlexConfig,localAddress,plexHeaders} from '../server/plex/source.mjs';
import {createPlexReceiver,plexTimeline,plexOutputDevice} from '../server/plex/receiver.mjs';
import {openRemoteCoordinator} from '../server/wiim/coordinator.mjs';
import {createWiiMHttpHandler} from '../server/wiim/http.mjs';
const config={version:1,server:{url:'http://192.168.1.242:32400',machineIdentifier:'approvedserver123'},advertisedUrl:'http://192.168.1.242:18099',receivers:[{id:'navimuse-test-target',deviceId:'bedroom',name:'NaviMuse Bedroom & Stereo',accountId:'123',token:'private-plex-test-token'}]};
const track=(id,occurrence=id)=>({type:'track',ratingKey:String(id),playQueueItemID:String(occurrence),title:'Song '+id,grandparentTitle:'Artist',parentTitle:'Album',parentRatingKey:'800',index:Number(id),duration:100000,thumb:`/library/metadata/${id}/thumb/100`,Media:[{container:'flac',Part:[{key:`/library/parts/${id}/100/file.flac`}]}]});
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'navimuse-plex-'));let queueTracks=[track(1),track(2)],time=10000,selectedItem=1,timelineFails=false,queueTotal=null,selectedOffset=0;const upstream=[],calls=[];
 const source=createPlexSource(config,{now:()=>time,fetchImpl:async(raw,options)=>{
  const u=new URL(raw);upstream.push({url:u.href,options});
  if(u.hostname==='plex.tv')return u.pathname==='/api/v2/resources'?Response.json([{clientIdentifier:config.server.machineIdentifier,owned:true}]):Response.json({id:999});
  if(u.pathname==='/')return Response.json({MediaContainer:{machineIdentifier:config.server.machineIdentifier}});
  if(u.pathname==='/security/resources')return options.headers['X-Plex-Token']==='transient-owner-test-token'?Response.json({MediaContainer:{size:0}}):new Response('',{status:403});
  if(u.pathname==='/:/timeline'){if(timelineFails)return new Response('',{status:503});selectedItem=Number(u.searchParams.get('playQueueItemID'));return Response.json({MediaContainer:{size:0}});}
  if(u.pathname==='/playQueues/77')return Response.json({MediaContainer:{playQueueID:77,playQueueVersion:1,playQueueTotalCount:queueTotal??queueTracks.length,playQueueSelectedItemOffset:selectedOffset,playQueueSelectedItemID:selectedItem,Metadata:queueTracks}});
  const id=u.pathname.match(/^\/library\/metadata\/(\d+)$/)?.[1];if(id)return Response.json({MediaContainer:{Metadata:[track(id)]}});
  return new Response('audio',{status:options.headers.Range?206:200,headers:{'content-type':u.pathname.includes('/thumb/')?'image/jpeg':'application/octet-stream','content-range':'bytes 0-4/10'}});
 }});
 let observation={uri:'',state:'STOPPED',position:0,duration:100,at:time};
 const device={configuration:{id:'bedroom'},topology:async()=>({id:'bedroom',uuid:'uuid:AA-BB',members:[]}),observe:async()=>({...observation,at:time}),
  load:async({uri,paused})=>{calls.push(['load',uri]);observation={...observation,uri,state:paused?'STOPPED':'PLAYING',position:0};},
  seek:async v=>{calls.push(['seek',v]);observation.position=v;},pause:async()=>{calls.push(['pause']);observation.state='PAUSED_PLAYBACK';},play:async()=>{calls.push(['play']);observation.state='PLAYING';},stop:async()=>{calls.push(['stop']);observation.state='STOPPED';},volume:async v=>calls.push(['volume',v])};
 const coordinator=await openRemoteCoordinator({directory,baseUrl:'http://192.168.1.242:8099',devices:[device],enabled:true,pollInterval:3600000,now:()=>time,authorize:async p=>p.kind==='plex'?source.authorize(p):true,songFor:async(p,id)=>p.kind==='plex'?source.songFor(p,id):{id,title:id,duration:100}});
 const receiver=createPlexReceiver({source,coordinator,now:()=>time}),server=createServer(receiver.handle);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await receiver.close();await coordinator.close();await rm(directory,{recursive:true,force:true});});
 const request=(path,options={})=>fetch(base+path,{headers:{'X-Plex-Client-Identifier':'phone-test','X-Plex-Target-Client-Identifier':config.receivers[0].id,'X-Plex-Token':config.receivers[0].token,...options.headers}});
 const play=(commandID=1,extra='')=>request(`/player/playback/playMedia?commandID=${commandID}&containerKey=/playQueues/77&key=/library/metadata/1&machineIdentifier=approvedserver123${extra}`);
 return {source,coordinator,receiver,base,request,play,calls,upstream,directory,principal:source.principalFor(config.receivers[0]),setQueue:v=>queueTracks=v,setSelected:v=>selectedItem=v,setWindow:(total,offset)=>{queueTotal=total;selectedOffset=offset;},failTimeline:()=>timelineFails=true,advance:values=>{time+=2000;observation={...observation,...values};},get uri(){return observation.uri;}};
}
test('Plex source rejects unapproved origins, invalid receiver config and token-bearing media paths',async t=>{
 assert.equal(localAddress('::ffff:192.168.1.2'),true);assert.equal(localAddress('8.8.8.8'),false);
 assert.throws(()=>validatePlexConfig({...config,server:{...config.server,url:'https://attacker.example'}}));
 assert.throws(()=>validatePlexConfig({...config,receivers:[...config.receivers,...config.receivers]}));
 const f=await fixture(t);
 await assert.rejects(f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'http://attacker.example/steal'})));
 await assert.rejects(f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'/playQueues/77',machineIdentifier:'wrong'})),e=>e.status===403);
 const q=await f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'/playQueues/77',address:'169.254.169.254',token:'attacker'}));
 assert.equal(q.source.playQueueId,'77');assert.equal(q.items.length,2);assert.ok(f.upstream.every(x=>x.url.startsWith(config.server.url)));
 f.setQueue([{...track(1),Media:[{container:'flac',Part:[{key:'https://evil.example/file.flac'}]}]}]);
 await assert.rejects(f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'/playQueues/77'})));
});
test('Plex commands run through the shared coordinator; retries do not replay tracks',async t=>{
 const f=await fixture(t);let response=await f.request('/resources');assert.equal(response.status,200);assert.match(await response.text(),/NaviMuse Bedroom &amp; Stereo/);
 response=await f.play(1,'&offset=23000');assert.equal(response.status,200,await response.text());assert.deepEqual(f.calls.find(c=>c[0]==='seek'),['seek',23]);
 assert.equal((await f.play()).status,200);assert.equal(f.calls.filter(c=>c[0]==='load').length,1);
 assert.equal((await f.request('/player/playback/pause?commandID=2')).status,200);
 assert.equal((await f.request('/player/playback/pause?commandID=2')).status,200);assert.equal(f.calls.filter(c=>c[0]==='pause').length,1);
 const timeline=await f.request('/player/timeline/poll?commandID=3');assert.match(await timeline.text(),/state="paused"/);
 assert.equal((await f.request('/player/playback/play?commandID=4')).status,200);
 assert.equal((await f.request('/player/playback/skipNext?commandID=5')).status,200);assert.equal((await f.coordinator.snapshot(f.principal)).song.id,'2');
 assert.equal((await f.request('/player/playback/setParameters?commandID=6&volume=30&repeat=2')).status,200);assert.ok((await f.coordinator.snapshot(f.principal)).controls.repeatAll);
 assert.equal((await f.request('/player/playback/stop?commandID=7')).status,200);assert.equal((await f.coordinator.snapshot(f.principal)).status,'released');
 assert.ok(!(await readFile(join(f.directory,'sessions-v1.json'),'utf8')).includes(config.receivers[0].token));
});
test('Plex cannot take over a speaker owned by NaviMuse, and NaviMuse cannot take over Plex',async t=>{
 const f=await fixture(t),p={id:'native-user',scope:'binding'};
 let own=await f.coordinator.create(p,{deviceId:'bedroom',transferId:'native-transfer-1',queue:{index:0,items:[{queueItemId:'native-one',song:{id:'native-song'}}]}});
 assert.equal((await f.play()).status,409);assert.equal(f.calls.filter(c=>c[0]==='load').length,1);
 await f.coordinator.command(p,own.id,{revision:own.revision,commandId:'release-native',action:'release'});
 assert.equal((await f.play(2)).status,200);
 await assert.rejects(f.coordinator.create(p,{deviceId:'bedroom',transferId:'native-transfer-2',queue:{index:0,items:[{queueItemId:'native-one',song:{id:'native-song'}}]}}),e=>e.status===409);
});
test('queue refresh retains the current occurrence and position without another load',async t=>{
 const f=await fixture(t);await f.play();f.advance({position:55});await f.coordinator.tick();
 f.setQueue([track(1),track(2),track(3)]);
 const response=await f.request('/player/playback/refreshPlayQueue?commandID=2&playQueueID=77');assert.equal(response.status,200,await response.text());
 const s=await f.coordinator.snapshot(f.principal);assert.equal(s.queue.items.length,3);assert.equal(s.position,55);assert.equal(f.calls.filter(c=>c[0]==='load').length,1);
 f.setQueue([track(2),track(3)]);assert.equal((await f.request('/player/playback/refreshPlayQueue?commandID=3&playQueueID=77')).status,409);
 assert.equal((await f.coordinator.snapshot(f.principal)).song.id,'1');
});
test('Plex media uses reusable grants and Range with no Plex token in renderer URLs',async t=>{
 const f=await fixture(t);await f.play();const token=new URL(f.uri).pathname.split('/')[3];
 const handler=createWiiMHttpHandler({coordinator:f.coordinator,externalMediaFor:f.source.mediaFor,principalFor:()=>{throw Error('no public controls');}});
 const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/media/wiim/${token}/audio`,{headers:{Range:'bytes=0-4'}});
 assert.equal(response.status,206);assert.equal(await response.text(),'audio');assert.equal(response.headers.get('content-type'),'audio/flac');
 assert.equal(f.upstream.at(-1).options.headers.Range,'bytes=0-4');assert.equal(f.upstream.at(-1).options.headers['X-Plex-Token'],config.receivers[0].token);assert.ok(!f.uri.includes(config.receivers[0].token));
});
test('unlinked controllers, wrong accounts and browser origins cannot control speakers',async t=>{
 const f=await fixture(t);
 const probe=await f.request('/player/timeline/poll?commandID=0',{headers:{'X-Plex-Token':''}});assert.equal(probe.status,200);assert.match(await probe.text(),/state="stopped"/);
 assert.equal((await f.request('/player/playback/play?commandID=1',{headers:{'X-Plex-Token':''}})).status,401);
 assert.equal((await f.request('/player/playback/play?commandID=1',{headers:{'X-Plex-Token':'different-account-token'}})).status,403);
 assert.equal((await f.request('/resources',{headers:{Origin:'https://attacker.example'}})).status,403);
 assert.equal(f.calls.length,0);
 await f.play();assert.equal((await f.request('/player/playback/pause?commandID=2',{headers:{'X-Plex-Token':''}})).status,200,'authenticated controller binding supports subsequent tokenless Companion controls');
});
test('paused Plex transfer does not start audio and oversized queues fail explicitly',async t=>{
 const f=await fixture(t);assert.equal((await f.play(1,'&paused=1')).status,200);assert.equal((await f.coordinator.snapshot(f.principal)).status,'paused');
 assert.equal(f.calls.filter(c=>c[0]==='play').length,0);
 f.setQueue(Array.from({length:1001},(_,i)=>track(i+1)));assert.equal((await f.play(2)).status,422);
});
test('Plex natural track completion advances the shared queue without a controller',async t=>{
 const f=await fixture(t);await f.play();f.advance({position:99});await f.coordinator.tick();f.advance({position:100,state:'STOPPED'});await f.coordinator.tick();
 assert.equal((await f.coordinator.snapshot(f.principal)).song.id,'2');assert.equal(f.calls.filter(c=>c[0]==='load').length,2);
});
test('media header timeout cannot truncate a long song; downstream cancellation still propagates',async t=>{
 const f=await fixture(t);await f.source.songFor(f.principal,'1');
 t.mock.timers.enable({apis:['setTimeout']});
 const controller=new AbortController();const response=await f.source.mediaFor(f.principal,'1',{signal:controller.signal});
 const signal=f.upstream.at(-1).options.signal;t.mock.timers.tick(20000);assert.equal(signal.aborted,false,'header deadline is cleared once the media response starts');
 controller.abort();assert.equal(signal.aborted,true);await response.body.cancel();t.mock.timers.reset();
});

test('receiver advertises Companion capability and never invents an unknown volume',()=>{
 assert.equal(plexHeaders(config.receivers[0])['X-Plex-Provides'],'player,pubsub-player');
 assert.doesNotMatch(plexTimeline(config.receivers[0],null,config.server),/volume=/);
});


test('Plexamp query delegation token starts playback and binds subsequent tokenless controls',async t=>{
 const f=await fixture(t);
 const response=await f.request('/player/playback/playMedia?commandID=1&type=music&containerKey=/playQueues/77&key=/library/metadata/1&token=transient-owner-test-token',{headers:{'X-Plex-Token':''}});
 assert.equal(response.status,200,await response.text());assert.equal(f.calls.filter(c=>c[0]==='load').length,1);
 assert.equal((await f.request('/player/playback/pause?commandID=2',{headers:{'X-Plex-Token':''}})).status,200);
 assert.ok(!f.uri.includes('transient-'));assert.ok(!f.upstream.some(x=>x.url.includes('token=')));
 assert.ok(!f.upstream.some(x=>x.url.includes('/api/v2/user')));
});

test('delegation requires owned pinned PMS, admin proof and rejection of arbitrary tokens',async()=>{
 for(const mode of ['owner','shared','invalid','wrong-server','unowned','auth-bypass','malformed','redirect']){
  let time=0;const calls=[];
  const source=createPlexSource(config,{now:()=>time,fetchImpl:async(raw,options)=>{
   const u=new URL(raw);calls.push({u,options});
   if(u.hostname==='plex.tv'){
    assert.equal(options.headers['X-Plex-Token'],config.receivers[0].token);
    assert.equal(u.pathname,'/api/v2/resources');
    return Response.json([{clientIdentifier:config.server.machineIdentifier,owned:mode!=='unowned'}]);
   }
   assert.equal(u.origin,config.server.url);assert.equal(options.redirect,'error');
   if(u.pathname==='/')return mode==='invalid'?new Response('',{status:401}):Response.json({MediaContainer:{machineIdentifier:mode==='wrong-server'?'different-server':config.server.machineIdentifier}});
   assert.equal(u.pathname,'/security/resources');assert.equal(u.searchParams.get('source'),'server://'+config.server.machineIdentifier);
   if(mode==='auth-bypass')return Response.json({MediaContainer:{size:0}});
   if(options.headers['X-Plex-Token']!=='transient-owner-test-token')return new Response('',{status:403});
   if(mode==='shared')return new Response('',{status:403});
   if(mode==='redirect')return new Response('',{status:302,headers:{location:'https://attacker.example'}});
   return Response.json(mode==='malformed'?{}:{MediaContainer:{size:0}});
  }});
  let authorized=false;try{authorized=await source.validateController(config.receivers[0],'transient-owner-test-token');}catch(error){assert.ok([403,502].includes(error.status));}
  assert.equal(authorized,mode==='owner',mode);
  if(mode==='owner'){
   const count=calls.length;assert.equal(await source.validateController(config.receivers[0],'transient-owner-test-token'),true);assert.equal(calls.length,count);
   time=61000;await source.validateController(config.receivers[0],'transient-owner-test-token');assert.ok(calls.length>count,'proof expires');
  }
 }
});


test('room receiver selects its existing group leader, never an unrelated or ambiguous output',()=>{
 const room={id:'bedroom',uuid:'uuid:AA-BB-CC',address:'192.168.1.140',available:true,follower:true};
 const leader={id:'living',available:true,follower:false,members:[{id:'short-vendor-id',address:room.address}]};
 assert.equal(plexOutputDevice([room,leader],'bedroom'),'living');
 assert.equal(plexOutputDevice([{...room,follower:false},leader],'bedroom'),'bedroom');
 assert.equal(plexOutputDevice([room,{...leader,members:[{id:'AABBCC'}]}],'bedroom'),'living');
 for(const outputs of [[room],[{...room,available:false},leader],[room,{...leader,available:false}],[room,{...leader,follower:true}],[room,{...leader,members:[]}],[room,leader,{...leader,id:'other'}]])assert.throws(()=>plexOutputDevice(outputs,'bedroom'));
});

test('Plex transfer routes a grouped room through the coordinator leader without regrouping',async t=>{
 const f=await fixture(t);const actualCreate=f.coordinator.create.bind(f.coordinator);let selected;
 f.coordinator.outputs=async()=>[{id:'bedroom',available:true,follower:true,address:'192.168.1.140'},{id:'leader',available:true,follower:false,members:[{address:'192.168.1.140'}]}];
 f.coordinator.create=async(principal,input)=>{selected=input.deviceId;return actualCreate(principal,{...input,deviceId:'bedroom'});};
 const response=await f.play();assert.equal(response.status,200,await response.text());assert.equal(selected,'leader');assert.equal(f.calls.filter(c=>c[0]==='load').length,1);
});


test('music receiver puts its active music timeline first for Plexamp player controls',async t=>{
 const f=await fixture(t);await f.play();
 const response=await f.request('/player/timeline/poll?commandID=3');const xml=await response.text();
 const first=xml.match(/<Timeline ([^>]+)\/>/)[1];assert.match(first,/type="music"/);assert.match(first,/itemType="music"/);assert.match(first,/state="playing"/);assert.match(first,/ratingKey="1"/);assert.match(first,/controllable="playPause,/);
});


test('idle and stopped music timelines preserve the Plexamp item type',()=>{
 for(const s of [null,{status:'released',position:0,duration:0}])assert.match(plexTimeline(config.receivers[0],s,config.server),/itemType="music"/);
});


test('Plexamp command and -wait long-poll identities see the same authenticated playback',async t=>{
 const f=await fixture(t);await f.play();
 const headers={'X-Plex-Token':'','X-Plex-Client-Identifier':'phone-test-wait'};
 const poll=await f.request('/player/timeline/poll?commandID=3&wait=1',{headers});assert.equal(poll.status,200);assert.match(await poll.text(),/state="playing"/);
 const stranger=await f.request('/player/timeline/poll?commandID=4&wait=1',{headers:{...headers,'X-Plex-Client-Identifier':'another-phone-wait'}});assert.match(await stranger.text(),/state="stopped"/);
 assert.equal((await f.request('/player/playback/stop?commandID=5',{headers})).status,401,'poll alias must not authorize commands');
 const noWait=await f.request('/player/timeline/poll?commandID=6&wait=0',{headers});assert.match(await noWait.text(),/state="stopped"/);
 assert.equal((await f.coordinator.snapshot(f.principal)).status,'playing');
});

test('a waiting idle probe rechecks authentication after playMedia completes',async t=>{
 const f=await fixture(t);
 const pending=f.request('/player/timeline/poll?commandID=1&wait=1',{headers:{'X-Plex-Token':'','X-Plex-Client-Identifier':'phone-test-wait'}});
 await new Promise(r=>setTimeout(r,40));await f.play(2);
 assert.match(await (await pending).text(),/state="playing"/);
});

test('automatic speaker receivers keep stable IDs across restarts, IP changes and renames',()=>{
 const input={...config,autoDiscover:true};const a=createPlexSource(input),b=createPlexSource(input);
 const outputs=[{id:'bedroom',uuid:'uuid:AA-BB-CC-DD',name:'Bedroom',available:true},{id:'living',uuid:'uuid:11-22-33-44',name:'Living Room',available:true}];
 a.syncOutputs(outputs);b.syncOutputs(outputs);
 assert.equal(a.config.receivers.length,2);assert.equal(a.config.receivers[0].id,config.receivers[0].id);
 const living=a.config.receivers[1];assert.equal(living.name,'NaviMuse Living Room');assert.equal(living.id,b.config.receivers[1].id);
 living.token='linked-child-token';living.needsLink=false;
 const principal=a.principalFor(living);
 a.syncOutputs([outputs[0],{...outputs[1],name:'Living Stereo',address:'192.168.2.5'}]);
 assert.equal(a.config.receivers[1].id,living.id);assert.deepEqual(a.principalFor(living),principal);assert.equal(living.name,'NaviMuse Living Stereo');
 a.syncOutputs([{...outputs[0],available:false}]);assert.equal(a.advertisedReceivers().length,0);assert.ok(a.receiverFor(principal),'offline discovery must not revoke an existing media principal');
 a.syncOutputs(outputs);assert.equal(a.advertisedReceivers().length,2);assert.equal(a.config.receivers.length,2);
 const disabled=createPlexSource(config);disabled.syncOutputs(outputs);assert.equal(disabled.config.receivers.length,1);
});

test('automatic discovery advertises every available target and rejects ambiguous commands',async t=>{
 const f=await fixture(t);f.source.config.autoDiscover=true;
 f.source.syncOutputs([{id:'bedroom',uuid:'uuid:AA-BB-CC-DD',available:true},{id:'living',uuid:'uuid:11-22-33-44',name:'Living & Kitchen',available:true}]);
 f.source.config.receivers[1].needsLink=false;f.source.config.receivers[1].token='linked-child-token';
 const resources=await f.request('/resources',{headers:{'X-Plex-Target-Client-Identifier':''}});const xml=await resources.text();assert.equal((xml.match(/<Player /g)||[]).length,2);assert.match(xml,/Living &amp; Kitchen/);
 assert.equal((await f.request('/player/playback/play?commandID=1',{headers:{'X-Plex-Target-Client-Identifier':''}})).status,404);
 const living=f.source.config.receivers[1];f.source.syncOutputs([{id:'bedroom',uuid:'uuid:AA-BB-CC-DD',available:true}]);
 assert.equal((await f.request('/resources',{headers:{'X-Plex-Target-Client-Identifier':living.id}})).status,404);
 assert.equal((await f.play()).status,200,'existing linked target still works');
});

test('automatic receiver registry is bounded and ignores invalid identities',()=>{
 const source=createPlexSource({...config,autoDiscover:true});
 source.syncOutputs(Array.from({length:50},(_,i)=>({id:'room-'+i,uuid:'uuid:abcd-'+i.toString(16).padStart(4,'0'),name:'Room',available:true})));
 assert.equal(source.config.receivers.length,16);
 const clean=createPlexSource({...config,autoDiscover:true});clean.syncOutputs([{id:'bad/id',uuid:'uuid:abcd-1111',available:true},{id:'room',uuid:'bad',available:true}]);assert.equal(clean.config.receivers.length,1);
});


test('discovered receivers get distinct persisted owner tokens before advertisement',async()=>{
 const input={...config,autoDiscover:true};let saved;const calls=[];
 const fetchImpl=async(raw,options)=>{
  const path=new URL(raw).pathname;calls.push(path);
  if(path==='/api/v2/pins'){assert.equal(options.method,'POST');return Response.json({id:42,code:'code'});}
  if(path==='/api/v2/pins/link'){assert.equal(options.method,'PUT');assert.equal(options.headers['X-Plex-Product'],'Plex SSO');assert.equal(options.headers['X-Plex-Token'],config.receivers[0].token);assert.equal(options.body.get('code'),'code');return new Response('');}
  if(path==='/api/v2/pins/42')return Response.json({authToken:'separate-child-token'});
  if(path==='/api/v2/user')return Response.json({id:config.receivers[0].accountId});
  throw Error('Unexpected request');
 };
 const source=createPlexSource(input,{fetchImpl,saveDiscoveryCredentials:async value=>{saved=value;}});
 const outputs=[{id:'living',uuid:'uuid:abcd-1234',name:'Living',available:true}];source.syncOutputs(outputs);
 const child=source.config.receivers[1];assert.equal(source.advertisedReceivers().length,0);assert.equal(await source.validateController(child,config.receivers[0].token),false);
 await source.ensureReceiverLinked(child);assert.equal(source.advertisedReceivers().length,1);assert.notEqual(child.token,config.receivers[0].token);assert.ok(saved[child.id]);
 const restarted=createPlexSource(input,{fetchImpl,discoveryCredentials:saved});restarted.syncOutputs(outputs);await restarted.ensureReceiverLinked(restarted.config.receivers[1]);assert.equal(calls.length,4);assert.equal(restarted.config.receivers[1].token,child.token);
 const relinked=createPlexSource({...input,receivers:[{...config.receivers[0],token:'changed-master-token'}]},{discoveryCredentials:saved});relinked.syncOutputs(outputs);assert.equal(relinked.advertisedReceivers().length,0);
});

test('failed or wrong-owner automatic links stay hidden and unpersisted',async()=>{
 for(const mode of ['failed','wrong-owner','storage']){
  let saved=false;const source=createPlexSource({...config,autoDiscover:true},{fetchImpl:async raw=>{
   const path=new URL(raw).pathname;
   if(path==='/api/v2/pins')return Response.json({id:42,code:'code'});
   if(path==='/api/v2/pins/link')return new Response('',{status:mode==='failed'?403:200});
   if(path==='/api/v2/pins/42')return Response.json({authToken:'separate-child-token'});
   return Response.json({id:mode==='wrong-owner'?'999999':config.receivers[0].accountId});
  },saveDiscoveryCredentials:async()=>{if(mode==='storage')throw Error('disk unavailable');saved=true;}});
  source.syncOutputs([{id:'living',uuid:'uuid:abcd-1234',available:true}]);await assert.rejects(source.ensureReceiverLinked(source.config.receivers[1]));assert.equal(source.advertisedReceivers().length,0);assert.equal(saved,false);
 }
});


test('speaker skips update the PMS queue occurrence used when pulling playback to the phone',async t=>{
 const f=await fixture(t);f.setQueue([track(1,1),track(2,2),track(1,3),track(4,4)]);
 await f.play();const old=await f.coordinator.snapshot(f.principal);
 assert.equal((await f.request('/player/playback/skipNext?commandID=2')).status,200);
 assert.equal((await f.request('/player/playback/skipNext?commandID=3')).status,200);
 assert.equal((await f.request('/player/playback/seekTo?commandID=4&offset=37000')).status,200);
 const timeline=await (await f.request('/player/timeline/poll?commandID=5')).text();assert.match(timeline,/playQueueItemID="3"/);assert.match(timeline,/time="37000"/);
 const reports=f.upstream.filter(x=>new URL(x.url).pathname==='/:/timeline');const latest=new URL(reports.at(-1).url).searchParams;
 assert.equal(latest.get('playQueueItemID'),'3');assert.equal(latest.get('ratingKey'),'1');assert.equal(latest.get('time'),'37000');
 // Duplicate songs must resume at the right occurrence, not their first appearance.
 const queue=await f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'/playQueues/77'}));assert.equal(queue.index,2);
 await f.source.syncTimeline(config.receivers[0],old);const unchanged=await f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'/playQueues/77'}));assert.equal(unchanged.index,2,'delayed old snapshot cannot undo a skip');
 const count=f.upstream.filter(x=>new URL(x.url).pathname==='/:/timeline').length;await f.request('/player/timeline/poll?commandID=6');assert.equal(f.upstream.filter(x=>new URL(x.url).pathname==='/:/timeline').length,count,'unchanged polls are throttled');
});

test('PMS timeline failure does not fail speaker playback or its current-item timeline',async t=>{
 const f=await fixture(t);await f.play();f.failTimeline();assert.equal((await f.request('/player/playback/skipNext?commandID=2')).status,200);
 const reply=await f.request('/player/timeline/poll?commandID=3');assert.equal(reply.status,200);assert.match(await reply.text(),/playQueueItemID="2"/);assert.equal((await f.coordinator.snapshot(f.principal)).song.id,'2');
});


test('released speaker polls do not overwrite the queue after playback moves to the phone',async t=>{
 const f=await fixture(t);await f.play();await f.request('/player/playback/skipNext?commandID=2');await f.request('/player/playback/stop?commandID=3');
 const count=f.upstream.filter(x=>new URL(x.url).pathname==='/:/timeline').length;
 for(let i=0;i<10;i++)f.advance({position:0});
 await f.request('/player/timeline/poll?commandID=4');assert.equal(f.upstream.filter(x=>new URL(x.url).pathname==='/:/timeline').length,count);
});


test('album playback honors the selected occurrence over Plexamp first-track key',async t=>{
 const f=await fixture(t);f.setQueue([track(1,101),track(2,102),track(3,103),track(4,104)]);f.setSelected(103);
 const response=await f.play();assert.equal(response.status,200,await response.text());
 const s=await f.coordinator.snapshot(f.principal);assert.equal(s.queue.index,2);assert.equal(s.queue.items[s.queue.index].queueItemId,'plex-77-103');
 assert.equal((await f.request('/player/playback/skipNext?commandID=2')).status,200);assert.equal((await f.coordinator.snapshot(f.principal)).song.id,'4');
});

test('explicit queue occurrences win and invalid ones do not silently play another song',async t=>{
 const f=await fixture(t);f.setSelected(1);
 const params=new URLSearchParams({containerKey:'/playQueues/77',playQueueItemID:'2',key:'/library/metadata/1'});
 assert.equal((await f.source.queueFor(config.receivers[0],params)).index,1);
 params.set('playQueueItemID','999');await assert.rejects(f.source.queueFor(config.receivers[0],params),e=>e.status===409);
 params.set('playQueueItemID','bad');await assert.rejects(f.source.queueFor(config.receivers[0],params));
 params.delete('playQueueItemID');params.set('key','/library/metadata/2');f.setSelected(null);
 assert.equal((await f.source.queueFor(config.receivers[0],params)).index,1,'key is a fallback when PMS has no selected occurrence');
});


test('radio loads a bounded window and refreshes ahead without restarting current audio',async t=>{
 const f=await fixture(t);f.setQueue([track(1),track(2),track(3)]);f.setWindow(127903,0);
 assert.equal((await f.play(1,'&offset=23000')).status,200);let s=await f.coordinator.snapshot(f.principal);assert.equal(s.queue.source.windowed,true);assert.equal(s.queue.source.hasMoreAfter,true);
 f.setQueue([track(1),track(2),track(3),track(4),track(5)]);
 await f.receiver.refreshWindow(f.source.config.receivers[0]);s=await f.coordinator.snapshot(f.principal);assert.equal(s.queue.items.length,5);assert.equal(s.position,23);assert.equal(f.calls.filter(c=>c[0]==='load').length,1);
 const queries=f.upstream.filter(x=>new URL(x.url).pathname==='/playQueues/77');assert.equal(new URL(queries.at(-1).url).searchParams.get('center'),'1');
 assert.equal((await f.request('/player/playback/skipNext?commandID=2')).status,200);assert.equal((await f.coordinator.snapshot(f.principal)).song.id,'2');
});

test('rolling radio windows retain current occurrence and identify their final section',async t=>{
 const f=await fixture(t);f.setQueue([track(2),track(3),track(4)]);f.setSelected(3);f.setWindow(4,2);
 const q=await f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'/playQueues/77'}),{currentItemId:'plex-77-3'});
 assert.equal(q.index,1);assert.equal(q.source.windowed,true);assert.equal(q.source.hasMoreBefore,true);assert.equal(q.source.hasMoreAfter,false);
 await assert.rejects(f.source.queueFor(config.receivers[0],new URLSearchParams({containerKey:'/playQueues/77'}),{currentItemId:'plex-77-999'}),e=>e.status===409);
});

test('second authorized controller attaches without replacing the active queue or moving playback',async t=>{
 const f=await fixture(t);await f.play();await f.request('/player/playback/skipNext?commandID=2');f.advance({position:35});await f.coordinator.tick();const before=[...f.calls];
 const controller={'X-Plex-Client-Identifier':'android-tablet'};
 assert.equal((await f.request('/resources',{headers:controller})).status,200);
 const poll=await f.request('/player/timeline/poll?wait=1&commandID=1',{headers:{'X-Plex-Client-Identifier':'android-tablet-wait','X-Plex-Token':''}});const xml=await poll.text();
 assert.match(xml,/playQueueItemID="2"/);assert.match(xml,/time="35000"/);assert.match(xml,/playQueueID="77"/);assert.deepEqual(f.calls,before);
 assert.equal((await f.request('/player/playback/pause?commandID=2',{headers:{...controller,'X-Plex-Token':''}})).status,200);
 assert.match(await (await f.request('/player/timeline/poll?commandID=3')).text(),/state="paused"/);
});

test('tokenless Android joins an active queue only after explicit owner pairing',async t=>{
 const f=await fixture(t);await f.play();await f.request('/player/playback/skipNext?commandID=2');const before=[...f.calls];
 const headers={'X-Plex-Client-Identifier':'android-new','X-Plex-Token':''};
 assert.match(await (await f.request('/player/timeline/poll?commandID=1',{headers})).text(),/state="stopped"/);
 f.source.beginControllerLink=async()=>({id:1,code:'TEST'});f.source.finishControllerLink=async()=>config.receivers[0].accountId;
 const page=await (await fetch(f.base+'/pair')).text();const action=page.match(/action="([^"]+)"/)[1];
 const reply=await fetch(f.base+action,{method:'POST',headers:{Origin:config.advertisedUrl},redirect:'manual'});
 assert.match(await (await fetch(f.base+reply.headers.get('location'))).text(),/Connected/);
 const xml=await (await f.request('/player/timeline/poll?commandID=3',{headers})).text();assert.match(xml,/playQueueItemID="2"/);assert.match(xml,/state="playing"/);assert.deepEqual(f.calls,before);
});


test('phone and tablet simultaneously see the same queue and controls without displacing each other',async t=>{
 const f=await fixture(t);await f.play();await f.request('/resources',{headers:{'X-Plex-Client-Identifier':'android-shared'}});
 const phone={'X-Plex-Token':'','X-Plex-Client-Identifier':'phone-test'},tablet={'X-Plex-Token':'','X-Plex-Client-Identifier':'android-shared'};
 await f.request('/player/playback/skipNext?commandID=9',{headers:tablet});
 for(const headers of [phone,tablet])assert.match(await (await f.request('/player/timeline/poll?commandID=10',{headers})).text(),/playQueueItemID="2"/);
 await f.request('/player/playback/pause?commandID=11',{headers:phone});
 for(const headers of [phone,tablet])assert.match(await (await f.request('/player/timeline/poll?commandID=12',{headers})).text(),/state="paused"/);
 await f.request('/player/playback/play?commandID=13',{headers:tablet});
 for(const headers of [phone,tablet])assert.match(await (await f.request('/player/timeline/poll?commandID=14',{headers})).text(),/state="playing"/);
 assert.equal(f.calls.filter(c=>c[0]==='load').length,2,'only initial play and the requested skip load audio');
});
