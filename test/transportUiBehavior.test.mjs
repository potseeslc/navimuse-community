import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test('mini player exposes one live transport announcement and visible recovery state', async () => {
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
    const { MiniPlayer } = await vite.ssrLoadModule('/src/playerChrome.jsx');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(React.createElement(MiniPlayer, {
      controls: { shuffle: false, repeat: false },
      isPlaying: false,
      nowPlaying: { id: 'track-1', title: 'Midnight Signal', artist: 'Luna Harbor' },
      playbackState: { currentTime: 138, duration: 289, canSeek: true },
      playHistoryCount: 0,
      queue: { index: 0, items: [{ song: { id: 'track-1' } }] },
      trackFeedback: { favorite: false, rating: 0 },
      transportMessage: 'Reconnecting playback…',
      transportStatus: 'recovering',
      volume: 0.7,
      onVolumeChange: () => {}
    })));

    const liveRegions = container.querySelectorAll('[role="status"][aria-live="polite"]');
    assert.equal(liveRegions.length, 1);
    assert.equal(liveRegions[0].textContent.trim(), 'Reconnecting playback…');
    assert.equal(liveRegions[0].classList.contains('transport-state-recovering'), true);
    assert.equal(container.querySelector('[aria-label="Play"]') !== null, true);
    flushSync(() => root.unmount());
  } finally {
    await vite.close();
    browserWindow.close();
  }
});
