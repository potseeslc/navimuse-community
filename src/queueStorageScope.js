// Scope the ordinary snapshot and atomic Journey transaction together. The BFF
// supplies an opaque namespace; neither service credentials nor user names are
// written into storage keys. Unscoped legacy records are deliberately retained.
export function scopedQueueStorage(storage, scope) {
  if (!storage || !/^queue-scope-v1:[a-f0-9]{64}$/.test(String(scope || ''))) return null;
  const prefix = `${scope}:`;
  return {
    getItem: key => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: key => storage.removeItem(prefix + key)
  };
}

export const QUEUE_MIGRATION_KEY = 'navimuse.queue.migration.v1';
