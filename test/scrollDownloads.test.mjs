import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('touch shelves leave scrolling to the platform; Library switches to and from embedded downloads',async()=>{
 const w=new Window({url:'http://localhost/'});Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 const savedFetch=globalThis.fetch,savedObserver=globalThis.IntersectionObserver;
 let observerOptions,fetches=0;
 globalThis.IntersectionObserver=class{constructor(cb,options){observerOptions=options;}observe(){}disconnect(){}};
 globalThis.fetch=async()=>{fetches++;return Response.json({artists:[],albums:[],genres:[],playlists:[]});};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{flushSync}=await import('react-dom');
 const {ShelfRow}=await vite.ssrLoadModule('/src/homeSurface.jsx');
 const {LibrarySurface}=await vite.ssrLoadModule('/src/librarySearchSurfaces.jsx');
 const {DownloadsSurface}=await vite.ssrLoadModule('/src/DownloadsSurface.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const settle=()=>new Promise(r=>setTimeout(r,30));
 try{
  flushSync(()=>root.render(React.createElement(ShelfRow,{className:'shelf-row',paging:{more:true,albums:[],load:()=>{}}},React.createElement('button',null,'Album'))));
  const shelf=node.firstChild;Object.defineProperties(shelf,{scrollWidth:{value:1000},clientWidth:{value:300}});shelf.scrollLeft=100;
  assert.equal(observerOptions.root,shelf);assert.equal(observerOptions.rootMargin,'0px 800px');
  const pointer=(type,pointerType,x)=>shelf.dispatchEvent(new w.PointerEvent(type,{bubbles:true,cancelable:true,pointerType,pointerId:1,clientX:x,clientY:0,button:0}));
  pointer('pointerdown','touch',100);pointer('pointermove','touch',20);pointer('pointerup','touch',20);assert.equal(shelf.scrollLeft,100);
  pointer('pointerdown','mouse',100);pointer('pointermove','mouse',20);assert.equal(shelf.scrollLeft,180);pointer('pointerup','mouse',20);
  const downloads=React.createElement(DownloadsSurface,{embedded:true,state:{supported:true,available:true,tracks:[]},controller:{},onPlay:()=>{}});
  function Harness(){const [selected,setSelected]=React.useState(false),[browse,setBrowse]=React.useState('artists');return React.createElement(LibrarySurface,{browseKey:browse,setBrowseKey:setBrowse,libraryKey:'1',settings:{},onOpenDownloads:()=>setSelected(true),onCloseDownloads:()=>setSelected(false),downloadsSelected:selected,downloadsContent:downloads});}
  flushSync(()=>root.render(React.createElement(Harness)));await settle();
  const buttons=()=>[...node.querySelectorAll('.library-filter-bar button')];
  assert.deepEqual(buttons().map(b=>b.textContent),['Artists','Albums','Playlists','Genres','Downloads']);
  const before=fetches;flushSync(()=>buttons().at(-1).click());await settle();
  assert.equal(fetches,before,'Downloads must not fetch a remote library category');
  assert.equal(buttons().at(-1).getAttribute('aria-pressed'),'true');assert.ok(node.querySelector('.downloads-embedded'));assert.equal(node.querySelectorAll('.screen-surface').length,1);assert.equal(node.querySelectorAll('h1').length,1);
  flushSync(()=>buttons()[0].click());await settle();assert.equal(node.querySelector('.downloads-embedded'),null);assert.equal(buttons()[0].getAttribute('aria-pressed'),'true');
 }finally{flushSync(()=>root.unmount());globalThis.fetch=savedFetch;globalThis.IntersectionObserver=savedObserver;await vite.close();await w.happyDOM.close();}
});
