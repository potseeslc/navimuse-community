import {WebAlbumAudio} from './webAlbumAudio.js';
import {bindPlaybackLog,unbindPlaybackLog} from './playbackLog.js';
import { NativeAudioDeck, nativeAudioTransport } from './nativeAudio.js';
import { usesDirectMediaAudio } from './audioPlatform.js';
import { useCallback, useRef, useState } from 'react';
import {
  canSeekWithState,
  blockedSeekNotice,
  seekTimeFromRatio
} from './playerState.js';
import { transitionDeckVolumes } from './playbackTransitions.js';
import {
  initialTransportState,
  isAudiblyPlaying,
  transportStateForEvent
} from './transportState.js';

// ---- Web Audio graph for the two <audio> decks -----------------------------
// iOS Safari treats HTMLMediaElement.volume as read-only (writes silently
// ignored, reads return 1), so per-deck loudness (mute, duck, crossfade) must
// go through a GainNode. Once a deck is routed into the graph its `.volume` is
// bypassed on every platform, so this graph becomes the single volume path.
//
// Graph:
//   deck[n] -> MediaElementSource[n] -> deckGain[n] -> masterGain -> destination
//   - deckGain[n]  = crossfade/duck/mute gain (1 = audible, 0 = silent)
//   - masterGain   = the app volume slider (replaces deck.volume for the slider)
//
// The AudioContext is a MODULE-LEVEL singleton: React StrictMode double-mounts
// would otherwise create two live contexts, and iOS caps live contexts / does
// not reliably GC them. Created lazily on first use.
let audioContext = null;
let masterGain = null;
const deckGains = new WeakMap(); // <audio> element -> GainNode

const webAlbumDecks = new WeakMap();
const deckSources = new WeakMap();
const connectedDecks = new WeakSet();

// Declare music playback before creating/resuming Web Audio. On iOS the default
// session category can be interrupted by screen lock even while a deck is playing.
// Feature detection preserves browsers without the Audio Session API.
function configurePlaybackSession() {
  try {
    const session = globalThis.navigator?.audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
  } catch { /* Optional browser API; an unsupported setter must not block play. */ }
}

const getAudioContext = () => {
  configurePlaybackSession();
  if (usesDirectMediaAudio()) return null;
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null; // SSR / Node test env: no Web Audio
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (Ctor) audioContext = new Ctor();
  return audioContext;
};

const getMasterGain = () => {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (masterGain) return masterGain;
  try {
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
    return masterGain;
  } catch {
    return null;
  }
};

// True once the Web Audio graph exists and is authoritative for volume. When
// false (AudioContext unavailable), callers fall back to HTMLMediaElement.volume.
const isWebAudioActive = () => Boolean(audioContext && masterGain);

// iOS starts the AudioContext 'suspended'; it must be resumed from a user
// gesture or the routed decks stay silent. Called on every play path.
async function wakeAudioContext() {
  configurePlaybackSession();
  const ctx = audioContext;
  if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted')) {
    try {
      await ctx.resume();
    } catch {
      // Keep the existing graph intact. A later user play action can retry resume.
    }
  }
}

// createMediaElementSource may be called once per element (a second call
// throws). Build each deck's graph at bind time, never in the transition path.
// Returns the deck's GainNode, or null if Web Audio is unavailable / already
// wired.
function wireDeckIntoGraph(deck) {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master || !deck) return null;
  if (deckGains.has(deck)) {
    const gain = deckGains.get(deck);
    try {
      if (!connectedDecks.has(deck)) {
        deckSources.get(deck).connect(gain).connect(master);
        connectedDecks.add(deck);
      }
      return gain;
    } catch { return null; }
  }
  try {
    const source = ctx.createMediaElementSource(deck.mediaElement||deck);
    const gain = ctx.createGain();
    gain.gain.value = 1; // audible by default; crossfade/duck ramps this
    source.connect(gain).connect(master);
    deckGains.set(deck, gain);
    deckSources.set(deck, source);
    connectedDecks.add(deck);
    return gain;
  } catch {
    return null;
  }
}

