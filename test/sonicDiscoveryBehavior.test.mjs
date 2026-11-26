import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('Sonic keeps diagnostics in Settings and restores focus after canceled discovery', async () => {
  const w = new Window({url:'http://localhost/'});
  for (const name of ['window','document','Node','Element','HTMLElement','ResizeObserver']) globalThis[name] = name === 'window' ? w : w[name];
  Object.defineProperty(globalThis, 'navigator', {value:w.navigator, configurable:true});
  const React = await import('react');
  const {createRoot} = await import('react-dom/client');
  const {flushSync} = await import('react-dom');
  const vite = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  let root;
  const requests = [];
  globalThis.fetch = (url, init) => new Promise(resolve => requests.push({url:String(url),init,resolve}));
  const wait = () => new Promise(resolve => setTimeout(resolve, 30));
  const reply = (request, body, status=200) => request.resolve(new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json'}}));
  try {
    const {SonicSurface} = await vite.ssrLoadModule('/src/sonicSettingsSurfaces.jsx');
    const {AtlasJourneyContext} = await vite.ssrLoadModule('/src/AtlasJourneyContext.jsx');
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    let playbackCalls = 0;
    flushSync(() => root.render(React.createElement(AtlasJourneyContext.Provider, {value:{state:{events:[]},cancelPreview(){}}}, React.createElement(SonicSurface, {libraryKey:'music',onPlaySong(){playbackCalls++;}}))));
    await wait();
    const button = label => [...container.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    const click = node => {node.focus(); flushSync(() => node.click());};
    assert.equal(button('Check AudioMuse status'),undefined);
    assert.ok(button('Find my sound'));
    assert.ok(!container.textContent.includes('Destination'));
    assert.ok(!container.textContent.includes('Smart Playlists'));
    for (const label of ['Long Builds','Quiet Intros','High Energy','Sonic Profile']) assert.ok(!container.textContent.includes(label));
    click(button('Artist Journey')); await wait();
    const pending = requests.find(r=>r.url.includes('/library/artists'));assert.ok(pending);
    click(button('Back to discovery')); await wait();
    assert.equal(pending.init.signal.aborted, true);
    assert.equal(document.activeElement, button('Artist Journey'));
    reply(pending, {artists:[{id:'late',name:'Late Artist'}]}); await wait();
    assert.ok(!container.querySelector('[aria-label="Discovery results"]'));
    assert.ok(!container.textContent.includes('Late Artist'));
    click(button('Explore your library mapA visual view of the sounds in your analyzed library→')); await wait();
    assert.ok(container.querySelector('[aria-label="Library map"]'));
    assert.ok(!container.textContent.includes('Start Journey'));
    assert.equal(playbackCalls,0);
    reply(requests.find(r=>r.url.includes('/atlas/projection')),{error:'Map unavailable'},503);await wait();
    assert.ok(button('Retry map'));
    click(button('Back to Sonic'));await wait();assert.ok(button('Find my sound'));

  } finally { root?.unmount(); await vite.close(); w.happyDOM.abort(); }
});
