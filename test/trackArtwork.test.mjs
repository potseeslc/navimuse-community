import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';

test('artwork reveals only the current load and bounds previous covers during rapid skips',async()=>{
 const browser=new Window();Object.assign(globalThis,{window:browser,document:browser.document,HTMLElement:browser.HTMLElement});
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {flushSync}=await import('react-dom');
 const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true}});
 const {TrackArtwork}=await vite.ssrLoadModule('/src/TrackArtwork.jsx');
 const node=document.createElement('div');document.body.append(node);const root=createRoot(node);
 const render=src=>flushSync(()=>root.render(React.createElement(TrackArtwork,{src,alt:'Current album'})));
 const loaded=img=>flushSync(()=>img.dispatchEvent(new browser.Event('load')));
 try {
  render('/a.jpg');const a=node.querySelector('img');loaded(a);assert.ok(a.classList.contains('is-ready'));
  render('/b.jpg');const b=node.querySelector('.track-artwork-current');assert.ok(node.querySelector('.track-artwork-previous'));assert.equal(b.classList.contains('is-ready'),false);
  render('/c.jpg');loaded(b);const c=node.querySelector('.track-artwork-current');assert.equal(c.classList.contains('is-ready'),false);assert.equal(node.querySelector('.track-artwork-previous'),null);
  loaded(c);assert.ok(c.classList.contains('is-ready'));assert.equal(node.querySelector('[role="img"]').getAttribute('aria-label'),'Current album');
  flushSync(()=>c.dispatchEvent(new browser.Event('error')));assert.equal(c.classList.contains('is-ready'),false);
  render(null);assert.equal(node.querySelector('img'),null);
 } finally {flushSync(()=>root.unmount());await vite.close();await browser.happyDOM.close();}
});
