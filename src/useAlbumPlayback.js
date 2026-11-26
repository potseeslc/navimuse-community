import {useEffect,useLayoutEffect,useRef} from 'react';
import {albumRun,albumHandoffIndex} from './albumPlayback.js';

export function useAlbumPlayback({audioRef,audioNodes,queue,queueRef,controls,enabled,isPlaying,blocked,position,urlFor,metadataFor,adopt,notify}){
 const reservation=useRef(null),latest=useRef(null);latest.current={queueRef,adopt,notify,blocked};
 useEffect(()=>{
  const removers=[];
  for(const audio of audioNodes){
   if(!audio?.supportsAlbumQueue)continue;
   const handoff=event=>{
    if(audio!==audioRef.current||latest.current.blocked)return;
    const plan=reservation.current,data=event.detail,current=latest.current.queueRef.current;
    if(!plan||data?.token!==plan.token)return;
    const index=albumHandoffIndex(current,plan,data);
    if(index<0){
     if(current.items[current.index]?.queueItemId===data.queueItemId)return; // receipt replay on foreground
     audio.pause();audio.cancelAlbum();latest.current.notify('Queue changed during the album transition. Tap Play to continue.');return;
    }
    if(!latest.current.adopt(index,audio)){audio.pause();audio.cancelAlbum();return;}
    // Web PCM keeps only current + next; native reservations contain the album
    // run and can continue across more than one boundary while JS is suspended.
    if(audio.mediaElement)plan.armed=false;
   };
   const invalidated=()=>{if(reservation.current?.audio===audio)reservation.current.armed=false;};
   const invalidate=()=>{invalidated();audio.cancelAlbum();};
   audio.addEventListener('albumhandoff',handoff);
   audio.addEventListener('albuminvalidated',invalidated);audio.addEventListener('loadstart',invalidated);
   audio.addEventListener('seeked',invalidate);
   audio.addEventListener('pause',invalidate);
   removers.push(()=>{audio.removeEventListener('albumhandoff',handoff);audio.removeEventListener('albuminvalidated',invalidated);audio.removeEventListener('loadstart',invalidated);audio.removeEventListener('seeked',invalidate);audio.removeEventListener('pause',invalidate);audio.cancelAlbum();});
  }
  return ()=>removers.forEach(remove=>remove());
 },[audioNodes,audioRef]);
 useLayoutEffect(()=>{
  const audio=audioRef.current;
  const run=albumRun(queue,controls,enabled&&!blocked);
  const old=reservation.current;
  if(!audio?.supportsAlbumQueue||!isPlaying||run.length<2){
   if(old?.armed){old.armed=false;old.audio.cancelAlbum();}return;
  }
  // URL identity matters when stream quality/account preferences change.
  const entries=run.map(item=>({...item.song,...metadataFor?.(item),queueItemId:item.queueItemId,url:urlFor(item.song)}));
  const prior=old?.items.findIndex(item=>item.queueItemId===entries[0].queueItemId)??-1;
  if(old?.armed&&old.audio===audio&&prior>=0&&old.items.length-prior===entries.length&&entries.every((item,i)=>item.queueItemId===old.items[prior+i].queueItemId&&item.url===old.items[prior+i].url))return;
  if(old?.armed)old.audio.cancelAlbum();
  const plan={audio,token:crypto.randomUUID(),items:entries,armed:true};reservation.current=plan;
  Promise.resolve(audio.prepareAlbum({token:plan.token,currentQueueItemId:entries[0].queueItemId,entries:entries.slice(1)})).catch(()=>false).then(ready=>{
   if(reservation.current!==plan)return;
   // Keep the failed plan identity to avoid retrying every progress tick.
   plan.ready=ready===true;
  });
 },[audioRef,queue,controls,enabled,isPlaying,blocked,position,urlFor,metadataFor]);
}
