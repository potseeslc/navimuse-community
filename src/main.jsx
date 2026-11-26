import {albumRun,albumHandoffIndex} from './albumPlayback.js';
import {useAlbumPlayback} from './useAlbumPlayback.js';
import {publishNativeRemotePlayer,endNativeRemotePlayer} from './remoteNowPlayingBridge.js';
import {enqueueBrowserListen} from './browserListeningReports.js';
import {useCarPlay} from './useCarPlay.js';
import {configureNativeHls} from './nativeHls.js';
import {useNativeListeningReports} from './useNativeListeningReports.js';
import {outputTransportMessage} from './wiimPlayback.js';
import {SearchSheet} from './SearchSheet.jsx';
import {ListenBrainzSurface,ListenBrainzHome} from './ListenBrainzSurface.jsx';
import {shareTrackDetails} from './shareTrack.js';
import {createArtistOpenerHistory} from './artistOpenerHistory.js';
import {usePersonalizedMix} from './usePersonalizedMix.js';
import {readHomeSnapshot, saveHomeSnapshot} from './homeSnapshot.js';
import {JourneyPicker} from './JourneyPicker.jsx';
import {applyAppearance} from './appearance.js';
import {cacheAheadSongs} from './streamCache.js';
import {useNativeOutput} from './useNativeOutput.js';
import {LibraryCollectionDetail} from './librarySearchSurfaces.jsx';
import {DownloadSettings} from './DownloadSettings.jsx';
import {DownloadsSurface} from './DownloadsSurface.jsx';
import {useOfflineDownloads} from './useOfflineDownloads.js';
import {forgetOfflineAccess,reconcileOfflineAccount} from './offlineDownloads.js';
import {apiRequestUrl} from './services/apiClient.js';
import {useWiiMPlayback} from './useWiiMPlayback.js';
import {remoteQueue,localPlaybackSession} from './wiimPlayback.js';
import {OutputPicker} from './OutputPicker.jsx';
import { chooseStreamPreference, hasMobileNetwork, deviceStreaming, saveDeviceStreaming } from './mobileStreaming.js';
import { useSleepTimer } from './useSleepTimer.js';
import { bindNativeAudioActions, nativeAudioTransport } from './nativeAudio.js';
import { audioTransitionCapabilities } from './audioPlatform.js';
import { AccountApplication } from './AccountApplication.jsx';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApplicationBoundary } from './ApplicationBoundary.jsx';
import { useArtworkPalette } from './useArtworkPalette.js';
import { AppShell } from './AppShell.jsx';
import { AlbumDetail } from './AlbumDetail.jsx';
import { OnboardingSurface } from './OnboardingSurface.jsx';
import { DesktopQueuePanel } from './QueueOverlay.jsx';
import { defaultAppSettings, defaultSettingsState } from './appSettings.js';
import { continuationCapabilities, journeyExtensionEnabled, normalizeContinuationPreferences, normalizeTransitionPreferences } from '../shared/playbackPreferences.js';
import { HomeSurface } from './homeSurface.jsx';
import { LibrarySurface, SearchSurface } from './librarySearchSurfaces.jsx';
import { SettingsSurface, SonicSurface } from './sonicSettingsSurfaces.jsx';
import { MiniPlayer, PlaybackServiceWarning, PlayerSheet, PlaylistPicker, Waveform, defaultTrackFeedback, formatDuration } from './playerChrome.jsx';
import { waveformAmplitudesFromPeaks } from './discovery.js';
import { shuffled } from './discoveryPlayback.js';
import {
  albumFromSong,
  albumQueueItems,
  canSeekWithState,
  clampSeekRatio,
  endedPlaybackAction,
  nextTrackFeedbackState,
  playbackReportRetryDelay,
  pauseAfterCurrentBoundary,
  pruneTrackFeedback,
  queueItem,
  restorablePlaybackPosition,
  resolveQueueIndex,
  seekTimeFromRatio,
  shouldRetryPlaybackReport,
  shouldSubmitScrobble,
  shouldSuppressEndedEvent,
  shouldAutoAdvanceQueue,
  shouldOpenFullPlayerOnPlay
} from './playerState.js';
import { usePlayerQueueState } from './playerQueueState.js';
import { repairRestoredQueue } from './queueRestore.js';
import { scopedQueueStorage } from './queueStorageScope.js';
import { legacyQueueMigration, QueueMigration } from './QueueMigration.jsx';
import { playbackStreamForCurrentQueueItem } from './playbackStream.js';
import { useAudioEngine } from './useAudioEngine.js';
import { transportStatusMessage } from './transportState.js';
import { createQueueSourceDescriptor } from './productInteractionContract.js';
import { reconcileGeneratedBoundary } from './queueMutations.js';
import {ordinaryAutoplayEnabled,removeUpcomingAutoplay} from '../shared/ordinaryAutoplay.js';
import {createOrdinaryAutoplay} from './ordinaryAutoplay.js';
import {createRemoteJourneyStarter} from './remoteJourney.js';
import { useSonicRadio } from './useSonicRadio.js';
import {
  cancelPendingSonicResume,
  consumePendingSonicResume,
  fetchArtistSongs,
  fetchGenreSongs,
  fetchSonicSimilarTracks,
  activeRadioProgressIds,
  queueIndexForSong,
  rawQueueSong,
  searchSonicFallback
} from './sonicRadioUi.js';
import { createPlaylist, fetchPlaylists, saveSonicRadioPlaylist, updatePlaylist } from './playlists.js';
import { lockSessionForOnboarding, onboardingMode } from './onboardingState.js';
import { playlistPlaybackPlan } from './playlistPresentation.js';
import { bindMediaSessionActions } from './mediaSession.js';
import { useMediaSessionPublication } from './useMediaSessionPublication.js';
import { navigationUrl, readBrowserNavigationState, saveAlbumSortPreference } from './navigationState.js';
import { setQueueEntry } from './queueEntry.js';
import { coverArtUrl, fallbackArtwork, normalizedAlbums } from './surfaceUi.jsx';
import { sendPlaybackReport } from './playbackReports.js';
import { requestedStreamSummary, sourceSignalSummary } from './streamPresentation.js';
import { apiFetch, apiNavigationUrl, nativeFirstPartyBffRedirectTarget } from './services/apiClient.js';
import { extendAtlasJourney, planAtlasJourney, revalidateAtlasJourney } from './services/atlasJourneyService.js';
import { createAtlasJourneyController } from './atlasJourneyController.js';
import { ATLAS_EXTENSION_TARGET_TRACKS, atlasJourneyRunway } from './atlasContinuation.js';
import { AtlasJourneyContext } from './AtlasJourneyContext.jsx';
import { atlasJourneyEventTypes } from './atlasJourneyEvents.js';
import { audiomuseClapStats, audiomuseWaveform } from './services/audiomuseService.js';
import {
  navidromeAlbum,
  navidromeBootstrap,
  navidromeFeedback, navidromeRadioFeedback, saveRadioFeedback,
  navidromeLyrics,
  navidromeSong,
  streamPath
} from './services/navidromeService.js';
import * as settingsService from './services/settingsService.js';
import {
  TRANSITION_MODE,
  SWEET_FADE_MICRO_SECONDS,
  canUsePreparedDeck,
  effectiveSweetFadeSeconds,
  shouldPrepareTransition,
  shouldStartSweetFade,
  sweetFadeSeconds,
  transitionDeckVolumes,
  transitionDecisionFor,
  transitionEventForDecision,
  TRANSITION_EVENT,
  isBlendTransition
} from './playbackTransitions.js';
import './styles.css';
import './settingsWorkspace.css';
import './sonicDiscovery.css';
import './libraryWorkspace.css';
import './homeWorkspace.css';
import './scrolling.css';
import './playerWorkspace.css';
import './searchWorkspace.css';

const audioEvidenceMode = import.meta.env.VITE_NAVIMUSE_AUDIO_EVIDENCE === '1';
const nativeFirstPartyRedirect = audioEvidenceMode ? null : nativeFirstPartyBffRedirectTarget();

const protectedApiFetch = apiFetch;

function sessionNeedsUnlock(payload) {
  return Boolean(payload?.adminConfigured) && !payload?.authenticated;
}

const defaultPlayerControls = {
  pauseAfterCurrent: false,
  repeat: false,
  repeatAll: false,
  shuffle: false,
  panel: ''
};

function useEventCallback(callback) {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return useCallback((...args) => callbackRef.current?.(...args), []);
}

// Track feedback is cached locally for responsiveness and synced to Navidrome when the track has a real song id.
const trackFeedbackStorageKey = 'navimuse.trackFeedback.v1';
const volumeStorageKey = 'navimuse.volume.v1';
const maxTrackFeedbackEntries = 500;
const miniPlayerCompactScrollTop = 72;
const miniPlayerScrollDelta = 8;

function App(props) {
  const [queueScope, setQueueScope] = useState(props.offlineAccess?.scope||null);
  const [migrationDecided, setMigrationDecided] = useState(null);
  let migration;
  try { migration = !props.offlineAccess && !props.accountSession && queueScope && migrationDecided !== queueScope ? legacyQueueMigration(window.localStorage, queueScope) : null; } catch {}
  if (migration) return <QueueMigration migration={migration} onDone={() => setMigrationDecided(queueScope)} />;
  // Replacing the authenticated namespace disposes the old player and its async
  // work before restoring another account/server. Normal session refreshes with
  // the same namespace retain the one mounted playback authority.
  let storage = props.accountStorage;
  if (!props.accountSession && !props.offlineAccess) {
    try { storage = scopedQueueStorage(window.localStorage, queueScope); } catch { storage = null; }
  }
  return <PlayerApp {...props} key={props.accountSession?.queueScope || queueScope || 'unverified'} queueScope={queueScope} onQueueScope={setQueueScope} accountStorage={storage} />;
}

