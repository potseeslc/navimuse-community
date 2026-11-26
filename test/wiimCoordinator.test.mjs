import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openRemoteCoordinator} from '../server/wiim/coordinator.mjs';

async function fixture(t,extraOptions={}){
 const directory=await mkdtemp(join(tmpdir(),'navimuse-wiim-'));
 let now=1000,allowed=true,offline=false;
 const calls=[];
 let observation={uri:'',state:'STOPPED',position:0,duration:100,at:now};
 const device={configuration:{id:'bedroom'},topology:async()=>({id:'bedroom',uuid:'uuid:AA-BB',members:[{id:'CCDD'}]}),
  observe:async()=>{if(offline)throw Error('offline');return {...observation,at:now};},
  load:async({uri,paused})=>{calls.push('load');observation={...observation,uri,state:paused?'STOPPED':'PLAYING',position:0};},
  pause:async()=>{calls.push('pause');observation.state='PAUSED_PLAYBACK';},
  play:async()=>{calls.push('play');observation.state='PLAYING';},
  stop:async()=>{calls.push('stop');observation.state='STOPPED';},
  seek:async(position)=>{calls.push('seek');observation.position=position;},volume:async()=>calls.push('volume')};
 const options={enabled:true,directory,baseUrl:'http://192.168.1.242:8099',devices:[device],authorize:async()=>allowed,songFor:async(_,id)=>({id,title:id,artist:'Artist',duration:100}),now:()=>now,pollInterval:3600000,...extraOptions};
 let coordinator=await openRemoteCoordinator(options);
 const principal={id:'account-a',scope:'binding-a'};
 t.after(async()=>{await coordinator.close();await rm(directory,{recursive:true,force:true});});
 return {principal,calls,device,directory,get c(){return coordinator;},
  start:(extra={})=>coordinator.create(principal,{transferId:crypto.randomUUID(),deviceId:'bedroom',queue:{index:0,items:[{queueItemId:'first',song:{id:'song-a'}},{queueItemId:'second',song:{id:'song-b'}}]},...extra}),
  command:(s,action,extra={})=>coordinator.command(principal,s.id,{revision:s.revision,commandId:crypto.randomUUID(),action,...extra}),
  observe:update=>{now+=2000;observation={...observation,...update};},deny:()=>{allowed=false;},offline:()=>{offline=true;},
  restart:async()=>{await coordinator.close();coordinator=await openRemoteCoordinator(options);},
  get uri(){return observation.uri;}};
}
test('duplicate commands have one effect; stale revisions and invalid commands do not mutate',async t=>{
 const f=await fixture(t);let s=await f.start();const cmd={revision:s.revision,commandId:'pause-command',action:'pause'};
 s=await f.c.command(f.principal,s.id,cmd);assert.equal(s.status,'paused');
 await f.c.command(f.principal,s.id,cmd);assert.equal(f.calls.filter(c=>c==='pause').length,1);
 await assert.rejects(f.c.command(f.principal,s.id,{...cmd,commandId:'stale-command'}),e=>e.status===409);
 await assert.rejects(f.command(s,'seek',{position:-1}),e=>e.status===400);
 assert.equal((await f.c.snapshot(f.principal)).revision,s.revision);
});
test('concurrent controllers cannot both apply a revision',async t=>{
 const f=await fixture(t);const s=await f.start();const outcomes=await Promise.allSettled([f.command(s,'pause'),f.command(s,'next')]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal(f.calls.filter(c=>c==='load').length,1);
});
test('queue runs without a client and old media grants expire on advancement',async t=>{
 const f=await fixture(t);await f.start();const token=new URL(f.uri).pathname.split('/')[3];
 assert.equal((await f.c.grant(token,'audio')).songId,'song-a');
 await assert.rejects(f.c.grant(token,'art'));
 f.observe({position:99});await f.c.tick();f.observe({position:100,state:'STOPPED'});await f.c.tick();
 assert.equal((await f.c.snapshot(f.principal)).queue.index,1);assert.equal(f.calls.filter(c=>c==='load').length,2);
 await assert.rejects(f.c.grant(token,'audio'));
});
test('restart observes ownership without replaying and treats unknown completion conservatively',async t=>{
 const f=await fixture(t);await f.start();await f.restart();await f.c.tick();
 assert.equal((await f.c.snapshot(f.principal)).status,'playing');assert.equal(f.calls.filter(c=>c==='load').length,1);
 await f.restart();f.observe({state:'STOPPED',position:100});await f.c.tick();
 assert.equal((await f.c.snapshot(f.principal)).status,'external');assert.equal(f.calls.filter(c=>c==='load').length,1);
});
test('source takeover revokes grants and release leaves the external source alone',async t=>{
 const f=await fixture(t);await f.start();const token=new URL(f.uri).pathname.split('/')[3];f.observe({uri:'external'});await f.c.tick();
 let s=await f.c.snapshot(f.principal);assert.equal(s.status,'external');await assert.rejects(f.c.grant(token,'audio'));
 await f.command(s,'release');assert.equal(f.calls.includes('stop'),false);
});
test('logout stops owned playback and revokes grants; account binding changes cannot read it',async t=>{
 const f=await fixture(t);await f.start();const token=new URL(f.uri).pathname.split('/')[3];
 assert.equal(await f.c.snapshot({...f.principal,scope:'new-binding'}),null);
 await f.c.logout(f.principal);assert.equal(f.calls.at(-1),'stop');await assert.rejects(f.c.grant(token,'audio'));
});
test('revocation blocks subsequent media and stops at the next background check',async t=>{
 const f=await fixture(t);await f.start();const token=new URL(f.uri).pathname.split('/')[3];f.deny();
 await assert.rejects(f.c.grant(token,'audio'));await f.c.tick();assert.equal(f.calls.at(-1),'stop');
});
test('failed stop retains ownership and prevents a second session',async t=>{
 const f=await fixture(t);const s=await f.start();f.offline();
 assert.equal((await f.command(s,'release')).status,'unreachable');await assert.rejects(f.start(),e=>e.status===409);
 const saved=JSON.parse(await readFile(join(f.directory,'sessions-v1.json'),'utf8'));assert.equal(saved.sessions[0].grants.length,0);
});
test('pause after current loads the next occurrence silently and remains paused across polls',async t=>{
 const f=await fixture(t);await f.start({controls:{pauseAfterCurrent:true}});
 f.observe({position:99});await f.c.tick();f.observe({position:100,state:'STOPPED'});await f.c.tick();await f.c.tick();
 const s=await f.c.snapshot(f.principal);assert.equal(s.queue.index,1);assert.equal(s.status,'paused');assert.equal(s.controls.pauseAfterCurrent,false);
 assert.equal((await f.command(s,'play')).status,'playing');
});
test('manual next at end confirms stop before declaring the session ended',async t=>{
 const f=await fixture(t);let s=await f.start();s=await f.command(s,'next');s=await f.command(s,'next');
 assert.equal(s.status,'ended');assert.equal(f.calls.at(-1),'stop');
});

test('retrying the same transfer never reloads the device',async t=>{
 const f=await fixture(t);const first=await f.start({transferId:'transfer-one'});const second=await f.start({transferId:'transfer-one'});
 assert.equal(second.id,first.id);assert.equal(f.calls.filter(c=>c==='load').length,1);
});
test('an uncertain side effect is never repeated on a command retry',async t=>{
 const f=await fixture(t);let s=await f.start();f.device.pause=async()=>{f.calls.push('pause');throw Error('response lost');};
 const cmd={action:'pause',revision:s.revision,commandId:'uncertain-pause'};
 await assert.rejects(f.c.command(f.principal,s.id,cmd),e=>e.status===502);
 await f.restart();await f.c.tick();await assert.rejects(f.c.command(f.principal,s.id,cmd),e=>e.status===409);
 assert.equal(f.calls.filter(c=>c==='pause').length,1);
});
test('first-track Previous restarts and selection/replacement preserve hydrated metadata',async t=>{
 const f=await fixture(t);let s=await f.start();f.observe({position:20});s=await f.command(s,'previous');assert.equal(s.position,0);assert.equal(s.queue.index,0);assert.equal(f.calls.filter(c=>c==='load').length,1);
 s=await f.command(s,'select',{index:1});assert.equal(s.song.id,'song-b');
 s=await f.command(s,'replace',{queue:{index:0,items:[{queueItemId:'new-one',song:{id:'replacement'}}]}});assert.equal(s.song.id,'replacement');assert.equal(s.queue.items[0].song.artist,'Artist');
});

test('explicit disconnect recovers an offline speaker without claiming a stop or restarting after reboot',async t=>{
 const f=await fixture(t);let s=await f.start();const token=new URL(f.uri).pathname.split('/')[3];
 await assert.rejects(f.command(s,'disconnect',{acknowledgeUnconfirmedStop:true}),e=>e.status===409);
 f.offline();s=await f.command(s,'release');
 await assert.rejects(f.command(s,'disconnect'),e=>e.status===409);
 await assert.rejects(f.c.command({...f.principal,scope:'another-binding'},s.id,{action:'disconnect',revision:s.revision,commandId:'wrong-binding',acknowledgeUnconfirmedStop:true}),e=>e.status===404);
 const command={action:'disconnect',revision:s.revision,commandId:'confirmed-disconnect',acknowledgeUnconfirmedStop:true};
 s=await f.c.command(f.principal,s.id,command);assert.equal(s.status,'released');assert.match(s.notice,/without confirming/);
 assert.equal((await f.c.command(f.principal,s.id,command)).revision,s.revision);
 await assert.rejects(f.c.grant(token,'audio'));await f.restart();await f.c.tick();
 assert.equal((await f.c.snapshot(f.principal)).status,'released');assert.deepEqual(f.calls,['load']);
});

test('slow unreachable polling is coalesced so recovery commands do not queue behind stale ticks',async t=>{
 const f=await fixture(t);const s=await f.start();let polls=0,unblock,entered;
 const started=new Promise(r=>entered=r);const gate=new Promise(r=>unblock=r);
 f.device.observe=async()=>{polls++;entered();await gate;throw Error('unreachable');};
 const first=f.c.tick();await started;
 const repeats=Array.from({length:12},()=>f.c.tick());
 const snapshot=f.c.snapshot(f.principal);unblock();
 await Promise.all([first,...repeats,snapshot]);
 assert.equal(polls,1,'only one pending poll may occupy the command queue');
 const current=await f.c.snapshot(f.principal);const released=await f.command(current,'release');assert.equal(released.status,'unreachable');
 const disconnected=await f.command(released,'disconnect',{acknowledgeUnconfirmedStop:true});assert.equal(disconnected.status,'released');
});

 test('receiver telemetry never blocks commands and stale occurrences cannot publish quality',async t=>{
 const f=await fixture(t);let finish;f.device.delivery=()=>new Promise(resolve=>{finish=resolve;});
 let s=await f.start();const oldToken=new URL(f.uri).pathname.split('/')[3];
 f.c.receivedMedia(oldToken,'audio/flac');assert.equal((await f.c.snapshot(f.principal)).delivery.codec,'FLAC');
 s=await f.command(s,'next');assert.deepEqual(s.delivery,{});
 f.c.receivedMedia(oldToken,'audio/mpeg');
 finish({sampleRate:96000,bitDepth:24});await new Promise(setImmediate);
 assert.deepEqual((await f.c.snapshot(f.principal)).delivery,{});
 f.device.delivery=async()=>({sampleRate:44100,bitDepth:16});f.observe({position:2});await f.c.tick();await new Promise(setImmediate);
 const currentToken=new URL(f.uri).pathname.split('/')[3];f.c.receivedMedia(currentToken,'audio/flac');
 s=await f.c.snapshot(f.principal);assert.deepEqual(s.delivery,{codec:'FLAC',sampleRate:44100,bitDepth:16});
 assert.doesNotMatch(JSON.stringify(s.delivery),/media|token|http/);
 s=await f.command(s,'release');assert.equal(s.delivery,null);
 });
 test('optional receiver metadata failure leaves playback and release working',async t=>{
 const f=await fixture(t);f.device.delivery=async()=>{throw Error('not supported');};
 let s=await f.start();await new Promise(setImmediate);assert.equal((await f.c.snapshot(f.principal)).status,'playing');
 s=await f.command(s,'release');assert.equal(s.status,'released');
 });

test('receiver volume initializes without a write and refreshes external changes',async t=>{
 const f=await fixture(t);let level=37,reads=0;f.device.readVolume=async()=>{reads++;return level;};
 await f.start();await new Promise(setImmediate);
 assert.equal((await f.c.snapshot(f.principal)).volume,37);assert.equal(f.calls.includes('volume'),false);
 level=0;for(let i=0;i<3;i++)f.observe({position:1});await f.c.tick();await new Promise(setImmediate);
 assert.equal((await f.c.snapshot(f.principal)).volume,0);assert.equal(reads,2);
 level=101;for(let i=0;i<3;i++)f.observe({position:2});await f.c.tick();await new Promise(setImmediate);
 assert.equal((await f.c.snapshot(f.principal)).volume,null);
 f.device.readVolume=async()=>{throw Error('offline');};for(let i=0;i<3;i++)f.observe({position:3});await f.c.tick();await new Promise(setImmediate);
 assert.equal((await f.c.snapshot(f.principal)).status,'playing');
});
test('slow volume reads do not block commands or overwrite a newer volume command',async t=>{
 const f=await fixture(t);let finish;f.device.readVolume=()=>new Promise(resolve=>finish=resolve);
 let s=await f.start();assert.equal(s.volume,null);
 s=await f.command(s,'volume',{volume:64});assert.equal(s.volume,64);
 finish(12);await new Promise(setImmediate);assert.equal((await f.c.snapshot(f.principal)).volume,64);
 for(let i=0;i<9;i++)f.observe({position:1});assert.equal((await f.c.snapshot(f.principal)).volume,null,'stale levels expire');
 await f.c.tick();s=await f.c.snapshot(f.principal);s=await f.command(s,'release');finish(91);await new Promise(setImmediate);
 assert.equal((await f.c.snapshot(f.principal)).volume,null);assert.equal(s.status,'released');
});

const journeySeed={seedType:'song',seedId:'song-a',seedSongId:'song-a',seedLabel:'A Journey',sessionKind:'journey'};
const journeyInput=(autoExtend=true)=>({source:{kind:'radio'},journey:{version:1,sessionId:'journey-session',seed:journeySeed,autoExtend},index:0,items:['song-a','song-b'].map((id,index)=>({queueItemId:'j-'+index,song:{id},provenance:'generated',radioSessionId:'journey-session',radioSeed:journeySeed}))});
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,5));};
test('Journey refills without a client, survives restart, excludes old songs and retains metadata on release',async t=>{
 const requests=[];const f=await fixture(t,{similarFor:async(principal,seed,options)=>{requests.push({principal,seed,exclude:options.excludeIds});return [{id:'song-c',title:'Third',duration:100},{id:'song-c'},{id:'song-a'}];}});
 let s=await f.start({queue:journeyInput()});await settle();s=await f.c.snapshot(f.principal);assert.deepEqual(s.queue.items.map(x=>x.song.id),['song-a','song-b','song-c']);assert.equal(s.queue.items[2].radioSeed.seedSongId,'song-a');assert.equal(f.calls.filter(x=>x==='load').length,1,'refill does not change transport');assert.ok(requests[0].exclude.includes('song-a'));
 await f.restart();await f.c.tick();s=await f.c.snapshot(f.principal);assert.equal(s.queue.journey.sessionId,'journey-session');s=await f.command(s,'next');assert.equal(s.song.id,'song-b');
 s=await f.command(s,'release');assert.equal(s.status,'released');assert.equal(s.queue.items.length,3);assert.equal(s.queue.source.kind,'radio');
});
test('slow Journey analysis cannot block pause, and a late result cannot append after release',async t=>{
 let resolve;const f=await fixture(t,{similarFor:()=>new Promise(r=>resolve=r)});let s=await f.start({queue:journeyInput()});await settle();
 s=await f.command(s,'pause');assert.equal(s.status,'paused');s=await f.command(s,'release');resolve([{id:'late'}]);await settle();s=await f.c.snapshot(f.principal);assert.equal(s.status,'released');assert.equal(s.queue.items.length,2);
});
test('failed discovery preserves playback and is retried only after cooldown; finite mode never calls it',async t=>{
 let count=0;const f=await fixture(t,{similarFor:async()=>{count++;throw Error('unavailable');}});let s=await f.start({queue:journeyInput()});await settle();s=await f.c.snapshot(f.principal);assert.equal(s.status,'playing');assert.match(s.journeyNotice,/Queued tracks will keep playing/);await f.c.tick();await settle();assert.equal(count,1);
 await f.command(s,'release');await f.start({queue:journeyInput(false)});await settle();assert.equal(count,1);
});
test('analysis completed after authorization revocation cannot add tracks or mint grants',async t=>{
 let resolve;const f=await fixture(t,{similarFor:()=>new Promise(r=>resolve=r)});await f.start({queue:journeyInput()});await settle();f.deny();resolve([{id:'late'}]);await settle();await f.c.tick();assert.equal(f.calls.filter(x=>x==='load').length,1);const saved=JSON.parse(await readFile(join(f.directory,'sessions-v1.json'),'utf8'));assert.equal(saved.sessions[0].queue.items.length,2);assert.equal(saved.sessions[0].grants.length,0);
});

