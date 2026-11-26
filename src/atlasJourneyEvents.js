export const atlasJourneyEventTypes = Object.freeze({
  preview: 'preview',
  start: 'start',
  skip: 'skip',
  dislike: 'dislike',
  destinationChange: 'destination-change',
  reroute: 'reroute',
  complete: 'complete'
});

const allowedTypes = new Set(Object.values(atlasJourneyEventTypes));

export function createAtlasJourneyEvent(type, details = {}, occurredAt = new Date().toISOString()) {
  if (!allowedTypes.has(type)) throw new TypeError(`Unsupported Atlas Journey event: ${type}`);
  return Object.freeze({
    type,
    occurredAt,
    journeyId: String(details.journeyId || ''),
    stopId: String(details.stopId || ''),
    queueItemId: String(details.queueItemId || ''),
    destinationPointId: String(details.destinationPointId || ''),
    reason: String(details.reason || '')
  });
}

export function appendAtlasJourneyEvent(events, event, limit = 50) {
  return Object.freeze([...(Array.isArray(events) ? events : []), event].slice(-limit));
}

export function atlasJourneyDestinationPointId(journey) {
  return String(journey?.waypoints?.at(-1)?.pointId || '');
}
