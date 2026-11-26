import { useCallback, useEffect, useRef, useState } from 'react';
import { createSonicRadioController } from './sonicRadioController.js';

/**
 * Sonic Radio listening-loop hook (#75).
 *
 * Owns the RadioSessionState and orchestrates the seed → generate → listen →
 * replenish → degraded → stopped lifecycle.  It is a queue *feeder*, not a
 * transport controller — transport controls always work.
 *
 * Per Sol's lane instructions, this hook does NOT directly import
 * `usePlayerQueueState`, `queueStore`, `main.jsx`, or server routes. Instead
 * it accepts callback-based integration points so it can be rebased after #73.
 *
 * The hook is a thin React binding around `createSonicRadioController` (which
 * holds all orchestration logic and is independently testable).
 *
 * ## StrictMode lifecycle
 *
 * React StrictMode in development intentionally mounts, unmounts, then
 * re-mounts every component to surface side-effect bugs.  The effect below
 * uses a ref flag to distinguish StrictMode replay from real unmount:
 *
 * - On setup, the flag is set to `true`.
 * - On cleanup, the flag is set to `false`.
 * - A `setTimeout(0)` checks: if the flag is still `false` after the
 *   microtask queue flushes, this is a real unmount and the controller is
 *   destroyed.  If StrictMode re-runs setup before the timeout fires, the
 *   flag is back to `true` and the timeout is a no-op — the controller
 *   survives for the second mount.
 *
 * This means the same controller instance is reused across StrictMode
 * replay, and is only destroyed on true final-unmount.  No timers or
 * subscriptions leak because the real teardown clears everything.
 *
 * @param {Object} deps - Dependency injection for queue/transport integration
 * @param {function} deps.replaceQueue - (items, index) → replaces the player queue
 * @param {function} [deps.appendToQueue] - (items) → appends without clearing (optional, #73 follow-on)
 * @param {function} deps.playTrack - (item) → starts playing a track
 * @param {function} deps.getQueueSnapshot - () → { items, index } current queue
 * @param {function} deps.fetchSimilarTracks - (seedId, count) → Promise<{ ok, tracks }> (BFF adapter call)
 * @param {function} [deps.searchNavidrome] - (query) → Promise<song[]> fallback for degraded/artist search
 * @param {function} [deps.saveAsPlaylistFn] - (name, songIds) → Promise<playlist> for Save as Playlist
 * @param {function|boolean} [deps.shouldAutoExtend=true] - Whether Journey replenishment may run automatically
 * @param {number} [deps.maxRetries=3] - Maximum degraded recovery retries
 */
export function useSonicRadio(deps) {
  // Create the controller once for the lifetime of the component.
  // It is NOT destroyed during StrictMode cleanup — only on real unmount.
  const controllerRef = useRef(null);
  if (controllerRef.current === null) {
    controllerRef.current = createSonicRadioController(deps);
  }

  // Initialize state from the controller so the first render has valid values.
  const [radioState, setRadioState] = useState(() => controllerRef.current.getState());
  const [radioNotice, setRadioNotice] = useState(() => controllerRef.current.getNotice());

  // Track whether we're mounted (for StrictMode detection).
  const mountedRef = useRef(false);
  // Track the unsubscribe function for the current subscription.
  const unsubRef = useRef(null);

  // Keep the controller's dependency callbacks up to date on each render
  // so it always calls the latest stable references.
  controllerRef.current.updateDeps(deps);

  // Subscribe to controller state changes.
  useEffect(() => {
    const controller = controllerRef.current;
    mountedRef.current = true;

    // Subscribe to state changes.
    const unsub = controller.subscribe((state, notice) => {
      setRadioState(state);
      setRadioNotice(notice);
    });
    unsubRef.current = unsub;

    // Sync state in case it changed between creation and effect.
    setRadioState(controller.getState());
    setRadioNotice(controller.getNotice());

    return () => {
      mountedRef.current = false;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
      // Defer the teardown decision to the next microtask.  In StrictMode,
      // React immediately re-runs setup after cleanup, setting
      // mountedRef back to true before this timeout fires.  On real
      // unmount, mountedRef stays false and we destroy the controller.
      const teardownTimer = setTimeout(() => {
        if (!mountedRef.current) {
          controller.destroy();
          // Only clear the ref if it still points to our controller.
          if (controllerRef.current === controller) {
            controllerRef.current = null;
          }
        }
      }, 0);
      // Don't keep the event loop alive solely for this timer.
      teardownTimer.unref?.();
    };
  // Intentionally empty deps — the controller is created once per mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Failed start notices belong to the playback context that requested them.
  // Session/replenishment and save notices retain their own lifecycle.
  const noticePlaybackSource = useRef(deps.playbackSource);
  useEffect(() => {
    if (noticePlaybackSource.current !== deps.playbackSource) {
      noticePlaybackSource.current = deps.playbackSource;
      controllerRef.current?.clearStartNotice(deps.playbackSource);
    }
  }, [deps.playbackSource]);

  // Expose stable API references that delegate to the controller.
  const startSongRadio = useCallback((song, label) => {
    return controllerRef.current?.startSongRadio(song, label);
  }, []);

  const startArtistRadio = useCallback((artistName, label) => {
    return controllerRef.current?.startArtistRadio(artistName, label);
  }, []);

  const startTrackJourney = useCallback((song, label) => controllerRef.current?.startTrackJourney(song, label), []);
  const startArtistJourney = useCallback((artist, label) => controllerRef.current?.startArtistJourney(artist, label), []);
  const startGenreJourney = useCallback((genre, label) => controllerRef.current?.startGenreJourney(genre, label), []);
  const startArtistDj = useCallback((artist, label) => controllerRef.current?.startArtistDj(artist, label), []);

  const stopRadio = useCallback(() => {
    controllerRef.current?.stopRadio();
  }, []);

  const saveAsPlaylist = useCallback((name) => {
    return controllerRef.current?.saveAsPlaylist(name);
  }, []);

  const dismissSavePrompt = useCallback(() => {
    controllerRef.current?.dismissSavePrompt();
  }, []);

  const onTrackPlayed = useCallback((songId) => {
    controllerRef.current?.onTrackPlayed(songId);
  }, []);

  const restoreQueueSession = useCallback(queue => controllerRef.current?.restoreQueueSession(queue), []);

  const replenish = useCallback(() => {
    return controllerRef.current?.replenish();
  }, []);
  const getRadioState = useCallback(() => controllerRef.current?.getState(), []);

  const isRadioActive = radioState.status !== 'idle' && radioState.status !== 'stopped';

  return {
    radioState,
    radioNotice,
    startSongRadio,
    startArtistRadio,
    startTrackJourney,
    startArtistJourney,
    startGenreJourney,
    startArtistDj,
    stopRadio,
    saveAsPlaylist,
    dismissSavePrompt,
    onTrackPlayed,
    restoreQueueSession,
    replenish,
    getRadioState,
    isRadioActive
  };
}
