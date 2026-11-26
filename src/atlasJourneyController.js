import { ATLAS_CONTRACT_VERSION, BRANCH_B_LIMITS, parsePersistedJourneyState, parseResolvedJourney, validateJourneyQueueBinding } from '../shared/sonic-atlas/index.js';
import { atlasJourneyQueueReplacement } from './atlasJourneyQueue.js';
import { appendAtlasJourneyEvent, atlasJourneyDestinationPointId, atlasJourneyEventTypes, createAtlasJourneyEvent } from './atlasJourneyEvents.js';

function same(value) { return JSON.stringify(value); }

export function createAtlasJourneyController({ planJourney, extendJourney, revalidateJourney, queueAdapter, getPlaybackPosition = () => 0, now = () => new Date().toISOString() } = {}) {
  if (typeof planJourney !== 'function' || typeof queueAdapter?.snapshot !== 'function' || typeof queueAdapter?.commitAtlasTransaction !== 'function' || typeof queueAdapter?.persistAtlasJourney !== 'function') {
    throw new TypeError('Atlas Journey controller dependencies are required');
  }
  let preview = null;
  let previewGeneration = -1;
  let persisted = null;
  let pending = null;
  let pendingKind = '';
  let generation = 0;
  let events = Object.freeze([]);
  let revalidation = null;
  let pendingRerouteReason = '';
  let extensionError = '';

  const record = (type, details = {}, occurredAt = now()) => {
    const event = createAtlasJourneyEvent(type, details, occurredAt);
    events = appendAtlasJourneyEvent(events, event);
    return event;
  };
  const completed = () => Boolean(persisted?.routeHistory?.at(-1)?.type === atlasJourneyEventTypes.complete && persisted.routeHistory.at(-1).journeyId === persisted.journey.journeyId);
  const state = () => {
    const snapshot = queueAdapter.snapshot();
    return Object.freeze({
    preview,
    persisted,
    events,
    revalidation,
    extensionError,
    status: pending ? pendingKind || 'planning' : preview ? 'preview-ready' : persisted ? completed() ? 'completed' : 'active' : 'idle',
    queueAttached: persisted ? validateJourneyQueueBinding(persisted, snapshot).attached : false,
    currentQueueItemId: snapshot.items?.[snapshot.index]?.queueItemId || '',
    generation
    });
  };
  function cancel() { generation += 1; pending?.abort(); pending = null; pendingKind = ''; preview = null; previewGeneration = -1; revalidation = null; pendingRerouteReason = ''; extensionError = ''; }
  function persistRouteEvent(event) {
    if (!persisted) throw new Error('Active Atlas Journey is required');
    const routeHistory = [...persisted.routeHistory, event].slice(-50), savedAt = event.occurredAt > persisted.savedAt ? event.occurredAt : persisted.savedAt;
    persisted = queueAdapter.persistAtlasJourney(parsePersistedJourneyState({ ...persisted, routeHistory, savedAt }), Math.max(0, Number(getPlaybackPosition()) || 0));
    return event;
  }
  function recordPersisted(type, details = {}, occurredAt = now()) {
    const event = createAtlasJourneyEvent(type, details, occurredAt);
    persistRouteEvent(event);
    events = appendAtlasJourneyEvent(events, event);
    return event;
  }
  async function plan(input) {
    cancel();
    const requestGeneration = generation;
    const controller = new AbortController();
    pending = controller;
    pendingKind = 'planning';
    try {
      const result = parseResolvedJourney(await planJourney({ ...input, signal: controller.signal }));
      if (requestGeneration !== generation) throw new DOMException('Superseded Atlas plan', 'AbortError');
      preview = result;
      previewGeneration = requestGeneration;
      const destinationPointId = atlasJourneyDestinationPointId(result);
      if (persisted && destinationPointId !== atlasJourneyDestinationPointId(persisted.journey)) {
        record(atlasJourneyEventTypes.destinationChange, { journeyId: persisted.journey.journeyId, destinationPointId }, result.frozenAt);
      }
      record(atlasJourneyEventTypes.preview, { journeyId: result.journeyId, destinationPointId }, result.frozenAt);
      return result;
    } finally {
      if (pending === controller) { pending = null; pendingKind = ''; }
    }
  }
  function start({ startStopId } = {}) {
    if (!preview || pending || previewGeneration !== generation) throw new Error('Current Atlas Journey preview is required');
    const priorJourney = persisted?.journey || null;
    const destinationChanged = priorJourney && atlasJourneyDestinationPointId(priorJourney) !== atlasJourneyDestinationPointId(preview);
    const before = queueAdapter.snapshot();
    const replacement = atlasJourneyQueueReplacement(preview, { startStopId, currentQueueItemId: before.items?.[before.index]?.queueItemId });
    const savedAt = now();
    const activeItem = replacement.queue.items[replacement.queue.index];
    const activeStop = replacement.journey.stops.find(stop => stop.queueItemId === activeItem?.queueItemId);
    const rerouteReason = pendingRerouteReason || (destinationChanged ? 'destination changed' : priorJourney ? 'route replanned' : '');
    const rerouteEvent = priorJourney ? createAtlasJourneyEvent(atlasJourneyEventTypes.reroute, { journeyId: replacement.journey.journeyId, stopId: activeStop?.stopId, queueItemId: activeItem?.queueItemId, destinationPointId: atlasJourneyDestinationPointId(replacement.journey), reason: rerouteReason }, savedAt) : null;
    const saved = parsePersistedJourneyState({ contractVersion: ATLAS_CONTRACT_VERSION, kind: 'persisted-journey', persistenceVersion: 1, journey: replacement.journey, queueBinding: { queueInstanceId: replacement.queue.instanceId, entries: replacement.journey.stops.map(stop => ({ stopId: stop.stopId, queueItemId: stop.queueItemId })) }, extensionHistory: [], routeHistory: [...(persisted?.routeHistory || []), ...(rerouteEvent ? [rerouteEvent] : [])].slice(-50), savedAt });
    persisted = queueAdapter.commitAtlasTransaction({ queue: replacement.queue, journey: saved, position: Math.max(0, Number(getPlaybackPosition()) || 0) });
    if (rerouteEvent) events = appendAtlasJourneyEvent(events, rerouteEvent); else record(atlasJourneyEventTypes.start, { journeyId: replacement.journey.journeyId, stopId: activeStop?.stopId, queueItemId: activeItem?.queueItemId, destinationPointId: atlasJourneyDestinationPointId(replacement.journey) }, savedAt);
    preview = null;
    previewGeneration = -1;
    pendingRerouteReason = '';
    return persisted;
  }
  function recordPlaybackAction(type, queueItemId, reason = '') {
    if (![atlasJourneyEventTypes.skip, atlasJourneyEventTypes.dislike].includes(type)) throw new TypeError('Atlas playback action must be skip or dislike');
    if (!persisted) throw new Error('Active Atlas Journey is required');
    const snapshot = queueAdapter.snapshot();
    if (!validateJourneyQueueBinding(persisted, snapshot).attached) throw new Error('Atlas Journey is detached from the authoritative queue');
    const entry = persisted.queueBinding.entries.find(item => item.queueItemId === queueItemId);
    if (!entry) throw new TypeError('Atlas playback action target is absent from the authoritative queue');
    return recordPersisted(type, { journeyId: persisted.journey.journeyId, stopId: entry.stopId, queueItemId, destinationPointId: atlasJourneyDestinationPointId(persisted.journey), reason });
  }
  function complete(queueItemId) {
    if (!persisted) throw new Error('Active Atlas Journey is required');
    const snapshot = queueAdapter.snapshot(), binding = validateJourneyQueueBinding(persisted, snapshot), finalStop = persisted.journey.stops.at(-1);
    if (!binding.attached || snapshot.index !== snapshot.items.length - 1 || queueItemId !== finalStop.queueItemId || snapshot.items.at(-1)?.queueItemId !== queueItemId) throw new Error('Atlas Journey completion requires the final authoritative queue item');
    if (completed()) return persisted.routeHistory.at(-1);
    return recordPersisted(atlasJourneyEventTypes.complete, { journeyId: persisted.journey.journeyId, stopId: finalStop.stopId, queueItemId, destinationPointId: atlasJourneyDestinationPointId(persisted.journey), reason: 'natural queue end' });
  }
  async function restore(value) {
    cancel();
    const parsed = parsePersistedJourneyState(value), snapshot = queueAdapter.snapshot(), binding = validateJourneyQueueBinding(parsed, snapshot);
    persisted = parsed; events = Object.freeze([...parsed.routeHistory]); revalidation = null;
    if (completed() || typeof revalidateJourney !== 'function' || !binding.attached) return Object.freeze({ journey: parsed, attached: binding.attached, revalidation });
    const requestGeneration = generation, controller = new AbortController();
    pending = controller; pendingKind = 'revalidating';
    const currentIndex = Math.min(parsed.journey.stops.length - 1, Math.max(0, Number(snapshot.index) || 0)), entries = parsed.journey.stops.slice(currentIndex).map((stop, offset) => ({ stopIndex: currentIndex + offset, stopId: stop.stopId, pointId: stop.pointId, trackRef: stop.playback.trackRef }));
    try {
      const result = await revalidateJourney({ requestId: `resume-${parsed.journey.journeyId}-${Date.now()}`, projectionDigest: parsed.journey.identity.projectionDigest, entries, signal: controller.signal });
      if (requestGeneration !== generation) throw new DOMException('Superseded Atlas revalidation', 'AbortError');
      revalidation = result;
      if (result.status === 'repair-required' && result.repair?.waypoints?.length >= 2) {
        const repaired = parseResolvedJourney(await planJourney({ requestId: `repair-${parsed.journey.journeyId}-${Date.now()}`, waypoints: result.repair.waypoints, targetTrackCount: result.repair.targetTrackCount, signal: controller.signal }));
        if (requestGeneration !== generation) throw new DOMException('Superseded Atlas repair', 'AbortError');
        preview = repaired; previewGeneration = requestGeneration; pendingRerouteReason = 'saved Journey repaired';
      }
      return Object.freeze({ journey: parsed, attached: binding.attached, revalidation });
    } catch (error) {
      if (error?.name !== 'AbortError' && !revalidation) revalidation = Object.freeze({ status: 'unavailable', message: String(error?.message || 'Saved Journey revalidation failed.') });
      if (error?.name === 'AbortError') throw error;
      return Object.freeze({ journey: parsed, attached: binding.attached, revalidation });
    } finally {
      if (pending === controller) { pending = null; pendingKind = ''; }
    }
  }
  function detach() { cancel(); persisted = null; events = Object.freeze([]); revalidation = null; }
 // A completion marker belongs to the frozen destination. Appending reopens
 // that destination; extensionHistory retains the old boundary and revision.
 function appendResolved(nextJourneyValue){if(!persisted)throw new Error('Active Atlas Journey is required');const before=queueAdapter.snapshot();if(!validateJourneyQueueBinding(persisted,before).attached)throw new Error('Atlas Journey is detached from the authoritative queue');const current=persisted.journey,next=parseResolvedJourney(nextJourneyValue);if(next.journeyId!==current.journeyId||next.requestId!==current.requestId||next.frozenRevision!==current.frozenRevision+1||same(next.identity)!==same(current.identity)||next.frozenAt<current.frozenAt)throw new TypeError('Atlas extension identity or revision is invalid');if(same(next.waypoints.slice(0,current.waypoints.length))!==same(current.waypoints)||same(next.segments.slice(0,current.segments.length))!==same(current.segments)||same(next.stops.slice(0,current.stops.length))!==same(current.stops))throw new TypeError('Atlas extension changed frozen prefix');if(next.waypoints.length<=current.waypoints.length||next.stops.length<=current.stops.length||next.segments.length<=current.segments.length||next.segments[current.segments.length].startStopIndex!==current.stops.length-1)throw new TypeError('Atlas extension must append a contiguous suffix');const replacement=atlasJourneyQueueReplacement(next,{currentQueueItemId:before.items?.[before.index]?.queueItemId}),added=next.segments.slice(current.segments.length).map(segment=>segment.segmentId),saved=parsePersistedJourneyState({contractVersion:ATLAS_CONTRACT_VERSION,kind:'persisted-journey',persistenceVersion:1,journey:next,queueBinding:{queueInstanceId:replacement.queue.instanceId,entries:next.stops.map(stop=>({stopId:stop.stopId,queueItemId:stop.queueItemId}))},extensionHistory:[...persisted.extensionHistory,{revision:next.frozenRevision,operation:'append-segment',retainedThroughStopId:current.stops.at(-1).stopId,addedSegmentIds:added,occurredAt:next.frozenAt}],routeHistory:persisted.routeHistory.filter(event=>event.type!=='complete'||event.journeyId!==current.journeyId),savedAt:now()});persisted=queueAdapter.commitAtlasTransaction({queue:replacement.queue,journey:saved,position:Math.max(0,Number(getPlaybackPosition())||0)});return persisted}
  async function extend({ targetTrackCount = BRANCH_B_LIMITS.minTracksPerSegment } = {}) {
    if (!persisted) throw new Error('Active Atlas Journey is required');
    if (pending) throw new Error('Atlas Journey work is already in progress');
    if (typeof extendJourney !== 'function') throw new Error('Atlas Journey extension is unavailable');
    const snapshot = queueAdapter.snapshot();
    if (!validateJourneyQueueBinding(persisted, snapshot).attached) throw new Error('Atlas Journey is detached from the authoritative queue');
    const requestGeneration = generation;
    const controller = new AbortController();
    pending = controller;
    pendingKind = 'extending';
    extensionError = '';
    try {
      const result = await extendJourney({
        requestId: `extend-${persisted.journey.journeyId}-${persisted.journey.frozenRevision + 1}-${Date.now()}`,
        journey: persisted.journey,
        targetTrackCount,
        signal: controller.signal
      });
      if (requestGeneration !== generation) throw new DOMException('Superseded Atlas extension', 'AbortError');
      return appendResolved(result);
    } catch (error) {
      if (error?.name !== 'AbortError') extensionError = error?.atlas?.message || error?.message || 'Sonic Atlas could not extend this Journey.';
      throw error;
    } finally {
      if (pending === controller) { pending = null; pendingKind = ''; }
    }
  }
  return Object.freeze({ plan, start, restore, detach, appendResolved, extend, recordPlaybackAction, complete, cancel, getState: state });
}
