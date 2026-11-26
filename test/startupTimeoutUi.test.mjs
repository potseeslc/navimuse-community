import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('startup bounds native and network waits, ignores late replies, and retries', async () => {
 const window=new Window({url:'http://localhost/'});
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,setTimeout:globalThis.setTimeout};
 Object.assign(globalThis,{window,document:window.document});
 const deadlines=[];
 globalThis.setTimeout=(fn,ms,...args)=>{
  if(ms===15000||ms===4000){deadlines.push({fn,ms});return saved.setTimeout(()=>{},60000);}
  return saved.setTimeout(fn,ms,...args);
 };
 const vite=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {AccountApplication}=await vite.ssrLoadModule('/src/AccountApplication.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 let resolveNative,resolveConfig,fetches=0;
 window.__nmAudioTransport={version:1,offlineDownloads:true,request:()=>new Promise(r=>resolveNative=r)};
 globalThis.fetch=()=>{fetches++;return new Promise(r=>resolveConfig=r);};
 const tick=()=>new Promise(r=>saved.setTimeout(r,10));
 const expire=ms=>flushSync(()=>deadlines.filter(d=>d.ms===ms).at(-1).fn());
 const retry=()=>flushSync(()=>[...node.querySelectorAll('button')].find(b=>b.textContent==='Try again').click());
 try {
  flushSync(()=>root.render(React.createElement(AccountApplication,{renderPlayer:()=>React.createElement('div',{id:'player'},'Player')})));
  assert.ok(node.textContent.includes('Connecting to your library'));
  assert.ok(node.textContent.includes('Open downloaded music'));
  assert.ok(!node.querySelector('.onboarding-frame'));
  expire(4000);assert.ok(node.textContent.includes('longer than usual'));
  expire(15000);assert.ok(node.textContent.includes('could not connect'));
  resolveNative({offlineLaunch:true,available:true,scope:'queue-scope-v2:'+'a'.repeat(64)});
  await tick();assert.ok(node.textContent.includes('could not connect'),'late native reply cannot enter offline player');assert.equal(fetches,0);
  retry();resolveNative({offlineLaunch:false});await tick();assert.equal(fetches,1);
  expire(15000);assert.ok(node.textContent.includes('could not connect'));
  resolveConfig(Response.json({app:'NaviMuse',services:{}}));await tick();assert.equal(node.querySelector('#player'),null,'late config cannot override timeout');
  retry();resolveNative({offlineLaunch:false});await tick();
  resolveConfig(Response.json({app:'NaviMuse',services:{}}));await tick();assert.ok(node.querySelector('#player'),'retry recovers');
 } finally {
  flushSync(()=>root.unmount());await tick();await vite.close();window.happyDOM.abort();Object.assign(globalThis,saved);
 }
});
