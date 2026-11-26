import {QueueDownloadButton} from './QueueDownloadButton.jsx';
import {useQueueMotion} from './useQueueMotion.js';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, GripVertical, Captions, ListMusic, Pause, Play, RotateCcw, Shuffle, SkipBack, SkipForward, Trash2, Volume2, X } from 'lucide-react';

const queueOverlayPageSize = 50;
const desktopQueuePageSize = 18;

export function queueOverlayItems(queue = {}, shuffle = false, showPlayed = false) {
  const items = queue.items || [];
  const index = Number.isInteger(queue.index) ? queue.index : -1;
  if (!shuffle) {
    return items
      .map((item, itemIndex) => ({ item, itemIndex, current: itemIndex === index }))
      .filter(({ itemIndex }) => showPlayed || index < 0 || itemIndex >= index);
  }
  return [
    ...(items[index] ? [{ item: items[index], itemIndex: index, current: true }] : []),
    ...items
      .map((item, itemIndex) => ({ item, itemIndex, current: false }))
      .filter(({ itemIndex }) => itemIndex !== index)
  ];
}

export function QueueOverlay({
  modal = true, sharedTabs = false,
  continuationLabel = '',
  canUndoQueueEdit = false,
  canGoNext = false,
  canGoPrevious = false,
  controls = {},
  isPlaying = false,
  onClose,
  onClearGenerated,
  onClearPlayed,
  onClearUpcoming,
  downloadState, onDownloadQueue,
  onMoveQueueItem,
  onNext,
  onOpenLyrics,
  onControlsChange,
  onPrevious,
  onQueueSelect,
  onRemoveQueueItem,
  onToggle,
  onUndoQueueEdit,
  queue = {},
  shufflePoolCount = 0
}) {
  const titleId = useId();
  const restrictionId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const listRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const queueItems = queue.items || [];
  const playedCount = controls.shuffle ? 0 : Math.max(0, Math.min(queue.index || 0, queueItems.length));
  const [showPlayed, setShowPlayed] = useState(false);
  const [editNotice, setEditNotice] = useState('');
  const items = queueOverlayItems(queue, controls.shuffle, showPlayed);
  const [visibleCount, setVisibleCount] = useState(queueOverlayPageSize);
  const visibleItems = items.slice(0, visibleCount);
  const editable = !queue.instanceId;
  const hasUpcoming = queue.index >= 0 && queue.index < queueItems.length - 1;
  const source = queue.source || { label: queue.instanceId ? 'Journey' : 'Your queue' };
  const editRestriction = editable ? '' : 'Journey order is locked. Detach the Journey to edit this queue.';
  const togglePauseAfterCurrent = () => {
    const armed = !controls.pauseAfterCurrent;
    onControlsChange?.({ pauseAfterCurrent: armed });
    setEditNotice(armed ? '' : 'Canceled pause after current.');
  };

  const commitEdit = (action, message, { focusList = false } = {}) => {
    if (action?.() === false) return false;
    setEditNotice(message);
    if (focusList) window.requestAnimationFrame(() => listRef.current?.focus());
    return true;
  };

  onCloseRef.current = onClose;

  useEffect(() => {
    setVisibleCount(queueOverlayPageSize);
  }, [controls.shuffle, queue.index, queueItems.length]);

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

  return (
    <div
      ref={dialogRef}
      className="queue-overlay"
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal ? true : undefined}
      aria-labelledby={titleId}
      onKeyDown={containFocus}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="queue-overlay-header">
        <div>
          {!sharedTabs && <div className="player-inspector-tabs" role="tablist" aria-label="Player details">
            <button type="button" role="tab" aria-selected="true"><ListMusic size={16} /> Queue</button>
            <button type="button" role="tab" aria-selected="false" onClick={onOpenLyrics}><Captions size={16} /> Lyrics</button>
          </div>}
          {sharedTabs && <div style={{height:36}} aria-hidden="true"/>}
          <p>{controls.shuffle ? 'Shuffling from' : 'Playing from'} <strong>{source.label}</strong></p>
          <h2 id={titleId}>Queue</h2>
          <span>{source.detail ? `${source.detail} · ` : ''}{queueItems.length} {queueItems.length === 1 ? 'track' : 'tracks'}</span>
          {continuationLabel && <small>{continuationLabel}</small>}
          {!editable && <small id={restrictionId}>{editRestriction}</small>}
        </div>
        <div className="queue-header-actions">
          {onDownloadQueue && <QueueDownloadButton songs={queueItems.map(item=>item.song)} state={downloadState} onDownload={onDownloadQueue}/>}
          {controls.pauseAfterCurrent && <button type="button" className={controls.pauseAfterCurrent ? 'active' : ''} aria-pressed={Boolean(controls.pauseAfterCurrent)} aria-label={controls.pauseAfterCurrent ? 'Cancel pause after current track' : 'Pause after current track'} onClick={togglePauseAfterCurrent}><Pause size={18} /><span>{controls.pauseAfterCurrent ? 'Cancel pause' : 'Pause after'}</span></button>}
          {canUndoQueueEdit && onUndoQueueEdit && <button type="button" aria-label="Undo last queue edit" onClick={() => commitEdit(onUndoQueueEdit, 'Undid the last queue edit.', { focusList: true })}><RotateCcw size={18} /><span>Undo</span></button>}
          {hasUpcoming && onClearUpcoming && <button type="button" aria-label="Clear upcoming tracks" disabled={!editable} aria-describedby={!editable ? restrictionId : undefined} title={editRestriction || 'Clear upcoming tracks'} onClick={() => commitEdit(onClearUpcoming, 'Cleared upcoming tracks.', { focusList: true })}><Trash2 size={18} /><span>Clear</span></button>}
          <button ref={closeRef} type="button" aria-label="Close queue" onClick={onClose}><X size={22} /></button>
        </div>
      </header>
      <div className="queue-overlay-transport" aria-label="Queue playback controls">
        <button type="button" aria-label="Previous track" disabled={!canGoPrevious} onClick={onPrevious}><SkipBack size={24} /></button>
        <button type="button" className="queue-overlay-play" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={onToggle}>
          {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
        </button>
        <button type="button" aria-label="Next track" disabled={!canGoNext} onClick={onNext}><SkipForward size={24} /></button>
      </div>
      <ol ref={listRef} className="queue-overlay-list" aria-label="Playback queue" tabIndex={-1}>
        {playedCount > 0 && (
          <li className="queue-overlay-history-toggle">
            <button type="button" aria-expanded={showPlayed} onClick={() => setShowPlayed((visible) => !visible)}>
              {showPlayed ? 'Hide' : 'Show'} {playedCount} played {playedCount === 1 ? 'track' : 'tracks'}
            </button>
            {onClearPlayed && <button type="button" aria-label="Clear played tracks" disabled={!editable} aria-describedby={!editable ? restrictionId : undefined} title={editRestriction || 'Clear played tracks'} onClick={() => commitEdit(onClearPlayed, `Cleared ${playedCount} played ${playedCount === 1 ? 'track' : 'tracks'}.`, { focusList: true })}>Clear played</button>}
          </li>
        )}
        <QueueItems downloadState={downloadState} fallbackFocusRef={listRef} items={visibleItems} controls={controls} editRestriction={editRestriction} onAnnounce={setEditNotice} onClearGenerated={onClearGenerated} onMoveQueueItem={onMoveQueueItem} onQueueSelect={onQueueSelect} onRemoveQueueItem={onRemoveQueueItem} queue={queue} restrictionId={restrictionId} />
        {!queueItems.length && <li className="queue-empty">Your queue is empty.</li>}
        {visibleCount < items.length && (
          <li className="queue-overlay-more">
            <button type="button" onClick={() => setVisibleCount((count) => Math.min(items.length, count + queueOverlayPageSize))}>
              Show {Math.min(queueOverlayPageSize, items.length - visibleCount)} more tracks
            </button>
          </li>
        )}
      </ol>
      {controls.shuffle && queueItems.length > 1 && <p className="queue-overlay-note">Shuffle chooses randomly from the remaining {Math.max(0, shufflePoolCount)} tracks.</p>}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{editNotice || (controls.pauseAfterCurrent ? 'Playback will pause after the current track.' : '')}</p>
    </div>
  );
}

