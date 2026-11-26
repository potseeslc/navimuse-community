import {useExitPresence} from './useExitPresence.js';
import {TrackArtwork} from './TrackArtwork.jsx';
import {SLEEP_TIMER_MINUTES} from './sleepTimer.js';
import {LoadingDots} from './LoadingDots.jsx';
import {repeatMode,nextRepeatControls,repeatLabel} from '../shared/repeatMode.js';
import {receivedStreamSummary} from './streamPresentation.js';
import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Download,
  UserRound,
  Star,
  Share2,
  Cast,
  Captions,
  Disc3,
  Heart,
  ListMusic,
  MoreHorizontal,
  Moon,
  Pause,
  Play,
  Plus,
  Repeat2,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2
} from 'lucide-react';
import { LyricsOverlay } from './LyricsOverlay.jsx';
import { QueueOverlay } from './QueueOverlay.jsx';
import { clearQueueEntry, finishQueueEntry, setQueueEntry } from './queueEntry.js';
import { clampSeekRatio, favoriteFeedbackPatch, ratingFeedbackPatch } from './playerState.js';

const waveform = [
  18, 24, 31, 26, 22, 37, 44, 35, 41, 52, 49, 47, 58, 66, 51, 44, 48, 57, 61, 55,
  43, 39, 47, 52, 46, 42, 55, 62, 68, 60, 48, 39, 34, 44, 53, 49, 45, 38, 32, 29
];

export const defaultTrackFeedback = {
  favorite: false,
  rating: 0
};

export function PlaybackServiceWarning({ health, isPlaying = false }) {
  const navidrome = health?.services?.navidrome;
  if (isPlaying || !health || navidrome?.ok !== false) return null;
  return (
    <p className="playback-warning" role="status">
      The last Navidrome connection check failed. Try Play to check playback.
    </p>
  );
}

export function SafeImage({ alt, className, fallbackIcon, loading, src }) {
  const [failedSrc, setFailedSrc] = useState('');
  const broken = !src || failedSrc === src;

  useEffect(() => {
    if (src && failedSrc && failedSrc !== src) {
      setFailedSrc('');
    }
  }, [failedSrc, src]);

  if (broken) {
    return (
      <span className={`artwork-fallback ${className || ''}`} aria-hidden={alt ? undefined : 'true'}>
        {fallbackIcon || <Disc3 size={32} />}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable={false}
      onError={() => setFailedSrc(src)}
    />
  );
}

export function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(total / 60);
  const remainder = Math.floor(total % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function MiniPlayer({ outputLabel, externalOutput = false, remoteOutput = false, onOpenOutput, paletteStyle, controls, isPlaying, nowPlaying, onControlsChange, onNext, onOpen, onOpenQueue, onPrevious, onSeek, onToggle, onTrackFeedbackChange, playbackState, playHistoryCount, queue, trackFeedback, transportMessage = '', transportStatus = 'paused', volume, onVolumeChange }) {
  if (!nowPlaying) return null;
  const duration = playbackState?.duration || 0;
  const currentTime = playbackState?.currentTime || 0;
  const progress = duration > 0 ? currentTime / duration : 0;
  const queueIndex = Number.isInteger(queue?.index) ? queue.index : -1;
  const canGoPrevious = !nowPlaying?.id?.startsWith('radio:') && queueIndex >= 0;
  const canGoNext = !nowPlaying?.id?.startsWith('radio:') && (controls?.repeatAll && queueIndex>=0 ? true : controls?.shuffle ? (queue?.items?.length || 0) > 1 : queueIndex >= 0 && queueIndex < (queue?.items?.length || 0) - 1);
  const title = nowPlaying.title || 'Unknown title';
  const artist = nowPlaying.artist || 'Unknown artist';
  const accessibleTitle = title.length > 120 ? `${title.slice(0, 119)}…` : title;
  const accessibleArtist = artist.length > 120 ? `${artist.slice(0, 119)}…` : artist;

  return (
    <div className="mini-player" style={paletteStyle}>

      <button
        className="mini-hit"
        type="button"
        aria-label={`Open now playing: ${accessibleTitle} by ${accessibleArtist}`}
        onClick={onOpen}
      >
        <TrackArtwork src={nowPlaying.artwork} alt="" />
        <div className="mini-copy">
          <span className="mini-track-copy track-copy-motion" key={nowPlaying.id}><strong title={title}>{title}</strong>
          <span title={artist}>{artist}</span></span>
          {transportMessage && (
            <span className={`transport-state transport-state-${transportStatus}`} role="status" aria-live="polite">
              {['loading', 'buffering'].includes(transportStatus) ? <LoadingDots label={transportStatus === 'buffering' ? 'Buffering audio' : 'Loading audio'}/> : <><i aria-hidden="true" />{transportMessage}</>}
            </span>
          )}
        </div>
        <div className="mini-progress" aria-hidden="true">
          <ProgressRail progress={progress} compact />
        </div>
      </button>
      <div className="mini-transport" role="group" aria-label="Playback controls">
        {onOpenOutput && <button type="button" className={`output-trigger${remoteOutput || externalOutput ? ' output-trigger-remote' : ''}`} onClick={onOpenOutput} aria-label={`Play on another output: ${outputLabel}`} title={outputLabel}><Cast size={21}/></button>}
        <button type="button" aria-label="Previous track" disabled={!canGoPrevious} onClick={onPrevious}><SkipBack size={21} /></button>
        <button className="mini-pause" type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={onToggle}>
          {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        </button>
        <button type="button" aria-label="Next track" disabled={!canGoNext} onClick={onNext}><SkipForward size={21} /></button>
      </div>
      <div className="mini-tools">
        <span className="mini-time">{formatDuration(currentTime)} / {formatDuration(duration)}</span>
        <ProgressRail progress={progress} onSeek={onSeek} disabled={!duration || !playbackState?.canSeek} compact />
        <div className="mini-secondary-controls" role="group" aria-label="Playback options">
          <button
            type="button"
            aria-label={trackFeedback?.favorite ? 'Unfavorite track' : 'Favorite track'}
            className={trackFeedback?.favorite ? 'active' : ''}
            onClick={() => onTrackFeedbackChange?.(favoriteFeedbackPatch())}
          ><Heart size={18} fill={trackFeedback?.favorite ? 'currentColor' : 'none'} /></button>
          <button
            type="button"
            disabled={nowPlaying?.id?.startsWith('radio:')}
            aria-label={controls?.shuffle ? 'Disable shuffle' : 'Shuffle queue'}
            className={controls?.shuffle ? 'active' : ''}
            onClick={() => onControlsChange?.({ shuffle: !controls?.shuffle })}
          ><Shuffle size={18} /></button>
          <button
            type="button"
            disabled={nowPlaying?.id?.startsWith('radio:')}
            aria-label={repeatLabel(controls)}
            className={repeatMode(controls)!=='off' ? 'active' : ''}
            onClick={() => onControlsChange?.(nextRepeatControls(controls))}
          >{repeatMode(controls)==='one'?<Repeat1 size={18}/>:<Repeat2 size={18}/>}</button>
        </div>
        <label className="mini-volume">
          <Volume2 size={18} />
          <span className="sr-only">Volume</span>
          <input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={onVolumeChange} />
        </label>
        <button className="mini-queue" type="button" aria-label="Open queue" onClick={onOpenQueue}><ListMusic size={21} /></button>
      </div>
    </div>
  );
}

export function PlaylistPicker({ busy, error, loading, onAdd, onClose, onCreate, open, playlists, trackTitle }) {
  const [name, setName] = useState('');
  const headingId = useId();
  const dialogRef = useRef(null);
  const headingRef = useRef(null);
  const layerRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const layer = layerRef.current;
      if (!layer) return;
      Object.assign(layer.style, {
        top: `${viewport?.offsetTop || 0}px`,
        left: `${viewport?.offsetLeft || 0}px`,
        width: `${viewport?.width || window.innerWidth}px`,
        height: `${viewport?.height || window.innerHeight}px`
      });
    };
    updateViewport();
    // Start with the task heading; the keyboard is only needed to create a list.
    headingRef.current?.focus({ preventScroll: true });
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setName('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleDialogKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const focusable = [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKey);
    return () => document.removeEventListener('keydown', handleDialogKey);
  }, [onClose, open]);

  if (!open) return null;
  return createPortal(
    <div ref={layerRef} className="playlist-dialog-layer" role="presentation">
      <button className="playlist-dialog-scrim" type="button" aria-label="Close playlist picker" onClick={onClose} />
      <section ref={dialogRef} className="playlist-dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header>
          <div>
            <p>Save track</p>
            <h2 ref={headingRef} tabIndex={-1} id={headingId}>Add “{trackTitle || 'track'}” to a playlist</h2>
          </div>
          <button type="button" aria-label="Close playlist picker" disabled={busy} onClick={onClose}><ChevronDown size={22} /></button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); onCreate?.(name); }}>
          <label>
            <span>New playlist name</span>
            <input maxLength="200" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !name.trim()}><Plus size={17} /> Create with track</button>
        </form>
        {error && <p className="inline-warning" role="alert">{error}</p>}
        {loading ? <p className="empty-state">Loading playlists...</p> : (
          <div className="playlist-picker-list">
            {playlists.map((playlist) => (
              <button key={playlist.id} type="button" disabled={busy} onClick={() => onAdd?.(playlist)}>
                <span><ListMusic size={18} /></span>
                <span><strong>{playlist.name || 'Untitled Playlist'}</strong><small>{playlist.songCount || 0} tracks</small></span>
                <Plus size={18} />
              </button>
            ))}
            {!playlists.length && !error && <p className="empty-state">No playlists yet. Create the first one above.</p>}
          </div>
        )}
      </section>
    </div>, document.body
  );
}

