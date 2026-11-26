import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('track queue actions and source presentation render through production components', async () => {
  const browserWindow = new Window();
  global.document = browserWindow.document;
  global.window = browserWindow;
  global.Node = browserWindow.Node;
  global.Element = browserWindow.Element;
  global.HTMLElement = browserWindow.HTMLElement;

  const [{ default: React }, { createRoot }, { flushSync }, vite] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('react-dom'),
    createServer({
      root: new URL('..', import.meta.url).pathname,
      appType: 'custom',
      server: { middlewareMode: true, hmr: false },
      optimizeDeps: { noDiscovery: true }
    })
  ]);

  try {
    const [{ TrackQueueActions }, { DesktopQueuePanel }] = await Promise.all([
      vite.ssrLoadModule('/src/TrackQueueActions.jsx'),
      vite.ssrLoadModule('/src/QueueOverlay.jsx')
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const calls = [];
    flushSync(() => root.render(React.createElement(TrackQueueActions, {
      song: { id: 'track-1', title: 'Midnight Signal' },
      onPlayNext: (song) => calls.push(['next', song.id]),
      onAddToQueue: (song) => calls.push(['add', song.id])
    })));

    flushSync(() => container.querySelector('[aria-label="Queue actions for Midnight Signal"]').click());
    const menu = container.querySelector('[role="menu"]');
    assert.ok(menu);
    assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent.trim()), ['Play next', 'Add to queue']);
    flushSync(() => menu.querySelector('[role="menuitem"]').click());
    assert.deepEqual(calls, [['next', 'track-1']]);
    assert.equal(container.querySelector('[role="menu"]'), null);

    flushSync(() => root.render(React.createElement(DesktopQueuePanel, {
      queue: {
        source: { version: 1, kind: 'album', label: 'Midnight Signal', detail: 'Luna Harbor' },
        index: 0,
        items: [
          { song: { id: 'a', title: 'Current' }, provenance: 'source' },
          { song: { id: 'b', title: 'Requested' }, provenance: 'explicit' }
        ]
      }
    })));
    assert.match(container.textContent, /Playing from Midnight Signal/);
    assert.match(container.textContent, /Luna Harbor/);
    assert.match(container.textContent, /Requested/);
    assert.match(container.textContent, /Added/);
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});