test('a replacement library queue invalidates late Journey analysis',async t=>{
 let resolve;const f=await fixture(t,{similarFor:()=>new Promise(r=>resolve=r)});let s=await f.start({queue:journeyInput()});await settle();s=await f.command(s,'replace',{queue:{index:0,items:[{queueItemId:'replacement',song:{id:'replacement'}}]}});resolve([{id:'late'}]);await settle();s=await f.c.snapshot(f.principal);assert.equal(s.queue.journey,undefined);assert.equal(s.queue.items.length,1);assert.equal(s.song.id,'replacement');
});
test('near-tail refill commits after advancing within the same Journey and retains duplicate occurrence identity',async t=>{
 let resolve;const f=await fixture(t,{similarFor:()=>new Promise(r=>resolve=r)});let s=await f.start({queue:journeyInput()});await settle();s=await f.command(s,'next');resolve([{id:'song-c',duration:100}]);await settle();s=await f.c.snapshot(f.principal);assert.equal(s.queue.index,1);assert.equal(s.song.id,'song-b');assert.equal(s.queue.items.length,3);assert.equal(new Set(s.queue.items.map(x=>x.queueItemId)).size,3);
});

test('shuffle refill retains unplayed earlier occurrences when the current index is high',async t=>{
 let requests=0;const f=await fixture(t,{similarFor:async()=>{requests++;return[{id:'addition',duration:100}];}});
 const q=journeyInput();q.index=59;q.items=Array.from({length:60},(_,i)=>({queueItemId:'track-'+i,song:{id:'song-'+i},radioSeed:journeySeed,radioSessionId:'journey-session',provenance:'generated'}));
 let s=await f.start({queue:q,controls:{shuffle:true}});await settle();assert.equal(requests,0,'all unplayed shuffle candidates count as runway');
 // Switching shuffle off exercises high-index refill without erasing unseen earlier tracks.
 s=await f.command(s,'controls',{controls:{shuffle:false}});await f.c.tick();await settle();s=await f.c.snapshot(f.principal);assert.equal(requests,1);assert.equal(s.queue.items.length,61);assert.equal(s.queue.items[0].queueItemId,'track-0');assert.equal(s.queue.index,59);
});

