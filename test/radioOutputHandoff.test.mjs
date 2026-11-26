import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createWiiMController,remoteQueue} from '../src/wiimPlayback.js';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('  const playInternetRadio = async'),source.indexOf('  const openArtist='));
const station={id:'radio:second',streamUrl:'https://untrusted.example/stream'};
test('station changes replace the active remote queue without releasing or starting local audio',async()=>{
 let finish,plays=0;const commands=[];const session={id:'remote',revision:1,status:'playing',device:{id:'leader',name:'Living Room'},sleepTimerDeadline:12345};
 const wiim=createWiiMController({scope:'legacy',pauseLocal:async()=>{},request:async(path,init)=>{
  if(!init)return {session};commands.push(JSON.parse(init.body));return new Promise(resolve=>{finish=resolve;});
 }});
 await wiim.refresh();const mounted={current:true};
 const play=runInNewContext(helper+';playInternetRadio',{wiim,remoteQueue,radioPlaybackMounted:mounted,playTrackEvent:()=>plays++});
 const pending=play(station,null,[station]);await Promise.resolve();
 assert.equal(wiim.state.busy,true);assert.equal(wiim.blocksLocal,true);assert.equal(plays,0);
 assert.equal(commands[0].action,'replace');assert.deepEqual(commands[0].queue.items[0].song,{id:'radio:second'});
 finish({session:{...session,revision:2,song:{id:station.id}}});await pending;
 assert.equal(wiim.state.session.id,'remote');assert.equal(wiim.state.session.device.id,'leader');assert.equal(wiim.state.session.sleepTimerDeadline,12345);assert.equal(plays,0);
 mounted.current=false;await play(station,null,[station]);assert.equal(commands.length,1);
 wiim.dispose();
});
test('unknown output and failed remote replacement never fall back to the local player',async()=>{
 let plays=0;const state={session:null,busy:false};let requested=0;
 const play=runInNewContext(helper+';playInternetRadio',{wiim:{blocksLocal:true,state,command:async()=>{requested++;return false;}},remoteQueue,radioPlaybackMounted:{current:true},playTrackEvent:()=>plays++});
 await assert.rejects(play(station,null,[station]),/still being checked/);assert.equal(requested,0);
 state.session={id:'remote'};await assert.rejects(play(station,null,[station]),/Could not change the station/);assert.equal(requested,1);assert.equal(plays,0);
});
test('a confirmed local output still starts the station locally',async()=>{
 let played;const play=runInNewContext(helper+';playInternetRadio',{wiim:{blocksLocal:false},remoteQueue,radioPlaybackMounted:{current:true},playTrackEvent:(...args)=>played=args});
 await play(station,null,[station]);assert.equal(played[0],station);assert.equal(played[2].queueIndex,0);
});
