import { parentPort } from 'node:worker_threads';
import { buildAtlasProjectionSnapshot } from './atlasMapService.js';

parentPort.on('message', ({ payload, aliasKey }) => {
  try {
    const snapshot = buildAtlasProjectionSnapshot(payload, { aliasKey: Buffer.from(aliasKey) });
    parentPort.postMessage({ ok: true, manifest: snapshot.manifest, tiles: [...snapshot.tiles.entries()], generatedAt: snapshot.generatedAt, sourcePointCount: snapshot.sourcePointCount, rawIdEntries: snapshot.rawIdEntries, reverseRawIdEntries: snapshot.reverseRawIdEntries, pointEntries: snapshot.pointEntries });
  } catch (error) {
    parentPort.postMessage({ ok: false, message: 'Atlas snapshot construction failed' });
  }
});