test('new Journey replaces a playing speaker queue without release or a second session',async t=>{
 const f=await fixture(t);const old=await f.start();
 const next=await f.command(old,'replace',{queue:journeyInput()});
 assert.equal(next.id,old.id);assert.equal(next.device.id,old.device.id);assert.equal(next.status,'playing');assert.ok(next.queue.journey);assert.equal(f.calls.filter(c=>c==='load').length,2);assert.equal(f.calls.filter(c=>c==='stop').length,0);
});

test('opt-in ordinary autoplay refills and advances on the speaker without a client',async t=>{
 let calls=0;const f=await fixture(t,{similarFor:async()=>{calls++;return [{id:'suggested',duration:100}];}});
 await f.start({controls:{autoplayAfterQueue:true}});await settle();let s=await f.c.snapshot(f.principal);
 assert.equal(calls,1);assert.equal(s.queue.journey,undefined);assert.equal(s.queue.items.at(-1).autoplay,true);assert.equal(s.queue.items.at(-1).song.id,'suggested');
 s=await f.command(s,'next');f.observe({position:99,state:'PLAYING'});await f.c.tick();f.observe({position:100,state:'STOPPED'});await f.c.tick();s=await f.c.snapshot(f.principal);assert.equal(s.song.id,'suggested');assert.equal(s.status,'playing');
});
test('ordinary autoplay off removes pending suggestions and cancels analysis without stopping current music',async t=>{
 const f=await fixture(t,{similarFor:async()=>[{id:'suggested'}]});await f.start({controls:{autoplayAfterQueue:true}});await settle();let s=await f.c.snapshot(f.principal);assert.equal(s.queue.items.length,3);
 s=await f.command(s,'controls',{controls:{autoplayAfterQueue:false}});assert.equal(s.queue.items.length,2);assert.equal(s.song.id,'song-a');assert.equal(s.status,'playing');
});
test('ordinary autoplay has no work by default and respects repeat and continue-through-queue',async t=>{
 let calls=0;const f=await fixture(t,{similarFor:async()=>{calls++;return [{id:'suggested'}];}});let s=await f.start();await settle();assert.equal(calls,0);
 s=await f.command(s,'controls',{controls:{autoplayAfterQueue:true,repeat:true}});await settle();assert.equal(calls,0);
 s=await f.command(s,'controls',{controls:{repeat:false,continueThroughQueue:false}});f.observe({position:99,state:'PLAYING'});await f.c.tick();f.observe({position:100,state:'STOPPED'});await f.c.tick();s=await f.c.snapshot(f.principal);assert.equal(s.status,'ended');assert.equal(calls,0);
});
test('disabling autoplay rejects analysis that completes afterward',async t=>{
 let resolve;const f=await fixture(t,{similarFor:()=>new Promise(r=>resolve=r)});let s=await f.start({controls:{autoplayAfterQueue:true}});await settle();s=await f.command(s,'controls',{controls:{autoplayAfterQueue:false}});resolve([{id:'late'}]);await settle();s=await f.c.snapshot(f.principal);assert.equal(s.queue.items.length,2);
});

