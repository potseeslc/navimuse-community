import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ListPlus, MoreHorizontal, Rows3 } from 'lucide-react';

export function TrackQueueActions({ disabledReason = '', onAddToQueue, onPlayNext, song }) {
  const menuId = useId();
  const anchorRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState('below');
  const unavailable = Boolean(disabledReason || !song?.id);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!anchorRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeWithEscape, true);
    const focusFrame = window.requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeWithEscape, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    setPlacement(anchor.bottom + menu.height + 12 > window.innerHeight && anchor.top > menu.height + 12 ? 'above' : 'below');
  }, [open]);

  const choose = (action) => {
    if (unavailable) return;
    action?.(song);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const onKeyDown = (event) => {
    const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  };

  return (
    <span ref={anchorRef} className="track-queue-actions">
      <button
        ref={triggerRef}
        type="button"
        className={open ? 'active' : ''}
        aria-label={`Queue actions for ${song?.title || 'track'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={disabledReason || 'Queue actions'}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <span ref={menuRef} id={menuId} className={`track-queue-menu opens-${placement}`} role="menu" aria-label={`Queue ${song?.title || 'track'}`} onKeyDown={onKeyDown}>
          {disabledReason && <small>{disabledReason}</small>}
          <button type="button" role="menuitem" disabled={unavailable} onClick={() => choose(onPlayNext)}><Rows3 size={15} /> Play next</button>
          <button type="button" role="menuitem" disabled={unavailable} onClick={() => choose(onAddToQueue)}><ListPlus size={15} /> Add to queue</button>
        </span>
      )}
    </span>
  );
}
