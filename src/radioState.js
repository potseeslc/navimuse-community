/**
 * Generated-radio state contract — defines the stable state shape and
 * transitions for Sonic Radio and generated radio sessions.
 *
 * Issue #71 requires defining the generated-radio state API without
 * implementing #74/#75 features.  The actual adapter and listening-loop
 * state machine will be implemented in #74 (AudioMuse similarity adapter)
 * and #75 (Sonic Radio listening loop).
 */

/**
 * @typedef {('idle'|'seeding'|'generating'|'listening'|'replenishing'|'degraded'|'stopped')} RadioSessionStatus
 */

/**
 * @typedef {Object} RadioSessionState
 * @property {RadioSessionStatus} status - Current state machine phase
 * @property {string} seedType - 'song'|'artist'|'genre'|'smart-playlist'
 * @property {string} seedId - Identifier of the seed (song id, artist name, etc.)
 * @property {string} seedLabel - Human-readable label for the radio session
 * @property {string} seedSongId - Playable song id used for similarity generation
 * @property {string} sessionKind - 'journey'|'artist-dj'
 * @property {string[]} playedIds - Song ids already played in this session
 * @property {string[]} candidateIds - Pending candidate ids not yet played
 * @property {number} replenishThreshold - When candidateIds falls below this, generate more
 * @property {number} maxHistorySize - Bounded history to avoid re-playing recent tracks
 * @property {number} startedAt - Timestamp when the session began
 * @property {number} degradedRetryAt - 0 or timestamp for next degraded retry
 * @property {number} schemaVersion - For persistence validation parity with queueStore.js
 */

/** Delay (ms) before retrying after entering degraded state. */
const DEGRADED_RETRY_DELAY_MS = 60_000;

/** Minimum remaining playtime (seconds) before triggering replenishment. */
const REPLENISH_REFILL_THRESHOLD_SECONDS = 300;

/**
 * Creates an idle radio session state.
 *
 * @returns {RadioSessionState}
 */
export function createIdleRadioSession() {
  return {
    status: 'idle',
    seedType: '',
    seedId: '',
    seedLabel: '',
    seedSongId: '',
    sessionKind: 'journey',
    playedIds: [],
    candidateIds: [],
    replenishThreshold: 3,
    maxHistorySize: 50,
    startedAt: 0,
    degradedRetryAt: 0,
    schemaVersion: 2
  };
}

/**
 * Transitions a radio session to the seeding phase.
 *
 * @param {RadioSessionState} state
 * @param {{ seedType: string, seedId: string, seedLabel: string }} seed
 * @returns {RadioSessionState}
 */
export function beginRadioSeeding(state, seed) {
  return {
    ...state,
    status: 'seeding',
    seedType: seed.seedType || '',
    seedId: seed.seedId || '',
    seedLabel: seed.seedLabel || '',
    seedSongId: seed.seedSongId || seed.seedId || '',
    sessionKind: seed.sessionKind === 'artist-dj' ? 'artist-dj' : 'journey',
    playedIds: [],
    candidateIds: [],
    startedAt: Date.now(),
    degradedRetryAt: 0
  };
}

/**
 * Transitions to generating after seeding is confirmed.
 *
 * @param {RadioSessionState} state
 * @returns {RadioSessionState}
 */
export function beginRadioGeneration(state) {
  if (state.status !== 'seeding') return state;
  return { ...state, status: 'generating' };
}

/**
 * Transitions to listening after candidates are loaded.
 *
 * @param {RadioSessionState} state
 * @param {string[]} candidateIds - New candidate ids from the adapter
 * @returns {RadioSessionState}
 */
export function acceptRadioCandidates(state, candidateIds) {
  if (!['generating', 'replenishing', 'degraded'].includes(state.status)) return state;
  const excluded = new Set([
    ...state.playedIds,
    ...state.candidateIds,
    state.seedId,
    state.seedSongId
  ].filter(Boolean));
  const valid = [];
  for (const candidateId of Array.isArray(candidateIds) ? candidateIds : []) {
    const id = String(candidateId || '').trim();
    if (!id || excluded.has(id)) continue;
    excluded.add(id);
    valid.push(id);
  }
  return {
    ...state,
    status: 'listening',
    candidateIds: [...state.candidateIds, ...valid],
    degradedRetryAt: 0
  };
}

/**
 * Marks a song as played and checks if replenishment is needed.
 *
 * @param {RadioSessionState} state
 * @param {string} songId
 * @returns {RadioSessionState}
 */
export function markRadioPlayed(state, songId) {
  if (!songId) return state;
  const playedIds = [...state.playedIds.filter((id) => id !== songId), songId].slice(-state.maxHistorySize);
  const candidateIds = state.candidateIds.filter((id) => id !== songId);
  const needsReplenish = candidateIds.length < state.replenishThreshold;
  return {
    ...state,
    status: needsReplenish ? 'replenishing' : 'listening',
    playedIds,
    candidateIds
  };
}

/**
 * Transitions to degraded state when the adapter fails.
 *
 * @param {RadioSessionState} state
 * @returns {RadioSessionState}
 */
export function degradeRadioSession(state) {
  return {
    ...state,
    status: 'degraded',
    degradedRetryAt: Date.now() + DEGRADED_RETRY_DELAY_MS
  };
}

/**
 * Stops a radio session while retaining its terminal state for UI/telemetry.
 *
 * @param {RadioSessionState} state
 * @returns {RadioSessionState}
 */
export function stopRadioSession(state) {
  return {
    ...state,
    status: 'stopped',
    candidateIds: [],
    degradedRetryAt: 0
  };
}

/**
 * Clears a stopped/degraded radio session back to an idle starting point.
 *
 * @returns {RadioSessionState}
 */
export function resetRadioSession() {
  return createIdleRadioSession();
}

/**
 * Returns true if the radio session needs more candidates.
 *
 * @param {RadioSessionState} state
 * @returns {boolean}
 */
export function radioNeedsReplenishment(state, queue) {
  if (state.status === 'replenishing') return true;
  if (state.status !== 'listening') return false;
  if (state.candidateIds.length < state.replenishThreshold) return true;
  if (queue) {
    const pendingItems = state.candidateIds
      .map((id) => (queue.items || []).find((item) => item?.song?.id === id))
      .filter(Boolean);
    const remainingSeconds = pendingItems.reduce(
      (sum, item) => sum + (Number(item.song?.duration) || 0), 0
    );
    return remainingSeconds < REPLENISH_REFILL_THRESHOLD_SECONDS;
  }
  return false;
}

/**
 * Returns true if the given song id has already been played or is a pending candidate.
 * Used for dedup before adding new candidates.
 *
 * @param {RadioSessionState} state
 * @param {string} songId
 * @returns {boolean}
 */
export function isRadioDuplicate(state, songId) {
  return state.playedIds.includes(songId) || state.candidateIds.includes(songId);
}
