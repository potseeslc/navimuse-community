import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BITS_PER_SAMPLE,
  CHANNELS,
  FIXTURE_VERSION,
  SAMPLE_RATE,
  buildTransitionFixtures
} from '../scripts/audio-transition-fixtures.mjs';

test('M8 engine gate fixtures freeze deterministic PCM boundaries and probes', () => {
  const fixtures = buildTransitionFixtures();
  const byName = Object.fromEntries(fixtures.map((fixture) => [fixture.name, fixture]));

  assert.equal(FIXTURE_VERSION, 1);
  assert.equal(SAMPLE_RATE, 48_000);
  assert.equal(CHANNELS, 2);
  assert.equal(BITS_PER_SAMPLE, 16);
  assert.deepEqual(Object.keys(byName), [
    'continuous-reference',
    'continuous-track-a',
    'continuous-track-b',
    'silence-probe',
    'loudness-minus-18dbfs',
    'loudness-minus-6dbfs',
    'peak-probe'
  ]);

  const referencePcm = byName['continuous-reference'].wav.subarray(44);
  const joinedPair = Buffer.concat([
    byName['continuous-track-a'].wav.subarray(44),
    byName['continuous-track-b'].wav.subarray(44)
  ]);
  assert.deepEqual(joinedPair, referencePcm);
  assert.equal(byName['continuous-reference'].metadata.boundaryFrame, SAMPLE_RATE * 4);
  assert.equal(byName['continuous-track-a'].metadata.frames, SAMPLE_RATE * 4);
  assert.equal(byName['continuous-track-b'].metadata.frames, SAMPLE_RATE * 4);
  assert.equal(byName['silence-probe'].metadata.silenceStartFrame, SAMPLE_RATE * 2);
  assert.equal(byName['silence-probe'].metadata.silenceEndFrame, SAMPLE_RATE * 3);
});

test('M8 engine gate fixture hashes change only with an explicit fixture revision', () => {
  const hashes = Object.fromEntries(buildTransitionFixtures().map((fixture) => [fixture.name, fixture.metadata.sha256]));
  assert.deepEqual(hashes, {
    'continuous-reference': '09f6f6fd702a66304009dc34e36b57745213d6ca101d72bdd47574e02c2686e7',
    'continuous-track-a': '920ad698637127c65af94be3ef183a03b10fbdd4b3f032a824aca904a394eefd',
    'continuous-track-b': 'e5f964e093b217b73684ed268b8749ae4b0467c8b7bdaa556757e6c583c23e6e',
    'silence-probe': 'd362afe6a0bb52159007041d25d48c3ec15c56f367657e4858cc4fc183db4361',
    'loudness-minus-18dbfs': 'b4b7ab8f35b95cb0f12adc575662975622e9571a5f1ac9a8349902c42c2b4e95',
    'loudness-minus-6dbfs': '7f2fc2132976dfb0b6176f9c3b5ad691f9ae9a01f4b5e1cf1e960b2bafd69d3a',
    'peak-probe': '23b09eb9dc699b24ee8732e05e4f3bfc845677aba371ee9e57e5edfc8c6e2ece'
  });
});