export function DesktopQueuePanel({ headerControl, downloadState, onDownloadQueue, canUndoQueueEdit = false, controls = {}, onClearGenerated, onClearPlayed, onClearUpcoming, onControlsChange, onMoveQueueItem, onQueueSelect, onRemoveQueueItem, onUndoQueueEdit, queue = {}, shufflePoolCount = 0 }) {
  const restrictionId = useId();
  const listRef = useRef(null);
  const queueItems = queue.items || [];
  const queueIndex = Number.isInteger(queue.index) ? queue.index : -1;
  const playedCount = controls.shuffle ? 0 : Math.max(0, Math.min(queueIndex, queueItems.length));
  const [showPlayed, setShowPlayed] = useState(false);
  const [editNotice, setEditNotice] = useState('');
  const [visibleCount, setVisibleCount] = useState(desktopQueuePageSize);
  const items = queueOverlayItems(queue, controls.shuffle, showPlayed);
  const visibleItems = items.slice(0, visibleCount);
  const upcomingCount = controls.shuffle ? Math.max(0, shufflePoolCount) : Math.max(0, queueItems.length - Math.max(0, queueIndex + 1));
  const editable = !queue.instanceId;
  const source = queue.source || { label: queue.instanceId ? 'Journey' : 'Your queue' };
  const editRestriction = editable ? '' : 'Journey order is locked. Detach the Journey to edit this queue.';
  const togglePauseAfterCurrent = () => {
    const armed = !controls.pauseAfterCurrent;
    onControlsChange?.({ pauseAfterCurrent: armed });
    setEditNotice(armed ? '' : 'Canceled pause after current.');
  };
  const commitEdit = (action, message, { focusList = false } = {}) => {
    if (action?.() === false) return false;
    setEditNotice(message);
    if (focusList) window.requestAnimationFrame(() => listRef.current?.focus());
    return true;
  };

  useEffect(() => {
    setVisibleCount(desktopQueuePageSize);
  }, [controls.shuffle, queue.index, queueItems.length]);

  return (
    <section className="desktop-queue-panel" aria-label="Persistent playback queue">
      <header>
        <div>
          <p>{controls.shuffle ? 'Shuffling from' : 'Playing from'} <strong>{source.label}</strong></p>
          <h2>Queue</h2>
          {source.detail && <small>{source.detail}</small>}
          {!editable && <small id={restrictionId}>{editRestriction}</small>}
        </div>
        <div className="queue-header-actions">
          {headerControl}
          {onDownloadQueue && <QueueDownloadButton songs={queueItems.map(item=>item.song)} state={downloadState} onDownload={onDownloadQueue}/>}
          {controls.pauseAfterCurrent && <button type="button" className={controls.pauseAfterCurrent ? 'active' : ''} aria-pressed={Boolean(controls.pauseAfterCurrent)} aria-label={controls.pauseAfterCurrent ? 'Cancel pause after current track' : 'Pause after current track'} onClick={togglePauseAfterCurrent}><Pause size={16} /><span>{controls.pauseAfterCurrent ? 'Cancel pause' : 'Pause after'}</span></button>}
          {canUndoQueueEdit && onUndoQueueEdit && <button type="button" aria-label="Undo last queue edit" onClick={() => commitEdit(onUndoQueueEdit, 'Undid the last queue edit.', { focusList: true })}><RotateCcw size={16} /><span>Undo</span></button>}
          {upcomingCount > 0 && onClearUpcoming && <button type="button" aria-label="Clear upcoming tracks" disabled={!editable} aria-describedby={!editable ? restrictionId : undefined} title={editRestriction || 'Clear upcoming tracks'} onClick={() => commitEdit(onClearUpcoming, 'Cleared upcoming tracks.', { focusList: true })}><Trash2 size={16} /><span>Clear</span></button>}
          <span>{upcomingCount} upcoming</span>
        </div>
      </header>
      <ol ref={listRef} className="desktop-queue-list" aria-label="Persistent playback queue tracks" tabIndex={-1}>
        {playedCount > 0 && (
          <li className="queue-overlay-history-toggle">
            <button type="button" aria-expanded={showPlayed} onClick={() => setShowPlayed((visible) => !visible)}>
              {showPlayed ? 'Hide' : 'Show'} {playedCount} played
            </button>
            {onClearPlayed && <button type="button" aria-label="Clear played tracks" disabled={!editable} aria-describedby={!editable ? restrictionId : undefined} title={editRestriction || 'Clear played tracks'} onClick={() => commitEdit(onClearPlayed, `Cleared ${playedCount} played ${playedCount === 1 ? 'track' : 'tracks'}.`, { focusList: true })}>Clear played</button>}
          </li>
        )}
        <QueueItems downloadState={downloadState} fallbackFocusRef={listRef} items={visibleItems} controls={controls} editRestriction={editRestriction} onAnnounce={setEditNotice} onClearGenerated={onClearGenerated} onMoveQueueItem={onMoveQueueItem} onQueueSelect={onQueueSelect} onRemoveQueueItem={onRemoveQueueItem} queue={queue} restrictionId={restrictionId} />
        {!queueItems.length && <li className="queue-empty">Start playback to build a queue.</li>}
        {visibleCount < items.length && (
          <li className="queue-overlay-more">
            <button type="button" onClick={() => setVisibleCount((count) => Math.min(items.length, count + desktopQueuePageSize))}>
              Show {Math.min(desktopQueuePageSize, items.length - visibleCount)} more
            </button>
          </li>
        )}
      </ol>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{editNotice || (controls.pauseAfterCurrent ? 'Playback will pause after the current track.' : '')}</p>
    </section>
  );
}