test('a transient observation failure after next does not reload or stop an accepted track',async t=>{
 const f=await fixture(t);const s=await f.start();const observe=f.device.observe,load=f.device.load;let unreadable=false;
 f.device.load=async input=>{await load(input);unreadable=true;};
 f.device.observe=async()=>{if(unreadable){unreadable=false;throw Error('temporary SOAP failure');}return observe();};
 const next=await f.command(s,'next');assert.equal(next.status,'playing');assert.equal(next.song.id,'song-b');
 assert.equal(f.calls.filter(v=>v==='load').length,2);assert.equal(f.calls.includes('stop'),false);
});

test('adding and removing group members preserves the current stream and queue',async t=>{
 const f=await fixture(t);const before=await f.start();const token=new URL(f.uri).pathname.split('/')[3];
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AA-BB',members:[{id:'CCDD'},{id:'EEFF'}]});
 await f.c.tick();let s=await f.c.snapshot(f.principal);
 assert.equal(s.status,'playing');assert.equal(s.device.members.length,2);
 assert.deepEqual(s.queue,before.queue);assert.equal(s.generation,before.generation);
 assert.equal((await f.c.grant(token,'audio')).songId,'song-a');assert.deepEqual(f.calls,['load']);
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AA-BB',members:[]});
 s=await f.command(s,'pause');assert.equal(s.status,'paused');assert.equal(s.device.members.length,0);
 assert.deepEqual(f.calls,['load','pause']);
});

