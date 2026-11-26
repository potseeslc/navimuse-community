import { useCallback, useRef, useState } from 'react';
import {
  queueAdvancePlan,
  queueEditIndexState,
  restorablePlaybackPosition,
  queueSelectionHistory,
  queueSelectionShufflePool
} from './playerState.js';
import { buildPersistedQueueState, loadPersistedQueue, savePersistedQueue, validatePersistedQueue } from './queueStore.js';
import { buildAtlasQueueTransaction, clearAtlasQueueTransaction, loadAtlasQueueTransaction, saveAtlasQueueTransaction } from './atlasQueueTransaction.js';
import { appendExplicitQueueItem, clearPlayedQueue, clearUpcomingQueue, insertNextQueueItem, moveUpcomingQueueItem, normalizeOrdinaryQueue, removeGeneratedContinuation, removeUpcomingQueueItem } from './queueMutations.js';
import { createQueueSourceDescriptor } from './productInteractionContract.js';

const emptyQueue = { items: [], index: -1 };
function browserStorage() { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } }

// This hook is the single owner of queue navigation state. The refs are kept in
// lockstep with React state so audio event handlers can always read a current
// snapshot without a second, competing ownership model in App.
export function usePlayerQueueState(defaultControls, options = {}) {
  // Capture storage with the player lifetime: late callbacks cannot switch accounts.
  const storageRef = useRef(options.storage === undefined ? browserStorage() : options.storage);
  const queueStorage = () => storageRef.current;
  const restoredRef = useRef(undefined);
  if (restoredRef.current === undefined) {
    if (typeof window === 'undefined') restoredRef.current = null;
    else {
      const storage = queueStorage(), atlas = loadAtlasQueueTransaction(storage), ordinary = loadPersistedQueue(storage);
      restoredRef.current = atlas && Number(atlas.committedAt) >= Number(ordinary?.timestamp || 0)
        ? { ...atlas.queue, instanceId: atlas.queueInstanceId, atlasJourney: atlas.journey }
        : ordinary ? { ...ordinary, items: normalizeOrdinaryQueue(ordinary).items } : null;
    }
  }
  const restored = restoredRef.current;
  const [restoredPosition, setRestoredPosition] = useState(() => restorablePlaybackPosition(
    restored?.position,
    restored?.items?.[restored?.index]?.song?.duration
  ));
  const initialQueueRef = useRef(restored
    ? { ...(restored.instanceId ? { instanceId: restored.instanceId } : {}), ...(restored.source ? { source: restored.source } : {}), items: restored.items, index: restored.index }
    : emptyQueue);
  const initialControlsRef = useRef(restored
    ? { ...defaultControls, ...restored.controls }
    : defaultControls);
  const queueRef = useRef(initialQueueRef.current);
  const queueRevisionRef = useRef(0);
  const controlsRef = useRef(initialControlsRef.current);
  const historyRef = useRef(restored?.playHistory || []);
  const shufflePoolRef = useRef(restored?.shufflePool || []);
  const [queue, setQueue] = useState(initialQueueRef.current);
  const [queueRevision, setQueueRevision] = useState(0);
  const [controls, setControls] = useState(initialControlsRef.current);
  const [playHistoryCount, setPlayHistoryCount] = useState(historyRef.current.length);
  const [shufflePoolCount, setShufflePoolCount] = useState(shufflePoolRef.current.length);
  const queueUndoRef = useRef(null);
  const preparedAdvanceRef = useRef(null);
  const [canUndoQueueEdit, setCanUndoQueueEdit] = useState(false);

  const commitQueue = useCallback((nextQueue) => {
    nextQueue = normalizeOrdinaryQueue(nextQueue);
    preparedAdvanceRef.current = null;
    queueRef.current = nextQueue;
    queueRevisionRef.current += 1;
    setQueue(nextQueue);
    setQueueRevision(queueRevisionRef.current);
  }, []);

  const commitShufflePool = useCallback((pool) => {
    shufflePoolRef.current = pool;
    setShufflePoolCount(pool.length);
  }, []);

  const atlasJourneyRef = useRef(restored?.atlasJourney || null);
  const persist = useCallback((position = 0) => {
    if (atlasJourneyRef.current && queueRef.current?.instanceId) {
      const transaction = buildAtlasQueueTransaction({ queue: queueRef.current, shufflePool: shufflePoolRef.current, playHistory: historyRef.current, controls: controlsRef.current, position, persistedJourney: atlasJourneyRef.current });
      return saveAtlasQueueTransaction(queueStorage(), transaction);
    }
    return savePersistedQueue(queueStorage(), queueRef.current, shufflePoolRef.current, historyRef.current, controlsRef.current, position);
  }, []);

  const resetShufflePool = useCallback((nextQueue = queueRef.current) => {
    const items = Array.isArray(nextQueue?.items) ? nextQueue.items : [];
    const index = Number.isInteger(nextQueue?.index) ? nextQueue.index : -1;
    commitShufflePool(items.map((_, itemIndex) => itemIndex).filter((itemIndex) => itemIndex !== index));
  }, [commitShufflePool]);

  const replaceQueue = useCallback((nextQueue, { preserveHistory = false, preserveAtlasTransaction = false, queueAdvanced = false } = {}) => {
    if (preserveAtlasTransaction) {
      const current = queueRef.current;
      const sameInstance = Boolean(current?.instanceId && current.instanceId === nextQueue?.instanceId);
      const currentIds = (current?.items || []).map(item => item?.queueItemId);
      const nextIds = (nextQueue?.items || []).map(item => item?.queueItemId);
      if (!sameInstance || currentIds.length !== nextIds.length || !currentIds.every((id, index) => id === nextIds[index])) throw new Error('Atlas queue identity changed during playback transition');
    } else if (typeof window !== 'undefined') { clearAtlasQueueTransaction(queueStorage()); atlasJourneyRef.current = null; }
    const previousIndex = Number.isInteger(queueRef.current?.index) ? queueRef.current.index : -1;
    queueUndoRef.current = null;
    setCanUndoQueueEdit(false);
    commitQueue(nextQueue?.instanceId ? nextQueue : normalizeOrdinaryQueue(nextQueue));
    if (!preserveHistory) {
      historyRef.current = [];
      setPlayHistoryCount(0);
      resetShufflePool(nextQueue);
      return;
    }
    if (queueAdvanced) return;
    commitShufflePool(queueSelectionShufflePool(
      shufflePoolRef.current,
      previousIndex,
      nextQueue.index,
      nextQueue.items.length,
      controlsRef.current.shuffle
    ));
  }, [commitQueue, commitShufflePool, resetShufflePool]);

  const commitQueueEdit = useCallback((mutate) => {
    const current = queueRef.current;
    const nextQueue = mutate(current);
    if (nextQueue === current) return false;
    const previousPool = [...shufflePoolRef.current];
    const previousHistory = [...historyRef.current];
    const nextIndexes = queueEditIndexState(current, nextQueue, previousPool, previousHistory);
    queueUndoRef.current = { queue: current, pool: previousPool, history: previousHistory };
    setCanUndoQueueEdit(true);
    commitQueue(nextQueue);
    commitShufflePool(nextIndexes.pool);
    historyRef.current = nextIndexes.history;
    setPlayHistoryCount(nextIndexes.history.length);
    return true;
  }, [commitQueue, commitShufflePool]);

  const removeQueueItem = useCallback((itemIndex) => (
    commitQueueEdit((current) => removeUpcomingQueueItem(current, itemIndex))
  ), [commitQueueEdit]);

  const moveQueueItem = useCallback((itemIndex, direction) => (
    commitQueueEdit((current) => moveUpcomingQueueItem(current, itemIndex, direction))
  ), [commitQueueEdit]);

  const clearUpcoming = useCallback(() => commitQueueEdit(clearUpcomingQueue), [commitQueueEdit]);

  const clearPlayed = useCallback(() => commitQueueEdit(clearPlayedQueue), [commitQueueEdit]);

  const clearGenerated = useCallback(() => commitQueueEdit(removeGeneratedContinuation), [commitQueueEdit]);

  const playNext = useCallback((item) => commitQueueEdit((current) => insertNextQueueItem(current, item)), [commitQueueEdit]);

  const addToQueue = useCallback((item) => commitQueueEdit((current) => appendExplicitQueueItem(current, item)), [commitQueueEdit]);

  const undoQueueEdit = useCallback(() => {
    if (queueRef.current?.instanceId) {
      queueUndoRef.current = null;
      setCanUndoQueueEdit(false);
      return false;
    }
    const previous = queueUndoRef.current;
    if (!previous?.queue) return false;
    queueUndoRef.current = null;
    setCanUndoQueueEdit(false);
    commitQueue(previous.queue);
    commitShufflePool(previous.pool);
    historyRef.current = previous.history;
    setPlayHistoryCount(previous.history.length);
    return true;
  }, [commitQueue, commitShufflePool]);

  const updateControls = useCallback((patch) => {
    const current = controlsRef.current;
    const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
    if (current.shuffle !== next.shuffle || current.repeat !== next.repeat || current.repeatAll !== next.repeatAll) preparedAdvanceRef.current = null;
    controlsRef.current = next;
    setControls(next);
    if (!current.shuffle && next.shuffle) resetShufflePool();
  }, [resetShufflePool]);

  const selectQueueIndex = useCallback((index, sourceQueue = queueRef.current, { recordHistory = false } = {}) => {
    const item = sourceQueue?.items?.[index];
    if (!item?.song) return null;
    const history = queueSelectionHistory(sourceQueue, index, historyRef.current, 50, recordHistory);
    historyRef.current = history;
    setPlayHistoryCount(history.length);
    return item;
  }, []);

  // Preloading reserves a decision without consuming shuffle/history. Both
  // prepared playback and ordinary Next commit this same reservation once.
  const prepareAdvance = useCallback((direction = 'next', options = {}) => {
    const sourceQueue = queueRef.current;
    const existing = preparedAdvanceRef.current;
    if (existing && existing.direction === direction && existing.queue === sourceQueue
      && existing.shuffle === controlsRef.current.shuffle && existing.repeat === controlsRef.current.repeat && existing.repeatAll === controlsRef.current.repeatAll) return existing;
    const plan = queueAdvancePlan(sourceQueue, controlsRef.current, {
      direction,
      history: historyRef.current,
      pool: shufflePoolRef.current,
      fromEnded: options.fromEnded === true,
      random: options.random
    });
    const reservation = { queue: sourceQueue, direction, plan, shuffle: controlsRef.current.shuffle, repeat: controlsRef.current.repeat, repeatAll:controlsRef.current.repeatAll };
    preparedAdvanceRef.current = reservation;
    return reservation;
  }, []);

  const commitAdvance = useCallback((reservation) => {
    if (!reservation || preparedAdvanceRef.current !== reservation || queueRef.current !== reservation.queue
      || controlsRef.current.shuffle !== reservation.shuffle || controlsRef.current.repeat !== reservation.repeat || controlsRef.current.repeatAll !== reservation.repeatAll) return null;
    preparedAdvanceRef.current = null;
    const { queue: sourceQueue, plan } = reservation;
    const history = plan.nextIndex >= 0
      ? queueSelectionHistory(sourceQueue, plan.nextIndex, plan.history, 50, plan.recordHistory)
      : plan.history;
    historyRef.current = history;
    setPlayHistoryCount(history.length);
    commitShufflePool(plan.pool);
    if (plan.nextIndex < 0 || plan.nextIndex >= sourceQueue.items.length || queueRef.current !== sourceQueue) {
      return { ...plan, history, item: null };
    }
    return { ...plan, history, item: sourceQueue.items[plan.nextIndex] };
  }, [commitShufflePool]);

  const advanceQueue = useCallback((direction = 'next', options = {}) => (
    commitAdvance(prepareAdvance(direction, options))
  ), [commitAdvance, prepareAdvance]);

  const commitAtlasTransaction = useCallback(({ queue: nextQueue, journey, position = 0 }) => {
    if (typeof window === 'undefined') throw new Error('Atlas queue transaction requires browser storage');
    const nextControls = { ...controlsRef.current, shuffle: false };
    const transaction = buildAtlasQueueTransaction({ queue: nextQueue, shufflePool: nextQueue.items.map((_, index) => index).filter(index => index !== nextQueue.index), playHistory: [], controls: nextControls, position, persistedJourney: journey });
    if (saveAtlasQueueTransaction(queueStorage(), transaction) === null) throw new Error('Atlas queue transaction could not be persisted');
    // An ordinary-queue undo snapshot must never cross into an authoritative
    // Atlas transaction, where queue order is frozen with the Journey.
    queueUndoRef.current = null;
    setCanUndoQueueEdit(false);
    atlasJourneyRef.current = transaction.journey; historyRef.current = []; setPlayHistoryCount(0); controlsRef.current = nextControls; setControls(nextControls); commitShufflePool(transaction.queue.shufflePool); commitQueue(nextQueue);
    return transaction.journey;
  }, [commitQueue, commitShufflePool]);

  const persistAtlasJourney = useCallback((journey, position = 0) => {
    if (!atlasJourneyRef.current || !queueRef.current?.instanceId) throw new Error('Active Atlas queue transaction is required');
    const transaction = buildAtlasQueueTransaction({ queue: queueRef.current, shufflePool: shufflePoolRef.current, playHistory: historyRef.current, controls: controlsRef.current, position, persistedJourney: journey });
    if (saveAtlasQueueTransaction(queueStorage(), transaction) === null) throw new Error('Atlas Journey history could not be persisted');
    atlasJourneyRef.current = transaction.journey;
    return transaction.journey;
  }, []);

  const detachAtlasJourney = useCallback((position = 0) => {
    const current = queueRef.current;
    const detachedQueue = normalizeOrdinaryQueue({
      items: current.items,
      index: current.index,
      source: createQueueSourceDescriptor({ kind: 'ad-hoc', label: 'Detached Journey queue' })
    });
    const saved = savePersistedQueue(queueStorage(), detachedQueue, shufflePoolRef.current, historyRef.current, controlsRef.current, position);
    if (saved === null) throw new Error('Detached Journey queue could not be persisted');
    clearAtlasQueueTransaction(queueStorage());
    atlasJourneyRef.current = null;
    queueUndoRef.current = null;
    setCanUndoQueueEdit(false);
    commitQueue(detachedQueue);
    return detachedQueue;
  }, [commitQueue]);

  const restorationSnapshot = useCallback(() => buildPersistedQueueState(queueRef.current, shufflePoolRef.current, historyRef.current, controlsRef.current, restoredPosition), [restoredPosition]);

  const commitRestorationRepair = useCallback((candidate, expectedRevision, expectedControls) => {
    const state = validatePersistedQueue(candidate);
    if (!state || atlasJourneyRef.current || queueRevisionRef.current !== expectedRevision || controlsRef.current !== expectedControls) return false;
    queueUndoRef.current = null;
    setCanUndoQueueEdit(false);
    historyRef.current = state.playHistory;
    setPlayHistoryCount(state.playHistory.length);
    commitShufflePool(state.shufflePool);
    setRestoredPosition(state.position);
    commitQueue(normalizeOrdinaryQueue({ items: state.items, index: state.index, source: state.source }));
    return true;
  }, [commitQueue, commitShufflePool]);

  return {
    queue,
    queueRef,
    queueRevision,
    queueRevisionRef,
    restorationSnapshot,
    commitRestorationRepair,
    controls,
    controlsRef,
    playHistoryCount,
    playHistoryRef: historyRef,
    shufflePoolCount,
    shufflePoolRef,
    canUndoQueueEdit,
    restoredPosition,
    hasRestoredQueue: Boolean(restored?.items?.length),
    restoredAtlasJourney: restored?.atlasJourney || null,
    replaceQueue,
    removeQueueItem,
    moveQueueItem,
    clearUpcoming,
    clearPlayed,
    clearGenerated,
    playNext,
    addToQueue,
    undoQueueEdit,
    commitAtlasTransaction,
    persistAtlasJourney,
    detachAtlasJourney,
    atlasJourneyRef,
    updateControls,
    selectQueueIndex,
    advanceQueue,
    prepareAdvance,
    commitAdvance,
    persist
  };
}
