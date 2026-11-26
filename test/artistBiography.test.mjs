import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('biography preview expands, collapses, responds to reflow and resets for changed text',async()=>{
 const w=new Window();Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
 let height=300,resize,disconnected=0;
 Object.defineProperty(w.HTMLElement.prototype,'scrollHeight',{configurable:true,get(){return height;}});
 w.ResizeObserver=class{constructor(callback){resize=callback;}observe(){}disconnect(){disconnected++;}};
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const React=await import('react');const{createRoot}=await import('react-dom/client');const{flushSync}=await import('react-dom');const{ArtistBiography}=await vite.ssrLoadModule('/src/ArtistBiography.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const render=biography=>flushSync(()=>root.render(React.createElement(ArtistBiography,{name:'Artist',biography})));
 try{
  const biography={text:'<img src=x onerror=bad()> A long artist story',sourceUrl:'https://www.last.fm/music/Artist'};
  render(biography);let button=node.querySelector('button'),preview=node.querySelector('.artist-biography-preview');
  assert.equal(button.textContent,'More info');assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(button.getAttribute('aria-controls'),preview.id);assert.ok(preview.classList.contains('is-truncated'));assert.equal(node.querySelector('img'),null);assert.equal(node.querySelector('a').rel,'noopener noreferrer');
  button.focus();flushSync(()=>button.click());assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(button.textContent,'Less info');assert.equal(preview.style.maxHeight,'300px');assert.equal(preview.classList.contains('is-truncated'),false);assert.equal(document.activeElement,button);
  flushSync(()=>button.click());assert.equal(button.getAttribute('aria-expanded'),'false');assert.ok(preview.classList.contains('is-truncated'));
  height=48;flushSync(()=>resize());assert.equal(node.querySelector('button'),null);assert.equal(preview.classList.contains('is-truncated'),false);
  height=300;flushSync(()=>resize());button=node.querySelector('button');flushSync(()=>button.click());
  render({...biography,text:'Another biography'});assert.equal(node.querySelector('button').getAttribute('aria-expanded'),'false');
  render(null);assert.equal(node.textContent,'');assert.ok(disconnected>=2);
 }finally{flushSync(()=>root.unmount());await vite.close();await w.happyDOM.close();}
});
