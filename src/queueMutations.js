import { createQueueSourceDescriptor, queueItemProvenance, validateQueueSourceDescriptor } from './productInteractionContract.js';

export function queueCanEdit(queue = {}) {
  if (queue.instanceId) return false;
  return Array.isArray(queue.items);
}

export function normalizeOrdinaryQueue(queue = {}) {
  if (queue.instanceId) return queue;
  const entries = Array.isArray(queue.items) ? queue.items : [];
  const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
  const reserved = new Set(entries.map(item => item?.queueItemId).filter(validId));
  const seen = new Set();
  const items = entries.map(item => {
    let queueItemId = item?.queueItemId;
    if (!validId(queueItemId) || seen.has(queueItemId)) {
      do { queueItemId = globalThis.crypto?.randomUUID?.() || `ordinary-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
      while (reserved.has(queueItemId));
      reserved.add(queueItemId);
    }
    seen.add(queueItemId);
    const provenance = queueItemProvenance(item?.provenance);
    return item?.queueItemId === queueItemId && item?.provenance === provenance
      ? item : { ...item, queueItemId, provenance };
  });
  return {
    ...queue,
    items,
    source: validateQueueSourceDescriptor(queue.source) || createQueueSourceDescriptor()
  };
}

function withShiftedGeneratedBoundary(queue, insertedAt) {
  const source = validateQueueSourceDescriptor(queue.source) || createQueueSourceDescriptor();
  if (!Number.isInteger(source.generatedBoundary) || insertedAt > source.generatedBoundary) return source;
  return createQueueSourceDescriptor({ ...source, generatedBoundary: source.generatedBoundary + 1 });
}

function withGeneratedBoundary(queue, items) {
  const source = validateQueueSourceDescriptor(queue.source) || createQueueSourceDescriptor();
  const generatedBoundary = items.findIndex((item) => item?.provenance === 'generated');
  const currentBoundary = Number.isInteger(source.generatedBoundary) ? source.generatedBoundary : -1;
  if (currentBoundary === generatedBoundary) return source;
  const { generatedBoundary: _previousBoundary, ...baseSource } = source;
  return createQueueSourceDescriptor({
    ...baseSource,
    ...(generatedBoundary >= 0 ? { generatedBoundary } : {})
  });
}

export function reconcileGeneratedBoundary(queue = {}) {
  const items = Array.isArray(queue.items) ? queue.items : [];
  return { ...queue, items, source: withGeneratedBoundary(queue, items) };
}

export function insertNextQueueItem(queue = {}, item) {
  if (!queueCanEdit(queue) || !item?.song?.id || queue.index < 0) return queue;
  const insertedAt = Math.min(queue.items.length, queue.index + 1);
  const { queueItemId: _previousOccurrence, ...entry } = item;
  const explicitItem = { ...entry, provenance: 'explicit' };
  return {
    ...queue,
    items: [...queue.items.slice(0, insertedAt), explicitItem, ...queue.items.slice(insertedAt)],
    source: withShiftedGeneratedBoundary(queue, insertedAt)
  };
}

export function appendExplicitQueueItem(queue = {}, item) {
  if (!queueCanEdit(queue) || !item?.song?.id || queue.index < 0) return queue;
  const source = validateQueueSourceDescriptor(queue.source) || createQueueSourceDescriptor();
  const firstGenerated = queue.items.findIndex((entry, index) => index > queue.index && entry?.provenance === 'generated');
  const descriptorBoundary = Number.isInteger(source.generatedBoundary) && source.generatedBoundary > queue.index
    ? Math.min(source.generatedBoundary, queue.items.length)
    : -1;
  const insertedAt = firstGenerated >= 0 ? firstGenerated : descriptorBoundary >= 0 ? descriptorBoundary : queue.items.length;
  const { queueItemId: _previousOccurrence, ...entry } = item;
  const explicitItem = { ...entry, provenance: 'explicit' };
  return {
    ...queue,
    items: [...queue.items.slice(0, insertedAt), explicitItem, ...queue.items.slice(insertedAt)],
    source: withShiftedGeneratedBoundary(queue, insertedAt)
  };
}

export function removeUpcomingQueueItem(queue = {}, itemIndex) {
  if (!queueCanEdit(queue) || !Number.isInteger(itemIndex) || itemIndex <= queue.index || itemIndex >= queue.items.length) return queue;
  const items = queue.items.filter((_, index) => index !== itemIndex);
  return { ...queue, items, source: withGeneratedBoundary(queue, items) };
}

export function moveUpcomingQueueItem(queue = {}, itemIndex, direction) {
  const offset = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const targetIndex = Number.isInteger(direction) ? direction : itemIndex + offset;
  if (!queueCanEdit(queue) || !Number.isInteger(itemIndex) || itemIndex >= queue.items.length || targetIndex === itemIndex || itemIndex <= queue.index || targetIndex <= queue.index || targetIndex >= queue.items.length) return queue;
  const crossesGeneratedBoundary = queue.items.slice(Math.min(itemIndex,targetIndex),Math.max(itemIndex,targetIndex)+1).some(item=>(item?.provenance === 'generated') !== (queue.items[itemIndex]?.provenance === 'generated'));
  if (crossesGeneratedBoundary) return queue;
  const items = [...queue.items];
  const [moved] = items.splice(itemIndex,1);
  items.splice(targetIndex,0,moved);
  return { ...queue, items, source: withGeneratedBoundary(queue, items) };
}

export function clearUpcomingQueue(queue = {}) {
  if (!queueCanEdit(queue) || queue.index < 0 || queue.index >= queue.items.length - 1) return queue;
  const items = queue.items.slice(0, queue.index + 1);
  return { ...queue, items, source: withGeneratedBoundary(queue, items) };
}

export function clearPlayedQueue(queue = {}) {
  if (!queueCanEdit(queue) || !Number.isInteger(queue.index) || queue.index <= 0 || queue.index >= queue.items.length) return queue;
  const items = queue.items.slice(queue.index);
  return { ...queue, items, index: 0, source: withGeneratedBoundary(queue, items) };
}

export function removeGeneratedContinuation(queue = {}) {
  if (!queueCanEdit(queue) || !Number.isInteger(queue.index) || queue.index < 0) return queue;
  const source = validateQueueSourceDescriptor(queue.source) || createQueueSourceDescriptor();
  const generatedIndexes = queue.items
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => index > queue.index && item?.provenance === 'generated')
    .map(({ index }) => index);
  let items;
  if (generatedIndexes.length) {
    const generated = new Set(generatedIndexes);
    items = queue.items.filter((_, index) => !generated.has(index));
  } else if (Number.isInteger(source.generatedBoundary) && source.generatedBoundary > queue.index && source.generatedBoundary < queue.items.length) {
    items = queue.items.slice(0, source.generatedBoundary);
  } else {
    return queue;
  }
  return { ...queue, items, source: withGeneratedBoundary(queue, items) };
}
