import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
test('account remount discards delayed data; disconnecting mixes leaves NaviMuse charts available',async()=>{
 const w=new Window();Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 const savedFetch=globalThis.fetch;let resolveOld;let profile='Bob';const requested=[];
 globalThis.fetch=async(input,init)=>{const url=new URL(input,'http://test');const scope=url.searchParams.get('accountScope');requested.push(url.pathname);
  if(scope==='old'&&url.pathname.endsWith('connection'))return new Promise(r=>resolveOld=()=>r(new Response('{"username":"Alice","revision":1}')));
  if(url.pathname.endsWith('connection')){if(init?.method==='POST')profile=JSON.parse(init.body).username;return new Response(JSON.stringify({username:profile,revision:1}));}
  return new Response('{"state":"ready","items":[]}');
 };
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {ListenBrainzSurface}=await vite.ssrLoadModule('/src/ListenBrainzSurface.jsx');const rootElement=document.createElement('div');document.body.append(rootElement);const root=createRoot(rootElement);
 const render=scope=>flushSync(()=>root.render(React.createElement(ListenBrainzSurface,{key:scope,scope,onBack(){}})));
 const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,5));};
 try{render('old');await settle();render('new');await settle();resolveOld();await settle();assert.match(rootElement.textContent,/Bob/);assert.doesNotMatch(rootElement.textContent,/Alice/);
  assert.ok(requested.includes('/api/navidrome/listening-history/listening-activity'));assert.ok(!requested.includes('/api/navidrome/listenbrainz/listening-activity'));
  flushSync(()=>rootElement.querySelector('[aria-label="Manage ListenBrainz mixes connection"]').click());await settle();
  const disconnect=[...rootElement.querySelectorAll('button')].find(b=>b.textContent==='Disconnect');flushSync(()=>disconnect.click());await settle();assert.match(rootElement.textContent,/Connect your ListenBrainz profile/);flushSync(()=>[...rootElement.querySelectorAll('button')].find(b=>b.textContent==='Overview').click());await settle();assert.match(rootElement.textContent,/Top artists/);assert.match(rootElement.textContent,/No NaviMuse plays recorded yet/);
 }finally{flushSync(()=>root.unmount());globalThis.fetch=savedFetch;await vite.close();await w.happyDOM.close();}
});
test('home mix is a compact artwork card and plays only matched library tracks',async()=>{
 const w=new Window();Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 const savedFetch=globalThis.fetch;let played;
 globalThis.fetch=async input=>{const path=new URL(input,'http://test').pathname;return Response.json(path.endsWith('connection')?{username:'listener',revision:1}:path.endsWith('mixes')?{items:[{id:'mix',title:'Weekly Exploration for listener'}]}:path.endsWith('playlist')?{items:[{state:'matched',song:{id:'one',title:'One'}},{state:'missing',title:'Missing'}]}:{items:[]});};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');const {ListenBrainzHome}=await vite.ssrLoadModule('/src/ListenBrainzSurface.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  flushSync(()=>root.render(React.createElement(ListenBrainzHome,{scope:'test',onPlay:(songs,title)=>played={songs,title}})));
  for(let i=0;i<100&&!node.querySelector('.lb-home-mix small');i++)await new Promise(r=>setTimeout(r,10));
  const card=node.querySelector('.lb-home-mix');assert.ok(card);assert.equal(card.querySelector('ol'),null);assert.equal(card.querySelectorAll('.personalized-mix-art > *').length,4);assert.match(card.textContent,/1 track ready to play/);
  const play=card.querySelector('button');assert.equal(play.disabled,false);play.click();assert.deepEqual(played.songs.map(s=>s.id),['one']);assert.equal(played.title,'Weekly Exploration for listener');
 }finally{flushSync(()=>root.unmount());globalThis.fetch=savedFetch;await vite.close();await w.happyDOM.close();}
});
test('compact listening preview opens matched albums, and queue collapse preserves transport and audio',async()=>{
 const w=new Window();Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 const savedFetch=globalThis.fetch;let opened;
 globalThis.fetch=async input=>Response.json(new URL(input,'http://test').pathname.endsWith('connection')?{username:'listener',revision:1}:{items:[{title:'Album',albumId:'library-album',coverArt:'cover'},{title:'Unavailable'}]});
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {ListenBrainzHome}=await vite.ssrLoadModule('/src/ListenBrainzSurface.jsx'),{AppShell}=await vite.ssrLoadModule('/src/AppShell.jsx'),{DesktopQueuePanel}=await vite.ssrLoadModule('/src/QueueOverlay.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 try{
  flushSync(()=>root.render(React.createElement(ListenBrainzHome,{scope:'test',variant:'summary',onOpenAlbum:album=>opened=album})));
  for(let i=0;i<100&&!node.querySelector('.lb-album-button');i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(node.querySelectorAll('.lb-album-button').length,1);node.querySelector('.lb-album-button').click();assert.equal(opened.id,'library-album');assert.equal(node.querySelector('ol'),null);
  flushSync(()=>root.render(React.createElement(AppShell,{activeTab:'home',bindAudioDeck(){},desktopQueuePanel:React.createElement(DesktopQueuePanel,{queue:{items:[],index:0}}),miniPlayer:React.createElement('button',null,'Pause')})));
  const audio=node.querySelector('audio'),transport=node.querySelector('.desktop-player-zone');const toggle=node.querySelector('.desktop-queue-toggle');
  flushSync(()=>toggle.click());assert.equal(node.querySelector('.desktop-inspector'),null);assert.equal(node.querySelector('audio'),audio);assert.equal(node.querySelector('.desktop-player-zone'),transport);assert.equal(node.querySelector('.desktop-queue-toggle').getAttribute('aria-label'),'Show queue');assert.equal(node.querySelector('.desktop-rail .desktop-queue-toggle'),null);
  flushSync(()=>node.querySelector('.desktop-queue-toggle').click());assert.ok(node.querySelector('.desktop-inspector .queue-header-actions .desktop-queue-toggle'));assert.equal(node.querySelector('.desktop-queue-toggle').getAttribute('aria-expanded'),'true');
 }finally{flushSync(()=>root.unmount());globalThis.fetch=savedFetch;await vite.close();await w.happyDOM.close();}
});
