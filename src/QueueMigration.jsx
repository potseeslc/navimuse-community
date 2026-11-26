import React, { useState } from 'react';
import { QUEUE_PERSISTENCE_KEY, loadPersistedQueue } from './queueStore.js';
import { ATLAS_QUEUE_TRANSACTION_KEY, loadAtlasQueueTransaction } from './atlasQueueTransaction.js';
import { QUEUE_MIGRATION_KEY, scopedQueueStorage } from './queueStorageScope.js';

export function legacyQueueMigration(storage, scope) {
  const target = scopedQueueStorage(storage, scope);
  if (!target) return null;
  try {
    if (target.getItem(QUEUE_MIGRATION_KEY) || target.getItem(QUEUE_PERSISTENCE_KEY) || target.getItem(ATLAS_QUEUE_TRANSACTION_KEY)) return null;
    const ordinary = loadPersistedQueue(storage);
    const atlas = loadAtlasQueueTransaction(storage);
    if (!ordinary?.items?.length && !atlas?.queue?.items?.length) return null;
    return { ordinary, atlas, target };
  } catch { return null; }
}

export function QueueMigration({ migration, onDone }) {
  const [error, setError] = useState('');
  const choose = (restore) => {
    try {
      if (restore) {
        const useAtlas = migration.atlas && Number(migration.atlas.committedAt) >= Number(migration.ordinary?.timestamp || 0);
        // One storage write preserves the same newest-snapshot precedence as the
        // queue hook, without leaving a partial multi-record migration.
        migration.target.setItem(useAtlas ? ATLAS_QUEUE_TRANSACTION_KEY : QUEUE_PERSISTENCE_KEY, JSON.stringify(useAtlas ? migration.atlas : migration.ordinary));
      } else {
        try { migration.target.setItem(QUEUE_MIGRATION_KEY, 'skipped'); } catch {}
      }
      onDone();
    } catch { setError('The saved queue could not be copied. You can continue without restoring it.'); }
  };
  return <main className="onboarding-shell"><section className="onboarding-frame" aria-labelledby="queue-migration-title">
    <div className="onboarding-copy">
      <h1 id="queue-migration-title">Keep your saved queue?</h1>
      <p>This device has a queue saved before account-specific storage. Restore it only if it belongs to the account and music server you just signed into. Playback will stay paused.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => choose(true)}>Restore saved queue</button>
      <button type="button" onClick={() => choose(false)}>Start with an empty queue</button>
    </div>
  </section></main>;
}
