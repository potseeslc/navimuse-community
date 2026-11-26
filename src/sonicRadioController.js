/**
 * Sonic Radio orchestration controller (#75).
 *
 * Contains all radio-session state machine logic and async orchestration,
 * independent of React.  The `useSonicRadio` hook wraps this controller
 * with React state binding; tests exercise the controller directly.
 *
 * Per Sol's lane instructions, this module does NOT import
 * `usePlayerQueueState`, `queueStore`, `main.jsx`, or server routes.
 * All queue/transport integration is via callback-based deps.
 */

import {
  createIdleRadioSession,
  beginRadioSeeding,
  beginRadioGeneration,
  acceptRadioCandidates,
  markRadioPlayed,
  degradeRadioSession,
  stopRadioSession,
  resetRadioSession,
  radioNeedsReplenishment,
  isRadioDuplicate
} from './radioState.js';

export const listeningModePolicies = Object.freeze({
  journey: Object.freeze({ canReplenish: true, stopWhenExhausted: false }),
  'artist-dj': Object.freeze({ canReplenish: false, stopWhenExhausted: true })
});

function listeningModePolicy(sessionKind) {
  return listeningModePolicies[sessionKind] || listeningModePolicies.journey;
}

/**
 * @param {Object} deps
 * @param {function} deps.replaceQueue - (items, index) → replaces the player queue
 * @param {function} [deps.appendToQueue] - (items) → appends without clearing
 * @param {function} deps.playTrack - (item) → starts playing a track
 * @param {function} deps.getQueueSnapshot - () → { items, index }
 * @param {function} deps.fetchSimilarTracks - (seedId, count) → Promise<{ ok, tracks }>
 * @param {function} [deps.searchNavidrome] - (query) → Promise<song[]>
 * @param {function} [deps.saveAsPlaylistFn] - (name, songIds) → Promise<playlist>
 * @param {function|boolean} [deps.shouldAutoExtend=true] - Whether Journey replenishment may run automatically
 * @param {number} [deps.maxRetries=3] - Maximum degraded recovery retries
 */
