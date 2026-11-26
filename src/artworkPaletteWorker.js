import { artworkPaletteFromPixels } from './artworkPalette.js';
self.onmessage=async ({data})=>{
  let bitmap;
  try {
    const response=await fetch(data.url,{credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(4000)});
    if (!response.ok || !response.body || !/^image\/(png|jpeg|webp|avif)(;|$)/i.test(response.headers.get('content-type')||'')) throw new Error('Artwork unavailable');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw new Error('Artwork exceeds preparation limit');chunks.push(value);}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    bitmap=await createImageBitmap(new Blob(chunks),{resizeWidth:64,resizeHeight:64});
    const canvas=new OffscreenCanvas(64,64),context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(bitmap,0,0,64,64);
    self.postMessage(artworkPaletteFromPixels(context.getImageData(0,0,64,64).data));
  } catch {self.postMessage(null);}
  finally {bitmap?.close();}
};