function PlayerApp({ queueScope, onQueueScope, accountSession = null, accountStorage, accountPreferences, accountPreferencesClient, onAccountRefresh, onAccountLogout, offlineAccess=null, onOfflineReconnect }) {
  const artistOpenerHistoryRef = useRef(null);
  if (!artistOpenerHistoryRef.current) artistOpenerHistoryRef.current = createArtistOpenerHistory(accountStorage);
  const offline=Boolean(offlineAccess);
  const sessionAliveRef = useRef(true);
  const sessionRequestRef = useRef(0);
  useEffect(() => { sessionAliveRef.current = true; return () => { sessionAliveRef.current = false; }; }, []);
  const initialNavigationState = useMemo(() => readBrowserNavigationState(accountStorage), [accountStorage]);
  // Audio engine: owns the audio element ref, playback state, stream URL tracking,
  // play-request tracking, and ended-event suppression refs.  Extracted from the
  // App monolith per issue #71 — App retains the audio event listener effect and
  // playTrack/togglePlayback orchestration because they bridge to queue state.
  const {
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
    isPlaying: localIsPlaying,
    playbackState: localPlaybackState,
    transport,
    transportRef,
    dispatchTransport,
    setPlaybackState,
    seekPlayback: engineSeek,
    wakeAudioContext,
    setDeckGain,
    setMasterVolume,
    scheduleCrossfade,
    isWebAudioActive
  } = useAudioEngine();

  const advanceQueueEventRef = useRef(() => false);
  const resumePlaybackRef = useRef(() => {});
  const playbackIntentRef = useRef(0);
  const albumRequestRef = useRef(null);
  const completeAtlasJourneyRef = useRef(() => {});
  const cancelTransitionRef = useRef(() => {});
  const pendingTransitionRef = useRef(null);
  const [transitionDiagnostic, setTransitionDiagnostic] = useState(null);
  const transitionRampTimerRef = useRef(0);
  const transitionRampCancelRef = useRef(null);
  // Holds a cleanup that detaches the sweet-fade's one-shot ramp listeners and
  // cancels the scheduled crossfade automation. Invoked from both the normal
  // finalize path and cancellation so a mid-fade skip never leaves orphaned
  // listeners or automation behind (prevents the session-lock wedge).
  const transitionFadeCleanupRef = useRef(null);
  const startDeckTickerRef = useRef(new WeakMap());
  const stopDeckTickerRef = useRef(new WeakMap());
  const executePreparedTransitionRef = useRef(() => false);
  const transitionVolumeRef = useRef(1);
  const resumeAfterSonicAppendRef = useRef(0);
  const getSonicRadioStateRef = useRef(() => ({ status: 'idle' }));
  const trackFeedbackReadyRef = useRef(false);
  const trackFeedbackStorageWarningRef = useRef(false);
  const trackFeedbackSaveTimerRef = useRef(0);
  const trackFeedbackSyncRequestRef = useRef(0);
  const trackFeedbackSyncAbortRef = useRef(null);
  const settingsRef = useRef(defaultSettingsState.preferences);
  const [health, setHealth] = useState(null);
  const [navidrome, setNavidrome] = useState({ loading: true, error: '', musicFolders: [], newestAlbums: [], randomAlbums: [], frequentAlbums: [] });
  const [playerOpen, setPlayerOpen] = useState(false);
  const queueEntryRef = useRef({ opener: null, closePlayer: false });
  const [libraryKey, setLibraryKey] = useState(initialNavigationState.libraryKey);
  const [activeTab, setActiveTab] = useState(offline?'library':initialNavigationState.activeTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [libraryBrowseKey, setLibraryBrowseKey] = useState(initialNavigationState.libraryBrowseKey);
  const [libraryAlbumSort, setLibraryAlbumSort] = useState(initialNavigationState.libraryAlbumSort);
  const [localNowPlaying, setNowPlaying] = useState(null);
  const [albumDetail, setAlbumDetail] = useState(null);
  const [artistDetail,setArtistDetail]=useState(null);
  const nativeOutput=useNativeOutput();
  const artistOpenerRef=useRef(null);
  const albumOpenerRef = useRef(null);
  const [playbackMessage, setPlaybackMessage] = useState('');
  const [volume, setVolume] = useState(() => loadVolume(accountStorage));
  const [playerNotice, setPlayerNotice] = useState('');
  const [playlistPicker, setPlaylistPicker] = useState({ open: false, loading: false, busy: false, error: '', items: [] });
  const [playlistRevision, setPlaylistRevision] = useState(0);
  const personalizedMix=usePersonalizedMix({apiFetch:protectedApiFetch,scope:queueScope,enabled:Boolean(queueScope)&&!offline,onSaved:()=>setPlaylistRevision(value=>value+1)});
  const playlistPickerOpenerRef = useRef(null);
  const playlistPickerBusyRef = useRef(false);
  const playlistPickerLoadRef = useRef(null);
  const {
    queue: playQueue,
    queueRef: playQueueRef,
    queueRevision,
    queueRevisionRef,
    restorationSnapshot,
    commitRestorationRepair,
    controls: playerControls,
    controlsRef: playerControlsRef,
    playHistoryCount,
    playHistoryRef,
    shufflePoolCount,
    shufflePoolRef,
    canUndoQueueEdit,
    restoredPosition,
    hasRestoredQueue,
    replaceQueue,
    removeQueueItem,
    moveQueueItem,
    clearUpcoming,
    clearPlayed,
    clearGenerated,
    playNext: insertPlayNext,
    addToQueue: appendToQueue,
    undoQueueEdit,
    updateControls: updatePlayerControls,
    selectQueueIndex,
    advanceQueue: advancePlayerQueue,
    prepareAdvance: prepareQueueAdvance,
    commitAdvance: commitQueueAdvance,
    persist: persistPlayerQueue,
    commitAtlasTransaction,
    persistAtlasJourney,
    detachAtlasJourney,
    restoredAtlasJourney
  } = usePlayerQueueState(defaultPlayerControls, {storage: accountStorage});
  const remoteAuthorityRef = useRef(null);
  const atlasJourneyControllerRef = useRef(null);
  if (!atlasJourneyControllerRef.current) atlasJourneyControllerRef.current = createAtlasJourneyController({
    planJourney: planAtlasJourney,
    extendJourney: extendAtlasJourney,
    revalidateJourney: revalidateAtlasJourney,
    queueAdapter: { snapshot: () => playQueueRef.current, commitAtlasTransaction, persistAtlasJourney },
    getPlaybackPosition: () => Number(audioRef.current?.currentTime || 0)
  });
  useEffect(() => {
    let cancelled = false;
    if (!offline && restoredAtlasJourney) {
      atlasJourneyControllerRef.current.restore(restoredAtlasJourney).catch(() => null).finally(() => {
        if (!cancelled) setAtlasJourneyState(atlasJourneyControllerRef.current.getState());
      });
      setAtlasJourneyState(atlasJourneyControllerRef.current.getState());
    }
    return () => { cancelled = true; atlasJourneyControllerRef.current?.cancel(); };
  }, [restoredAtlasJourney]);
  const [atlasJourneyState, setAtlasJourneyState] = useState(() => atlasJourneyControllerRef.current.getState());
  const atlasJourneyActions = useMemo(() => ({
    plan: async input => { const result=await atlasJourneyControllerRef.current.plan(input); setAtlasJourneyState(atlasJourneyControllerRef.current.getState()); return result; },
    start: options => { if(remoteAuthorityRef.current?.blocksLocal)throw new Error('Choose This device before starting a Journey.'); const result=atlasJourneyControllerRef.current.start(options); setAtlasJourneyState(atlasJourneyControllerRef.current.getState()); return result; },
    appendResolved: value => { const result=atlasJourneyControllerRef.current.appendResolved(value); setAtlasJourneyState(atlasJourneyControllerRef.current.getState()); return result; },
    extend: options => {
      const pendingExtension = atlasJourneyControllerRef.current.extend(options);
      setAtlasJourneyState(atlasJourneyControllerRef.current.getState());
      return pendingExtension.finally(() => setAtlasJourneyState(atlasJourneyControllerRef.current.getState()));
    },
    recordPlaybackAction: (type, queueItemId, reason) => { const result=atlasJourneyControllerRef.current.recordPlaybackAction(type, queueItemId, reason); setAtlasJourneyState(atlasJourneyControllerRef.current.getState()); return result; },
    complete: queueItemId => { const result=atlasJourneyControllerRef.current.complete(queueItemId); setAtlasJourneyState(atlasJourneyControllerRef.current.getState()); return result; },
    detach: () => {
      detachAtlasJourney(Number(audioRef.current?.currentTime || 0));
      atlasJourneyControllerRef.current.detach();
      setAtlasJourneyState(atlasJourneyControllerRef.current.getState());
    },
    cancelPreview: () => { atlasJourneyControllerRef.current.cancel(); setAtlasJourneyState(atlasJourneyControllerRef.current.getState()); },
    refresh: () => setAtlasJourneyState(atlasJourneyControllerRef.current.getState())
  }), [detachAtlasJourney]);
  useEffect(() => { atlasJourneyActions.refresh(); }, [atlasJourneyActions, playQueue]);
  const atlasJourneyContextValue = useMemo(() => ({ state: atlasJourneyState, ...atlasJourneyActions }), [atlasJourneyActions, atlasJourneyState]);
  const atlasExtensionAttemptRef = useRef('');
  useEffect(() => {
    const journey = atlasJourneyState.persisted?.journey;
    if (!journey || !atlasJourneyState.queueAttached || atlasJourneyState.status !== 'active' || !journeyExtensionEnabled(settingsRef.current)) return;
    const runway = atlasJourneyRunway(playQueue);
    if (!runway.needsExtension) return;
    const attemptKey = `${journey.journeyId}:${journey.frozenRevision}`;
    if (atlasExtensionAttemptRef.current === attemptKey) return;
    atlasExtensionAttemptRef.current = attemptKey;
    atlasJourneyActions.extend({ targetTrackCount: ATLAS_EXTENSION_TARGET_TRACKS }).catch(() => null);
  }, [atlasJourneyActions, atlasJourneyState.persisted?.journey, atlasJourneyState.queueAttached, atlasJourneyState.status, playQueue]);
  useLayoutEffect(() => {
    completeAtlasJourneyRef.current = queueItemId => {
      try { atlasJourneyActions.complete(queueItemId); }
      catch { setPlayerNotice('Journey finished, but its completion could not be saved.'); }
    };
  }, [atlasJourneyActions]);
  const [trackFeedback, setTrackFeedback] = useState(() => loadTrackFeedback(accountStorage));
  const [sonicSavePending, setSonicSavePending] = useState(false);
  const trackFeedbackLatestRef = useRef(trackFeedback);
  const miniPlayerLastScrollTopRef = useRef(0);
  const [waveformState, setWaveformState] = useState({ songId: '', status: 'idle', values: [] });
  const [lyricsAttempt, retryLyrics] = useState(0);
  const [lyricsState, setLyricsState] = useState({ songId: '', status: 'idle', source: 'library', synced: false, language: '', offsetMs: 0, lines: [] });
  const [settingsState, setSettingsState] = useState(() => accountPreferences ? mergeSettings({preferences:accountPreferences.preferences}) : defaultSettingsState);
  const [settingsReady,setSettingsReady]=useState(Boolean(accountPreferences||offline));
  const settingsReadyRef=useRef(Boolean(accountPreferences||offline));
  const accountPreferenceRevision = useRef(accountPreferences?.revision);
  const [librarySaving,setLibrarySaving]=useState(false);
  useEffect(()=>applyAppearance(settingsState.preferences.appearance),[settingsState.preferences.appearance]);
  useEffect(()=>{const selected=settingsState.preferences.library.selectedFolders;if(Array.isArray(selected)&&selected.length)setLibraryKey(selected.join(','));},[settingsState.preferences.library.selectedFolders]);
  const [settingsSession, setSettingsSession] = useState({ adminConfigured: Boolean(accountSession||offlineAccess), authenticated: Boolean(accountSession||offlineAccess), authMode: 'password', loginUrl: null, user: accountSession?.account || null });
  const [sessionResolved, setSessionResolved] = useState(Boolean(accountSession||offlineAccess));
  const {controller:downloads,state:downloadsState}=useOfflineDownloads({scope:accountSession?.queueScope||queueScope,authenticated:sessionResolved&&settingsSession.authenticated,resolved:sessionResolved,offline});
  const [downloadsOpen,setDownloadsOpen]=useState(offline);
  const [searchOpen,setSearchOpen]=useState(false);
  const [sessionLoadError, setSessionLoadError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [outputOpen,setOutputOpen]=useState(false);
  const [journeySeed,setJourneySeed]=useState(null);
  const freezeJourneyForOutputRef=useRef(()=>{});
  const pauseLocalForWiiM=async()=>{
    freezeJourneyForOutputRef.current();
    playbackIntentRef.current++;playRequestRef.current++;albumRequestRef.current?.abort();cancelTransitionRef.current();
    for(const ref of audioDeckRefs){const deck=ref.current;if(!deck||!deck.currentSrc&&deck.paused)continue;
      deck.pause();if(deck.send)await deck.send('pause');
      deck.removeAttribute('src');deck.load();if(deck.pendingLoad)await deck.pendingLoad;
    }
    dispatchTransport({type:'pause',requestId:playRequestRef.current,intentional:true});
  };
  const {controller:wiim,state:wiimState}=useWiiMPlayback({scope:accountSession?.queueScope || queueScope,authenticated:sessionResolved&&settingsSession.authenticated,pauseLocal:pauseLocalForWiiM,offline,offlineOwnership:offlineAccess?.outputOwnership,playbackSource:localNowPlaying?.id});
  useEffect(()=>{const media=window.matchMedia('(orientation: landscape) and (max-height: 520px) and (pointer: coarse)');const show=()=>{if(media.matches&&(wiim.state.session?.song||localNowPlaying))setPlayerOpen(true);};show();media.addEventListener?.('change',show);return()=>media.removeEventListener?.('change',show);},[localNowPlaying?.id,wiimState.session?.song?.id]);
  const [radioNow,setRadioNow]=useState(null);
  useEffect(()=>{const id=wiimState.session?.song?.id || localNowPlaying?.id;if(offline||!id?.startsWith('radio:')){setRadioNow(null);return;}let active=true;const controller=new AbortController();
    const refresh=async()=>{try{const response=await protectedApiFetch(`/api/navidrome/radios/${encodeURIComponent(id.slice(6))}/metadata`,{signal:controller.signal});if(response.ok){const payload=await response.json();if(active)setRadioNow({id,...payload});}}catch{}};
    void refresh();const timer=window.setInterval(refresh,10000);return()=>{active=false;controller.abort();window.clearInterval(timer);};
  },[offline,localNowPlaying?.id,wiimState.session?.id,wiimState.session?.song?.id]);
  remoteAuthorityRef.current=wiim;
  const remoteSession=wiimState.session;
  useEffect(()=>{void publishNativeRemotePlayer({scope:accountSession?.queueScope||queueScope,session:remoteSession,checked:wiimState.checked,busy:wiimState.busy,error:wiimState.error});},[accountSession?.queueScope,queueScope,remoteSession?.id,remoteSession?.revision,remoteSession?.status,remoteSession?.song?.id,wiimState.checked,wiimState.busy,wiimState.error]);
  useEffect(()=>()=>{void endNativeRemotePlayer();},[accountSession?.queueScope,queueScope]);
  const displayedSong=remoteSession?.song?{...normalizeSong(remoteSession.song,null,'WiiM Direct',settingsState.preferences.library.artworkSize,{wifiFormat:'raw',cellularFormat:'raw'}),delivery:remoteSession.delivery}:localNowPlaying;
  const nowPlaying=radioNow && radioNow.id===displayedSong?.id?{...displayedSong,...(radioNow.artwork?{artwork:apiRequestUrl(radioNow.artwork)}:{}),radioTitle:radioNow.title,radioHistory:radioNow.history}:displayedSong;
  const isPlaying=remoteSession?remoteSession.status==='playing':localIsPlaying;
  const playbackState=remoteSession?{currentTime:remoteSession.position||0,duration:remoteSession.duration||0,canSeek:!remoteSession.queue?.internetRadio&&['playing','paused'].includes(remoteSession.status)}:localPlaybackState;
  const visibleQueue=remoteSession?.queue||playQueue;
  const visibleControls={...playerControls,...remoteSession?.controls};
  const changePlayerControls=patch=>{
    if(!remoteSession)return updatePlayerControls(patch);
    const local=Object.fromEntries(Object.entries(patch).filter(([key])=>!['shuffle','repeat','repeatAll','pauseAfterCurrent'].includes(key)));
    if(Object.keys(local).length)updatePlayerControls(local);
    const controls=Object.fromEntries(Object.entries(patch).filter(([key])=>['shuffle','repeat','repeatAll','pauseAfterCurrent'].includes(key)));
    if(Object.keys(controls).length)void wiim.command('controls',{controls});
  };
  const remoteQueueEdit=(action,extra={})=>wiim.command('queue',{mutation:{action,...extra}});
  const localOnly=action=>(...args)=>{if(offline){setPlayerNotice('Reconnect to start or extend a Journey.');return;}if(wiim.blocksLocal&&!wiim.state.session){setPlayerNotice('Confirm the playback output before starting a Journey.');setOutputOpen(true);return;}return action(...args);};
  useNativeListeningReports({scope:accountSession?.queueScope||queueScope,enabled:!offline&&sessionResolved&&settingsSession.authenticated,fetchFn:protectedApiFetch});
  useEffect(()=>{configureNativeHls({scope:accountSession?.queueScope||queueScope,enabled:!offline&&sessionResolved&&settingsSession.authenticated&&!remoteSession});return ()=>configureNativeHls({scope:null,enabled:false});},[queueScope,accountSession?.queueScope,offline,sessionResolved,settingsSession.authenticated,remoteSession?.id]);
  const playbackReportRef = useRef({ id: '', nowPlayingSent: false, scrobbleSent: false, nowPlayingAttempts: 0, scrobbleAttempts: 0, nowPlayingRetryAt: 0, scrobbleRetryAt: 0 });
  const pendingRestorePositionRef = useRef(0);
  const persistedPlaybackRef = useRef({ position: restoredPosition, queue: playQueue, controls: playerControls });
  const [listeningProgress, setListeningProgress] = useState({ id: '', seconds: 0 });
  const transportMessage = transportStatusMessage(transport, {
    position: playbackState.currentTime || restoredPosition,
    title: nowPlaying?.title || ''
  });
  const positionForPersistence = useCallback((position) => restorablePlaybackPosition(
    position,
    Number(audioRef.current?.duration || expectedDurationRef.current || 0),
    transportRef.current.status
  ), []);

  useEffect(() => {
    const position = positionForPersistence(Number(audioRef.current?.currentTime || playbackState.currentTime || 0));
    const previous = persistedPlaybackRef.current;
    if (previous.queue === playQueue && previous.controls === playerControls) return;
    persistPlayerQueue(position);
    persistedPlaybackRef.current = { position, queue: playQueue, controls: playerControls };
  }, [playQueue, playerControls, persistPlayerQueue, positionForPersistence]);

  useEffect(() => {
    const handlePopState = () => {
      const nextNavigationState = readBrowserNavigationState(accountStorage);
      setActiveTab(nextNavigationState.activeTab);
      setLibraryKey(settingsRef.current.library?.selectedFolders?.join(',') ?? nextNavigationState.libraryKey);
      setLibraryBrowseKey(nextNavigationState.libraryBrowseKey);
      setLibraryAlbumSort(nextNavigationState.libraryAlbumSort);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [accountStorage]);

  useEffect(() => {
    const nextUrl = navigationUrl(window.location.href, {
      activeTab,
      libraryKey,
      libraryBrowseKey,
      libraryAlbumSort
    });
    if (nextUrl.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [activeTab, libraryAlbumSort, libraryBrowseKey, libraryKey]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      const position = positionForPersistence(Number(audioRef.current?.currentTime || 0));
      const previous = persistedPlaybackRef.current;
      if (Math.abs(position - previous.position) < 5) return;
      persistPlayerQueue(position);
      persistedPlaybackRef.current = { ...previous, position };
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isPlaying, persistPlayerQueue, positionForPersistence]);

  const flushPlaybackPosition = useCallback(() => {
    if(wiim.blocksLocal)return;
    const position = positionForPersistence(Number(audioRef.current?.currentTime ?? persistedPlaybackRef.current.position ?? 0));
    persistPlayerQueue(position);
    persistedPlaybackRef.current = {
      position,
      queue: playQueueRef.current,
      controls: playerControlsRef.current
    };
  }, [persistPlayerQueue, positionForPersistence]);
  useEffect(() => {
    window.addEventListener('pagehide', flushPlaybackPosition);
    return () => window.removeEventListener('pagehide', flushPlaybackPosition);
  }, [flushPlaybackPosition]);

  useEffect(() => {
    setListeningProgress({ id: nowPlaying?.id || '', seconds: 0 });
  }, [nowPlaying?.id]);

  useEffect(() => {
    const songId = nowPlaying?.id;
    if (offline || !songId) {
      setLyricsState({ songId: '', status: 'idle', source: 'library', synced: false, language: '', offsetMs: 0, lines: [] });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setLyricsState({ songId, status: 'loading', source: 'library', synced: false, language: '', offsetMs: 0, lines: [] });
    navidromeLyrics(songId, { signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        if (payload?.songId !== songId) throw new Error('Lyrics response does not match the current track');
        setLyricsState({
          songId,
          status: payload.status === 'ready' && payload.lines?.length ? 'ready' : 'unavailable',
          source: payload.source || 'library',
          synced: payload.synced === true,
          language: payload.language || '',
          offsetMs: Number(payload.offsetMs) || 0,
          lines: Array.isArray(payload.lines) ? payload.lines : []
        });
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') {
          setLyricsState({ songId, status: 'error', source: 'library', synced: false, language: '', offsetMs: 0, lines: [] });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [nowPlaying?.id, lyricsAttempt]);

  useEffect(() => {
    if (offline || wiim.blocksLocal || !isPlaying || !nowPlaying?.id) return undefined;
    const id = nowPlaying.id;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.readyState < 3) return;
      setListeningProgress((progress) => (
        progress.id === id
          ? { ...progress, seconds: progress.seconds + 1 }
          : { id, seconds: 1 }
      ));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, nowPlaying?.id]);

  useEffect(() => {
    const media = navigator.mediaSession;
    if (!media && !nativeAudioTransport()) return undefined;
    const handlers = {
      play: () => resumePlaybackRef.current(), pause: () => { if(wiim.blocksLocal)return; playbackIntentRef.current += 1; cancelTransitionRef.current(); dispatchTransport({ type: 'pause', requestId: playRequestRef.current, intentional: true }); audioRef.current?.pause(); flushPlaybackPosition(); },
      previoustrack: () => advanceQueueEventRef.current('previous'), nexttrack: () => advanceQueueEventRef.current('next'),
      seekto: (event) => { if(wiim.blocksLocal)return; cancelTransitionRef.current(); if (audioRef.current && Number.isFinite(event.seekTime)) audioRef.current.currentTime = event.seekTime; },
      stop: () => { if(wiim.blocksLocal)return; if (audioRef.current) { dispatchTransport({ type: 'pause', requestId: playRequestRef.current, intentional: true }); audioRef.current.pause(); audioRef.current.currentTime = 0; flushPlaybackPosition(); } }
    };
    return nativeAudioTransport() ? bindNativeAudioActions(handlers) : bindMediaSessionActions(media, handlers);
  }, [dispatchTransport, flushPlaybackPosition]);

  useEffect(()=>{nativeAudioTransport()?.request({action:'commands',previous:!remoteSession,next:!remoteSession,canPrevious:playerControls.shuffle?playHistoryCount>0:playQueue.index>0}).catch(()=>{});},[remoteSession?.id,playQueue.index,playHistoryCount,playerControls.shuffle]);
  useMediaSessionPublication(remoteSession ? null : nowPlaying, remoteSession ? false : isPlaying, playbackState);

  useEffect(() => {
    const id = nowPlaying?.id;
    if (offline || wiim.blocksLocal || !isPlaying || !id || id.startsWith('radio:') || id.startsWith('mock-')) return;
    if (playbackReportRef.current.id !== id) {
      playbackReportRef.current = { id, event: {id:crypto.randomUUID(),time:Date.now()}, nowPlayingSent: false, scrobbleSent: false, nowPlayingAttempts: 0, scrobbleAttempts: 0, nowPlayingRetryAt: 0, scrobbleRetryAt: 0 };
    }
    const report = playbackReportRef.current;
    const now = Date.now();
    if (!report.nowPlayingSent && now >= report.nowPlayingRetryAt) {
      report.nowPlayingSent = true;
      sendPlaybackReport(protectedApiFetch, id, false).catch((error) => {
        if (playbackReportRef.current !== report) return;
        if (!shouldRetryPlaybackReport(error)) return;
        report.nowPlayingSent = false;
        report.nowPlayingAttempts += 1;
        report.nowPlayingRetryAt = Date.now() + playbackReportRetryDelay(report.nowPlayingAttempts);
      });
    }
    const duration = Number(playbackState.duration || 0);
    const listenedSeconds = listeningProgress.id === id ? listeningProgress.seconds : 0;
    if (nativeAudioTransport()?.listeningLedger || !shouldSubmitScrobble(duration, listenedSeconds) || report.scrobbleSent || now < report.scrobbleRetryAt) return;
    report.scrobbleSent = true;
    Promise.resolve().then(()=>enqueueBrowserListen(accountSession?.queueScope||queueScope,report.event,id)).catch((error) => {
      if (playbackReportRef.current !== report) return;
      if (!shouldRetryPlaybackReport(error)) return;
      report.scrobbleSent = false;
      report.scrobbleAttempts += 1;
      report.scrobbleRetryAt = Date.now() + playbackReportRetryDelay(report.scrobbleAttempts);
    });
  }, [isPlaying, nowPlaying?.atlasOwned, nowPlaying?.id, playbackState.duration, listeningProgress]);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const authError = currentUrl.searchParams.get('auth_error');
    if (!authError) return;
    setSettingsMessage(authError);
    currentUrl.searchParams.delete('auth_error');
    window.history.replaceState({}, '', currentUrl);
  }, []);

  function suspendAccountPlayback() {
    playbackIntentRef.current += 1;
    albumRequestRef.current?.abort();
    cancelTransitionRef.current();
    dispatchTransport({ type: 'pause', requestId: playRequestRef.current, intentional: true });
    audioDeckRefs.forEach(deckRef => deckRef.current?.pause());
  }

  useEffect(() => {
    const showUnlock = () => {
      void forgetOfflineAccess().catch(()=>{});
      if (accountSession) {
        suspendAccountPlayback();
        void onAccountRefresh();
        return;
      }
      // Authentication is a top-level application boundary. Expiration returns
      // to OnboardingSurface; Settings is never exposed as a login screen.
      sessionRequestRef.current += 1;
      onQueueScope(null);
      setSettingsSession(lockSessionForOnboarding);
      setSettingsMessage('');
      void refreshSession({ showLoading: true });
    };
    window.addEventListener('navimuse:session-required', showUnlock);
    return () => window.removeEventListener('navimuse:session-required', showUnlock);
  }, []);
  const [miniPlayerCompact, setMiniPlayerCompact] = useState(false);

  const [safetyCache, setSafetyCache] = useState({scope:'',ready:[]});
  useEffect(()=>{
    const native=nativeAudioTransport();if(!native?.safetyCache)return;
    const changed=({detail})=>{if(detail?.type==='safetycache')setSafetyCache(detail);};
    window.addEventListener('navimuse-native-audio',changed);
    native.request({action:'cacheStatus'}).catch(()=>{});
    return ()=>window.removeEventListener('navimuse-native-audio',changed);
  },[]);
  const queueDownloadState={...downloadsState,safetyReady:safetyCache.scope===(accountSession?.queueScope||queueScope)&&!remoteSession?safetyCache.ready:[]};
  useEffect(() => {
    const native=nativeAudioTransport();if(!native?.cacheAhead)return;
    const prepare=()=>{const preference=native.safetyCache?{format:'mp3',maxBitRate:96}:chooseStreamPreference(settingsRef.current.streaming);const songs=!offline&&!remoteSession?cacheAheadSongs(playQueue,playerControlsRef.current,shufflePoolRef.current,playHistoryRef.current,downloadsState.tracks?.filter(t=>t.state==='complete').map(t=>t.song.id),native.safetyCache?{}:{includeCurrent:false,maxUpcoming:3}):[];
      native.request({action:'cacheAhead',scope:accountSession?.queueScope||queueScope,format:preference.format,bitrate:Number(preference.maxBitRate),songs}).catch(()=>{});
    };
    prepare();const changed=({detail})=>{if(detail?.type==='network')prepare();};window.addEventListener('navimuse-native-audio',changed);
    return ()=>window.removeEventListener('navimuse-native-audio',changed);
  },[playQueue,playerControls,isPlaying,remoteSession?.id,offline,queueScope,accountSession?.queueScope]);

  const activeLibrary = useMemo(() => {
    const selected = (Array.isArray(navidrome.musicFolders) ? navidrome.musicFolders : []).filter(folder => libraryKey.split(',').includes(String(folder.id)));
    return selected.length ? {id:libraryKey,name:selected.map(folder=>folder.name).join(' + ')} : undefined;
  }, [libraryKey, navidrome.musicFolders]);
  const activeTrackFeedback = useMemo(
    () => nowPlaying?.id
      ? { ...defaultTrackFeedback, ...(trackFeedback[nowPlaying.id] || {}) }
      : defaultTrackFeedback,
    [nowPlaying?.id, trackFeedback]
  );

  const phoneFrameClass = [
    'phone-frame',
    nowPlaying ? 'has-mini-player' : '',
    nowPlaying && miniPlayerCompact && !playerOpen ? 'mini-player-compact' : ''
  ].filter(Boolean).join(' ');

  const syncMiniPlayerForSurface = useCallback((surface) => {
    if (!nowPlaying || playerOpen) return;
    if (!(surface instanceof Element) || !surface.matches('.home-surface, .screen-surface')) return;
    const nextScrollTop = Math.max(0, surface.scrollTop);
    const scrollDelta = nextScrollTop - miniPlayerLastScrollTopRef.current;
    if (Math.abs(scrollDelta) < miniPlayerScrollDelta) return;
    miniPlayerLastScrollTopRef.current = nextScrollTop;
    if (nextScrollTop < miniPlayerCompactScrollTop || scrollDelta < 0) {
      setMiniPlayerCompact(false);
      return;
    }
    setMiniPlayerCompact(true);
  }, [nowPlaying, playerOpen]);

  const handleSurfaceScroll = useCallback((event) => {
    syncMiniPlayerForSurface(event.target);
  }, [syncMiniPlayerForSurface]);

  useEffect(() => {
    if (nowPlaying && !playerOpen) return;
    setMiniPlayerCompact(false);
  }, [nowPlaying, playerOpen]);

  useEffect(() => {
    miniPlayerLastScrollTopRef.current = 0;
    setMiniPlayerCompact(false);
  }, [activeTab]);

  const homeRequestRef = useRef(null);
  const refreshNavidrome = () => {
    if (offline || !sessionResolved || !settingsSession.authenticated) return;
    homeRequestRef.current?.abort();
    const request = new AbortController();
    homeRequestRef.current = request;
    const cached = readHomeSnapshot(accountStorage, libraryKey);
    setNavidrome(current => {
      const available = cached || (current.homeLibraryKey === libraryKey && current.hasSnapshot ? current : null);
      return { musicFolders: [], newestAlbums: [], recentAlbums: [], randomAlbums: [], frequentAlbums: [], ...(available || {}), homeLibraryKey: libraryKey, loading: true, error: '', hasSnapshot: Boolean(available) };
    });

    navidromeBootstrap(libraryKey, { signal: request.signal })
      .then((payload) => {
        if (homeRequestRef.current === request && !request.signal.aborted) {
          saveHomeSnapshot(accountStorage, libraryKey, payload);
          setNavidrome({ ...payload, homeLibraryKey: libraryKey, loading: false, error: '', hasSnapshot: true });
        }
      })
      .catch((error) => {
        if (homeRequestRef.current !== request || request.signal.aborted) return;
        setNavidrome((current) => ({
          ...current,
          loading: false,
          error: error?.message || 'Navidrome is not ready for NaviMuse yet'
        }));
      });
  };

  useEffect(()=>{
    if(offline||!sessionResolved||!settingsSession.authenticated)return;
    const controller=new AbortController();
    const before=trackFeedbackLatestRef.current;
    navidromeRadioFeedback({signal:controller.signal}).then(payload=>{
      if(controller.signal.aborted)return;
      const current=trackFeedbackLatestRef.current,next={...current};
      for(const [id,value] of Object.entries(payload.feedback||{})){
        if(id.startsWith('radio:')&&current[id]===before[id])next[id]=value;
      }
      trackFeedbackLatestRef.current=next;setTrackFeedback(next);
    }).catch(error=>{if(!controller.signal.aborted)setPlayerNotice(error.message);});
    return()=>controller.abort();
  },[sessionResolved,settingsSession.authenticated]);

  const refreshHealth = () => {
    settingsService.health()
      .then((payload) => setHealth(payload))
      .catch(() => {
        setHealth({ ok: false, services: {} });
      });
  };

  const refreshSettings = () => {
    return settingsService.settings()
      .then((payload) => {settingsReadyRef.current=true;setSettingsState(mergeSettings(payload));setSettingsReady(true);})
      .catch(() => setSettingsMessage('Could not load NaviMuse settings.'));
  };

  const refreshSession = async ({ showLoading = false } = {}) => {
    const requestId = ++sessionRequestRef.current;
    if (showLoading) {
      setSessionResolved(false);
      setSessionLoadError('');
    }
    try {
      const payload = await settingsService.settingsSession();
      if (!sessionAliveRef.current || requestId !== sessionRequestRef.current) return false;
      await reconcileOfflineAccount(payload.authenticated?payload.queueScope:null);
      if (!sessionAliveRef.current || requestId !== sessionRequestRef.current) return false;
      onQueueScope(payload.authenticated ? payload.queueScope || null : null);
      setSettingsSession({
        adminConfigured: Boolean(payload.adminConfigured),
        authenticated: Boolean(payload.authenticated),
        authMode: payload.authMode === 'oidc' ? 'oidc' : 'password',
        loginUrl: payload.loginUrl || null,
        user: payload.user || null
      });
      setSessionLoadError('');
      return true;
    } catch {
      if (!sessionAliveRef.current || requestId !== sessionRequestRef.current) return false;
      setSessionLoadError('Could not verify this NaviMuse session. Check the server connection and try again.');
      return false;
    } finally {
      if (sessionAliveRef.current && requestId === sessionRequestRef.current) setSessionResolved(true);
    }
  };

  useEffect(() => {
    if (!accountSession && !offline) {
      refreshHealth();
      refreshSettings();
      refreshSession();
    }
  }, []);

  useLayoutEffect(() => {
    settingsRef.current = settingsState.preferences;
  }, [settingsState.preferences]);

  useEffect(() => {
    trackFeedbackLatestRef.current = trackFeedback;
    if (!trackFeedbackReadyRef.current) {
      trackFeedbackReadyRef.current = true;
      return;
    }
    if (trackFeedbackSaveTimerRef.current) window.clearTimeout(trackFeedbackSaveTimerRef.current);
    trackFeedbackSaveTimerRef.current = window.setTimeout(() => {
      trackFeedbackSaveTimerRef.current = 0;
      if (saveTrackFeedback(trackFeedbackLatestRef.current, accountStorage)) {
        trackFeedbackStorageWarningRef.current = false;
      } else if (!trackFeedbackStorageWarningRef.current) {
        trackFeedbackStorageWarningRef.current = true;
        setPlayerNotice('Track feedback could not be saved in this browser. Storage may be full or unavailable.');
      }
    }, 300);
  }, [trackFeedback]);

  useEffect(() => {
    const flushTrackFeedback = () => {
      if (trackFeedbackSaveTimerRef.current) {
        window.clearTimeout(trackFeedbackSaveTimerRef.current);
        trackFeedbackSaveTimerRef.current = 0;
      }
      saveTrackFeedback(trackFeedbackLatestRef.current, accountStorage);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushTrackFeedback();
    };
    window.addEventListener('beforeunload', flushTrackFeedback);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (trackFeedbackSaveTimerRef.current) window.clearTimeout(trackFeedbackSaveTimerRef.current);
      trackFeedbackSyncAbortRef.current?.abort();
      window.removeEventListener('beforeunload', flushTrackFeedback);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    refreshNavidrome();
    return () => homeRequestRef.current?.abort();
  }, [libraryKey, sessionResolved, settingsSession.authenticated]);

  useEffect(() => {
    const songId = nowPlaying?.id;
    if (offline || !songId) {
      setWaveformState({ songId: '', status: 'idle', values: [] });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setWaveformState({ songId, status: 'loading', values: [] });
    audiomuseWaveform(songId, { signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        const values = waveformAmplitudesFromPeaks(payload.peaks);
        setWaveformState({ songId, status: values.length ? 'ready' : 'empty', values });
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') {
          setWaveformState({ songId, status: 'unavailable', values: [] });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [nowPlaying?.id]);

  useEffect(() => {
    const attachAudioListeners = (audio) => {
      if (!audio) return () => {};

    // Each deck listener is stable. Standby events stay silent until promotion
    // changes audioRef.current atomically.
    let progressTimer = 0;
    let lastPlaybackState = { currentTime: -1, duration: -1 };
    const syncPlaybackState = (force = false) => {
      if (audioRef.current !== audio) return;
      const measuredDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const knownDuration = measuredDuration || expectedDurationRef.current || 0;
      let seekableWindow = null;
      if (audio.seekable?.length > 0) {
        try {
          const start = Number(audio.seekable.start(0));
          const end = Number(audio.seekable.end(audio.seekable.length - 1));
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            seekableWindow = { start, duration: end - start };
          }
        } catch {
          seekableWindow = null;
        }
      }
      const syncDuration = seekableWindow?.duration || knownDuration;
      const syncCurrentTime = seekableWindow
        ? clampSeekRatio(((audio.currentTime || 0) - seekableWindow.start) / seekableWindow.duration) * seekableWindow.duration
        : (audio.currentTime || 0);
      const seekState = seekTimeFromRatio(
        syncDuration > 0 ? syncCurrentTime / syncDuration : 0,
        seekableWindow ? 0 : audio.duration,
        expectedDurationRef.current,
        audio.seekable
      );
      const nextState = {
        delivery: audio.delivery || null,
        currentTime: syncCurrentTime,
        duration: syncDuration,
        canSeek: canSeekWithState(seekState, audio)
      };
      if (
        !force &&
        Math.abs(nextState.currentTime - lastPlaybackState.currentTime) < 0.2 &&
        nextState.duration === lastPlaybackState.duration &&
        nextState.canSeek === lastPlaybackState.canSeek &&
        nextState.delivery === lastPlaybackState.delivery
      ) {
        return;
      }
      lastPlaybackState = nextState;
      setPlaybackState(nextState);
    };
    const stopProgressTicker = () => {
      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = 0;
      }
    };
    const startProgressTicker = () => {
      stopProgressTicker();
      syncPlaybackState(true);
      progressTimer = window.setInterval(() => {
        if (!audio.paused && !audio.ended && audio.readyState >= 2) {
          syncPlaybackState();
        }
      }, 250);
    };
    startDeckTickerRef.current.set(audio, startProgressTicker);
    stopDeckTickerRef.current.set(audio, stopProgressTicker);
    const onEnded = () => {
      if(wiim.blocksLocal)return;
      if (audioRef.current !== audio) return;
      if (playerControlsRef.current.pauseAfterCurrent && pendingTransitionRef.current) {
        cancelTransitionRef.current();
      }
      const pendingMode = pendingTransitionRef.current?.mode;
      if (
        [TRANSITION_MODE.GAPLESS, TRANSITION_MODE.SWEET_FADE, TRANSITION_MODE.FIXED_CROSSFADE].includes(pendingMode)
        && ['starting', 'transitioning'].includes(pendingTransitionRef.current.status)
      ) {
        stopProgressTicker();
        return;
      }
      if (
        [TRANSITION_MODE.GAPLESS, TRANSITION_MODE.SWEET_FADE, TRANSITION_MODE.FIXED_CROSSFADE].includes(pendingMode)
        && executePreparedTransitionRef.current()
      ) {
        stopProgressTicker();
        return;
      }
      if (pendingTransitionRef.current) cancelTransitionRef.current();
      stopProgressTicker();
      syncPlaybackState(true);
      dispatchTransport({ type: 'ended', requestId: playRequestRef.current });
      const endedAction = endedPlaybackAction({
        skipNextEnded: shouldSuppressEndedEvent({
          guardRequestId: skipNextEndedRequestRef.current,
          playRequestId: playRequestRef.current
        }),
        repeat: playerControlsRef.current.repeat,
        audioSrc: audio.src,
        currentStreamUrl: currentStreamUrlRef.current,
        baseHref: window.location.href
      });
      if (endedAction === 'ignore') {
        skipNextEndedRequestRef.current = 0;
        return;
      }
      if (endedAction === 'source-changed') {
        skipNextEndedRequestRef.current = 0;
        dispatchTransport({ type: 'error', requestId: playRequestRef.current, message: 'Repeat stopped because the audio source changed.', recoverable: false });
        setPlayerNotice('Repeat stopped because the audio source changed.');
        return;
      }
      playbackReportRef.current.id='';
      setListeningProgress({id:playQueueRef.current.items?.[playQueueRef.current.index]?.song?.id||'',seconds:0});
      const endedQueue = playQueueRef.current;
      const endedItem = endedQueue.items?.[endedQueue.index];
      persistPlayerQueue(0);
      persistedPlaybackRef.current = {
        position: 0,
        queue: endedQueue,
        controls: playerControlsRef.current
      };
      const pauseBoundary = pauseAfterCurrentBoundary(
        playerControlsRef.current,
        { naturalEnd: true }
      );
      if (pauseBoundary.shouldPause) {
        updatePlayerControls(pauseBoundary.controls);
        const preparedNext = shouldAutoAdvanceQueue(settingsRef.current)
          && advanceQueueEventRef.current('next', { fromEnded: true, startPaused: true });
        if (!preparedNext) {
          dispatchTransport({ type: 'pause-after-current', requestId: playRequestRef.current });
          expectedDurationRef.current = 0;
        }
        if (endedItem?.atlas && endedQueue.index === endedQueue.items.length - 1) {
          completeAtlasJourneyRef.current(endedItem.queueItemId);
        }
        setPlayerNotice('Paused after the current track. Play to continue.');
        return;
      }
      if (endedAction === 'repeat') {
        const repeatSeekState = seekTimeFromRatio(0, audio.duration, expectedDurationRef.current, audio.seekable);
        if (!canSeekWithState(repeatSeekState, audio)) {
          dispatchTransport({ type: 'error', requestId: playRequestRef.current, message: 'Repeat is unavailable because this stream does not support seeking.', recoverable: false });
          setPlayerNotice('Repeat is unavailable because this stream does not support seeking.');
          return;
        }
        audio.currentTime = repeatSeekState.currentTime;
        syncPlaybackState(true);
        dispatchTransport({ type: 'request-play', requestId: playRequestRef.current });
        audio.play().catch(() => {
          dispatchTransport({ type: 'pause', requestId: playRequestRef.current, intentional: true });
          setPlayerNotice('Tap Play to repeat this track.');
        });
        return;
      }
      if (endedItem?.atlas && endedQueue.index === endedQueue.items.length - 1) completeAtlasJourneyRef.current(endedItem.queueItemId);
      if (!shouldAutoAdvanceQueue(settingsRef.current)) {
        expectedDurationRef.current = 0;
        return;
      }
      if (!advanceQueueEventRef.current('next', { fromEnded: true })) {
        // A Sonic refill can still be awaiting the API when the final queued
        // track ends. Remember this specific natural queue-end so that a
        // successful append can continue transport without treating a manual
        // pause or stop as permission to autoplay.
        const sonicState = getSonicRadioStateRef.current();
        const hasActiveSonicSession = sonicState
          && !['idle', 'stopped'].includes(sonicState.status);
        const journeyExtensionAllowed = journeyExtensionEnabled(settingsRef.current);
        // Queue authority has already advanced every committed item before this
        // block runs. This flag is only permission for a late generated append
        // to restart transport; it never controls finite queue advancement.
        const journeyMayResume = journeyExtensionAllowed
          && hasActiveSonicSession
          && sonicState.status === 'replenishing';
        resumeAfterSonicAppendRef.current = journeyMayResume
          ? Date.now()
          : 0;
        if (hasActiveSonicSession && !journeyExtensionAllowed) {
          setPlayerNotice('Journey ended. Automatic extension is off.');
        } else if (!hasActiveSonicSession) {
          setPlayerNotice('Queue finished.');
        }
        expectedDurationRef.current = 0;
      }
    };
    const onPause = () => {
      if (audioRef.current !== audio) return;
      dispatchTransport({ type: 'pause', requestId: playRequestRef.current });
      stopProgressTicker();
      syncPlaybackState(true);
    };
    const onPlay = () => {
      if (audioRef.current !== audio) return;
      dispatchTransport({ type: 'request-play', requestId: playRequestRef.current });
    };
    const restorePersistedPosition = () => {
      const restorePosition = pendingRestorePositionRef.current;
      if (restorePosition <= 0) return;
      const knownDuration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : expectedDurationRef.current;
      const restoreState = seekTimeFromRatio(
        knownDuration > 0 ? restorePosition / knownDuration : 0,
        audio.duration,
        expectedDurationRef.current,
        audio.seekable
      );
      if (!canSeekWithState(restoreState, audio)) return;
      audio.currentTime = restoreState.currentTime;
      pendingRestorePositionRef.current = 0;
    };
    const onLoadedMetadata = () => {
      if (audioRef.current !== audio) return;
      if (skipNextEndedRequestRef.current === playRequestRef.current) {
        skipNextEndedRequestRef.current = 0;
      }
      if (skipNextEndedTimerRef.current) {
        window.clearTimeout(skipNextEndedTimerRef.current);
        skipNextEndedTimerRef.current = 0;
      }
      restorePersistedPosition();
      syncPlaybackState(true);
      dispatchTransport({ type: 'ready', requestId: playRequestRef.current });
    };
    const onPlaying = () => {
      if (audioRef.current !== audio) return;
      if (skipNextEndedRequestRef.current === playRequestRef.current) {
        skipNextEndedRequestRef.current = 0;
      }
      if (skipNextEndedTimerRef.current) {
        window.clearTimeout(skipNextEndedTimerRef.current);
        skipNextEndedTimerRef.current = 0;
      }
      restorePersistedPosition();
      dispatchTransport({ type: 'playing', requestId: playRequestRef.current });
      setPlaybackMessage('');
      startProgressTicker();
    };
    const onWaiting = () => {
      if (audioRef.current === audio) {
        dispatchTransport({ type: 'waiting', requestId: playRequestRef.current });
        stopProgressTicker();
      }
    };
    const onSeeked = () => {
      if (audioRef.current === audio) syncPlaybackState(true);
    };
    const onError = () => {
      if (audioRef.current !== audio) {
        if (pendingTransitionRef.current?.audio === audio) cancelTransitionRef.current();
        return;
      }
      skipNextEndedRequestRef.current = 0;
      if (skipNextEndedTimerRef.current) {
        window.clearTimeout(skipNextEndedTimerRef.current);
        skipNextEndedTimerRef.current = 0;
      }
      const message = audio.error?.mediaServicesReset ? 'iPhone audio restarted. Tap Play to resume.' : 'This track could not be loaded. Check your connection and try again.';
      dispatchTransport({ type: 'error', requestId: playRequestRef.current, message });
      stopProgressTicker();
      syncPlaybackState(true);
      setPlaybackMessage(message);
      if (audio.error?.mediaServicesReset) return;
      // Media elements do not expose an HTTP status. Check the public session
      // endpoint before treating a stream failure as an expired session.
      if (accountSession) { void onAccountRefresh(); return; }
      settingsService.settingsSession()
        .then((session) => {
          if (sessionNeedsUnlock(session)) {
            window.dispatchEvent(new CustomEvent('navimuse:session-required'));
          }
        })
        .catch(() => null);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', onWaiting);
    // Native progress remains authoritative even when waiting or foreground
    // restoration has stopped the fallback ticker without a new playing event.
    audio.addEventListener('timeupdate', onSeeked);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('streamdetails', onSeeked);
    audio.addEventListener('loadstart', onSeeked);
    audio.addEventListener('error', onError);

    return () => {
      startDeckTickerRef.current.delete(audio);
      stopDeckTickerRef.current.delete(audio);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('timeupdate', onSeeked);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('streamdetails', onSeeked);
      audio.removeEventListener('loadstart', onSeeked);
      audio.removeEventListener('error', onError);
      stopProgressTicker();
      if (skipNextEndedTimerRef.current) {
        window.clearTimeout(skipNextEndedTimerRef.current);
        skipNextEndedTimerRef.current = 0;
      }
    };
    };
    const detachListeners = audioDeckNodes.map((audio) => attachAudioListeners(audio));
    return () => detachListeners.forEach((detach) => detach());
  }, [audioDeckNodes, dispatchTransport]);

  const openPlayer = () => {
    if (!nowPlaying) {
      setPlaybackMessage('Choose an album or track to start playing.');
      return;
    }
    document.querySelector('.phone-frame')?.scrollTo({ top: 0, left: 0 });
    setPlayerOpen(true);
  };

  const notifyUnavailable = (label) => {
    const message = `${label} is not available in this browser yet.`;
    setPlaybackMessage(message);
    setPlayerNotice(message);
  };

  const openPlaylistPicker = async (fallbackOpener) => {
    if(offline){setPlayerNotice('Reconnect to add songs to a server playlist.');return;}
    if (!nowPlaying?.id) {
      setPlayerNotice('This track cannot be added to a playlist.');
      return;
    }
    playlistPickerOpenerRef.current = fallbackOpener || document.activeElement;
    playlistPickerLoadRef.current?.abort();
    const controller = new AbortController();
    playlistPickerLoadRef.current = controller;
    setPlaylistPicker({ open: true, loading: true, busy: false, error: '', items: [] });
    try {
      const items = await fetchPlaylists(protectedApiFetch, controller.signal);
      if (controller.signal.aborted) return;
      setPlaylistPicker({ open: true, loading: false, busy: false, error: '', items });
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') return;
      setPlaylistPicker({ open: true, loading: false, busy: false, error: error.message, items: [] });
    } finally {
      if (playlistPickerLoadRef.current === controller) playlistPickerLoadRef.current = null;
    }
  };

  const closePlaylistPicker = () => {
    if (playlistPickerBusyRef.current) return;
    playlistPickerLoadRef.current?.abort();
    playlistPickerLoadRef.current = null;
    setPlaylistPicker((current) => ({ ...current, open: false, error: '' }));
    window.requestAnimationFrame(() => playlistPickerOpenerRef.current?.isConnected && playlistPickerOpenerRef.current.focus());
  };

  const addCurrentTrackToPlaylist = async (playlist) => {
    if (!nowPlaying?.id || !playlist?.id || playlistPickerBusyRef.current) return;
    playlistPickerBusyRef.current = true;
    setPlaylistPicker((current) => ({ ...current, busy: true, error: '' }));
    try {
      await updatePlaylist(protectedApiFetch, playlist.id, { addSongIdsIfMissing: [nowPlaying.id] });
      setPlaylistRevision((current) => current + 1);
      setPlayerNotice(`Added “${nowPlaying.title}” to “${playlist.name || 'playlist'}”.`);
      setPlaylistPicker((current) => ({ ...current, open: false }));
    } catch (error) {
      setPlaylistPicker((current) => ({ ...current, error: error.message }));
    } finally {
      playlistPickerBusyRef.current = false;
      setPlaylistPicker((current) => ({ ...current, busy: false }));
    }
  };

  const createPlaylistWithCurrentTrack = async (name) => {
    const trimmedName = name.trim();
    if (!trimmedName || !nowPlaying?.id || playlistPickerBusyRef.current) return;
    playlistPickerBusyRef.current = true;
    setPlaylistPicker((current) => ({ ...current, busy: true, error: '' }));
    try {
      await createPlaylist(protectedApiFetch, { name: trimmedName, songIds: [nowPlaying.id] });
      setPlaylistRevision((current) => current + 1);
      setPlayerNotice(`Created “${trimmedName}” with “${nowPlaying.title}”.`);
      setPlaylistPicker((current) => ({ ...current, open: false }));
    } catch (error) {
      setPlaylistPicker((current) => ({ ...current, error: error.message }));
    } finally {
      playlistPickerBusyRef.current = false;
      setPlaylistPicker((current) => ({ ...current, busy: false }));
    }
  };

  const closePlayer = () => {
    setPlayerOpen(false);
    updatePlayerControls({ panel: '' });
  };

  const openQueue = (event) => {
    if (!nowPlaying) return;
    setQueueEntry(queueEntryRef, event?.currentTarget || document.activeElement, !playerOpen);
    updatePlayerControls({ panel: 'queue' });
    setPlayerOpen(true);
  };

  const changeVolume = (event) => {
    if(wiim.blocksLocal){if(wiim.state.session)void wiim.command('volume',{volume:Math.round(Number(event.target.value)*100)});return;}
    const nextVolume = Math.max(0, Math.min(1, Number(event.target.value)));
    setVolume(nextVolume);
    saveVolume(nextVolume, accountStorage);
  };

  // Settle both decks to their resting levels outside a transition:
  //   active deck audible, standby silent. In the Web Audio path the master
  //   gain carries the app volume, so the active deckGain rests at 1 and the
  //   slider maps to masterGain; in the no-Web-Audio fallback the active
  //   deckGain carries the volume directly. During an active crossfade the
  //   ramp owns both deck gains and master-gain scaling already makes a live
  //   volume change proportional, so we leave the ramp alone.
  const settleDeckGains = useCallback(() => {
    const useGain = isWebAudioActive();
    if (useGain) setMasterVolume(transitionVolumeRef.current);
    for (const deckRef of audioDeckRefs) {
      const deck = deckRef.current;
      if (!deck) continue;
      setDeckGain(deck, deck === audioRef.current ? (useGain ? 1 : transitionVolumeRef.current) : 0);
    }
  }, [audioDeckRefs, isWebAudioActive, setDeckGain, setMasterVolume]);

  useEffect(() => {
    transitionVolumeRef.current = volume;
    // Keep the master gain live during a crossfade so the volume slider keeps
    // working mid-fade (master-gain scaling multiplies the whole ramp). Only
    // re-settle the per-deck resting gains when NOT transitioning, so we avoid
    // fighting the active crossfade's scheduled deck-gain automation.
    if (isWebAudioActive()) setMasterVolume(volume);
    if (pendingTransitionRef.current?.status !== 'transitioning') {
      settleDeckGains();
    }
  }, [isWebAudioActive, setMasterVolume, settleDeckGains, volume]);

  // Finalize an in-flight sweet-fade: stop the ramp, silence and unload the
  // outgoing deck, and settle the incoming deck to its resting level. Fires
  // once; used by the crossfade completion path, the outgoing `ended` handler,
  // and cancellation. `promoted` is `{ incoming, outgoing }`.
  const finalizeSweetFade = useCallback((promoted) => {
    const pending = pendingTransitionRef.current;
    if (pending?.decision) {
      setTransitionDiagnostic(transitionEventForDecision(pending.decision, TRANSITION_EVENT.COMPLETED));
    }
    if (transitionFadeCleanupRef.current) {
      transitionFadeCleanupRef.current();
      transitionFadeCleanupRef.current = null;
    }
    if (transitionRampTimerRef.current) {
      window.clearInterval(transitionRampTimerRef.current);
      transitionRampTimerRef.current = 0;
    }
    if (transitionRampCancelRef.current) {
      transitionRampCancelRef.current.cancel();
      transitionRampCancelRef.current = null;
    }
    if (promoted?.outgoing) {
      promoted.outgoing.pause();
      promoted.outgoing.removeAttribute('src');
      promoted.outgoing.load();
      setDeckGain(promoted.outgoing, 0);
    }
    if (promoted?.incoming) {
      setDeckGain(promoted.incoming, isWebAudioActive() ? 1 : transitionVolumeRef.current);
    }
    pendingTransitionRef.current = null;
  }, [isWebAudioActive, setDeckGain]);

  const playTrack = useCallback((song, album = null, queueOptions = {}) => {
    if(wiim.blocksLocal){
      if(!wiim.state.session||queueOptions.fromEnded||queueOptions.preparedTransition){const message=wiim.state.error||'Checking playback output. Use Play on to reconnect.';setPlayerNotice(message);setPlaybackMessage(message);if(!queueOptions.fromEnded&&!queueOptions.preparedTransition)setOutputOpen(true);return;}
      try{const items=queueOptions.queueItems||queueOptions.queueSongs?.filter(s=>s.id).map(s=>queueItem(s,albumFromSong(s)))||[queueItem(song,album)];
        const index=resolveQueueIndex(items,song?.id,queueOptions.queueIndex);
        void wiim.command('replace',{queue:remoteQueue({items,index:index<0?0:index,instanceId:queueOptions.queueInstanceId,source:queueOptions.queueSource})});
      }catch(error){setPlayerNotice(error.message);}return;
    }
    if (queueOptions.intentId !== undefined && queueOptions.intentId !== playbackIntentRef.current) return;
    if (!song?.id) {
      setPlaybackMessage('That item has no playable track.');
      return;
    }

    if (!queueOptions.fromEnded && !queueOptions.preparedTransition) {
      playbackIntentRef.current += 1;
      albumRequestRef.current?.abort();
    }

    cancelPendingSonicResume(resumeAfterSonicAppendRef);
    if (!queueOptions.preparedTransition) cancelTransitionRef.current();

    // settingsRef is synchronized in a layout effect so playback uses fresh settings without
    // rebuilding the event-callback chain for every preference update.
    const preferences = settingsRef.current || defaultAppSettings;
    const startPaused = queueOptions.startPaused === true;
    const nextTrack = normalizeSong(song, album, activeLibrary?.name, preferences.library?.artworkSize, preferences.streaming);
    const expectedDuration = Number(song.duration || 0);
    // Navidrome queue entries should always have ids; invalid discovery/search rows are omitted because they cannot stream.
    const candidateQueueItems = queueOptions.queueItems || queueOptions.queueSongs
      ?.filter((queueSong) => queueSong?.id)
      .map((queueSong) => queueItem(queueSong, albumFromSong(queueSong))) || [queueItem(song, album)];
    const resolvedQueueIndex = resolveQueueIndex(candidateQueueItems, song.id, queueOptions.queueIndex);
    const queueItems = resolvedQueueIndex >= 0 ? candidateQueueItems : [queueItem(song, album)];
    const reusingCurrentQueue = queueItems === playQueueRef.current?.items;
    const queueInstanceId = queueOptions.queueInstanceId || (reusingCurrentQueue ? playQueueRef.current?.instanceId : undefined);
    const queueSource = queueOptions.queueSource || (reusingCurrentQueue ? playQueueRef.current?.source : undefined);
    const queueIndex = resolvedQueueIndex >= 0 ? resolvedQueueIndex : 0;
    setPlaybackMessage('');
    setPlayerNotice('');
    replaceQueue({ ...(queueInstanceId ? { instanceId: queueInstanceId } : {}), ...(queueSource ? { source: queueSource } : {}), items: queueItems, index: queueIndex }, { preserveHistory: queueOptions.preserveHistory === true, preserveAtlasTransaction: Boolean(queueInstanceId), queueAdvanced: queueOptions.queueAdvanced === true });
    // Automatic advancement preserves the listener's queue or lyrics workspace.
    if (!queueOptions.fromEnded && !queueOptions.preparedTransition) updatePlayerControls({ panel: '' });
    expectedDurationRef.current = expectedDuration;
    pendingRestorePositionRef.current = queueOptions.preparedTransition ? 0 : Number(queueOptions.startPosition)||0;
    setPlaybackState({ currentTime: Number(queueOptions.startPosition)||0, duration: expectedDuration, canSeek: false });
    playbackReportRef.current.id='';
    setListeningProgress({id:nextTrack.id,seconds:0});
    setNowPlaying(nextTrack);
    if (shouldOpenFullPlayerOnPlay(preferences.playback, queueOptions) && !window.matchMedia('(min-width: 900px)').matches) {
      setPlayerOpen(true);
    }

    const playRequestId = playRequestRef.current + 1;
    const nextStreamPath = song.streamUrl || streamUrl(song.id, preferences.streaming);
    playRequestRef.current = playRequestId;
    dispatchTransport({ type: 'load', requestId: playRequestId });
    skipNextEndedRequestRef.current = queueOptions.preparedTransition ? 0 : playRequestId;
    if (skipNextEndedTimerRef.current) window.clearTimeout(skipNextEndedTimerRef.current);
    if (!queueOptions.preparedTransition) {
      // Safety net only: normal paths clear this on metadata, playing, or error; slow mobile streams can take longer.
      skipNextEndedTimerRef.current = window.setTimeout(() => {
        if (skipNextEndedRequestRef.current === playRequestId) {
          skipNextEndedRequestRef.current = 0;
        }
        skipNextEndedTimerRef.current = 0;
      }, 120000);
    }
    window.setTimeout(() => {
      if (wiim.blocksLocal || playRequestRef.current !== playRequestId) return;
      const audio = audioRef.current;
      if (!audio) return;
      currentStreamUrlRef.current = new URL(nextStreamPath, window.location.href).href;
      if (queueOptions.preparedTransition) return;
      audio.albumSource=albumRun({items:queueItems,index:queueIndex},{...playerControlsRef.current,continueThroughQueue:preferences.playback.continueThroughQueue},preferences.playback.gaplessAlbums).length?song:null;
      audio.src = nextStreamPath;
      audio.load();
      wakeAudioContext();
      // Apply the resting deck gains before playback so the Web Audio graph's
      // master gain reflects the saved volume (the graph is created lazily at
      // deck bind, which can happen after the first volume effect runs).
      settleDeckGains();
      if (startPaused) {
        dispatchTransport({ type: 'pause-after-current', requestId: playRequestId });
        return;
      }
      audio.play().catch((error) => {
        if (error?.name === 'AbortError') return;
        dispatchTransport({ type: 'pause', requestId: playRequestId, intentional: true });
        setPlaybackMessage(nativeAudioTransport() ? 'Playback could not start. Check your connection and try again.' : 'Tap Play again if the browser blocked autoplay.');
      });
    }, 0);
  }, [activeLibrary?.name, dispatchTransport, replaceQueue, settleDeckGains, updatePlayerControls]);

  useEffect(() => {
    if (wiim.blocksLocal || !hasRestoredQueue || nowPlaying) return;
    const item = playQueue.items?.[playQueue.index];
    if (!item?.song?.id) return;
    const preferences = settingsRef.current || defaultAppSettings;
    const nextTrack = normalizeSong(item.song, item.album, activeLibrary?.name, preferences.library?.artworkSize, preferences.streaming);
    const expectedDuration = Number(item.song.duration || 0);
    const nextStreamPath = item.song.streamUrl || streamUrl(item.song.id, preferences.streaming);
    const restoreRequestId = playRequestRef.current + 1;
    playRequestRef.current = restoreRequestId;
    dispatchTransport({ type: 'restore', requestId: restoreRequestId });
    expectedDurationRef.current = expectedDuration;
    pendingRestorePositionRef.current = restoredPosition;
    setPlaybackState({ currentTime: restoredPosition, duration: expectedDuration, canSeek: false });
    playbackReportRef.current.id='';
    setListeningProgress({id:nextTrack.id,seconds:0});
    setNowPlaying(nextTrack);
    setPlaybackMessage('');
    const audio = audioRef.current;
    if (!audio) return;
    currentStreamUrlRef.current = new URL(nextStreamPath, window.location.href).href;
    const restore=position=>{
      if(playRequestRef.current!==restoreRequestId)return;
      if(Number.isFinite(position)&&position>=0){pendingRestorePositionRef.current=position;setPlaybackState({currentTime:position,duration:expectedDuration,canSeek:false});}
      audio.resumePosition=Number.isFinite(position)&&position>=0?position:restoredPosition;
      audio.src=nextStreamPath;audio.load();
    };
    const native=nativeAudioTransport();
    if(native){
      const resume=()=>native.request({action:'resumePosition',url:currentStreamUrlRef.current}).then(restore,()=>restore(null));
      if(native.albumQueue)native.request({action:'album.resume',url:currentStreamUrlRef.current}).then(saved=>{
        if(playRequestRef.current!==restoreRequestId)return;
        const receipt=saved?.receipt,sequence=receipt?.sequence;
        const index=Array.isArray(sequence)?albumHandoffIndex(playQueueRef.current,{token:receipt.token,items:sequence.map(queueItemId=>({queueItemId}))},receipt):-1;
        if(index>=0){const current=playQueueRef.current,target=current.items[index];playTrackEvent(target.song,target.album,{queueItems:current.items,queueIndex:index,preserveHistory:true,startPaused:true,startPosition:saved.position});persistPlayerQueue(saved.position);}
        else resume();
      },resume);
      else resume();
    }
    else restore(null);

  }, [activeLibrary?.name, dispatchTransport, hasRestoredQueue, nowPlaying, playQueue, restoredPosition, wiimState.checked, remoteSession]);

  const queueRepairAttemptedRef = useRef(false);
  useEffect(() => {
    if (offline || wiim.blocksLocal || !sessionResolved || !settingsSession.authenticated || !hasRestoredQueue || restoredAtlasJourney || queueRepairAttemptedRef.current) return;
    // The initial restored queue has revision zero. A user's selection or edit
    // supersedes repair even if the requested metadata has not returned yet.
    if (queueRevisionRef.current !== 0 || transportRef.current.status === 'playing') return;
    const revision = queueRevisionRef.current;
    const controlsAtStart = playerControlsRef.current;
    const requestId = playRequestRef.current;
    const controller = new AbortController();
    queueRepairAttemptedRef.current = true;
    repairRestoredQueue(restorationSnapshot(), navidromeSong, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted || playRequestRef.current !== requestId || transportRef.current.status === 'playing') return;
      if (!result.removedCount || !commitRestorationRepair(result.state, revision, controlsAtStart)) return;
      if (result.currentChanged) {
        const audio = audioRef.current;
        if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
        setNowPlaying(null);
        setPlaybackState({ currentTime: 0, duration: 0, canSeek: false });
      }
      setPlayerNotice(`${result.removedCount} missing ${result.removedCount === 1 ? 'track was' : 'tracks were'} removed from the restored queue.`);
    }).catch(() => {
      if (!controller.signal.aborted && playRequestRef.current === requestId) setPlayerNotice('Queue kept as saved. Track availability could not be checked.');
    });
    return () => { controller.abort(); queueRepairAttemptedRef.current = false; };
  }, [sessionResolved, settingsSession.authenticated, hasRestoredQueue, restoredAtlasJourney, restorationSnapshot, commitRestorationRepair, wiimState.checked]);

  const playTrackEvent = useEventCallback(playTrack);

  const replaceSonicQueue = useCallback((items, index = 0) => {
    resumeAfterSonicAppendRef.current = 0;
    replaceQueue({
      items,
      index,
      source: createQueueSourceDescriptor({ kind: 'radio', label: items[0]?.radioSeed?.seedLabel || 'Sonic Radio' })
    });
  }, [replaceQueue]);

  const appendSonicQueue = useCallback((items) => {
    const current = playQueueRef.current;
    const nextItems = [...(current.items || []), ...items];
    const nextQueue = reconcileGeneratedBoundary({ ...current, items: nextItems });
    replaceQueue(nextQueue, { preserveHistory: true });
    const shouldResume = consumePendingSonicResume(resumeAfterSonicAppendRef);
    if (!shouldResume || !items[0]?.song) return;
    playTrackEvent(items[0].song, items[0].album, {
      queueItems: nextItems,
      queueIndex: current.items?.length || 0,
      queueSource: current.source,
      preserveHistory: true,
      fromEnded: true
    });
  }, [playQueueRef, playTrackEvent, replaceQueue]);

  const playSonicQueueItem = useCallback((item) => {
    resumeAfterSonicAppendRef.current = 0;
    const current = playQueueRef.current;
    const itemIndex = queueIndexForSong(current, item?.song?.id);
    playTrackEvent(item?.song, item?.album, {
      queueItems: current.items,
      queueIndex: itemIndex,
      preserveHistory: true
    });
  }, [playQueueRef, playTrackEvent]);

  const fetchSimilarTracks = useCallback(
    (seedId, count, options) => fetchSonicSimilarTracks(protectedApiFetch, seedId, count, options),
    []
  );
  const searchRadioFallback = useCallback(
    (query) => searchSonicFallback(protectedApiFetch, query),
    []
  );
  const loadArtistSongs = useCallback(
    (artistId) => fetchArtistSongs(protectedApiFetch, artistId),
    []
  );
  const loadGenreSongs = useCallback(
    (genre) => fetchGenreSongs(protectedApiFetch, genre),
    []
  );
  const getQueueSnapshot = useCallback(() => playQueueRef.current, [playQueueRef]);
  const saveRadioPlaylist = useCallback(
    (name, songIds) => saveSonicRadioPlaylist(protectedApiFetch, name, songIds),
    []
  );
  const {
    radioState,
    radioNotice,
    startTrackJourney: localStartTrackJourney,
    startArtistJourney: localStartArtistJourney,
    startGenreJourney: localStartGenreJourney,
    startArtistDj: localStartArtistDj,
    stopRadio: stopSonicController,
    saveAsPlaylist: saveSonicRadio,
    dismissSavePrompt: dismissSonicRadio,
    onTrackPlayed: markSonicTrackPlayed,
    getRadioState: getSonicRadioState,
    restoreQueueSession: restoreSonicQueueSession,
    isRadioActive
  } = useSonicRadio({
    playbackSource:`${nowPlaying?.id||''}:${playbackIntentRef.current}:${remoteSession?.id||''}`,
    getPlaybackContext:()=>`${playbackIntentRef.current}:${remoteAuthorityRef.current?.blocksLocal?'remote':'local'}`,
    replaceQueue: replaceSonicQueue,
    appendToQueue: appendSonicQueue,
    playTrack: playSonicQueueItem,
    getQueueSnapshot,
    fetchSimilarTracks,
    fetchArtistSongs: loadArtistSongs,
    artistOpenerHistory: artistOpenerHistoryRef.current,
    fetchGenreSongs: loadGenreSongs,
    searchNavidrome: searchRadioFallback,
    saveAsPlaylistFn: saveRadioPlaylist,
    shouldAutoExtend: () => !offline && !wiim.blocksLocal && journeyExtensionEnabled(settingsRef.current)
  });
  const ordinaryAutoplayRef=useRef(null);
  if(!ordinaryAutoplayRef.current)ordinaryAutoplayRef.current=createOrdinaryAutoplay({
    snapshot:()=>({queue:playQueueRef.current,controls:{...playerControlsRef.current,...settingsRef.current.playback},pool:shufflePoolRef.current,
      active:settingsReadyRef.current && !remoteAuthorityRef.current?.blocksLocal && transportRef.current.status==='playing' && !offline}),
    fetchSimilar:fetchSimilarTracks,
    append:items=>{
      const queue=playQueueRef.current;
      // Retain recent sequential history without growing the persisted queue forever.
      const trim=playerControlsRef.current.shuffle?0:Math.max(0,queue.index-50);
      const retained=queue.items.slice(trim);
      if(retained.length+items.length>1000){setPlayerNotice('Clear played tracks to make room for more similar music.');return;}
      replaceQueue(reconcileGeneratedBoundary({...queue,items:[...retained,...items],index:queue.index-trim}),{preserveHistory:true});
    },onNotice:setPlayerNotice,
    clearNotice:message=>setPlayerNotice(current=>current===message?'':current)
  });
  useEffect(()=>{
    void ordinaryAutoplayRef.current.refresh();
    const timer=window.setInterval(()=>void ordinaryAutoplayRef.current.refresh(),15000);
    return()=>window.clearInterval(timer);
  },[playQueue,localIsPlaying,playerControls,settingsState.preferences.playback,wiimState.session?.id,wiimState.busy,offline]);
  useEffect(()=>()=>ordinaryAutoplayRef.current.cancel(),[]);
  useEffect(()=>{
    if(!settingsReady || wiim.blocksLocal || ordinaryAutoplayEnabled(playQueueRef.current,{...playerControlsRef.current,...settingsState.preferences.playback}))return;
    const queue=playQueueRef.current;
    const next=removeUpcomingAutoplay(queue,playerControlsRef.current,shufflePoolRef.current);
    if(next!==queue)replaceQueue(reconcileGeneratedBoundary(next),{preserveHistory:true});
  },[settingsReady,settingsState.preferences.playback,playerControls,wiimState.session?.id,wiimState.checked]);
  const remotePreferenceAttemptRef=useRef('');
  useEffect(()=>{
    const session=wiim.state.session,preferences=settingsState.preferences.playback;
    if(!settingsReady||!session||wiim.state.busy||offline)return;
    const key=`${session.id}:${preferences.autoplayAfterQueue}:${preferences.continueThroughQueue}`;
    if(remotePreferenceAttemptRef.current===key)return;
    remotePreferenceAttemptRef.current=key;
    if(Boolean(session.controls?.autoplayAfterQueue)!==preferences.autoplayAfterQueue || (session.controls?.continueThroughQueue!==false)!==preferences.continueThroughQueue)
      void wiim.command('controls',{controls:{autoplayAfterQueue:preferences.autoplayAfterQueue,continueThroughQueue:preferences.continueThroughQueue}});
  },[settingsReady,wiimState.session?.id,wiimState.busy,settingsState.preferences.playback,offline]);
  const remoteJourneyRef=useRef(null);
  if(!remoteJourneyRef.current)remoteJourneyRef.current=createRemoteJourneyStarter({
    getOutput:()=>remoteAuthorityRef.current,
    discovery:{artistOpenerHistory:artistOpenerHistoryRef.current,fetchSimilarTracks,fetchArtistSongs:loadArtistSongs,fetchGenreSongs:loadGenreSongs,searchNavidrome:searchRadioFallback},
    onNotice:setPlayerNotice
  });
  useEffect(()=>()=>remoteJourneyRef.current?.cancel(),[wiim,offline]);
  const startOnOutput=(kind,local)=>(value,label)=>{
    if(offline){setPlayerNotice('Reconnect to start a Journey.');return;}
    if(wiim.state.session)return remoteJourneyRef.current.start(kind,value,label,journeyExtensionEnabled(settingsRef.current));
    remoteJourneyRef.current.cancel();
    if(wiim.blocksLocal){setPlayerNotice('Confirm the playback output before starting a Journey.');return;}
    return local(value,label);
  };
  const startTrackJourney=startOnOutput('track',localStartTrackJourney);
  const startArtistJourney=startOnOutput('artist',localStartArtistJourney);
  const startGenreJourney=startOnOutput('genre',localStartGenreJourney);
  const startArtistDj=startOnOutput('artist-dj',localStartArtistDj);
  freezeJourneyForOutputRef.current=dismissSonicRadio;
  getSonicRadioStateRef.current = getSonicRadioState;
  useEffect(() => {
    if(hasRestoredQueue && !offline && !remoteSession) restoreSonicQueueSession(playQueueRef.current);
  },[hasRestoredQueue,offline,remoteSession?.id,restoreSonicQueueSession]);

  const cancelPreparedTransition = useCallback(({
    diagnosticType = TRANSITION_EVENT.CANCELLED,
    reasonCode = ''
  } = {}) => {
    if (transitionFadeCleanupRef.current) {
      transitionFadeCleanupRef.current();
      transitionFadeCleanupRef.current = null;
    }
    if (transitionRampTimerRef.current) {
      window.clearInterval(transitionRampTimerRef.current);
      transitionRampTimerRef.current = 0;
    }
    if (transitionRampCancelRef.current) {
      transitionRampCancelRef.current.cancel();
      transitionRampCancelRef.current = null;
    }
    const pending = pendingTransitionRef.current;
    if (pending?.decision && diagnosticType) {
      setTransitionDiagnostic(transitionEventForDecision(pending.decision, diagnosticType, { reasonCode }));
    }
    pendingTransitionRef.current = null;
    for (const deckRef of audioDeckRefs) {
      const deck = deckRef.current;
      if (deck && deck !== audioRef.current) {
        // Cancellation is also checked on each progress tick. An empty,
        // paused standby has nothing left to release; loading it repeatedly
        // needlessly restarts the native media resource-selection algorithm.
        if (deck.hasAttribute('src') || deck.srcObject || !deck.paused) {
          deck.pause();
          deck.removeAttribute('src');
          if (deck.srcObject) deck.srcObject = null;
          deck.load();
        }
        setDeckGain(deck, 0);
      }
    }
    settleDeckGains();
  }, [audioDeckRefs, setDeckGain, settleDeckGains]);

  useLayoutEffect(() => {
    cancelTransitionRef.current = cancelPreparedTransition;
  }, [cancelPreparedTransition]);

  // Ensure a Sweet Fade ramp timer is torn down when App unmounts mid-fade;
  // otherwise the 50ms interval keeps firing against detached audio elements.
  useEffect(() => () => {
    cancelTransitionRef.current({ diagnosticType: '' });
    playbackIntentRef.current += 1;
    albumRequestRef.current?.abort();
  }, []);

  const executePreparedTransition = useCallback(() => {
    const pending = pendingTransitionRef.current;
    const outgoing = audioRef.current;
    if (!pending || pending.status !== 'preloading' || !outgoing) return false;
    if (pending.queueRevision !== queueRevisionRef.current) {
      cancelPreparedTransition();
      return false;
    }
    if (playerControlsRef.current.pauseAfterCurrent || !shouldAutoAdvanceQueue(settingsRef.current)) {
      cancelPreparedTransition();
      return false;
    }
    if (!canUsePreparedDeck({
      expectedUrl: pending.expectedUrl,
      actualUrl: pending.audio.currentSrc || pending.audio.src,
      readyState: pending.audio.readyState,
      error: pending.audio.error,
      baseHref: window.location.href
    })) return false;
    pending.status = 'starting';
    pending.event = transitionEventForDecision(pending.decision, TRANSITION_EVENT.STARTED);
    setTransitionDiagnostic(pending.event);

    if (pending.mode === TRANSITION_MODE.GAPLESS) {
      // Gapless boundary: swap decks and unload the outgoing. Kept on the
      // incoming `play()` promise because there is no fade to preserve.
      pending.audio.play().then(() => {
        if (pendingTransitionRef.current !== pending || outgoing !== audioRef.current) return;
        if (pending.queueRevision !== queueRevisionRef.current || playerControlsRef.current.pauseAfterCurrent
          || !shouldAutoAdvanceQueue(settingsRef.current) || !commitQueueAdvance(pending.advance)?.item) {
          cancelPreparedTransition();
          return;
        }
        pending.status = 'transitioning';
        const promoted = promoteStandbyAudio();
        stopDeckTickerRef.current.get(promoted.outgoing)?.();
        startDeckTickerRef.current.get(promoted.incoming)?.();
        playTrackEvent(pending.nextItem.song, pending.nextItem.album, {
          queueItems: pending.queueItems,
          queueIndex: pending.nextIndex,
          preserveHistory: true,
          fromEnded: true,
          preparedTransition: true,
          queueAdvanced: true
        });
        dispatchTransport({ type: 'playing', requestId: playRequestRef.current });
        setDeckGain(promoted.incoming, isWebAudioActive() ? 1 : transitionVolumeRef.current);
        setDeckGain(promoted.outgoing, 0);
        promoted.outgoing.pause();
        promoted.outgoing.removeAttribute('src');
        promoted.outgoing.load();
        setTransitionDiagnostic(transitionEventForDecision(pending.decision, TRANSITION_EVENT.COMPLETED));
        pendingTransitionRef.current = null;
      }).catch(() => {
        if (pendingTransitionRef.current !== pending) return;
        const wasGaplessBoundary = pending.mode === TRANSITION_MODE.GAPLESS && outgoing.ended;
        cancelPreparedTransition({
          diagnosticType: TRANSITION_EVENT.DEGRADED,
          reasonCode: 'prepared-play-failed'
        });
        if (wasGaplessBoundary) advanceQueueEventRef.current('next', { fromEnded: true });
      });
      return true;
    }

    // SWEET_FADE: drive the crossfade immediately. The incoming deck was
    // pre-heated (already loading/playing silently at gain 0 during preload),
    // so we do NOT gate the ramp on `incoming.play()` resolving — Safari's
    // first-play latency (200-800ms+) would otherwise eat the whole fade
    // window and end in a hard cut.
    if (!commitQueueAdvance(pending.advance)?.item) {
      cancelPreparedTransition();
      return false;
    }
    pending.status = 'transitioning';
    const promoted = promoteStandbyAudio();
    stopDeckTickerRef.current.get(promoted.outgoing)?.();
    startDeckTickerRef.current.get(promoted.incoming)?.();
    playTrackEvent(pending.nextItem.song, pending.nextItem.album, {
      queueItems: pending.queueItems,
      queueIndex: pending.nextIndex,
      preserveHistory: true,
      fromEnded: true,
      preparedTransition: true,
      queueAdvanced: true
    });
    dispatchTransport({ type: 'playing', requestId: playRequestRef.current });

    // Ensure the incoming is actually playing (pre-heat may not have started
    // it) and wake the AudioContext from this media action.
    wakeAudioContext();
    promoted.incoming.play().catch(() => dispatchTransport({ type: 'error', requestId: playRequestRef.current, message: 'The prepared transition could not continue.' }));

    const fadeSeconds = effectiveSweetFadeSeconds({
      currentTime: outgoing.currentTime,
      duration: outgoing.duration || playbackState.duration,
      fadeSeconds: pending.requestedFade
    });

    // F5 fix: never hard-swap. If there is no room for the requested fade,
    // fall back to a short crossfade so the outgoing still ducks smoothly.
    const rampSeconds = fadeSeconds > 0 ? fadeSeconds : SWEET_FADE_MICRO_SECONDS;
    scheduleSweetFade(promoted, rampSeconds);
    return true;
  }, [cancelPreparedTransition, commitQueueAdvance, dispatchTransport, isWebAudioActive, playbackState.duration, playTrackEvent, promoteStandbyAudio, queueRevisionRef, setDeckGain]);

  // Schedule an equal-power crossfade between the promoted decks over
  // `fadeSeconds` on the audio clock (no 50ms timer — no timer-vs-audio
  // drift). Finalizes on whichever comes first: the curve end (wall clock),
  // or the outgoing deck firing `ended` / `pause`. A one-shot finalizer on the
  // outgoing element covers the case where the outgoing ends early inside the
  // fade; it only runs the ramp finalize (pause outgoing, settle gains, clear
  // pending) and never advances the queue, so it is safe alongside the
  // load-bearing `onEnded` guard.
  const scheduleSweetFade = useCallback((promoted, fadeSeconds) => {
    if (transitionRampCancelRef.current) {
      transitionRampCancelRef.current.cancel();
      transitionRampCancelRef.current = null;
    }
    if (transitionRampTimerRef.current) {
      window.clearInterval(transitionRampTimerRef.current);
      transitionRampTimerRef.current = 0;
    }
    if (transitionFadeCleanupRef.current) {
      transitionFadeCleanupRef.current();
      transitionFadeCleanupRef.current = null;
    }

    let finalized = false;
    const finish = () => {
      if (finalized) return;
      finalized = true;
      // Detach our one-shot listeners BEFORE finalizing, because
      // finalizeSweetFade pauses/unloads the outgoing deck and its own `pause`
      // event would otherwise re-enter and finalize again.
      if (transitionFadeCleanupRef.current) {
        transitionFadeCleanupRef.current();
        transitionFadeCleanupRef.current = null;
      }
      finalizeSweetFade(promoted);
    };
    const onEndedOnce = () => finish();
    const onPauseOnce = () => finish();

    promoted.outgoing.addEventListener('ended', onEndedOnce, { once: true });
    promoted.outgoing.addEventListener('pause', onPauseOnce, { once: true });

    transitionFadeCleanupRef.current = () => {
      promoted.outgoing.removeEventListener('ended', onEndedOnce);
      promoted.outgoing.removeEventListener('pause', onPauseOnce);
      if (transitionRampCancelRef.current) {
        transitionRampCancelRef.current.cancel();
        transitionRampCancelRef.current = null;
      }
      if (transitionRampTimerRef.current) {
        window.clearInterval(transitionRampTimerRef.current);
        transitionRampTimerRef.current = 0;
      }
    };

    const ramp = scheduleCrossfade({
      outgoing: promoted.outgoing,
      incoming: promoted.incoming,
      volume: transitionVolumeRef.current,
      fadeSeconds,
      onComplete: completed => { if (completed) finish(); }
    });
    transitionRampCancelRef.current = ramp;

    // If Web Audio is unavailable the scheduled ramp is a null-op; fall back
    // to a short interval-driven ramp so the app still fades on desktop.
    if (!ramp) {
      let progress = 0;
      const step = Math.max(2, Math.ceil(fadeSeconds * 20)); // ~50ms ticks
      transitionRampTimerRef.current = window.setInterval(() => {
        progress += 1;
        if (progress >= step) { finish(); return; }
        const levels = transitionDeckVolumes(transitionVolumeRef.current, progress / step);
        setDeckGain(promoted.incoming, levels.incoming);
        setDeckGain(promoted.outgoing, levels.outgoing);
      }, 50);
    }
  }, [finalizeSweetFade, setDeckGain]);

  useLayoutEffect(() => {
    executePreparedTransitionRef.current = executePreparedTransition;
  }, [executePreparedTransition]);

  useEffect(() => {
    if (offline || wiim.blocksLocal || !isPlaying || !nowPlaying?.id) {
      cancelPreparedTransition();
      return;
    }
    if (playerControls.pauseAfterCurrent || !shouldAutoAdvanceQueue(settingsRef.current)) {
      cancelPreparedTransition();
      return;
    }
    if (pendingTransitionRef.current?.status === 'transitioning') return;
    const queue = playQueueRef.current;
    const currentItem = queue.items?.[queue.index];
    const advance = prepareQueueAdvance('next', { fromEnded: true });
    const nextIndex = advance.plan.nextIndex;
    const nextItem = queue.items?.[nextIndex];
    if (!currentItem?.song?.id || !nextItem?.song?.id) {
      cancelPreparedTransition();
      return;
    }
    const decision = transitionDecisionFor({
      capabilities: audioTransitionCapabilities(),
      queueRevision: queueRevisionRef.current,
      queueSource: queue.source,
      sessionKind: isRadioActive ? radioState.sessionKind : '',
      repeat: playerControlsRef.current.repeat,
      outgoingItem: currentItem,
      incomingItem: nextItem,
      preferences: settingsRef.current?.playback
    });
    const mode = decision.mode;
    if(settingsRef.current.playback.gaplessAlbums && albumRun(queue,playerControlsRef.current,true).length){cancelPreparedTransition();return;}
    if (!shouldPrepareTransition({
      mode,
      currentTime: playbackState.currentTime,
      duration: playbackState.duration
    })) {
      if (mode === TRANSITION_MODE.HARD) cancelPreparedTransition();
      return;
    }

    const preferences = settingsRef.current || defaultAppSettings;
    const expectedUrl = new URL(
      nextItem.song.streamUrl || streamUrl(nextItem.song.id, preferences.streaming),
      window.location.href
    ).href;
    let pending = pendingTransitionRef.current;
    if (!pending || pending.trackId !== String(nextItem.song.id) || pending.expectedUrl !== expectedUrl
      || pending.advance !== advance || pending.mode !== mode || pending.decision.durationMs !== decision.durationMs) {
      cancelPreparedTransition();
      const standby = getStandbyAudio();
      if (!standby) return;
      setDeckGain(standby, 0); // silent standby (iOS ignores .volume; gain 0 in the graph)
      standby.preload = 'auto';
      standby.src = expectedUrl;
      standby.load();
      // Pre-heat the standby so the incoming deck is already loading/playing
      // silently when the crossfade starts. This is what lets the ramp run
      // immediately without waiting on Safari's first-play() latency. The
      // deckGain is 0, so it is inaudible.
      wakeAudioContext();
      standby.play().catch(() => {});
      pending = {
        audio: standby,
        expectedUrl,
        trackId: String(nextItem.song.id),
        mode,
        decision,
        queueRevision: decision.queueRevision,
        status: 'preloading',
        currentItem,
        nextItem,
        nextIndex,
        queueItems: queue.items,
        advance,
        requestedFade: isBlendTransition(mode)
          ? decision.durationMs / 1000
          : 0
      };
      pending.event = transitionEventForDecision(decision, TRANSITION_EVENT.BUFFERING);
      setTransitionDiagnostic(pending.event);
      pendingTransitionRef.current = pending;
    }
    if (pending.status !== 'preloading' || !canUsePreparedDeck({
      expectedUrl: pending.expectedUrl,
      actualUrl: pending.audio.currentSrc || pending.audio.src,
      readyState: pending.audio.readyState,
      error: pending.audio.error,
      baseHref: window.location.href
    })) return;
    pending.event = transitionEventForDecision(pending.decision, TRANSITION_EVENT.READY);
    setTransitionDiagnostic(pending.event);

    const shouldStart = isBlendTransition(mode)
      ? shouldStartSweetFade({
          currentTime: playbackState.currentTime,
          duration: playbackState.duration,
          fadeSeconds: pending.requestedFade
        })
      : false;
    if (!shouldStart) return;
    executePreparedTransition();
  }, [
    cancelPreparedTransition,
    executePreparedTransition,
    getStandbyAudio,
    isPlaying,
    isRadioActive,
    nowPlaying?.id,
    playbackState.currentTime,
    playbackState.duration,
    playQueue,
    playQueueRef,
    queueRevision,
    queueRevisionRef,
    playTrackEvent,
    playerControls.pauseAfterCurrent,
    playerControls.shuffle,
    playerControls.repeat,
    playerControls.repeatAll,
    prepareQueueAdvance,
    settingsState.preferences,
    playerControlsRef,
    promoteStandbyAudio,
    radioState.sessionKind,
    setDeckGain,
    wakeAudioContext
  ]);

  const stopRadio = useCallback(() => {
    resumeAfterSonicAppendRef.current = 0;
    stopSonicController();
    const current=playQueueRef.current;
    if(current.items?.some(item=>item.radioSeed))replaceQueue({...current,items:current.items.map(({radioSeed,...item})=>item)},{preserveHistory:true});
  }, [stopSonicController,replaceQueue]);

  useEffect(() => {
    if (!isPlaying || !isRadioActive || !nowPlaying?.id) return;
    const progressedIds = activeRadioProgressIds(playQueueRef.current, getSonicRadioState(), nowPlaying.id);
    for (const id of progressedIds) markSonicTrackPlayed(id);
  }, [getSonicRadioState, isPlaying, isRadioActive, markSonicTrackPlayed, nowPlaying?.id]);

  const openJourneyPicker=()=>{
    const seed=rawQueueSong(wiim.state.session?.queue||playQueueRef.current,nowPlaying?.id);
    if(seed?.id && !seed.isRadio && !seed.streamUrl)setJourneySeed({...seed});
    else setPlayerNotice('Choose a library track to start a Journey.');
  };
  const chooseJourney=(kind,value,seed)=>{
    if(offline)return;
    if(kind==='track')void startTrackJourney(seed);
    if(kind==='artist')void startArtistJourney(value);
    if(kind==='genre')void startGenreJourney(value);
    if(kind==='artist-dj')void startArtistDj(value);
  };

  const startCurrentTrackJourney = useCallback(() => {
    const seed = rawQueueSong(wiim.state.session?.queue||playQueueRef.current, nowPlaying?.id);
    if (!seed) {
      setPlayerNotice('The current track is not available as a Journey seed.');
      return;
    }
    startTrackJourney(seed, `${nowPlaying?.title || seed.title || 'Track'} Journey`);
  }, [nowPlaying?.id, nowPlaying?.title, playQueueRef, startTrackJourney]);

  const startCurrentArtistDj = useCallback(() => {
    const seed = rawQueueSong(wiim.state.session?.queue||playQueueRef.current, nowPlaying?.id);
    const artistId = String(seed?.artistId || seed?.albumArtistId || nowPlaying?.artistId || '').trim();
    if (!artistId) {
      setPlayerNotice('This track does not include a stable artist ID for Artist DJ.');
      return;
    }
    const artistName = nowPlaying?.artist || seed?.artist || 'Artist';
    startArtistDj({ id: artistId, name: artistName }, `${artistName} Artist DJ`);
  }, [nowPlaying?.artist, nowPlaying?.artistId, nowPlaying?.id, playQueueRef, startArtistDj]);

  const saveCurrentSonicRadio = useCallback(async () => {
    if (sonicSavePending) return;
    setSonicSavePending(true);
    try {
      await saveSonicRadio(radioState.seedLabel);
    } finally {
      setSonicSavePending(false);
    }
  }, [radioState.seedLabel, saveSonicRadio, sonicSavePending]);

  const playQueueIndex = useCallback((index, queue = playQueueRef.current, options = {}) => {
    if(wiim.blocksLocal){if(wiim.state.session)void wiim.command('select',{index});return;}
    const previousIndex = queue.index;
    const item = selectQueueIndex(index, queue, options);
    if (!item) return;
    playTrackEvent(item.song, item.album, {
      queueItems: queue.items,
      queueIndex: index,
      queueSource: queue.source,
      preserveHistory: true,
      fromEnded: options.fromEnded === true
    });
    if (index > previousIndex && queue.items?.[previousIndex]?.atlas) {
      for (let skippedIndex = previousIndex; skippedIndex < index; skippedIndex += 1) {
        const skipped = queue.items[skippedIndex];
        if (skipped?.atlas) atlasJourneyActions.recordPlaybackAction(atlasJourneyEventTypes.skip, skipped.queueItemId, 'queue-selection');
      }
    }
  }, [atlasJourneyActions, playTrackEvent, selectQueueIndex]);

  const advanceQueue = useCallback((direction = 'next', options = {}) => {
    if(wiim.blocksLocal){if(wiim.state.session&&!options.fromEnded)void wiim.command(direction);return false;}
    if(direction==='previous'&&(Number(audioRef.current?.currentTime)>3||playQueueRef.current.index===0)){if(audioRef.current)audioRef.current.currentTime=0;return true;}
    const queue = playQueueRef.current;
    const previousItem = queue.items?.[queue.index];
    const plan = advancePlayerQueue(direction, options);
    if (!plan.item) {
      if (plan.notice) setPlayerNotice(plan.notice);
      return false;
    }
    // Keep this guard in case future async queue planning is introduced before playback starts.
    if (playQueueRef.current !== queue) return false;
    playTrackEvent(plan.item.song, plan.item.album, {
      queueItems: queue.items,
      queueIndex: plan.nextIndex,
      queueSource: queue.source,
      preserveHistory: true,
      fromEnded: options.fromEnded === true,
      queueAdvanced: true,
      startPaused: options.startPaused === true
    });
    if (direction === 'next' && options.fromEnded !== true && options.recordJourneySkip !== false && previousItem?.atlas) {
      atlasJourneyActions.recordPlaybackAction(atlasJourneyEventTypes.skip, previousItem.queueItemId, 'manual-next');
    }
    return true;
  }, [advancePlayerQueue, atlasJourneyActions, playTrackEvent]);

  const advanceQueueEvent = useEventCallback(advanceQueue);
  useLayoutEffect(() => {
    advanceQueueEventRef.current = advanceQueueEvent;
  }, [advanceQueueEvent]);

  useEffect(() => {
    const sharedTrackId = new URL(window.location.href).searchParams.get('track');
    if (offline || !sharedTrackId) return undefined;
    let active = true;
    navidromeSong(sharedTrackId)
      .then((payload) => {
        if (!active || !payload.song?.id) return;
        playTrackEvent(payload.song, albumFromSong(payload.song), { queueSongs: [payload.song], queueIndex: 0 });
        setPlayerNotice('Opened shared track from NaviMuse link.');
        const restoredUrl = new URL(window.location.href);
        restoredUrl.searchParams.delete('track');
        window.history.replaceState({}, '', restoredUrl);
      })
      .catch(() => {
        if (active) setPlayerNotice('Shared track could not be loaded from Navidrome.');
      });
    return () => {
      active = false;
    };
  }, [playTrackEvent]);

  const playPrevious = () => {
    advanceQueue('previous');
  };

  const playNext = () => {
    advanceQueue('next');
  };

  const resumePlayback = () => {
    if(wiim.blocksLocal){if(wiim.state.session)void wiim.command('play');else setOutputOpen(true);return;}
    const audio = audioRef.current;
    if (!audio || !nowPlaying?.id) { openPlayer(); return; }
    playbackIntentRef.current += 1;
    albumRequestRef.current?.abort();
    if (!audio.paused && transportRef.current.status === 'playing') return;
    setPlayerNotice('');
    const retrying = transportRef.current.status === 'error';
    // Metadata may already have applied and consumed the saved seek. Capture it
    // again before resetting src so explicit Play does not restart at zero.
    if (retrying || transportRef.current.status === 'restored') pendingRestorePositionRef.current = pendingRestorePositionRef.current || Number(audio.currentTime) || Number(playbackState.currentTime) || 0;
    if (transportRef.current.status === 'restored' || !audio.currentSrc || audio.readyState === 0) {
      const preferences = settingsRef.current || defaultAppSettings;
      const currentItem = playQueueRef.current.items?.[playQueueRef.current.index];
      const restoredStreamPath = playbackStreamForCurrentQueueItem(currentItem, streamUrl(nowPlaying.id, preferences.streaming));
      currentStreamUrlRef.current = new URL(restoredStreamPath, window.location.href).href;
      audio.src = restoredStreamPath;
    }
    skipNextEndedRequestRef.current = 0;
    if (skipNextEndedTimerRef.current) {
      window.clearTimeout(skipNextEndedTimerRef.current);
      skipNextEndedTimerRef.current = 0;
    }
    if (retrying) {
      const retryRequestId = playRequestRef.current + 1;
      playRequestRef.current = retryRequestId;
      dispatchTransport({ type: 'load', requestId: retryRequestId });
      dispatchTransport({ type: 'recover', requestId: retryRequestId });
      setPlaybackMessage('');
      audio.load();
    } else {
      dispatchTransport({ type: 'request-play', requestId: playRequestRef.current });
      if (audio.readyState === 0) audio.load();
    }
    wakeAudioContext();
    const requestId = playRequestRef.current;
    audio.play().catch(() => dispatchTransport({ type: 'error', requestId, message: 'Playback could not start. Check your connection and try again.' }));
  };
  const resumePlaybackEvent = useEventCallback(resumePlayback);
  useLayoutEffect(() => { resumePlaybackRef.current = resumePlaybackEvent; }, [resumePlaybackEvent]);

  const sleepTimer = useSleepTimer({remoteSession, wiim, notify:setPlayerNotice, pauseLocal:()=>{
    suspendAccountPlayback();
    flushPlaybackPosition();
  }});

  const albumURL=useCallback(song=>new URL(song.streamUrl||streamUrl(song.id,settingsRef.current.streaming),window.location.href).href,[]);
  const albumMetadata=useCallback(item=>{
    const track=normalizeSong(item.song,item.album,'Navidrome',settingsRef.current.library.artworkSize,settingsRef.current.streaming);
    return {title:track.title,artist:track.artist,album:track.album,artwork:new URL(track.artwork,window.location.href).href};
  },[]);
  const adoptAlbum=useEventCallback((index,audio)=>{
    let current=playQueueRef.current;
    while(current.index<index){
      const advance=prepareQueueAdvance('next',{fromEnded:true});
      if(advance.plan.nextIndex!==current.index+1)return false;
      const committed=commitQueueAdvance(advance);if(!committed?.item)return false;
      const item=committed.item;
      playTrackEvent(item.song,item.album,{queueItems:current.items,queueIndex:advance.plan.nextIndex,preserveHistory:true,fromEnded:true,preparedTransition:true,queueAdvanced:true,startPosition:audio.currentTime});
      current=playQueueRef.current;
    }
    currentStreamUrlRef.current=audio.currentSrc||audio.src;
    dispatchTransport({type:audio.paused?'pause':'playing',requestId:playRequestRef.current,intentional:audio.paused});
    setPlaybackState({currentTime:audio.currentTime,duration:audio.duration||expectedDurationRef.current,canSeek:audio.seekable.length>0});
    persistPlayerQueue(audio.currentTime);return true;
  });
  useAlbumPlayback({audioRef,audioNodes:audioDeckNodes,queue:playQueue,queueRef:playQueueRef,
    controls:{...playerControls,continueThroughQueue:settingsState.preferences.playback.continueThroughQueue},
    enabled:settingsState.preferences.playback.gaplessAlbums===true,isPlaying,blocked:wiim.blocksLocal||Boolean(sleepTimer.deadline),
    position:playbackState.currentTime,urlFor:albumURL,metadataFor:albumMetadata,adopt:adoptAlbum,notify:setPlayerNotice});

  const togglePlayback = () => {
    if(wiim.blocksLocal){if(wiim.state.session)void wiim.command(wiim.state.session.status==='playing'?'pause':'play');else setOutputOpen(true);return;}
    const audio = audioRef.current;
    if (audio?.toggle && audio.currentSrc && audio.readyState > 0 && transportRef.current.status !== 'error') {
      playbackIntentRef.current += 1;
      albumRequestRef.current?.abort();
      cancelTransitionRef.current();
      audio.toggle().then(flushPlaybackPosition).catch(() => setPlayerNotice('Playback control failed. Please try again.'));
      return;
    }
    if (!audio || audio.paused || transportRef.current.status === 'error') { resumePlayback(); return; }
    playbackIntentRef.current += 1;
    albumRequestRef.current?.abort();
    cancelTransitionRef.current();
    dispatchTransport({ type: 'pause', requestId: playRequestRef.current, intentional: true });
    audio.pause();
    flushPlaybackPosition();
  };

  const shareSourceRef=useRef({id:nowPlaying?.id,request:0});
  if(shareSourceRef.current.id!==nowPlaying?.id)shareSourceRef.current={id:nowPlaying?.id,request:0};
  useEffect(()=>()=>{shareSourceRef.current={id:null,request:0};},[]);
  const shareTrack = async () => {
    if (!nowPlaying) return;
    const shareText = `${nowPlaying.title} by ${nowPlaying.artist} from ${nowPlaying.album} in NaviMuse.`;
    const source=shareSourceRef.current,request=++source.request;
    const isCurrent=()=>shareSourceRef.current===source&&source.request===request;
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('track', nowPlaying.id);
    const notice=await shareTrackDetails({
      data:{title:nowPlaying.title,text:shareText,url: shareUrl.href},
      share:typeof navigator.share==='function'?data=>navigator.share(data):null,
      copy:copyTextToClipboard,isCurrent
    });
    if(notice&&isCurrent())setPlayerNotice(notice);
  };

  const updateNowPlayingFeedback = async (patch) => {
    if(offline){setPlayerNotice('Reconnect to save track feedback.');return;}
    if (!nowPlaying?.id) return;
    const songId = nowPlaying.id;
    const previousTrackFeedback = trackFeedbackLatestRef.current;
    const previousFeedback = { ...defaultTrackFeedback, ...(trackFeedbackLatestRef.current[songId] || {}) };
    const feedbackState = nextTrackFeedbackState(trackFeedbackLatestRef.current, songId, patch, Date.now(), maxTrackFeedbackEntries);
    if (!feedbackState.changed) {
      setPlayerNotice('');
      return;
    }
    // Keep the ref as the immediate source of truth so rapid feedback taps compose before React effects flush.
    trackFeedbackLatestRef.current = feedbackState.feedback;
    setTrackFeedback(feedbackState.feedback);
    const nextFeedback = { ...defaultTrackFeedback, ...(feedbackState.feedback[songId] || {}) };
    if (!canSyncTrackFeedback(songId)) {
      setPlayerNotice('Feedback is unavailable for this item.');
      return;
    }

    const syncRequest = trackFeedbackSyncRequestRef.current + 1;
    trackFeedbackSyncRequestRef.current = syncRequest;
    trackFeedbackSyncAbortRef.current?.abort();
    const syncController = new AbortController();
    trackFeedbackSyncAbortRef.current = syncController;
    setPlayerNotice('');
    try {
      await syncTrackFeedback(songId, nextFeedback, syncController.signal);
      if (trackFeedbackSyncRequestRef.current !== syncRequest) return;
      setPlayerNotice('');
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (trackFeedbackSyncRequestRef.current !== syncRequest) return;
      trackFeedbackLatestRef.current = previousTrackFeedback;
      setTrackFeedback(previousTrackFeedback);
      setPlayerNotice(`Track feedback sync failed; restored previous feedback: ${error.message}`);
    } finally {
      if (trackFeedbackSyncAbortRef.current === syncController) {
        trackFeedbackSyncAbortRef.current = null;
      }
    }
  };

  const dislikeAtlasJourneyStop = () => {
    const item = playQueueRef.current.items?.[playQueueRef.current.index];
    if (!item?.atlas) return;
    atlasJourneyActions.recordPlaybackAction(atlasJourneyEventTypes.dislike, item.queueItemId, 'player-action');
    const advanced = advanceQueue('next', { recordJourneySkip: false });
    setPlayerNotice(advanced
      ? 'Track disliked. Journey moved to the next ordered stop.'
      : 'Track disliked. This is the final ordered Journey stop.');
  };

  const playAlbum = async (album, startIndex = 0) => {
    if (!album?.id || album.id.startsWith('mock-')) {
      setPlaybackMessage('Connect Navidrome credentials to play real albums.');
      return;
    }

    const intentId = ++playbackIntentRef.current;
    albumRequestRef.current?.abort();
    const request = new AbortController();
    albumRequestRef.current = request;
    const payload = Array.isArray(album.song) ? { album } : await navidromeAlbum(album.id, { signal: request.signal }).catch(() => null);
    if (intentId !== playbackIntentRef.current || request.signal.aborted) return;
    if (!payload) {
      setPlaybackMessage('Could not load that album from Navidrome.');
      return;
    }

    const firstSong = payload.album?.song?.[startIndex];
    if (!firstSong) {
      setPlaybackMessage('That album has no playable tracks.');
      return;
    }

    const queueItems = albumQueueItems(payload.album);
    playTrack(firstSong, payload.album, {
      intentId,
      queueItems,
      queueIndex: queueItems.findIndex(item => item.song === firstSong),
      queueSource: createQueueSourceDescriptor({
        kind: 'album',
        id: payload.album.id || album.id,
        label: payload.album.name || payload.album.title || album.title || 'Album',
        detail: payload.album.artist || album.artist || ''
      })
    });
  };

  const playPlaylist = (playlistEntries, shouldShuffle = false, playlist = null, selectedIndex = null) => {
    const playbackPlan = playlistPlaybackPlan(playlistEntries, shouldShuffle, shuffled, selectedIndex);
    if (!playbackPlan) {
      setPlaybackMessage('That playlist has no playable tracks.');
      return;
    }
    playTrack(playbackPlan.firstSong, null, {
      queueSongs: playbackPlan.queueSongs,
      queueIndex: playbackPlan.queueIndex,
      queueSource: createQueueSourceDescriptor({
        kind: 'playlist',
        id: playlist?.id,
        label: playlist?.name || 'Playlist'
      })
    });
  };

  // seekPlayback delegates to the audio engine hook.  The hook owns the audio
  // element ref and playback state; App surfaces the blocked-seek notice via
  // setPlayerNotice for the player UI.
  const seekPlayback = (fraction) => {
    if(wiim.blocksLocal){if(wiim.state.session)void wiim.command('seek',{position:Math.max(0,Math.min(1,fraction))*wiim.state.session.duration});return;}
    cancelTransitionRef.current();
    const result = engineSeek(fraction);
    if (result.blocked) setPlayerNotice(result.notice);
  };

  const reloadAccountPreferences = async () => {
    const snapshot=await accountPreferencesClient.read();
    accountPreferenceRevision.current=snapshot.revision;
    setSettingsState(current=>({...current,preferences:snapshot.preferences}));
    setSettingsMessage('Saved values refreshed. Review your draft before saving.');
  };

  const savePreferences = async (preferences) => {
    const deviceDraft = hasMobileNetwork() ? preferences.streaming : null;
    if (deviceDraft) preferences = { ...preferences, streaming: settingsState.preferences.streaming };
    if(accountSession) {
      const snapshot=await accountPreferencesClient.save(accountPreferenceRevision.current,preferences);
      if (deviceDraft) saveDeviceStreaming(deviceDraft);
      accountPreferenceRevision.current=snapshot.revision;
      setSettingsState(current=>({...current,preferences:snapshot.preferences}));
      setSettingsMessage('Preferences saved.');
      return hasMobileNetwork() ? { ...snapshot.preferences, streaming: deviceStreaming(snapshot.preferences.streaming) } : snapshot.preferences;
    }
    try {
      const payload = await settingsService.savePreferences(preferences);
      const saved = mergeSettings(payload);
      if (deviceDraft) saveDeviceStreaming(deviceDraft);
      settingsReadyRef.current=true;setSettingsReady(true);
      setSettingsState(saved);
      setSettingsMessage('Settings saved.');
      return hasMobileNetwork() ? { ...saved.preferences, streaming: deviceStreaming(saved.preferences.streaming) } : saved.preferences;
    } catch (error) {
      setSettingsMessage(error.message || 'Unlock Settings to save changes.');
      await refreshSession();
      return false;
    }
  };

  const changeLibraries=async value=>{
    if(librarySaving)return;setLibrarySaving(true);
    try {const result=await savePreferences({...settingsState.preferences,streaming:deviceStreaming(settingsState.preferences.streaming),library:{...settingsState.preferences.library,selectedFolders:value.split(',').filter(Boolean)}});if(result)setLibraryKey(value);}
    catch(error){setPlayerNotice(error.message||'Library selection could not be saved.');}
    finally{setLibrarySaving(false);}
  };

  const setupAdmin = async (password, setupToken) => {
    try {
      await settingsService.setupAdmin(password, setupToken);
      setSettingsSession((current) => ({ ...current, adminConfigured: true, authenticated: true }));
      setSettingsMessage('NaviMuse Settings are secured and unlocked.');
      await refreshSettings();
      await refreshSession();
      return true;
    } catch (error) {
      setSettingsMessage(error.message || 'Could not create NaviMuse admin.');
      return false;
    }
  };

  const loginAdmin = async (password) => {
    try {
      await settingsService.loginAdmin(password);
      setSettingsSession((current) => ({ ...current, adminConfigured: true, authenticated: true }));
      setSettingsMessage('Settings unlocked.');
      await refreshSettings();
      await refreshSession();
      return true;
    } catch (error) {
      setSettingsMessage(error.message || 'Could not unlock Settings.');
      return false;
    }
  };

  const logoutAdmin = async () => {
    try{await forgetOfflineAccess();}catch{setSettingsMessage('Could not lock downloaded music. Try signing out again.');return;}
    suspendAccountPlayback();
    if (accountSession) {
      return onAccountLogout();
    }
    sessionRequestRef.current += 1;
    const oidcMode = settingsSession.authMode === 'oidc';
    try {
      await settingsService.logoutAdmin(settingsSession.authMode);
    } catch (error) {
      setSettingsMessage(error.message || 'Could not sign out. Try again.');
      return false;
    }
    onQueueScope(null);
    setSettingsSession((current) => ({ ...current, authenticated: false, user: null }));
    setSettingsMessage(oidcMode ? 'Signed out of NaviMuse.' : 'Settings locked.');
  };

  const signInWithPocketId = () => {
    window.location.assign(apiNavigationUrl(settingsSession.loginUrl || '/api/auth/login'));
  };

  const testNavidromeSettings = async (credentials) => {
    try {
      const payload = await settingsService.testNavidrome(credentials);
      setSettingsMessage(payload.ok ? `Navidrome login works for ${payload.username}.` : payload.error || 'Navidrome login failed.');
      return payload.ok;
    } catch (error) {
      setSettingsMessage(error.message || 'Navidrome login failed.');
      await refreshSession();
      return false;
    }
  };

  const saveNavidromeSettings = async (credentials) => {
    try {
      const payload = await settingsService.saveNavidrome(credentials);
      setSettingsState(mergeSettings(payload));
      setSettingsMessage('Navidrome credentials saved.');
      await refreshSession();
      refreshNavidrome();
      refreshHealth();
      return true;
    } catch (error) {
      setSettingsMessage(error.message || 'Could not save Navidrome settings.');
      await refreshSession();
      return false;
    }
  };

  const clearNavidromeSettings = async () => {
    try {
      const payload = await settingsService.clearNavidrome();
      setSettingsState(mergeSettings(payload));
      setSettingsMessage('App-stored Navidrome credentials cleared. Environment fallback remains available.');
      await refreshSession();
      refreshNavidrome();
      refreshHealth();
      return true;
    } catch (error) {
      setSettingsMessage(error.message || 'Could not clear Navidrome settings.');
      await refreshSession();
      return false;
    }
  };

  const testAudiomuseSettings = async (credentials) => {
    try {
      const payload = await settingsService.testAudiomuse(credentials);
      setSettingsMessage(payload.ok ? 'AudioMuse health check works.' : payload.error || 'AudioMuse health check failed.');
      return payload.ok;
    } catch (error) {
      setSettingsMessage(error.message || 'AudioMuse health check failed.');
      await refreshSession();
      return false;
    }
  };

  const saveAudiomuseSettings = async (credentials) => {
    try {
      const payload = await settingsService.saveAudiomuse(credentials);
      setSettingsState(mergeSettings(payload));
      setSettingsMessage('AudioMuse settings saved.');
      refreshHealth();
      return true;
    } catch (error) {
      setSettingsMessage(error.message || 'Could not save AudioMuse settings.');
      await refreshSession();
      return false;
    }
  };

  const clearAudiomuseSettings = async () => {
    try {
      const payload = await settingsService.clearAudiomuse();
      setSettingsState(mergeSettings(payload));
      setSettingsMessage('App-stored AudioMuse settings cleared. Environment fallback remains available.');
      refreshHealth();
      return true;
    } catch (error) {
      setSettingsMessage(error.message || 'Could not clear AudioMuse settings.');
      await refreshSession();
      return false;
    }
  };

  const sessionLocked = sessionNeedsUnlock(settingsSession);
  const artworkPaletteStyle = useArtworkPalette(offline?null:nowPlaying?.artwork,
    settingsSession.authenticated ? `${settingsSession.user?.sub || 'legacy-local'}:${activeLibrary?.id || ''}` : null);
  const currentOnboardingMode = onboardingMode({
    ...settingsSession,
    resolved: sessionResolved,
    error: sessionLoadError
  });
  const playSongInQueue = (song, album, queueSongs, queueSource = null) => playTrack(song, album, {
    queueSongs,
    queueIndex: (queueSongs || []).findIndex((item) => String(item.id) === String(song.id)),
    queueSource: queueSource || createQueueSourceDescriptor({
      kind: album?.id ? 'album' : 'songs',
      id: album?.id,
      label: album?.title || album?.name || 'Songs',
      detail: album?.artist || ''
    })
  });

  useCarPlay({scope:accountSession?.queueScope||queueScope,enabled:sessionResolved&&settingsSession.authenticated,blocked:wiim.blocksLocal,
    queue:playQueue,downloads:downloadsState,albums:offline?[]:navidrome.recentAlbums||navidrome.newestAlbums,offline,
    mix:personalizedMix.mix?.tracks||[],playlistRevision,fetchFn:protectedApiFetch,
    resume:()=>resumePlaybackRef.current(),selectQueue:id=>{const index=playQueueRef.current.items.findIndex(item=>item.queueItemId===id);if(index>=0)playQueueIndex(index);},
    playSongs:(songs,label)=>playSongInQueue(songs[0],null,songs,createQueueSourceDescriptor({kind:'ad-hoc',label:label||'CarPlay'}))});

  const playTrackNext = useCallback((song, album = null) => {
    if(wiim.blocksLocal){if(wiim.state.session)void wiim.command('queue',{mutation:{action:'insertNext'},item:{song,queueItemId:crypto.randomUUID()}});return false;}
    const current = playQueueRef.current;
    if (current?.instanceId) {
      setPlayerNotice('Journey order is locked. Detach the Journey before adding tracks.');
      return false;
    }
    if (!current?.items?.[current.index]?.song) {
      setPlayerNotice('Start playback before adding a track next.');
      return false;
    }
    const changed = insertPlayNext(queueItem(song, album));
    if (!changed) return false;
    cancelTransitionRef.current();
    setPlayerNotice(`${song?.title || 'Track'} will play next.`);
    return true;
  }, [insertPlayNext, playQueueRef]);

  const addTrackToQueue = useCallback((song, album = null) => {
    if(wiim.blocksLocal){if(wiim.state.session)void wiim.command('queue',{mutation:{action:'append'},item:{song,queueItemId:crypto.randomUUID()}});return false;}
    const current = playQueueRef.current;
    if (current?.instanceId) {
      setPlayerNotice('Journey order is locked. Detach the Journey before adding tracks.');
      return false;
    }
    if (!current?.items?.[current.index]?.song) {
      setPlayerNotice('Start playback before adding to the queue.');
      return false;
    }
    const changed = appendToQueue(queueItem(song, album));
    if (!changed) return false;
    setPlayerNotice(`${song?.title || 'Track'} was added to the queue.`);
    return true;
  }, [appendToQueue, playQueueRef]);

  const queueActionDisabledReason = visibleQueue.instanceId
    ? 'Journey order is locked'
    : visibleQueue.index < 0
      ? 'Start playback first'
      : '';

  const radioPlaybackMounted=useRef(true);
  useEffect(()=>{radioPlaybackMounted.current=true;return()=>{radioPlaybackMounted.current=false;};},[]);
  const playInternetRadio = async (song,album,queueSongs) => {
    if(!radioPlaybackMounted.current)return;
    if(wiim.blocksLocal){
      if(!wiim.state.session || wiim.state.busy)throw Error('Playback output is still being checked. Try again in a moment.');
      const queue=remoteQueue({index:0,items:[{song}]});
      if(!await wiim.command('replace',{queue}))throw Error('Could not change the station on the speakers. Check Play on and try again.');
      return;
    }
    playTrackEvent(song,album,{queueSongs,queueIndex:0});
  };
  const openArtist=(artist,opener)=>{setSearchOpen(false);artistOpenerRef.current=opener||document.activeElement;closePlayer();setAlbumDetail(null);setArtistDetail({kind:'artist',value:artist.id,name:artist.name||artist.artist});};
  const closeArtist=()=>{setArtistDetail(null);requestAnimationFrame(()=>artistOpenerRef.current?.isConnected&&artistOpenerRef.current.focus());};
  const openAlbum = (album, opener) => {
    albumOpenerRef.current = opener || document.activeElement;
    setSearchOpen(false);
    setAlbumDetail(album);
  };
  const closeAlbum = () => {
    setAlbumDetail(null);
    window.requestAnimationFrame(() => albumOpenerRef.current?.isConnected && albumOpenerRef.current.focus());
  };
  const openDownloads=()=>{closePlayer();setArtistDetail(null);setAlbumDetail(null);setActiveTab('library');setDownloadsOpen(true);};
  const downloadSongs=async (songs,collection)=>{await downloads.download(songs,undefined,collection);};
  const savedQueueDownload=useRef(null);
  const downloadQueue=()=>{
    const songs=visibleQueue.items.map(item=>item.song);
    if(visibleQueue.source?.kind==='playlist')return downloadSongs(songs,visibleQueue.source);
    const identity=JSON.stringify([accountSession?.queueScope||queueScope,songs.map(song=>song.id)]);
    if(savedQueueDownload.current?.identity!==identity)savedQueueDownload.current={identity,id:'queue:'+crypto.randomUUID()};
    return downloadSongs(songs,{kind:'playlist',id:savedQueueDownload.current.id,name:visibleQueue.source?.label||'Saved queue'});
  };
  const downloadCurrentTrack=()=>downloadSongs([remoteSession?.song || playQueueRef.current.items?.[playQueueRef.current.index]?.song || nowPlaying]);
  const openListenBrainz=()=>{closePlayer();setArtistDetail(null);setAlbumDetail(null);setActiveTab('listenbrainz');};
  const surfaces = {
    listenbrainz: !sessionLocked && !offline && (accountSession?.queueScope||queueScope) ? <ListenBrainzSurface key={accountSession?.queueScope||queueScope} scope={accountSession?.queueScope||queueScope} onOpenAlbum={openAlbum} onBack={()=>setActiveTab('home')}
      disabledReason={wiim.blocksLocal&&!remoteSession?'Checking speaker output. Try again shortly.':visibleQueue.instanceId?'Detach the Journey before changing this queue.':''}
      onPlay={(songs,label,kind='listenbrainz')=>playSongInQueue(songs[0],null,songs,createQueueSourceDescriptor({kind,label}))}
      onAdd={async songs=>{if(wiim.blocksLocal){if(!wiim.state.session)return false;for(const song of songs){if(!await wiim.command('queue',{mutation:{action:'append'},item:{song,queueItemId:crypto.randomUUID()}}))return false;}return true;}if(playQueueRef.current.instanceId||!playQueueRef.current.items?.[playQueueRef.current.index])return false;return songs.every(song=>addTrackToQueue(song));}}/> : null,
    home: (
      <HomeSurface
        listeningPreview={!sessionLocked && !offline && (accountSession?.queueScope||queueScope) ? <ListenBrainzHome key={accountSession?.queueScope||queueScope} scope={accountSession?.queueScope||queueScope} variant="summary" onOpen={openListenBrainz} onOpenAlbum={openAlbum}/> : null}
        listeningSection={!sessionLocked && !offline && (accountSession?.queueScope||queueScope) ? <ListenBrainzHome key={accountSession?.queueScope||queueScope} scope={accountSession?.queueScope||queueScope} onOpen={openListenBrainz} disabledReason={visibleQueue.instanceId?'Detach the Journey before changing this queue.':wiim.blocksLocal&&!remoteSession?'Checking speaker output. Try again shortly.':''} onPlay={(songs,label)=>playSongInQueue(songs[0],null,songs,createQueueSourceDescriptor({kind:'listenbrainz',label}))}/> : null}
        onOpenListenBrainz={openListenBrainz}
        radioMetadata={radioNow?.id === nowPlaying?.id ? radioNow : null}
        personalizedMix={personalizedMix}
        activeLibrary={activeLibrary}
        health={health}
        libraryKey={libraryKey}
        navidrome={navidrome}
        nowPlaying={nowPlaying}
        onLibraryChange={changeLibraries}
        librarySaving={librarySaving}
        onOpenQueue={openQueue}
        onTogglePlayback={togglePlayback}
        onPlayAlbum={openAlbum}
        onPlayNext={playTrackNext}
        onAddToQueue={addTrackToQueue}
        onPlaySong={playSongInQueue}
        onPlayRadio={playInternetRadio}
        radioOutputName={remoteSession?.device?.name}
        onRetry={refreshNavidrome}
        onStartArtistJourney={localOnly(startArtistJourney)}
        onStartArtistDj={localOnly(startArtistDj)}
        onStartGenreJourney={localOnly(startGenreJourney)}
        onStartTrackJourney={localOnly(startCurrentTrackJourney)}
        onSurfaceScroll={handleSurfaceScroll}
        onUnavailable={notifyUnavailable}
        onUnlock={() => setActiveTab('settings')}
        playQueue={visibleQueue}
        playbackMessage={playbackMessage}
        queueActionDisabledReason={queueActionDisabledReason}
        isPlaying={isPlaying}
        playlistRevision={playlistRevision}
        settings={settingsState.preferences}
        sessionLocked={sessionLocked}
      />
    ),
    library: (
      <LibrarySurface
        browseDisabled={offline}
        downloadsSelected={downloadsOpen && downloadsState.supported}
        onCloseDownloads={()=>setDownloadsOpen(false)}
        downloadsContent={<DownloadsSurface embedded state={downloadsState} controller={downloads} queueSongs={visibleQueue.items?.map(item=>item.song)||[]} offline={offline} onReconnect={onOfflineReconnect} onSurfaceScroll={handleSurfaceScroll}
        playbackBlockedReason={wiim.blocksLocal?(offline?wiim.state.error:wiim.state.session?'Release the current speaker in Play on before playing downloaded music.':'Playback output is still being checked.'):''}
        onPlay={(song,songs)=>playSongInQueue(song,null,songs,createQueueSourceDescriptor({kind:'ad-hoc',label:'Downloads'}))}/>}

        onPlaySong={(song,songs)=>playSongInQueue(song,null,songs)}
        libraryFolders={navidrome.musicFolders} onLibraryChange={changeLibraries} librarySaving={librarySaving}
        onOpenArtist={openArtist}
        onOpenDownloads={downloadsState.supported?openDownloads:undefined}
        onDownloadSongs={downloadsState.supported?downloadSongs:undefined}
        onStartAlbum={playAlbum}
        nowPlayingId={nowPlaying?.id}
        activeLibrary={activeLibrary}
        browseKey={libraryBrowseKey}
        albumSort={libraryAlbumSort}
        libraryKey={libraryKey}
        onPlayAlbum={openAlbum}
        onPlayNext={playTrackNext}
        onAddToQueue={addTrackToQueue}
        onPlayPlaylist={playPlaylist}
        onPlaylistsChanged={() => setPlaylistRevision((current) => current + 1)}
        onSurfaceScroll={handleSurfaceScroll}
        playbackMessage={playbackMessage}
        playlistRevision={playlistRevision}
        protectedApiFetch={protectedApiFetch}
        queueActionDisabledReason={queueActionDisabledReason}
        setBrowseKey={setLibraryBrowseKey}
        setAlbumSort={(value) => {
          setLibraryAlbumSort(value);
          saveAlbumSortPreference(accountStorage, value);
        }}
        settings={settingsState.preferences}
      />
    ),
    search: (
      <SearchSurface
        onOpenArtist={openArtist}
        shortcutsEnabled={!albumDetail && !artistDetail && !playerOpen}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        activeLibrary={activeLibrary}
        libraryKey={libraryKey}
        onPlayAlbum={openAlbum}
        onPlayNext={playTrackNext}
        onAddToQueue={addTrackToQueue}
        onPlaySong={(song, queueSongs) => { setSearchOpen(false); playSongInQueue(song, null, queueSongs, createQueueSourceDescriptor({ kind: 'search', label: 'Search results' })); }}
        onSurfaceScroll={handleSurfaceScroll}
        playbackMessage={playbackMessage}
        queueActionDisabledReason={queueActionDisabledReason}
        settings={settingsState.preferences}
      />
    ),
    sonic: (
      <SonicSurface
        personalizedMix={personalizedMix}
        atlasRendererActive={!playerOpen}
        currentAtlasPointId={playQueue.items?.[playQueue.index]?.atlas?.pointId || ''}
        isPlaying={isPlaying}
        libraryKey={libraryKey}
        nowPlaying={nowPlaying}
        onNext={playNext}
        onPlayNext={playTrackNext}
        onAddToQueue={addTrackToQueue}
        onOpenQueue={openQueue}
        onPlaySong={playSongInQueue}
        onPlayRadio={playInternetRadio}
        radioOutputName={remoteSession?.device?.name}
        onPrevious={playPrevious}
        onStartArtistJourney={localOnly(startArtistJourney)}
        onStartArtistDj={localOnly(startArtistDj)}
        onStartGenreJourney={localOnly(startGenreJourney)}
        onStartTrackJourney={localOnly(startCurrentTrackJourney)}
        onSurfaceScroll={handleSurfaceScroll}
        onTogglePlayback={togglePlayback}
        playbackMessage={playbackMessage}
        playQueue={visibleQueue}
        queueActionDisabledReason={queueActionDisabledReason}
        playHistoryQueueItemIds={playHistoryRef.current.map(index => playQueue.items?.[index]?.queueItemId).filter(Boolean)}
        settings={settingsState.preferences}
        transition={pendingTransitionRef.current ? {
          mode: pendingTransitionRef.current.mode,
          reasonCode: pendingTransitionRef.current.decision?.reasonCode || '',
          event: pendingTransitionRef.current.event?.type || '',
          status: pendingTransitionRef.current.status,
          currentTitle: pendingTransitionRef.current.currentItem?.song?.title || '',
          nextTitle: pendingTransitionRef.current.nextItem?.song?.title || 'the next stop'
        } : null}
      />
    ),
    settings: (
      <SettingsSurface
        downloadSettings={downloadsState.supported?<DownloadSettings state={downloadsState} controller={downloads}/>:null}
        onOpenListenBrainz={openListenBrainz}
        onOpenDownloads={downloadsState.supported?openDownloads:undefined}
        accountSession={accountSession}
        onReloadAccountPreferences={accountSession ? reloadAccountPreferences : undefined}
        health={health}
        navidrome={navidrome}
        onClearAudiomuse={clearAudiomuseSettings}
        onClearNavidrome={clearNavidromeSettings}
        onLoginAdmin={loginAdmin}
        onLogoutAdmin={logoutAdmin}
        onRefreshHealth={refreshHealth}
        onSaveAudiomuse={saveAudiomuseSettings}
        onSaveNavidrome={saveNavidromeSettings}
        onClearSettingsMessage={() => setSettingsMessage('')}
        onSavePreferences={savePreferences}
        onSignIn={signInWithPocketId}
        onSetupAdmin={setupAdmin}
        onSurfaceScroll={handleSurfaceScroll}
        onTestAudiomuse={testAudiomuseSettings}
        onTestNavidrome={testNavidromeSettings}
        playbackMessage={playbackMessage}
        settingsMessage={settingsMessage}
        settingsSession={settingsSession}
        settingsState={settingsState}
        transitionDiagnostic={transitionDiagnostic}
      />
    )
  };

  if (currentOnboardingMode !== 'app') {
    return (
      <OnboardingSurface
        message={settingsMessage}
        onLogin={loginAdmin}
        onRetry={() => refreshSession({ showLoading: true })}
        onSetup={setupAdmin}
        onSignIn={signInWithPocketId}
        session={{ ...settingsSession, resolved: sessionResolved, error: sessionLoadError }}
      />
    );
  }

  return (
    <AtlasJourneyContext.Provider value={atlasJourneyContextValue}>
    <AppShell
      onOpenSearch={()=>setSearchOpen(true)}
      searchSheet={searchOpen && !sessionLocked && !offline ? <SearchSheet onClose={()=>setSearchOpen(false)}>{surfaces.search}</SearchSheet> : null}
      offline={offline}
      outputPicker={<OutputPicker airplayActive={nativeOutput.airplay} open={outputOpen} onClose={()=>setOutputOpen(false)} state={wiimState} onRefresh={()=>wiim.discover()} onSpeakerVolume={(id,value)=>{if(wiim.state.session?.id===id)void wiim.command('volume',{volume:value});}} audio={audioRef.current}
        onChoose={async id=>{const session=wiim.state.session;const queue=session?.queue||playQueueRef.current;const ok=await wiim.transfer(id,queue,{...(session?.controls||playerControlsRef.current),autoplayAfterQueue:settingsRef.current.playback.autoplayAfterQueue,continueThroughQueue:settingsRef.current.playback.continueThroughQueue},session?.position??audioRef.current?.currentTime??0,{autoExtend:session?.queue?.journey?.autoExtend??journeyExtensionEnabled(settingsRef.current)});if(ok){setOutputOpen(false);void publishNativeRemotePlayer({scope:accountSession?.queueScope||queueScope,...wiim.state,userInitiated:true});}}}
        onLocal={async(options)=>{const previous=wiim.state.session;if(await (options?.disconnect?wiim.disconnect():wiim.release())){if(!options?.keepOpen)setOutputOpen(false);const session=localPlaybackSession(wiim.state.releasedSession||previous);dismissSonicRadio();if(session?.song){updatePlayerControls(session.controls);playTrack(session.song,null,{queueItems:session.queue.items,queueIndex:session.queue.index,queueSource:session.queue.source,startPaused:true,startPosition:session.position});restoreSonicQueueSession(session.queue);}else restoreSonicQueueSession(playQueueRef.current);return true;}return false;}}/>}
      expandedPlayerOpen={playerOpen}
      activeTab={activeTab}
      albumDetail={albumDetail ? <AlbumDetail key={albumDetail.id} album={albumDetail} onOpenArtist={openArtist} onDownloadSongs={downloadsState.supported?downloadSongs:undefined} onBack={closeAlbum} onPlayAlbum={playAlbum} onAddToQueue={addTrackToQueue} onPlayNext={playTrackNext} queueActionDisabledReason={queueActionDisabledReason}/> : artistDetail ? <LibraryCollectionDetail key={`${libraryKey}:${artistDetail.value}`} selection={artistDetail} libraryKey={libraryKey} onPlayAlbum={openAlbum} onPlaySong={(song,songs)=>playSongInQueue(song,null,songs)} onBack={closeArtist}/> : null}
      bindAudioDeck={bindAudioDeck}
      desktopQueuePanel={visibleQueue.items?.length ? (
        <DesktopQueuePanel
          canUndoQueueEdit={!remoteSession && canUndoQueueEdit}
          controls={visibleControls}
          onClearGenerated={clearGenerated}
          onClearPlayed={remoteSession ? ()=>remoteQueueEdit('clearPlayed') : clearPlayed}
          onClearUpcoming={remoteSession ? ()=>remoteQueueEdit('clearUpcoming') : clearUpcoming}
          onControlsChange={changePlayerControls}
          downloadState={queueDownloadState} onDownloadQueue={!offline && downloadsState.supported ? downloadQueue : undefined}
          onMoveQueueItem={remoteSession ? (index,direction)=>remoteQueueEdit('move',{index,direction}) : moveQueueItem}
          onQueueSelect={playQueueIndex}
          onRemoveQueueItem={remoteSession ? index=>remoteQueueEdit('remove',{index}) : removeQueueItem}
          onUndoQueueEdit={undoQueueEdit}
          queue={visibleQueue}
          shufflePoolCount={remoteSession ? remoteSession.poolCount : shufflePoolCount}
        />
      ) : null}
      miniPlayer={nowPlaying ? (
        <MiniPlayer
          externalOutput={nativeOutput.airplay} remoteOutput={Boolean(remoteSession)} outputLabel={remoteSession?.device?.name || (nativeOutput.airplay?'AirPlay':'This device')} onOpenOutput={()=>{setOutputOpen(true);}}
          paletteStyle={artworkPaletteStyle}
          controls={visibleControls}
          isPlaying={isPlaying}
          nowPlaying={nowPlaying}
          onNext={playNext}
          onOpen={openPlayer}
          onOpenQueue={openQueue}
          onPrevious={playPrevious}
          onSeek={seekPlayback}
          onToggle={togglePlayback}
          onControlsChange={changePlayerControls}
          onTrackFeedbackChange={updateNowPlayingFeedback}
          playbackState={playbackState}
          transportMessage={outputTransportMessage(wiimState, transportMessage)}
          transportStatus={remoteSession ? remoteSession.status==='playing'?'playing':remoteSession.status==='paused'?'paused':'restored' : transport.status}
          playHistoryCount={remoteSession ? remoteSession.historyCount : playHistoryCount}
          queue={visibleQueue}
          trackFeedback={activeTrackFeedback}
          volume={remoteSession?.volume != null ? remoteSession.volume/100 : volume}
          onVolumeChange={changeVolume}
        />
      ) : null}
      onTabSelect={tab => { closePlayer(); setArtistDetail(null); setAlbumDetail(null); setActiveTab(tab); }}
      phoneFrameClass={phoneFrameClass}
      playerSheet={(
        <PlayerSheet
          sleepTimer={sleepTimer}
          onOpenArtist={!offline && nowPlaying?.artistId && !String(nowPlaying.id).startsWith('radio:') ? ()=>openArtist({id:nowPlaying.artistId,name:nowPlaying.artist}) : undefined}
          onOpenAlbum={!offline && nowPlaying?.albumId && !String(nowPlaying.id).startsWith('radio:') ? ()=>{closePlayer();openAlbum({id:nowPlaying.albumId,title:nowPlaying.album,artist:nowPlaying.artist,artwork:nowPlaying.artwork});} : undefined}
          onDownloadTrack={!offline && downloadsState.supported && !String(nowPlaying?.id||'').startsWith('radio:')?downloadCurrentTrack:undefined}
          externalOutput={nativeOutput.airplay} remoteOutput={Boolean(remoteSession)} outputLabel={remoteSession?.device?.name || (nativeOutput.airplay?'AirPlay':'This device')} onOpenOutput={()=>{setOutputOpen(true);}}
          paletteStyle={artworkPaletteStyle}
          canUndoQueueEdit={!remoteSession && canUndoQueueEdit}
          health={health}
          isPlaying={isPlaying}
          nowPlaying={nowPlaying}
          notice={radioNotice || playerNotice}
          onClose={closePlayer}
          onSeek={seekPlayback}
          onNext={playNext}
          onPrevious={playPrevious}
          onQueueSelect={playQueueIndex}
          onClearGenerated={clearGenerated}
          onClearPlayed={remoteSession ? ()=>remoteQueueEdit('clearPlayed') : clearPlayed}
          onClearUpcoming={remoteSession ? ()=>remoteQueueEdit('clearUpcoming') : clearUpcoming}
          downloadState={queueDownloadState} onDownloadQueue={!offline && downloadsState.supported ? downloadQueue : undefined}
          onMoveQueueItem={remoteSession ? (index,direction)=>remoteQueueEdit('move',{index,direction}) : moveQueueItem}
          onRemoveQueueItem={remoteSession ? index=>remoteQueueEdit('remove',{index}) : removeQueueItem}
          onUndoQueueEdit={undoQueueEdit}
          onToggle={togglePlayback}
          controls={visibleControls}
          trackFeedback={activeTrackFeedback}
          onControlsChange={changePlayerControls}
          onShareTrack={shareTrack}
          onTrackFeedbackChange={updateNowPlayingFeedback}
          onAddToPlaylist={openPlaylistPicker}
          onPlayNext={playTrackNext}
          onAddToQueue={addTrackToQueue}
          queueActionDisabledReason={queueActionDisabledReason}
          onStartArtistDj={localOnly(startCurrentArtistDj)}
          onOpenJourneys={localOnly(openJourneyPicker)}
          onStartSonicRadio={localOnly(startCurrentTrackJourney)}
          onStopSonicRadio={stopRadio}
          onSaveSonicRadio={saveCurrentSonicRadio}
          onDismissSonicRadio={dismissSonicRadio}
          atlasJourneyActive={atlasJourneyState.status === 'active' && atlasJourneyState.queueAttached}
          onDislikeAtlasJourney={dislikeAtlasJourneyStop}
          sonicSavePending={sonicSavePending}
          onUnavailable={notifyUnavailable}
          open={playerOpen}
          playbackState={playbackState}
          transportMessage={outputTransportMessage(wiimState, transportMessage)}
          transportStatus={remoteSession ? remoteSession.status==='playing'?'playing':remoteSession.status==='paused'?'paused':'restored' : transport.status}
          playHistoryCount={remoteSession ? remoteSession.historyCount : playHistoryCount}
          queue={visibleQueue}
          queueEntryRef={queueEntryRef}
          shufflePoolCount={remoteSession ? remoteSession.poolCount : shufflePoolCount}
          waveformState={waveformState}
          lyricsState={lyricsState}
          onRetryLyrics={() => retryLyrics(n => n + 1)}
          sonicRadioActive={isRadioActive}
          sonicRadioState={{...radioState,autoExtend:journeyExtensionEnabled(settingsState.preferences)}}
        />
      )}
      playlistPicker={(
        <PlaylistPicker
          busy={playlistPicker.busy}
          error={playlistPicker.error}
          loading={playlistPicker.loading}
          onAdd={addCurrentTrackToPlaylist}
          onClose={closePlaylistPicker}
          onCreate={createPlaylistWithCurrentTrack}
          open={playlistPicker.open}
          playlists={playlistPicker.items}
          trackTitle={nowPlaying?.title}
        />
      )}
      sessionLocked={sessionLocked}
      surfaces={surfaces}
    />
    <JourneyPicker seed={journeySeed} onClose={()=>setJourneySeed(null)} onChoose={localOnly(chooseJourney)} autoExtend={journeyExtensionEnabled(settingsState.preferences)}/>
    </AtlasJourneyContext.Provider>
  );
}

function LiveSummary({ health, navidrome }) {
  if (navidrome.loading) {
    return <p className="live-summary">Loading Navidrome library...</p>;
  }

  if (navidrome.error) {
    return <p className="live-summary warning">{navidrome.error}</p>;
  }

  const navidromeHealth = health?.services?.navidrome;
  const audiomuse = health?.services?.audiomuse;

  return (
    <p className="live-summary">
      {navidromeHealth?.ok ? 'Navidrome online' : 'Navidrome unavailable'} · {audiomuse?.ok ? 'AudioMuse online' : 'AudioMuse unavailable'}
    </p>
  );
}

function normalizeSong(song, album, libraryName, artworkSize = defaultAppSettings.library.artworkSize, streaming = defaultAppSettings.streaming) {
  const duration = Number(song.duration || 0);
  const streamPreference = streamRequestPreference(streaming);
  return {
    id: String(song.id || ''),
    title: song.title || 'Untitled Track',
    artist: song.artist || album?.artist || 'Unknown Artist',
    artistId: song.artistId || song.albumArtistId || album?.artistId || album?.albumArtistId || '',
    albumId: song.albumId || album?.id || song.parent || '',
    album: song.album || album?.name || album?.title || 'Unknown Album',
    artwork: coverArtUrl(album?.coverArt || song.coverArt, artworkSize) || fallbackArtwork,
    elapsed: '0:00',
    remaining: duration ? `-${formatDuration(duration)}` : '-0:00',
    format: (song.suffix || song.contentType?.split('/').pop() || (song.streamUrl ? 'Radio' : 'Audio')).toUpperCase(),
    sourceSignal: sourceSignalSummary(song),
    streamRequest: requestedStreamSummary(streamPreference, Boolean(song.streamUrl)),
    source: song.source || libraryName || 'Navidrome',
    mood: 'Library',
    tempo: song.year ? String(song.year) : 'Navidrome',
    key: song.genre || 'Tagged',
    atlasOwned: song.atlasOwned === true
  };
}

function streamUrl(songId, streaming = defaultAppSettings.streaming) {
  return streamPath(songId, streamRequestPreference(streaming));
}

function randomItem(items = []) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

const streamRequestPreference = chooseStreamPreference;

function loadTrackFeedback(storage) {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse((storage === undefined ? window.localStorage : storage).getItem(trackFeedbackStorageKey) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return pruneTrackFeedback(parsed, maxTrackFeedbackEntries);
  } catch {
    return {};
  }
}

function loadVolume(storage) {
  try {
    const rawVolume = (storage === undefined ? window.localStorage : storage).getItem(volumeStorageKey);
    if (rawVolume === null) return 1;
    const stored = Number(rawVolume);
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 1;
  } catch {
    return 1;
  }
}

function saveVolume(volume, storage) {
  try {
    (storage === undefined ? window.localStorage : storage).setItem(volumeStorageKey, String(volume));
  } catch {
    // Playback remains functional when browser storage is unavailable.
  }
}

function saveTrackFeedback(feedback, storage) {
  if (typeof window === 'undefined') return true;
  try {
    (storage === undefined ? window.localStorage : storage).setItem(trackFeedbackStorageKey, JSON.stringify(pruneTrackFeedback(feedback, maxTrackFeedbackEntries)));
    return true;
  } catch {
    // Browser storage may be unavailable in private mode.
    return false;
  }
}

function canSyncTrackFeedback(songId) {
  const id = String(songId || '');
  return Boolean(id) && !id.startsWith('mock-');
}

async function syncTrackFeedback(songId, feedback, signal) {
  const payload = await (songId.startsWith('radio:') ? saveRadioFeedback : navidromeFeedback)(songId, feedback, { signal });
  return payload.feedback;
}

function copyTextFallback(text) {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.append(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy copy path.
    }
  }
  return copyTextFallback(text);
}

function mergeSettings(payload = {}) {
  const rawPlayback = payload.preferences?.playback || {};
  const continuation = normalizeContinuationPreferences(rawPlayback);
  const transition = normalizeTransitionPreferences(rawPlayback);
  const { continuousQueue: _legacyContinuousQueue, gapless: _legacyGapless, ...playback } = rawPlayback;
  return {
    preferences: {
      appearance: {...defaultAppSettings.appearance,...(payload.preferences?.appearance||{})},
      streaming: { ...defaultAppSettings.streaming, ...(payload.preferences?.streaming || {}) },
      playback: {
        ...defaultAppSettings.playback,
        ...playback,
        ...continuation,
        ...transition
      },
      discovery: { ...defaultAppSettings.discovery, ...(payload.preferences?.discovery || {}) },
      library: { ...defaultAppSettings.library, ...(payload.preferences?.library || {}) }
    },
    services: {
      navidrome: { ...defaultSettingsState.services.navidrome, ...(payload.services?.navidrome || {}) },
      audiomuse: { ...defaultSettingsState.services.audiomuse, ...(payload.services?.audiomuse || {}) }
    },
    security: { ...defaultSettingsState.security, ...(payload.security || {}) }
  };
}

if (nativeFirstPartyRedirect) {
  // Do not mount the application on the packaged `tauri:` document. Mounting
  // starts the session request while WebKit is still navigating to the BFF,
  // which can race the first-party redirect and flash a false offline state.
  window.location.replace(nativeFirstPartyRedirect);
} else {
  const applicationRoot = createRoot(document.getElementById('root'));
  if (audioEvidenceMode) {
    import('./AudioEngineEvidenceHarness.jsx').then(({ AudioEngineEvidenceHarness }) => {
      applicationRoot.render(<AudioEngineEvidenceHarness />);
    }).catch(error => {
      applicationRoot.render(<main style={{ padding: 32, color: '#fff', background: '#080b11' }}><h1>Audio evidence harness failed</h1><pre>{String(error?.stack || error)}</pre></main>);
    });
  } else {
    applicationRoot.render(<ApplicationBoundary><AccountApplication renderPlayer={props => <App {...props} />} /></ApplicationBoundary>);
  }

  if (import.meta.env.PROD && !audioEvidenceMode && 'serviceWorker' in navigator) {
    const registerShell = () => {
      navigator.serviceWorker.register('/sw-v4.js', { updateViaCache: 'none' }).catch(() => {});
    };
    if(document.readyState==='complete')registerShell();
    else window.addEventListener('load',registerShell,{once:true});
  }
}
