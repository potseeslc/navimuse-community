import { createQueueSourceDescriptor, queueItemProvenance, validateQueueSourceDescriptor } from './productInteractionContract.js';

/**
 * Queue persistence contract — defines the stable API for saving and restoring
 * queue state across browser sessions.
 *
 * Issue #71 requires defining the persistence API without implementing #73 features.
 * The actual save/load logic will be implemented as part of #73 (queue/position
 * persistence).  These types and function signatures exist so downstream work
 * (#73, #75) can rely on a stable contract.
 */

/**
 * @typedef {Object} PersistedQueueState
 * @property {number} version - Persistence schema version
 * @property {Array<{ song: Object, album: Object|null }>} items - Queue items
 * @property {number} index - Current index into items (-1 = empty)
 * @property {number[]} shufflePool - Remaining shuffle candidate indices
 * @property {number[]} playHistory - History of visited indices for shuffle previous
 * @property {{ shuffle: boolean, repeat: boolean, pauseAfterCurrent: boolean }} controls - Transport controls
 * @property {number} position - Playback position in seconds (for restore)
 * @property {number} timestamp - When the state was persisted (Date.now())
 */

/**
 * @typedef {Object} QueuePersistenceAdapter
 * @property {(state: PersistedQueueState) => boolean} save - Persist queue state; returns true on success
 * @property {() => PersistedQueueState | null} load - Restore last persisted state or null
 * @property {() => void} clear - Remove persisted state
 */

/** Storage key for queue persistence. */
export const QUEUE_PERSISTENCE_KEY = 'navimuse.queue.v1';

/**
 * Schema version for the persisted queue state.
 * Increment when the PersistedQueueState shape changes in a breaking way.
 */
export const QUEUE_PERSISTENCE_SCHEMA_VERSION = 1;

export function loadPersistedQueue(storage) {
  try {
    const raw = storage?.getItem(QUEUE_PERSISTENCE_KEY);
    return raw ? validatePersistedQueue(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function savePersistedQueue(storage, queue, shufflePool, playHistory, controls, position = 0) {
  const state = buildPersistedQueueState(queue, shufflePool, playHistory, controls, position);
  if (!storage || typeof storage.setItem !== 'function') return null;
  try { storage.setItem(QUEUE_PERSISTENCE_KEY, JSON.stringify(state)); return state; } catch { return null; }
}

/**
 * Validates that a loaded object matches the expected PersistedQueueState shape.
 * Returns the object if valid, null otherwise.
 *
 * @param {*} data - Raw data loaded from storage
 * @returns {PersistedQueueState | null}
 */
export function validatePersistedQueue(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.version !== QUEUE_PERSISTENCE_SCHEMA_VERSION) return null;
  if (!Array.isArray(data.items) || data.items.some((item) => !item?.song?.id)) return null;
  if (!Number.isInteger(data.index)) return null;
  if (data.items.length === 0 ? data.index !== -1 : data.index < 0 || data.index >= data.items.length) return null;
  if (!validQueueIndexes(data.shufflePool, data.items.length, data.index, true)) return null;
  if (!validQueueIndexes(data.playHistory, data.items.length)) return null;
  if (!data.controls || typeof data.controls !== 'object') return null;
  if (typeof data.controls.shuffle !== 'boolean') return null;
  if (typeof data.controls.repeat !== 'boolean') return null;
  if (data.controls.repeatAll !== undefined && typeof data.controls.repeatAll !== 'boolean') return null;
  if (data.controls.pauseAfterCurrent !== undefined && typeof data.controls.pauseAfterCurrent !== 'boolean') return null;
  if (!Number.isFinite(data.position) || data.position < 0) return null;
  if (!Number.isFinite(data.timestamp) || data.timestamp <= 0) return null;
  const source = validateQueueSourceDescriptor(data.source) || createQueueSourceDescriptor();
  const items = data.items.map((item) => ({
    ...item,
    provenance: queueItemProvenance(item.provenance)
  }));
  return {
    ...data,
    source,
    items,
    controls: {
      ...data.controls,
      pauseAfterCurrent: Boolean(data.controls.pauseAfterCurrent)
    }
  };
}

function validQueueIndexes(indexes, itemCount, currentIndex = -1, unique = false) {
  if (!Array.isArray(indexes)) return false;
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= itemCount || index === currentIndex)) return false;
  return !unique || new Set(indexes).size === indexes.length;
}

/**
 * Builds a PersistedQueueState snapshot from current queue/transport values.
 *
 * @param {{ items: Array, index: number }} queue
 * @param {number[]} shufflePool
 * @param {number[]} playHistory
 * @param {{ shuffle: boolean, repeat: boolean, pauseAfterCurrent?: boolean }} controls
 * @param {number} [position=0]
 * @returns {PersistedQueueState}
 */
export function buildPersistedQueueState(queue, shufflePool, playHistory, controls, position = 0) {
  const items = Array.isArray(queue?.items) && queue.items.every((item) => item?.song?.id)
    ? queue.items.map((item) => ({ ...item, provenance: queueItemProvenance(item.provenance) }))
    : [];
  const requestedIndex = Number.isInteger(queue?.index) ? queue.index : -1;
  const index = items.length === 0
    ? -1
    : requestedIndex >= 0 && requestedIndex < items.length ? requestedIndex : 0;
  const cleanIndexes = (values, excludeCurrent = false) => {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).filter((value) => {
      if (!Number.isInteger(value) || value < 0 || value >= items.length || (excludeCurrent && value === index) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  };
  const numericPosition = Number(position);
  return {
    version: QUEUE_PERSISTENCE_SCHEMA_VERSION,
    source: validateQueueSourceDescriptor(queue?.source) || createQueueSourceDescriptor(),
    items,
    index,
    shufflePool: cleanIndexes(shufflePool, true),
    playHistory: cleanIndexes(playHistory),
    controls: {
      shuffle: Boolean(controls?.shuffle),
      repeat: Boolean(controls?.repeat),
      ...(controls?.repeatAll === true ? {repeatAll:true} : {}),
      pauseAfterCurrent: Boolean(controls?.pauseAfterCurrent)
    },
    position: Number.isFinite(numericPosition) ? Math.max(0, numericPosition) : 0,
    timestamp: Date.now()
  };
}
