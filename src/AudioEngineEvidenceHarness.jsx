import React, { useCallback, useRef, useState } from 'react';
import { useAudioEngine } from './useAudioEngine.js';

const fixtureRoot = String(import.meta.env.VITE_NAVIMUSE_AUDIO_FIXTURE_ROOT || '').replace(/\/$/, '');
const codecFiles = Object.freeze({
  wav: ['continuous-track-a.wav', 'continuous-track-b.wav'],
  flac: ['continuous-track-a.flac.flac', 'continuous-track-b.flac.flac'],
  alac: ['continuous-track-a.alac.m4a', 'continuous-track-b.alac.m4a'],
  aac: ['continuous-track-a.aac.m4a', 'continuous-track-b.aac.m4a']
});

function fixtureUrl(file) {
  if (!fixtureRoot) throw new Error('VITE_NAVIMUSE_AUDIO_FIXTURE_ROOT is required');
  return `${fixtureRoot}/${file}`;
}

export function AudioEngineEvidenceHarness() {
  const {
    audioDeckRefs,
    audioRef,
    bindAudioDeck,
    isWebAudioActive,
    promoteStandbyAudio,
    scheduleCrossfade,
    setDeckGain,
    setMasterVolume,
    wakeAudioContext
  } = useAudioEngine();
  const runGeneration = useRef(0);
  const cleanupRef = useRef(() => {});
  const [codec, setCodec] = useState('wav');
  const [status, setStatus] = useState('idle');
  const [events, setEvents] = useState([]);
  const bindFirstDeck = useCallback(node => bindAudioDeck(0, node), [bindAudioDeck]);
  const bindSecondDeck = useCallback(node => bindAudioDeck(1, node), [bindAudioDeck]);

  const record = useCallback((type, details = {}) => {
    const event = { type, atMs: Math.round(performance.now()), ...details };
    setEvents(current => [...current, event]);
    window.__navimuseM8AudioEvidence = { status: type, events: [...(window.__navimuseM8AudioEvidence?.events || []), event] };
  }, []);

  const reset = useCallback(() => {
    runGeneration.current += 1;
    cleanupRef.current();
    cleanupRef.current = () => {};
    for (const deckRef of audioDeckRefs) {
      const deck = deckRef.current;
      if (!deck) continue;
      deck.pause();
      deck.removeAttribute('src');
      deck.load();
      setDeckGain(deck, 0);
    }
    setStatus('idle');
    setEvents([]);
    window.__navimuseM8AudioEvidence = { status: 'idle', events: [] };
  }, [audioDeckRefs, setDeckGain]);

  const begin = useCallback(async (scenario) => {
    reset();
    const generation = runGeneration.current;
    setStatus('running');
    await wakeAudioContext();
    await setMasterVolume(1);
    record('scenario-start', { scenario, codec, webAudio: isWebAudioActive() });
    return generation;
  }, [codec, isWebAudioActive, record, reset, setMasterVolume, wakeAudioContext]);

  const runStandardBoundary = useCallback(async () => {
    const generation = await begin('standard-boundary');
    const deck = audioRef.current || audioDeckRefs[0].current;
    const [first, second] = codecFiles[codec];
    let stage = 'outgoing';
    const onPlaying = () => record('playing', { stage, mediaTime: deck.currentTime });
    const onEnded = () => {
      if (generation !== runGeneration.current) return;
      if (stage === 'outgoing') {
        record('boundary', { stage, mediaTime: deck.currentTime });
        stage = 'incoming';
        deck.src = fixtureUrl(second);
        deck.load();
        deck.play().catch(error => record('play-error', { stage, message: error.message }));
        return;
      }
      record('scenario-complete', { scenario: 'standard-boundary', mediaTime: deck.currentTime });
      setStatus('complete');
    };
    const onError = () => { record('media-error', { stage, code: deck.error?.code || 0 }); setStatus('failed'); };
    deck.addEventListener('playing', onPlaying);
    deck.addEventListener('ended', onEnded);
    deck.addEventListener('error', onError);
    cleanupRef.current = () => {
      deck.removeEventListener('playing', onPlaying);
      deck.removeEventListener('ended', onEnded);
      deck.removeEventListener('error', onError);
    };
    setDeckGain(deck, 1);
    deck.src = fixtureUrl(first);
    deck.load();
    await deck.play();
  }, [audioDeckRefs, audioRef, begin, codec, record, setDeckGain]);

  const runSmartBlend = useCallback(async () => {
    const generation = await begin('smart-blend');
    const outgoing = audioRef.current || audioDeckRefs[0].current;
    const standby = audioDeckRefs.find(deckRef => deckRef.current && deckRef.current !== outgoing)?.current;
    if (!outgoing || !standby) throw new Error('Two audio decks are required');
    const [first, second] = codecFiles[codec];
    let started = false;
    let ramp = null;
    const onTimeUpdate = () => {
      if (started || generation !== runGeneration.current || outgoing.currentTime < 2) return;
      started = true;
      const promoted = promoteStandbyAudio();
      record('blend-start', { outgoingTime: outgoing.currentTime, incomingTime: promoted.incoming?.currentTime || 0, fadeSeconds: 2 });
      ramp = scheduleCrossfade({
        outgoing: promoted.outgoing,
        incoming: promoted.incoming,
        volume: 1,
        fadeSeconds: 2,
        onComplete: measured => {
          if (generation !== runGeneration.current) return;
          promoted.outgoing?.pause();
          setDeckGain(promoted.outgoing, 0);
          setDeckGain(promoted.incoming, 1);
          record('blend-complete', { measured });
        }
      });
    };
    const onIncomingEnded = () => {
      if (generation !== runGeneration.current) return;
      record('scenario-complete', { scenario: 'smart-blend', mediaTime: standby.currentTime });
      setStatus('complete');
    };
    const onError = event => { record('media-error', { deck: event.currentTarget === outgoing ? 'outgoing' : 'incoming', code: event.currentTarget.error?.code || 0 }); setStatus('failed'); };
    outgoing.addEventListener('timeupdate', onTimeUpdate);
    outgoing.addEventListener('error', onError);
    standby.addEventListener('ended', onIncomingEnded);
    standby.addEventListener('error', onError);
    cleanupRef.current = () => {
      ramp?.cancel();
      outgoing.removeEventListener('timeupdate', onTimeUpdate);
      outgoing.removeEventListener('error', onError);
      standby.removeEventListener('ended', onIncomingEnded);
      standby.removeEventListener('error', onError);
    };
    setDeckGain(outgoing, 1);
    setDeckGain(standby, 0);
    standby.preload = 'auto';
    standby.src = fixtureUrl(second);
    standby.load();
    await standby.play();
    outgoing.src = fixtureUrl(first);
    outgoing.load();
    await outgoing.play();
  }, [audioDeckRefs, audioRef, begin, codec, promoteStandbyAudio, record, scheduleCrossfade, setDeckGain]);

  const runProbe = useCallback(async (name) => {
    const generation = await begin(name);
    const deck = audioRef.current || audioDeckRefs[0].current;
    const onEnded = () => {
      if (generation !== runGeneration.current) return;
      record('scenario-complete', { scenario: name, mediaTime: deck.currentTime });
      setStatus('complete');
    };
    const onError = () => { record('media-error', { code: deck.error?.code || 0 }); setStatus('failed'); };
    deck.addEventListener('ended', onEnded);
    deck.addEventListener('error', onError);
    cleanupRef.current = () => { deck.removeEventListener('ended', onEnded); deck.removeEventListener('error', onError); };
    setDeckGain(deck, 1);
    deck.src = fixtureUrl(`${name}.wav`);
    deck.load();
    await deck.play();
  }, [audioDeckRefs, audioRef, begin, record, setDeckGain]);

  return <main style={{ minHeight: '100vh', padding: 32, color: '#f4f5f6', background: '#080b11', fontFamily: 'system-ui' }}>
    <h1>M8 WebView audio-engine evidence</h1>
    <p>Production useAudioEngine · two HTMLMediaElement decks · Web Audio gain graph</p>
    <p role="status"><strong>Status:</strong> {status} · <strong>Web Audio:</strong> {isWebAudioActive() ? 'active' : 'not initialized'}</p>
    <label>Boundary codec <select value={codec} onChange={event => setCodec(event.target.value)}>{Object.keys(codecFiles).map(value => <option key={value}>{value}</option>)}</select></label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '20px 0' }}>
      <button type="button" onClick={() => runStandardBoundary().catch(error => { record('harness-error', { message: error.message }); setStatus('failed'); })}>Run standard boundary</button>
      <button type="button" onClick={() => runSmartBlend().catch(error => { record('harness-error', { message: error.message }); setStatus('failed'); })}>Run smart blend</button>
      {['silence-probe', 'loudness-minus-18dbfs', 'loudness-minus-6dbfs', 'peak-probe'].map(name => <button key={name} type="button" onClick={() => runProbe(name).catch(error => { record('harness-error', { message: error.message }); setStatus('failed'); })}>Run {name}</button>)}
      <button type="button" onClick={reset}>Reset</button>
    </div>
    <audio crossOrigin="anonymous" ref={bindFirstDeck} preload="auto" />
    <audio crossOrigin="anonymous" ref={bindSecondDeck} preload="auto" />
    <pre aria-label="Evidence event log" style={{ whiteSpace: 'pre-wrap', padding: 16, border: '1px solid #39404c' }}>{JSON.stringify(events, null, 2)}</pre>
  </main>;
}
