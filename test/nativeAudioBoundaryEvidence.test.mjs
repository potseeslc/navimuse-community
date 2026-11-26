import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../scripts/native-audio-boundary.swift', import.meta.url), 'utf8');

test('native boundary comparator queues both fixtures on one AVAudioPlayerNode', () => {
  assert.match(source, /AVAudioEngine\(\)/);
  assert.match(source, /AVAudioPlayerNode\(\)/);
  assert.equal((source.match(/player\.scheduleBuffer/g) || []).length, 2);
  assert.match(source, /player\.play\(\)/);
});
