import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { launchCdpBrowser } from '../test-support/cdpBrowser.mjs';

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

const chrome = chromeCandidates.find((candidate) => spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0);
const cdpAvailable = Boolean(chrome && typeof WebSocket === 'function');

async function dumpDomWithBrowser(browser, fixturePath, viewport) {
  await browser.viewport(viewport.width, viewport.height, 1, false);
  await browser.goto(pathToFileURL(fixturePath).href);
  return await browser.evaluate('document.documentElement.outerHTML');
}

test('lyrics visual fixture preserves the approved split and compact bounds', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const fixturePath = new URL('../docs/evidence/m8/player-queue/fixture.html', import.meta.url).pathname;
  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await browser.viewport(viewport.width, viewport.height, 1, false);
      await browser.goto(`${pathToFileURL(fixturePath).href}?view=lyrics`);
      const result = JSON.parse(await browser.evaluate(`JSON.stringify((() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
        const overlay = rect('.lyrics-overlay');
        const panel = rect('.player-panel');
        const scroll = rect('.lyrics-scroll');
        const actions = rect('.lyrics-header-actions');
        const active = rect('.lyrics-lines .current');
        return { overlay, panel, scroll, actions, active, viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.querySelector('.lyrics-scroll').scrollWidth, clientWidth: document.querySelector('.lyrics-scroll').clientWidth };
      })())`));
      assert.ok(result.overlay.left >= 0 && result.overlay.right <= result.viewport.width);
      assert.ok(result.overlay.top >= 0 && result.overlay.bottom <= result.viewport.height);
      assert.ok(result.actions.left >= result.overlay.left && result.actions.right <= result.overlay.right);
      assert.ok(result.active.left >= result.scroll.left && result.active.right <= result.scroll.right);
      assert.equal(result.scrollWidth, result.clientWidth, `lyrics overflowed horizontally at ${viewport.width}px`);
      if (viewport.width >= 900) assert.ok(Math.abs(result.overlay.left - (result.panel.left + result.panel.width / 2)) <= 1);
      else assert.equal(result.overlay.left, 0);
    }
  } finally {
    await browser?.close();
  }
});

