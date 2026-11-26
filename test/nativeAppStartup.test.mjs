import { Window } from "happy-dom";
import { createServer } from "vite";
import test from "node:test";
import assert from "node:assert/strict";

test("Native app remains mounted after empty-queue startup cleanup", async () => {
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
  const lyricScrolls=[];
  w.HTMLElement.prototype.scrollTo=function(){if(this.className==='lyrics-scroll')lyricScrolls.push(this.querySelector('.current')?.textContent);};
  const commands = [];
  let nativePaused=false;
  w.__nmAudioTransport = { version: 1, toggle:true, request: async message => { commands.push(message); if(message.action==='toggle'){nativePaused=!nativePaused;return {paused:nativePaused};} return true; } };
  globalThis.fetch = async (input, init) => {
    const u = String(input);
    let body = {};
    if (u.includes('/lyrics/seed')) return Response.json({songId:'seed',status:'ready',synced:true,offsetMs:0,lines:[{startMs:1000,value:'First lyric'},{startMs:3000,value:'Second lyric'}]});
    if (u.includes('/similar_tracks')) return Response.json({ok:true,tracks:[{id:'related',title:'Related',artist:'Another artist',artistId:'artist-b'}]});
    if (u.includes('/artists/artist-a/songs')) return Response.json({songs:[{id:'seed',title:'Seed',artist:'First artist',artistId:'artist-a'}]});
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
          code = code.replace('  const surfaces = {', '  globalThis.nativeAppAudit = { playTrack, startCurrentTrackJourney, startArtistJourney, playQueue, radioNotice, audioRef, setSettingsState, dismissSonicRadio };\n  const surfaces = {');
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
    const { App } = await vite.ssrLoadModule("/src/main.jsx");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    flushSync(() => root.render(React.createElement(App)));
    await wait();
    await wait();
    assert.ok(container.textContent.includes('Home'), 'Home remains visible after startup effects');
    assert.ok(commands.some(message => message.action === 'commands'), 'native command binding ran');
    flushSync(() => nativeAppAudit.playTrack({id:'seed',title:'Seed',artistId:'artist-a',artist:'First artist'}));
    await wait();
    nativeAppAudit.audioRef.current.readyState=4;
    nativeAppAudit.audioRef.current.paused=true; // stale web snapshot while AVPlayer is playing
    flushSync(()=>container.querySelector('.mini-player button[aria-label="Play"]').click());
    await wait();
    assert.equal(nativePaused,true,'mini-player sends native toggle even with stale paused state');
    flushSync(()=>container.querySelector('.mini-player button[aria-label="Play"]').click());
    await wait();assert.equal(nativePaused,false,'mini-player resumes via native toggle');
    flushSync(()=>container.querySelector('[aria-label^="Open now playing:"]').click());
    flushSync(()=>container.querySelector('.play-button').click());
    await wait();assert.equal(nativePaused,true,'full player pauses native playback');
    flushSync(()=>container.querySelector('.play-button').click());
    await wait();assert.equal(nativePaused,false,'full player resumes native playback');
    const deck=nativeAppAudit.audioRef.current;
    const emit=(type,time)=>w.dispatchEvent(new w.CustomEvent('navimuse-native-audio',{detail:{type,deck:deck.id,generation:deck.generation,time,duration:120,paused:false}}));
    flushSync(()=>emit('loadedmetadata',1.2));
    // Native progress can resume after waiting/foreground restoration without a fresh playing event.
    flushSync(()=>emit('waiting',1.2));
    const lyricsButton=container.querySelector('[aria-label="Open lyrics"]');
    assert.ok(lyricsButton, 'full player offers lyrics');
    flushSync(()=>lyricsButton.click());
    await wait();
    flushSync(()=>emit('timeupdate',3.2));
    await wait();
    assert.equal(container.querySelector('.lyrics-lines .current')?.textContent,'Second lyric','native timeupdate advances real player lyrics after waiting');
    assert.equal(lyricScrolls.at(-1),'Second lyric','native progress scrolls the active line');
    nativeAppAudit.startCurrentTrackJourney();
    await wait(); await wait();
    assert.deepEqual(nativeAppAudit.playQueue.items.map(item=>item.song.id), ['seed','related'], 'Track Journey commits related songs to the real app queue');
    await nativeAppAudit.startArtistJourney({id:'artist-a',name:'First artist'});
    await wait();
    assert.deepEqual(nativeAppAudit.playQueue.items.map(item=>item.song.id), ['seed','related'], 'Artist Journey includes other artists');
    nativeAppAudit.dismissSonicRadio();
    flushSync(()=>nativeAppAudit.playTrack({id:'seed',title:'Seed',duration:120},null,{queueItems:[{queueItemId:'ordinary-seed',song:{id:'seed',title:'Seed',duration:120}}],queueIndex:0,queueSource:{kind:'album',label:'Album'}}));
    await wait();
    flushSync(()=>nativeAppAudit.setSettingsState(state=>({...state,preferences:{...state.preferences,playback:{...state.preferences.playback,continueThroughQueue:true,autoplayAfterQueue:true}}})));
    const ordinaryDeck=nativeAppAudit.audioRef.current;
    const ordinaryEvent=type=>w.dispatchEvent(new w.CustomEvent('navimuse-native-audio',{detail:{type,deck:ordinaryDeck.id,generation:ordinaryDeck.generation,time:5,duration:120,paused:false}}));
    flushSync(()=>ordinaryEvent('playing'));
    await wait();await wait();
    assert.deepEqual(nativeAppAudit.playQueue.items.map(item=>item.song.id),['seed','related'],'ordinary autoplay appends through the real shared queue');
    assert.equal(nativeAppAudit.playQueue.items[1].autoplay,true);
    assert.equal(nativeAppAudit.playQueue.index,0,'preparation does not advance transport');
    flushSync(()=>ordinaryEvent('ended'));
    await wait();
    assert.equal(nativeAppAudit.playQueue.index,1,'native ended event advances into prepared similar music');

  } finally {
    if (root) flushSync(() => root.unmount());
    await vite.close();
    w.close();
  }
});