// A detached player must release buffered media and graph connections. Weak
// identity maps retain the one-source-per-element rule across React remounts.
function releaseAudioDeck(deck) {
  if (!deck) return;
  try { deck.pause(); } catch {}
  try { deck.removeAttribute('src'); deck.load(); } catch {}
  deck.dispose?.();
  const gain = deckGains.get(deck);
  try { gain?.gain?.cancelScheduledValues(0); } catch {}
  try { deckSources.get(deck)?.disconnect(); } catch {}
  try { gain?.disconnect(); } catch {}
  connectedDecks.delete(deck);
}

// Set a single deck's loudness. Prefers the deck's GainNode once it is wired
// into the graph; falls back to HTMLMediaElement.volume when Web Audio is
// unavailable (e.g. older browsers) so the app still works, just without the
// iOS-safe path.
function setDeckGain(deck, value) {
  const target = Math.max(0, Math.min(1, Number(value) || 0));
  if (!deck) return;
  if (isWebAudioActive()) {
    const gain = deckGains.get(deck);
    if (gain && gain.gain && typeof gain.gain.setValueAtTime === 'function') {
      const ctx = audioContext;
      try {
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(target, ctx.currentTime);
        // Keep the intrinsic value aligned with the target so a later crossfade
        // can anchor its curve from the correct starting level.
        gain.gain.value = target;
      } catch { /* no-op; graph may be mid-shutdown */ }
      return;
    }
  }
  // iOS owns output loudness; muted is supported even when volume is read-only.
  // In particular, the inactive deck must never become an audible second player.
  if (usesDirectMediaAudio()) {
    deck.muted = target === 0;
    return;
  }
  deck.volume = target;
}

// Set the app-volume master (the volume slider). Scales every deck together.
// No-op when Web Audio is unavailable (deck gains then carry the volume directly).
async function setMasterVolume(value) {
  const target = Math.max(0, Math.min(1, Number(value) || 0));
  const ctx = audioContext;
  const master = masterGain;
  if (isWebAudioActive() && ctx && master && master.gain && typeof master.gain.setValueAtTime === 'function') {
    try {
      master.gain.cancelScheduledValues(0);
      master.gain.setValueAtTime(target, ctx.currentTime);
      master.gain.value = target;
    } catch {
      // no-op; graph may be mid-shutdown
    }
  }
}

// Schedule an equal-power crossfade between the incoming and outgoing decks on
// the audio clock. Approximates the sin/cos equal-power curve with linear-ramp
// segments (cancels cleanly on skip, unlike setValueCurveAtTime which throws if
// another automation overlaps the curve window).
//
// When Web Audio is unavailable the ramp cannot be scheduled on the audio
// clock; the caller must fall back to interval-driven `setDeckGain`/`.volume`.
// `onComplete(true)` fires when the ramp has fully elapsed on the wall clock;
// callers generally finalize earlier on outgoing `ended`/`paused` instead.
const CROSSFADE_SEGMENTS = 16;

