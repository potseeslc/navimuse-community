import {ordinaryAutoplayEnabled,ordinaryRunway,ordinaryCandidates,ordinaryQueueKey} from '../shared/ordinaryAutoplay.js';
export function createOrdinaryAutoplay({snapshot,fetchSimilar,append,onNotice=()=>{},clearNotice=()=>{},now=Date.now,timeoutMs=15000}){
 let job=null,attemptKey='',attemptAt=0,noticeQueueKey=null;
 const unavailableNotice='Similar music is unavailable. Your queued tracks will keep playing.';
 function clearFailure(){if(noticeQueueKey!==null){noticeQueueKey=null;clearNotice(unavailableNotice);}}
 function cancel(){job?.cancel();job=null;}
 async function refresh(){
  const initial=snapshot();
  const key=ordinaryQueueKey(initial.queue);
  if(noticeQueueKey!==null && (noticeQueueKey!==key || !ordinaryAutoplayEnabled(initial.queue,initial.controls)))clearFailure();
  const eligible=s=>s.active&&ordinaryAutoplayEnabled(s.queue,s.controls)&&ordinaryRunway(s.queue,s.controls,s.pool);
  if(!eligible(initial)){cancel();return false;}
  const seed=initial.queue.items.at(-1).song.id;
  if(job?.key===key)return false;
  cancel();
  if(attemptKey===key&&now()-attemptAt<60000)return false;
  attemptKey=key;attemptAt=now();
  let timer,finish;const controller=new AbortController();
  const cancelled=new Promise(resolve=>finish=()=>resolve(null));
  const current={key,cancel(){controller.abort();clearTimeout(timer);finish();}};job=current;
  try{
   const excluded=initial.queue.items.map(item=>item.song.id);
   const result=await Promise.race([fetchSimilar(seed,12,{excludeIds:excluded,signal:controller.signal}),cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);
   const latest=snapshot();
   if(job!==current||!eligible(latest)||ordinaryQueueKey(latest.queue)!==key)return false;
   const tracks=ordinaryCandidates(result?.ok?result.tracks:[],latest.queue.items.map(item=>item.song.id));
   if(!tracks.length)throw Error('No additional music');
   append(tracks.map(song=>({queueItemId:crypto.randomUUID(),song,provenance:'generated',autoplay:true})));
   clearFailure();
   return true;
  }catch{
   const latest=snapshot();
   if(job===current&&eligible(latest)&&ordinaryQueueKey(latest.queue)===key){noticeQueueKey=key;onNotice(unavailableNotice);}
   return false;
  }
  finally{current.cancel();if(job===current)job=null;}
 }
 return {refresh,cancel};
}
