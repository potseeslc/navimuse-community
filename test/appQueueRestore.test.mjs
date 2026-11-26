import { Window } from "happy-dom";
import { createServer } from "vite";
import test from "node:test";
import assert from "node:assert/strict";

test("App repairs restored missing tracks paused without overriding a later playback choice", async () => {
  const w = new Window({ url: "http://localhost/?view=home" });
  for (const k of [
    "window",
    "document",
    "Node",
    "Element",
    "HTMLElement",
    "HTMLCanvasElement",
    "ResizeObserver",
    "CustomEvent",
  ])
    globalThis[k] = k === "window" ? w : w[k];
  Object.defineProperty(globalThis, "navigator", {
    value: w.navigator,
    configurable: true,
  });
  const saved = {version:1,items:['missing','available'].map(id=>({song:{id,title:id,duration:100}})),index:0,position:35,timestamp:1,controls:{shuffle:false,repeat:false,pauseAfterCurrent:false},shufflePool:[1],playHistory:[]};
  w.localStorage.setItem(`queue-scope-v1:${'a'.repeat(64)}:navimuse.queue.v1`, JSON.stringify(saved));
  let scope = `queue-scope-v1:${'a'.repeat(64)}`;
  let pendingResolve;
  let defer = false;
  let deferSession = false;
  let resolveSession;
  let authenticated = true;
  globalThis.fetch = async (input) => {
    const u = String(input);
    let body = {};
    if (deferSession && u.includes('/settings/session')) {
      const payload = {adminConfigured: true, authenticated, queueScope: scope};
      return new Promise(resolve => { resolveSession = () => resolve(Response.json(payload)); });
    }
    if(u.includes('/songs/')) {
      if(defer && u.endsWith('/missing')) await new Promise(resolve=>{pendingResolve=resolve;});
      const id=u.split('/').at(-1);
      return id==='missing' ? new Response('{}',{status:404}) : Response.json({song:{id,title:id,duration:100}});
    }
    if (u.includes("/settings/session"))
      body = { adminConfigured: true, authenticated, queueScope: scope };
    else if (u.endsWith("/settings"))
      body = {
        preferences: {
          playback: { transitionStyle: "smart", continueThroughQueue: false },
        },
      };
    else if (u.includes("bootstrap"))
      body = {
        musicFolders: [],
        newestAlbums: [],
        randomAlbums: [],
        frequentAlbums: [],
      };
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  };
  const mediaActions = {};
  Object.defineProperty(w.navigator, "mediaSession", {
    value: {
      setActionHandler(name, handler) {
        mediaActions[name] = handler;
      },
      setPositionState() {},
    },
    configurable: true,
  });
  const media = w.HTMLMediaElement.prototype;
  Object.defineProperties(media, {
    paused: {
      configurable: true,
      get() {
        return this._paused !== false;
      },
    },
    readyState: {
      configurable: true,
      get() {
        return this._ready || 0;
      },
    },
    duration: {
      configurable: true,
      get() {
        return 100;
      },
    },
    currentSrc: {
      configurable: true,
      get() {
        return this.src;
      },
    },
    seekable: {
      configurable: true,
      get() {
        return { length: 1, start: () => 0, end: () => 100 };
      },
    },
  });
  media.load = function () {
    this._ready = 4;
    this.currentTime = 0;
  };
  let mediaPlayCalls = 0;
  media.play = function () {
    mediaPlayCalls += 1;
    this._paused = false;
    this.dispatchEvent(new w.Event("play"));
    this.dispatchEvent(new w.Event("playing"));
    return Promise.resolve();
  };
  media.pause = function () {
    this._paused = true;
    this.dispatchEvent(new w.Event("pause"));
  };
  const vite = await createServer({
    root: process.cwd(),
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: "audit-expose",
        enforce: "pre",
        transform(code, id) {
          if (!id.endsWith("/src/main.jsx")) return;
          code = code.slice(
            0,
            code.lastIndexOf("\nif (nativeFirstPartyRedirect)"),
          );
          code = code.replace(
            "  const surfaces = {",
            `  globalThis.audit = {playAlbum, playTrack, togglePlayback, updatePlayerControls, setPlaybackState, audioRef, playQueue, transport, pendingTransitionRef, settingsRef, setSettingsState, playHistoryRef, dispatchTransport, playRequestRef, refreshSession, playerNotice};\n  const surfaces = {`,
          );
          return code + "\nexport { App };";
        },
      },
    ],
  });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const wait = () => new Promise((r) => setTimeout(r, 70));
  let root;
  try {
    const { App } = await vite.ssrLoadModule('/src/main.jsx');
    const container = document.createElement('div'); document.body.append(container);
    root = createRoot(container);
    flushSync(()=>root.render(React.createElement(App)));
    for(let i=0;i<50 && globalThis.audit.playQueue.items.length!==1;i++) await wait();
    assert.deepEqual(audit.playQueue.items.map(item=>item.song.id),['available']);
    assert.equal(audit.transport.status,'restored');
    assert.equal(mediaPlayCalls,0);
    assert.match(audit.playerNotice, /1 missing track was removed/);
    assert.equal(audit.audioRef.current.currentTime,0);
    flushSync(()=>root.unmount());
    w.localStorage.setItem(`queue-scope-v1:${'a'.repeat(64)}:navimuse.queue.v1`,JSON.stringify(saved));
    defer=true;
    root=createRoot(container);
    flushSync(()=>root.render(React.createElement(App)));
    for(let i=0;i<50 && !pendingResolve;i++) await wait();
    assert.ok(pendingResolve);
    flushSync(()=>audit.playTrack({id:'new-choice',title:'New choice',duration:100}));
    defer=false;
    pendingResolve();
    await wait();
    assert.equal(audit.playQueue.items[0].song.id,'new-choice');
    const previousAudio = audit.audioRef.current;
    scope = `queue-scope-v1:${'b'.repeat(64)}`;
    await audit.refreshSession();
    await wait();
    assert.equal(audit.playQueue.items.length, 0, 'another identity cannot load the previous queue');
    assert.equal(previousAudio.paused, true);
    assert.equal(previousAudio.getAttribute('src'), null);
    assert.ok(w.localStorage.getItem(`queue-scope-v1:${'a'.repeat(64)}:navimuse.queue.v1`));
    flushSync(()=>audit.playTrack({id:'account-b-track',title:'Account B track',duration:100}));
    await wait();
    deferSession = true;
    const staleRefresh = audit.refreshSession();
    assert.ok(resolveSession);
    deferSession = false;
    scope = `queue-scope-v1:${'c'.repeat(64)}`;
    await audit.refreshSession();
    await wait();
    assert.equal(audit.playQueue.items.length, 0);
    resolveSession();
    await staleRefresh;
    await wait();
    assert.equal(audit.playQueue.items.length, 0, 'late account B response must not restore its queue over account C');
    authenticated = false;
    scope = `queue-scope-v1:${'b'.repeat(64)}`;
    await audit.refreshSession();
    await wait();
    assert.equal(audit.playQueue.items.length, 0, 'unauthenticated payload cannot select a saved account queue');

    // Hold a repair across A -> B -> A, including an upstream that ignores abort.
    // The old A completion must not modify either account or the new A instance.
    authenticated = true;
    scope = `queue-scope-v1:${'a'.repeat(64)}`;
    w.localStorage.setItem(`${scope}:navimuse.queue.v1`, JSON.stringify(saved));
    defer = true;
    pendingResolve = null;
    await audit.refreshSession();
    for (let i=0;i<50 && !pendingResolve;i++) await wait();
    assert.ok(pendingResolve, 'account A repair is in flight');
    const finishOldRepair = pendingResolve;
    scope = `queue-scope-v1:${'b'.repeat(64)}`;
    await audit.refreshSession();
    await wait();
    flushSync(()=>audit.playTrack({id:'new-b-choice',title:'New B choice',duration:100}));
    await wait();
    defer = false;
    scope = `queue-scope-v1:${'a'.repeat(64)}`;
    const freshA = {...saved,items:[{song:{id:'fresh-a',title:'Fresh A',duration:100}}],index:0,shufflePool:[]};
    w.localStorage.setItem(`${scope}:navimuse.queue.v1`, JSON.stringify(freshA));
    await audit.refreshSession();
    await wait();
    assert.deepEqual(audit.playQueue.items.map(item=>item.song.id), ['fresh-a']);
    const queueKeys = ['a','b'].map(letter=>`queue-scope-v1:${letter.repeat(64)}:navimuse.queue.v1`);
    const beforeLateRepair = queueKeys.map(key=>w.localStorage.getItem(key));
    finishOldRepair();
    await wait();
    await wait();
    assert.deepEqual(audit.playQueue.items.map(item=>item.song.id), ['fresh-a'], 'late repair cannot alter remounted A');
    assert.deepEqual(queueKeys.map(key=>w.localStorage.getItem(key)), beforeLateRepair, 'late repair cannot write either account queue');

  } finally {
    if(root) flushSync(()=>root.unmount());
    await vite.close(); w.close();
  }
});
