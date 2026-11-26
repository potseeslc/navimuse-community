import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const harness = await readFile(new URL('../src/AudioEngineEvidenceHarness.jsx', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const evidenceConfig = JSON.parse(await readFile(new URL('../src-tauri/tauri.evidence.conf.json', import.meta.url), 'utf8'));

test('M8 evidence harness is gated and uses the production WebView audio boundary', () => {
  assert.match(main, /VITE_NAVIMUSE_AUDIO_EVIDENCE === '1'/);
  assert.match(main, /audioEvidenceMode \? null : nativeFirstPartyBffRedirectTarget\(\)/);
  assert.match(main, /import\('\.\/AudioEngineEvidenceHarness\.jsx'\)/);
  assert.match(main, /Audio evidence harness failed/);
  assert.match(harness, /useAudioEngine\(\)/);
  assert.match(harness, /promoteStandbyAudio\(\)/);
  assert.match(harness, /scheduleCrossfade\(\{/);
  assert.match(harness, /setMasterVolume\(1\)/);
  assert.match(harness, /VITE_NAVIMUSE_AUDIO_FIXTURE_ROOT/);
  assert.match(harness, /crossOrigin="anonymous"/);
  assert.match(harness, /const bindFirstDeck = useCallback/);
  assert.match(harness, /ref=\{bindFirstDeck\}/);
});

test('the evidence app cannot collide with the production NaviMuse identity', () => {
  assert.equal(evidenceConfig.productName, 'NaviMuse Audio Evidence');
  assert.equal(evidenceConfig.identifier, 'com.developer.navimuse.audio-evidence');
  assert.equal(evidenceConfig.app.windows[0].label, 'audio-evidence');
});

test('M8 evidence harness exposes deterministic boundary and signal probes', () => {
  assert.match(harness, /Run standard boundary/);
  assert.match(harness, /Run smart blend/);
  assert.match(harness, /silence-probe/);
  assert.match(harness, /loudness-minus-18dbfs/);
  assert.match(harness, /loudness-minus-6dbfs/);
  assert.match(harness, /peak-probe/);
  assert.match(harness, /window\.__navimuseM8AudioEvidence/);
});
