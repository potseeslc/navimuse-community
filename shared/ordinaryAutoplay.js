// AudioMuse's existing authorized similarity adapter is the optional ordinary
// queue provider. These helpers never start or select a track.
export function ordinaryAutoplayEnabled(queue, controls={}) {
 return controls.autoplayAfterQueue===true && controls.continueThroughQueue!==false
  && !controls.repeat && !controls.repeatAll && !controls.pauseAfterCurrent
  && !queue?.instanceId && !queue?.journey && !['radio','downloads','listenbrainz'].includes(queue?.source?.kind)
  && Array.isArray(queue?.items) && queue.items.length>0
  && queue.items.every(item=>item?.song?.id && !item.song.streamUrl && !item.song.isRadio && !item.radioSessionId && !item.atlas);
}
export function ordinaryRunway(queue,controls={},pool=[]) {
 const upcoming=controls.shuffle?(pool.length?pool.map(index=>queue.items[index]).filter(Boolean):queue.items.filter((_,index)=>index!==queue.index)):queue.items.slice(queue.index+1);
 return upcoming.length<3 || upcoming.reduce((sum,item)=>sum+(Number(item.song.duration)||0),0)<300;
}
export function ordinaryCandidates(tracks,excluded=[]) {
 const seen=new Set(excluded),result=[];
 for(const song of Array.isArray(tracks)?tracks:[]){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(song?.id||'')||song.streamUrl||song.isRadio||seen.has(song.id))continue;
  seen.add(song.id);result.push(song);if(result.length===12)break;
 }
 return result;
}
export function ordinaryQueueKey(queue){return queue?.items?.map(item=>item.queueItemId).join('|')||'';}
export function removeUpcomingAutoplay(queue,controls={},pool=[]) {
 const upcoming=new Set(controls.shuffle&&pool.length?pool:queue.items.map((_,index)=>index).filter(index=>index>queue.index));
 const current=queue.items[queue.index];
 const items=queue.items.filter((item,index)=>!(upcoming.has(index)&&index!==queue.index&&item.autoplay===true&&item.provenance==='generated'));
 return items.length===queue.items.length?queue:{...queue,items,index:items.indexOf(current)};
}
