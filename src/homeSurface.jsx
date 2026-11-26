import {LoadingSkeleton} from './LoadingSkeleton.jsx';
import {PersonalizedMix} from './PersonalizedMix.jsx';
import {LoadingDots} from './LoadingDots.jsx';
import {LibraryPicker} from './LibraryPicker.jsx';
import {useAutoLoad} from './useAutoLoad.js';
import {usePagedShelf} from './usePagedShelf.js';
import { InternetRadio } from './InternetRadio.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Activity, ListMusic, Lock, Pause, Play, Radio, RadioTower, Sparkles } from 'lucide-react';
import {
  artistRadioSeedsFromAlbums,
  findSmartPlaylist,
  isCurrentDiscoveryRequest,
  normalizeDiscoveryLabel,
  radioActionKind,
  radioCards,
  smartPlaylistCards
} from './discovery.js';
import { navidromeArtists, navidromeGenres, navidromePlaylistDetail, navidromePlaylists, navidromeRadios, navidromeSearch } from './services/navidromeService.js';
import { radioStationSong, shuffled } from './discoveryPlayback.js';
import { Artwork, SectionHeader, normalizedAlbums } from './surfaceUi.jsx';
import { DiscoveryResults } from './sonicSettingsSurfaces.jsx';

const defaultDiscoverySettings = {
  homeArtistRadios: true,
  homeSonicMixes: true,
  homeSmartPlaylists: true,
  homeRadios: true,
  homeAudioMuse: true,
  smartPlaylistScope: 'music'
};

