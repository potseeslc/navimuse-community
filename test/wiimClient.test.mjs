import test from 'node:test';
import assert from 'node:assert/strict';
import {createWiiMController,createOfflineOutputController} from '../src/wiimPlayback.js';
const queue={index:0,items:[{song:{id:'one'}}]};
test('transfer pauses local audio before sending the remote start and blocks local on lost response',async()=>{
 const events=[];const c=createWiiMController({scope:'scope',pauseLocal:async()=>events.push('pause'),request:async(_,options)=>{if(!options)return {session:null};events.push('start');throw Error('Connection lost');}});
 await c.refresh();assert.equal(c.blocksLocal,false);
 assert.equal(await c.transfer('bedroom',queue,{},0),false);assert.deepEqual(events,['pause','start']);assert.equal(c.blocksLocal,true);
});
test('reattaching blocks local playback before asynchronous native pause resolves',async()=>{
 let release;const c=createWiiMController({scope:'scope',pauseLocal:()=>new Promise(r=>release=r),request:async()=>({session:{id:'remote',status:'playing',revision:2}})});
 const pending=c.refresh();await new Promise(r=>setImmediate(r));assert.equal(c.blocksLocal,true);release();await pending;assert.equal(c.state.session.id,'remote');
});
test('failed remote stop retains remote authority and does not unlock local playback',async()=>{
 const c=createWiiMController({scope:'scope',pauseLocal:async()=>{},request:async(_,options)=>({session:{id:'remote',status:options?'unreachable':'playing',revision:2}})});
 await c.refresh();assert.equal(await c.release(),false);assert.equal(c.blocksLocal,true);assert.match(c.state.error,/stop could not be confirmed/);
});
test('returning local after a lost transfer response reconciles and releases a remotely started session',async()=>{
 let remote=null;const calls=[];
 const c=createWiiMController({scope:'scope',pauseLocal:async()=>calls.push('pause'),request:async(path,options)=>{
  if(!options)return {session:remote};
  if(path.endsWith('/session')){remote={id:'remote',status:'playing',revision:1};throw new TypeError('Load failed');}
  calls.push('release');remote={...remote,status:'released'};return {session:remote};
 }});
 await c.refresh();assert.equal(await c.transfer('bedroom',queue,{},0),false);assert.equal(c.blocksLocal,true);
 assert.equal(await c.release(),true);assert.equal(c.blocksLocal,false);assert.deepEqual(calls,['pause','pause','release']);
});

test('handoff persists unknown before any mutation and keeps it across an intermediate release',async()=>{
 const events=[];let remote={id:'old',status:'playing',revision:1};
 const c=createWiiMController({scope:'scope',pauseLocal:async()=>events.push('pause'),saveOwnership:async value=>events.push(value.state),request:async(path,options)=>{
  if(!options)return {session:remote};
  if(path.includes('/commands')){events.push('release');return {session:{...remote,status:'released'}};}
  events.push('start');throw Error('Response lost');
 }});
 await c.refresh();events.length=0;
 assert.equal(await c.transfer('new',queue,{},0),false);
 assert.deepEqual(events,['unknown','pause','release','start']);assert.equal(c.blocksLocal,true);
});
test('failed ownership persistence prevents a remote start',async()=>{
 let starts=0,pauses=0;
 const c=createWiiMController({pauseLocal:async()=>pauses++,saveOwnership:async()=>{throw Error('Disk full');},request:async()=>{starts++;}});
 assert.equal(await c.transfer('speaker',queue,{},0),false);assert.equal(starts,0);assert.equal(pauses,0);assert.match(c.state.error,/Disk full/);
});
test('unavailable speaker service cannot replace persisted ownership with local',async()=>{
 const saved=[];const c=createWiiMController({pauseLocal:async()=>{},saveOwnership:async value=>saved.push(value),request:async()=>{throw Object.assign(Error('Unavailable'),{status:503});}});
 await c.refresh();assert.deepEqual(saved,[]);assert.equal(c.state.available,false);
});
test('offline controller permits only confirmed local ownership and never sends speaker commands',async()=>{
 for(const ownership of [undefined,{state:'unknown'},{state:'remote'},{state:'local'}]){
  const c=createOfflineOutputController(ownership);assert.equal(c.blocksLocal,ownership?.state!=='local');
  for(const method of ['refresh','discover','transfer','command','disconnect','release'])assert.equal(await c[method](),false);
  assert.equal(c.state.session,null);assert.equal(c.blocksLocal,ownership?.state!=='local');
 }
});
test('a delayed refresh cannot overwrite the owner after a transfer finishes',async()=>{
 let resolveSave;let first=true;
 const c=createWiiMController({pauseLocal:async()=>{},saveOwnership:value=>{
  if(first&&value.state==='local'){first=false;return new Promise(resolve=>{resolveSave=resolve;});}return Promise.resolve();
 },request:async(path,options)=>({session:options?{id:'new',status:'playing',revision:1}:null})});
 const pending=c.refresh();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(await c.transfer('new',queue,{},0),true);resolveSave();await pending;
 assert.equal(c.state.session.id,'new');assert.equal(c.blocksLocal,true);
});

test('stale unavailable refresh cannot unlock local after an uncertain handoff',async()=>{
 let rejectRefresh;
 const c=createWiiMController({pauseLocal:async()=>{},request:async(path,options)=>{
  if(!options)return new Promise((resolve,reject)=>{rejectRefresh=reject;});
  throw Error('Start response lost');
 }});
 const refreshing=c.refresh();assert.equal(await c.transfer('speaker',queue,{},0),false);
 rejectRefresh(Object.assign(Error('Unavailable'),{status:503}));await refreshing;
 assert.equal(c.blocksLocal,true);assert.equal(c.state.checked,false);
});