export function createSonicRadioController({
  replaceQueue,
  appendToQueue,
  playTrack,
  getQueueSnapshot,
  fetchSimilarTracks,
  fetchArtistSongs,
  artistOpenerHistory,
  fetchGenreSongs,
  searchNavidrome,
  saveAsPlaylistFn,
  shouldAutoExtend = true,
  maxRetries = 3,
  getPlaybackContext = () => null,
  playbackSource
}) {
  let radioState = createIdleRadioSession();
  let radioNotice = '';
  let noticeScope = 'session';
  let noticePlaybackSource = playbackSource;
  let retryCount = 0;
  let sessionId = null;
  let replenishInProgress = false;
  let degradedTimer = null;
  let disposed = false;
  let saveToken = 0; // monotonically increasing save generation
  let saveInProgress = false;
  let similarTrackRequestCount = 12;
  let similaritySeedId = '';
  let attemptedSimilaritySeeds = new Set();
  let sessionTrackIds = new Set();
  let playedSeedIds = [];
  const playedSeedHistoryLimit = 500;
  let startGeneration = 0;
  const listeners = new Set();

  function autoExtensionEnabled() {
    return typeof shouldAutoExtend === 'function'
      ? shouldAutoExtend() !== false
      : shouldAutoExtend !== false;
  }

  // ── internal helpers ──────────────────────────────────────────────

  function isDisposed() {
    return disposed;
  }

  function notify() {
    if (disposed) return;
    for (const fn of listeners) fn(radioState, radioNotice);
  }

  function setState(next) {
    if (disposed) return radioState;
    const prev = radioState;
    radioState = typeof next === 'function' ? next(radioState) : next;

    // Defect 2 fix: auto-trigger replenishment when transitioning
    // from 'listening' → 'replenishing' (e.g. via onTrackPlayed).
    // We only fire on the *transition* (prev was not 'replenishing')
    // and guard against re-entry via replenishInProgress.
    // Lifecycle guard: check disposed inside the microtask too.
    if (radioState.status === 'replenishing' && prev.status !== 'replenishing' && autoExtensionEnabled()) {
      queueMicrotask(() => {
        if (disposed || replenishInProgress) return;
        replenish();
      });
    }

    // Degraded recovery: schedule a retry timer whenever we enter
    // degraded state with a non-zero retry timestamp.
    if (radioState.status === 'degraded' && radioState.degradedRetryAt > 0) {
      scheduleDegradedRetry();
    } else if (radioState.status !== 'degraded') {
      clearDegradedTimer();
    }

    notify();
    return radioState;
  }

  function setNotice(msg, scope = 'session') {
    if (disposed) return;
    radioNotice = msg;
    noticeScope = scope;
    noticePlaybackSource = playbackSource;
    notify();
  }

  function clearStartNotice(source) {
    if (noticeScope === 'start' && (arguments.length === 0 || source !== noticePlaybackSource)) setNotice('');
  }

  function isStartActive(id, context) {
    if (!isSessionActive(id)) return false;
    if (getPlaybackContext() === context) return true;
    // The listener chose another playback action while this start was loading.
    // Abandon this feeder attempt without touching their committed queue.
    sessionId = null;
    setState(() => resetRadioSession());
    setNotice('');
    return false;
  }

  function isSessionActive(id) {
    return !disposed && sessionId === id;
  }

  function scheduleDegradedRetry() {
    clearDegradedTimer();
    if (!autoExtensionEnabled() || retryCount >= maxRetries) return;
    const delay = Math.max(0, radioState.degradedRetryAt - Date.now());
    degradedTimer = setTimeout(() => {
      degradedTimer = null;
      if (disposed || !autoExtensionEnabled()) return;
      // Defect 1 fix: replenish() now accepts 'degraded' status and
      // performs a real fetch attempt instead of early-exiting.
      replenish();
    }, delay);
  }

  function clearDegradedTimer() {
    if (degradedTimer !== null) {
      clearTimeout(degradedTimer);
      degradedTimer = null;
    }
  }

  function generateRadioQueueItems(seedSong, tracks, provenance = 'source') {
    const items = [];
    const includedIds = new Set();
    const {seedType,seedId,seedSongId,seedLabel,sessionKind}=radioState;
    const radioSeed={seedType,seedId,seedSongId,seedLabel,sessionKind};
    if (seedSong) {
      items.push({ song: seedSong, album: null, radioSessionId: sessionId, radioSeed, provenance });
      includedIds.add(seedSong.id);
    }
    for (const track of tracks) {
      if (!track?.id || includedIds.has(track.id)) continue;
      includedIds.add(track.id);
      items.push({ song: track, album: null, radioSessionId: sessionId, radioSeed, provenance });
    }
    return items;
  }

  // ── public API ────────────────────────────────────────────────────

  /**
   * Update dependency callbacks (called by the hook on each render so
   * the controller always has the latest stable references).
   */
  function updateDeps(newDeps) {
    if (disposed) return;
    const extensionWasEnabled = autoExtensionEnabled();
    if (newDeps.replaceQueue) replaceQueue = newDeps.replaceQueue;
    if ('appendToQueue' in newDeps) appendToQueue = newDeps.appendToQueue;
    if (newDeps.playTrack) playTrack = newDeps.playTrack;
    if (newDeps.getQueueSnapshot) getQueueSnapshot = newDeps.getQueueSnapshot;
    if (newDeps.fetchSimilarTracks) fetchSimilarTracks = newDeps.fetchSimilarTracks;
    if ('artistOpenerHistory' in newDeps) artistOpenerHistory = newDeps.artistOpenerHistory;
    if ('fetchArtistSongs' in newDeps) fetchArtistSongs = newDeps.fetchArtistSongs;
    if ('fetchGenreSongs' in newDeps) fetchGenreSongs = newDeps.fetchGenreSongs;
    if ('searchNavidrome' in newDeps) searchNavidrome = newDeps.searchNavidrome;
    if ('saveAsPlaylistFn' in newDeps) saveAsPlaylistFn = newDeps.saveAsPlaylistFn;
    if ('shouldAutoExtend' in newDeps) shouldAutoExtend = newDeps.shouldAutoExtend;
    if ('maxRetries' in newDeps) maxRetries = newDeps.maxRetries;
    if (newDeps.getPlaybackContext) getPlaybackContext = newDeps.getPlaybackContext;
    if ('playbackSource' in newDeps) playbackSource = newDeps.playbackSource;
    const extensionIsEnabled = autoExtensionEnabled();
    if (extensionWasEnabled && !extensionIsEnabled) {
      clearDegradedTimer();
      if (radioState.status === 'replenishing') {
        setState((state) => ({ ...state, status: 'listening' }));
      }
    } else if (!extensionWasEnabled && extensionIsEnabled && radioState.status === 'degraded') {
      scheduleDegradedRetry();
    }
  }

  function subscribe(fn) {
    if (disposed) return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getState() { return radioState; }
  function getNotice() { return radioNotice; }
  function isRadioActive() {
    return !disposed && radioState.status !== 'idle' && radioState.status !== 'stopped';
  }

  // Lifecycle fix 1: destroy invalidates all pending and future work.
  // Sets disposed flag, clears timer, invalidates session, invalidates
  // any pending save, and clears listeners.
  function destroy() {
    if (disposed) return;
    disposed = true;
    clearDegradedTimer();
    sessionId = null;
    startGeneration += 1;
    saveToken++; // invalidate any pending save
    listeners.clear();
  }

  async function startJourneyFromSong(song, label, identity = {}) {
    if (disposed) return;
    const playbackContext = getPlaybackContext();

    // Lifecycle fix 3: validate prerequisites BEFORE replacing the
    // active session.  An invalid start while radio A is listening
    // must not silently change the session token.
    const seedLabel = label || `${song?.title || 'Unknown'} Journey`;
    const seedId = String(song?.id || '').trim();
    if (!seedId) {
      setNotice('Cannot start radio: no song id', 'start');
      return;
    }

    // Only now — after validation — do we replace the session.
    const mySessionId = `radio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    startGeneration += 1;
    sessionId = mySessionId;
    retryCount = 0;
    similarTrackRequestCount = 12;
    similaritySeedId = seedId;
    attemptedSimilaritySeeds = new Set([seedId]);
    sessionTrackIds = new Set([seedId]);
    playedSeedIds = [];
    saveToken++; // invalidate any pending save from a prior stopped session

    const seedType = identity.seedType || 'song';
    const identityId = String(identity.seedId || seedId);
    setState((s) => beginRadioSeeding(s, {
      seedType,
      seedId: identityId,
      seedSongId: seedId,
      seedLabel,
      sessionKind: 'journey'
    }));
    setNotice(`Starting ${seedLabel}...`, 'start');

    try {
      setState((s) => beginRadioGeneration(s));
      const result = await fetchSimilarTracks(seedId, similarTrackRequestCount);

      // Session guard: bail if disposed, a newer session started,
      // or this one was stopped.
      if (!isStartActive(mySessionId, playbackContext)) return;

      if (!result?.ok || !result?.tracks?.length) {
        if (seedType !== 'song') {
          sessionId = null;
          setState((s) => stopRadioSession(s));
          setNotice(`Could not build ${seedLabel}: AudioMuse similarity is unavailable.`, 'start');
          return;
        }
        // Degraded: try fallback search
        if (searchNavidrome) {
          setNotice('Journey generation is unavailable. Playing a Navidrome search instead.', 'start');
          const fallback = await searchNavidrome(seedLabel.replace(/ Radio$/, ''));

          if (!isStartActive(mySessionId, playbackContext)) return;

          if (fallback?.length) {
            for (const track of fallback) {
              if (track?.id) sessionTrackIds.add(track.id);
            }
            const items = generateRadioQueueItems(song, fallback);
            replaceQueue(items, 0);
            setState((s) => acceptRadioCandidates(
              degradeRadioSession(s),
              fallback.map((t) => t.id).filter(Boolean)
            ));
            if (items[0]) playTrack(items[0]);
            return;
          }
        }
        setState((s) => degradeRadioSession(s));
        setNotice('Journey generation is unavailable. No fallback tracks found.', 'start');
        return;
      }

      // Success: merge seed + similar tracks into queue
      let tracks = result.tracks;
      if (identity.requiredArtistId) {
        const selectedId = String(identity.requiredArtistId);
        const belongsToOtherArtist = (track) => {
          const artistId = String(track?.artistId || track?.albumArtistId || '');
          return artistId && artistId !== selectedId;
        };
        const mixedIndex = tracks.findIndex(belongsToOtherArtist);
        if (mixedIndex < 0) {
          sessionId = null;
          setState((s) => stopRadioSession(s));
          setNotice(`Could not build a mixed Artist Journey for ${identity.seedName || seedLabel}.`, 'start');
          return;
        }
        // Put the proof of discovery immediately after the seed.
        tracks = [tracks[mixedIndex], ...tracks.slice(0, mixedIndex), ...tracks.slice(mixedIndex + 1)];
      }
      const candidateIds = tracks.map((t) => t.id).filter(Boolean);
      for (const id of candidateIds) sessionTrackIds.add(id);
      const items = generateRadioQueueItems(song, tracks);
      replaceQueue(items, 0);
      retryCount = 0; // reset retry budget after successful recovery
      setState((s) => acceptRadioCandidates(s, candidateIds));
      setNotice('');
      if (items[0]) playTrack(items[0]);
      return true;
    } catch (error) {
      if (!isStartActive(mySessionId, playbackContext)) return;
      setState((s) => degradeRadioSession(s));
      setNotice('Journey generation encountered an error. Playing remaining tracks.', 'start');
    }
  }

  function startSongRadio(song, label) {
    return startJourneyFromSong(song, label);
  }

  function startTrackJourney(song, label) {
    return startJourneyFromSong(song, label);
  }

  async function loadExactSeed(fetchSongs, value, unavailableNotice, emptyNotice, failureNotice) {
    if (!fetchSongs) {
      setNotice(unavailableNotice, 'start');
      return null;
    }
    const generation = ++startGeneration;
    const context = getPlaybackContext();
    const current = () => generation === startGeneration && !disposed && getPlaybackContext() === context;
    clearStartNotice();
    try {
      const songs = await fetchSongs(value);
      if (!current()) return null;
      const playable = (Array.isArray(songs) ? songs : []).filter((song) => String(song?.id || '').trim());
      if (!playable.length) setNotice(emptyNotice, 'start');
      return { songs: playable, generation, context };
    } catch {
      if (current()) setNotice(failureNotice, 'start');
      return null;
    }
  }

  async function startArtistJourney(artist, label) {
    const artistId = String(artist?.id || '').trim();
    const artistName = artist?.name || 'Unknown Artist';
    if (!artistId) return setNotice('Cannot start Artist Journey: no artist id', 'start');
    const loaded = await loadExactSeed(
      fetchArtistSongs,
      artistId,
      'Cannot start Artist Journey: artist songs are unavailable',
      `No tracks found for ${artistName}`,
      `Could not load tracks for ${artistName}. Try again.`
    );
    if (disposed || loaded?.generation !== startGeneration || loaded.context !== getPlaybackContext() || !loaded.songs.length) return;
    const { songs } = loaded;
    const history = artistOpenerHistory;
    const seed = history?.choose(artistId, songs) || songs[0];
    const accepted = await startJourneyFromSong(seed, label || `${artistName} + similar artists`, {
      seedType: 'artist', seedId: artistId, seedName: artistName, requiredArtistId: artistId
    });
    if (accepted) history?.remember(artistId, seed.id);
    return accepted;
  }

  async function startGenreJourney(genre, label) {
    const genreName = String(genre?.value || genre?.name || genre || '').trim();
    if (!genreName) return setNotice('Cannot start Genre Journey: no genre', 'start');
    const loaded = await loadExactSeed(
      fetchGenreSongs,
      genreName,
      'Cannot start Genre Journey: genre songs are unavailable',
      `No tracks found for ${genreName}`,
      `Could not load tracks for ${genreName}. Try again.`
    );
    if (disposed || loaded?.generation !== startGeneration || loaded.context !== getPlaybackContext() || !loaded.songs.length) return;
    const { songs } = loaded;
    return startJourneyFromSong(songs[0], label || `${genreName} Journey`, {
      seedType: 'genre', seedId: genreName
    });
  }

  async function startArtistDj(artist, label) {
    const artistId = String(artist?.id || '').trim();
    const artistName = artist?.name || 'Unknown Artist';
    if (!artistId) return setNotice('Cannot start Artist DJ: no artist id', 'start');
    const loaded = await loadExactSeed(
      fetchArtistSongs,
      artistId,
      'Cannot start Artist DJ: artist songs are unavailable',
      `No tracks found for ${artistName}`,
      `Could not load tracks for ${artistName}. Try again.`
    );
    if (disposed || loaded?.generation !== startGeneration || loaded.context !== getPlaybackContext() || !loaded.songs.length) return;
    const { songs } = loaded;
    const mySessionId = `radio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionId = mySessionId;
    retryCount = 0;
    saveToken++;
    const seedSong = songs[0];
    const seedLabel = label || `${artistName} Artist DJ`;
    setState((s) => beginRadioSeeding(s, {
      seedType: 'artist', seedId: artistId, seedSongId: seedSong.id,
      seedLabel, sessionKind: 'artist-dj'
    }));
    setState((s) => beginRadioGeneration(s));
    const items = generateRadioQueueItems(seedSong, songs.slice(1));
    replaceQueue(items, 0);
    setState((s) => acceptRadioCandidates(s, songs.slice(1).map((song) => song.id)));
    setNotice('');
    if (items[0]) playTrack(items[0]);
  }

  async function startArtistRadio(artistName, label) {
    if (disposed) return;
    const playbackContext = getPlaybackContext();

    // Lifecycle fix 3: validate search availability BEFORE replacing
    // the active session.
    const seedLabel = label || `${artistName} Radio`;
    if (!searchNavidrome) {
      setNotice('Cannot start artist radio: search not available', 'start');
      return;
    }

    // Only now — after validation — do we replace the session.
    const mySessionId = `radio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionId = mySessionId;
    retryCount = 0;
    saveToken++; // invalidate any pending save from a prior stopped session

    setState((s) => beginRadioSeeding(s, { seedType: 'artist', seedId: artistName, seedLabel }));
    setNotice(`Finding tracks for ${artistName}...`, 'start');

    let results;
    try {
      results = await searchNavidrome(artistName);
    } catch (error) {
      if (!isStartActive(mySessionId, playbackContext)) return;
      // Artist lookup failed before a song-level seed was selected. Retrying
      // similarity with the artist name would violate fetchSimilarTracks'
      // song-id contract, so finish this attempted session cleanly.
      sessionId = null;
      saveToken++;
      setState((s) => stopRadioSession(s));
      setNotice(`Could not load tracks for ${artistName}. Try again.`, 'start');
      return;
    }

    if (!isStartActive(mySessionId, playbackContext)) return;
    if (!results?.length) {
      sessionId = null;
      saveToken++;
      setNotice(`No tracks found for ${artistName}`, 'start');
      setState((s) => stopRadioSession(s));
      return;
    }
    // Delegate only after artist lookup errors have been handled. The song
    // controller owns its new session id and its own generation failures.
    await startSongRadio(results[0], seedLabel);
  }

  async function replenish() {
    if (disposed || replenishInProgress) return;
    const current = radioState;

    // Defect 1 fix: allow replenishment from 'degraded' status.
    // Previously only 'listening' and 'replenishing' were allowed,
    // causing the degraded retry timer to call replenish() which
    // then early-exited because radioNeedsReplenishment(degraded) → false.
    if (!['listening', 'replenishing', 'degraded'].includes(current.status)) return;
    if (current.status === 'listening' && !radioNeedsReplenishment(current, getQueueSnapshot())) return;
    if (current.status === 'degraded') {
      if (retryCount >= maxRetries) return;
      retryCount += 1;
    }
    if (!listeningModePolicy(current.sessionKind).canReplenish) return;

    replenishInProgress = true;
    const mySessionId = sessionId;
    const myGeneration = startGeneration;

    try {
      setState((s) => ({ ...s, status: 'replenishing' }));
      setNotice('Finding more tracks...');

      let nextRequestCount = Math.min(50, similarTrackRequestCount + 12);
      let requestedSeedId = similaritySeedId || current.seedSongId || current.seedId;
      const excludeIds = [...sessionTrackIds];
      let result = await fetchSimilarTracks(requestedSeedId, nextRequestCount, { excludeIds });

      // Session guard: bail if disposed, session changed, or was stopped.
      if (!isSessionActive(mySessionId) || startGeneration !== myGeneration) return;

      if (!result?.ok) {
        setState((s) => degradeRadioSession(s));
        setNotice('Journey generation is pausing. Playing remaining tracks.');
        return;
      }

      // Filter out already-played/pending
      let newTracks = result.tracks.filter((t) =>
        t?.id && !sessionTrackIds.has(t.id) && !isRadioDuplicate(radioState, t.id)
      );
      if (!newTracks.length && (result.partial || result.resolutionIncomplete) && !result.exhausted) {
        setState((s) => degradeRadioSession(s));
        setNotice('Journey generation is retrying an incomplete result. Playing remaining tracks.');
        return;
      }

      // Do not let the last queued track end the session halfway through a
      // bounded window. Exhaust this seed's request window in the same refill
      // pass before deciding that rotation or termination is necessary.
      while (!newTracks.length && nextRequestCount < 50) {
        nextRequestCount = Math.min(50, nextRequestCount + 12);
        result = await fetchSimilarTracks(requestedSeedId, nextRequestCount, { excludeIds: [...sessionTrackIds] });
        if (!isSessionActive(mySessionId) || startGeneration !== myGeneration) return;
        if (!result?.ok) {
          setState((s) => degradeRadioSession(s));
          setNotice('Journey generation is pausing. Playing remaining tracks.');
          return;
        }
        newTracks = result.tracks.filter((track) =>
          track?.id && !sessionTrackIds.has(track.id) && !isRadioDuplicate(radioState, track.id)
        );
        if (!newTracks.length && (result.partial || result.resolutionIncomplete) && !result.exhausted) {
          setState((s) => degradeRadioSession(s));
          setNotice('Journey generation is retrying an incomplete result. Playing remaining tracks.');
          return;
        }
      }
      similarTrackRequestCount = nextRequestCount;

      // NaviMuse limits a single similarity request to a bounded window. Once
      // that window is exhausted, walk the oldest played tracks first: they
      // are farther from the current neighborhood and are more likely to
      // produce a meaningfully different continuation.
      if (!newTracks.length && nextRequestCount >= 50) {
        let hadTransientSeedFailure = false;
        let seedsTried = 0;
        for (const nextSeedId of playedSeedIds) {
          if (!nextSeedId || attemptedSimilaritySeeds.has(nextSeedId)) continue;
          if (seedsTried >= 4) break;
          seedsTried += 1;
          requestedSeedId = nextSeedId;
          const expanded = await fetchSimilarTracks(nextSeedId, 12, { excludeIds: [...sessionTrackIds] });
          if (!isSessionActive(mySessionId) || startGeneration !== myGeneration) return;
          if (!expanded?.ok) {
            // Failed alternates remain eligible for a later retry. Do not
            // consume them merely because this request was transiently bad.
            hadTransientSeedFailure = true;
            continue;
          }
          const expandedTracks = Array.isArray(expanded.tracks) ? expanded.tracks : [];
          const expandedNewTracks = expandedTracks.filter((track) =>
            track?.id && !sessionTrackIds.has(track.id) && !isRadioDuplicate(radioState, track.id)
          );
          if (expandedNewTracks.length) {
            result = expanded;
            newTracks = expandedNewTracks;
            similaritySeedId = nextSeedId;
            similarTrackRequestCount = 12;
            attemptedSimilaritySeeds.add(nextSeedId);
            break;
          }
          if ((expanded.partial || expanded.resolutionIncomplete) && !expanded.exhausted) {
            hadTransientSeedFailure = true;
            continue;
          }
          // A successful but duplicate-only neighborhood is genuinely
          // exhausted. Mark it and continue walking in this same pass.
          attemptedSimilaritySeeds.add(nextSeedId);
        }
        if (!newTracks.length && hadTransientSeedFailure) {
          setState((s) => degradeRadioSession(s));
          setNotice('Journey generation is pausing. Playing remaining tracks.');
          return;
        }
      }

      if (newTracks.length) {
        for (const track of newTracks) sessionTrackIds.add(track.id);
        const items = generateRadioQueueItems(null, newTracks, 'generated');
        if (appendToQueue) {
          appendToQueue(items);
        } else {
          // Fallback: append to existing queue manually via replaceQueue
          const snap = getQueueSnapshot();
          replaceQueue([...(snap?.items || []), ...items], snap?.index ?? 0);
        }
        retryCount = 0; // reset retry budget after successful recovery
        setState((s) => acceptRadioCandidates(s, newTracks.map((t) => t.id)));
        setNotice('');
      } else {
        if (radioState.candidateIds.length === 0) {
          sessionId = null;
          setState((s) => stopRadioSession(s));
          setNotice(`No more new Journey tracks found. Save ${current.seedLabel || 'radio session'} as a playlist?`);
        } else {
          // The larger request window may need another cycle before it exposes new candidates.
          setState((s) => ({ ...s, status: 'listening' }));
          setNotice('');
        }
      }
    } catch (error) {
      if (!isSessionActive(mySessionId) || startGeneration !== myGeneration) return;
      setState((s) => degradeRadioSession(s));
      setNotice('Journey generation is pausing. Playing remaining tracks.');
    } finally {
      replenishInProgress = false;
    }
  }

  function stopRadio() {
    if (disposed) return;
    // Invalidate the session so any pending async operations bail out
    // after their next await resolves (defect 3 fix for stop-during-generation).
    sessionId = null;
    startGeneration += 1;
    saveToken++; // invalidate any pending save from a prior stop
    setState((s) => stopRadioSession(s));
    setNotice(`Save ${radioState.seedLabel || 'radio session'} as a playlist?`);
  }

  async function saveAsPlaylist(name) {
    if (disposed) return;
    const current = radioState;
    if (current.status !== 'stopped') return;
    if (saveInProgress) return;
    if (!saveAsPlaylistFn) {
      setNotice('Save as Playlist is not available');
      return;
    }

    // Lifecycle fix 2: use a dedicated monotonically increasing save
    // token instead of sessionId (which is null when stopped).  This
    // distinguishes overlapping save operations and invalidates a
    // pending save when the user dismisses the prompt, starts a new
    // radio, stops again, or destroys the controller.
    const mySaveToken = ++saveToken;
    saveInProgress = true;
    setNotice('Saving playlist...');

    try {
      const dedupedIds = [...new Set([current.seedSongId || current.seedId, ...current.playedIds].filter(Boolean))];
      await saveAsPlaylistFn(name || current.seedLabel, dedupedIds);

      // Guard: bail if disposed, a newer save started, the prompt was
      // dismissed, or a new radio session started during the save.
      if (disposed || saveToken !== mySaveToken) return;

      setState(() => resetRadioSession());
      sessionId = null;
      setNotice('');
    } catch (error) {
      // Guard: bail if disposed, a newer save started, the prompt was
      // dismissed, or a new radio session started during the save.
      if (disposed || saveToken !== mySaveToken) return;
      setNotice(`Could not save playlist: ${error?.message || 'unknown error'}`);
    } finally {
      saveInProgress = false;
    }
  }

  function dismissSavePrompt() {
    if (disposed) return;
    saveToken++; // invalidate any pending save
    startGeneration += 1;
    setState(() => resetRadioSession());
    sessionId = null;
    setNotice('');
  }

  // Restore only the feeder identity; the persisted player queue still owns
  // order, position and whether playback starts. Never restart a stopped feeder.
  function restoreQueueSession(queue) {
    if(disposed || radioState.status !== 'idle' || sessionId || queue?.source?.kind !== 'radio') return false;
    const current=queue.items?.[queue.index];
    const item=current?.radioSeed?current:queue.items?.find(value=>value.radioSeed&&value.radioSessionId);
    const seed=item?.radioSeed;
    if(!item?.radioSessionId || !seed?.seedSongId || !['journey','artist-dj'].includes(seed.sessionKind)) return false;
    const items=queue.items.filter(value=>value.radioSessionId===item.radioSessionId);
    sessionId=item.radioSessionId;
    similaritySeedId=seed.seedSongId;
    attemptedSimilaritySeeds=new Set([similaritySeedId]);
    sessionTrackIds=new Set(items.map(value=>value.song.id));
    playedSeedIds=queue.items.slice(0,queue.index).filter(value=>value.radioSessionId===sessionId).map(value=>value.song.id).slice(-playedSeedHistoryLimit);
    setState({...beginRadioSeeding(createIdleRadioSession(),seed),status:'listening',playedIds:playedSeedIds.slice(-50),candidateIds:queue.items.slice(queue.index).filter(value=>value.radioSessionId===sessionId).map(value=>value.song.id)});
    return true;
  }

  function onTrackPlayed(songId) {
    if (disposed || !sessionId) return;
    const current = radioState;
    if (!['listening', 'replenishing', 'degraded'].includes(current.status)) return;
    if (songId && !playedSeedIds.includes(songId)) {
      playedSeedIds.push(songId);
      if (playedSeedIds.length > playedSeedHistoryLimit) {
        playedSeedIds = playedSeedIds.slice(-playedSeedHistoryLimit);
      }
    }
    setState((s) => {
      const next = markRadioPlayed(s, songId);
      if (listeningModePolicy(s.sessionKind).stopWhenExhausted) {
        return { ...next, status: next.candidateIds.length ? 'listening' : 'stopped' };
      }
      if (s.status !== 'degraded') return next;
      return { ...next, status: 'degraded', degradedRetryAt: s.degradedRetryAt };
    });
    // This controller owns generated candidates, not playback of committed
    // queue items. Disabling extension suppresses fetch/append work only; the
    // player queue remains free to advance through every remaining candidate.
    if (!autoExtensionEnabled() && radioState.status === 'replenishing') {
      setState((s) => ({ ...s, status: 'listening' }));
      return;
    }
    if (autoExtensionEnabled()
      && current.status !== 'degraded'
      && radioState.status === 'listening'
      && radioNeedsReplenishment(radioState, getQueueSnapshot())) {
      const activeSessionId = sessionId;
      queueMicrotask(() => {
        if (isSessionActive(activeSessionId)) replenish();
      });
    }
  }

  return {
    startSongRadio,
    startTrackJourney,
    startArtistJourney,
    startGenreJourney,
    startArtistDj,
    startArtistRadio,
    stopRadio,
    saveAsPlaylist,
    dismissSavePrompt,
    onTrackPlayed,
    restoreQueueSession,
    replenish,
    updateDeps,
    subscribe,
    getState,
    getNotice,
    clearStartNotice,
    isRadioActive,
    destroy
  };
}
