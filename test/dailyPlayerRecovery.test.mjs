import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createServer } from "vite";
import { manifest, tile, persisted } from "./contracts/sonicAtlasFixtures.mjs";

test("album selection, screen retry and Atlas recovery retain the shared player", async () => {
  const w = new Window({ url: "http://localhost/" });
  for (const key of [
    "window",
    "document",
    "Node",
    "Element",
    "HTMLElement",
    "HTMLCanvasElement",
    "ResizeObserver",
    "CustomEvent",
  ])
    globalThis[key] = key === "window" ? w : w[key];
  Object.defineProperty(globalThis, "navigator", {
    value: w.navigator,
    configurable: true,
  });
  const songs = ["One", "Two", "Three", "Four"].map((title, index) => ({
    id: String(index),
    title,
    duration: 180,
    artist: "Test Artist",
  }));
  let albumFails = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    let body;
    if (url.pathname.includes("/albums/")) {
      if (albumFails) return new Response("{}", { status: 503 });
      body = {
        album: {
          id: "record",
          name: "Test Record",
          year: 2001,
          artistId: "test-artist",
          artist: "Test Artist",
          song: songs,
        },
      };
    } else if (url.pathname === "/api/atlas/projection") body = manifest;
    else {
      const [lod, x, y] = url.pathname.split("/").slice(-3);
      const descriptor = manifest.lods
        .find((item) => item.lod === Number(lod))
        .tiles.find(
          (item) => item.tileX === Number(x) && item.tileY === Number(y),
        );
      body = {
        ...tile,
        ...descriptor,
        lod: Number(lod),
        points: [
          {
            pointId: `point-${x}-${y}`,
            x: x === "0" ? -0.75 : 0.75,
            y: y === "0" ? -0.75 : 0.75,
          },
        ],
      };
      delete body.pointCount;
    }
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  };
  globalThis.rendererInstances = [];
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
    plugins: [
      {
        name: "test-renderer-boundary",
        enforce: "pre",
        transform(code, id) {
          if (!id.endsWith("/src/reglAtlasRenderer.js")) return;
          return `export class ReglAtlasRenderer { constructor(options) { this.options = options; globalThis.rendererInstances.push(this); } mount() {} render() {} setReducedMotion() {} suspend() {} resume() {} dispose() { this.disposed = true; } }`;
        },
      },
    ],
  });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node, { onCaughtError() {} });
  const waitFor = async (check) => {
    for (let i = 0; i < 100; i += 1) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("UI did not reach expected state");
  };
  const button = (text) =>
    [...node.querySelectorAll("button")].find((item) =>
      item.textContent.includes(text),
    );
  try {
    const { AlbumDetail } = await vite.ssrLoadModule("/src/AlbumDetail.jsx");
    const { AppShell } = await vite.ssrLoadModule("/src/AppShell.jsx");
    let selection, artistSelection;
    const renderAlbum = () =>
      React.createElement(AlbumDetail, {
        album: { id: "record", title: "Test Record" },
        onOpenArtist: artist => { artistSelection = artist; },
        onPlayAlbum: (album, index) => {
          selection = { album, index };
        },
      });
    flushSync(() => root.render(renderAlbum()));
    await waitFor(() =>
      node.querySelector('[aria-label="Play track 3: Three"]'),
    );
    assert.equal(node.querySelector('.album-release-year').textContent, '2001');
    flushSync(() => node.querySelector('[aria-label="Go to artist: Test Artist"]').click());
    assert.deepEqual(artistSelection, {id: 'test-artist', name: 'Test Artist'});
    assert.equal(
      selection,
      undefined,
      "opening album details does not start playback",
    );
    flushSync(() =>
      node.querySelector('[aria-label="Play track 3: Three"]').click(),
    );
    assert.equal(selection.index, 2);
    assert.deepEqual(
      selection.album.song.map((song) => song.title),
      songs.map((song) => song.title),
    );
    flushSync(() => root.render(null));
    albumFails = true;
    flushSync(() => root.render(renderAlbum()));
    await waitFor(() => button("Retry album"));
    albumFails = false;
    flushSync(() => button("Retry album").click());
    await waitFor(() =>
      node.querySelector('[aria-label="Play track 3: Three"]'),
    );

    let broken = true,
      bindings = 0;
    function BrokenScreen() {
      if (broken) throw new Error("Test surface failure");
      return React.createElement("h2", null, "Recovered screen");
    }
    const bind = (_index, audio) => {
      if (audio) bindings += 1;
    };
    flushSync(() =>
      root.render(
        React.createElement(AppShell, {
          activeTab: "home",
          bindAudioDeck: bind,
          surfaces: { home: React.createElement(BrokenScreen) },
          miniPlayer: React.createElement("button", null, "Persistent pause"),
        }),
      ),
    );
    const audio = [...node.querySelectorAll("audio")];
    assert.equal(audio.length, 2);
    assert.ok(button("Persistent pause"));
    assert.ok(button("Retry screen"));
    broken = false;
    flushSync(() => button("Retry screen").click());
    assert.ok(node.textContent.includes("Recovered screen"));
    assert.deepEqual([...node.querySelectorAll("audio")], audio);
    assert.equal(bindings, 2, "screen retry never remounts either audio deck");

    const { AtlasOverview } = await vite.ssrLoadModule(
      "/src/AtlasOverview.jsx",
    );
    const { AtlasJourneyContext } = await vite.ssrLoadModule(
      "/src/AtlasJourneyContext.jsx",
    );
    const queue = {
      instanceId: persisted.queueBinding.queueInstanceId,
      index: 1,
      items: persisted.journey.stops.map((stop) => ({
        queueItemId: stop.queueItemId,
        song: { id: stop.playback.trackRef },
      })),
    };
    const state = {
      persisted: { ...persisted, routeHistory: [] },
      status: "active",
      queueAttached: true,
    };
    const atlas = React.createElement(
      AtlasJourneyContext.Provider,
      { value: { state } },
      React.createElement(AtlasOverview, { queue }),
    );
    flushSync(() =>
      root.render(
        React.createElement(AppShell, {
          activeTab: "sonic",
          bindAudioDeck: bind,
          surfaces: { sonic: atlas },
          miniPlayer: React.createElement("button", null, "Persistent pause"),
        }),
      ),
    );
    await waitFor(() => node.textContent.includes("4 points"));
    const atlasAudio = [...node.querySelectorAll("audio")];
    const failed = rendererInstances.at(-1);
    flushSync(() => failed.options.onFailure(new Error("Context lost")));
    await waitFor(() => button("Retry map"));
    assert.equal(failed.disposed, true);
    assert.ok(node.textContent.includes("Middle"));
    flushSync(() => button("Retry map").click());
    await waitFor(
      () =>
        rendererInstances.length >= 2 && node.textContent.includes("4 points"),
    );
    assert.deepEqual([...node.querySelectorAll("audio")], atlasAudio);
    assert.equal(queue.index, 1);
    assert.ok(button("Persistent pause"));
  } finally {
    flushSync(() => root.unmount());
    await vite.close();
    w.close();
  }
});
