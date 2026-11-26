import {useLayoutEffect, useRef} from 'react';

// Only visible, stable queue rows participate; the queue authority updates at once.
export function useQueueMotion(listRef, identity) {
  const previous = useRef(new Map()), running = useRef(new Map());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.querySelectorAll('[data-queue-motion-key]')];
    const next = new Map();
    const listTop = list.getBoundingClientRect().top;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    for (const node of rows) {
      const key = node.dataset.queueMotionKey, old = previous.current.get(key);
      // Preserve the visual offset if another edit interrupts an earlier move.
      let offset = 0;
      if (running.current.has(key)) {
        const transform = getComputedStyle(node).transform;
        if (transform.startsWith('matrix(')) offset = Number(transform.slice(7,-1).split(',')[5]) || 0;
        running.current.get(key).cancel(); running.current.delete(key);
      }
      const rect = node.getBoundingClientRect();
      const top = rect.top - listTop + list.scrollTop;
      next.set(key,{top,node});
      if (reduced || !node.animate) continue;
      const distance = old ? old.top + offset - top : 0;
      if (old && Math.abs(distance) < 1) continue;
      const animation = node.animate(old ? [{transform:`translateY(${distance}px)`},{transform:'translateY(0)'}] : [{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}],
        {duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
      running.current.set(key,animation);
      animation.finished.then(()=>{if(running.current.get(key)===animation)running.current.delete(key);},()=>{});
    }
    for (const [key,animation] of running.current) if (!next.has(key)) {animation.cancel();running.current.delete(key);}
    previous.current = next;
  }, [identity,listRef]);
  useLayoutEffect(()=>()=>{for(const animation of running.current.values())animation.cancel();running.current.clear();previous.current.clear();},[]);
}
