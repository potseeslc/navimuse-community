import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
import {activityBuckets} from '../src/listenBrainzData.js';

test('long activity ranges preserve every listen when grouped for display',()=>{
 const items=Array.from({length:365},(_,i)=>({title:`Day ${i}`,count:i%5,from:i+1}));
 const grouped=activityBuckets(items);
 assert.ok(grouped.length<=48);assert.equal(grouped.reduce((s,x)=>s+x.count,0),items.reduce((s,x)=>s+x.count,0));
 assert.match(grouped.at(-1).title,/Day 364/);assert.deepEqual(activityBuckets([]),[]);
});

test('dashboard totals, chart selection, album navigation and matched-only playback work with partial failures',async()=>{
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 const savedFetch=globalThis.fetch;let played,opened,artistFails=true,recentCalls=0;
 globalThis.fetch=async input=>{
  const kind=new URL(input,'http://localhost').pathname.split('/').at(-1);
  if(kind==='recent')recentCalls++;
  if(kind==='artists'&&artistFails)return Response.json({error:'Artists unavailable'},{status:503});
  if(kind==='listening-activity')return Response.json({state:'ready',items:[{title:'Sep 1',count:12},{title:'Sep 2',count:8}]});
  if(kind==='release-groups')return Response.json({state:'ready',items:[{title:'Album',albumId:'album-id',count:10}]});
  if(kind==='artists')return Response.json({state:'ready',items:[{title:'Artist',count:20}]});
  return Response.json({state:'ready',items:[{title:'Matched',artist:'Artist',count:2,song:{id:'song-id',title:'Matched'}},{title:'Unmatched',artist:'Artist',count:1}]});
 };
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {ListenBrainzDashboard}=await vite.ssrLoadModule('/src/ListenBrainzDashboard.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,5));};
 const props={path:kind=>'/api/'+kind,range:'this_month',onPlay:songs=>played=songs,onOpenAlbum:album=>opened=album};
 try {
  flushSync(()=>root.render(React.createElement(ListenBrainzDashboard,props)));await settle();
  assert.equal(node.querySelector('.lb-dashboard').firstElementChild.getAttribute('aria-label'),'Recently listened');
  assert.equal(node.querySelector('.lb-total').textContent,'20');assert.match(node.textContent,/Unavailable/);
  assert.equal(node.querySelectorAll('[aria-label="Play Unmatched"]').length,0);
  node.querySelector('[aria-label="Play Matched"]').click();assert.equal(played[0].id,'song-id');
  node.querySelector('[aria-label="Open Album"]').click();assert.equal(opened.id,'album-id');
  flushSync(()=>node.querySelector('[aria-label="Sep 2: 8 listens"]').click());assert.match(node.querySelector('.lb-chart-readout').textContent,/Sep 2 · 8 listens/);
  flushSync(()=>node.querySelector('.lb-activity header button').click());assert.equal(node.querySelectorAll('tbody tr').length,2);
  const firstListen=node.querySelector('.lb-ranked-recent li');
  flushSync(()=>root.render(React.createElement(ListenBrainzDashboard,{...props,range:'this_week'})));await settle();
  assert.equal(node.querySelector('.lb-ranked-recent li'),firstListen);assert.equal(recentCalls,1);
  artistFails=false;flushSync(()=>node.querySelector('.lb-ranked-artists [role="alert"] button').click());await settle();assert.equal(node.querySelector('.lb-ranked-artists [role="alert"]'),null);
  flushSync(()=>root.render(React.createElement(ListenBrainzDashboard,{...props,disabledReason:'Detach the Journey first.'})));assert.equal(node.querySelector('[aria-label="Play Matched"]').disabled,true);
 } finally {flushSync(()=>root.unmount());globalThis.fetch=savedFetch;await vite.close();await w.happyDOM.close();}
});

test('feed refresh preserves rows, animates only new listens, pauses hidden and cancels on unmount',async()=>{
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 const savedFetch=globalThis.fetch,savedTimer=globalThis.setTimeout,savedClear=globalThis.clearTimeout;
 const timers=new Map();let serial=0,hidden=false,calls=0,fail=false,items=[{id:'old',at:1,title:'Old',artist:'Artist'}];
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
 globalThis.setTimeout=(fn,ms,...args)=>{if(ms>=30000){const id=++serial;timers.set(id,{fn,ms});return id;}return savedTimer(fn,ms,...args);};
 globalThis.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else savedClear(id);};
 globalThis.fetch=async()=>{calls++;if(fail)throw new Error('Offline');return Response.json({state:'ready',items});};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {useListenBrainzData}=await vite.ssrLoadModule('/src/listenBrainzData.js');
 function Feed(){const state=useListenBrainzData('/api/recent');return React.createElement('ul',null,(state.data?.items||[]).map(item=>React.createElement('li',{key:item.id,'data-new':state.added?.has(item.id)},item.title)));}
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const settle=()=>new Promise(r=>savedTimer(r,30));
 try{
  flushSync(()=>root.render(React.createElement(Feed)));await settle();
  assert.equal(calls,1);const old=node.querySelector('li');assert.equal(old.dataset.new,'false');
  items=[{id:'new',at:2,title:'New',artist:'Artist'},...items];
  const tick=()=>{const entry=[...timers.entries()].find(([,t])=>t.ms===30000);assert.ok(entry);timers.delete(entry[0]);entry[1].fn();};
  tick();await settle();assert.equal(node.querySelectorAll('li')[1],old);assert.equal(node.querySelector('li').dataset.new,'true');
  tick();await settle();assert.equal(node.querySelectorAll('[data-new="true"]').length,0);
  fail=true;tick();await settle();assert.equal(node.querySelectorAll('li').length,2);assert.ok([...timers.values()].some(t=>t.ms===60000));
  hidden=true;document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(timers.size,0);assert.equal(calls,4);
  hidden=false;document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(timers.size,1);
  flushSync(()=>root.unmount());assert.equal(timers.size,0);
 }finally{flushSync(()=>root.unmount());globalThis.fetch=savedFetch;globalThis.setTimeout=savedTimer;globalThis.clearTimeout=savedClear;await vite.close();await w.happyDOM.close();}
});
