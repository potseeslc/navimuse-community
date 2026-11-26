import { Window } from 'happy-dom';
import { createServer } from 'vite';
import test from 'node:test';
import assert from 'node:assert/strict';

test('timeline previews a drag, commits once on release, and cancels safely', async () => {
  const w = new Window({url:'http://localhost'});
  for (const key of ['window','document','Node','Element','HTMLElement']) globalThis[key] = key === 'window' ? w : w[key];
  const vite = await createServer({server:{middlewareMode:true}, appType:'custom', optimizeDeps:{noDiscovery:true}});
  const React = await import('react');
  const {createRoot} = await import('react-dom/client');
  const {flushSync} = await import('react-dom');
  const {ProgressRail} = await vite.ssrLoadModule('/src/playerChrome.jsx');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); const seeks = [];
  const render = (progress=.2,disabled=false) => flushSync(()=>root.render(React.createElement(ProgressRail,{progress,disabled,onSeek:x=>seeks.push(x)})));
  try {
    render(); const rail = container.querySelector('[role="slider"]');
    rail.getBoundingClientRect = () => ({left:10,width:100});
    let captured = false;
    rail.setPointerCapture = () => {captured=true;}; rail.hasPointerCapture=()=>captured;rail.releasePointerCapture=()=>{captured=false;};
    const pointer = (type,x,id=1) => flushSync(()=>rail.dispatchEvent(new w.PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,pointerId:id,button:0,pointerType:'touch'})));
    pointer('pointerdown',30); assert.notEqual(document.activeElement,rail,'touch drag does not create a focus ring'); pointer('pointermove',75); await new Promise(r=>setTimeout(r,25));
    assert.deepEqual(seeks,[]); assert.equal(rail.getAttribute('aria-valuenow'),'65');
    render(.3); assert.equal(rail.getAttribute('aria-valuenow'),'65','playback updates do not move the dragging thumb');
    pointer('pointerup',90); assert.deepEqual(seeks,[.8]);
    rail.click(); assert.deepEqual(seeks,[.8],'synthetic click must not seek twice');
    pointer('pointerdown',40);pointer('pointercancel',80);pointer('pointerup',80);assert.deepEqual(seeks,[.8]);
    pointer('pointerdown',40);pointer('pointermove',95,2);pointer('pointerup',40);assert.deepEqual(seeks,[.8,.3]);
    rail.focus();assert.equal(document.activeElement,rail,'slider stays keyboard focusable');
    flushSync(()=>rail.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true})));assert.equal(seeks.at(-1),1);
    render(.2,true);pointer('pointerdown',80);pointer('pointerup',80);assert.equal(seeks.length,3);
  } finally {flushSync(()=>root.unmount());await vite.close();w.happyDOM.abort();}
});
