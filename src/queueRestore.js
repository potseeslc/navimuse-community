import { validatePersistedQueue } from './queueStore.js';

// Resolve metadata outside the queue authority; callers commit only if the
// captured queue revision and playback intent are still current.
export async function repairRestoredQueue(snapshot, resolveSong, { signal } = {}) {
  const state = validatePersistedQueue(snapshot);
  if (!state) throw new TypeError('Invalid queue restore snapshot');
  const resolved = new Array(state.items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, state.items.length) }, async () => {
    while (next < state.items.length) {
      signal?.throwIfAborted();
      const index = next++;
      const item = state.items[index];
      // Internet radio is not a Navidrome song. Atlas repair is separately owned
      // by its atomic, versioned Journey transaction.
      if (item.song.streamUrl || item.song.isRadio) { resolved[index] = item; continue; }
      try {
        const payload = await resolveSong(item.song.id, { signal });
        if (!payload?.song?.id || String(payload.song.id) !== String(item.song.id)) throw new Error('Track metadata is unavailable');
        resolved[index] = { ...item, song: { ...item.song, ...payload.song } };
      } catch (error) {
        if (signal?.aborted || error.status !== 404) throw error;
      }
    }
  }));
  signal?.throwIfAborted();
  const oldIndexes = resolved.flatMap((item, index) => item ? [index] : []);
  const indexes = new Map(oldIndexes.map((oldIndex, index) => [oldIndex, index]));
  const currentSurvives = indexes.has(state.index);
  const replacement = oldIndexes.find((index) => index >= state.index) ?? oldIndexes.at(-1);
  const index = indexes.get(currentSurvives ? state.index : replacement) ?? -1;
  const remap = (values) => values.filter((value) => indexes.has(value)).map((value) => indexes.get(value));
  return {
    state: { ...state, items: resolved.filter(Boolean), index,
      position: currentSurvives ? state.position : 0,
      shufflePool: remap(state.shufflePool).filter((value) => value !== index),
      playHistory: remap(state.playHistory) },
    removedCount: state.items.length - oldIndexes.length,
    currentChanged: !currentSurvives && state.items.length > 0
  };
}