function scheduleCrossfade({ outgoing, incoming, volume, fadeSeconds, onComplete }) {
  const ctx = audioContext;
  const active = isWebAudioActive();
  if (!active || !ctx || !outgoing || !incoming) {
    onComplete?.(false);
    return null;
  }
  const incomingGain = deckGains.get(incoming);
  const outgoingGain = deckGains.get(outgoing);
  if (!incomingGain || !outgoingGain) {
    onComplete?.(false);
    return null;
  }

  const duration = Math.max(0.05, Number(fadeSeconds) || 0);
  const start = ctx.currentTime;

  try {
    incomingGain.gain.cancelScheduledValues(start);
    outgoingGain.gain.cancelScheduledValues(start);
    // Anchor both gains at their current level before scheduling new automation,
    // so the equal-power curve ramps from where each deck actually is.
    incomingGain.gain.setValueAtTime(incomingGain.gain.value, start);
    outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, start);

    // Schedule the equal-power SHAPE (peaks at 1) on the deck gains; the app
    // volume slider is carried by `masterGain`, which is constant across the
    // fade. Passing the volume-scaled curve here would double-attenuate on the
    // Web Audio path (deckGain × masterGain = volume²) and pop back up to
    // `volume` on finalize. `target` (volume) is intentionally not used: the
    // deck gains represent 0/1 shape, not loudness.
    for (let s = 1; s <= CROSSFADE_SEGMENTS; s += 1) {
      const ratio = s / CROSSFADE_SEGMENTS;
      const t = start + (duration * s) / CROSSFADE_SEGMENTS;
      const { incoming: inLevel, outgoing: outLevel } = transitionDeckVolumes(1, ratio);
      incomingGain.gain.linearRampToValueAtTime(inLevel, t);
      outgoingGain.gain.linearRampToValueAtTime(outLevel, t);
    }
  } catch {
    // Automation race (e.g. a skip landed between the cancel and the ramps);
    // leave the decks at their current gain and let the caller finalize.
    return null;
  }

  let cancelled = false;
  // Wall-clock finalizer for the audio-clock curve: once the ramp time elapses,
  // signal completion so main.jsx can finalize if nothing else did first.
  const timer = typeof window !== 'undefined'
    ? window.setTimeout(() => { if (!cancelled) onComplete?.(true); }, duration * 1000 + 50)
    : 0;

  return {
    cancel: () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      try {
        incomingGain.gain.cancelScheduledValues(ctx.currentTime);
        outgoingGain.gain.cancelScheduledValues(ctx.currentTime);
      } catch { /* no-op */ }
    }
  };
}

/**
 * useAudioEngine owns the HTML audio element ref and all low-level playback
 * state: playbackState (currentTime/duration/canSeek), revision-keyed transport,
 * the stream URL,
 * play-request tracking for stale-ended suppression, and the expected-duration
 * fallback for non-seekable streams.
 *
 * App wires the audio event listeners in a useEffect that calls the stable
 * callbacks exposed here.  The actual listener attachment stays in App because
 * it depends on queue/advance callbacks that bridge to usePlayerQueueState.
 *
 * seekPlayback returns { blocked: true, notice } when the seek is not possible
 * so App can surface the notice via setPlayerNotice.  On success it returns
 * { blocked: false } and updates playbackState internally.
 *
 * Returned API:
 *   Refs:     audioRef, expectedDurationRef, currentStreamUrlRef,
 *             playRequestRef, skipNextEndedRequestRef, skipNextEndedTimerRef
 *   State:    isPlaying (derived), playbackState, transport
 *   Setters:  dispatchTransport, setPlaybackState
 *   Actions:  seekPlayback
 *   Audio:    wakeAudioContext, setDeckGain, setMasterVolume, scheduleCrossfade,
 *             isWebAudioActive
 */
