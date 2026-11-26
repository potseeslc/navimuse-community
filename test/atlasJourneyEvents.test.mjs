import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAtlasJourneyEvent,
  atlasJourneyDestinationPointId,
  atlasJourneyEventTypes,
  createAtlasJourneyEvent
} from '../src/atlasJourneyEvents.js';
import { journey } from './contracts/sonicAtlasFixtures.mjs';

test('Atlas Journey events use a bounded exact action vocabulary', () => {
  const event = createAtlasJourneyEvent(atlasJourneyEventTypes.skip, {
    journeyId: 'journey-1', stopId: 'stop-1', queueItemId: 'queue-1', reason: 'manual-next'
  }, '2026-08-29T17:00:00.000Z');
  assert.deepEqual(event, {
    type: 'skip', occurredAt: '2026-08-29T17:00:00.000Z', journeyId: 'journey-1',
    stopId: 'stop-1', queueItemId: 'queue-1', destinationPointId: '', reason: 'manual-next'
  });
  assert.throws(() => createAtlasJourneyEvent('teleport'), /Unsupported Atlas Journey event/);
});

test('Atlas Journey event history is bounded and destination is derived from the frozen route', () => {
  const events = [1, 2, 3].reduce((history, value) => appendAtlasJourneyEvent(history, { value }, 2), []);
  assert.deepEqual(events, [{ value: 2 }, { value: 3 }]);
  assert.equal(atlasJourneyDestinationPointId(journey), 'point-b');
});
