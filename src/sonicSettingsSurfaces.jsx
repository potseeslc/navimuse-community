import {nativeAudioTransport} from './nativeAudio.js';
import {HlsPilotSettings} from './HlsPilotSettings.jsx';
import {PersonalizedMix} from './PersonalizedMix.jsx';
import {accentColors} from '../shared/appearance.js';
import { hasMobileNetwork, deviceStreaming, deviceStreamFormatOptions } from './mobileStreaming.js';
import { InternetRadio } from './InternetRadio.jsx';
import { MediaSessionDiagnostics } from './MediaSessionDiagnostics.jsx';
import { usesDirectMediaAudio } from './audioPlatform.js';
import {OwnerAccounts} from './OwnerAccounts.jsx';
import {AccountPasskeys} from './AccountPasskeys.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Activity, Disc3, FileSearch, KeyRound, Library, List, Lock, MapPinned, Palette, Play, Radio, RefreshCcw, Save, Server, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserRound, Waves } from 'lucide-react';
import { flattenStats, isCurrentDiscoveryRequest, isSomaFmStation, radioActionKind, radioCards } from './discovery.js';
import { radioStationSong, shuffled } from './discoveryPlayback.js';
import { audiomuseClapStats } from './services/audiomuseService.js';
import { navidromeArtists, navidromeGenres, navidromePlaylistDetail, navidromeRadios, navidromeSearch } from './services/navidromeService.js';
import { formatDuration } from './playerChrome.jsx';
import { Artwork, ScreenHeader, SectionHeader, coverArtUrl } from './surfaceUi.jsx';
import { defaultAppSettings, defaultSettingsState } from './appSettings.js';
import { refreshPreferenceDraft } from './preferenceDraft.js';
import { continuationCapabilities, transitionStyles } from '../shared/playbackPreferences.js';
import { SonicStudio } from './SonicStudio.jsx';
import { AtlasOverview } from './AtlasOverview.jsx';
import { TrackQueueActions } from './TrackQueueActions.jsx';

const settingsSections = [
  ['playback', 'Playback', SlidersHorizontal],
  ['appearance', 'Appearance', Palette],
  ['library', 'Library', Library],
  ['account', 'Account', UserRound],
  ['system', 'Connections & status', Server]
];


