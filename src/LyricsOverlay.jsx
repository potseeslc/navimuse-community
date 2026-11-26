import React, { useEffect, useId, useRef, useState } from 'react';
import { ListMusic, Radio, X } from 'lucide-react';
import { activeLyricsLineIndex, lyricsSeekRatio } from './lyrics.js';

export function LyricsOverlay({ modal = true, sharedTabs = false, currentTime = 0, duration = 0, lyricsState = {}, onClose, onOpenQueue, onSeek, onRetry }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const lineRefs = useRef(new Map());
  const scrollRef = useRef(null);
  const pointerStart = useRef(null);
  const onCloseRef = useRef(onClose);
  const [following, setFollowing] = useState(true);
  const ready = lyricsState.status === 'ready' && lyricsState.lines?.length > 0;
  const synced = ready && lyricsState.synced === true;
  const activeIndex = synced
    ? activeLyricsLineIndex(lyricsState.lines, currentTime, lyricsState.offsetMs)
    : -1;

  onCloseRef.current = onClose;

  useEffect(() => {
    setFollowing(true);
  }, [lyricsState.songId]);

  useEffect(() => {
    if (sharedTabs) return;
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const dismissWithEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', dismissWithEscape, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', dismissWithEscape, true);
    };
  }, [sharedTabs]);

  useEffect(() => {
    if (!following || activeIndex < 0) return;
    const line = lineRefs.current.get(activeIndex);
    const scroller = scrollRef.current;
    if (!line || !scroller) return;
    const lineBounds = line.getBoundingClientRect();
    const scrollBounds = scroller.getBoundingClientRect();
    // Scroll only lyrics; scrollIntoView can also move the player and its header.
    scroller.scrollTo({
      top: Math.max(0, scroller.scrollTop + lineBounds.top - scrollBounds.top - (scroller.clientHeight - lineBounds.height) / 2),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }, [activeIndex, following, lyricsState.songId, lyricsState.lines]);

  const containFocus = (event) => {
    if (!modal || event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const seekToLine = (line) => {
    const ratio = lyricsSeekRatio(line, duration, lyricsState.offsetMs);
    if (ratio !== null) {
      setFollowing(true);
      onSeek?.(ratio);
    }
  };

  return (
    <div
      ref={dialogRef}
      className="lyrics-overlay"
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal ? true : undefined}
      aria-labelledby={titleId}
      aria-busy={lyricsState.status === 'loading'}
      onKeyDown={containFocus}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="lyrics-overlay-header">
        <div>
          {!sharedTabs && <div className="player-inspector-tabs" role="tablist" aria-label="Player details">
            <button type="button" role="tab" aria-selected="false" onClick={onOpenQueue}><ListMusic size={16} /> Queue</button>
            <button type="button" role="tab" aria-selected="true"><Radio size={16} /> Lyrics</button>
          </div>}
          {sharedTabs && <div style={{height:36}} aria-hidden="true"/>}
          <h2 id={titleId} className="sr-only">Lyrics</h2>
          <p className={synced ? 'synced' : ''}>{synced ? 'Synchronized' : ready ? 'Scroll to read' : 'Words for this track'}</p>
        </div>
        <div className="lyrics-header-actions">
          {synced && (
            <button type="button" className={following ? 'active' : ''} aria-pressed={following} onClick={() => setFollowing((value) => !value)}>
              {following ? 'Stop following' : 'Follow current line'}
            </button>
          )}
          <button ref={closeRef} type="button" aria-label="Close lyrics" onClick={onClose}><X size={22} /></button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="lyrics-scroll"
        onWheel={() => synced && setFollowing(false)}
        onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
        onPointerMove={(event) => {
          const start = pointerStart.current;
          if (synced && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) setFollowing(false);
        }}
        onPointerUp={() => { pointerStart.current = null; }}
        onPointerCancel={() => { pointerStart.current = null; }}
        onKeyDown={(event) => {
          if (synced && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) setFollowing(false);
        }}
      >
        {lyricsState.status === 'loading' && (
          <div className="lyrics-state" role="status"><span className="lyrics-pulse" aria-hidden="true" />Loading lyrics…</div>
        )}
        {!ready && lyricsState.status !== 'loading' && (
          <div className="lyrics-state">
            <Radio size={30} aria-hidden="true" />
            <strong>{lyricsState.status === 'error' ? 'Could not load lyrics.' : 'No lyrics were found for this track.'}</strong>
            <span>Playback will continue normally.</span>
            {onRetry && <button type="button" onClick={onRetry}>Retry lyrics</button>}
          </div>
        )}
        {ready && (
          <div className={`lyrics-lines ${synced ? 'synced' : 'plain'}`} lang={lyricsState.language || undefined}>
            {lyricsState.lines.map((line, index) => {
              const current = index === activeIndex;
              const commonProps = {
                key: `${line.startMs ?? 'plain'}-${index}`,
                ref: (element) => element ? lineRefs.current.set(index, element) : lineRefs.current.delete(index),
                className: current ? 'current' : '',
                'aria-current': current ? 'true' : undefined
              };
              return synced ? (
                <button {...commonProps} type="button" disabled={!duration || !onSeek} onClick={() => seekToLine(line)}>{line.value}</button>
              ) : (
                <p {...commonProps}>{line.value}</p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