test('rendered shelves own their columns and retain visible focus targets', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-layout-'));
  const fixturePath = path.join(tempDir, 'shelves.html');
  const shelf = (classes, count) => `<div class="${classes}" data-shelf>${Array.from({ length: count }, (_, index) => `<button type="button">Item ${index + 1}</button>`).join('')}</div>`;
  const fixture = `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <style>
      /* Adversarial late declarations reproduce the source-order mechanism from #78. */
      .album-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .mix-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .smart-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .radio-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .wave-picks { grid-template-columns: 1fr; }
    </style>
    <main>
      ${shelf('album-row shelf-row', 6)}
      ${shelf('album-row shelf-row', 3)}
      ${shelf('mix-grid shelf-row', 6)}
      ${shelf('smart-grid shelf-row', 4)}
      ${shelf('radio-grid shelf-row', 4)}
      ${shelf('wave-picks shelf-row', 4)}
    </main>
    <script>
      const results = [...document.querySelectorAll('[data-shelf]')].map((shelf) => {
        const columns = getComputedStyle(shelf).gridTemplateColumns;
        const targets = [...shelf.querySelectorAll('button')].map((button) => {
          button.focus();
          const rect = button.getBoundingClientRect();
          return { focused: document.activeElement === button, width: rect.width, height: rect.height };
        });
        const computed = getComputedStyle(shelf);
        return { classes: shelf.className, columns, autoColumns: computed.gridAutoColumns, flow: computed.gridAutoFlow, paddingBottom: computed.paddingBottom, targets };
      });
      document.body.dataset.shelfResults = encodeURIComponent(JSON.stringify(results));
    </script>`;

  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    await writeFile(fixturePath, fixture);
    for (const viewport of [
      { width: 768, height: 768, shelfColumns: 'minmax(210px, 38%)', albumColumns: 'minmax(150px, 26%)', paddingBottom: '6px' },
      { width: 1024, height: 768, shelfColumns: 'minmax(230px, 23%)', albumColumns: 'minmax(176px, 16%)', paddingBottom: '10px' }
    ]) {
      const dom = await dumpDomWithBrowser(browser, fixturePath, viewport);
      const encoded = dom.match(/data-shelf-results="([^"]+)"/)?.[1];
      assert.ok(encoded, `browser fixture did not publish shelf results at ${viewport.width}px`);
      const results = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));

      assert.equal(results.length, 6);
      for (const result of results) {
        assert.ok(result.targets.length > 0);
        assert.equal(result.flow, 'column');
        assert.equal(result.autoColumns, result.classes.includes('album-row') ? viewport.albumColumns : viewport.shelfColumns);
        assert.equal(result.paddingBottom, viewport.paddingBottom);
        assert.equal(result.columns.trim().split(/\s+/).length, result.targets.length, `${result.classes} did not render one visible column per item at ${viewport.width}px`);
        assert.doesNotMatch(result.columns, /(^|\s)0px($|\s)/, `${result.classes} created a zero-width track at ${viewport.width}px`);
        assert.ok(result.targets.every((target) => target.focused && target.width > 0 && target.height > 0), `${result.classes} contains an invisible focus target at ${viewport.width}px`);
      }
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('responsive shell keeps navigation, library, capped content, and missing art intentional', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-responsive-shell-'));
  const fixturePath = path.join(tempDir, 'shell.html');
  const fixture = `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <main class="app-shell">
      <section class="phone-frame">
        <section class="screen-surface">
          <header class="screen-header"><h1>Library</h1></header>
          <div class="library-collection grid">${Array.from({ length: 10 }, (_, index) => `<button class="library-card" type="button"><span class="album-cover artwork-shell"><img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='1200'%3E%3Cpath fill='%23${index % 2 ? 'b84432' : '345c78'}' d='M0 0h900v1200H0z'/%3E%3C/svg%3E"></span><div><h3>Album ${index + 1} with an intentionally unbroken title that must not widen its grid track</h3><p>An artist with a long display name</p></div><svg width="20" height="20"></svg></button>`).join('')}</div>
          <article class="mix-card artist-radio-card sage">
            <span class="mix-image artwork-shell" data-missing-art><svg width="42" height="42"></svg></span>
            <h2>Missing artwork radio</h2>
          </article>
        </section>
        <nav class="tabbar" aria-label="Primary">
          ${['Home', 'Library', 'Search', 'Sonic', 'Settings'].map((label) => `<button type="button"><svg width="24" height="24"></svg><span>${label}</span></button>`).join('')}
        </nav>
      </section>
    </main>
    <script>
      const rect = (element) => element.getBoundingClientRect().toJSON();
      const surface = document.querySelector('.screen-surface');
      const header = document.querySelector('.screen-header');
      const rail = document.querySelector('.tabbar');
      const buttons = [...rail.querySelectorAll('button')];
      const grid = document.querySelector('.library-collection.grid');
      const cards = [...grid.children];
      const missingArt = document.querySelector('[data-missing-art]');
      const missingArtStyle = getComputedStyle(missingArt);
      document.body.dataset.shellResults = encodeURIComponent(JSON.stringify({
        viewport: { width: innerWidth, height: innerHeight },
        surface: rect(surface),
        surfacePaddingLeft: Number.parseFloat(getComputedStyle(surface).paddingLeft),
        header: rect(header),
        rail: rect(rail),
        firstNav: rect(buttons[0]),
        settingsNav: rect(buttons.at(-1)),
        grid: rect(grid),
        gridColumns: getComputedStyle(grid).gridTemplateColumns,
        cardRects: cards.map(rect),
        coverRects: cards.map((card) => rect(card.querySelector('.album-cover'))),
        missingArt: rect(missingArt),
        missingArtBackground: missingArtStyle.backgroundImage,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth
      }));
    </script>`;

  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    await writeFile(fixturePath, fixture);
    for (const viewport of [
      { width: 768, height: 1024, kind: 'tablet' },
      { width: 844, height: 390, kind: 'short-tablet' },
      { width: 1440, height: 900, kind: 'desktop' },
      { width: 2560, height: 1440, kind: 'ultrawide' }
    ]) {
      const dom = await dumpDomWithBrowser(browser, fixturePath, viewport);
      const encoded = dom.match(/data-shell-results="([^"]+)"/)?.[1];
      assert.ok(encoded, `browser fixture did not publish shell results at ${viewport.width}x${viewport.height}`);
      const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));

      assert.equal(result.documentScrollWidth, result.documentClientWidth, `shell overflowed at ${viewport.width}x${viewport.height}`);
      assert.ok(result.header.left >= result.rail.right + 20, `content overlapped the navigation rail at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
      assert.ok(result.cardRects.every((card) => card.width >= 150 && card.width <= 320), `library cards left readable bounds at ${viewport.width}x${viewport.height}: ${JSON.stringify(result.cardRects)}`);
      assert.ok(result.coverRects.every((cover, index) => Math.abs(cover.width - cover.height) <= 1 && cover.width <= result.cardRects[index].width), `library covers escaped their square grid cells at ${viewport.width}x${viewport.height}: ${JSON.stringify({ cards: result.cardRects, covers: result.coverRects })}`);
      assert.ok(result.cardRects.every((card, index) => index === 0 || card.left >= result.cardRects[index - 1].right || card.top > result.cardRects[index - 1].top), `library cards overlapped at ${viewport.width}x${viewport.height}: ${JSON.stringify(result.cardRects)}`);
      assert.ok(result.gridColumns.trim().split(/\s+/).length >= 3, `library grid did not derive enough columns at ${viewport.width}x${viewport.height}: ${result.gridColumns}`);
      assert.ok(result.missingArt.width > 0 && Math.abs(result.missingArt.width - result.missingArt.height) <= 1, `missing art lost square geometry at ${viewport.width}x${viewport.height}`);
      assert.notEqual(result.missingArtBackground, 'none', `missing art remained transparent at ${viewport.width}x${viewport.height}`);

      if (viewport.kind === 'tablet' || viewport.kind === 'short-tablet') {
        assert.ok(result.rail.height < 320, `tablet navigation still rendered as a full-height pill at ${viewport.width}x${viewport.height}: ${result.rail.height}`);
        assert.ok(result.firstNav.top < result.settingsNav.top && result.settingsNav.bottom <= result.rail.bottom, `tablet navigation controls escaped their compact frame at ${viewport.width}x${viewport.height}`);
      }

      if (viewport.kind === 'desktop' || viewport.kind === 'ultrawide') {
        assert.ok(result.settingsNav.bottom >= result.rail.bottom - 20, `Settings was not pinned to the desktop sidebar bottom at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
      }

      if (viewport.kind === 'ultrawide') {
        const leftGutter = result.header.left - result.rail.right;
        const rightGutter = result.viewport.width - result.header.right;
        assert.ok(Math.abs(leftGutter - rightGutter) <= 16, `capped ultrawide content was not centered beside the sidebar: ${JSON.stringify({ leftGutter, rightGutter })}`);
        assert.ok(result.header.width <= 1700, `ultrawide content exceeded its cap beyond browser rounding tolerance: ${result.header.width}`);
      }
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('native desktop shell keeps a compact-to-wide rail, bottom transport, and contextual inspector', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-m3-shell-'));
  const fixturePath = path.join(tempDir, 'm3-shell.html');
  const fixture = `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <main class="app-shell">
      <section class="phone-frame has-mini-player">
        <div class="native-desktop-shell has-inspector has-player" data-active-surface="home">
          <aside class="desktop-rail" aria-label="NaviMuse">
            <header class="desktop-brand"><span class="desktop-brand-mark">NM</span><span class="desktop-brand-copy"><h1>NaviMuse</h1><small>Your signal</small></span></header>
            <nav class="tabbar" aria-label="Primary">
              ${['Home', 'Library', 'Search', 'Sonic', 'Settings'].map((label, index) => `<button class="${index === 0 ? 'active' : ''}" type="button"><svg width="24" height="24"></svg><span>${label}</span></button>`).join('')}
            </nav>
          </aside>
          <section class="desktop-surface" aria-label="Home surface">
            <section class="home-surface">
              <header class="dashboard-hero"><div><p>All Music</p><h1>Listen</h1></div></header>
              <section class="continue-listening"><span class="continue-art artwork-shell"></span><div class="continue-copy"><p>Continue listening</p><h2>Current track</h2><span>Artist · Album</span></div><div class="continue-actions"><button>Play</button><button>Queue</button></div><ol class="continue-up-next"><li><span>1</span><strong>Next track</strong></li></ol></section>
            </section>
          </section>
          <aside class="desktop-inspector" aria-label="Playback queue inspector">
            <section class="desktop-queue-panel"><header><div><p>Up Next</p><h2>Queue</h2></div><span>1 upcoming</span></header><ol class="desktop-queue-list"><li><button><span class="queue-position">1</span><span class="queue-track-copy"><strong>Next track</strong><span>Artist</span></span></button></li></ol></section>
          </aside>
          <footer class="desktop-player-zone" aria-label="Now playing">
            <div class="mini-player"><button class="mini-hit"><span class="artwork-shell"></span><div class="mini-copy"><strong>Current track</strong><span>Artist</span></div><div class="mini-progress"></div></button><div class="mini-transport"><button>Previous</button><button class="mini-pause">Play</button><button>Next</button></div><div class="mini-tools"><span class="mini-time">0:10 / 3:00</span><button class="progress-rail"></button><div class="mini-secondary-controls"><button>Favorite</button></div><label class="mini-volume"><input type="range"></label><button class="mini-queue">Queue</button></div></div>
          </footer>
        </div>
        <div class="native-desktop-shell" data-bare-shell>
          <aside class="desktop-rail"></aside>
          <section class="desktop-surface"></section>
        </div>
      </section>
    </main>
    <script>
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      const shell = document.querySelector('.native-desktop-shell');
      const withInspectorColumns = getComputedStyle(shell).gridTemplateColumns;
      const withInspectorDisplay = style('.desktop-inspector').display;
      shell.classList.remove('has-inspector');
      const withoutInspectorColumns = getComputedStyle(shell).gridTemplateColumns;
      const withoutInspectorDisplay = style('.desktop-inspector').display;
      shell.classList.add('has-inspector');
      const bareShell = document.querySelector('[data-bare-shell]');
      document.body.dataset.m3ShellResults = encodeURIComponent(JSON.stringify({
        viewport: { width: innerWidth, height: innerHeight },
        shellDisplay: style('.native-desktop-shell').display,
        shellColumns: withInspectorColumns,
        withInspectorDisplay,
        withoutInspectorColumns,
        withoutInspectorDisplay,
        bareShellColumns: getComputedStyle(bareShell).gridTemplateColumns,
        bareShellRows: getComputedStyle(bareShell).gridTemplateRows,
        bareShellChildren: bareShell.children.length,
        brandDisplay: style('.desktop-brand').display,
        brandCopyDisplay: style('.desktop-brand > span:last-child').display,
        inspectorDisplay: style('.desktop-inspector').display,
        queueDisplay: style('.desktop-queue-panel').display,
        rail: rect('.desktop-rail'),
        surface: rect('.desktop-surface'),
        player: rect('.desktop-player-zone'),
        mini: rect('.mini-player'),
        tabbar: rect('.tabbar'),
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth
      }));
    </script>`;

  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    await writeFile(fixturePath, fixture);
    for (const viewport of [
      { width: 390, height: 844, kind: 'phone' },
      { width: 744, height: 900, kind: 'compact-desktop' },
      { width: 1080, height: 900, kind: 'standard-desktop' },
      { width: 1440, height: 900, kind: 'wide-desktop' }
    ]) {
      const dom = await dumpDomWithBrowser(browser, fixturePath, viewport);
      const encoded = dom.match(/data-m3-shell-results="([^"]+)"/)?.[1];
      assert.ok(encoded, `M3 shell fixture did not publish results at ${viewport.width}x${viewport.height}`);
      const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
      assert.equal(result.documentScrollWidth, result.documentClientWidth, `M3 shell overflowed at ${viewport.width}x${viewport.height}`);

      if (viewport.kind === 'phone') {
        assert.equal(result.shellDisplay, 'contents');
        assert.equal(result.brandDisplay, 'none');
        assert.equal(result.inspectorDisplay, 'none');
        assert.equal(result.queueDisplay, 'none');
        assert.ok(result.tabbar.bottom <= viewport.height, `compact tabbar escaped viewport: ${JSON.stringify(result.tabbar)}`);
      } else if (viewport.kind === 'compact-desktop') {
        assert.equal(result.bareShellChildren, 2);
        assert.ok(result.bareShellColumns.includes('76px') && !result.bareShellColumns.includes('336px'), `bare compact shell reserved an optional column: ${result.bareShellColumns}`);
        assert.ok(result.bareShellRows.endsWith(' 0px'), `bare compact shell reserved a transport row: ${result.bareShellRows}`);
        assert.equal(result.shellDisplay, 'grid');
        assert.equal(result.brandDisplay, 'grid');
        assert.equal(result.brandCopyDisplay, 'none');
        assert.equal(result.inspectorDisplay, 'none');
        assert.equal(result.withInspectorDisplay, 'none');
        assert.equal(result.withoutInspectorDisplay, 'none');
        assert.ok(result.shellColumns.includes('76px'), `compact desktop shell lost 76px rail: ${result.shellColumns}`);
        assert.ok(result.surface.left >= result.rail.right, `desktop surface overlapped rail: ${JSON.stringify(result)}`);
        assert.ok(result.player.top >= result.surface.bottom - 1, `compact desktop transport was not below content: ${JSON.stringify(result)}`);
        assert.ok(result.player.width >= viewport.width - 1, `compact desktop transport did not span the window: ${JSON.stringify(result)}`);
      } else if (viewport.kind === 'standard-desktop') {
        assert.ok(result.bareShellColumns.includes('208px') && !result.bareShellColumns.includes('336px'), `bare standard shell reserved an optional column: ${result.bareShellColumns}`);
        assert.ok(result.bareShellRows.endsWith(' 0px'), `bare standard shell reserved a transport row: ${result.bareShellRows}`);
        assert.equal(result.brandCopyDisplay, 'block');
        assert.equal(result.inspectorDisplay, 'none');
        assert.equal(result.withInspectorDisplay, 'none');
        assert.equal(result.withoutInspectorDisplay, 'none');
        assert.ok(result.shellColumns.includes('208px'), `standard desktop shell lost 208px rail: ${result.shellColumns}`);
        assert.ok(result.player.top >= result.surface.bottom - 1, `standard desktop transport was not below content: ${JSON.stringify(result)}`);
      } else {
        assert.ok(result.bareShellColumns.includes('208px') && !result.bareShellColumns.includes('336px'), `bare wide shell reserved an optional column: ${result.bareShellColumns}`);
        assert.ok(result.bareShellRows.endsWith(' 0px'), `bare wide shell reserved a transport row: ${result.bareShellRows}`);
        assert.equal(result.brandCopyDisplay, 'block');
        assert.equal(result.inspectorDisplay, 'block');
        assert.equal(result.withInspectorDisplay, 'block');
        assert.equal(result.withoutInspectorDisplay, 'none');
        assert.equal(result.queueDisplay, 'grid');
        assert.ok(result.shellColumns.includes('208px') && result.shellColumns.includes('336px'), `wide shell lost rail or inspector: ${result.shellColumns}`);
        assert.ok(!result.withoutInspectorColumns?.includes('336px') && !result.withoutInspectorColumns.includes('336px'), `empty inspector still reserved a column: ${result.withoutInspectorColumns}`);
        assert.ok(result.player.top >= result.surface.bottom - 1, `wide desktop transport was not below content: ${JSON.stringify(result)}`);
        assert.ok(result.player.width >= viewport.width - 1, `wide desktop transport did not span the window: ${JSON.stringify(result)}`);
      }
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('mini player controls stay fixed when metadata is extremely long', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-player-layout-'));
  const fixturePath = path.join(tempDir, 'player.html');
  const fixture = (compact) => `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <main class="phone-frame${compact ? ' mini-player-compact' : ''}">
      <div class="mini-player">
        <button class="mini-hit" type="button" aria-label="Open now playing: Track by Artist"><span></span><div class="mini-copy"><strong title="Track">Track</strong><span title="Artist">Artist</span></div><span class="mini-progress">decorative</span></button>
        <div class="mini-transport"><button class="mini-previous">Previous</button><button class="mini-pause">Play</button><button class="mini-next">Next</button></div>
        <div class="mini-tools"><span class="mini-time">1:00 / 3:00</span><button class="progress-rail" aria-label="Seek"></button><div class="mini-secondary-controls"><button class="mini-favorite" aria-label="Favorite"><svg width="18" height="18"></svg></button><button class="mini-shuffle" aria-label="Shuffle"><svg width="18" height="18"></svg></button><button class="mini-repeat" aria-label="Repeat"><svg width="18" height="18"></svg></button></div><label class="mini-volume"><span></span><input type="range"></label><button class="mini-queue" aria-label="Queue"><svg width="18" height="18"></svg></button></div>
      </div>
    </main>
    <script>
      const display = (selector) => getComputedStyle(document.querySelector(selector)).display;
      const player = document.querySelector('.mini-player');
      const title = document.querySelector('.mini-copy strong');
      const artist = document.querySelector('.mini-copy > span');
      const selectors = ['.mini-previous', '.mini-pause', '.mini-next', '.progress-rail', '.mini-favorite', '.mini-shuffle', '.mini-repeat', '.mini-volume', '.mini-queue'];
      const textStyle = (element) => {
        const computed = getComputedStyle(element);
        return { overflow: computed.overflow, textOverflow: computed.textOverflow, whiteSpace: computed.whiteSpace };
      };
      const capture = () => ({
        controls: Object.fromEntries(selectors.map((selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return [selector, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }];
        })),
        playerClientWidth: player.clientWidth,
        playerScrollWidth: player.scrollWidth,
        titleClientWidth: title.clientWidth,
        titleScrollWidth: title.scrollWidth,
        artistClientWidth: artist.clientWidth,
        artistScrollWidth: artist.scrollWidth
      });
      const short = capture();
      title.textContent = 'A '.repeat(300) + 'final title';
      artist.textContent = 'An exceptionally long artist and conversation attribution '.repeat(40);
      title.title = title.textContent;
      artist.title = artist.textContent;
      document.querySelector('.mini-hit').setAttribute('aria-label', 'Open now playing: ' + title.textContent.slice(0, 119) + '… by ' + artist.textContent.slice(0, 119) + '…');
      const long = capture();
      const hitColumns = getComputedStyle(document.querySelector('.mini-hit')).gridTemplateColumns.trim().split(/\\s+/).length;
      document.body.dataset.playerResults = encodeURIComponent(JSON.stringify({
        transport: display('.mini-transport'), previous: display('.mini-previous'), next: display('.mini-next'),
        tools: display('.mini-tools'), time: display('.mini-time'), secondary: display('.mini-secondary-controls'), volume: display('.mini-volume'), queue: display('.mini-queue'),
        decorative: display('.mini-progress'), hitColumns,
        short, long,
        accessibleTitle: title.title,
        accessibleArtist: artist.title,
        accessibleName: document.querySelector('.mini-hit').getAttribute('aria-label'),
        titleStyle: textStyle(title),
        artistStyle: textStyle(artist)
      }));
    </script>`;

  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    for (const compact of [false, true]) {
      await writeFile(fixturePath, fixture(compact));
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 600, height: 900 },
        { width: 640, height: 900 },
        { width: 685, height: 900 },
        { width: 699, height: 900 },
        { width: 700, height: 900 },
        { width: 705, height: 900 },
        { width: 710, height: 900 },
        { width: 715, height: 900 },
        { width: 716, height: 900 },
        { width: 720, height: 900 },
        { width: 768, height: 1024 },
        { width: 850, height: 900 },
        { width: 900, height: 620 },
        { width: 949, height: 700 },
        { width: 1049, height: 700 },
        { width: 1200, height: 700 },
        { width: 1464, height: 736 }
      ]) {
        const dom = await dumpDomWithBrowser(browser, fixturePath, viewport);
        const encoded = dom.match(/data-player-results="([^"]+)"/)?.[1];
        assert.ok(encoded, `browser fixture did not publish desktop player results at ${viewport.width}x${viewport.height}`);
        const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
        for (const selector of Object.keys(result.short.controls)) {
          assert.deepEqual(result.long.controls[selector], result.short.controls[selector], `${selector} shifted with long metadata at ${viewport.width}x${viewport.height}`);
        }
        assert.equal(result.long.playerScrollWidth, result.short.playerScrollWidth, `long metadata added player overflow at ${viewport.width}x${viewport.height}`);
        assert.ok(result.long.playerScrollWidth <= result.long.playerClientWidth, `mini player overflowed at ${viewport.width}x${viewport.height}: ${result.long.playerScrollWidth} > ${result.long.playerClientWidth}; ${JSON.stringify(result.long.controls)}`);
        assert.ok(result.long.titleScrollWidth > result.long.titleClientWidth, `long title did not truncate at ${viewport.width}x${viewport.height}`);
        assert.ok(result.long.artistScrollWidth > result.long.artistClientWidth, `long artist did not truncate at ${viewport.width}x${viewport.height}`);
        assert.deepEqual(result.titleStyle, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
        assert.deepEqual(result.artistStyle, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
        assert.match(result.accessibleTitle, /final title$/);
        assert.match(result.accessibleArtist, /^An exceptionally long/);
        assert.match(result.accessibleName, /^Open now playing:/);
        assert.ok(result.accessibleName.length <= 270, `accessible name was unbounded at ${viewport.width}x${viewport.height}`);
        if (viewport.width >= 600) {
          assert.equal(result.transport, 'flex');
          assert.equal(result.previous, 'grid');
          assert.equal(result.next, 'grid');
          assert.equal(result.tools, 'grid');
          assert.equal(result.time, viewport.width <= 715 ? 'none' : 'block');
          assert.equal(result.secondary, 'flex');
          assert.equal(result.volume, viewport.width <= 715 ? 'none' : 'grid');
          assert.equal(result.queue, 'grid');
          assert.equal(result.decorative, viewport.width < 900 && compact ? 'block' : 'none');
          assert.equal(result.hitColumns, viewport.width < 900 && compact ? 3 : 2);
        }
      }
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('expanded player keeps essential controls inside short phone portrait viewports', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const dynamicPhoneFrameRule = styles.match(/\.phone-frame \{[^}]*height: 100dvh;[^}]*min-height: 100svh;[^}]*\}/);
  assert.ok(dynamicPhoneFrameRule, 'phone frame must use dynamic and small viewport units');
  const enclosingMedia = styles.lastIndexOf('@media', dynamicPhoneFrameRule.index);
  assert.equal(styles.slice(enclosingMedia, styles.indexOf('{', enclosingMedia)).trim(), '@media (max-width: 599px)', 'dynamic phone frame sizing must stay inside the phone breakpoint');
  const shortPortraitRule = styles.indexOf('@media (max-width: 599px) and (orientation: portrait) and (max-height: 1000px)');
  assert.ok(shortPortraitRule > styles.indexOf('@media (max-height: 760px)'), 'short portrait rule must follow the general short-height rule');
  assert.ok(shortPortraitRule > styles.indexOf('@media (max-width: 420px)'), 'short portrait rule must follow the narrow-phone rule');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-expanded-player-'));
  const fixturePath = path.join(tempDir, 'expanded-player.html');
  const fixture = `<!doctype html>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <style>${styles}</style>
    <main class="app-shell"><div class="phone-frame"><div class="player-sheet open">
    <section class="player-panel" aria-label="Now playing" style="transform:none">
      <div class="player-content">
      <button class="grabber" type="button"></button>
      <div class="player-topline"><div class="player-topline-tools"><button></button><button></button><button></button></div><button></button></div>
      <div class="art-stage"><div class="cover-art"></div></div>
      <div class="track-copy"><h1>My Place Among the Stones</h1><p class="artist">The Milk Carton Kids</p><p>Lost Cause Lover Fool</p></div>
      <div class="wave-row"><span>2:16</span><div class="waveform"></div><span>-0:37</span></div>
      <div class="quality-row"><span>FLAC</span><span>2652 kbps</span><span>Navidrome</span></div>
      <div class="rating-row"><button><svg width="26" height="26"></svg></button><div>${'<button class="rating-star"><svg width="26" height="26"></svg></button>'.repeat(5)}</div><div class="player-actions-anchor"><button><svg width="26" height="26"></svg></button></div></div>
      <div class="transport"><button></button><button></button><button class="play-button"></button><button></button><button></button></div>
      <div class="sonic-strip"><span>Warm</span></div>
      </div>
    </section>
    </div></div></main>`;

  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    await writeFile(fixturePath, fixture);
    for (const viewport of [
      { width: 320, height: 568, compact: true },
      { width: 360, height: 640, compact: true },
      { width: 393, height: 659 },
      { width: 402, height: 680 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 393, height: 874 },
      { width: 500, height: 820 },
      { width: 599, height: 820 },
      { width: 430, height: 932, compact: true },
      { width: 440, height: 956, compact: true },
      { width: 430, height: 1001, compact: false }
    ]) {
      const compact = viewport.compact ?? true;
      await browser.viewport(viewport.width, viewport.height, 3);
      await browser.goto(pathToFileURL(fixturePath).href);
      const result = await browser.evaluate(`(() => {
        const panel = document.querySelector('.player-panel');
        const frame = document.querySelector('.phone-frame');
        const transport = document.querySelector('.transport');
        const art = document.querySelector('.art-stage');
        const panelRect = panel.getBoundingClientRect();
        const transportRect = transport.getBoundingClientRect();
        return {
          innerWidth,
          innerHeight,
          frameHeight: frame.getBoundingClientRect().height,
          mediaMatches: matchMedia('(max-width:599px) and (orientation:portrait) and (max-height:1000px)').matches,
          panelClientHeight: panel.clientHeight,
          panelScrollHeight: panel.scrollHeight,
          overflowY: getComputedStyle(panel).overflowY,
          artWidth: art.getBoundingClientRect().width,
          sonicDisplay: getComputedStyle(document.querySelector('.sonic-strip')).display,
          starSizes: [...document.querySelectorAll('.rating-star')].map((star) => star.getBoundingClientRect().width),
          ratingClientWidth: document.querySelector('.rating-row').clientWidth,
          ratingScrollWidth: document.querySelector('.rating-row').scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          transportTop: transportRect.top,
          transportBottom: transportRect.bottom,
          panelTop: panelRect.top,
          panelBottom: panelRect.bottom
        };
      })()`);
      const expectedMediaMatch = viewport.width <= 599 && viewport.height >= viewport.width && viewport.height <= 1000;
      assert.deepEqual([result.innerWidth, result.innerHeight], [viewport.width, viewport.height], 'CDP used an unexpected CSS viewport');
      assert.equal(result.frameHeight, result.innerHeight, `phone frame did not follow the dynamic viewport at ${result.innerWidth}x${result.innerHeight}`);
      assert.equal(result.mediaMatches, expectedMediaMatch, `short portrait rule mismatch at ${result.innerWidth}x${result.innerHeight}`);
      assert.ok(result.panelScrollHeight <= result.panelClientHeight + 1, `expanded player overflowed at ${result.innerWidth}x${result.innerHeight}`);
      assert.ok(result.transportTop >= result.panelTop && result.transportBottom <= result.panelBottom, `transport controls left the viewport at ${result.innerWidth}x${result.innerHeight}`);
      if (compact) assert.ok(result.artWidth <= (viewport.height >= 760 ? 360 : 300), `short viewport retained oversized ${result.artWidth}px artwork`);
      assert.equal(result.sonicDisplay === 'none', viewport.height <= 760 || viewport.width <= 420, `sonic visibility mismatch at ${result.innerWidth}x${result.innerHeight}`);
      assert.equal(result.overflowY, 'auto');
      if (compact) {
        const minimumStarSize = viewport.width >= 390 ? 44 : viewport.width >= 375 ? 42 : viewport.width >= 360 ? 40 : 35;
        assert.ok(result.starSizes.every((width) => width >= minimumStarSize), `rating targets were too small at ${result.innerWidth}x${result.innerHeight}`);
      }
      assert.equal(result.ratingScrollWidth, result.ratingClientWidth, `rating row overflowed at ${result.innerWidth}x${result.innerHeight}`);
      assert.equal(result.documentScrollWidth, result.documentClientWidth, `document overflowed at ${result.innerWidth}x${result.innerHeight}`);
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('track actions overlay stays viewport-bound without reflowing player content', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-actions-layout-'));
  const fixturePath = path.join(tempDir, 'actions.html');
  const fixture = `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <style>
      .fixture-player { position: fixed; inset: 16px; transform: translateY(0) !important; display: block !important; overflow-y: auto; }
      .fixture-leading { height: min(38vh, 260px); }
      .fixture-following { height: 180px; }
    </style>
    <section class="player-panel fixture-player">
      <div class="rating-row fixture-below">
        <button type="button">Favorite</button>
        <div><button class="rating-star" type="button">Star</button></div>
        <div class="player-actions-anchor">
          <button type="button" aria-haspopup="menu" aria-expanded="true">Actions</button>
          <div class="player-action-panel actions opens-below" role="menu" data-placement="below" aria-label="Track actions below">
            <button type="button" role="menuitem">Add Favorite</button>
            <button type="button" role="menuitem">Stop Journey</button>
            <button type="button" role="menuitem">Show Queue</button>
            <button type="button" role="menuitem">Add to Playlist...</button>
            <button type="button" role="menuitem">Share</button>
          </div>
        </div>
      </div>
      <div class="fixture-leading">Player content above actions</div>
      <div class="rating-row">
        <button type="button">Favorite</button>
        <div><button class="rating-star" type="button">Star</button></div>
        <div class="player-actions-anchor">
          <button type="button" aria-haspopup="menu" aria-expanded="true">Actions</button>
          <div class="player-action-panel actions opens-above" role="menu" data-placement="above" aria-label="Track actions above">
            <button type="button" role="menuitem">Add Favorite</button>
            <button type="button" role="menuitem">Stop Journey</button>
            <button type="button" role="menuitem">Show Queue</button>
            <button type="button" role="menuitem">Add to Playlist...</button>
            <button type="button" role="menuitem">Share</button>
          </div>
        </div>
      </div>
      <div class="fixture-following">Following content</div>
    </section>
    <script>
      const ratings = [...document.querySelectorAll('.rating-row')];
      const following = document.querySelector('.fixture-following');
      const menus = [...document.querySelectorAll('[role="menu"]')];
      const panelRect = document.querySelector('.fixture-player').getBoundingClientRect();
      const openRatings = ratings.map((rating) => rating.getBoundingClientRect());
      const openFollowing = following.getBoundingClientRect();
      const menuRects = menus.map((menu) => ({
        placement: menu.dataset.placement,
        ...menu.getBoundingClientRect().toJSON(),
        itemWidths: [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.getBoundingClientRect().width)
      }));
      menus.forEach((menu) => { menu.style.display = 'none'; });
      const closedRatings = ratings.map((rating) => rating.getBoundingClientRect());
      const closedFollowing = following.getBoundingClientRect();
      document.body.dataset.actionResults = encodeURIComponent(JSON.stringify({
        menus: menuRects,
        panel: { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        ratingStable: openRatings.every((openRating, index) => openRating.top === closedRatings[index].top && openRating.height === closedRatings[index].height),
        followingStable: openFollowing.top === closedFollowing.top,
        semantics: menus.every((menu) => menu.getAttribute('role') === 'menu'),
        itemCounts: menus.map((menu) => menu.querySelectorAll('[role="menuitem"]').length)
      }));
    </script>`;

  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    await writeFile(fixturePath, fixture);
    for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 900 }, { width: 1464, height: 736 }]) {
      const dom = await dumpDomWithBrowser(browser, fixturePath, viewport);
      const encoded = dom.match(/data-action-results="([^"]+)"/)?.[1];
      assert.ok(encoded, `browser fixture did not publish action results at ${viewport.width}x${viewport.height}`);
      const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
      assert.equal(result.ratingStable, true);
      assert.equal(result.followingStable, true);
      assert.equal(result.semantics, true);
      assert.deepEqual(result.itemCounts, [5, 5]);
      assert.deepEqual(result.menus.map((menu) => menu.placement), ['below', 'above']);
      for (const menu of result.menus) {
        assert.ok(menu.left >= 0 && menu.right <= result.viewport.width, `${menu.placement} menu escaped horizontal viewport at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
        assert.ok(menu.top >= 0 && menu.bottom <= result.viewport.height, `${menu.placement} menu escaped vertical viewport at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
        assert.ok(menu.left >= result.panel.left && menu.right <= result.panel.right, `${menu.placement} menu escaped player width at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
        assert.ok(menu.top >= result.panel.top && menu.bottom <= result.panel.bottom, `${menu.placement} menu escaped player height at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
        assert.ok(menu.itemWidths.every((width) => width >= menu.width - 18), `${menu.placement} menu items did not fill the compact action panel at ${viewport.width}x${viewport.height}: ${JSON.stringify(result)}`);
      }
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('Journey and Artist DJ actions remain distinct and reachable across responsive layouts', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-journey-actions-'));
  const fixturePath = path.join(tempDir, 'journeys.html');
  const fixture = `<!doctype html><meta charset="utf-8"><style>${styles}</style>
    <main class="phone-frame"><div class="mix-grid shelf-row artist-radio-row">
      <article class="mix-card artist-radio-card sage">
        <button class="artist-radio-primary" type="button" aria-label="Start Radiohead Journey"><span class="mix-image"></span></button>
        <h2>Radiohead Journey</h2><p>Radiohead + similar artists</p>
        <button class="artist-dj" type="button" aria-label="Start Radiohead Artist DJ">Artist DJ</button>
      </article>
    </div></main>
    <script>
      const buttons = [...document.querySelectorAll('button')].map((button) => {
        button.focus(); const rect = button.getBoundingClientRect();
        return { text: button.textContent.trim(), label: button.getAttribute('aria-label'), focused: document.activeElement === button, width: rect.width, height: rect.height };
      });
      document.body.dataset.journeyResults = encodeURIComponent(JSON.stringify({ buttons, nestedButtons: document.querySelectorAll('button button').length }));
    </script>`;
  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    await writeFile(fixturePath, fixture);
    for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 900 }, { width: 1464, height: 736 }]) {
      const dom = await dumpDomWithBrowser(browser, fixturePath, viewport);
      const encoded = dom.match(/data-journey-results="([^"]+)"/)?.[1];
      assert.ok(encoded, `browser fixture did not publish Journey actions at ${viewport.width}px`);
      const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
      assert.equal(result.nestedButtons, 0);
      assert.equal(result.buttons.length, 2);
      assert.equal(result.buttons[0].label, 'Start Radiohead Journey');
      assert.equal(result.buttons[1].text, 'Artist DJ');
      assert.equal(result.buttons[1].label, 'Start Radiohead Artist DJ');
      assert.ok(result.buttons.every((button) => button.focused && button.width > 0 && button.height > 0));
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('full-card queue owns the player viewport and keeps one bounded scroll surface', { skip: !cdpAvailable && 'Chrome CDP or WebSocket is unavailable' }, async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'navimuse-queue-layout-'));
  const fixturePath = path.join(tempDir, 'queue.html');
  const rows = Array.from({ length: 30 }, (_, index) => `<li><button type="button"${index === 8 ? ' class="current" aria-current="true"' : ''}><span class="queue-position">${index + 1}</span><span class="queue-track-copy"><strong>Queue track ${index + 1} with a realistically long title</strong><span>Artist ${index + 1} · Album name</span></span>${index === 8 ? '<span class="queue-current-label">Now Playing</span>' : ''}</button></li>`).join('');
  const fixture = `<!doctype html>
    <meta charset="utf-8">
    <style>${styles}</style>
    <style>.fixture-player { position: fixed; inset: 12px; transform: none !important; display: block !important; padding: 0 !important; } .fixture-tall-content { display: block !important; min-height: 1500px !important; }</style>
    <section class="player-panel queue-open fixture-player">
      <div class="player-content fixture-tall-content" inert aria-hidden="true"><button id="background-control">Player control</button></div>
      <div class="queue-overlay" role="dialog" aria-modal="true" aria-labelledby="queue-title">
        <header class="queue-overlay-header"><div><p>Playing Queue</p><h2 id="queue-title">Up Next</h2><span>30 tracks</span></div><button id="close-queue" aria-label="Close queue">Close</button></header>
        <ol class="queue-overlay-list" aria-label="Playback queue">${rows}</ol>
        <p class="queue-overlay-note">Queue note</p>
      </div>
    </section>
    <script>
      const panel = document.querySelector('.fixture-player');
      const overlay = document.querySelector('.queue-overlay');
      const list = document.querySelector('.queue-overlay-list');
      const background = document.querySelector('#background-control');
      panel.style.overflowY = 'auto';
      panel.scrollTop = 300;
      const preOpenScrollTop = panel.scrollTop;
      panel.scrollTop = 0;
      panel.style.overflowY = '';
      const panelRect = panel.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      background.focus();
      document.body.dataset.queueResults = encodeURIComponent(JSON.stringify({
        panel: panelRect.toJSON(), overlay: overlayRect.toJSON(),
        panelClientLeft: panel.clientLeft, panelClientTop: panel.clientTop,
        panelClientWidth: panel.clientWidth, panelClientHeight: panel.clientHeight,
        listClientHeight: list.clientHeight, listScrollHeight: list.scrollHeight,
        panelScrollHeight: panel.scrollHeight, panelScrollTop: panel.scrollTop, preOpenScrollTop,
        panelOverflowY: getComputedStyle(panel).overflowY,
        backgroundFocused: document.activeElement === background,
        dialogRole: overlay.getAttribute('role'), modal: overlay.getAttribute('aria-modal'),
        listTag: list.tagName, itemTags: [...list.children].map((item) => item.tagName),
        rowCount: list.querySelectorAll(':scope > li > button').length,
        currentCount: list.querySelectorAll('[aria-current="true"]').length
      }));
    </script>`;

  let browser;
  try {
    browser = await launchCdpBrowser(chrome);
    await writeFile(fixturePath, fixture);
    for (const viewport of [{ width: 390, height: 844 }, { width: 800, height: 900 }, { width: 1464, height: 736 }]) {
      const dom = await dumpDomWithBrowser(browser, fixturePath, viewport);
      const encoded = dom.match(/data-queue-results="([^"]+)"/)?.[1];
      assert.ok(encoded, `browser fixture did not publish queue results at ${viewport.width}x${viewport.height}`);
      const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
      assert.equal(result.overlay.left, result.panel.left + result.panelClientLeft);
      assert.equal(result.overlay.right, result.panel.left + result.panelClientLeft + result.panelClientWidth);
      assert.equal(result.overlay.top, result.panel.top + result.panelClientTop);
      assert.equal(result.overlay.bottom, result.panel.top + result.panelClientTop + result.panelClientHeight);
      assert.ok(result.listScrollHeight > result.listClientHeight, `queue did not become the scroll surface at ${viewport.width}x${viewport.height}`);
      assert.ok(result.preOpenScrollTop > 0, `fixture did not establish a scrolled player at ${viewport.width}x${viewport.height}`);
      assert.equal(result.panelScrollTop, 0, `queue did not reset the player scroll position at ${viewport.width}x${viewport.height}`);
      assert.equal(result.panelOverflowY, 'hidden');
      assert.equal(result.backgroundFocused, false);
      assert.equal(result.dialogRole, 'dialog');
      assert.equal(result.modal, 'true');
      assert.equal(result.listTag, 'OL');
      assert.ok(result.itemTags.every((tag) => tag === 'LI'));
      assert.equal(result.rowCount, 30);
      assert.equal(result.currentCount, 1);
    }
  } finally {
    await browser?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