export function DiscoveryResults({
  loading,
  onClose,
  onOpenPlaylist,
  onOpenSeed,
  onAddToQueue,
  onPlayAlbum,
  onPlaySong,
  onPlayNext,
  onStartArtistDj,
  onStartArtistJourney,
  onStartGenreJourney,
  panel,
  queueActionDisabledReason,
  settings
}) {
  const backRef = useRef(null);
  useEffect(() => {
    // A retry replaces its button with loading content. Restore a reachable anchor
    // only if focus was lost, without pulling it away from the player or planner.
    if (document.activeElement === document.body) backRef.current?.focus();
  }, [panel?.type]);
  if (!panel) return null;

  const artworkSize = settings?.library?.artworkSize;
  const items = panel.items || [];
  const title = loading ? 'Loading...' : panel.title;

  return (
    <section className="discovery-results" aria-label="Discovery results" aria-busy={loading} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}>
      <header>
        <div>
          <p>Discovery Results</p>
          <h2 aria-live="polite">{title}</h2>
        </div>
        <button ref={backRef} type="button" onClick={onClose}>Back to discovery</button>
      </header>
      {panel.message && !['message', 'error'].includes(panel.type) && <p className="discovery-message">{panel.message}</p>}

      {panel.type === 'loading' && <p className="empty-state">{panel.message || 'Loading discovery results...'}</p>}
      {panel.type === 'message' && <p className="empty-state">{panel.message}</p>}
      {panel.type === 'error' && <div className="discovery-error" role="alert">
        <p>{panel.message}</p>
        {panel.retry && <button type="button" onClick={panel.retry}>Try again</button>}
      </div>}

      {panel.type === 'songs' && (
        <div className="result-list discovery-result-list">
          {items.map((song) => (
            <article className="actionable-result-row" key={song.id}>
              <button type="button" onClick={() => onPlaySong(song, panel.album, items)}>
                <Artwork item={{ ...song, artwork: coverArtUrl(song.coverArt || panel.album?.coverArt, artworkSize) }} className="small-cover" />
                <div>
                  <h3>{song.title || 'Untitled Track'}</h3>
                  <p>{song.artist || panel.album?.artist || 'Unknown Artist'} · {song.duration ? formatDuration(song.duration) : 'Song'}</p>
                </div>
              </button>
              <TrackQueueActions disabledReason={queueActionDisabledReason} song={song} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} />
            </article>
          ))}
          {!items.length && <p className="empty-state">No playable tracks were returned.</p>}
        </div>
      )}

      {panel.type === 'playlists' && (
        <div className="result-list discovery-result-list">
          {items.map((playlist) => (
            <button key={playlist.id || playlist.name} type="button" onClick={() => onOpenPlaylist(playlist)}>
              <span className="small-cover artwork-shell browse-glyph"><List size={24} /></span>
              <div>
                <h3>{playlist.name || 'Untitled Playlist'}</h3>
                <p>Playlist · {playlist.songCount || 0} songs</p>
              </div>
            </button>
          ))}
          {!items.length && <p className="empty-state">No playlists were returned.</p>}
        </div>
      )}

      {panel.type === 'genres' && (
        <div className="result-list discovery-result-list">
          {items.slice(0, 20).map((genre) => (
            <button
              key={genre.value || genre.name}
              type="button"
              onClick={() => {
                onClose?.();
                onStartGenreJourney?.(genre, `${genre.value || genre.name} Journey`);
              }}
            >
              <span className="small-cover artwork-shell browse-glyph"><List size={24} /></span>
              <div>
                <h3>{genre.value || genre.name || 'Unknown Genre'}</h3>
                <p>Genre · {genre.songCount || 0} songs</p>
              </div>
            </button>
          ))}
          {!items.length && <p className="empty-state">No genres were returned.</p>}
        </div>
      )}

      {panel.type === 'artists' && (
        <div className="result-list discovery-result-list">
          {items.map((artist) => (
            <article className="discovery-artist-actions" key={artist.id || artist.name}>
              <span className="small-cover artwork-shell browse-glyph"><Disc3 size={24} /></span>
              <div>
                <h3>{artist.name || 'Unknown Artist'}</h3>
                <p>Artist · {artist.albumCount || 0} albums</p>
              </div>
              <button type="button" aria-label={`Start ${artist.name || 'artist'} Journey`} disabled={!artist.id} onClick={() => {
                onClose?.();
                onStartArtistJourney?.(artist, `${artist.name || 'Artist'} Journey`);
              }}>Journey</button>
              <button type="button" aria-label={`Start ${artist.name || 'artist'} Artist DJ`} disabled={!artist.id} onClick={() => {
                onClose?.();
                onStartArtistDj?.(artist, `${artist.name || 'Artist'} Artist DJ`);
              }}>Artist DJ</button>
            </article>
          ))}
          {!items.length && <p className="empty-state">No artist seeds were returned.</p>}
        </div>
      )}

      {panel.type === 'audiomuse' && (
        <div className="audiomuse-status-card">

          <dl>
            {Object.entries(flattenStats(panel.stats)).slice(0, 6).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

export function SonicSurface({
  personalizedMix,
  atlasRendererActive = true,
  onAddToQueue,
  currentAtlasPointId,
  isPlaying,
  libraryKey,
  nowPlaying,
  onNext,
  onOpenQueue,
  onPlaySong,
  onPlayRadio,
  radioOutputName,
  onPlayNext,
  onPrevious,
  onStartArtistDj,
  onStartArtistJourney,
  onStartGenreJourney,
  onStartTrackJourney,
  onSurfaceScroll,
  onTogglePlayback,
  playbackMessage,
  playQueue,
  playHistoryQueueItemIds,
  queueActionDisabledReason,
  settings,
  transition
}) {
  const [panel, setPanel] = useState(null);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState({ radios: null, audiomuse: null });
  const [mapOpen, setMapOpen] = useState(false);
  const surfaceRef = useRef(null);
  const returnActionRef = useRef(null);
  const retryRef = useRef(null);
  const hadPanelRef = useRef(false);
  const requestRef = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setPanel(null);
    setSummary({ radios: null, audiomuse: null });
  }, [libraryKey]);

  useEffect(() => () => {
    requestRef.current += 1;
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (hadPanelRef.current && !panel) {
      const target = [...(surfaceRef.current?.querySelectorAll('[data-discovery-action]') || [])]
        .find((node) => node.dataset.discoveryAction === returnActionRef.current);
      target?.focus();
    }
    hadPanelRef.current = Boolean(panel);
  }, [Boolean(panel)]);

  const beginRequest = (title, message, retry) => {
    retryRef.current = retry;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setSummary({ radios: null, audiomuse: null });
    setPanel({ title, type: 'loading', message });
    return { requestId, signal: abortRef.current.signal };
  };

  const current = (requestId) => isCurrentDiscoveryRequest(requestRef.current, requestId);

  const finishRequest = (requestId) => {
    if (current(requestId)) setLoading(false);
  };

  const showError = (title, error, requestId) => {
    setPanelForRequest(requestId, { title, type: 'error', message: error.message || String(error), retry: retryRef.current });
  };

  const setPanelForRequest = (requestId, nextPanel) => {
    if (!current(requestId)) return false;
    setPanel(nextPanel);
    return true;
  };

  const setSummaryForRequest = (requestId, updater) => {
    if (!current(requestId)) return false;
    setSummary(updater);
    return true;
  };

  const openPlaylist = async (playlist, fallbackTitle = 'Smart Playlist') => {
    const request = beginRequest(playlist.name || fallbackTitle, 'Loading playlist tracks...', () => openPlaylist(playlist, fallbackTitle));
    if (!playlist.id) {
      setPanelForRequest(request.requestId, { title: playlist.name || fallbackTitle, type: 'message', message: 'That playlist does not have a Navidrome ID.' });
      finishRequest(request.requestId);
      return;
    }

    try {
      const detail = await navidromePlaylistDetail(playlist.id, { signal: request.signal });
      setPanelForRequest(request.requestId, {
        title: detail.playlist?.name || playlist.name || fallbackTitle,
        type: 'songs',
        message: `${detail.playlist?.songCount || detail.playlist?.entry?.length || 0} tracks from Navidrome`,
        items: detail.playlist?.entry || [],
        album: { title: playlist.name || fallbackTitle, artist: 'Smart Playlist', coverArt: playlist.coverArt }
      });
    } catch (error) {
      showError(playlist.name || fallbackTitle, error, request.requestId);
    } finally {
      finishRequest(request.requestId);
    }
  };

  const openSeedSearch = async (title, query) => {
    const request = beginRequest(title, `Finding tracks for ${query}...`, () => openSeedSearch(title, query));
    try {
      const payload = await navidromeSearch(query, libraryKey, { signal: request.signal });
      if (!current(request.requestId)) return;
      playRadioSongs(title, query, payload.songs || []);
    } catch (error) {
      showError(title, error, request.requestId);
    } finally {
      finishRequest(request.requestId);
    }
  };

  const playRadioSongs = (title, seedQuery, songs) => {
    const queueSongs = shuffled(songs.filter((song) => song?.id));
    if (!queueSongs.length) {
      setPanel({ title, type: 'message', message: `No playable radio tracks were returned for ${seedQuery}.` });
      return;
    }
    onPlaySong(queueSongs[0], { title, artist: seedQuery || 'Radio' }, queueSongs);
    setPanel({
      title,
      type: 'message',
      message: `Playing ${queueSongs.length} tracks from ${seedQuery || 'this radio seed'}.`
    });
  };

  const playRadioStations = (stations, title = 'Internet Radio') => {
    const queueSongs = stations.map(radioStationSong).filter(Boolean);
    if (!queueSongs.length) {
      setPanel({ title, type: 'message', message: 'No playable internet radio stations were returned.' });
      return;
    }
    onPlaySong(queueSongs[0], { title, artist: 'Internet Radio' }, queueSongs);
    setPanel({
      title,
      type: 'message',
      message: `Playing ${queueSongs.length} internet radio stations through NaviMuse.`
    });
  };

  const openRadio = async (label) => {
    const request = beginRequest(label, 'Loading Sonic radio seeds...', () => openRadio(label));
    try {
      const kind = radioActionKind(label);
      if (kind === 'soma') {
        const payload = await navidromeRadios({ signal: request.signal });
        if (!current(request.requestId)) return;
        const somaStations = (payload.radios || []).filter(isSomaFmStation);
        setSummaryForRequest(request.requestId, (currentSummary) => ({ ...currentSummary, radios: somaStations.length }));
        if (!somaStations.length) {
          setPanelForRequest(request.requestId, {
            title: 'SOMA FM',
            type: 'message',
            message: 'No SOMA FM stations found in your Navidrome library.'
          });
          return;
        }
        playRadioStations(somaStations, 'SOMA FM');
        return;
      }

      if (kind === 'genre') {
        const payload = await navidromeGenres(libraryKey, { signal: request.signal });
        setPanelForRequest(request.requestId, { title: 'Genre Journey', type: 'genres', message: 'Choose a genre to begin a Journey.', items: payload.genres || [] });
        return;
      }

      if (kind === 'artist') {
        const payload = await navidromeArtists(libraryKey, { signal: request.signal });
        if (!current(request.requestId)) return;
        setPanelForRequest(request.requestId, {
          title: 'Artist Journey',
          type: 'artists',
          message: 'Choose a Journey for related discovery or Artist DJ for this artist only.',
          items: payload.artists || []
        });
        return;
      }

      if (kind === 'unknown') {
        setPanelForRequest(request.requestId, { title: label, type: 'message', message: 'Choose an Artist, Genre, or Track Journey, or SOMA FM.' });
        return;
      }

      if (kind === 'song') {
        setPanelForRequest(request.requestId, null);
        onStartTrackJourney?.();
        return;
      }
    } catch (error) {
      showError(label, error, request.requestId);
    } finally {
      finishRequest(request.requestId);
    }
  };

  const openAudioMuseStatus = async () => {
    const request = beginRequest('AudioMuse status', 'Checking AudioMuse analysis status...', openAudioMuseStatus);
    try {
      const payload = await audiomuseClapStats({ signal: request.signal });
      setSummaryForRequest(request.requestId, (currentSummary) => ({ ...currentSummary, audiomuse: 'online' }));
      setPanelForRequest(request.requestId, {
        title: 'AudioMuse status',
        type: 'audiomuse',
        message: 'AudioMuse is reachable. Analysis details reported by the service are shown below.',
        stats: payload
      });
    } catch (error) {
      if (error.name === 'AbortError') return;
      const requestStillCurrent = current(request.requestId);
      if (requestStillCurrent) {
        setSummaryForRequest(request.requestId, (currentSummary) => ({ ...currentSummary, audiomuse: 'unavailable' }));
        showError('AudioMuse status', error, request.requestId);
      }
    } finally {
      finishRequest(request.requestId);
    }
  };

  const closePanel = () => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setPanel(null);
    setSummary({ radios: null, audiomuse: null });
  };


  return (<>
      {mapOpen && <section className="screen-surface sonic-journey-surface" aria-label="Library map" onScroll={onSurfaceScroll}>
    <AtlasOverview key={libraryKey} libraryOnly rendererActive={atlasRendererActive} onOpenJourneyTools={() => setMapOpen(false)}/>
  </section>}

    <section key="sonic-tools" hidden={mapOpen} style={mapOpen ? {display:'none'} : undefined} ref={surfaceRef} className="screen-surface sonic-discovery-surface" aria-label="Sonic analysis" onScroll={onSurfaceScroll}
      onClickCapture={(event) => {
        const action = event.target.closest('[data-discovery-action]');
        if (action) returnActionRef.current = action.dataset.discoveryAction;
      }}>
      <header className="sonic-discovery-heading">
        <h1>Sonic</h1>
        <p>Find something familiar. Follow it somewhere new.</p>
      </header>
      {playbackMessage && <p className="inline-warning">{playbackMessage}</p>}

      <div hidden={Boolean(panel)}><PersonalizedMix model={personalizedMix} onPlaySong={onPlaySong}/><SonicStudio key={libraryKey} libraryKey={libraryKey} onPlaySong={onPlaySong} onAddToQueue={onAddToQueue} onPlayNext={onPlayNext} queueActionDisabledReason={queueActionDisabledReason}/></div>
      <button className="sonic-library-map-link" type="button" onClick={() => setMapOpen(true)}><MapPinned size={20}/><span><strong>Explore your library map</strong><small>A visual view of the sounds in your analyzed library</small></span><span aria-hidden="true">→</span></button>

      <div className="discovery-slot">
        {panel ? (
          <DiscoveryResults
            loading={loading}
            onAddToQueue={onAddToQueue}
            onClose={closePanel}
            onOpenPlaylist={openPlaylist}
            onOpenSeed={openSeedSearch}
            onPlaySong={onPlaySong}
            onPlayNext={onPlayNext}
            onStartArtistDj={onStartArtistDj}
            onStartArtistJourney={onStartArtistJourney}
            onStartGenreJourney={onStartGenreJourney}
            panel={panel}
            queueActionDisabledReason={queueActionDisabledReason}
            settings={settings}
          />
        ) : (
          <>
            <InternetRadio onPlaySong={onPlayRadio || onPlaySong} remoteOutputName={radioOutputName} />
            <SectionHeader title="Journeys" />
            <div className="radio-grid">
              {radioCards.filter(label => radioActionKind(label) !== 'soma').map((radioLabel) => (
                <button
                  key={radioLabel}
                  data-discovery-action={radioLabel}
                  type="button"
                  disabled={radioActionKind(radioLabel) === 'song' && !nowPlaying?.id}
                  title={radioActionKind(radioLabel) === 'song' && !nowPlaying?.id ? 'Play a track before starting a Track Journey' : undefined}
                  onClick={() => openRadio(radioLabel)}
                >
                  <Radio size={20} />
                  <span>{radioLabel}</span>
                </button>
              ))}
            </div>



            {(summary.radios !== null || summary.audiomuse) && (
              <p className="discovery-message">
                {summary.radios !== null ? `${summary.radios} internet radio stations available. ` : ''}
                {summary.audiomuse ? `AudioMuse ${summary.audiomuse}.` : ''}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  </>);
}

export function SettingsSurface({
  onOpenListenBrainz,
  onOpenDownloads, downloadSettings,
  accountSession,
  onReloadAccountPreferences,
  health,
  navidrome,
  onClearSettingsMessage,
  onClearAudiomuse,
  onClearNavidrome,
  onLoginAdmin,
  onLogoutAdmin,
  onRefreshHealth,
  onSaveAudiomuse,
  onSaveNavidrome,
  onSavePreferences,
  onSignIn,
  onSetupAdmin,
  onSurfaceScroll,
  onTestAudiomuse,
  onTestNavidrome,
  playbackMessage,
  settingsMessage,
  settingsSession,
  settingsState,
  transitionDiagnostic
}) {
  const localOwner = Boolean(accountSession?.account.roles.includes('owner'));
  const preferences = React.useMemo(() => {
    const saved = settingsState.preferences || defaultAppSettings;
    return hasMobileNetwork() ? { ...saved, streaming: deviceStreaming(saved.streaming) } : saved;
  }, [settingsState.preferences]);
  const navidromeService = settingsState.services?.navidrome || defaultSettingsState.services.navidrome;
  const audiomuseService = settingsState.services?.audiomuse || defaultSettingsState.services.audiomuse;
  const managedConnections = settingsState.security?.canManageServices === false || navidromeService.managed === true || (settingsSession.authMode === 'oidc' && settingsState.security?.canManageServices !== true);
  const [adminPassword, setAdminPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [navidromeForm, setNavidromeForm] = useState({
    url: navidromeService.url,
    username: navidromeService.username,
    password: ''
  });
  const [audiomuseForm, setAudiomuseForm] = useState({
    url: audiomuseService.url,
    token: ''
  });
  const [draftPreferences, setDraftPreferences] = useState(preferences);
  const [busyAction, setBusyAction] = useState('');
  const preferenceSaveRef = useRef(false);
  const previousPreferencesRef = useRef(preferences);
  const [preferenceSaveError, setPreferenceSaveError] = useState('');
  const hasUnsavedPreferences = JSON.stringify(draftPreferences) !== JSON.stringify(preferences);
  const [activeSection, setActiveSection] = useState('playback');
  const settingsSurfaceRef = useRef(null);
  const settingsHeadingRef = useRef(null);
  useEffect(() => {
    if (accountSession && !localOwner && activeSection === 'system') {
      setActiveSection('account');
      settingsHeadingRef.current?.focus();
    }
  }, [accountSession, localOwner, activeSection]);

  const selectSettingsSection = (key) => {
    setActiveSection(key);
    const surface = settingsSurfaceRef.current;
    if (!surface) return;
    surface.scrollTop = 0;
    surface.scrollLeft = 0;
    onSurfaceScroll?.({ target: surface });
  };

  useEffect(() => {
    setNavidromeForm((current) => ({
      url: navidromeService.url || current.url,
      username: navidromeService.username || current.username,
      password: ''
    }));
  }, [navidromeService.url, navidromeService.username]);

  useEffect(() => {
    setAudiomuseForm((current) => ({
      url: audiomuseService.url || current.url,
      token: ''
    }));
  }, [audiomuseService.url]);

  useEffect(() => {
    if (preferenceSaveRef.current) return;
    const previous = previousPreferencesRef.current;
    setDraftPreferences((draft) => refreshPreferenceDraft(previous, draft, preferences));
    previousPreferencesRef.current = preferences;
  }, [preferences, busyAction]);

  const locked = settingsSession.adminConfigured && !settingsSession.authenticated;
  const oidcMode = settingsSession.authMode === 'oidc';
  const preferenceControlsLocked = locked || busyAction === 'preferences';

  const savePreferenceDraft = async () => {
    if (preferenceSaveRef.current || locked || !hasUnsavedPreferences) return;
    preferenceSaveRef.current = true;
    onClearSettingsMessage?.();
    setPreferenceSaveError('');
    setBusyAction('preferences');
    let savedSuccessfully = false;
    try {
      const saved = await onSavePreferences(draftPreferences);
      if (!saved) {
        setPreferenceSaveError('Changes were not saved. Try again or discard your draft.');
      } else {
        savedSuccessfully = true;
        // The parent returns the canonical preferences after updating its saved state.
        setDraftPreferences(hasMobileNetwork() ? { ...saved, streaming: deviceStreaming(saved.streaming) } : saved);
        previousPreferencesRef.current = saved;
      }
    } catch (error) {
      setPreferenceSaveError(error.message || 'Changes were not saved. Try again.');
    } finally {
      preferenceSaveRef.current = false;
      setBusyAction('');
      const focusWillDisappear = savedSuccessfully && settingsSurfaceRef.current?.querySelector('.settings-save-dock')?.contains(document.activeElement);
      if ((focusWillDisappear || document.activeElement === document.body) && settingsHeadingRef.current?.getClientRects().length) settingsHeadingRef.current.focus({ preventScroll: true });
    }
  };

  const setupOrLogin = async () => {
    if (oidcMode) {
      onSignIn();
      return;
    }
    setBusyAction('admin');
    try {
      const ok = settingsSession.adminConfigured
        ? await onLoginAdmin(adminPassword)
        : await onSetupAdmin(adminPassword, setupToken);
      if (ok) {
        setAdminPassword('');
        setSetupToken('');
      }
    } finally {
      setBusyAction('');
    }
  };

  const testNavidrome = async () => {
    setBusyAction('testNavidrome');
    try {
      await onTestNavidrome(navidromeForm);
    } finally {
      setBusyAction('');
    }
  };

  const saveNavidrome = async () => {
    setBusyAction('saveNavidrome');
    try {
      const ok = await onSaveNavidrome(navidromeForm);
      if (ok) setNavidromeForm((current) => ({ ...current, password: '' }));
    } finally {
      setBusyAction('');
    }
  };

  const clearNavidrome = async () => {
    const confirmed = window.confirm('Clear saved Navidrome credentials from NaviMuse?');
    if (!confirmed) return;
    setBusyAction('clearNavidrome');
    try {
      await onClearNavidrome();
    } finally {
      setBusyAction('');
    }
  };

  const testAudiomuse = async () => {
    setBusyAction('testAudiomuse');
    try {
      await onTestAudiomuse(audiomuseForm);
    } finally {
      setBusyAction('');
    }
  };

  const saveAudiomuse = async () => {
    setBusyAction('saveAudiomuse');
    try {
      const ok = await onSaveAudiomuse(audiomuseForm);
      if (ok) setAudiomuseForm((current) => ({ ...current, token: '' }));
    } finally {
      setBusyAction('');
    }
  };

  const clearAudiomuse = async () => {
    const confirmed = window.confirm('Clear saved AudioMuse settings from NaviMuse?');
    if (!confirmed) return;
    setBusyAction('clearAudiomuse');
    try {
      await onClearAudiomuse();
    } finally {
      setBusyAction('');
    }
  };

  const updatePreference = (path, value) => {
    if (preferenceSaveRef.current) return;
    onClearSettingsMessage?.();
    setPreferenceSaveError('');
    setDraftPreferences((current) => setDeepValue(current, path, value));
  };
  const accountPanel = accountSession ? (
    <SettingsPanel title="Sign-in & security" summary={`Signed in as ${accountSession.account.displayName}`}>
      {accountSession.methods.passkey&&<AccountPasskeys key={accountSession.account.id} accountId={accountSession.account.id} onReauthenticate={onLogoutAdmin}/>}
      <button type="button" onClick={onLogoutAdmin}>Sign out</button>
      <p>{localOwner ? 'View account music access in Services.' : 'Music access is managed by the owner.'}</p>
    </SettingsPanel>
  ) : (
    <SettingsPanel
      title={oidcMode ? 'Pocket ID' : (settingsSession.adminConfigured ? 'Settings Lock' : 'Secure Settings')}
      icon={settingsSession.authenticated ? <ShieldCheck size={18} /> : <Lock size={18} />}
      summary={oidcMode
        ? (settingsSession.authenticated ? `Signed in as ${settingsSession.user?.name || 'Pocket ID user'}.` : 'Sign in with your Pocket ID passkey to access NaviMuse.')
        : (settingsSession.adminConfigured ? (settingsSession.authenticated ? 'Unlocked for this browser session.' : 'Unlock to change saved service credentials and preferences.') : 'Create a NaviMuse admin password before saving settings.')}
    >
      {!oidcMode && !settingsSession.adminConfigured && (
        <label className="settings-field">
          <span>Setup Token</span>
          <input autoComplete="one-time-code" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} placeholder="From Docker logs or the setup token file" />
        </label>
      )}
      {!oidcMode && <label className="settings-field">
        <span>{settingsSession.adminConfigured ? 'Admin Password' : 'New Admin Password'}</span>
        <input autoComplete={settingsSession.adminConfigured ? 'current-password' : 'new-password'} disabled={settingsSession.authenticated} minLength={12} type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="At least 12 characters" />
      </label>}
      <div className="settings-actions">
        {settingsSession.authenticated ? (
          <button type="button" onClick={onLogoutAdmin}><Lock size={17} /> {oidcMode ? 'Sign Out' : 'Lock Settings'}</button>
        ) : (
          <button type="button" disabled={busyAction === 'admin'} onClick={setupOrLogin}><KeyRound size={17} /> {oidcMode ? 'Sign In with Pocket ID' : (settingsSession.adminConfigured ? 'Unlock' : 'Create Admin')}</button>
        )}
      </div>
    </SettingsPanel>
  );

  if (locked) {
    return (
      <section className="screen-surface settings-surface" aria-label="Settings" onScroll={onSurfaceScroll}>
        <header className="settings-page-heading"><h1>Settings</h1></header>
        <div className="settings-workspace settings-locked-workspace">
          <div className="settings-workspace-content">
            <div className="settings-workspace-heading"><div><p>Protected</p><h2>Account</h2></div></div>
            {settingsMessage && <p className="settings-warning" role="status">{settingsMessage}</p>}
            {accountPanel}
          </div>
        </div>
      </section>
    );
  }

  const showsPreferenceSave = ['playback', 'appearance', 'library'].includes(activeSection);
  return (
    <section ref={settingsSurfaceRef} className="screen-surface settings-surface" aria-label="Settings" onScroll={onSurfaceScroll}>
      <header className="settings-page-heading"><h1>Settings</h1></header>
      <div className="settings-workspace">
        <nav className="settings-section-nav" aria-label="Settings sections">
          {settingsSections.map(([key, label, Icon]) => (
            <button aria-current={activeSection === key ? 'page' : undefined} className={activeSection === key ? 'active' : ''} disabled={Boolean(busyAction)} key={key} onClick={() => selectSettingsSection(key)} type="button">
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-workspace-content">
          <div className="settings-workspace-heading">
            <div><p>{showsPreferenceSave ? 'Listening preferences' : managedConnections ? 'Your account' : 'Account & administration'}</p><h2 ref={settingsHeadingRef} tabIndex={-1}>{settingsSections.find(([key]) => key === activeSection)?.[1]}</h2></div>

          </div>
          <div className="settings-status" aria-live="polite">
            {accountSession && showsPreferenceSave && <button type="button" disabled={Boolean(busyAction)} onClick={async()=>{onClearSettingsMessage?.();setPreferenceSaveError('');setBusyAction('refresh');try{await onReloadAccountPreferences();setPreferenceSaveError('');}catch(error){setPreferenceSaveError(error.message);}finally{setBusyAction('');}}}>Refresh saved values</button>}
            {showsPreferenceSave && <p className="settings-draft-status">{busyAction === 'preferences' ? 'Saving your preferences…' : hasUnsavedPreferences ? 'Unsaved changes — Save applies all preference sections.' : 'No unsaved changes.'}</p>}
            {showsPreferenceSave && !hasUnsavedPreferences && busyAction !== 'preferences' && preferenceSaveError && <p className="settings-warning" role="alert">{preferenceSaveError}</p>}
            {navidrome.error && <p className="settings-warning">{navidrome.error}</p>}
            {playbackMessage && <p className="settings-warning">{playbackMessage}</p>}
            {settingsMessage && <p className="settings-warning">{settingsMessage}</p>}
          </div>

      {activeSection === 'system' && <SettingsPanel title="ListenBrainz" icon={<Waves size={18}/>} summary="Discovery mixes connected to your ListenBrainz account. Listening history and charts are recorded by NaviMuse."><button type="button" onClick={onOpenListenBrainz}>Manage ListenBrainz</button></SettingsPanel>}
      {activeSection === 'account' && accountPanel}

      {activeSection === 'system' && accountSession && localOwner && <OwnerAccounts key={accountSession.account.id} accountId={accountSession.account.id} onReauthenticate={onLogoutAdmin}/>}
      {activeSection === 'system' && !accountSession && managedConnections && <>
        <SettingsPanel title="Music library" icon={<Server size={18}/>} summary={managedConnectionSummary(navidromeService, health?.services?.navidrome)} />
        <SettingsPanel title="Music discovery" icon={<Waves size={18}/>} summary={managedConnectionSummary(audiomuseService, health?.services?.audiomuse)} />
      </>}
      {activeSection === 'system' && !accountSession && !managedConnections && (<>
      <SettingsPanel
        title="Navidrome Server"
        icon={<Server size={18} />}
        summary={`${navidromeService.configured ? 'Configured' : 'Not configured'} · ${navidromeService.source === 'app' ? 'Saved encrypted in NaviMuse private Docker volume, not returned to the browser' : 'Using Docker environment fallback'}`}
        disabled={locked}
      >
        <label className="settings-field">
          <span>URL</span>
          <input disabled={locked} value={navidromeForm.url} onChange={(event) => setNavidromeForm((current) => ({ ...current, url: event.target.value }))} />
        </label>
        <label className="settings-field">
          <span>Username</span>
          <input disabled={locked} value={navidromeForm.username} onChange={(event) => setNavidromeForm((current) => ({ ...current, username: event.target.value }))} />
        </label>
        <label className="settings-field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            disabled={locked}
            placeholder={navidromeService.passwordSet ? 'Saved password is write-only' : 'Navidrome password'}
            type="password"
            value={navidromeForm.password}
            onChange={(event) => setNavidromeForm((current) => ({ ...current, password: event.target.value }))}
          />
        </label>
        {!locked && navidromeService.urlAllowed === false && (
          <p className="settings-warning">
            Saved URL is outside the allow-list. NaviMuse is using {navidromeService.activeUrl || 'the default Navidrome URL'}.
          </p>
        )}
        <p className="settings-note">Leave password blank to keep the saved password. Save validates the Navidrome login before replacing stored credentials.</p>
        <div className="settings-actions">
          <button type="button" disabled={locked || busyAction === 'testNavidrome'} onClick={testNavidrome}><RefreshCcw size={17} /> Test</button>
          <button type="button" disabled={locked || busyAction === 'saveNavidrome'} onClick={saveNavidrome}><Save size={17} /> Save</button>
          <button type="button" disabled={locked || busyAction === 'clearNavidrome'} onClick={clearNavidrome}><Trash2 size={17} /> Clear</button>
        </div>
      </SettingsPanel>

      <SettingsPanel
        title="AudioMuse AI"
        icon={<Waves size={18} />}
        summary={`${audiomuseService.source === 'app' ? 'Saved encrypted in NaviMuse private Docker volume' : 'Using Docker environment fallback'} · ${audiomuseService.tokenSet ? 'API token set' : 'No API token'}`}
        disabled={locked}
      >
        <label className="settings-field">
          <span>URL</span>
          <input disabled={locked} value={audiomuseForm.url} onChange={(event) => setAudiomuseForm((current) => ({ ...current, url: event.target.value }))} />
        </label>
        <label className="settings-field">
          <span>API Token</span>
          <input
            autoComplete="off"
            disabled={locked}
            placeholder={audiomuseService.tokenSet ? 'Saved token is write-only' : 'Optional bearer token'}
            type="password"
            value={audiomuseForm.token}
            onChange={(event) => setAudiomuseForm((current) => ({ ...current, token: event.target.value }))}
          />
        </label>
        {!locked && audiomuseService.urlAllowed === false && (
          <p className="settings-warning">
            Saved URL is outside the allow-list. NaviMuse is using {audiomuseService.activeUrl || 'the default AudioMuse URL'}.
          </p>
        )}
        <p className="settings-note">Leave token blank to keep the saved token. Save validates AudioMuse health before replacing stored settings.</p>
        <div className="settings-actions">
          <button type="button" disabled={locked || busyAction === 'testAudiomuse'} onClick={testAudiomuse}><RefreshCcw size={17} /> Test</button>
          <button type="button" disabled={locked || busyAction === 'saveAudiomuse'} onClick={saveAudiomuse}><Save size={17} /> Save</button>
          <button type="button" disabled={locked || busyAction === 'clearAudiomuse'} onClick={clearAudiomuse}><Trash2 size={17} /> Clear</button>
        </div>
      </SettingsPanel>
      </>)}

      {showsPreferenceSave && <fieldset className="settings-preference-fields" disabled={locked || busyAction === 'preferences'} aria-label="Listening preferences">
      {activeSection === 'playback' && (<>
      <SettingsPanel title="Playback" icon={<Play size={18} />} summary="Player behavior shared by the desktop app and web player." disabled={preferenceControlsLocked}>
        {usesDirectMediaAudio() && <p>iPhone Safari uses standard transitions. The installed app supports the gapless album preview on compatible builds. Use your device controls for volume.</p>}
        <SettingsToggle
          label="Gapless albums (preview)"
          description="Preserve consecutive album boundaries on supported local players. Uses standard playback when preparation is unavailable."
          checked={draftPreferences.playback.gaplessAlbums === true}
          onChange={(checked) => updatePreference(['playback', 'gaplessAlbums'], checked)}
          disabled={preferenceControlsLocked || (usesDirectMediaAudio() && !nativeAudioTransport()?.albumQueue)}
        />
        <SettingsPicker
          label="Automatic transitions"
          value={draftPreferences.playback.transitionStyle}
          onChange={(value) => updatePreference(['playback', 'transitionStyle'], value)}
          options={[
            [transitionStyles.SMART, 'Smart'],
            [transitionStyles.PRESERVE, 'Preserve tracks'],
            [transitionStyles.CROSSFADE, 'Crossfade']
          ]}
          disabled={preferenceControlsLocked || usesDirectMediaAudio()}
        />
        <SettingsPicker
          label="Blend window"
          value={String(draftPreferences.playback.smartBlendSeconds)}
          onChange={(value) => updatePreference(['playback', 'smartBlendSeconds'], Number(value))}
          options={Array.from({ length: 12 }, (_, index) => [String(index + 1), `${index + 1} ${index === 0 ? 'second' : 'seconds'}`])}
          disabled={preferenceControlsLocked || usesDirectMediaAudio() || draftPreferences.playback.transitionStyle === transitionStyles.PRESERVE}
        />
        <SettingsToggle
          label="Continue through queue"
          description="Advance through tracks already committed to the active queue."
          checked={draftPreferences.playback.continueThroughQueue}
          onChange={(checked) => updatePreference(['playback', 'continueThroughQueue'], checked)}
          disabled={preferenceControlsLocked}
        />
        <SettingsToggle
          label="Extend Journeys automatically"
          description="Keep active Sonic Journeys moving by adding a bounded generated runway."
          checked={draftPreferences.playback.extendJourneysAutomatically}
          onChange={(checked) => updatePreference(['playback', 'extendJourneysAutomatically'], checked)}
          disabled={preferenceControlsLocked}
        />
        <SettingsToggle
          label="Autoplay after queue"
          description="Keep listening to similar music after your album or queue ends."
          checked={draftPreferences.playback.autoplayAfterQueue}
          onChange={(checked) => updatePreference(['playback', 'autoplayAfterQueue'], checked)}
          disabled={!continuationCapabilities.ordinaryAutoplay || preferenceControlsLocked}
        />
        <SettingsToggle
          label="Open full player on play"
          description="Open the immersive player when playback starts in a compact window."
          checked={draftPreferences.playback.startFullScreen}
          onChange={(checked) => updatePreference(['playback', 'startFullScreen'], checked)}
          disabled={preferenceControlsLocked}
        />
        <p className="settings-note">Smart preserves album boundaries and blends unrelated prepared tracks. The web player uses a prepared handoff rather than claiming sample-accurate gapless playback.</p>
      </SettingsPanel>

      {hasMobileNetwork() && <SettingsPanel title="Streaming on this device" icon={<SlidersHorizontal size={18} />} summary="Choose audio quality for cellular and Wi-Fi. Changes apply to the next track." disabled={preferenceControlsLocked}>
        <HlsPilotSettings/>
        <SettingsPicker label="Cellular Format" value={draftPreferences.streaming.cellularFormat} onChange={(value) => updatePreference(['streaming', 'cellularFormat'], value)} options={deviceStreamFormatOptions()} disabled={preferenceControlsLocked} />
        <SettingsPicker label="Cellular Bitrate" value={draftPreferences.streaming.cellularBitrate} onChange={(value) => updatePreference(['streaming', 'cellularBitrate'], value)} options={[['96', '96 kbps'], ['128', '128 kbps'], ['192', '192 kbps'], ['256', '256 kbps'], ['320', '320 kbps']]} disabled={preferenceControlsLocked || draftPreferences.streaming.cellularFormat === 'raw'} />
        <SettingsPicker label="Wi-Fi Format" value={draftPreferences.streaming.wifiFormat} onChange={(value) => updatePreference(['streaming', 'wifiFormat'], value)} options={deviceStreamFormatOptions()} disabled={preferenceControlsLocked} />
        <SettingsPicker label="Wi-Fi Bitrate" value={draftPreferences.streaming.wifiBitrate} onChange={(value) => updatePreference(['streaming', 'wifiBitrate'], value)} options={[['0', 'No limit'], ['320', '320 kbps'], ['256', '256 kbps'], ['192', '192 kbps']]} disabled={preferenceControlsLocked || draftPreferences.streaming.wifiFormat === 'raw'} />
        <p className="settings-note">Saved only on this device. Opus appears when this device supports it. Original keeps the library format and can use substantially more cellular data. Network changes take effect on the next track without interrupting playback.</p>
      </SettingsPanel>}
      </>)}

      {activeSection === 'appearance' && (<>
      <SettingsPanel title="Color & theme" icon={<Palette size={18}/>} summary="Choose your theme and highlight color." disabled={preferenceControlsLocked}>
        <SettingsPicker label="Theme" value={draftPreferences.appearance?.theme||'dark'} onChange={value=>updatePreference(['appearance','theme'],value)} options={[['dark','Dark'],['light','Light'],['system','Follow device']]} disabled={preferenceControlsLocked}/>
        <div className="accent-palette" role="group" aria-label="Highlight color">{Object.entries(accentColors).map(([id,color])=><button key={id} type="button" aria-label={color.name} aria-pressed={(draftPreferences.appearance?.accent||'orange')===id} style={{'--nm-swatch':color.dark}} disabled={preferenceControlsLocked} onClick={()=>updatePreference(['appearance','accent'],id)}><span/>{color.name.split(' /')[0]}</button>)}</div>
      </SettingsPanel>
      <SettingsPanel title="Home & Discovery" icon={<Sparkles size={18} />} summary="Controls which discovery sections are shown on the main tab." disabled={preferenceControlsLocked}>
        <SettingsToggle label="Artist Journeys" checked={draftPreferences.discovery.homeArtistRadios} onChange={(checked) => updatePreference(['discovery', 'homeArtistRadios'], checked)} disabled={preferenceControlsLocked} />
        <SettingsToggle label="Smart Playlists" checked={draftPreferences.discovery.homeSmartPlaylists} onChange={(checked) => updatePreference(['discovery', 'homeSmartPlaylists'], checked)} disabled={preferenceControlsLocked} />
        <SettingsToggle label="Radios" checked={draftPreferences.discovery.homeRadios} onChange={(checked) => updatePreference(['discovery', 'homeRadios'], checked)} disabled={preferenceControlsLocked} />
      </SettingsPanel>
      </>)}

      {activeSection === 'library' && (
      <SettingsPanel title="Library" icon={<Library size={18} />} summary="Default library display and artwork sizing." disabled={preferenceControlsLocked}>
        <SettingsPicker label="Default View" value={draftPreferences.library.defaultView} onChange={(value) => updatePreference(['library', 'defaultView'], value)} options={[['grid', 'Grid'], ['cover', 'Cover list'], ['list', 'Compact list']]} disabled={preferenceControlsLocked} />
        <SettingsPicker label="Artwork Size" value={draftPreferences.library.artworkSize} onChange={(value) => updatePreference(['library', 'artworkSize'], value)} options={[['300', '300 px'], ['600', '600 px'], ['1000', '1000 px']]} disabled={preferenceControlsLocked} />
        {downloadSettings || (onOpenDownloads?<button type="button" className="library-downloads-button" onClick={onOpenDownloads}>Downloads & device storage</button>:<p className="settings-note">Persistent cache-ahead is deferred. Playback currently prepares one transition deck without claiming offline storage.</p>)}
      </SettingsPanel>
      )}

      </fieldset>}

      {activeSection === 'system' && <SettingsPanel title="Playback diagnostics" icon={<Radio size={18} />} summary="On-device playback checks and exportable logs."><MediaSessionDiagnostics /></SettingsPanel>}

      {activeSection === 'system' && !managedConnections && (
      <SettingsPanel title="Diagnostics" icon={<Radio size={18} />} summary="Live status from backend service checks.">
        <ServiceStatus health={health} />
        <div className="settings-service-grid">
          <ServicePill label="Navidrome" service={health?.services?.navidrome} detail={navidromeService.username || 'No user'} />
          <ServicePill label="AudioMuse" service={health?.services?.audiomuse} detail={audiomuseService.tokenSet ? 'Token set' : 'No token'} />
        </div>
        <div className="transition-diagnostic" aria-label="Playback transition diagnostics">
          <div className="transition-diagnostic-heading">
            <span>Playback adapter</span>
            <strong>Web prepared handoff</strong>
          </div>
          <dl>
            <div>
              <dt>Authored gapless</dt>
              <dd>Unverified · standard boundary</dd>
            </div>
            <div>
              <dt>Smart Blend</dt>
              <dd>Available</dd>
            </div>
            <div>
              <dt>Delivered signal path</dt>
              <dd>Deferred · legacy stream</dd>
            </div>
            <div>
              <dt>Persistent cache-ahead</dt>
              <dd>Deferred · transition preload only</dd>
            </div>
            {transitionDiagnostic && <>
              <div>
                <dt>Last event</dt>
                <dd>{transitionDiagnostic.type}</dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>{transitionDiagnostic.mode}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{transitionDiagnostic.reasonCode || 'policy-selected'}</dd>
              </div>
              <div>
                <dt>Queue revision</dt>
                <dd>{transitionDiagnostic.queueRevision}</dd>
              </div>
            </>}
          </dl>
        </div>
        <div className="settings-actions">
          <button type="button" onClick={onRefreshHealth}><RefreshCcw size={17} /> Refresh Status</button>
        </div>
      </SettingsPanel>
      )}

        </div>
      </div>
      {(hasUnsavedPreferences || busyAction === 'preferences') && <div className="settings-save-dock" role="group" aria-label="Unsaved preferences">
        {preferenceSaveError && <p className="settings-warning" role="alert">{preferenceSaveError}</p>}
        <div className="settings-draft-actions">
          <button type="button" disabled={locked || Boolean(busyAction) || !hasUnsavedPreferences} onClick={() => { setDraftPreferences(preferences); setPreferenceSaveError(''); onClearSettingsMessage?.(); settingsHeadingRef.current?.focus({ preventScroll: true }); }}>Discard changes</button>
          <button type="button" disabled={locked || Boolean(busyAction) || !hasUnsavedPreferences} onClick={savePreferenceDraft}><Save size={16} /> {busyAction === 'preferences' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>}
    </section>
  );
}

function SettingsPanel({ children, disabled = false, icon, summary, title }) {
  return (
    <section className={`settings-panel ${disabled ? 'disabled' : ''}`}>
      <header>
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
      </header>
      <div className="settings-panel-body">
        {children}
      </div>
    </section>
  );
}

function SettingsToggle({ checked, description = '', disabled, label, onChange, status = '' }) {
  return (
    <label className="settings-row">
      <span className="settings-row-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      {status && <em className="settings-row-status">{status}</em>}
      <input disabled={disabled} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function SettingsPicker({ disabled, label, onChange, options, value }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ServicePill({ detail, label, service }) {
  return (
    <div className={`service-pill ${service?.ok ? 'online' : ''}`}>
      <strong>{label}</strong>
      <span>{service?.ok ? `Online · ${service.status}` : 'Offline'}</span>
      <small>{detail}</small>
    </div>
  );
}

function ServiceStatus({ health }) {
  const navidrome = health?.services?.navidrome;
  const audiomuse = health?.services?.audiomuse;

  return (
    <div className="service-status" aria-label="Service status">
      <span className={navidrome?.ok ? 'online' : ''}>Navidrome</span>
      <span className={audiomuse?.ok ? 'online' : ''}>AudioMuse</span>
    </div>
  );
}



function setDeepValue(source, path, value) {
  const next = cloneSettingsDraft(source);
  let cursor = next;
  path.slice(0, -1).forEach((key) => {
    cursor[key] = { ...(cursor[key] || {}) };
    cursor = cursor[key];
  });
  cursor[path[path.length - 1]] = value;
  return next;
}

function cloneSettingsDraft(source) {
  if (typeof structuredClone === 'function') return structuredClone(source);
  return JSON.parse(JSON.stringify(source));
}

function managedConnectionSummary(service, health) {
  if (!service.configured) return 'Not connected · Your administrator manages this connection.';
  if (health?.ok === false) return 'Temporarily unavailable · Your administrator manages this connection.';
  if (health?.ok === true) return 'Connected · Managed by your administrator. No setup needed.';
  return 'Configured · Checking connection. No setup needed.';
}
