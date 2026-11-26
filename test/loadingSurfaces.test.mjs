import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('initial skeletons yield to content, refresh retains same-library results, changed libraries hide stale results',async()=>{
 const browser=new Window();for(const k of ['window','document','Node','Element','HTMLElement'])globalThis[k]=k==='window'?browser:browser[k];
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const {AppShell}=await vite.ssrLoadModule('/src/AppShell.jsx');
 const {HomeSurface}=await vite.ssrLoadModule('/src/homeSurface.jsx');const {LibrarySurface}=await vite.ssrLoadModule('/src/librarySearchSurfaces.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const render=(Component,props)=>flushSync(()=>root.render(React.createElement(Component,props)));
 const settle=async()=>{await new Promise(r=>setImmediate(r));flushSync(()=>{});};
 const originalFetch=globalThis.fetch;const requests=[];
 const takeAlbumRequest=()=>{
  const index=requests.findIndex(({url})=>String(url).includes('/albums'));
  assert.notEqual(index,-1,'expected a pending album browse request');
  return requests.splice(index,1)[0];
 };
 globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,signal:options.signal,resolve}));
 try {
  const home={settings:{discovery:{}},navidrome:{loading:true,recentAlbums:[],newestAlbums:[]}};
  render(HomeSurface,home);assert.equal(node.querySelectorAll('.loading-skeleton').length,2);
  render(HomeSurface,{...home,navidrome:{...home.navidrome,hasSnapshot:true,newestAlbums:[{id:'saved',name:'Saved album'}]}});
  assert.equal(node.querySelector('.loading-skeleton'),null);assert.match(node.textContent,/Saved album/);assert.ok(node.querySelector('[aria-label="Refreshing Discover"]'));
  const props={libraryKey:'one',browseKey:'albums',albumSort:'newest',settings:{library:{}},setBrowseKey(){},setAlbumSort(){}};
  render(LibrarySurface,props);await settle();assert.ok(node.querySelector('.loading-skeleton'));
  takeAlbumRequest().resolve(Response.json({albums:[{id:'one',name:'First library album'}],page:{nextOffset:null}}));await settle();await settle();
  assert.match(node.textContent,/First library album/);assert.equal(node.querySelector('.loading-skeleton'),null);
  render(LibrarySurface,{...props,playlistRevision:1});await settle();assert.match(node.textContent,/First library album/);assert.ok(node.querySelector('[aria-label="Refreshing albums"]'));
  const stale=takeAlbumRequest();render(LibrarySurface,{...props,libraryKey:'two'});await settle();assert.doesNotMatch(node.textContent,/First library album/);assert.ok(node.querySelector('.loading-skeleton'));
  stale.resolve(Response.json({albums:[{id:'stale',name:'Stale refresh'}]}));await settle();assert.doesNotMatch(node.textContent,/Stale refresh/);
  takeAlbumRequest().resolve(Response.json({albums:[],page:{nextOffset:null}}));await settle();await settle();assert.match(node.textContent,/No albums returned/);
  const bindAudioDeck=()=>{};const shell={bindAudioDeck,activeTab:'home',surfaces:{home:React.createElement('div',null,'Home'),library:React.createElement('div',null,'Library')},miniPlayer:React.createElement('button',null,'Pause')};
  render(AppShell,shell);const audio=[...node.querySelectorAll('audio')];const player=node.querySelector('.desktop-player-zone');
  render(AppShell,{...shell,activeTab:'library'});assert.deepEqual([...node.querySelectorAll('audio')],audio);assert.equal(node.querySelector('.desktop-player-zone'),player);

 } finally {flushSync(()=>root.unmount());globalThis.fetch=originalFetch;await vite.close();await browser.happyDOM.close();}
});
