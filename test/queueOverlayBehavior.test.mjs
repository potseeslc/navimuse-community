import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('rendered queue overlay focuses, traps, selects, and dismisses through real handlers', async () => {
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
    const { QueueOverlay } = await vite.ssrLoadModule('/src/QueueOverlay.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const queue = {
      index: 1,
      items: ['First', 'Current', 'Last'].map((title, index) => ({
        song: { id: `song-${index}`, title, artist: `Artist ${index}`, album: 'Album' },
        album: null
      }))
    };
    const selections = [];
    const transports = [];
    const controlChanges = [];
    let controls = { shuffle: false, pauseAfterCurrent: false };
    let closes = 0;
    let onClose = () => { closes += 1; };
    const render = (modal = true) => flushSync(() => root.render(React.createElement(QueueOverlay, {
      modal,
      controls,
      downloadState:{safetyReady:['song-2'],tracks:[{song:{id:'song-1'},state:'downloading'}]},
      canGoNext: true,
      canGoPrevious: false,
      isPlaying: true,
      onClose,
      onNext: () => transports.push('next'),
      onControlsChange: (patch) => { controlChanges.push(patch); controls = {...controls,...patch}; },
      onPrevious: () => transports.push('previous'),
      onQueueSelect: (...args) => selections.push(args),
      onToggle: () => transports.push('toggle'),
      queue,
      shufflePoolCount: 2
    })));

    render();
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));
    const close = container.querySelector('[aria-label="Close queue"]');
    const rows = [...container.querySelectorAll('.queue-overlay-list > li > button')];
    assert.equal(document.activeElement, close);
    assert.equal(container.querySelectorAll('.queue-offline-ready').length,1);
    assert.match(rows[2].textContent,/Ready offline/);
    assert.doesNotMatch(rows[1].textContent,/Ready offline/);
    assert.equal(rows.length, 3);
    assert.match(rows[0].textContent, /Show 1 played track/);
    assert.equal(rows[1].disabled, true);
    assert.equal(rows[1].getAttribute('aria-current'), 'true');
    const previous = container.querySelector('[aria-label="Previous track"]');
    const toggle = container.querySelector('[aria-label="Pause"]');
    const next = container.querySelector('[aria-label="Next track"]');
    assert.equal(previous.disabled, true);
    assert.equal(next.disabled, false);
    const pauseAfter = container.querySelector('[aria-label="Pause after current track"]');
    assert.equal(pauseAfter, null);
    controls = { ...controls, pauseAfterCurrent: true };
    render();
    assert.match(container.querySelector('[role="status"]').textContent, /pause after the current track/i);
    toggle.click();
    next.click();
    assert.deepEqual(transports, ['toggle', 'next']);

    rows[2].focus();
    onClose = () => { closes += 10; };
    render();
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));
    assert.equal(document.activeElement, rows[2]);

    const focusable = [...container.querySelectorAll('button:not([disabled])')];
    const firstFocusable = focusable[0];
    const lastFocusable = focusable.at(-1);
    firstFocusable.focus();
    firstFocusable.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, lastFocusable);
    lastFocusable.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, firstFocusable);

    rows[2].click();
    assert.equal(selections.length, 1);
    assert.equal(selections[0][0], 2);
    assert.equal(selections[0][1], queue);
    assert.deepEqual(selections[0][2], { recordHistory: true });
    flushSync(() => rows[0].click());
    assert.match(container.querySelector('.queue-overlay-history-toggle button').textContent, /Hide 1 played track/);
    assert.equal(container.querySelectorAll('.queue-overlay-list > li:not(.queue-overlay-history-toggle) button').length, 3);
    assert.equal(closes, 0);

    document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(closes, 10);
    render(false);
    assert.equal(container.querySelector('.queue-overlay').getAttribute('role'), 'region');
    assert.equal(container.querySelector('.queue-overlay').hasAttribute('aria-modal'), false);
    const end = [...container.querySelectorAll('button:not([disabled])')].at(-1);
    end.focus();
    const tab = new browserWindow.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    end.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, false, 'desktop inspector must allow Tab to reach shared controls');

    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});

test('rendered queue pause boundary exposes a cancellable pressed state', async () => {
  const browserWindow = new Window();
  global.document = browserWindow.document;
  global.window = browserWindow;
  global.Node = browserWindow.Node;
  global.Element = browserWindow.Element;
  global.HTMLElement = browserWindow.HTMLElement;
  browserWindow.requestAnimationFrame = (callback) => browserWindow.setTimeout(callback, 0);
  browserWindow.cancelAnimationFrame = (handle) => browserWindow.clearTimeout(handle);
  const [{ default: React }, { createRoot }, { flushSync }, vite] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-dom'),
    createServer({ root: new URL('..', import.meta.url).pathname, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true } })
  ]);
  try {
    const { DesktopQueuePanel } = await vite.ssrLoadModule('/src/QueueOverlay.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const changes = [];
    flushSync(() => root.render(React.createElement(DesktopQueuePanel, {
      controls: { shuffle: false, pauseAfterCurrent: true },
      onControlsChange: (patch) => changes.push(patch),
      queue: { index: 0, items: [{ song: { id: 'current', title: 'Current' } }] }
    })));
    const cancel = container.querySelector('[aria-label="Cancel pause after current track"]');
    assert.ok(cancel);
    assert.equal(cancel.getAttribute('aria-pressed'), 'true');
    assert.match(cancel.textContent, /Cancel pause/);
    flushSync(() => cancel.click());
    assert.deepEqual(changes, [{ pauseAfterCurrent: false }]);
    assert.match(container.querySelector('[role="status"]').textContent, /Canceled pause after current/i);
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});

