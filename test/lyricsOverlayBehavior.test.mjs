import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('lyrics inspector follows synchronized lines, allows manual escape, seeks, and stays dismissible', async () => {
  const browserWindow = new Window();
  global.document = browserWindow.document;
  global.window = browserWindow;
  global.Node = browserWindow.Node;
  global.Element = browserWindow.Element;
  global.HTMLElement = browserWindow.HTMLElement;
  browserWindow.requestAnimationFrame = (callback) => browserWindow.setTimeout(callback, 0);
  browserWindow.cancelAnimationFrame = (handle) => browserWindow.clearTimeout(handle);
  const scrolls = [];
  browserWindow.HTMLElement.prototype.scrollIntoView = () => assert.fail('follow must not scroll ancestor panels');
  browserWindow.HTMLElement.prototype.scrollTo = function(options) { scrolls.push({ text: this.querySelector('.current')?.textContent, options, className: this.className }); };

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
    const { LyricsOverlay } = await vite.ssrLoadModule('/src/LyricsOverlay.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const seeks = [];
    let queueOpens = 0;
    let closes = 0;
    flushSync(() => root.render(React.createElement(LyricsOverlay, {
      currentTime: 3.2,
      duration: 10,
      lyricsState: {
        songId: 'song-one', status: 'ready', synced: true, language: 'eng', offsetMs: 0,
        lines: [{ startMs: 1_000, value: 'First' }, { startMs: 3_000, value: 'Second' }, { startMs: 5_000, value: 'Third' }]
      },
      onClose: () => { closes += 1; },
      onOpenQueue: () => { queueOpens += 1; },
      onSeek: (ratio) => seeks.push(ratio)
    })));
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));

    assert.equal(document.activeElement.getAttribute('aria-label'), 'Close lyrics');
    const current = container.querySelector('.lyrics-lines .current');
    assert.equal(current.textContent, 'Second');
    assert.equal(current.getAttribute('aria-current'), 'true');
    assert.equal(scrolls.at(-1)?.text, 'Second', 'opening mid-track scrolls to the current line');
    assert.equal(scrolls.at(-1)?.className, 'lyrics-scroll');
    current.click();
    assert.deepEqual(seeks, [0.3]);

    const follow = [...container.querySelectorAll('button')].find((button) => /following|current line/i.test(button.textContent));
    assert.equal(follow.textContent, 'Stop following');
    container.querySelector('.lyrics-scroll').dispatchEvent(new browserWindow.WheelEvent('wheel', { bubbles: true }));
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));
    assert.equal(follow.textContent, 'Follow current line');
    flushSync(() => follow.click());
    assert.equal(follow.textContent, 'Stop following');

    const scroller = container.querySelector('.lyrics-scroll');
    flushSync(() => current.dispatchEvent(new browserWindow.PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 })));
    assert.equal(follow.textContent, 'Stop following', 'touching a lyric must not disable following');
    flushSync(() => scroller.dispatchEvent(new browserWindow.PointerEvent('pointermove', { bubbles: true, clientX: 20, clientY: 45 })));
    await new Promise((resolve) => browserWindow.setTimeout(resolve, 0));
    assert.equal(follow.textContent, 'Follow current line', 'dragging allows manual browsing');
    flushSync(() => current.click());
    assert.equal(follow.textContent, 'Stop following', 'seeking a lyric resumes following');
    flushSync(() => root.render(React.createElement(LyricsOverlay, {
      currentTime: 5.2, duration: 10,
      lyricsState: { songId: 'song-one', status: 'ready', synced: true, offsetMs: 0,
        lines: [{ startMs: 1000, value: 'First' }, { startMs: 3000, value: 'Second' }, { startMs: 5000, value: 'Third' }] },
      onClose: () => {}, onSeek: (ratio) => seeks.push(ratio)
    })));
    assert.equal(container.querySelector('.lyrics-lines .current').textContent, 'Third', 'playback advances the highlight');
    assert.equal(scrolls.at(-1)?.text, 'Third', 'playback advances scrolling');

    flushSync(() => root.render(React.createElement(LyricsOverlay, {
      currentTime: 3.2, duration: 10,
      lyricsState: { songId: 'song-two', status: 'ready', synced: true,
        lines: [{ startMs: 1_000, value: 'New first' }, { startMs: 3_000, value: 'New second' }] },
      onClose: () => { closes += 1; }, onOpenQueue: () => { queueOpens += 1; },
      onSeek: (ratio) => seeks.push(ratio)
    })));
    assert.equal(scrolls.at(-1)?.text, 'New second', 'new song follows even when the active line index is unchanged');

    container.querySelector('[role="tab"][aria-selected="false"]').click();
    assert.equal(queueOpens, 1);
    document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(closes, 1);
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});

test('plain and unavailable lyrics states remain readable without timed seek controls', async () => {
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
    const { LyricsOverlay } = await vite.ssrLoadModule('/src/LyricsOverlay.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(React.createElement(LyricsOverlay, {
      lyricsState: { songId: 'plain', status: 'ready', synced: false, lines: [{ startMs: null, value: 'Readable plain line' }] },
      onClose: () => {}
    })));
    assert.equal(container.querySelector('.lyrics-lines.plain p').textContent, 'Readable plain line');
    assert.equal(container.querySelector('.lyrics-lines button'), null);

    flushSync(() => root.render(React.createElement(LyricsOverlay, {
      modal: false,
      lyricsState: { songId: 'missing', status: 'unavailable', synced: false, lines: [] },
      onClose: () => {}
    })));
    assert.match(container.querySelector('.lyrics-state').textContent, /Playback will continue normally/);
    assert.equal(container.querySelector('.lyrics-overlay').getAttribute('role'), 'region');
    assert.equal(container.querySelector('.lyrics-overlay').hasAttribute('aria-modal'), false);
    const close = container.querySelector('[aria-label="Close lyrics"]');
    close.focus();
    const tab = new browserWindow.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, false);

    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});