test('group settling does not look like completion or revoke the active stream',async t=>{
 const f=await fixture(t);await f.start();const uri=f.uri,token=new URL(uri).pathname.split('/')[3];
 f.observe({position:99});await f.c.tick();
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AA-BB',members:[{id:'EEFF'}]});
 f.observe({state:'STOPPED',position:100,uri:''});await f.c.tick();
 let s=await f.c.snapshot(f.principal);assert.equal(s.status,'reconnecting');assert.equal(s.queue.index,0);
 assert.equal((await f.c.grant(token,'audio')).songId,'song-a');
 await assert.rejects(f.command(s,'next'),e=>e.status===409);
 f.observe({state:'PLAYING',position:99,uri});await f.c.tick();
 s=await f.c.snapshot(f.principal);assert.equal(s.status,'playing');assert.equal(s.notice,'');
 assert.equal(s.queue.index,0);assert.deepEqual(f.calls,['load']);
});

test('unverified group times out without stopping or loading an external source',async t=>{
 const f=await fixture(t);await f.start();const token=new URL(f.uri).pathname.split('/')[3];
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AA-BB',members:[],follower:true});
 f.observe({uri:'external',state:'PLAYING'});await f.c.tick();
 for(let i=0;i<10;i++){f.observe({});await f.c.tick();}
 const s=await f.c.snapshot(f.principal);assert.equal(s.status,'external');assert.equal(s.queue.index,0);
 await assert.rejects(f.c.grant(token,'audio'));assert.deepEqual(f.calls,['load']);
});

test('verified approved leader takes over observation and subsequent controls without reload',async t=>{
 const discovered=[];const f=await fixture(t,{discoverDevices:async()=>discovered});
 const before=await f.start();const uri=f.uri,token=new URL(uri).pathname.split('/')[3];
 const leaderCalls=[];
 const leader={configuration:{id:'living'},topology:async()=>({id:'living',uuid:'uuid:EE-FF',members:[{id:'AABB'}]}),
  observe:async()=>({uri,state:'PLAYING',position:12,duration:100}),pause:async()=>leaderCalls.push('pause')};
 discovered.push(leader);
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AA-BB',members:[],follower:true});
 await f.c.tick();let s=await f.c.snapshot(f.principal);
 assert.equal(s.device.id,'living');assert.equal(s.status,'playing');assert.equal(s.position,12);
 assert.deepEqual(s.queue,before.queue);assert.equal(s.generation,before.generation);
 assert.equal((await f.c.grant(token,'audio')).songId,'song-a');
 await f.command(s,'pause');assert.deepEqual(leaderCalls,['pause']);assert.deepEqual(f.calls,['load']);
});

test('a group cannot adopt members reserved by another account session',async t=>{
 const discovered=[];const f=await fixture(t,{discoverDevices:async()=>discovered});
 await f.start();let otherUri='';const otherCalls=[];
 discovered.push({configuration:{id:'other'},topology:async()=>({id:'other',uuid:'uuid:EEFF',members:[]}),
  load:async({uri})=>{otherUri=uri;otherCalls.push('load');},observe:async()=>({uri:otherUri,state:'PLAYING',position:0,duration:100})});
 const other={id:'account-b',scope:'binding-b'};
 await f.c.create(other,{transferId:crypto.randomUUID(),deviceId:'other',queue:{index:0,items:[{queueItemId:'one',song:{id:'song-b'}}]}});
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AABB',members:[{id:'EEFF'}]});
 await f.c.tick();assert.equal((await f.c.snapshot(f.principal)).status,'external');
 assert.equal((await f.c.snapshot(other)).status,'playing');assert.deepEqual(f.calls,['load']);assert.deepEqual(otherCalls,['load']);
});

test('a regrouped follower can lose its transport endpoint while the approved leader keeps playing',async t=>{
 const discovered=[];const f=await fixture(t,{discoverDevices:async()=>discovered});await f.start();const uri=f.uri;
 discovered.push({configuration:{id:'living'},topology:async()=>({id:'living',uuid:'uuid:EEFF',members:[{id:'AABB'}]}),observe:async()=>({uri,state:'PLAYING',position:8,duration:100})});
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AABB',members:[],follower:true});f.offline();
 await f.c.tick();const s=await f.c.snapshot(f.principal);assert.equal(s.device.id,'living');assert.equal(s.status,'playing');assert.deepEqual(f.calls,['load']);
});

test('group reconciliation survives a coordinator restart without replaying the track',async t=>{
 const f=await fixture(t);await f.start();const uri=f.uri;
 f.device.topology=async()=>({id:'bedroom',uuid:'uuid:AABB',members:[{id:'EEFF'}]});
 f.observe({uri:'',state:'STOPPED'});await f.c.tick();await f.restart();
 f.observe({uri,state:'PLAYING',position:10});await f.c.tick();
 const s=await f.c.snapshot(f.principal);assert.equal(s.status,'playing');assert.equal(s.queue.index,0);assert.deepEqual(f.calls,['load']);
});

