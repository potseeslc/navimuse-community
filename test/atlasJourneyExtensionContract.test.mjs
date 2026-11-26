import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyExtensionRequest, parseJourneyExtensionRequest } from '../shared/sonic-atlas/index.js';
import { clone, journey } from './contracts/sonicAtlasFixtures.mjs';

test('Journey extension request freezes the exact safe contract', () => {
  const request = createJourneyExtensionRequest({ requestId: 'extend-1', journey, targetTrackCount: 10 });
  assert.equal(request.kind, 'journey-extension-request');
  assert.equal(request.journey.journeyId, journey.journeyId);
  assert.equal(request.targetTrackCount, 10);
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.journey), true);
});

test('Journey extension request rejects unknown fields and invalid bounds', () => {
  const valid = createJourneyExtensionRequest({ requestId: 'extend-1', journey, targetTrackCount: 10 });
  assert.throws(() => parseJourneyExtensionRequest({ ...valid, rawTrackId: 'secret' }), /unknown field|forbidden/i);
  assert.throws(() => parseJourneyExtensionRequest({ ...clone(valid), targetTrackCount: 9 }), /targetTrackCount/);
  assert.throws(() => parseJourneyExtensionRequest({ ...clone(valid), targetTrackCount: 51 }), /targetTrackCount/);
});
