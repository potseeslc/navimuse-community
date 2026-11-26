import React,{useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export function SearchSheet({children,onClose}) {
  const dialog=useRef(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const opener=document.activeElement,node=dialog.current;
    node.showModal();
    const frame=requestAnimationFrame(()=>node.querySelector('input[type="search"],input')?.focus());
    return()=>{cancelAnimationFrame(frame);node.close();if(opener?.isConnected)opener.focus();};
  },[]);
  return <dialog ref={dialog} className="search-sheet" aria-label="Search your library" onCancel={e=>{e.preventDefault();close.current();}} onClick={e=>{if(e.target===dialog.current)close.current();}}>
    <div className="search-sheet-content"><header><span>Search your library</span><button type="button" onClick={onClose} aria-label="Close search"><X size={22}/></button></header>{children}</div>
  </dialog>;
}