export function PlayerSheet({
  sleepTimer,
  onDownloadTrack, onOpenAlbum, onOpenArtist,
  outputLabel, externalOutput = false, remoteOutput = false, onOpenOutput,
  paletteStyle,
  canUndoQueueEdit,
  controls,
  health,
  isPlaying,
  nowPlaying,
  notice,
  open,
  onClose,
  onNext,
  onPrevious,
  onQueueSelect,
  onClearUpcoming,
  downloadState, onDownloadQueue,
  onMoveQueueItem,
  onRemoveQueueItem,
  onUndoQueueEdit,
  onSeek,
  onToggle,
  onControlsChange,
  onClearGenerated,
  onClearPlayed,
  onAddToQueue,
  onAddToPlaylist,
  onPlayNext,
  onShareTrack,
  onTrackFeedbackChange,
  onStartArtistDj,
  onOpenJourneys,
  onStartSonicRadio,
  onStopSonicRadio,
  onSaveSonicRadio,
  onDismissSonicRadio,
  atlasJourneyActive,
  onDislikeAtlasJourney,
  onUnavailable,
  playbackState,
  transportMessage,
  transportStatus,
  playHistoryCount,
  queue,
  queueEntryRef,
  shufflePoolCount,
  trackFeedback,
  waveformState,
  onRetryLyrics,
  lyricsState,
  sonicRadioActive,
  sonicRadioState,
  sonicSavePending,
  queueActionDisabledReason
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragStart, setDragStart] = useState(null);
  const sheetRef = useRef(null);
  const active = Boolean(open && nowPlaying);
  const rendered = useExitPresence(active,sheetRef,undefined,'.player-panel');
  const inspectorOpen = controls?.panel === 'queue' || controls?.panel === 'lyrics';

  const closeSheet = useCallback(() => {
    setDragOffset(0);
    setDragStart(null);
    onControlsChange?.({ panel: '' });
    onClose();
  }, [onClose, onControlsChange]);


  useEffect(() => {
    if (!active) return undefined;
    const closeWithEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.playlist-dialog-layer')) return;
      if (inspectorOpen) return;
      event.preventDefault();
      closeSheet();
    };
    document.addEventListener('keydown', closeWithEscape);
    return () => document.removeEventListener('keydown', closeWithEscape);
  }, [active, closeSheet, inspectorOpen]);

  if (!rendered && !active) return null;

  const startDrag = (event) => {
    const target = event.target;
    const isControl = target instanceof Element && target.closest('button, input, select, textarea, [role="slider"], .player-action-panel');
    const isGrabber = target instanceof Element && target.classList.contains('grabber');
    if (isControl && !isGrabber) return;
    if (!isGrabber && event.currentTarget.scrollTop > 0) return;
    setDragStart(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event) => {
    if (dragStart === null) return;
    setDragOffset(Math.max(0, event.clientY - dragStart));
  };

  const endDrag = () => {
    if (dragOffset > 110) {
      closeSheet();
    }
    setDragOffset(0);
    setDragStart(null);
  };

  return (
    <div ref={sheetRef} style={paletteStyle} className={`player-sheet ${active ? 'open' : ''}`} aria-hidden={!active} inert={!active}>
      <button
        className="sheet-scrim"
        type="button"
        aria-label="Close player backdrop"
        disabled={!active}
        onClick={closeSheet}
      />
      <Player
        sleepTimer={sleepTimer}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={onOpenAlbum}
        onDownloadTrack={onDownloadTrack}
        outputLabel={outputLabel} externalOutput={externalOutput} remoteOutput={remoteOutput} onOpenOutput={onOpenOutput}
        active={active}
        controls={controls}
        health={health}
        isPlaying={isPlaying}
        nowPlaying={nowPlaying}
        notice={notice}
        onNext={onNext}
        onPrevious={onPrevious}
        onQueueSelect={onQueueSelect}
        onClearUpcoming={onClearUpcoming}
        downloadState={downloadState} onDownloadQueue={onDownloadQueue}
        onMoveQueueItem={onMoveQueueItem}
        onRemoveQueueItem={onRemoveQueueItem}
        onUndoQueueEdit={onUndoQueueEdit}
        canUndoQueueEdit={canUndoQueueEdit}
        onClearGenerated={onClearGenerated}
        onClearPlayed={onClearPlayed}
        onSeek={onSeek}
        onControlsChange={onControlsChange}
        onAddToQueue={onAddToQueue}
        onAddToPlaylist={onAddToPlaylist}
        onPlayNext={onPlayNext}
        onShareTrack={onShareTrack}
        onTrackFeedbackChange={onTrackFeedbackChange}
        onStartArtistDj={onStartArtistDj}
        onOpenJourneys={onOpenJourneys}
        onStartSonicRadio={onStartSonicRadio}
        onStopSonicRadio={onStopSonicRadio}
        onSaveSonicRadio={onSaveSonicRadio}
        onDismissSonicRadio={onDismissSonicRadio}
        atlasJourneyActive={atlasJourneyActive}
        onDislikeAtlasJourney={onDislikeAtlasJourney}
        onUnavailable={onUnavailable}
        playbackState={playbackState}
        transportMessage={transportMessage}
        transportStatus={transportStatus}
        playHistoryCount={playHistoryCount}
        queue={queue}
        queueEntryRef={queueEntryRef}
        shufflePoolCount={shufflePoolCount}
        trackFeedback={trackFeedback}
        dragOffset={dragOffset}
        dragging={dragStart !== null}
        onClose={closeSheet}
        onToggle={onToggle}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        waveformState={waveformState}
        onRetryLyrics={onRetryLyrics}
        lyricsState={lyricsState}
        sonicRadioActive={sonicRadioActive}
        sonicRadioState={sonicRadioState}
        sonicSavePending={sonicSavePending}
        queueActionDisabledReason={queueActionDisabledReason}
      />
    </div>
  );
}

