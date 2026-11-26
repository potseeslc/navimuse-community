import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { useAudioEngine } from '../src/useAudioEngine.js';

// Static source-contract tests for useAudioEngine — verifies the extracted hook
// owns the audio engine refs and state that App previously held inline.
const audioEngineSource = await readFile(new URL('../src/useAudioEngine.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const appShellSource = await readFile(new URL('../src/AppShell.jsx', import.meta.url), 'utf8');

function renderAudioHook() {
  let api;
  function Harness() {
    api = useAudioEngine();
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  return api;
}

test('useAudioEngine blocks seeking without a loaded audio element', () => {
  const api = renderAudioHook();
  const result = api.seekPlayback(0.5);
  assert.equal(result.blocked, true);
  assert.match(result.notice, /Seeking will be available/);
});

test('useAudioEngine seeks finite and offset seekable media', () => {
  const finite = renderAudioHook();
  finite.audioRef.current = { duration: 100, currentTime: 0 };
  assert.deepEqual(finite.seekPlayback(0.25), { blocked: false });
  assert.equal(finite.audioRef.current.currentTime, 25);

  const ranged = renderAudioHook();
  ranged.audioRef.current = {
    duration: Infinity,
    currentTime: 0,
    seekable: { length: 1, start: () => 30, end: () => 90 }
  };
  assert.deepEqual(ranged.seekPlayback(0.5), { blocked: false });
  assert.equal(ranged.audioRef.current.currentTime, 60);
});

test('useAudioEngine promotes the prepared deck atomically', () => {
  const api = renderAudioHook();
  const first = { id: 'first' };
  const second = { id: 'second' };
  api.bindAudioDeck(0, first);
  api.bindAudioDeck(1, second);
  assert.equal(api.audioRef.current, first);
  assert.equal(api.getStandbyAudio(), second);
  assert.deepEqual(api.promoteStandbyAudio(), { incoming: second, outgoing: first });
  assert.equal(api.audioRef.current, second);
  assert.equal(api.getStandbyAudio(), first);
});

test('useAudioEngine resets a pre-heated standby to the top on promotion', () => {
  // The standby deck is pre-heated (plays silently at deck gain 0) during
  // prepare so Safari first-play() latency can't eat the fade window. That
  // advances its currentTime (up to ~28s with a 30s preload lead), so promotion
  // must reset it to 0 or the "next" track becomes audible partway through.
  // Regression for: 'one song faded out and the next started 26s into it'.
  const api = renderAudioHook();
  const first = { id: 'first', currentTime: 5 };
  const second = { id: 'second', currentTime: 26.4 };
  api.bindAudioDeck(0, first);
  api.bindAudioDeck(1, second);
  assert.equal(api.audioRef.current, first);
  assert.deepEqual(api.promoteStandbyAudio(), { incoming: second, outgoing: first });
  assert.equal(api.audioRef.current, second);
  assert.equal(api.getStandbyAudio(), first);
  // The incoming is now the audible deck and must start at the top, not where
  // the silent pre-heat left it.
  assert.equal(api.audioRef.current.currentTime, 0);
});

test('useAudioEngine promotion leaves a standby at the top unchanged', () => {
  // A standby that is already at currentTime 0 (never advanced) stays at 0,
  // and a standby that has no currentTime (declared without the property) is
  // left alone rather than throwing.
  const api = renderAudioHook();
  const first = { id: 'first', currentTime: 0 };
  const second = { id: 'second', currentTime: 0 };
  api.bindAudioDeck(0, first);
  api.bindAudioDeck(1, second);
  assert.deepEqual(api.promoteStandbyAudio(), { incoming: second, outgoing: first });
  assert.equal(api.audioRef.current.currentTime, 0);

  const noTime = renderAudioHook();
  const a = { id: 'a' };
  const b = { id: 'b' };
  noTime.bindAudioDeck(0, a);
  noTime.bindAudioDeck(1, b);
  assert.deepEqual(noTime.promoteStandbyAudio(), { incoming: b, outgoing: a });
  assert.equal(noTime.audioRef.current.id, 'b');

  const unseekable = renderAudioHook();
  const playable = { id: 'playable', currentTime: 0 };
  const rejectsSeek = { id: 'rejects-seek', get currentTime() { return 12; }, set currentTime(_) { throw new Error('seek blocked'); } };
  unseekable.bindAudioDeck(0, playable);
  unseekable.bindAudioDeck(1, rejectsSeek);
  assert.doesNotThrow(() => unseekable.promoteStandbyAudio());
  assert.equal(unseekable.audioRef.current.id, 'rejects-seek');
});

test('Web Audio helpers no-op when AudioContext is unavailable', () => {
  // In the Node test environment there is no `window.AudioContext`, so the
  // graph cannot be created. `bindAudioDeck` must wire each deck without
  // throwing, `setDeckGain` falls back to `.volume`, and `scheduleCrossfade`
  // reports a null ramp so main.jsx falls back to the interval path.
  const api = renderAudioHook();
  assert.equal(api.isWebAudioActive(), false);

  const deck = { volume: 0.8, pause() {}, removeAttribute() {}, load() {} };
  assert.doesNotThrow(() => api.bindAudioDeck(0, deck));
  api.setDeckGain(deck, 0.4);
  assert.equal(deck.volume, 0.4);

  const incoming = { volume: 0.8, pause() {}, removeAttribute() {}, load() {} };
  const outgoing = { volume: 0.8, pause() {}, removeAttribute() {}, load() {} };
  let completedWith = null;
  const ramp = api.scheduleCrossfade({
    outgoing,
    incoming,
    volume: 1,
    fadeSeconds: 1,
    onComplete: (v) => { completedWith = v; }
  });
  assert.equal(ramp, null);
  assert.equal(completedWith, false);

  assert.doesNotThrow(() => api.setMasterVolume(0.5));
});

test('useAudioEngine owns audio element ref and revision-keyed transport state', () => {
  assert.match(audioEngineSource, /export function useAudioEngine\(\)/);
  assert.match(audioEngineSource, /const audioRef = useRef\(null\)/);
  assert.match(audioEngineSource, /const transportRef = useRef\(initialTransportState\(\)\)/);
  assert.match(audioEngineSource, /const \[transport, setTransport\] = useState\(transportRef\.current\)/);
  assert.match(audioEngineSource, /const isPlaying = isAudiblyPlaying\(transport\)/);
  assert.match(audioEngineSource, /transportStateForEvent\(transportRef\.current, event\)/);
  assert.match(audioEngineSource, /const \[playbackState, setPlaybackState\] = useState\(\{ currentTime: 0, duration: 0, canSeek: false \}\)/);
});

test('useAudioEngine owns stream tracking and ended-suppression refs', () => {
  assert.match(audioEngineSource, /const expectedDurationRef = useRef\(0\)/);
  assert.match(audioEngineSource, /const currentStreamUrlRef = useRef\(''\)/);
  assert.match(audioEngineSource, /const playRequestRef = useRef\(0\)/);
  assert.match(audioEngineSource, /const skipNextEndedRequestRef = useRef\(0\)/);
  assert.match(audioEngineSource, /const skipNextEndedTimerRef = useRef\(0\)/);
});

test('useAudioEngine exposes seekPlayback with blocked-seek return contract', () => {
  assert.match(audioEngineSource, /const seekPlayback = useCallback\(\(fraction\) =>/);
  assert.match(audioEngineSource, /return \{ blocked: true, notice:/);
  assert.match(audioEngineSource, /return \{ blocked: false \}/);
});

test('App delegates audio engine ownership to useAudioEngine hook', () => {
  assert.match(mainSource, /import \{ useAudioEngine \} from '\.\/useAudioEngine\.js'/);
  assert.match(mainSource, /seekPlayback: engineSeek/);
  assert.match(mainSource, /const result = engineSeek\(fraction\)/);
  assert.match(mainSource, /if \(result\.blocked\) setPlayerNotice\(result\.notice\)/);
});

test('App wires two decks through the transition contract', () => {
  assert.match(appShellSource, /bindAudioDeck\(0, node\)/);
  assert.match(appShellSource, /bindAudioDeck\(1, node\)/);
  assert.match(mainSource, /transitionDecisionFor\(\{/);
  assert.match(mainSource, /queueRevision: queueRevisionRef\.current/);
  assert.match(mainSource, /pending\.queueRevision !== queueRevisionRef\.current/);
  assert.match(mainSource, /canUsePreparedDeck\(\{/);
  assert.match(mainSource, /preparedTransition: true/);
  assert.match(mainSource, /if \(audioRef\.current !== audio\) return/);
  assert.match(mainSource, /stopDeckTickerRef\.current\.get\(promoted\.outgoing\)\?\.\(\)/);
  assert.match(mainSource, /\['starting', 'transitioning'\]\.includes\(pendingTransitionRef\.current\.status\)/);
  assert.match(mainSource, /pause: \(\) => \{ if\(wiim.blocksLocal\)return; playbackIntentRef\.current \+= 1; cancelTransitionRef\.current\(\); dispatchTransport\(\{ type: 'pause'/);
});

test('App no longer declares duplicate audio engine refs', () => {
  // The old inline declarations should be gone — ownership moved to the hook.
  // App should not have its own "const audioRef = useRef(null)" or similar.
  const appFunction = mainSource.match(/function PlayerApp\([^\n]*\) \{[\s\S]*?\n\}/s)?.[0] || '';
  // The hook destructuring should be present instead of inline useRef declarations
  assert.match(appFunction, /useAudioEngine\(\)/);
  // Ensure no duplicate "const audioRef = useRef" in App's body (it comes from the hook)
  const appBody = appFunction.slice(appFunction.indexOf('useAudioEngine'));
  assert.doesNotMatch(appBody, /const audioRef = useRef\(null\)/);
  assert.doesNotMatch(appBody, /const \[isPlaying, setIsPlaying\] = useState\(false\)/);
  assert.doesNotMatch(appBody, /const \[playbackState, setPlaybackState\] = useState/);
});

test('detaching a deck unloads media and disconnects its graph; reattachment reuses the source', () => {
  const previous=globalThis.window;
  let sources=0,disconnections=0,pauses=0,loads=0,removals=0;
  const gain=()=>({gain:{value:1,cancelScheduledValues(){}},connect(target){return target;},disconnect(){disconnections++;}});
  globalThis.window={AudioContext:class {constructor(){this.destination={};}createGain(){return gain();}createMediaElementSource(){sources++;return {connect(target){return target;},disconnect(){disconnections++;}}}}};
  let api;
  function Harness(){api=useAudioEngine();return null;}
  try {
    renderToStaticMarkup(React.createElement(Harness));
    const deck={pause(){pauses++;},removeAttribute(name){assert.equal(name,'src');removals++;},load(){loads++;}};
    api.bindAudioDeck(0,deck);assert.equal(sources,1);
    api.bindAudioDeck(0,null);
    assert.equal(pauses,1);assert.equal(removals,1);assert.equal(loads,1);assert.equal(disconnections,2);
    assert.equal(api.audioRef.current,null);
    api.bindAudioDeck(0,deck);assert.equal(sources,1,'React remount cannot create a second source for an element');
    api.bindAudioDeck(0,null);assert.equal(disconnections,4);
  } finally {globalThis.window=previous;}
});
