import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('offline production entry opens shared player and downloads with no server requests',async()=>{
 const window=new Window({url:'https://navimuse.example.com/'});
 for(const key of ['window','document','Node','Element','HTMLElement','CustomEvent','MutationObserver','ResizeObserver'])globalThis[key]=key==='window'?window:window[key];
 Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
 const scope='queue-scope-v2:'+'a'.repeat(64),calls=[],network=[];
 let snapshot={offlineLaunch:true,available:true,scope,expiresAt:Date.now()+86400000,outputOwnership:{state:'local'},allowsCellular:false,budgetBytes:2*1024**3,usedBytes:128,tracks:[{song:{id:'saved-one',title:'Offline fixture song',artist:'Fixture',duration:12},state:'complete',bytes:64},{song:{id:'saved-two',title:'Second saved song',artist:'Fixture',duration:12},state:'complete',bytes:64}]};
 window.__nmAudioTransport={version:1,offlineDownloads:true,request:async message=>{calls.push(message);if(message.action==='offline.status')return snapshot;return true;}};
 globalThis.fetch=async input=>{network.push(input);throw Error('Fixture has no network');};
 const node=document.createElement('div');node.id='root';document.body.append(node);
 const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false},appType:'custom'});
 const wait=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Offline entry did not reach expected state: '+node.textContent.slice(0,700));};
 try{
  await vite.ssrLoadModule('/src/main.jsx');await wait(()=>node.textContent.includes('Play downloads'));
  [...node.querySelectorAll('button')].find(b=>b.textContent==='Songs').click();await wait(()=>node.textContent.includes('Offline fixture song'));
  assert.equal(node.querySelectorAll('audio').length,2,'same shared player decks');
  assert.equal(node.querySelectorAll('[aria-label="Primary"] button').length,1);
  assert.equal(node.querySelector('[aria-label="Primary"] button').textContent,'Downloads');
  assert.deepEqual(network,[]);assert.equal(calls.some(c=>['offline.account','offline.authorize','offline.output'].includes(c.action)),false);
  [...node.querySelectorAll('button')].find(b=>b.textContent==='Play downloads').click();
  await wait(()=>calls.some(c=>c.action==='load'&&c.url?.includes('saved-one')));
  const load=calls.find(c=>c.action==='load'&&c.url?.includes('saved-one'));
  assert.equal(new URL(load.url).searchParams.get('accountScope'),scope);
  assert.deepEqual(network,[]);
  snapshot={...snapshot,available:false,tracks:[]};window.dispatchEvent(new window.CustomEvent('navimuse-native-audio',{detail:{type:'offline',snapshot}}));
  await wait(()=>node.textContent.includes('Offline access has expired'));
  assert.equal(node.querySelectorAll('audio').length,0,'grant expiry unmounts playback authority');
  [...node.querySelectorAll('button')].find(b=>b.textContent==='Connect to NaviMuse').click();
  await wait(()=>calls.some(c=>c.action==='offline.reconnect'));assert.deepEqual(network,[]);
 }finally{await vite.close();await window.happyDOM.abort();}
});