function Player({
  sleepTimer,
  onDownloadTrack, onOpenAlbum, onOpenArtist,
  outputLabel, externalOutput = false, remoteOutput = false, onOpenOutput,
  canUndoQueueEdit,
  active,
  controls,
  health,
  isPlaying,
  nowPlaying,
  notice,
  onNext,
  onPrevious,
  onQueueSelect,
  onClearUpcoming,
  downloadState, onDownloadQueue,
  onMoveQueueItem,
  onRemoveQueueItem,
  onUndoQueueEdit,
  onSeek,
  onUnavailable,
  playbackState,
  transportMessage = '',
  transportStatus = 'paused',
  queue,
  queueEntryRef,
  dragOffset = 0,
  dragging = false,
  onClose,
  onControlsChange,
  onClearGenerated,
  onClearPlayed,
  onAddToQueue,
  onAddToPlaylist,
  onPlayNext,
  onShareTrack,
  onTrackFeedbackChange,
  onStartArtistDj,
  onOpenJourneys,
  onStartSonicRadio,
  onStopSonicRadio,
  onSaveSonicRadio,
  onDismissSonicRadio,
  atlasJourneyActive,
  onDislikeAtlasJourney,
  onToggle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  playHistoryCount = 0,
  shufflePoolCount = 0,
  trackFeedback,
  waveformState,
  lyricsState,
  onRetryLyrics,
  sonicRadioActive,
  sonicRadioState,
  sonicSavePending,
  queueActionDisabledReason
}) {
  const controlState = controls || {};
  const actionMenuId = useId();
  const playerPanelRef = useRef(null);
  const actionAnchorRef = useRef(null);
  const actionMenuRef = useRef(null);
  const actionTriggerRef = useRef(null);
  const queueTriggerRef = useRef(null);
  const lyricsTriggerRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sleepOptions, setSleepOptions] = useState(false);
  const restoreActionFocus = useRef(false);
  const actionsPresent = useExitPresence(actionsOpen, actionMenuRef, () => {
    setSleepOptions(false);
    setDrawerOffset(0);
    setActionMenuPosition(null);
    if (restoreActionFocus.current) actionTriggerRef.current?.focus();
    restoreActionFocus.current = false;
  });
  const drawerDrag=useRef(null);
  const drawerDragged=useRef(false);
  const [drawerOffset,setDrawerOffset]=useState(0);
  const [drawerInteracted,setDrawerInteracted]=useState(false);
  const [actionMenuPlacement, setActionMenuPlacement] = useState('above');
  const [actionMenuPosition, setActionMenuPosition] = useState(null);
  const [desktopInspector, setDesktopInspector] = useState(() => Boolean(window.matchMedia?.('(min-width: 900px)').matches));
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 900px)');
    if (!media) return undefined;
    const update = () => setDesktopInspector(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const queueOpen = controls?.panel === 'queue';
  const lyricsOpen = controls?.panel === 'lyrics';
  const inspectorOpen = queueOpen || lyricsOpen;

  useLayoutEffect(() => {
    if (inspectorOpen && playerPanelRef.current) {
      playerPanelRef.current.scrollTop = 0;
      playerPanelRef.current.querySelector('.player-inspector-switch [aria-selected="true"]')?.focus();
    }
  }, [inspectorOpen]);

  const closeActionMenu = useCallback((restoreFocus = false) => {
    restoreActionFocus.current = restoreFocus;
    drawerDrag.current = null;
    setActionsOpen(false);
  }, []);

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const dismissOutside = (event) => {
      if (actionMenuRef.current?.contains(event.target) || actionTriggerRef.current?.contains(event.target)) return;
      closeActionMenu(false);
    };
    const dismissWithEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeActionMenu(true);
    };
    const dismissOnResize = () => closeActionMenu(true);
    window.addEventListener('resize', dismissOnResize);
    window.visualViewport?.addEventListener('resize', dismissOnResize);
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissWithEscape, true);
    return () => {
      window.removeEventListener('resize', dismissOnResize);
      window.visualViewport?.removeEventListener('resize', dismissOnResize);
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissWithEscape, true);
    };
  }, [actionsOpen, closeActionMenu]);

  // Position the portal before paint. Do not hide its initial render: inherited
  // hidden visibility can survive into the focus task when motion is disabled.
  useLayoutEffect(() => {
    if (!actionsOpen) return;
    actionMenuRef.current.scrollTop=0;
    const panel = playerPanelRef.current;
    const anchor = actionAnchorRef.current;
    const menu = actionMenuRef.current;
    if (!panel || !anchor || !menu) return;
    const anchorRect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportWidth = viewport?.width || window.innerWidth;
    if (viewportWidth < 900) {
      setActionMenuPlacement('drawer');
      setActionMenuPosition({position:'fixed',left:viewportLeft,right:'auto',bottom:'auto',top:viewportTop + viewportHeight * .25,width:viewportWidth,height:viewportHeight * .75,maxHeight:viewportHeight * .75,visibility:'visible'});
      return;
    }
    const spaceAbove = Math.max(0, anchorRect.top - viewportTop - 20);
    const spaceBelow = Math.max(0, viewportTop + viewportHeight - anchorRect.bottom - 20);
    const below = spaceBelow > spaceAbove;
    const height = Math.min(sleepOptions ? 460 : 320, menu.scrollHeight, below ? spaceBelow : spaceAbove);
    const width = Math.min(280, viewportWidth - 24);
    setActionMenuPlacement(below ? 'below' : 'above');
    setActionMenuPosition({
      position: 'fixed', bottom: 'auto', right: 'auto', width,
      left: Math.max(viewportLeft + 12, Math.min(anchorRect.right - width, viewportLeft + viewportWidth - width - 12)),
      top: below ? anchorRect.bottom + 8 : Math.max(viewportTop + 12, anchorRect.top - height - 8),
      maxHeight: height, visibility: 'visible'
    });
  }, [actionsOpen, sleepOptions]);

  // Let the positioned portal's visibility/inert state settle before focusing.
  // This must not depend on animation frames (reduced motion/background tabs).
  useEffect(() => {
    if (!actionsOpen || !actionMenuPosition) return;
    const selector = sleepOptions
      ? '[aria-label="Back to track actions"]'
      : '[role="menuitem"]:not(.player-drawer-handle):not(:disabled)';
    const focusTask = window.setTimeout(() => {
      actionMenuRef.current?.querySelector(selector)?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(focusTask);
  }, [actionsOpen, sleepOptions, actionMenuPosition]);

  useEffect(() => {
    setActionsOpen(false);
    if (!active) clearQueueEntry(queueEntryRef);
  }, [active, nowPlaying?.id]);

  const closeQueue = useCallback(() => {
    finishQueueEntry(queueEntryRef, {
      closePanel: () => onControlsChange?.({ panel: '' }),
      closePlayer: onClose,
      scheduleFocus: window.requestAnimationFrame
    });
  }, [onClose, onControlsChange, queueEntryRef]);

  const selectQueueItem = useCallback((itemIndex, sourceQueue, options) => {
    onQueueSelect?.(itemIndex, sourceQueue, options);
    finishQueueEntry(queueEntryRef, {
      closePanel: () => onControlsChange?.({ panel: '' }),
      closePlayer: onClose,
      preservePlayer: true,
      scheduleFocus: window.requestAnimationFrame
    });
  }, [onClose, onControlsChange, onQueueSelect, queueEntryRef]);

  if (!nowPlaying) return null;
  const duration = playbackState?.duration || 0;
  const currentTime = playbackState?.currentTime || 0;
  const canSeek = playbackState?.canSeek === true;
  const progress = duration > 0 ? currentTime / duration : 0;
  const feedbackState = trackFeedback || defaultTrackFeedback;
  const queueItems = queue?.items || [];
  const queueIndex = Number.isInteger(queue?.index) ? queue.index : -1;
  const canGoPrevious = !nowPlaying?.id?.startsWith('radio:') && queueIndex >= 0;
  const canGoNext = !nowPlaying?.id?.startsWith('radio:') && (controlState.repeatAll && queueIndex>=0 ? true : controlState.shuffle ? queueItems.length > 1 : queueIndex >= 0 && queueIndex < queueItems.length - 1);
  // setControlState is only for queue/player controls; favorite and rating use onTrackFeedbackChange.
  const setControlState = (patch) => onControlsChange?.(patch);
  const setFavorite = () => onTrackFeedbackChange?.(favoriteFeedbackPatch());
  const setRating = (rating) => onTrackFeedbackChange?.(ratingFeedbackPatch(rating));
  const chooseFavoriteAction = () => {
    setFavorite();
    closeActionMenu(true);
  };
  const showQueueFromActions = () => {
    setQueueEntry(queueEntryRef, actionTriggerRef.current);
    setActionsOpen(false);
    setControlState({ panel: 'queue' });
  };
  const toggleQueueFromTopline = () => {
    if (queueOpen) {
      closeQueue();
      return;
    }
    setQueueEntry(queueEntryRef, queueTriggerRef.current);
    setControlState({ panel: 'queue' });
  };
  const toggleLyricsFromTopline = () => {
    if (lyricsOpen) {
      closeQueue();
      return;
    }
    setQueueEntry(queueEntryRef, lyricsTriggerRef.current);
    setControlState({ panel: 'lyrics' });
  };
  const shareFromActions = () => {
    onShareTrack?.();
    closeActionMenu(true);
  };
  const addToPlaylistFromActions = () => {
    closeActionMenu(false);
    onAddToPlaylist?.(actionTriggerRef.current);
  };
  const playNextFromActions = () => {
    const item = queueItems[queueIndex];
    onPlayNext?.(item?.song, item?.album);
    closeActionMenu(true);
  };
  const addToQueueFromActions = () => {
    const item = queueItems[queueIndex];
    onAddToQueue?.(item?.song, item?.album);
    closeActionMenu(true);
  };
  const togglePauseAfterCurrentFromActions = () => {
    setControlState({ pauseAfterCurrent: !controlState.pauseAfterCurrent });
    closeActionMenu(true);
  };
  const startJourneyFromActions = () => {
    closeActionMenu(false);
    onStartSonicRadio?.();
  };
  const startArtistDjFromActions = () => {
    closeActionMenu(false);
    onStartArtistDj?.();
  };
  const stopJourneyFromActions = () => {
    closeActionMenu(false);
    onStopSonicRadio?.();
  };
  const saveJourneyFromActions = () => {
    closeActionMenu(false);
    onSaveSonicRadio?.();
  };
  const dismissJourneyFromActions = () => {
    closeActionMenu(false);
    onDismissSonicRadio?.();
  };
  const dislikeAtlasStopFromActions = () => {
    closeActionMenu(false);
    onDislikeAtlasJourney?.();
  };
  const navigateActionMenu = (event) => {
    const items = [...(actionMenuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    if (!items.length) return;
    const focusedIndex = items.indexOf(document.activeElement);
    const currentIndex = focusedIndex >= 0 ? focusedIndex : 0;
    let nextIndex = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (event.key === 'Tab') {
      if (actionMenuPlacement === 'drawer') {
        event.preventDefault();
        items[(currentIndex + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      } else closeActionMenu(false);
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex].focus();
  };
  return (
    <section
      ref={playerPanelRef}
      className={`player-panel ${inspectorOpen ? 'panel-open' : ''} ${queueOpen ? 'queue-open' : ''} ${lyricsOpen ? 'lyrics-open' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ '--drag-offset': `${dragOffset}px` }}
      aria-label="Now playing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onScroll={() => actionsOpen && closeActionMenu(actionMenuRef.current?.contains(document.activeElement))}
    >
      <div className="player-content" inert={(inspectorOpen && !desktopInspector) || (actionsOpen && actionMenuPlacement === 'drawer')} aria-hidden={(inspectorOpen && !desktopInspector) || (actionsOpen && actionMenuPlacement === 'drawer') ? true : undefined}>
      <button
        className="grabber"
        type="button"
        aria-label="Swipe down or tap to close player"
        onClick={onClose}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown(event);
        }}
      />
      <div className="player-topline">
        <button type="button" aria-label="Close player" onClick={onClose}><ChevronDown size={24} /></button>
        <div ref={actionAnchorRef} className="player-actions-anchor">
          <button
            ref={actionTriggerRef}
            type="button"
            aria-label="More track actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            aria-controls={actionsOpen ? actionMenuId : undefined}
            className={actionsOpen ? 'active' : ''}
            onClick={() => {if(actionsOpen){closeActionMenu(true);}else{restoreActionFocus.current=false;setDrawerInteracted(false);setDrawerOffset(0);setSleepOptions(false);setActionsOpen(true);}}}
          >
            <MoreHorizontal size={27} />
          </button>
          {actionsPresent && createPortal(
            <><button className={`player-actions-scrim${actionsOpen ? '' : ' is-exiting'}`} inert={!actionsOpen} aria-label="Close track actions" type="button" onClick={()=>closeActionMenu(true)}/><div
              ref={actionMenuRef}
              id={actionMenuId}
              className={`player-action-panel actions opens-${actionMenuPlacement}${drawerDrag.current ? ' is-dragging' : ''}`}
              inert={!actionsOpen}
              aria-hidden={!actionsOpen}
              style={{...(actionMenuPosition || {}),...(drawerInteracted?{transform:`translateY(${drawerOffset}px)`,animation:'none'}:{})}}
              role="menu"
              aria-label={sleepOptions ? "Sleep timer" : "Track actions"}
              onKeyDown={navigateActionMenu}
            >
              {actionMenuPlacement==='drawer'&&<button type="button" className="player-drawer-handle" role="menuitem" aria-label="Close track actions" onClick={()=>{if(drawerDragged.current){drawerDragged.current=false;return;}closeActionMenu(true);}}
                onPointerDown={event=>{if(event.isPrimary===false||event.button>0)return;drawerDragged.current=false;setDrawerInteracted(true);drawerDrag.current={id:event.pointerId,y:event.clientY,at:performance.now()};event.currentTarget.setPointerCapture(event.pointerId);}}
                onPointerMove={event=>{const drag=drawerDrag.current;if(drag?.id===event.pointerId)setDrawerOffset(Math.max(0,event.clientY-drag.y));}}
                onPointerUp={event=>{const drag=drawerDrag.current;if(drag?.id!==event.pointerId)return;const distance=Math.max(0,event.clientY-drag.y);drawerDragged.current=distance>8;drawerDrag.current=null;if(distance>70||distance>24&&distance/Math.max(1,performance.now()-drag.at)>.5)closeActionMenu(true);else setDrawerOffset(0);}}
                onPointerCancel={()=>{drawerDrag.current=null;setDrawerOffset(0);}}><span/></button>}
              <div key={sleepOptions ? 'sleep' : 'actions'} className="player-action-content">
              {!sleepOptions && <>
              <div className="player-action-featured">
              {onOpenArtist&&<button type="button" role="menuitem" onClick={()=>{closeActionMenu(false);onOpenArtist();}}><UserRound size={23}/><span>Go to artist</span></button>}
              {onOpenAlbum&&<button type="button" role="menuitem" onClick={()=>{closeActionMenu(false);onOpenAlbum();}}><Disc3 size={23}/><span>Go to album</span></button>}
              {onDownloadTrack&&<button type="button" role="menuitem" onClick={()=>{closeActionMenu(false);onDownloadTrack();}}><Download size={23}/><span>Download track</span></button>}
              </div>
              <button type="button" role="menuitem" onClick={chooseFavoriteAction}>
                <Heart size={19}/>{feedbackState.favorite ? 'Remove Favorite' : 'Add Favorite'}
              </button>
              <div className="player-rating-actions" role="group" aria-label="Rate this track">{[1, 2, 3, 4, 5].map(rating => <button key={rating} type="button" role="menuitem" aria-label={`Set rating ${rating}`} onClick={() => { setRating(rating); closeActionMenu(true); }}><Star size={19} fill={feedbackState.rating === rating ? 'currentColor' : 'none'}/><span className="sr-only">{rating} {rating === 1 ? 'star' : 'stars'}</span></button>)}</div>
              <button type="button" role="menuitem" disabled={Boolean(queueActionDisabledReason)} title={queueActionDisabledReason || undefined} onClick={playNextFromActions}><SkipForward size={19}/>Play next</button>
              <button type="button" role="menuitem" disabled={Boolean(queueActionDisabledReason)} title={queueActionDisabledReason || undefined} onClick={addToQueueFromActions}><ListMusic size={19}/>Add to queue</button>
              <button type="button" role="menuitem" aria-pressed={Boolean(controlState.pauseAfterCurrent)} onClick={togglePauseAfterCurrentFromActions}>
                <Pause size={19}/>{controlState.pauseAfterCurrent ? 'Cancel pause after current' : 'Pause after current'}
              </button>
              {sleepTimer && <button type="button" role="menuitem" disabled={sleepTimer.busy || Boolean(sleepTimer.unavailable)} title={sleepTimer.unavailable || undefined} onClick={()=>setSleepOptions(true)}>
                <Moon size={19}/>{sleepTimer.deadline ? `Sleep timer · ${sleepTimer.label} remaining` : 'Sleep timer'}
              </button>}
              {sleepTimer?.unavailable && <p className="sleep-timer-hint">{sleepTimer.unavailable}</p>}
              {atlasJourneyActive && <button type="button" role="menuitem" onClick={dislikeAtlasStopFromActions}><SkipForward size={19}/>Dislike and skip this Journey stop</button>}
              {onOpenJourneys && <button type="button" role="menuitem" onClick={()=>{closeActionMenu(false);onOpenJourneys();}}><Sparkles size={19}/>Choose a Journey...</button>}
              {!onOpenJourneys && !sonicRadioActive && sonicRadioState?.status !== 'stopped' && (
                <>
                  <button type="button" role="menuitem" onClick={startJourneyFromActions}><Sparkles size={19}/>Start Track Journey</button>
                  {nowPlaying.artistId && <button type="button" role="menuitem" onClick={startArtistDjFromActions}><Sparkles size={19}/>Start Artist DJ from this artist</button>}
                </>
              )}
              {sonicRadioActive && (
                <button type="button" role="menuitem" onClick={stopJourneyFromActions}><Pause size={19}/>Stop Journey</button>
              )}
              {sonicRadioState?.status === 'stopped' && (
                <>
                  <button type="button" role="menuitem" aria-busy={sonicSavePending} disabled={sonicSavePending} onClick={saveJourneyFromActions}>
                    <Plus size={19}/>{sonicSavePending ? 'Saving Journey...' : 'Save Journey as Playlist'}
                  </button>
                  <button type="button" role="menuitem" disabled={sonicSavePending} onClick={dismissJourneyFromActions}><ChevronDown size={19}/>Dismiss Journey</button>
                </>
              )}
              <button type="button" role="menuitem" onClick={showQueueFromActions}><ListMusic size={19}/>Open Queue</button>
              <button type="button" role="menuitem" onClick={addToPlaylistFromActions}><Plus size={19}/>Add to Playlist...</button>
              <button type="button" role="menuitem" onClick={shareFromActions}><Share2 size={19}/>Share</button>
              </>}
              {sleepOptions && sleepTimer && <>
                <button type="button" role="menuitem" aria-label="Back to track actions" onClick={()=>setSleepOptions(false)}><ChevronLeft size={19}/>Sleep timer</button>
                {sleepTimer.deadline>0 && <p className="sleep-timer-hint">{sleepTimer.label} remaining</p>}
                <div role="group" aria-label="Sleep timer duration" className="sleep-timer-options">
                  {SLEEP_TIMER_MINUTES.map(minutes=><button key={minutes} type="button" role="menuitem" disabled={sleepTimer.busy} onClick={async()=>{if(await sleepTimer.set(minutes))closeActionMenu(true);}}><Moon size={19}/>{minutes} minutes</button>)}
                  {sleepTimer.deadline>0 && <button type="button" role="menuitem" disabled={sleepTimer.busy} onClick={async()=>{if(await sleepTimer.set(0))closeActionMenu(true);}}>Cancel sleep timer</button>}
                </div>
              </>}
              </div>
            </div></>, document.body
          )}
        </div>
      </div>

      <div className="art-stage">
        <TrackArtwork className="cover-art" src={nowPlaying.artwork} alt={`${nowPlaying.album} album artwork`} />
      </div>

      <div className="player-details" onScroll={() => actionsOpen && closeActionMenu(false)}>
      <div className="track-copy track-copy-motion" key={nowPlaying.id}>
        <h1>{nowPlaying.title}</h1>
        <p className="artist">{onOpenArtist ? <button type="button" className="player-album-link" onClick={onOpenArtist} aria-label={`Go to artist: ${nowPlaying.artist}`}>{nowPlaying.artist}</button> : nowPlaying.artist}</p>
        {nowPlaying.radioTitle&&<p className="radio-now-title" aria-live="polite">{nowPlaying.radioTitle}</p>}
        {nowPlaying.radioHistory?.length>1&&<details className="radio-history"><summary>Recently on this station</summary><ol>{nowPlaying.radioHistory.slice(1).map((title,i)=><li key={`${i}:${title}`}>{title}</li>)}</ol></details>}
        <p>{onOpenAlbum ? <button className="player-album-link" type="button" onClick={onOpenAlbum} aria-label={`Go to album: ${nowPlaying.album}`}>{nowPlaying.album}</button> : nowPlaying.album}</p>
        {transportMessage && (
          <p className={`player-transport-state transport-state-${transportStatus}`}>
            {['loading', 'buffering'].includes(transportStatus) ? <LoadingDots label={transportStatus === 'buffering' ? 'Buffering audio' : 'Loading audio'}/> : <><i aria-hidden="true" />{transportMessage}</>}
          </p>
        )}
      </div>

      <div className="wave-row no-waveform">
        <span>{formatDuration(currentTime)}</span>
        <ProgressRail progress={progress} onSeek={onSeek} disabled={!duration || !canSeek} />
        <span>{duration ? `-${formatDuration(Math.max(0, duration - currentTime))}` : nowPlaying.remaining}</span>
      </div>

      <div className="quality-row">
        <span className="received-stream-info">{receivedStreamSummary(remoteOutput ? nowPlaying.delivery : playbackState?.delivery)}</span>
      </div>

      <div className="rating-row player-quick-actions" aria-label="Track actions">
        <button
          type="button"
          aria-label={feedbackState.favorite ? 'Unfavorite track' : 'Favorite track'}
          className={feedbackState.favorite ? 'active' : ''}
          onClick={setFavorite}
        >
          <Heart size={27} fill={feedbackState.favorite ? 'currentColor' : 'none'} />
        </button>
        <span className="player-view-tabs" data-active={lyricsOpen ? 'lyrics' : queueOpen ? 'queue' : 'none'}>
        <button ref={lyricsTriggerRef} type="button" aria-label="Open lyrics" aria-pressed={lyricsOpen} className={lyricsOpen ? 'active' : ''} onClick={toggleLyricsFromTopline}><Captions size={19} /><span>Lyrics</span></button>
        <button ref={queueTriggerRef} type="button" aria-label="Open queue" aria-pressed={queueOpen} className={queueOpen ? 'active' : ''} onClick={toggleQueueFromTopline}><ListMusic size={19} /><span>Queue</span></button>
        </span>
          {onOpenJourneys && <button type="button" aria-label="Choose a Journey" onClick={onOpenJourneys}><Sparkles size={19}/></button>}
          {onOpenOutput && <button type="button" className={`output-trigger${remoteOutput || externalOutput ? ' output-trigger-remote' : ''}`} onClick={onOpenOutput} aria-label={`Play on another output: ${outputLabel}`} title={outputLabel}><Cast size={19}/></button>}

      </div>
      <div className="transport">
        <button type="button" disabled={nowPlaying?.id?.startsWith('radio:')} aria-label={controlState.shuffle ? 'Disable shuffle' : 'Shuffle queue'} className={controlState.shuffle ? 'active' : ''} onClick={() => setControlState({ shuffle: !controlState.shuffle })}><Shuffle size={22} /></button>
        <button type="button" aria-label="Previous track" disabled={!canGoPrevious} onClick={onPrevious}><SkipBack size={33} /></button>
        <button className="play-button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={onToggle}>
          {isPlaying ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" />}
        </button>
        <button type="button" aria-label="Next track" disabled={!canGoNext} onClick={onNext}><SkipForward size={33} /></button>
        <button type="button" disabled={nowPlaying?.id?.startsWith('radio:')} aria-label={repeatLabel(controlState)} className={repeatMode(controlState)!=='off' ? 'active' : ''} onClick={() => setControlState(nextRepeatControls(controlState))}>{repeatMode(controlState)==='one'?<Repeat1 size={22}/>:<Repeat2 size={22}/>}</button>
      </div>

      {notice && <p className="player-notice" role="status" aria-live="polite">{notice}</p>}
      <div className="sonic-strip">
        <span><Sparkles size={16} /> {nowPlaying.mood}</span>
        <span>{nowPlaying.tempo}</span>
        <span>{nowPlaying.key}</span>
      </div>

      <PlaybackServiceWarning health={health} isPlaying={isPlaying} />
      </div>
      </div>
      {inspectorOpen && <div className="player-inspector-host" role={desktopInspector?'region':'dialog'} aria-modal={desktopInspector?undefined:true} aria-label="Player details" onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeQueue();return;}
        if(desktopInspector||event.key!=='Tab')return;
        const buttons=[...event.currentTarget.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),[tabindex="0"]')];
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }}><div className="player-inspector-tabs player-inspector-switch" role="tablist" aria-label="Player details" data-panel={queueOpen ? 'queue' : 'lyrics'}>
        {['queue','lyrics'].map(panel=><button key={panel} type="button" role="tab" aria-selected={controls.panel===panel} tabIndex={controls.panel===panel?0:-1}
          onClick={()=>onControlsChange?.({panel})} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'queue':event.key==='End'?'lyrics':panel==='queue'?'lyrics':'queue';onControlsChange?.({panel:next});event.currentTarget.parentElement.querySelector(`[data-tab="${next}"]`)?.focus();}} data-tab={panel}>
          {panel==='queue'?<ListMusic size={16}/>:<Captions size={16}/>} {panel==='queue'?'Queue':'Lyrics'}
        </button>)}
      </div>
      {queueOpen && (
        <QueueOverlay
          modal={false} sharedTabs
          continuationLabel={sonicRadioActive && sonicRadioState?.sessionKind==='journey' ? sonicRadioState.autoExtend===false ? 'Automatic continuation is off' : sonicRadioState.status==='degraded' ? 'Reconnecting to add more tracks' : 'More tracks are added as you listen' : ''}
          canUndoQueueEdit={canUndoQueueEdit}
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          controls={controlState}
          isPlaying={isPlaying}
          onClose={closeQueue}
          onClearGenerated={onClearGenerated}
          onClearPlayed={onClearPlayed}
          onClearUpcoming={onClearUpcoming}
          downloadState={downloadState} onDownloadQueue={onDownloadQueue}
        onMoveQueueItem={onMoveQueueItem}
          onNext={onNext}
          onOpenLyrics={() => setControlState({ panel: 'lyrics' })}
          onControlsChange={onControlsChange}
          onPrevious={onPrevious}
          onQueueSelect={selectQueueItem}
          onRemoveQueueItem={onRemoveQueueItem}
          onUndoQueueEdit={onUndoQueueEdit}
          onToggle={onToggle}
          queue={queue}
          shufflePoolCount={shufflePoolCount}
        />
      )}
      {lyricsOpen && (
        <LyricsOverlay
          modal={false} sharedTabs
          currentTime={currentTime}
          duration={duration}
          lyricsState={lyricsState}
          onRetry={onRetryLyrics}
          onClose={closeQueue}
          onOpenQueue={() => setControlState({ panel: 'queue' })}
          onSeek={canSeek ? onSeek : undefined}
        />
      )}
      </div>}
    </section>
  );
}

export function ProgressRail({ compact = false, disabled = false, onSeek, progress = 0 }) {
  const [preview, setPreview] = useState(null);
  const drag = useRef(null);
  const boundedProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const shown = preview ?? boundedProgress;
  const ratio = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clampSeekRatio(rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0);
  };
  const cancel = () => { drag.current = null; setPreview(null); };
  useEffect(() => { if (disabled) cancel(); }, [disabled]);
  const start = (event) => {
    if (disabled || !onSeek || event.button > 0 || drag.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = event.pointerId;
    setPreview(ratio(event));
  };
  const move = (event) => {
    if (drag.current !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    setPreview(ratio(event));
  };
  const finish = (event) => {
    if (drag.current !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const value = ratio(event);
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!disabled) onSeek?.(value);
  };
  const keySeek = (event) => {
    const steps = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05, PageDown: -0.1, PageUp: 0.1 };
    if (disabled || !onSeek) return;
    if (event.key !== 'Home' && event.key !== 'End' && !(event.key in steps)) return;
    event.preventDefault(); event.stopPropagation();
    onSeek(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : clampSeekRatio(boundedProgress + steps[event.key]));
  };
  return (
    <div
      className={`progress-rail ${compact ? 'compact' : ''}`}
      role={onSeek ? 'slider' : undefined}
      tabIndex={onSeek && !disabled ? 0 : undefined}
      aria-label={disabled ? 'Track progress unavailable until track loads' : 'Seek playback'}
      aria-disabled={disabled || undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={onSeek ? Math.round(shown * 100) : undefined}
      onPointerDown={start} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={keySeek}
    >
      <span className="progress-rail-track" />
      <span className="progress-rail-fill" style={{ width: `${shown * 100}%` }} />
      <span className="progress-rail-thumb" style={{ left: `${shown * 100}%` }} />
    </div>
  );
}

export function Waveform({ disabled = false, duration = 0, fallback = 'demo', interactive = false, onSeek, progress = 0.23, values = [] }) {
  const clipId = useId();
  const [scrubProgress, setScrubProgress] = useState(null);
  const scrubProgressRef = useRef(null);
  const seekHandlerRef = useRef(onSeek);
  const seekEnabledRef = useRef(Boolean(interactive && !disabled && onSeek));
  const disabledRef = useRef(disabled);
  const mountedRef = useRef(false);
  const keyboardSeekRef = useRef(null);
  const keyboardSeekTimerRef = useRef(0);
  const width = 400;
  const height = 52;
  const center = height / 2;
  const boundedProgress = clampSeekRatio(progress);
  const displayProgress = scrubProgress ?? boundedProgress;
  const shapeValues = Array.isArray(values) && values.length > 1
    ? values
    : fallback === 'line'
      ? [0, 0]
      : waveform;
  const step = width / Math.max(1, shapeValues.length - 1);
  const amplitude = (value) => (Math.max(0, Math.min(100, value)) / 100) * (height / 2 - 4);

  const topPoints = shapeValues.map((value, index) => {
    const x = Number((index * step).toFixed(2));
    const y = Number((center - amplitude(value)).toFixed(2));
    return `${x},${y}`;
  });

  const bottomPoints = shapeValues
    .map((value, index) => {
      const x = Number((index * step).toFixed(2));
      const y = Number((center + amplitude(value)).toFixed(2));
      return `${x},${y}`;
    })
    .reverse();

  const waveformShape = `M ${topPoints.join(' L ')} L ${bottomPoints.join(' L ')} Z`;
  const clipWidth = Math.max(0, Math.min(width, width * displayProgress));
  const durationSeconds = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const valueText = durationSeconds
    ? `${formatDuration(displayProgress * durationSeconds)} of ${formatDuration(durationSeconds)}`
    : `${Math.round(displayProgress * 100)} percent`;

  useEffect(() => {
    scrubProgressRef.current = scrubProgress;
  }, [scrubProgress]);

  useEffect(() => {
    disabledRef.current = disabled;
    seekHandlerRef.current = onSeek;
    seekEnabledRef.current = Boolean(interactive && !disabled && onSeek);
  }, [disabled, interactive, onSeek]);

  useEffect(() => {
    if (!disabled) return;
    scrubProgressRef.current = null;
    keyboardSeekRef.current = null;
    setScrubProgress(null);
  }, [disabled]);

  useEffect(() => {
    mountedRef.current = true;
    const resetScrub = (event) => {
      if (!mountedRef.current) return;
      const finalProgress = scrubProgressRef.current;
      commitPointerSeek(finalProgress, event);
    };
    window.addEventListener('pointerup', resetScrub);
    window.addEventListener('pointercancel', resetScrub);
    return () => {
      mountedRef.current = false;
      seekEnabledRef.current = false;
      seekHandlerRef.current = null;
      scrubProgressRef.current = null;
      window.removeEventListener('pointerup', resetScrub);
      window.removeEventListener('pointercancel', resetScrub);
    };
  }, []);

  useEffect(() => () => {
    if (keyboardSeekTimerRef.current) window.clearTimeout(keyboardSeekTimerRef.current);
  }, []);

  const scheduleKeyboardSeek = (nextProgress) => {
    if (keyboardSeekTimerRef.current) window.clearTimeout(keyboardSeekTimerRef.current);
    keyboardSeekRef.current = nextProgress;
    setScrubProgress(nextProgress);
    keyboardSeekTimerRef.current = window.setTimeout(() => {
      const committedProgress = keyboardSeekRef.current;
      if (committedProgress !== null && seekEnabledRef.current && !disabledRef.current) {
        seekHandlerRef.current?.(committedProgress);
      }
      keyboardSeekRef.current = null;
      setScrubProgress(null);
      keyboardSeekTimerRef.current = 0;
    }, 160);
  };

  const progressFromPointer = (event, { preventDefault = true } = {}) => {
    if (preventDefault) event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    return clampSeekRatio(rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0);
  };
  const commitPointerSeek = (finalProgress, event) => {
    scrubProgressRef.current = null;
    setScrubProgress(null);
    if (finalProgress !== null && seekEnabledRef.current && !disabledRef.current) {
      seekHandlerRef.current?.(finalProgress);
      event?.preventDefault?.();
    }
  };
  const startSeek = (event) => {
    if (!interactive || disabled || !onSeek) return;
    event.stopPropagation();
    event.currentTarget.focus?.({ preventScroll: true });
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Window-level pointer cleanup below handles unsupported capture paths.
    }
    const nextProgress = progressFromPointer(event, { preventDefault: false });
    scrubProgressRef.current = nextProgress;
    setScrubProgress(nextProgress);
  };
  const moveSeek = (event) => {
    if (scrubProgressRef.current === null) return;
    const nextProgress = progressFromPointer(event);
    scrubProgressRef.current = nextProgress;
    setScrubProgress(nextProgress);
  };
  const endSeek = (event) => {
    if (scrubProgressRef.current === null) return;
    event.preventDefault();
    event.stopPropagation();
    const nextProgress = progressFromPointer(event);
    commitPointerSeek(nextProgress, event);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be lost when the pointerup reaches us.
    }
  };
  const keySeek = (event) => {
    if (!interactive || disabled || !onSeek) return;
    const steps = {
      ArrowLeft: -0.05,
      ArrowDown: -0.05,
      ArrowRight: 0.05,
      ArrowUp: 0.05,
      PageDown: -0.1,
      PageUp: 0.1
    };
    if (event.key === 'Home') {
      event.preventDefault();
      scheduleKeyboardSeek(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      scheduleKeyboardSeek(1);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(steps, event.key)) return;
    event.preventDefault();
    const baseProgress = keyboardSeekRef.current ?? scrubProgress ?? boundedProgress;
    const nextProgress = clampSeekRatio(baseProgress + steps[event.key]);
    scheduleKeyboardSeek(nextProgress);
  };
  const content = (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={clipWidth} height={height} />
        </clipPath>
      </defs>
      <path className="waveform-base" d={waveformShape} />
      <path className="waveform-played" d={waveformShape} clipPath={`url(#${clipId})`} />
      {interactive && <circle className="waveform-thumb" cx={clipWidth} cy={center} r="4.5" />}
    </svg>
  );

  if (interactive) {
    return (
      <div
        className="waveform waveform-button"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled ? 'true' : 'false'}
        aria-label={disabled ? 'Waveform unavailable until track loads' : 'Seek playback'}
        aria-valuemax="1000"
        aria-valuemin="0"
        aria-valuenow={Math.round(displayProgress * 1000)}
        aria-valuetext={valueText}
        onKeyDown={keySeek}
        onPointerDown={startSeek}
        onPointerMove={moveSeek}
        onPointerUp={endSeek}
        onPointerCancel={endSeek}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="waveform" aria-label="Waveform scrubber">
      {content}
    </div>
  );
}
