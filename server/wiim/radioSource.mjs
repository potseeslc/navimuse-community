import {PlaybackError} from '../../shared/wiim/contract.js';
import {internetRadioStationId} from '../../shared/wiim/internetRadio.js';
import {createIcyDecoder} from '../icyMetadata.mjs';

export function createInternetRadioSource({stationFor,safeUrl,fetchStream,artworkFor=()=>null,onMetadata=()=>{}}) {
 async function resolve(principal,songId) {
  const id=internetRadioStationId(songId);
  if(!id)throw new PlaybackError('Invalid radio station',400);
  const station=await stationFor(principal,id);
  if(!station||String(station.id)!==id||!station.streamUrl)throw new PlaybackError('Radio station is unavailable',404);
  if(!safeUrl(station.streamUrl))throw new PlaybackError('Radio stream URL is blocked',400);
  return station;
 }
 return {
  async songFor(principal,songId) {
   const station=await resolve(principal,songId);
   return {id:songId,title:station.name||'Untitled Station',artist:'Internet Radio',album:'Internet Radio',duration:0,suffix:'radio',isRadio:true,...(station.coverArt?{coverArt:station.coverArt}:{})};
  },
  async mediaFor(principal,songId,{artwork=false,signal}={}) {
   const station=await resolve(principal,songId);
   const url=artwork?await artworkFor(principal,station):safeUrl(station.streamUrl);
   if(!url||!safeUrl(url))throw new PlaybackError(artwork?'No station artwork provided':'Radio stream URL is blocked',artwork?404:400);
   const response=await fetchStream(url,artwork?{}:{'User-Agent':'NaviMuse/1.0 Radio Proxy','Icy-MetaData':'1'},signal);
   const type=response.headers.get('content-type')||'';
   if(response.status!==200||!(artwork?/^image\/(jpeg|png|webp)(;|$)/i:/^(audio\/|application\/octet-stream)/i).test(type)){
    await response.body?.cancel();throw new PlaybackError('Radio media is unavailable',502);
   }
   if(!response.body)throw new PlaybackError('Radio media is unavailable',502);
   const headers={'content-type':type};
   if(artwork){
    // Artwork is finite and bounded; audio remains streaming with backpressure.
    const chunks=[];let size=0;const reader=response.body.getReader();
    try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw new PlaybackError('Radio artwork is too large',502);}chunks.push(value);}}
    finally{reader.releaseLock();}
    return new Response(Buffer.concat(chunks),{headers});
   }
   const update=values=>onMetadata(principal,station,values);
   update({artwork:response.headers.get('icy-logo')||station.imageUrl||station.logoUrl||station.coverArtUrl});
   const decode=createIcyDecoder(Number(response.headers.get('icy-metaint')),update);
   const body=response.body.pipeThrough(new TransformStream({transform(chunk,controller){for(const bytes of decode(chunk))controller.enqueue(bytes);}}));
   // Do not forward byte ranges or length across ICY metadata removal.
   return new Response(body,{headers});
  }
 };
}
