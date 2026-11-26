import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeCapture, signalMetrics } from '../scripts/audio-evidence-analyze.mjs';
import { wavFromPcm16 } from '../scripts/audio-transition-fixtures.mjs';

test('audio evidence analyzer finds a known inter-segment gap and signal peak', () => {
  const sampleRate = 48_000;
  const pcm = Buffer.alloc(sampleRate * 2 * 2);
  for (let frame = 0; frame < sampleRate; frame += 1) {
    const active = (frame >= 4_800 && frame < 14_400) || (frame >= 19_200 && frame < 28_800);
    const value = active ? Math.round(0.5 * 32767 * Math.sin(2 * Math.PI * 440 * frame / sampleRate)) : 0;
    pcm.writeInt16LE(value, frame * 4);
    pcm.writeInt16LE(value, frame * 4 + 2);
  }
  const directory = mkdtempSync(join(tmpdir(), 'navimuse-audio-evidence-'));
  const file = join(directory, 'capture.wav');
  writeFileSync(file, wavFromPcm16(pcm));
  const result = analyzeCapture(file);
  assert.equal(result.primarySegments.length, 2);
  assert.equal(result.interSegmentGaps[0].milliseconds, 100);
  assert.ok(result.peakDbfs < -6 && result.peakDbfs > -6.1);
});

test('signal metrics reports clipped PCM16 samples', () => {
  const metrics = signalMetrics({ sampleRate: 48_000, frames: 3, samples: Float64Array.from([0, 32767 / 32768, -1]) });
  assert.equal(metrics.clippedSamples, 2);
});
