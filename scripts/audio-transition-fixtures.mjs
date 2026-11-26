import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const FIXTURE_VERSION = 1;
export const SAMPLE_RATE = 48_000;
export const CHANNELS = 2;
export const BITS_PER_SAMPLE = 16;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function pcm16Stereo(frameCount, sampleForFrame) {
  const pcm = Buffer.alloc(frameCount * CHANNELS * 2);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = sampleForFrame(frame, frame / SAMPLE_RATE);
    const channels = Array.isArray(sample) ? sample : [sample, sample];
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      const value = Math.round(clampSample(channels[channel] ?? channels[0]) * 32767);
      pcm.writeInt16LE(value, (frame * CHANNELS + channel) * 2);
    }
  }
  return pcm;
}

export function wavFromPcm16(pcm, { sampleRate = SAMPLE_RATE, channels = CHANNELS } = {}) {
  const header = Buffer.alloc(44);
  const blockAlign = channels * (BITS_PER_SAMPLE / 8);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function dbToAmplitude(db) {
  return 10 ** (db / 20);
}

function fixture(name, pcm, purpose, extra = {}) {
  const wav = wavFromPcm16(pcm);
  return {
    name,
    purpose,
    wav,
    metadata: {
      file: `${name}.wav`,
      sha256: sha256(wav),
      frames: pcm.length / (CHANNELS * 2),
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      ...extra
    }
  };
}

export function buildTransitionFixtures() {
  const boundaryFrames = SAMPLE_RATE * 8;
  const boundaryPcm = pcm16Stereo(boundaryFrames, (_frame, time) => [
    0.36 * Math.sin(2 * Math.PI * (997 * time + 2.7 * time ** 2)) + 0.14 * Math.sin(2 * Math.PI * 173 * time),
    0.34 * Math.sin(2 * Math.PI * (991 * time + 3.1 * time ** 2) + 0.31) + 0.13 * Math.sin(2 * Math.PI * 181 * time)
  ]);
  const boundaryFrame = boundaryFrames / 2;
  const boundaryByte = boundaryFrame * CHANNELS * 2;

  const silencePcm = pcm16Stereo(SAMPLE_RATE * 5, (_frame, time) => {
    if (time >= 2 && time < 3) return [0, 0];
    const chirp = time < 0.5 ? Math.sin(2 * Math.PI * (220 + 880 * time) * time) : Math.sin(2 * Math.PI * 440 * time);
    return [0.42 * chirp, 0.38 * chirp];
  });

  const quietPcm = pcm16Stereo(SAMPLE_RATE * 4, (_frame, time) => dbToAmplitude(-18) * Math.sin(2 * Math.PI * 523 * time));
  const loudPcm = pcm16Stereo(SAMPLE_RATE * 4, (_frame, time) => dbToAmplitude(-6) * Math.sin(2 * Math.PI * 523 * time));
  const peakPcm = pcm16Stereo(SAMPLE_RATE * 2, (frame, time) => {
    if (frame % 12_000 === 0) return [0.999, -0.999];
    return [0.97 * Math.sin(2 * Math.PI * 997 * time), 0.97 * Math.sin(2 * Math.PI * 991 * time)];
  });

  return [
    fixture('continuous-reference', boundaryPcm, 'Exact continuous source used to assess inserted, dropped, or duplicated boundary audio.', { boundaryFrame }),
    fixture('continuous-track-a', boundaryPcm.subarray(0, boundaryByte), 'Outgoing half of the continuous boundary source.', { pair: 'continuous', order: 0 }),
    fixture('continuous-track-b', boundaryPcm.subarray(boundaryByte), 'Incoming half of the continuous boundary source; playback must begin at frame zero.', { pair: 'continuous', order: 1 }),
    fixture('silence-probe', silencePcm, 'Known one-second digital-silence region for silence-floor and decoder behavior checks.', { silenceStartFrame: SAMPLE_RATE * 2, silenceEndFrame: SAMPLE_RATE * 3 }),
    fixture('loudness-minus-18dbfs', quietPcm, 'Stable low-level tone for gain and ReplayGain comparisons.', { nominalPeakDbfs: -18 }),
    fixture('loudness-minus-6dbfs', loudPcm, 'Stable higher-level tone for gain-envelope comparisons.', { nominalPeakDbfs: -6 }),
    fixture('peak-probe', peakPcm, 'Near-full-scale signal for clipping detection.', { expectedPeak: 0.999 })
  ];
}

const codecTargets = Object.freeze([
  { key: 'flac', extension: 'flac', args: ['-f', 'flac', '-d', 'flac'] },
  { key: 'alac', extension: 'm4a', args: ['-f', 'm4af', '-d', 'alac'] },
  { key: 'aac', extension: 'm4a', args: ['-f', 'm4af', '-d', 'aac ', '-b', '256000'] },
  { key: 'mp3', extension: 'mp3', args: ['-f', 'MPG3', '-d', '.mp3', '-b', '320000'] },
  { key: 'opus', extension: 'opus', args: ['-f', 'Oggf', '-d', 'opus', '-b', '192000'] }
]);

function encodeMacosCodecs(outputDirectory, sourceFiles) {
  return codecTargets.flatMap((target) => sourceFiles.map((source) => {
    const output = join(outputDirectory, `${source.name}.${target.key}.${target.extension}`);
    const result = spawnSync('/usr/bin/afconvert', [source.path, output, ...target.args], { encoding: 'utf8' });
    return {
      codec: target.key,
      source: basename(source.path),
      output: basename(output),
      status: result.status === 0 ? 'generated' : 'unavailable',
      detail: result.status === 0 ? '' : String(result.stderr || result.stdout || `exit ${result.status}`).trim()
    };
  }));
}

export function writeTransitionFixtures(outputDirectory, { encodeMacos = false } = {}) {
  const directory = resolve(outputDirectory);
  mkdirSync(directory, { recursive: true });
  const fixtures = buildTransitionFixtures();
  for (const item of fixtures) writeFileSync(join(directory, item.metadata.file), item.wav);

  const codecSources = fixtures
    .filter((item) => ['continuous-track-a', 'continuous-track-b'].includes(item.name))
    .map((item) => ({ name: item.name, path: join(directory, item.metadata.file) }));
  const codecs = encodeMacos ? encodeMacosCodecs(directory, codecSources) : [];
  const manifest = {
    schemaVersion: FIXTURE_VERSION,
    generatedBy: 'scripts/audio-transition-fixtures.mjs',
    fixtures: fixtures.map(({ name, purpose, metadata }) => ({ name, purpose, ...metadata })),
    codecs
  };
  writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const output = optionValue('--output') || '.scratch/m8-playback-fixtures';
  const manifest = writeTransitionFixtures(output, { encodeMacos: process.argv.includes('--macos-codecs') });
  console.log(JSON.stringify(manifest, null, 2));
}
