import {useLayoutEffect, useRef, useState} from 'react';

// Animation completion owns removal. A new open/close samples and cancels the
// interrupted animation rather than allowing its stale completion to win.
export function useExitPresence(open, ref, onExited, selector = '') {
  const [retained, setRetained] = useState(open);
  const callback = useRef(onExited), interrupted = useRef(null);
  callback.current = onExited;
  useLayoutEffect(() => {
    if (open) setRetained(true);
    if (!open && !retained) return;
    const node = selector ? ref.current?.querySelector(selector) : ref.current;
    let cancelled = false, completed = false;
    const finish = () => {
      completed = true;
      if (cancelled || open) return;
      setRetained(false);
      callback.current?.();
    };
    if (!node?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      interrupted.current = null; finish(); return;
    }
    // Drawer entry uses its existing CSS animation, except when interrupting exit.
    if (open && !selector && !interrupted.current) return;
    const style = getComputedStyle(node);
    const from = interrupted.current || (open ? {transform:'translateY(100%)',opacity:0} : {transform:style.transform,opacity:style.opacity});
    interrupted.current = null;
    const slide = Boolean(selector) || node.classList.contains('opens-drawer');
    const animation = node.animate([from, open ? {transform:'translateY(0)',opacity:1} : {
      transform:slide ? 'translateY(100%)' : 'translateY(6px)',opacity:0
    }], {duration:parseFloat(style.getPropertyValue('--nm-motion-sheet')) || 320,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    animation.finished.then(finish, () => {});
    return () => {
      cancelled = true;
      if (!completed && node.isConnected) {
        const current = getComputedStyle(node);
        interrupted.current = {transform:current.transform,opacity:current.opacity};
      }
      animation.cancel();
    };
  }, [open, ref, selector]);
  return open || retained;
}