function QueueItems({ downloadState, controls = {}, editRestriction = '', fallbackFocusRef, items, onAnnounce, onClearGenerated, onMoveQueueItem, onQueueSelect, onRemoveQueueItem, queue, restrictionId }) {
  useQueueMotion(fallbackFocusRef, items.map(({item,itemIndex})=>item.queueItemId || `${item.song.id}-${itemIndex}`).join('|'));
  const drag=useRef(null),[dragTarget,setDragTarget]=useState(null);
  const latestQueue=useRef(queue);latestQueue.current=queue;
  const finishDrag=(cancel=false)=>{const current=drag.current;drag.current=null;setDragTarget(null);if(cancel||!current||latestQueue.current!==current.queue||current.target===current.index)return;Promise.resolve(onMoveQueueItem?.(current.index,current.target)).then(ok=>{if(ok!==false)onAnnounce?.(`Moved ${current.title} to position ${current.target+1}.`);else onAnnounce?.('Queue could not be reordered. Try again.');}).catch(()=>onAnnounce?.('Queue could not be reordered. Try again.'));};
  const actionRefs = useRef(new Map());
  const pendingFocusRef = useRef('');
  const queueIndex = Number.isInteger(queue?.index) ? queue.index : -1;
  const editable = !queue?.instanceId;
  const generatedBoundary = queue.items.findIndex((item, index) => index > queueIndex && item?.provenance === 'generated');
  const descriptorBoundary = Number.isInteger(queue.source?.generatedBoundary) && queue.source.generatedBoundary > queueIndex
    ? queue.source.generatedBoundary
    : -1;
  const firstGeneratedIndex = generatedBoundary >= 0 ? generatedBoundary : descriptorBoundary;
  const generatedCount = firstGeneratedIndex >= 0
    ? queue.items.filter((item, index) => index >= firstGeneratedIndex && item?.provenance === 'generated').length || queue.items.length - firstGeneratedIndex
    : 0;

  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return;
    const pendingKey = pendingFocusRef.current;
    if (pendingKey === 'queue-list') {
      pendingFocusRef.current = '';
      fallbackFocusRef?.current?.focus();
      return;
    }
    let target = actionRefs.current.get(pendingKey);
    if (target?.disabled) {
      const identity = pendingKey.slice(0, pendingKey.lastIndexOf(':'));
      target = [...actionRefs.current.entries()].find(([key, node]) => key.startsWith(`${identity}:`) && !node.disabled)?.[1] || target;
    }
    pendingFocusRef.current = '';
    target?.focus();
  }, [items]);

  const itemIdentity = (item, itemIndex) => String(item?.queueItemId || `${item?.song?.id || 'track'}-${itemIndex}`);
  const rememberAction = (key, node) => {
    if (node) actionRefs.current.set(key, node);
    else actionRefs.current.delete(key);
  };

  return items.map(({ current, item, itemIndex }, renderedIndex) => {
    const sectionLabel = renderedIndex === 0 && itemIndex < queueIndex
      ? 'Played'
      : itemIndex === queueIndex
        ? 'Playing'
        : itemIndex === queueIndex + 1
          ? controls.shuffle ? 'Shuffled Next' : 'Up Next'
          : '';
    const canEditItem = editable && itemIndex > queueIndex && Boolean(onMoveQueueItem || onRemoveQueueItem);
    const title = item.song.title || 'track';
    const identity = itemIdentity(item, itemIndex);
    const crossesBoundary = (targetIndex) => targetIndex >= 0
      && (item.provenance === 'generated') !== (queue.items[targetIndex]?.provenance === 'generated');
    const canMoveUp = itemIndex > queueIndex + 1 && !crossesBoundary(itemIndex - 1);
    const canMoveDown = itemIndex < queue.items.length - 1 && !crossesBoundary(itemIndex + 1);
    const move = async (direction) => {
      pendingFocusRef.current = `${identity}:move-${direction}`;
      try { if (await onMoveQueueItem?.(itemIndex, direction) !== false) onAnnounce?.(`Moved ${title} ${direction} in the queue.`); } catch { onAnnounce?.('Queue could not be reordered. Try again.'); }
    };
    const remove = () => {
      const nextFocusIndex = itemIndex + 1 < queue.items.length ? itemIndex + 1 : itemIndex - 1 > queueIndex ? itemIndex - 1 : -1;
      const nextItem = nextFocusIndex >= 0 ? queue.items[nextFocusIndex] : null;
      pendingFocusRef.current = nextItem ? `${itemIdentity(nextItem, nextFocusIndex)}:remove` : 'queue-list';
      if (onRemoveQueueItem?.(itemIndex) !== false) onAnnounce?.(`Removed ${title} from the queue.`);
    };
    return (
      <React.Fragment key={item.queueItemId || `${item.song.id}-${itemIndex}`}>
        {sectionLabel && <li className="queue-section-label"><span>{sectionLabel}</span></li>}
        {itemIndex === firstGeneratedIndex && (
          <li className="queue-generated-boundary">
            <span>Generated continuation · {generatedCount} {generatedCount === 1 ? 'track' : 'tracks'}</span>
            {onClearGenerated && <button type="button" disabled={!editable} aria-describedby={!editable ? restrictionId : undefined} title={editRestriction || 'Remove generated continuation'} onClick={() => {
              pendingFocusRef.current = 'queue-list';
              if (onClearGenerated?.() !== false) onAnnounce?.('Removed generated continuation.');
            }}>Remove</button>}
          </li>
        )}
        <li data-queue-motion-key={identity} data-queue-index={itemIndex} data-drag-target={dragTarget===itemIndex||undefined} className={`queue-row ${current ? 'current' : ''}`}>
          <button
            type="button"
            className={current ? 'current' : ''}
            disabled={current}
            aria-current={current ? 'true' : undefined}
            onClick={() => onQueueSelect?.(itemIndex, queue, { recordHistory: true })}
          >
            <span className="queue-position">{current ? <Volume2 size={18} /> : controls.shuffle ? <Shuffle size={16} /> : itemIndex + 1}</span>
            <span className="queue-track-copy">
              <strong>{item.song.title || 'Untitled Track'}</strong>
              {(downloadState?.safetyReady?.includes(item.song.id) || downloadState?.tracks?.some(track=>track.song.id===item.song.id&&track.state==='complete')) && <span className="queue-offline-ready"><CheckCircle2 size={12} aria-hidden="true"/> Ready offline</span>}
              <span>{item.song.artist || item.album?.artist || 'Unknown Artist'}{item.song.album ? ` · ${item.song.album}` : ''}</span>
            </span>
            {current && <span className="queue-current-label">Now Playing</span>}
            {!current && item.provenance === 'explicit' && <span className="queue-provenance-label">Added</span>}
          </button>
            {canEditItem && (
              <div className="queue-row-actions" aria-label={`Edit ${item.song.title || 'track'} in queue`}>
                {!controls.shuffle && onMoveQueueItem && <button type="button" className="queue-drag-handle" aria-label={`Drag ${title} to reorder; arrow keys also move`} disabled={!canMoveUp&&!canMoveDown}
                  onKeyDown={e=>{if(e.key==='Escape'){finishDrag(true);return;}if(e.key==='ArrowUp'&&canMoveUp||e.key==='ArrowDown'&&canMoveDown){e.preventDefault();move(e.key==='ArrowUp'?'up':'down');}}}
                  onPointerDown={e=>{if(e.button>0||e.isPrimary===false)return;e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={pointer:e.pointerId,index:itemIndex,target:itemIndex,queue,title};setDragTarget(itemIndex);}}
                  onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const rows=[...(fallbackFocusRef.current?.querySelectorAll('[data-queue-index]')||[])];const row=rows.find(node=>{const r=node.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom;});const target=Number(row?.dataset.queueIndex);if(!row||target<=queueIndex)return;const crossing=queue.items.slice(Math.min(d.index,target),Math.max(d.index,target)+1).some(x=>(x.provenance==='generated')!==(item.provenance==='generated'));if(!crossing){d.target=target;setDragTarget(target);}const list=fallbackFocusRef.current,r=list.getBoundingClientRect();if(e.clientY<r.top+44)list.scrollTop-=18;else if(e.clientY>r.bottom-44)list.scrollTop+=18;}}
                  onPointerUp={()=>finishDrag()} onPointerCancel={()=>finishDrag(true)} onLostPointerCapture={()=>finishDrag(true)}><GripVertical size={18}/></button>}
                {!controls.shuffle && <button ref={(node) => rememberAction(`${identity}:move-up`, node)} type="button" aria-label={`Move ${title} up in queue`} disabled={!canMoveUp} title={!canMoveUp && crossesBoundary(itemIndex - 1) ? 'Generated continuation stays after added tracks' : undefined} onClick={() => move('up')}><ArrowUp size={15} /></button>}
                {!controls.shuffle && <button ref={(node) => rememberAction(`${identity}:move-down`, node)} type="button" aria-label={`Move ${title} down in queue`} disabled={!canMoveDown} title={!canMoveDown && crossesBoundary(itemIndex + 1) ? 'Added tracks stay before generated continuation' : undefined} onClick={() => move('down')}><ArrowDown size={15} /></button>}
                <button ref={(node) => rememberAction(`${identity}:remove`, node)} type="button" aria-label={`Remove ${title} from queue`} onClick={remove}><X size={16} /></button>
              </div>
            )}
        </li>
      </React.Fragment>
    );
  });
}