test('a background refresh preserves a failed command message until the next explicit action',async()=>{
 let fail=true;const c=createWiiMController({pauseLocal:async()=>{},request:async(_path,options)=>{
  if(options && fail)throw Error('Speaker could not be stopped');
  return {session:options?{id:'remote',status:'released',revision:3}:{id:'remote',status:'unreachable',revision:2}};
 }});
 await c.refresh();assert.equal(await c.release(),false);const error=c.state.error;assert.match(error,/Speaker could not be stopped/);
 await c.refresh();assert.equal(c.state.error,error);assert.equal(c.state.busy,false);
 fail=false;assert.equal(await c.release(),true);assert.equal(c.state.error,'');assert.equal(c.blocksLocal,false);
});

test('a lost transport response refreshes state without replaying the mutation',async()=>{
 let revision=1,commands=0,reads=0;const c=createWiiMController({pauseLocal:async()=>{},request:async(path,options)=>{
  if(options){commands++;revision++;throw Error('response lost');}reads++;return {session:{id:'remote',status:'playing',revision}};
 }});
 await c.refresh();assert.equal(await c.command('next'),false);assert.equal(commands,1);assert.equal(reads,2);assert.equal(c.state.session.revision,2);assert.equal(c.blocksLocal,true);assert.equal(c.state.error,'');
});

test('steady speaker snapshots do not repeatedly pause the native player; delayed recovery clears stale errors',async()=>{
 let pauses=0,status='playing';const c=createWiiMController({pauseLocal:async()=>pauses++,request:async(path,options)=>{
  if(options){status='reconnecting';throw Error('read timed out');}return {session:{id:'remote',status,revision:1}};
 }});
 await c.refresh();await c.refresh();assert.equal(pauses,1);
 await c.command('next');assert.match(c.state.error,/Checking speaker/);status='playing';await c.refresh();assert.equal(c.state.error,'');assert.equal(pauses,1);assert.equal(c.blocksLocal,true);
});

test('successful speaker reconciliation clears a transient poll error during local playback', async()=>{
 let fail=true;
 const c=createWiiMController({pauseLocal:async()=>{},request:async()=>{if(fail)throw Error('Load failed');return {session:null};}});
 await c.refresh();assert.match(c.state.error,/home speaker status/);
 fail=false;await c.refresh();assert.equal(c.state.error,'');assert.equal(c.blocksLocal,false);
});

test('successful polling does not erase an unresolved failed transfer', async()=>{
 const c=createWiiMController({pauseLocal:async()=>{},request:async(path,options)=>{if(options)throw Error('Transfer failed');return {session:null};}});
 await c.refresh();await c.transfer('speaker',queue,{},0);const error=c.state.error;
 await c.refresh();assert.equal(c.state.error,error);
});

test('a poll failure and recovery preserve an earlier unresolved command error', async()=>{
 let failPoll=false;
 const c=createWiiMController({pauseLocal:async()=>{},request:async(path,options)=>{if(options)throw Error('Transfer failed');if(failPoll)throw Error('Poll failed');return {session:null};}});
 await c.refresh();await c.transfer('speaker',queue,{},0);const error=c.state.error;
 failPoll=true;await c.refresh();assert.equal(c.state.error,error);
 failPoll=false;await c.refresh();assert.equal(c.state.error,error);
});


test('radio validation error clears on source change without changing output ownership',async()=>{
 let requests=0,pauses=0;const c=createWiiMController({pauseLocal:async()=>pauses++,request:async()=>{requests++;return {session:null};}});
 await c.refresh();c.setPlaybackSource('radio:invalid:id');
 const radio={index:0,items:[{song:{id:'radio:invalid:id',streamUrl:'/api/navidrome/radios/chill/stream'}}]};
 assert.equal(await c.transfer('speaker',radio,{},0),false);
 assert.match(c.state.error,/live radio station cannot be transferred/);assert.equal(requests,1);assert.equal(pauses,0);assert.equal(c.blocksLocal,false);
 await c.refresh();assert.match(c.state.error,/live radio station cannot be transferred/);
 c.setPlaybackSource('radio:invalid:id');assert.match(c.state.error,/live radio station cannot be transferred/);
 c.setPlaybackSource('song-for-zula');assert.equal(c.state.error,'');assert.equal(c.blocksLocal,false);assert.equal(requests,2);assert.equal(pauses,0);
});

test('changing tracks cannot hide an uncertain speaker command after a validation error',async()=>{
 let remote=null;const c=createWiiMController({pauseLocal:async()=>{},request:async(_path,options)=>{
  if(options)throw Error('Speaker stop failed');return {session:remote};
 }});
 await c.refresh();c.setPlaybackSource('radio:invalid:id');
 await c.transfer('speaker',{index:0,items:[{song:{id:'radio:invalid:id'}}]}, {},0);
 assert.match(c.state.error,/cannot be transferred/);
 remote={id:'owned',revision:1,status:'unreachable'};await c.refresh();
 await c.release();const message=c.state.error;assert.match(message,/Speaker stop failed/);
 c.setPlaybackSource('new-track');assert.equal(c.state.error,message);assert.equal(c.blocksLocal,true);
});
