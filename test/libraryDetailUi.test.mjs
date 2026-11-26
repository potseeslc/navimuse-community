import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('library details preserve focus, paginate empty matches, and retry without playing', async () => {
  const window = new Window({ url: 'http://localhost/' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'CustomEvent']) globalThis[key] = key === 'window' ? window : window[key];
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  const requests = [];
  let fail = true;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://localhost');
    requests.push(url);
    if (url.pathname.endsWith('/artists')) return Response.json({ artists: [{ id: 'artist', name: 'An Artist', coverArt: 'ar-artist' }] });
    assert.equal(url.searchParams.get('musicFolderId'), 'selected');
    assert.equal(url.searchParams.get('artistId'), 'artist');
    if (fail) return new Response('{}', { status: 503 });
    return Response.json(url.searchParams.get('offset') === '0' ? { albums: [], page: { nextOffset: 500 } } : { albums: [{ id: 'record', name: 'An Album', artist: 'An Artist' }], page: { nextOffset: null } });
  };
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { flushSync } = await import('react-dom');
  const { LibrarySurface } = await vite.ssrLoadModule('/src/librarySearchSurfaces.jsx');
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const waitFor = async (predicate) => {
    for (let i = 0; i < 100; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('Library did not reach expected state');
  };
  const button = (label) => [...node.querySelectorAll('button')].find((item) => item.textContent.includes(label));
  let opened = null;
  try {
    flushSync(() => root.render(React.createElement(LibrarySurface, { libraryKey: 'selected', browseKey: 'artists', albumSort: 'newest', settings: {}, onPlayAlbum: (album) => { opened = album; } })));
    await waitFor(() => button('An Artist'));
    const opener = button('An Artist');
    const image=opener.querySelector('img');
    assert.match(image.getAttribute('src'), /api\/navidrome\/cover\/ar-artist/);
    assert.equal(image.getAttribute('loading'),'lazy');
    flushSync(()=>image.dispatchEvent(new window.Event('error')));
    assert.ok(opener.querySelector('.artwork-fallback'));
    opener.focus();
    opener.click();
    await waitFor(() => button('Retry'));
    assert.equal(document.activeElement.textContent, 'An Artist');
    fail = false;
    button('Retry').click();
    await waitFor(() => button('Load more albums'));
    assert.match(node.textContent, /No matching albums in this part/);
    button('Load more albums').focus();
    button('Load more albums').click();
    await waitFor(() => button('An Album'));
    assert.ok(document.activeElement === node.querySelector('.library-collection-detail h1'));
    assert.equal(opened, null);
    button('An Album').click();
    assert.equal(opened.id, 'record');
    button('Back to Library').click();
    await waitFor(() => document.activeElement === opener);
    assert.equal(opener.isConnected, true);
  } finally {
    flushSync(() => root.unmount());
    await vite.close();
    await window.happyDOM.close();
  }
});