test('sleep timer survives restart, pauses once without a client, and preserves the queue',async t=>{
 let clock=1000;const f=await fixture(t,{now:()=>clock});let s=await f.start();
 s=await f.command(s,'sleepTimer',{minutes:15});assert.equal(s.sleepTimerDeadline,901000);
 await f.restart();clock=900999;await f.c.tick();assert.equal(f.calls.includes('pause'),false);
 clock=901000;await f.c.tick();s=await f.c.snapshot(f.principal);
 assert.equal(s.status,'paused');assert.equal(s.sleepTimerDeadline,0);assert.equal(s.queue.index,0);
 await f.c.tick();assert.equal(f.calls.filter(c=>c==='pause').length,1);
 s=await f.command(s,'play');assert.equal(s.status,'playing');
});
test('sleep timer replacement and cancellation validate input and preserve normal playback',async t=>{
 let clock=1000;const f=await fixture(t,{now:()=>clock});let s=await f.start();
 await assert.rejects(f.command(s,'sleepTimer',{minutes:-1}),e=>e.status===400);
 await assert.rejects(f.command(s,'sleepTimer',{minutes:'15'}),e=>e.status===400);
 s=await f.command(s,'sleepTimer',{minutes:15});clock=2000;
 s=await f.command(s,'sleepTimer',{minutes:30});assert.equal(s.sleepTimerDeadline,1802000);
 s=await f.command(s,'sleepTimer',{minutes:0});clock=2000000;await f.c.tick();
 assert.equal(s.sleepTimerDeadline,0);assert.equal(f.calls.includes('pause'),false);
});
test('expired sleep timer does not pause an external source or advance at a natural boundary',async t=>{
 let clock=1000;const f=await fixture(t,{now:()=>clock});let s=await f.start();
 s=await f.command(s,'sleepTimer',{minutes:15});f.observe({position:99});await f.c.tick();
 clock=901000;f.observe({state:'STOPPED',position:100});await f.c.tick();
 assert.equal((await f.c.snapshot(f.principal)).queue.index,0);
 s=await f.c.snapshot(f.principal);s=await f.command(s,'sleepTimer',{minutes:15});
 clock=1801000;f.observe({uri:'external',state:'PLAYING'});await f.c.tick();
 assert.equal(f.calls.filter(c=>c==='pause').length,1);
});
test('failed timer pause retains its deadline and retries only after verifying ownership',async t=>{
 let clock=1000;const f=await fixture(t,{now:()=>clock});let s=await f.start();
 s=await f.command(s,'sleepTimer',{minutes:15});const pause=f.device.pause;
 f.device.pause=async()=>{throw Error('offline');};clock=901000;await f.c.tick();
 s=await f.c.snapshot(f.principal);assert.equal(s.status,'reconnecting');assert.equal(s.sleepTimerDeadline,901000);
 f.device.pause=pause;await f.c.tick();assert.equal((await f.c.snapshot(f.principal)).status,'paused');
});

test('live radio transfers with scoped grants, no seeks or scrobbles, and returns to a library queue',async t=>{
 let reports=0;const f=await fixture(t,{songFor:async(_p,id)=>({id,title:id,duration:id.startsWith('radio:')?0:100,...(id.startsWith('radio:')?{isRadio:true,suffix:'radio'}:{})}),report:async()=>reports++});
 let s=await f.start({queue:{index:0,items:[{queueItemId:'station',song:{id:'radio:station-1',streamUrl:'https://untrusted.example'}}]},position:400});
 assert.equal(s.status,'playing');assert.equal(s.song.isRadio,true);assert.equal(s.duration,0);assert.equal(s.position,0);assert.equal(reports,0);assert.equal(f.calls.includes('seek'),false);
 const token=new URL(f.uri).pathname.split('/')[3];
 assert.equal((await f.c.grant(token,'audio')).isRadio,true);
 for(const action of ['seek','next','previous','queue'])await assert.rejects(f.command(s,action,{position:0}),/Live radio/);
 assert.equal((await f.c.snapshot(f.principal)).status,'playing');
 f.observe({position:800});await f.c.tick();assert.equal(reports,0);
 s=await f.c.snapshot(f.principal);s=await f.command(s,'sleepTimer',{minutes:15});assert.ok(s.sleepTimerDeadline);
 s=await f.command(s,'replace',{queue:{index:0,items:[{queueItemId:'library',song:{id:'song-a'}}]}});
 assert.equal(s.song.id,'song-a');assert.equal(s.queue.internetRadio,undefined);assert.equal(reports,1);
 await assert.rejects(f.c.grant(token,'audio'),/expired/);
});

test('radio authorization and restart retain the same speaker ownership rules',async t=>{
 const f=await fixture(t,{songFor:async(_p,id)=>({id,title:id,duration:0,isRadio:true})});
 await f.start({queue:{index:0,items:[{queueItemId:'station',song:{id:'radio:station-1'}}]}});
 const token=new URL(f.uri).pathname.split('/')[3];await f.restart();
 const s=await f.c.snapshot(f.principal);assert.equal(s.queue.internetRadio.stationId,'station-1');
 assert.equal((await f.c.grant(token,'audio')).isRadio,true);
 f.deny();await assert.rejects(f.c.grant(token,'audio'),/authorization/);await f.c.tick();
 assert.ok(f.calls.includes('stop'));
});

test('changing radio stations preserves speaker group, session, volume and sleep deadline',async t=>{
 const f=await fixture(t,{songFor:async(_p,id)=>({id,title:id,duration:0,isRadio:true,coverArt:'ra-'+id.slice(6)})});
 const queue=id=>({index:0,items:[{queueItemId:'occurrence-'+id,song:{id:'radio:'+id}}]});
 let s=await f.start({queue:queue('one')});s=await f.command(s,'sleepTimer',{minutes:15});s=await f.command(s,'volume',{volume:35});
 const before=s;const oldGrant=new URL(f.uri).pathname.split('/')[3];
 s=await f.command(s,'replace',{queue:queue('two')});
 assert.equal(s.id,before.id);assert.deepEqual(s.device,before.device);assert.equal(s.sleepTimerDeadline,before.sleepTimerDeadline);assert.equal(s.volume,35);
 assert.equal(s.status,'playing');assert.equal(s.song.id,'radio:two');assert.equal(s.song.coverArt,'ra-two');assert.equal(f.calls.filter(x=>x==='load').length,2);
 assert.equal(f.calls.includes('stop'),false);await assert.rejects(f.c.grant(oldGrant,'audio'),e=>e.status===403);
});

