import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const db = (value) => value > 0 ? 20 * Math.log10(value) : -Infinity;

export function readPcm16Wav(file) {
  const bytes = readFileSync(file);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a RIFF/WAVE file`);
  }
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        audioFormat: bytes.readUInt16LE(body),
        channels: bytes.readUInt16LE(body + 2),
        sampleRate: bytes.readUInt32LE(body + 4),
        bitsPerSample: bytes.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      data = bytes.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (!format || !data || format.audioFormat !== 1 || format.bitsPerSample !== 16) {
    throw new Error(`${file} must be PCM16 WAV`);
  }
  const frames = Math.floor(data.length / (format.channels * 2));
  const samples = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      sum += data.readInt16LE((frame * format.channels + channel) * 2) / 32768;
    }
    samples[frame] = sum / format.channels;
  }
  return {
    ...format,
    frames,
    samples,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

export function signalMetrics(wav, { thresholdDb = -50, windowMs = 5 } = {}) {
  const windowFrames = Math.max(1, Math.round(wav.sampleRate * windowMs / 1000));
  const active = [];
  let sumSquares = 0;
  let peak = 0;
  let clippedSamples = 0;
  for (let i = 0; i < wav.samples.length; i += 1) {
    const magnitude = Math.abs(wav.samples[i]);
    peak = Math.max(peak, magnitude);
    sumSquares += wav.samples[i] ** 2;
    if (magnitude >= 32767 / 32768) clippedSamples += 1;
  }
  for (let start = 0; start < wav.frames; start += windowFrames) {
    const end = Math.min(wav.frames, start + windowFrames);
    let energy = 0;
    for (let i = start; i < end; i += 1) energy += wav.samples[i] ** 2;
    if (db(Math.sqrt(energy / (end - start))) > thresholdDb) active.push([start, end]);
  }
  const segments = [];
  for (const [start, end] of active) {
    const previous = segments.at(-1);
    if (previous && start - previous.endFrame <= windowFrames) previous.endFrame = end;
    else segments.push({ startFrame: start, endFrame: end });
  }
  return {
    durationSeconds: wav.frames / wav.sampleRate,
    rmsDbfs: db(Math.sqrt(sumSquares / wav.frames)),
    peakDbfs: db(peak),
    clippedSamples,
    segments: segments.map((segment) => ({
      ...segment,
      startSeconds: segment.startFrame / wav.sampleRate,
      endSeconds: segment.endFrame / wav.sampleRate,
      durationSeconds: (segment.endFrame - segment.startFrame) / wav.sampleRate
    }))
  };
}

export function analyzeCapture(file) {
  const wav = readPcm16Wav(file);
  const metrics = signalMetrics(wav);
  const primary = metrics.segments.filter((segment) => segment.durationSeconds >= 0.1);
  const gaps = primary.slice(1).map((segment, index) => {
    const previous = primary[index];
    const frames = segment.startFrame - previous.endFrame;
    return { frames, milliseconds: frames * 1000 / wav.sampleRate };
  });
  return {
    file: basename(file),
    sha256: wav.sha256,
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    ...metrics,
    primarySegments: primary,
    interSegmentGaps: gaps
  };
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const output = resolve(option('--output', '.scratch/evidence/m8/playback-engine/results/capture-analysis.json'));
  const files = process.argv.filter((value, index) => index > 1 && !value.startsWith('--') && process.argv[index - 1] !== '--output');
  if (files.length === 0) throw new Error('Pass one or more WAV capture paths');
  const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), captures: files.map((file) => analyzeCapture(resolve(file))) };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