export function HomeSurface({
  onOpenListenBrainz, listeningSection, listeningPreview,
  radioMetadata,
  personalizedMix,
  activeLibrary,
  health,
  libraryKey,
  navidrome,
  nowPlaying,
  onLibraryChange,
  librarySaving = false,
  onOpenQueue,
  onTogglePlayback,
  onAddToQueue,
  onPlayAlbum,
  onPlayNext,
  onPlaySong,
  onPlayRadio,
  radioOutputName,
  onRetry,
  onStartArtistDj,
  onStartArtistJourney,
  onStartGenreJourney,
  onStartTrackJourney,
  onSurfaceScroll,
  onUnavailable,
  onUnlock,
  playQueue,
  playbackMessage,
  queueActionDisabledReason,
  isPlaying,
  playlistRevision,
  settings,
  sessionLocked
}) {
  const [discoveryPanel, setDiscoveryPanel] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const discoveryRequestRef = useRef(0);
  const discoveryAbortRef = useRef(null);
  const playlistCacheRef = useRef(null);
  const [smartArtwork, setSmartArtwork] = useState({scope:null,items:[]});
  const playlistCacheVersionRef = useRef(0);
  const libraryOptions = navidrome.musicFolders || [];
  const artworkSize = settings?.library?.artworkSize;
  const recentShelf=usePagedShelf(navidrome.recentAlbums,'recent',libraryKey);
  const newestShelf=usePagedShelf(navidrome.newestAlbums,'newest',libraryKey);
  const recentAlbums = normalizedAlbums(recentShelf.albums, [], artworkSize);
  const newestAlbums = normalizedAlbums(newestShelf.albums, [], artworkSize);
  const randomAlbums = normalizedAlbums(navidrome.randomAlbums, [], artworkSize);
  const frequentAlbums = normalizedAlbums(navidrome.frequentAlbums, [], artworkSize);
  const artistRadioSeeds = artistRadioSeedsFromAlbums(
    frequentAlbums,
    [...randomAlbums, ...newestAlbums],
    8
  );
  const discovery = settings?.discovery || defaultDiscoverySettings;

  useEffect(() => {
    playlistCacheVersionRef.current += 1;
    playlistCacheRef.current = null;
  }, [playlistRevision]);

  useEffect(() => {
    playlistCacheVersionRef.current += 1;
    playlistCacheRef.current = null;
    setDiscoveryPanel(null);
    setDiscoveryLoading(false);
    return () => {
      discoveryRequestRef.current += 1;
      discoveryAbortRef.current?.abort();
    };
  }, [libraryKey]);

  const beginDiscoveryRequest = (panel) => {
    const requestId = discoveryRequestRef.current + 1;
    discoveryAbortRef.current?.abort();
    discoveryAbortRef.current = new AbortController();
    discoveryRequestRef.current = requestId;
    setDiscoveryLoading(true);
    setDiscoveryPanel(panel);
    return requestId;
  };

  const requestIsCurrent = (requestId) => isCurrentDiscoveryRequest(discoveryRequestRef.current, requestId);

  const finishDiscoveryRequest = (requestId) => {
    if (requestIsCurrent(requestId)) {
      setDiscoveryLoading(false);
    }
  };

  const setDiscoveryError = (title, message, requestId) => {
    if (requestId && !requestIsCurrent(requestId)) return;
    setDiscoveryPanel({ title, type: 'message', message });
  };

  const loadPlaylists = async (signal) => {
    if (playlistCacheRef.current) return playlistCacheRef.current;
    const cacheVersion = playlistCacheVersionRef.current;
    const payload = await navidromePlaylists(libraryKey, { signal });
    const playlists = payload.playlists || [];
    if (!signal?.aborted && cacheVersion === playlistCacheVersionRef.current) playlistCacheRef.current = playlists;
    return playlists;
  };

  useEffect(() => {
    if (!discovery.homeSmartPlaylists || sessionLocked) return;
    const controller = new AbortController();
    setSmartArtwork({scope:libraryKey,items:[]});
    loadPlaylists(controller.signal).then(items => {
      if (!controller.signal.aborted) setSmartArtwork({scope:libraryKey,items});
    }).catch(() => { /* Artwork is optional; the action retains its own retry/error flow. */ });
    return () => controller.abort();
  }, [libraryKey,playlistRevision,discovery.homeSmartPlaylists,sessionLocked]);

  const openSmartPlaylist = async (card) => {
    const requestId = beginDiscoveryRequest({ title: card.label, type: 'loading', message: 'Starting smart playlist...' });
    const signal = discoveryAbortRef.current?.signal;
    try {
      const playlists = await loadPlaylists(signal);
      if (!requestIsCurrent(requestId)) return;
      const match = findSmartPlaylist(playlists, card);

      if (!match) {
        if (!requestIsCurrent(requestId)) return;
        setDiscoveryPanel({
          title: card.label,
          type: 'playlists',
          message: 'No exact smart playlist matched. Here are the available playlists.',
          items: playlists
        });
        return;
      }

      if (!match.id) {
        setDiscoveryError(match.name || card.label, 'That playlist does not have a Navidrome ID.', requestId);
        return;
      }

      const detail = await navidromePlaylistDetail(match.id, { signal });
      if (!requestIsCurrent(requestId)) return;
      const songs = detail.playlist?.entry || [];
      if (!songs.length) {
        setDiscoveryError(detail.playlist?.name || match.name || card.label, 'That smart playlist did not return playable tracks.', requestId);
        return;
      }
      setDiscoveryPanel(null);
      onPlaySong(songs[0], { title: match.name || card.label, artist: 'Smart Playlist', coverArt: match.coverArt }, songs);
    } catch (error) {
      setDiscoveryError(card.label, error.message, requestId);
    } finally {
      finishDiscoveryRequest(requestId);
    }
  };

  const openPlaylistDetail = async (playlist, fallbackTitle = 'Playlist', existingRequestId = null, existingSignal = null) => {
    const requestId = existingRequestId || beginDiscoveryRequest({
      title: playlist.name || fallbackTitle,
      type: 'loading',
      message: 'Loading playlist tracks...'
    });
    const signal = existingSignal || discoveryAbortRef.current?.signal;
    if (!playlist.id) {
      setDiscoveryError(playlist.name || fallbackTitle, 'That playlist does not have a Navidrome ID.', requestId);
      if (!existingRequestId) {
        finishDiscoveryRequest(requestId);
      }
      return;
    }
    try {
      const detail = await navidromePlaylistDetail(playlist.id, { signal });
      if (!requestIsCurrent(requestId)) return;
      setDiscoveryPanel({
        title: detail.playlist?.name || playlist.name || fallbackTitle,
        type: 'songs',
        message: `${detail.playlist?.songCount || detail.playlist?.entry?.length || 0} tracks from Navidrome`,
        items: detail.playlist?.entry || [],
        album: { title: playlist.name || fallbackTitle, artist: 'Smart Playlist', coverArt: playlist.coverArt }
      });
    } catch (error) {
      setDiscoveryError(playlist.name || fallbackTitle, error.message, requestId);
    } finally {
      if (!existingRequestId) {
        finishDiscoveryRequest(requestId);
      }
    }
  };

  const openRadio = async (label) => {
    const requestId = beginDiscoveryRequest({ title: label, type: 'loading', message: 'Loading radio source...' });
    const signal = discoveryAbortRef.current?.signal;
    try {
      if (label === 'SOMA FM') {
        const payload = await navidromeRadios({ signal });
        if (!requestIsCurrent(requestId)) return;
        const somaStations = (payload.radios || []).filter((station) => normalizeDiscoveryLabel(station.name || '').includes('soma'));
        const stations = somaStations.length ? somaStations : (payload.radios || []);
        if (!stations.length) {
          setDiscoveryError('SOMA FM', 'No SOMA FM stations were returned from Navidrome.', requestId);
          return;
        }
        setDiscoveryPanel(null);
        playRadioStations(stations, 'SOMA FM');
        return;
      }

      if (radioActionKind(label) === 'genre') {
        const payload = await navidromeGenres(libraryKey, { signal });
        if (!requestIsCurrent(requestId)) return;
        setDiscoveryPanel({
          title: 'Genre Journey',
          type: 'genres',
          message: 'Choose a genre to begin a Journey.',
          items: payload.genres || []
        });
        return;
      }

      if (radioActionKind(label) === 'artist') {
        const payload = await navidromeArtists(libraryKey, { signal });
        if (!requestIsCurrent(requestId)) return;
        setDiscoveryPanel({
          title: 'Artist Journey',
          type: 'artists',
          message: 'Choose a Journey for related discovery or Artist DJ for this artist only.',
          items: payload.artists || []
        });
        return;
      }

      if (radioActionKind(label) === 'song') {
        setDiscoveryPanel(null);
        onStartTrackJourney?.();
        return;
      }
    } catch (error) {
      setDiscoveryError(label, error.message, requestId);
    } finally {
      finishDiscoveryRequest(requestId);
    }
  };

  const playRadioSongs = (title, seedQuery, songs) => {
    const queueSongs = shuffled(songs.filter((song) => song?.id));
    if (!queueSongs.length) {
      setDiscoveryPanel({ title, type: 'message', message: `No playable radio tracks were returned for ${seedQuery}.` });
      return;
    }
    onPlaySong(queueSongs[0], { title, artist: seedQuery || 'Radio' }, queueSongs);
    setDiscoveryPanel({
      title,
      type: 'message',
      message: `Playing ${queueSongs.length} tracks from ${seedQuery || 'this radio seed'}.`
    });
  };

  const playRadioStations = (stations, title = 'Internet Radio') => {
    const queueSongs = stations.map(radioStationSong).filter(Boolean);
    if (!queueSongs.length) {
      setDiscoveryPanel({ title, type: 'message', message: 'No playable internet radio stations were returned.' });
      return;
    }
    onPlaySong(queueSongs[0], { title, artist: 'Internet Radio' }, queueSongs);
    setDiscoveryPanel({
      title,
      type: 'message',
      message: `Playing ${queueSongs.length} internet radio stations through NaviMuse.`
    });
  };

  const openSeedSearch = async (title, query) => {
    const requestId = beginDiscoveryRequest({
      title,
      type: 'loading',
      message: `Finding tracks for ${query}...`
    });
    const signal = discoveryAbortRef.current?.signal;
    try {
      const payload = await navidromeSearch(query, libraryKey, { signal });
      if (!requestIsCurrent(requestId)) return;
      playRadioSongs(title, query, payload.songs || []);
    } catch (error) {
      setDiscoveryError(title, error.message, requestId);
    } finally {
      finishDiscoveryRequest(requestId);
    }
  };

  const closeDiscoveryPanel = () => {
    discoveryRequestRef.current += 1;
    discoveryAbortRef.current?.abort();
    discoveryAbortRef.current = null;
    setDiscoveryLoading(false);
    setDiscoveryPanel(null);
  };

  return (
    <section className="home-surface" aria-label="Library home" onScroll={onSurfaceScroll}>
      <header className="dashboard-hero">
        <div>
          <h1>Discover</h1>

        </div>
        <LibraryPicker folders={libraryOptions} value={libraryKey} onChange={onLibraryChange} disabled={sessionLocked || librarySaving}/>
      </header>

      {sessionLocked ? (
        <section className="locked-library" aria-labelledby="locked-library-title">
          <Lock size={28} />
          <div>
            <h2 id="locked-library-title">Unlock your music library</h2>
            <p>Your Navidrome connection is configured. Unlock NaviMuse to browse and play your real library.</p>
          </div>
          <button type="button" onClick={onUnlock}>Open Settings</button>
        </section>
      ) : (
        <>

      {(personalizedMix?.enabled || listeningSection) && <section className="made-for-you" aria-label="Made for you">
        <h2>Made for you</h2>
        <div className="made-for-you-row"><PersonalizedMix model={personalizedMix} onPlaySong={onPlaySong} compact/>{listeningSection}</div>
      </section>}
      {navidrome.loading && (
        navidrome.hasSnapshot ? <div className="home-load-state"><LoadingDots label="Refreshing Discover"/></div> :
        <><SectionHeader title="Recently Played"/><LoadingSkeleton label="Loading Discover: recently played albums" layout="shelf" count={4}/>
        <SectionHeader title="Recently Added"/><LoadingSkeleton label="Loading recently added albums" layout="shelf" count={4}/></>
      )}
      {!navidrome.loading && navidrome.error && (
        <div className="home-load-state error" role="alert">
          <p>{navidrome.hasSnapshot ? "Showing saved shelves. Could not refresh right now." : navidrome.error}</p>
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      )}

      {(navidrome.hasSnapshot || (!navidrome.loading && !navidrome.error)) && (<>

      <SectionHeader title="Recently Played" />
      {recentAlbums.length ? <ShelfRow paging={recentShelf} className="album-row shelf-row">
        {recentAlbums.map(album => <button className="album-tile" key={album.id} type="button" onClick={() => onPlayAlbum(album)}>
          <Artwork item={album} className={`album-cover ${album.tone}`} />
          <h3>{album.title}</h3><p>{album.artist}</p>
        </button>)}
      </ShelfRow> : <p className="home-shelf-empty">{navidrome.recentAlbumsUnavailable ? 'Recently played albums are unavailable right now.' : 'Albums you listen to will appear here.'}{navidrome.recentAlbumsUnavailable && <button type="button" onClick={onRetry}>Retry</button>}</p>}

      <SectionHeader title="Recently Added" />
      {playbackMessage && <p className="inline-warning">{playbackMessage}</p>}
      {!newestAlbums.length && <p className="home-shelf-empty">No albums in this library yet.</p>}
      <ShelfRow paging={newestShelf} className="album-row shelf-row">
        {newestAlbums.map((album) => (
          <button className="album-tile" key={album.id} type="button" onClick={() => onPlayAlbum(album)}>
            <Artwork item={album} className={`album-cover ${album.tone}`} />
            <h3>{album.title}</h3>
            <p>{album.artist}</p>
          </button>
        ))}
      </ShelfRow>

      {discovery.homeArtistRadios && (
        <>
          <SectionHeader title="Artist Journeys" />
          {artistRadioSeeds.length ? (
            <ShelfRow className="mix-grid shelf-row artist-radio-row">
              {artistRadioSeeds.map((seed, index) => (
                <button
                  className={`mix-card artist-radio-card ${['sage', 'coral', 'charcoal', 'forest', 'smoke'][index % 5]}`}
                  key={seed.id}
                  type="button"
                  aria-label={`Start ${seed.artist} Journey`}
                  disabled={!seed.artistId}
                  title={!seed.artistId ? 'A stable Navidrome artist ID is required' : undefined}
                  onClick={() => onStartArtistJourney?.({ id: seed.artistId, name: seed.artist }, seed.title)}
                >
                  <Artwork item={seed} className="artist-radio-art" fallbackIcon={<RadioTower size={60} />} />
                  <span className="artist-radio-caption">
                    <strong>{seed.artist}</strong>
                    <span>Artist &amp; similar artists</span>
                  </span>
                  <span className="artist-radio-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
                </button>
              ))}
            </ShelfRow>
          ) : (
            <p className="empty-state">Artist Journeys will appear after Navidrome reports frequent albums.</p>
          )}
        </>
      )}

      <div className="discovery-slot">
        {discoveryPanel ? (
          <DiscoveryResults
            loading={discoveryLoading}
            onAddToQueue={onAddToQueue}
            panel={discoveryPanel}
            queueActionDisabledReason={queueActionDisabledReason}
            onClose={closeDiscoveryPanel}
            onPlayAlbum={onPlayAlbum}
            onOpenPlaylist={openPlaylistDetail}
            onOpenSeed={openSeedSearch}
            onStartArtistJourney={onStartArtistJourney}
            onStartArtistDj={onStartArtistDj}
            onStartGenreJourney={onStartGenreJourney}
            onPlaySong={onPlaySong}
            onPlayNext={onPlayNext}
            settings={settings}
          />
        ) : (
          <>
            {discovery.homeSmartPlaylists && (
              <>
                <SectionHeader title="Smart Playlists" />
                <div className="smart-grid smart-art-grid">
                  {smartPlaylistCards.map((card) => (
                    <button key={card.label} type="button" aria-label={card.label} onClick={() => openSmartPlaylist(card)}>
                      <Artwork className="smart-playlist-art" item={smartArtwork.scope === libraryKey ? findSmartPlaylist(smartArtwork.items,card) : null} fallbackIcon={<Sparkles size={52}/>}/>
                      <span className="home-art-caption">{card.label}<small>Smart playlist</small></span>
                      <span className="home-art-play" aria-hidden="true"><Play size={18} fill="currentColor"/></span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <InternetRadio radioMetadata={radioMetadata} onPlaySong={onPlayRadio || onPlaySong} remoteOutputName={radioOutputName} />



          </>
        )}
      </div>
      </>)}
      {listeningPreview}
        </>
      )}
    </section>
  );
}

export function ShelfRow({ children, className = '', paging }) {
  const shelfRef = useRef(null);
  const moreRef=useRef(null);
  useAutoLoad(moreRef,{enabled:Boolean(paging?.more&&!paging.loading&&!paging.error),identity:paging?.albums.length,root:shelfRef,rootMargin:'0px 800px'});
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const startDrag = (event) => {
    const shelf = shelfRef.current;
    // Touch and pen belong to the platform scroller, including inertia and axis locking.
    if (event.pointerType !== 'mouse' || !shelf || shelf.scrollWidth <= shelf.clientWidth || event.button > 0) return;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: shelf.scrollLeft,
      dragging: false,
      locked: ''
    };
  };

  const moveDrag = (event) => {
    const shelf = shelfRef.current;
    const drag = dragRef.current;
    if (!shelf || !drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.locked && Math.hypot(deltaX, deltaY) > 6) {
      drag.locked = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
      drag.dragging = true;
      suppressClickRef.current = true;
      if (drag.locked === 'x') {
        shelf.setPointerCapture?.(event.pointerId);
      }
    }
    if (drag.locked !== 'x') return;

    shelf.scrollLeft = drag.scrollLeft - deltaX;
    if (event.cancelable) event.preventDefault();
  };

  const endDrag = (event) => {
    const shelf = shelfRef.current;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.locked === 'x') {
      shelf?.releasePointerCapture?.(event.pointerId);
    }
    dragRef.current = null;
    if (drag.dragging) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const blockDraggedClick = (event) => {
    if (!suppressClickRef.current) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  return (
    <div
      className={className}
      onClickCapture={blockDraggedClick}
      onPointerCancel={endDrag}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      ref={shelfRef}
    >
      {children}
      {paging?.more&&<button ref={moreRef} type="button" className="shelf-load-more" disabled={paging.loading} onClick={paging.load}>{paging.loading?'Loading albums…':paging.error||'Load more albums'}</button>}
    </div>
  );
}