test('a terminal position after a delayed poll advances once and preserves the speaker',async t=>{
 const f=await fixture(t);await f.start();
 f.observe({position:95});await f.c.tick();
 f.observe({position:97}); // Polling did not run for this intermediate device state.
 f.observe({position:100,state:'STOPPED'});await f.c.tick();await f.c.tick();
 const s=await f.c.snapshot(f.principal);
 assert.equal(s.queue.index,1);assert.equal(s.status,'playing');assert.equal(s.device.id,'bedroom');
 assert.equal(f.calls.filter(c=>c==='load').length,2);
});
test('a stop before the end does not claim an outside controller or advance',async t=>{
 const f=await fixture(t);await f.start();
 f.observe({position:50});await f.c.tick();f.observe({position:52,state:'STOPPED'});await f.c.tick();
 const s=await f.c.snapshot(f.principal);
 assert.equal(s.status,'external');assert.equal(s.queue.index,0);
 assert.match(s.notice,/could confirm the track finished/);assert.equal(f.calls.filter(c=>c==='load').length,1);
});

test('released speaker history uses current caller authorization without reviving expired grants',async t=>{
 let expired=false;
 const f=await fixture(t,{authorize:async principal=>!expired||principal.login==='fresh'});
 const original=await f.start();const token=new URL(f.uri).pathname.split('/')[3];await f.command(original,'release');expired=true;
 await assert.rejects(f.c.snapshot(f.principal),e=>e.status===403);
 const current={...f.principal,login:'fresh'};
 const snapshot=await f.c.snapshot(current);assert.equal(snapshot.status,'released');
 assert.equal(await f.c.snapshot({...current,scope:'different-binding'}),null);
 await assert.rejects(f.c.grant(token,'audio'));assert.equal(f.calls.filter(c=>c==='load').length,1);
});
test('fresh caller cannot reauthorize an active speaker session with expired ownership',async t=>{
 let expired=false;
 const f=await fixture(t,{authorize:async principal=>!expired||principal.login==='fresh'});
 await f.start();expired=true;
 await assert.rejects(f.c.snapshot({...f.principal,login:'fresh'}),e=>e.status===403);
});

test('qualified speaker reports retry with one durable event and never interrupt playback',async t=>{
 const events=[];let fail=true;
 const f=await fixture(t,{songFor:async(_p,id)=>({id,title:id,duration:200}),report:async(_p,id,submission,event,song)=>{if(!submission)return;events.push(event);assert.equal(song.id,id);if(fail)throw Error('History sync unavailable');}});
 await f.start();
 for(let i=1;i<=51;i++){f.observe({position:i*2});await f.c.tick();}
 assert.equal(events.length,1);assert.equal((await f.c.snapshot(f.principal)).status,'playing');
 fail=false;
 for(let i=52;i<=68;i++){f.observe({position:i*2});await f.c.tick();}
 assert.equal(events.length,2);assert.equal(events[0].id,events[1].id);assert.equal(events[0].time,events[1].time);
 await f.c.tick();assert.equal(events.length,2);
});

