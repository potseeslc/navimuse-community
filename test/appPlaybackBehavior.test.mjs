import { Window } from "happy-dom";
import { createServer } from "vite";
import test from "node:test";
import assert from "node:assert/strict";

test("App playback respects continuation, queue selection, recovery and latest album intent", async () => {
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
  let deferHome = false;
  const homeRequests = [];
  globalThis.fetch = async (input, init) => {
    const u = String(input);
    if (deferHome && u.includes('bootstrap')) return new Promise(resolve => homeRequests.push({ url: u, signal: init?.signal, resolve }));
    let body = {};
    if (u.includes("/settings/session"))
      body = { adminConfigured: true, authenticated: true, queueScope: `queue-scope-v1:${"a".repeat(64)}` };
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
    this._loadCalls = (this._loadCalls || 0) + 1;
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
            `  globalThis.audit = {refreshNavidrome, setLibraryKey, navidrome, playAlbum, playTrack, togglePlayback, updatePlayerControls, setPlaybackState, audioRef, playQueue, transport, pendingTransitionRef, settingsRef, setSettingsState, playHistoryRef, dispatchTransport, playRequestRef, lyricsState, playerControls};\n  const surfaces = {`,
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
  const waitUntil = async predicate => { const deadline=Date.now()+3000; while(!predicate()&&Date.now()<deadline) await wait(); };
  let root;
  try {
    const { App } = await vite.ssrLoadModule("/src/main.jsx");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    flushSync(() => root.render(React.createElement(App)));
    await wait();
    await wait();
    deferHome = true;
    flushSync(() => audit.refreshNavidrome());
    flushSync(() => audit.setLibraryKey('second-library'));
    await wait();
    assert.equal(homeRequests.length, 2);
    assert.equal(homeRequests[0].signal.aborted, true);
    assert.match(homeRequests[1].url, /musicFolderId=second-library/);
    const homePayload = name => new Response(JSON.stringify({musicFolders:[],newestAlbums:[{id:name,name}],recentAlbums:[],randomAlbums:[],frequentAlbums:[]}));
    homeRequests[1].resolve(homePayload('New scope album'));
    await wait();
    homeRequests[0].resolve(homePayload('Stale scope album'));
    await wait();
    assert.equal(audit.navidrome.newestAlbums[0].id, 'New scope album');
    assert.match(container.textContent, /New scope album/);
    assert.doesNotMatch(container.textContent, /Stale scope album/);
    deferHome = false;
    const songs = ["a", "b", "c"].map((id) => ({
      id,
      title: id,
      artist: "Artist",
      albumId: id,
      duration: 100,
    }));
    flushSync(() =>
      audit.playTrack(songs[0], null, { queueSongs: songs, queueIndex: 0 }),
    );
    await wait();
    await waitUntil(()=>audit.lyricsState.status==='error'&&audit.transport.status==='playing');
    assert.equal(audit.lyricsState.status, 'error', 'malformed lyrics must not leave a permanent loading state');
    assert.equal(audit.transport.status, 'playing', 'lyrics failure must not pause playback');
    const playingQueue = audit.playQueue;
    const playingSource = audit.audioRef.current.src;
    flushSync(() => container.querySelector('[aria-label^="Open now playing:"]').click());
    assert.equal(container.querySelector('.desktop-surface').hasAttribute('inert'), true);
    flushSync(() => container.querySelector('.primary-nav-button[aria-label="Home"]').click());
    assert.equal(container.querySelector('.desktop-surface').hasAttribute('inert'), false);
    assert.equal(audit.playQueue, playingQueue);
    assert.equal(audit.audioRef.current.src, playingSource);
    assert.equal(container.querySelector('.player-sheet.open'), null);
    const audio = audit.audioRef.current;
    audio.currentTime = 75;
    flushSync(() =>
      audit.setPlaybackState({ currentTime: 75, duration: 100, canSeek: true }),
    );
    await wait();
    audio.currentTime = 97;
    flushSync(() =>
      audit.setPlaybackState({ currentTime: 97, duration: 100, canSeek: true }),
    );
    await wait();
    assert.equal(
      audit.playQueue.index,
      0,
      "disabled continuation must not fade into another track",
    );
    assert.equal(audit.pendingTransitionRef.current, null);
    flushSync(() =>
      audit.setSettingsState((state) => ({
        ...state,
        preferences: {
          ...state.preferences,
          playback: {
            ...state.preferences.playback,
            continueThroughQueue: true,
          },
        },
      })),
    );
    await wait();
    flushSync(() => {
      audit.playTrack(songs[0], null, {
        queueItems: songs.map((song, index) => ({
          song,
          provenance: index === 2 ? "explicit" : "source",
        })),
        queueIndex: 0,
      });
      audit.updatePlayerControls({ shuffle: true });
    });
    await wait();
    audit.audioRef.current.currentTime = 75;
    flushSync(() =>
      audit.setPlaybackState({ currentTime: 75, duration: 100, canSeek: true }),
    );
    await wait();
    assert.equal(
      audit.pendingTransitionRef.current?.nextIndex,
      2,
      "explicit queue addition takes priority over shuffled source tracks",
    );
    flushSync(() =>
      audit.setSettingsState((state) => ({
        ...state,
        preferences: {
          ...state.preferences,
          playback: {
            ...state.preferences.playback,
            continueThroughQueue: false,
          },
        },
      })),
    );
    await wait();
    assert.equal(
      audit.pendingTransitionRef.current,
      null,
      "disabling continuation cancels an already prepared deck",
    );
    assert.equal(audit.playQueue.index, 0);
    flushSync(() =>
      audit.setSettingsState((state) => ({
        ...state,
        preferences: {
          ...state.preferences,
          playback: {
            ...state.preferences.playback,
            continueThroughQueue: true,
          },
        },
      })),
    );
    await wait();
    audit.audioRef.current.currentTime = 97;
    flushSync(() =>
      audit.setPlaybackState({ currentTime: 97, duration: 100, canSeek: true }),
    );
    await wait();
    assert.equal(audit.playQueue.index, 2);
    assert.deepEqual(
      audit.playHistoryRef.current,
      [0],
      "prepared transition records the outgoing track exactly once",
    );

    audit.audioRef.current.currentTime = 42;
    flushSync(() =>
      audit.dispatchTransport({
        type: "error",
        requestId: audit.playRequestRef.current,
        message: "network loss",
      }),
    );
    audit.audioRef.current._paused = true;
    await wait();
    flushSync(() => audit.togglePlayback());
    await wait();
    assert.equal(
      audit.audioRef.current.currentTime,
      42,
      "retry restores the failed playback position",
    );
    // Browser metadata may apply the saved seek before the user resumes.
    // Reassigning src starts a new resource and clears that already-applied seek.
    for (const resume of [() => audit.togglePlayback(), () => mediaActions.play()]) {
      const restoredAudio = audit.audioRef.current;
      let source = restoredAudio.src;
      Object.defineProperty(restoredAudio, 'src', {
        configurable: true,
        get() { return source; },
        set(value) { source = value; this.currentTime = 0; this._ready = 0; },
      });
      try {
        restoredAudio.currentTime = 36;
        restoredAudio._ready = 4;
        restoredAudio._paused = true;
        flushSync(() => {
          audit.setPlaybackState({currentTime:36,duration:100,canSeek:true});
          audit.dispatchTransport({type:'restore',requestId:audit.playRequestRef.current});
        });
        assert.equal(audit.transport.status, 'restored');
        flushSync(resume);
        await wait();
        assert.equal(restoredAudio.currentTime, 36, 'restored Play reapplies an already-consumed saved seek after source reload');
        assert.equal(audit.transport.status, 'playing');
      } finally { delete restoredAudio.src; }
    }
    // Pause must save immediately: native Quit need not deliver pagehide, and
    // no timer is allowed to rescue this assertion. Read through the restore API.
    const { loadPersistedQueue } = await import('../src/queueStore.js');
    const { scopedQueueStorage } = await import('../src/queueStorageScope.js');
    const persistedStorage = scopedQueueStorage(w.localStorage, `queue-scope-v1:${'a'.repeat(64)}`);
    for (const pause of [() => audit.togglePlayback(), () => mediaActions.pause()]) {
      flushSync(() => mediaActions.play());
      audit.audioRef.current.currentTime = 12.875;
      const queueIds = audit.playQueue.items.map(item => item.song.id);
      const queueIndex = audit.playQueue.index;
      flushSync(pause);
      const saved = loadPersistedQueue(persistedStorage);
      assert.equal(saved.position, 12.875, 'pause saves the precise position before timer or pagehide');
      assert.deepEqual(saved.items.map(item => item.song.id), queueIds);
      assert.equal(saved.index, queueIndex);
      assert.equal(audit.audioRef.current.paused, true);
    }
    flushSync(() => mediaActions.stop());
    assert.equal(loadPersistedQueue(persistedStorage).position, 0, 'Stop persists zero rather than falling back to an older position');
    audit.audioRef.current.currentTime = 51;
    flushSync(() =>
      audit.dispatchTransport({
        type: "error",
        requestId: audit.playRequestRef.current,
        message: "network loss",
      }),
    );
    audit.audioRef.current._paused = true;
    await wait();
    flushSync(() => mediaActions.play());
    await wait();
    assert.equal(
      audit.audioRef.current.currentTime,
      51,
      "media-key Play uses the same position-preserving retry",
    );
    const playingCalls = mediaPlayCalls;
    flushSync(() => mediaActions.play());
    await wait();
    assert.equal(mediaPlayCalls, playingCalls, "repeated media Play does not initialize active audio again");
    const oldFetch = globalThis.fetch;
    const resolvers = {};
    globalThis.fetch = (input) =>
      String(input).includes("/albums/")
        ? new Promise((resolve) => {
            resolvers[String(input).split("/").at(-1)] = resolve;
          })
        : oldFetch(input);
    const pa = audit.playAlbum({ id: "old" });
    const pb = audit.playAlbum({ id: "new" });
    await wait();
    resolvers.new(
      new Response(JSON.stringify({ album: { id: "new", song: [songs[2]] } })),
    );
    await pb;
    await wait();
    resolvers.old(
      new Response(JSON.stringify({ album: { id: "old", song: [songs[0]] } })),
    );
    await pa;
    await wait();
    assert.equal(
      audit.playQueue.source.id,
      "new",
      "late old album response must not replace latest selection",
    );
    const pendingAlbum = audit.playAlbum({ id: "pending" });
    flushSync(() => audit.playTrack(songs[1]));
    resolvers.pending(
      new Response(
        JSON.stringify({ album: { id: "pending", song: [songs[0]] } }),
      ),
    );
    await pendingAlbum;
    await wait();
    assert.equal(
      audit.playQueue.items[audit.playQueue.index].song.id,
      "b",
      "direct track selection supersedes a pending album",
    );

    await audit.playAlbum({id: 'complete-album', name: 'Complete Album', song: songs}, 2);
    await wait();
    assert.equal(audit.playQueue.index, 2, 'album track three starts at its real queue index');
    assert.deepEqual(audit.playQueue.items.map(item => item.song.id), songs.map(song => song.id));
    assert.equal(audit.playQueue.source.kind, 'album');
    const lyricsRequests = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => String(input).includes('/lyrics/lyrics-')
      ? new Promise(resolve => lyricsRequests.push({resolve, signal: init?.signal, path:String(input)}))
      : previousFetch(input, init);
    flushSync(() => audit.playTrack({id:'lyrics-old',title:'Older',duration:100}));
    await wait();
    flushSync(() => audit.playTrack({id:'lyrics-new',title:'Newer',duration:100}));
    await wait();
    await waitUntil(()=>lyricsRequests.length===2);
    assert.equal(lyricsRequests.length,2,JSON.stringify(lyricsRequests.map(x=>({path:x.path,aborted:x.signal?.aborted}))));
    assert.equal(lyricsRequests[0].signal.aborted,true);
    lyricsRequests[1].resolve(Response.json({songId:'lyrics-new',status:'ready',synced:false,lines:[{value:'Current lyrics',startMs:null}]}));
    await wait();
    lyricsRequests[0].resolve(Response.json({}));
    await wait();
    assert.equal(audit.lyricsState.songId,'lyrics-new');
    assert.equal(audit.lyricsState.status,'ready','late malformed lyrics must not replace the current successful response');
    assert.equal(audit.transport.status,'playing');
    globalThis.fetch = previousFetch;
    for (const panel of ['queue','lyrics']) {
      flushSync(() => audit.playTrack(songs[0], null, {queueSongs:songs,queueIndex:0}));
      await wait();
      flushSync(() => container.querySelector('[aria-label^="Open now playing:"]').click());
      flushSync(() => audit.updatePlayerControls({panel,shuffle:false,repeat:false,pauseAfterCurrent:panel==='queue'}));
      await wait();
      assert.ok(container.querySelector(panel==='queue'?'.queue-overlay':'.lyrics-overlay'));
      const endingAudio = audit.audioRef.current;
      endingAudio.dispatchEvent(new w.Event('loadedmetadata'));
      endingAudio.currentTime = 100;
      flushSync(() => endingAudio.dispatchEvent(new w.Event('ended')));
      const expectedStatus = panel === 'queue' ? 'paused-after-current' : 'playing';
      const advanceDeadline = Date.now() + 3000;
      while ((audit.playQueue.index !== 1 || audit.transport.status !== expectedStatus) && Date.now() < advanceDeadline) await wait();
      assert.equal(audit.playQueue.index,1,'natural end prepares the next queue item');
      assert.equal(audit.playerControls.panel,panel,'natural track advance preserves the open detail panel');
      assert.ok(container.querySelector(panel==='queue'?'.queue-overlay':'.lyrics-overlay'),'rendered detail panel remains mounted');
      assert.equal(audit.transport.status,panel==='queue'?'paused-after-current':'playing');
    }
    // Completing and replaying the last occurrence must retire its end notice.
    flushSync(() => audit.playTrack(songs[0], null, {queueSongs:[songs[0]],queueIndex:0}));
    await wait();
    flushSync(() => audit.updatePlayerControls({pauseAfterCurrent:false,repeat:false}));
    const finalAudio = audit.audioRef.current;
    const idleDeck = [...container.querySelectorAll('audio')].find(deck=>deck!==finalAudio);
    assert.ok(idleDeck);
    idleDeck.src = '/api/navidrome/stream/obsolete-standby';
    idleDeck._paused = false;
    flushSync(() => audit.setPlaybackState({currentTime:9,duration:100,canSeek:true}));
    await wait();
    assert.equal(idleDeck.paused,true,'cancellation still pauses a loaded standby');
    assert.equal(idleDeck.hasAttribute('src'),false,'cancellation still releases its source');
    assert.equal(finalAudio.paused,false,'standby cleanup preserves active playback');
    const idleLoads = idleDeck._loadCalls || 0;
    for (const currentTime of [10, 11, 12]) {
      flushSync(() => audit.setPlaybackState({currentTime,duration:100,canSeek:true}));
      await wait();
    }
    assert.equal(idleDeck._loadCalls || 0,idleLoads,'final-track progress must not reload an already empty standby deck');
    finalAudio.dispatchEvent(new w.Event('loadedmetadata'));
    finalAudio.currentTime = 100;
    finalAudio._paused = true;
    flushSync(() => finalAudio.dispatchEvent(new w.Event('ended')));
    await wait();
    assert.ok(container.textContent.includes('Queue finished.'), 'final natural end announces completion');
    flushSync(() => audit.togglePlayback());
    await wait();
    assert.equal(audit.transport.status,'playing');
    assert.equal(container.textContent.includes('Queue finished.'),false,'replaying retires the previous queue-end notice');
    flushSync(() => container.querySelector('.primary-nav-button[aria-label="Search"]').click());
    flushSync(() => [...container.querySelectorAll('.quick-grid button')].find(b=>b.textContent==='Beatles').click());
    assert.equal(container.querySelector('.search-box input').value,'Beatles');
    flushSync(() => container.querySelector('.primary-nav-button[aria-label="Home"]').click());
    flushSync(() => container.querySelector('.primary-nav-button[aria-label="Search"]').click());
    assert.equal(container.querySelector('.search-box input').value,'Beatles','tab navigation preserves the search query');
    const playlistEntries = [songs[0], songs[1], songs[0], songs[2]];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/library/playlists')) return new Response(JSON.stringify({ playlists: [{id: 'duplicate-list', name: 'Duplicate occurrences', songCount: 4}] }));
      if (url.includes('/playlists/duplicate-list')) return new Response(JSON.stringify({ playlist: {id: 'duplicate-list', name: 'Duplicate occurrences', entry: playlistEntries} }));
      return oldFetch(input, init);
    };
    flushSync(() => document.querySelector('.primary-nav-button[aria-label="Library"]').click());
    await wait();
    const playlistsFilter = [...document.querySelectorAll('.library-filter-bar button')].find(button => button.textContent === 'Playlists');
    assert.ok(playlistsFilter);
    flushSync(() => playlistsFilter.click());
    await wait();
    const playlistSummary = document.querySelector('.playlist-summary-list button');
    assert.ok(playlistSummary, 'fetched playlist appears in Library');
    flushSync(() => playlistSummary.click());
    await wait();
    assert.equal(document.activeElement, document.querySelector('.playlist-back'), 'opening detail moves keyboard focus into it');
    const selectedRow = document.querySelectorAll('.playlist-track-play')[2];
    assert.ok(selectedRow, 'playlist detail exposes individual track playback');
    flushSync(() => selectedRow.click());
    await wait();
    assert.equal(audit.playQueue.index, 2, 'clicking a duplicate starts that occurrence');
    assert.deepEqual(audit.playQueue.items.map(item => item.song.id), playlistEntries.map(song => song.id));
    assert.equal(audit.playQueue.source.kind, 'playlist');
    assert.equal(audit.playQueue.source.id, 'duplicate-list');
    assert.equal(audit.playQueue.source.label, 'Duplicate occurrences');
    assert.equal(new URL(audit.audioRef.current.src).pathname, '/api/navidrome/stream/a');

    let movedEntries = [...playlistEntries];
    let rejectMove = false;
    const moveWrites = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/library/playlists')) return Response.json({playlists:[{id:'duplicate-list',name:'Duplicate occurrences',songCount:4}]});
      if (url.includes('/playlists/duplicate-list')) {
        if (init?.method === 'PATCH') {
          const change = JSON.parse(init.body); moveWrites.push(change);
          if (rejectMove) return Response.json({error:'Changed elsewhere. Refresh before reordering.'},{status:409});
          movedEntries = change.reorder.order.map(index => movedEntries[index]);
        }
        return Response.json({playlist:{id:'duplicate-list',name:'Duplicate occurrences',entry:movedEntries}});
      }
      return oldFetch(input, init);
    };
    const moveButton = (label) => container.querySelector(`[aria-label="${label}"]`);
    flushSync(() => [...container.querySelectorAll('button')].find(button => button.textContent === 'Reorder tracks').click());
    flushSync(() => moveButton('Move playlist track 3 up').click());
    await wait();
    assert.deepEqual(moveWrites[0],{reorder:{version:1,expectedSongIds:['a','b','a','c'],order:[0,2,1,3]}});
    assert.deepEqual([...container.querySelectorAll('.playlist-track-play')].map(button=>button.textContent),[songs[0],songs[0],songs[1],songs[2]].map(song=>song.title));
    // Focus follows a passive React effect, which can settle after the network update.
    for (let attempt=0; attempt<10 && document.activeElement !== container.querySelectorAll('.playlist-track-play')[1]; attempt++) await wait();
    assert.ok(document.activeElement === container.querySelectorAll('.playlist-track-play')[1], 'reorder follows the moved duplicate occurrence');
    assert.deepEqual(audit.playQueue.items.map(item=>item.song.id),playlistEntries.map(song=>song.id), 'saved reorder never rewrites listening queue');
    flushSync(() => moveButton('Move playlist track 2 down').click());
    await wait();
    rejectMove = true;
    flushSync(() => moveButton('Move playlist track 3 up').click());
    await wait();
    assert.match(container.querySelector('.playlist-detail [role="alert"]').textContent,/Changed elsewhere/);
    assert.equal(moveButton('Move playlist track 3 up').disabled,true,'failed move requires explicit refresh');
    const failedCount=moveWrites.length;
    await wait(); assert.equal(moveWrites.length,failedCount,'failed mutation is never retried automatically');
    flushSync(() => [...container.querySelectorAll('button')].find(button=>button.textContent==='Refresh playlist').click());
    await wait();
    assert.equal(moveButton('Move playlist track 3 up').disabled,false);
    flushSync(() => [...container.querySelectorAll('button')].find(button=>button.textContent==='Done reordering').click());

    // The duplicate at index two is unchanged, but the surrounding order is stale.
    const reorderedEntries = [songs[0], songs[2], songs[0], songs[1]];
    let latestEntries = reorderedEntries;
    const removalWrites = [];
    let holdPlaylistRefresh = false;
    const playlistRefreshes = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/library/playlists')) {
        const response = () => Response.json({playlists:[{id:'duplicate-list',name:'Duplicate occurrences',songCount:latestEntries.length}]});
        if (holdPlaylistRefresh) return new Promise(resolve => playlistRefreshes.push(() => resolve(response())));
        return response();
      }
      if (url.includes('/playlists/duplicate-list')) {
        if (init?.method === 'PATCH') {
          const mutation = JSON.parse(init.body);
          removalWrites.push(mutation);
          latestEntries = latestEntries.filter((_, index) => !mutation.removeSongIndexes.includes(index));
        }
        return new Response(JSON.stringify({playlist: {id: 'duplicate-list', name: 'Duplicate occurrences', entry: latestEntries}}));
      }
      return oldFetch(input, init);
    };
    const removeOccurrence = () => document.querySelectorAll('.playlist-track-tools button[aria-label^="Remove "]')[2];
    assert.ok(removeOccurrence());
    flushSync(() => removeOccurrence().click());
    await wait();
    assert.equal(removalWrites.length, 0, 'stale order never issues the positional mutation');
    assert.match(document.querySelector('.playlist-detail [role="alert"]').textContent, /changed elsewhere/);
    assert.deepEqual([...document.querySelectorAll('.playlist-track-play')].map(button => button.textContent), reorderedEntries.map(song => song.title));
    holdPlaylistRefresh = true;
    flushSync(() => removeOccurrence().click());
    await wait();
    // Mutation invalidates Library, which can briefly render its loading state.
    // Await the user-visible result rather than assuming a 70ms refresh deadline.
    const refreshedDeadline = Date.now() + 3000;
    while (document.querySelectorAll('.playlist-track-play').length !== 3 && Date.now() < refreshedDeadline) await wait();
    assert.deepEqual(removalWrites, [{removeSongIndexes: [2]}], 'retry after reviewing refreshed order removes only the selected occurrence');
    assert.equal(document.querySelectorAll('.playlist-track-play').length, 3, 'detail remains mounted while the playlist summary refresh is pending');
    const summaryDeadline = Date.now() + 3000;
    while (playlistRefreshes.length === 0 && Date.now() < summaryDeadline) await wait();
    assert.equal(playlistRefreshes.length, 1);
    holdPlaylistRefresh = false;
    playlistRefreshes.forEach(resolve => resolve());
    await wait();
    assert.equal(audit.playQueue.items.length, 4, 'editing the saved playlist does not rewrite the listening queue');
    assert.ok(document.activeElement === document.querySelectorAll('.playlist-track-tools button[aria-label^="Remove "]')[2], 'removal focuses the next surviving occurrence');
    for (let remaining = 3; remaining > 0; remaining--) {
      const lastRemove = document.querySelectorAll('.playlist-track-tools button[aria-label^="Remove "]')[remaining - 1];
      flushSync(() => { lastRemove.focus(); lastRemove.click(); });
      const deadline = Date.now() + 3000;
      while (document.querySelectorAll('.playlist-track-play').length !== remaining - 1 && Date.now() < deadline) await wait();
      await wait();
      assert.equal(document.querySelectorAll('.playlist-track-play').length, remaining - 1);
      assert.ok(document.activeElement === (remaining > 1
        ? document.querySelectorAll('.playlist-track-tools button[aria-label^="Remove "]')[remaining - 2]
        : document.querySelector('.playlist-back')), 'tail removal focuses the preceding row or Back when empty');
    }
    assert.equal(audit.playQueue.items.length, 4, 'emptying a saved playlist leaves the listening queue intact');
    const deleteTrigger = document.querySelector('.playlist-detail-header > button.danger');
    flushSync(() => deleteTrigger.click());
    await wait();
    const confirmation = document.querySelector('.playlist-delete-confirmation');
    assert.ok(confirmation.contains(document.activeElement));
    flushSync(() => confirmation.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
    await wait();
    assert.equal(document.querySelector('.playlist-delete-confirmation'), null);
    assert.equal(document.activeElement, document.querySelector('.playlist-detail-header > button.danger'), 'Escape returns focus to Delete');
    flushSync(() => document.querySelector('.playlist-back').click());
    await wait();
    assert.equal(document.activeElement, document.querySelector('.playlist-summary-list button'), 'Back restores focus to the recreated playlist summary');
    assert.notEqual(document.activeElement, playlistSummary, 'the original list element was unmounted');

    flushSync(() => root.unmount());
  } finally {
    if (root) flushSync(() => root.unmount());
    await vite.close();
    w.close();
  }
});
