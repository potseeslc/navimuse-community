import {useEffect} from 'react';
// Keep the ordinary button as keyboard/error fallback; never move focus on scroll.
export function useAutoLoad(ref,{enabled,identity,root,rootMargin='240px'}){
 useEffect(()=>{
  const node=ref.current;if(!enabled||!node||typeof IntersectionObserver!=='function')return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.unobserve(node);node.click();}},{root:root?.current||null,rootMargin});
  observer.observe(node);return()=>observer.disconnect();
 },[enabled,identity,ref,root,rootMargin]);
}
