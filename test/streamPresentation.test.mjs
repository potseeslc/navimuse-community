import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedStreamSummary, sourceSignalSummary, receivedStreamSummary } from '../src/streamPresentation.js';

test('source signal summary only presents available source metadata', () => {
  assert.equal(sourceSignalSummary({ bitDepth: 24, samplingRate: 96000, channelCount: 2, bitRate: 2652 }), '24-bit · 96 kHz · 2 ch · 2652 kbps source');
  assert.equal(sourceSignalSummary({ bitRate: 320 }), '320 kbps source');
  assert.equal(sourceSignalSummary({}), 'Source details unavailable');
  assert.equal(sourceSignalSummary({ streamUrl: 'https://radio.test/live' }), 'Live source');
});

test('requested stream summary never implies that the request was delivered', () => {
  assert.equal(requestedStreamSummary({ format: 'raw', maxBitRate: '0' }), 'Original requested');
  assert.equal(requestedStreamSummary({ format: 'opus', maxBitRate: '128' }), 'OPUS ≤ 128 kbps requested');
  assert.equal(requestedStreamSummary({ format: 'mp3' }), 'MP3 requested');
  assert.equal(requestedStreamSummary({}, true), 'Live request');
});

test('received stream details stay distinct from source and requested quality',()=>{
 assert.equal(receivedStreamSummary(null),'Audio details unavailable');
 assert.equal(receivedStreamSummary({}),'Audio details unavailable');
 assert.equal(receivedStreamSummary({codec:'AAC',sampleRate:44100,channels:2,estimatedBitRate:127900}),'AAC · 128 kbps');
 assert.equal(receivedStreamSummary({codec:'FLAC',sampleRate:96000,bitDepth:24,channels:2}),'FLAC · 96 kHz · 24-bit');
 assert.equal(receivedStreamSummary({codec:'unknown',sampleRate:NaN,bitDepth:0,estimatedBitRate:-1}),'Audio details unavailable');
});

 test('UPnP can show observed receiver quality without guessing an ambiguous container codec',()=>{
 assert.equal(receivedStreamSummary({sampleRate:44100,bitDepth:16}),'44.1 kHz · 16-bit');
 assert.equal(receivedStreamSummary({codec:'MP3',sampleRate:44100,bitDepth:16,estimatedBitRate:320000}),'MP3 · 320 kbps');
});

test('cached fallback is disclosed without claiming requested quality',()=>{
 assert.equal(receivedStreamSummary({source:'cached',codec:'MP3',estimatedBitRate:96000}),'Playing cached audio · MP3 · 96 kbps');
});
