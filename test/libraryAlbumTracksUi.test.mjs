import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('Library album workspace retries, plays the selected index, queues tracks, and restores browse focus', async () => {
  const window = new Window({ url: 'http://localhost/' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'CustomEvent']) globalThis[key] = key === 'window' ? window : window[key];
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  const album = { id: 'album', name: 'Record', artist: 'Artist' };
  const songs = [1, 2, 3].map(id => ({ id: String(id), title: `Song ${id}`, duration: 200 }));
  let fail = true;
  globalThis.fetch = async input => String(input).includes('/albums/album')
    ? fail ? new Response('{}', { status: 503 }) : Response.json({ album: { ...album, song: songs } })
    : Response.json({ albums: [album, ...Array.from({length:159}, (_,i)=>({ ...album,id:`album-${i}`,name:`Extra ${i}` }))], page: { nextOffset: null } });
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { flushSync } = await import('react-dom');
  const { LibrarySurface } = await vite.ssrLoadModule('/src/librarySearchSurfaces.jsx');
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  const wait = async predicate => { for (let i=0;i<100;i++) { if(predicate()) return; await new Promise(r=>setTimeout(r,20)); } assert.fail('Expected Library state'); };
  const button = text => [...node.querySelectorAll('button')].find(b => b.textContent.includes(text));
  const label = text => [...node.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === text);
  let started = null, queued = null;
  try {
    flushSync(() => root.render(React.createElement(LibrarySurface, { libraryKey:'music', browseKey:'albums', albumSort:'newest', settings:{}, nowPlayingId:'3', onStartAlbum:(album,index)=>{started={album,index};}, onAddToQueue:song=>{queued=song;} })));
    await wait(()=>button('Record')); const opener=button('Record'); opener.click();
    await wait(()=>button('Retry')); assert.equal(started,null);
    fail=false; button('Retry').click(); await wait(()=>label('Play track 3: Song 3'));
    label('Play track 3: Song 3').click(); assert.equal(started.index,2); assert.equal(started.album.song.length,3);
    assert.match(node.querySelector('tr[aria-current="true"]').textContent,/Song 3/);
    label('Queue actions for Song 1').click(); await wait(()=>button('Add to queue')); button('Add to queue').click(); assert.equal(queued.id,'1');
    const playbackBeforeDismiss = started;
    const queueBeforeDismiss = queued;
    label('Queue actions for Song 1').click(); await wait(()=>button('Add to queue'));
    await wait(()=>document.activeElement?.getAttribute('role')==='menuitem');
    document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await wait(()=>!button('Add to queue'));
    await wait(()=>document.activeElement===label('Queue actions for Song 1'));
    assert.ok(label('Close album tracks'),'first Escape dismisses only the nested queue menu');
    document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await wait(()=>!label('Close album tracks') && document.activeElement===opener);
    assert.equal(started,playbackBeforeDismiss,'dismissal does not restart playback');
    assert.equal(queued,queueBeforeDismiss,'dismissal does not change the queue');
    opener.click(); await wait(()=>label('Close album tracks'));
    label('Close album tracks').click(); await wait(()=>document.activeElement===opener);
    opener.click(); await wait(()=>label('Close album tracks'));
    assert.ok(opener.closest('[hidden]'), 'album browse stays mounted but hidden during detail');
    assert.ok(node.querySelector('.library-detail-cover'));
    button('Back to albums').click(); await wait(()=>!label('Close album tracks'));
    button('List').click(); await wait(()=>button('List').getAttribute('aria-pressed')==='true');
    assert.equal(button('List').getAttribute('aria-pressed'),'true');
    button('more album results').click(); await wait(()=>button('Extra 158'));
    const laterAlbum=button('Extra 158'); laterAlbum.click(); await wait(()=>label('Close album tracks'));
    assert.equal(laterAlbum.isConnected,true);
    label('Close album tracks').click(); await wait(()=>document.activeElement===laterAlbum);
    assert.equal(laterAlbum.isConnected,true);
  } finally { flushSync(()=>root.unmount()); await vite.close(); await window.happyDOM.close(); }
});
