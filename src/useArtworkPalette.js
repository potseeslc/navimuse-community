import {useEffect,useRef,useState} from 'react';
import {apiRequestUrl} from './services/apiClient.js';
import {FALLBACK_ARTWORK_PALETTE} from './artworkPalette.js';
import {createArtworkPaletteService,extractArtworkInWorker} from './artworkPaletteService.js';
export function useArtworkPalette(artwork,scope) {
  const service=useRef(null);if (!service.current) service.current=createArtworkPaletteService(extractArtworkInWorker);
  const [result,setResult]=useState(null);
  useEffect(()=>{
    let current=true;
    const valid=typeof artwork==='string' && /^\/api\/navidrome\/cover\/[^/?]+\?size=(300|600|1000)$/.test(artwork);
    const url=valid?apiRequestUrl(artwork.replace(/size=\d+$/,'size=300')):'';
    setResult(null);
    service.current.load(scope,url).then(palette=>{if(current)setResult({artwork,scope,palette});});
    return ()=>{current=false;};
  },[artwork,scope]);
  useEffect(()=>()=>service.current.clear(),[]);
  const palette=result?.artwork===artwork && result?.scope===scope?result.palette:FALLBACK_ARTWORK_PALETTE;
  return {'--nm-atmosphere-a':palette.atmosphereA,'--nm-atmosphere-b':palette.atmosphereB};
}
