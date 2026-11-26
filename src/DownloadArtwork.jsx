import React,{useEffect,useRef,useState} from 'react';
import {Disc3} from 'lucide-react';
import {coverArtUrl} from './surfaceUi.jsx';
import {SafeImage} from './playerChrome.jsx';
// A bounded thumbnail cache is separate from audio storage. Failure to cache art
// must never prevent downloaded music from playing. Account scope isolates keys.
const cacheName='navimuse-download-art-v1';
export async function clearDownloadArtworkCache(){try{await globalThis.caches?.delete(cacheName);}catch{}}
export function DownloadArtwork({song,scope,offline=false}) {
 const host=useRef(null),[src,setSrc]=useState('');
 useEffect(()=>{
  let active=true,objectURL;const abort=new AbortController();
  setSrc('');
  const url=coverArtUrl(song?.coverArt,300);if(!url)return;
  async function load(){
   let cache,key;
   try{
    if(scope&&globalThis.caches){cache=await caches.open(cacheName);key=new URL('/__download_art__/'+encodeURIComponent(scope)+'/'+encodeURIComponent(song.coverArt),location.origin).href;const saved=await cache.match(key);if(saved){const blob=await saved.blob();if(!active)return;objectURL=URL.createObjectURL(blob);setSrc(objectURL);return;}}
    if(offline||!active)return;
    const timer=setTimeout(()=>abort.abort(),10000);
    let blob;try{const response=await fetch(url,{signal:abort.signal,credentials:'include'});
     if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))return;
     blob=await response.blob();
    }finally{clearTimeout(timer);}
    if(blob.size>512*1024||!active)return;
    objectURL=URL.createObjectURL(blob);setSrc(objectURL);
    if(cache){await cache.put(key,new Response(blob,{headers:{'Content-Type':blob.type}}));const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-128)))await cache.delete(old);}
   }catch{if(active&&!offline)setSrc(url);}
  }
  if(typeof IntersectionObserver!=='function')void load();
  else {var observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load();}},{rootMargin:'300px'});observer.observe(host.current);}
  return()=>{active=false;abort.abort();observer?.disconnect();if(objectURL)URL.revokeObjectURL(objectURL);};
 },[song?.coverArt,scope,offline]);
 return <span ref={host} className="artwork-shell">{src?<SafeImage src={src} alt="" loading="lazy"/>:<span className="artwork-fallback"><Disc3 size={30}/></span>}</span>;
}
