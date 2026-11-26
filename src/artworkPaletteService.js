import { FALLBACK_ARTWORK_PALETTE } from './artworkPalette.js';
import { validateArtworkPalette } from './designSystem.js';
export function createArtworkPaletteService(extract) {
  const cache=new Map();let identity=null,pending=null,revision=0;
  const cancel=()=>{revision++;pending?.controller.abort();pending=null;};
  return {
    load(scope,url) {
      if (identity!==scope) {cancel();cache.clear();identity=scope;}
      if (!scope || !url) {cancel();return Promise.resolve(FALLBACK_ARTWORK_PALETTE);}
      if (pending?.url===url) return pending.promise;
      cancel();
      if (cache.has(url)) {const value=cache.get(url);cache.delete(url);cache.set(url,value);return Promise.resolve(value);}
      const controller=new AbortController(),request=revision;
      const promise=Promise.resolve().then(()=>extract(url,controller.signal)).catch(()=>null).then(value=>{
        if (request!==revision || controller.signal.aborted) return FALLBACK_ARTWORK_PALETTE;
        pending=null;
        if (!validateArtworkPalette(value)) return FALLBACK_ARTWORK_PALETTE;
        cache.set(url,value);if(cache.size>16)cache.delete(cache.keys().next().value);
        return value;
      });
      pending={url,promise,controller};return promise;
    },
    clear(){cancel();cache.clear();identity=null;}
  };
}
export function extractArtworkInWorker(url,signal) {
  if (signal.aborted || typeof Worker==='undefined') return Promise.resolve(null);
  return new Promise(resolve=>{
    let worker,timer;const finish=value=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker?.terminate();resolve(value);};
    const abort=()=>finish(null);
    try {
      worker=new Worker(new URL('./artworkPaletteWorker.js',import.meta.url),{type:'module'});
      worker.onmessage=event=>finish(event.data);worker.onerror=()=>finish(null);
      signal.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,5000);worker.postMessage({url});
    } catch {finish(null);}
  });
}