async function gaplessFixture(t,options={}){
 const f=await fixture(t,{gaplessEnabled:true,songFor:async(_,id)=>({id,title:id,albumId:'album-one',discNumber:1,track:id==='song-a'?1:2,duration:100,coverArt:'art-'+id}),...options});
 let prepared=null;
 f.device.prepareNext=async value=>{prepared=value;f.calls.push('prepareNext');};
 f.device.clearNext=async()=>{prepared=null;f.calls.push('clearNext');};
 return Object.assign(f,{prepared:()=>prepared,arm:async()=>{f.observe({position:2});await f.c.tick();return prepared;}});
}
test('album handoff adopts the renderer next URI exactly once without another load or Play',async t=>{
 const f=await gaplessFixture(t);await f.start();const oldToken=new URL(f.uri).pathname.split('/')[3];
 assert.equal(f.prepared(),null,'do not set NextURI immediately after Play');
 const next=await f.arm();assert.ok(next);const audio=new URL(next.uri).pathname.split('/')[3],art=new URL(next.art).pathname.split('/')[3];
 assert.equal((await f.c.grant(audio,'audio')).songId,'song-b');
 assert.equal((await f.c.grant(art,'art')).coverArt,'art-song-b');
 f.c.receivedMedia(audio,'audio/flac');assert.deepEqual((await f.c.snapshot(f.principal)).delivery,{},'preload telemetry must not describe current audio');
 f.observe({uri:next.uri,position:1});await f.c.tick();await f.c.tick();
 const s=await f.c.snapshot(f.principal);assert.equal(s.song.id,'song-b');assert.equal(s.queue.index,1);assert.equal(s.generation,2);assert.equal(s.status,'playing');assert.equal(s.delivery.codec,'FLAC');
 assert.equal(f.calls.filter(x=>x==='load').length,1);assert.equal(f.calls.includes('play'),false);
 assert.equal((await f.c.grant(audio,'audio')).songId,'song-b');await assert.rejects(f.c.grant(oldToken,'audio'));
});
test('renderer reservation survives process restart and never replays the incoming song',async t=>{
 const f=await gaplessFixture(t);await f.start();const next=await f.arm();await f.restart();
 f.observe({uri:next.uri,position:3});await f.c.tick();
 assert.equal((await f.c.snapshot(f.principal)).queue.index,1);assert.equal(f.calls.filter(x=>x==='load').length,1);
});
test('manual skip clears the next slot before loading and revokes prepared grants',async t=>{
 const f=await gaplessFixture(t);await f.start();const next=await f.arm();let s=await f.c.snapshot(f.principal);
 s=await f.command(s,'next');assert.equal(s.song.id,'song-b');assert.deepEqual(f.calls.filter(x=>['load','prepareNext','clearNext'].includes(x)),['load','prepareNext','clearNext','load']);
 await assert.rejects(f.c.grant(new URL(next.uri).pathname.split('/')[3],'audio'));
});
test('pause-after-current, shuffle, repeat, sleep timer and queue stop policy never arm',async t=>{
 for(const controls of [{pauseAfterCurrent:true},{shuffle:true},{repeat:true},{continueThroughQueue:false}]){
  const f=await gaplessFixture(t);await f.start({controls});assert.equal(await f.arm(),null);
 }
 const f=await gaplessFixture(t);let s=await f.start();await f.command(s,'sleepTimer',{minutes:15});assert.equal(await f.arm(),null);
});
test('sleep timer clears an already prepared slot and prevents rearming',async t=>{
 const f=await gaplessFixture(t);await f.start();await f.arm();let s=await f.c.snapshot(f.principal);await f.command(s,'sleepTimer',{minutes:15});
 assert.equal(f.prepared(),null);await f.arm();assert.equal(f.prepared(),null);assert.equal(f.calls.filter(x=>x==='prepareNext').length,1);
});
test('unsupported renderer degrades without interrupting the current song or hammering SOAP',async t=>{
 const f=await gaplessFixture(t);f.device.prepareNext=async()=>{f.calls.push('prepareNext');throw Error('unsupported');};await f.start();await f.arm();await f.arm();
 assert.equal((await f.c.snapshot(f.principal)).status,'playing');assert.equal(f.calls.filter(x=>x==='prepareNext').length,1);assert.equal(f.calls.includes('stop'),false);
});
test('lost set/clear acknowledgements retain ownership if the prepared track starts',async t=>{
 const f=await gaplessFixture(t);await f.start();const original=f.device.prepareNext;
 f.device.prepareNext=async value=>{await original(value);throw Error('response lost');};f.device.clearNext=async()=>{throw Error('offline');};
 const next=await f.arm();assert.ok(next);f.observe({uri:next.uri,position:1});await f.c.tick();
 assert.equal((await f.c.snapshot(f.principal)).song.id,'song-b');assert.equal(f.calls.filter(x=>x==='load').length,1);
});
test('boundary racing a queue edit adopts once and rejects the stale edit',async t=>{
 const f=await gaplessFixture(t);await f.start();const next=await f.arm();const s=await f.c.snapshot(f.principal);
 f.device.clearNext=async()=>{f.observe({uri:next.uri,position:0});};
 await assert.rejects(f.command(s,'queue',{mutation:{action:'clearUpcoming'}}),e=>e.status===409);
 const result=await f.c.snapshot(f.principal);assert.equal(result.song.id,'song-b');assert.equal(result.status,'playing');assert.equal(result.queue.items.length,2);assert.equal(f.calls.filter(x=>x==='load').length,1);
});
test('logout at an unobserved album boundary stops the owned next item',async t=>{
 const f=await gaplessFixture(t);await f.start();const next=await f.arm();f.observe({uri:next.uri,position:1});await f.c.logout(f.principal);
 assert.equal((await f.c.snapshot(f.principal)).status,'released');assert.equal(f.calls.at(-1),'stop');await assert.rejects(f.c.grant(new URL(next.uri).pathname.split('/')[3],'audio'));
});
test('preload metadata failure cannot make currently playing audio look disconnected',async t=>{
 let fail=false;const f=await gaplessFixture(t,{songFor:async(_,id)=>{if(fail&&id==='song-b')throw Error('library unavailable');return {id,albumId:'album',track:id==='song-a'?1:2,duration:100};}});
 await f.start();fail=true;await f.arm();assert.equal((await f.c.snapshot(f.principal)).status,'playing');assert.equal(f.prepared(),null);
});
test('disabled pilot and nonconsecutive album tracks never change the next transport slot',async t=>{
 const off=await gaplessFixture(t,{gaplessEnabled:false});await off.start();assert.equal(await off.arm(),null);
 const unordered=await gaplessFixture(t,{songFor:async(_,id)=>({id,albumId:'same',track:id==='song-a'?1:3,duration:100})});await unordered.start();assert.equal(await unordered.arm(),null);
});
test('takeover racing cancellation never stops or loads the external source',async t=>{
 const f=await gaplessFixture(t);await f.start();await f.arm();const s=await f.c.snapshot(f.principal);
 f.device.clearNext=async()=>{f.observe({uri:'external'});};
 await assert.rejects(f.command(s,'next'),e=>e.status===409);
 assert.equal((await f.c.snapshot(f.principal)).status,'external');assert.equal(f.calls.includes('stop'),false);assert.equal(f.calls.filter(x=>x==='load').length,1);
});

 test('corrupt session file restores validated backup without replaying audio',async t=>{
 const f=await fixture(t);await f.start();f.observe({position:25});await f.c.tick();f.observe({position:27});await f.c.tick();
 await writeFile(join(f.directory,'sessions-v1.json'),'{partial');const before=[...f.calls];await f.restart();
 assert.equal(f.c.health().sessionRecovery,'backup');await f.c.tick();
 const s=await f.c.snapshot(f.principal);assert.equal(s.status,'playing');assert.equal(s.position,27);assert.deepEqual(f.calls,before);
 });
 test('delayed discovery does not abandon a saved session or stop existing audio',async t=>{
 let discovered=[],broken=false;const f=await fixture(t,{discoverDevices:async()=>{if(broken)throw Error('registry unavailable');return discovered;}});
 await f.start();const before=[...f.calls];broken=true;f.observe({position:20});await f.c.tick();
 assert.equal(f.c.health().discovery,'unavailable');assert.equal((await f.c.snapshot(f.principal)).status,'playing');assert.deepEqual(f.calls,before);
 broken=false;await f.c.tick();assert.equal(f.c.health().discovery,'ready');
 });
