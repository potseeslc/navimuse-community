import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { persisted as fixture } from "./contracts/sonicAtlasFixtures.mjs";
test("final Journey actions remain available after completion and extension failure", async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const { AtlasOverview } = await vite.ssrLoadModule(
      "/src/AtlasOverview.jsx",
    );
    const { AtlasJourneyContext } = await vite.ssrLoadModule(
      "/src/AtlasJourneyContext.jsx",
    );
    const persisted = { ...fixture, routeHistory: [] };
    const queue = {
      instanceId: fixture.queueBinding.queueInstanceId,
      index: 2,
      items: fixture.journey.stops.map((s) => ({
        queueItemId: s.queueItemId,
        song: { id: s.playback.trackRef },
      })),
    };
    for (const status of ["active", "completed"]) {
      const html = renderToStaticMarkup(
        React.createElement(
          AtlasJourneyContext.Provider,
          {
            value: {
              state: {
                persisted,
                status,
                queueAttached: true,
                extensionError: "Service temporarily unavailable",
              },
            },
          },
          React.createElement(AtlasOverview, {
            queue,
            onNext: () => {},
            onPrevious: () => {},
            onTogglePlayback: () => {},
          }),
        ),
      );
      assert.ok(html.includes("atlas-final-stop-actions"), status);
      assert.ok(html.includes(">Retry<"), status);
      assert.ok(html.includes(">Continue similar music<"), status);
    }
  } finally {
    await vite.close();
  }
});