test('large queues render incrementally', async () => {
  const browserWindow = new Window();
  global.document = browserWindow.document;
  global.window = browserWindow;
  global.Node = browserWindow.Node;
  global.Element = browserWindow.Element;
  global.HTMLElement = browserWindow.HTMLElement;
  browserWindow.requestAnimationFrame = (callback) => browserWindow.setTimeout(callback, 0);
  browserWindow.cancelAnimationFrame = (handle) => browserWindow.clearTimeout(handle);
  const [{ default: React }, { createRoot }, { flushSync }, vite] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-dom'),
    createServer({ root: new URL('..', import.meta.url).pathname, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true } })
  ]);
  try {
    const { QueueOverlay } = await vite.ssrLoadModule('/src/QueueOverlay.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const queue = { index: 0, items: Array.from({ length: 120 }, (_, index) => ({ song: { id: `large-${index}`, title: `Track ${index}`, artist: 'Artist' }, album: null })) };
    flushSync(() => root.render(React.createElement(QueueOverlay, { controls: {}, onClose: () => {}, onQueueSelect: () => {}, queue })));
    assert.equal(container.querySelectorAll('.queue-overlay-list > li:not(.queue-overlay-more) > button').length, 50);
    const more = container.querySelector('.queue-overlay-more button');
    assert.match(more.textContent, /Show 50 more tracks/);
    flushSync(() => more.click());
    assert.equal(container.querySelectorAll('.queue-overlay-list > li:not(.queue-overlay-more) > button').length, 100);
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});

test('shuffle queue keeps stable selection indices without misleading ordinals', async () => {
  const browserWindow = new Window();
  global.document = browserWindow.document;
  global.window = browserWindow;
  global.Node = browserWindow.Node;
  global.Element = browserWindow.Element;
  global.HTMLElement = browserWindow.HTMLElement;
  browserWindow.requestAnimationFrame = (callback) => browserWindow.setTimeout(callback, 0);
  browserWindow.cancelAnimationFrame = (handle) => browserWindow.clearTimeout(handle);
  const [{ default: React }, { createRoot }, { flushSync }, vite] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-dom'),
    createServer({ root: new URL('..', import.meta.url).pathname, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true } })
  ]);
  try {
    const { QueueOverlay } = await vite.ssrLoadModule('/src/QueueOverlay.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const queue = { index: 2, items: ['First', 'Second', 'Current', 'Last'].map((title, index) => ({ song: { id: `shuffle-${index}`, title, artist: 'Artist' }, album: null })) };
    const selections = [];
    flushSync(() => root.render(React.createElement(QueueOverlay, { controls: { shuffle: true }, onClose: () => {}, onQueueSelect: (...args) => selections.push(args), queue, shufflePoolCount: 3 })));
    const rows = [...container.querySelectorAll('.queue-overlay-list > li > button')];
    assert.equal(rows[0].querySelector('strong').textContent, 'Current');
    assert.deepEqual(rows.slice(1).map((row) => row.querySelector('strong').textContent), ['First', 'Second', 'Last']);
    assert.ok(rows.slice(1).every((row) => !/^\d+$/.test(row.querySelector('.queue-position').textContent.trim())));
    rows[3].click();
    assert.equal(selections[0][0], 3);
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});


test('queue notices stop promising a pause after the transport consumes it', async () => {
  const w = new Window();
  Object.assign(globalThis,{window:w,document:w.document,Node:w.Node,Element:w.Element,HTMLElement:w.HTMLElement});
  w.requestAnimationFrame = callback => w.setTimeout(callback,0);
  w.cancelAnimationFrame = handle => w.clearTimeout(handle);
  const [{default:React},{createRoot},{flushSync},vite] = await Promise.all([
    import('react'),import('react-dom/client'),import('react-dom'),
    createServer({root:new URL('..',import.meta.url).pathname,appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true}})
  ]);
  try {
    const {QueueOverlay,DesktopQueuePanel}=await vite.ssrLoadModule('/src/QueueOverlay.jsx');
    for (const Component of [QueueOverlay,DesktopQueuePanel]) {
      const container=document.createElement('div');document.body.append(container);
      const root=createRoot(container);
      try {
        let controls={pauseAfterCurrent:true},index=0;
        const render=()=>root.render(React.createElement(Component,{controls,queue:{index,items:[{song:{id:'a',title:'First'}},{song:{id:'b',title:'Second'}}]},onControlsChange:patch=>{controls={...controls,...patch};render();}}));
        flushSync(render);
        assert.match(container.querySelector('[role="status"]').textContent,/Playback will pause/);
        controls={...controls,pauseAfterCurrent:false};index=1;
        flushSync(render);
        assert.equal(container.querySelector('[aria-label="Cancel pause after current track"]'),null);
        assert.equal(container.querySelector('[role="status"]').textContent,'','consumed pause must not leave a stale promise or claim user cancellation');
      } finally {flushSync(()=>root.unmount());container.remove();}
    }
  } finally {await vite.close();w.close();}
});
