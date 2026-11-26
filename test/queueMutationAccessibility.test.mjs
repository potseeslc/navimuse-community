import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('queue mutations remain labeled, announced, boundary-safe, and focus-stable', async () => {
  const browserWindow = new Window();
  global.document = browserWindow.document;
  global.window = browserWindow;
  global.Node = browserWindow.Node;
  global.Element = browserWindow.Element;
  global.HTMLElement = browserWindow.HTMLElement;
  browserWindow.requestAnimationFrame = (callback) => browserWindow.setTimeout(callback, 0);
  browserWindow.cancelAnimationFrame = (handle) => browserWindow.clearTimeout(handle);

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
    const [{ DesktopQueuePanel }, mutations] = await Promise.all([
      vite.ssrLoadModule('/src/QueueOverlay.jsx'),
      vite.ssrLoadModule('/src/queueMutations.js')
    ]);
    const queueItem = (id, provenance = 'source') => ({ queueItemId: id, provenance, song: { id, title: id, artist: 'Artist' }, album: null });
    const initialQueue = {
      index: 1,
      source: { version: 1, kind: 'radio', label: 'Signal Radio', generatedBoundary: 4 },
      items: [queueItem('played'), queueItem('current'), queueItem('source-next'), queueItem('manual', 'explicit'), queueItem('generated', 'generated')]
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    function Harness() {
      const [queue, setQueue] = React.useState(initialQueue);
      const queueRef = React.useRef(initialQueue);
      const mutate = (mutation) => {
        const next = mutation(queueRef.current);
        if (next === queueRef.current) return false;
        queueRef.current = next;
        setQueue(next);
        return true;
      };
      return React.createElement(DesktopQueuePanel, {
        controls: { shuffle: false },
        onClearGenerated: () => mutate(mutations.removeGeneratedContinuation),
        onClearPlayed: () => mutate(mutations.clearPlayedQueue),
        onClearUpcoming: () => mutate(mutations.clearUpcomingQueue),
        onMoveQueueItem: (index, direction) => mutate((queue) => mutations.moveUpcomingQueueItem(queue, index, direction)),
        onRemoveQueueItem: (index) => mutate((queue) => mutations.removeUpcomingQueueItem(queue, index)),
        queue
      });
    }

    flushSync(() => root.render(React.createElement(Harness)));
    assert.ok(container.querySelector('[aria-label="Clear played tracks"]'));
    assert.ok(container.querySelector('[aria-label="Clear upcoming tracks"]'));
    assert.match(container.querySelector('.queue-generated-boundary').textContent, /Generated continuation · 1 trackRemove/);
    assert.equal(container.querySelector('[aria-label="Move generated up in queue"]').disabled, true);
    assert.match(container.querySelector('[aria-label="Move generated up in queue"]').title, /Generated continuation stays after added tracks/);

    const moveSourceDown = container.querySelector('[aria-label="Move source-next down in queue"]');
    moveSourceDown.focus();
    flushSync(() => moveSourceDown.click());
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));
    assert.match(document.activeElement.getAttribute('aria-label'), /source-next/);
    assert.match(document.activeElement.closest('.queue-row-actions').getAttribute('aria-label'), /Edit source-next in queue/);
    assert.match(container.querySelector('[role="status"]').textContent, /Moved source-next down/);

    flushSync(() => container.querySelector('.queue-generated-boundary button').click());
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));
    assert.equal(container.querySelector('.queue-generated-boundary'), null);
    assert.ok(document.activeElement.classList.contains('desktop-queue-list'));
    assert.match(container.querySelector('[role="status"]').textContent, /Removed generated continuation/);

    flushSync(() => container.querySelector('[aria-label="Clear played tracks"]').click());
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));
    assert.equal(container.querySelector('[aria-label="Clear played tracks"]'), null);
    assert.ok(document.activeElement.classList.contains('desktop-queue-list'));
    assert.match(container.querySelector('[role="status"]').textContent, /Cleared 1 played track/);
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});

test('attached Journey queue exposes named edit restrictions without mutation controls disappearing', async () => {
  const browserWindow = new Window();
  global.document = browserWindow.document;
  global.window = browserWindow;
  global.Node = browserWindow.Node;
  global.Element = browserWindow.Element;
  global.HTMLElement = browserWindow.HTMLElement;
  const [{ default: React }, { createRoot }, { flushSync }, vite] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-dom'),
    createServer({ root: new URL('..', import.meta.url).pathname, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true } })
  ]);
  try {
    const { DesktopQueuePanel } = await vite.ssrLoadModule('/src/QueueOverlay.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const queue = {
      instanceId: 'journey-queue',
      index: 1,
      items: ['played', 'current', 'next'].map((id) => ({ queueItemId: id, song: { id, title: id } }))
    };
    flushSync(() => root.render(React.createElement(DesktopQueuePanel, {
      onClearPlayed: () => true,
      onClearUpcoming: () => true,
      queue
    })));
    assert.match(container.textContent, /Journey order is locked\. Detach the Journey to edit this queue\./);
    const clearPlayed = container.querySelector('[aria-label="Clear played tracks"]');
    const clearUpcoming = container.querySelector('[aria-label="Clear upcoming tracks"]');
    assert.equal(clearPlayed.disabled, true);
    assert.equal(clearUpcoming.disabled, true);
    assert.equal(clearPlayed.getAttribute('aria-describedby'), clearUpcoming.getAttribute('aria-describedby'));
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});