export function useAudioEngine() {
  const audioRef = useRef(null);
  const audioDeckRefs = useRef([{ current: null }, { current: null }]).current;
  const [audioDeckNodes, setAudioDeckNodes] = useState([null, null]);
  const activeDeckIndexRef = useRef(0);
  const expectedDurationRef = useRef(0);
  const currentStreamUrlRef = useRef('');
  const playRequestRef = useRef(0);
  const skipNextEndedRequestRef = useRef(0);
  const skipNextEndedTimerRef = useRef(0);

  const transportRef = useRef(initialTransportState());
  const [transport, setTransport] = useState(transportRef.current);
  const [playbackState, setPlaybackState] = useState({ currentTime: 0, duration: 0, canSeek: false });
  const dispatchTransport = useCallback((event) => {
    const next = transportStateForEvent(transportRef.current, event);
    if (next !== transportRef.current) {
      transportRef.current = next;
      setTransport(next);
    }
    return next;
  }, []);
  const isPlaying = isAudiblyPlaying(transport);

  const bindAudioDeck = useCallback((index, node) => {
    if (nativeAudioTransport() && node) node = audioDeckRefs[index].current || new NativeAudioDeck(index);
    else if(node?.tagName==='AUDIO'&&!usesDirectMediaAudio()&&getAudioContext()){const element=node;node=webAlbumDecks.get(element);if(!node){node=new WebAlbumAudio(element);webAlbumDecks.set(element,node);}node.attach();}
    const previous = audioDeckRefs[index].current;
    if (previous && previous !== node) {unbindPlaybackLog(previous);releaseAudioDeck(previous);}
    audioDeckRefs[index].current = node;
    if (index === activeDeckIndexRef.current) audioRef.current = node;
    setAudioDeckNodes((current) => {
      if (current[index] === node) return current;
      const next = [...current];
      next[index] = node;
      return next;
    });
    // Wire this deck into the Web Audio gain graph once (safe: no-op if already
    // wired or if Web Audio is unsupported). This is the iOS-safe volume path.
    if (!nativeAudioTransport()) {wireDeckIntoGraph(node);node?.setPCMOutput?.(audioContext,deckGains.get(node));bindPlaybackLog(node,index);}
  }, []);

  const getStandbyAudio = useCallback(
    () => audioDeckRefs[activeDeckIndexRef.current === 0 ? 1 : 0].current,
    []
  );

  const promoteStandbyAudio = useCallback(() => {
    const outgoing = audioRef.current;
    activeDeckIndexRef.current = activeDeckIndexRef.current === 0 ? 1 : 0;
    const incoming = audioDeckRefs[activeDeckIndexRef.current].current;
    // The standby deck is pre-heated (playing silently at deck gain 0) during
    // prepare so Safari's first-play() latency can't eat the fade window. But
    // that means it has been advancing its playback position the whole time —
    // with a 30s preload lead it can be ~28s into the next track when the
    // crossfade fires. Reset it to the top here so the incoming becomes
    // audible at the start of its song, not partway through.
    if (incoming && Number.isFinite(incoming.currentTime) && incoming.currentTime > 0) {
      try {
        incoming.currentTime = 0;
      } catch {
        // Some browser/media states can reject a seek even after pre-heat.
        // Keep promotion alive; the prepared-transition fallback/finalizers
        // still own recovery if the deck cannot be rewound.
      }
    }
    audioRef.current = incoming;
    return { incoming, outgoing };
  }, []);

  const seekPlayback = useCallback((fraction) => {
    const audio = audioRef.current;
    const seekState = seekTimeFromRatio(
      fraction,
      audio?.seekable?.length > 0 ? 0 : audio?.duration,
      expectedDurationRef.current,
      audio?.seekable
    );
    if (!audio || !canSeekWithState(seekState, audio)) {
      return { blocked: true, notice: blockedSeekNotice(seekState, audio) };
    }
    audio.currentTime = seekState.currentTime;
    const measuredDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    let displayCurrentTime = seekState.currentTime;
    if (seekState.usedSeekableRange && audio.seekable?.length > 0) {
      try {
        displayCurrentTime = Math.max(0, seekState.currentTime - audio.seekable.start(0));
      } catch {
        displayCurrentTime = seekState.currentTime;
      }
    }
    setPlaybackState({
      currentTime: displayCurrentTime,
      duration: measuredDuration || seekState.duration,
      canSeek: canSeekWithState(seekState, audio)
    });
    return { blocked: false };
  }, []);

  return {
    // Refs
    audioRef,
    audioDeckRefs,
    audioDeckNodes,
    bindAudioDeck,
    getStandbyAudio,
    promoteStandbyAudio,
    expectedDurationRef,
    currentStreamUrlRef,
    playRequestRef,
    skipNextEndedRequestRef,
    skipNextEndedTimerRef,
    // Web Audio (iOS-safe volume path)
    wakeAudioContext,
    setDeckGain,
    setMasterVolume,
    scheduleCrossfade,
    isWebAudioActive,
    // State
    isPlaying,
    playbackState,
    transport,
    transportRef,
    // Setters
    dispatchTransport,
    setPlaybackState,
    // Actions
    seekPlayback
  };
}
