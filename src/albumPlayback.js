import {transitionDecisionFor,TRANSITION_MODE} from './playbackTransitions.js';

// An ordered reservation in the existing queue, never an independent queue.
export function albumRun(queue,controls={},enabled=false,maxItems=32){
 if(!enabled||controls.shuffle||controls.repeat||controls.pauseAfterCurrent||controls.continueThroughQueue===false)return [];
 const items=queue?.items||[],start=queue?.index;
 if(!Number.isInteger(start)||!items[start])return [];
 const live=item=>item?.song?.isRadio||String(item?.song?.id||'').startsWith('radio:');
 if(live(items[start]))return [];
 const run=[items[start]];
 for(let i=start+1;i<items.length&&run.length<maxItems;i++){
  if(live(items[i])||transitionDecisionFor({outgoingItem:run.at(-1),incomingItem:items[i],capabilities:{authoredGapless:true}}).mode!==TRANSITION_MODE.GAPLESS)break;
  run.push(items[i]);
 }
 return run.length>1?run:[];
}
export function albumHandoffIndex(queue,reservation,event){
 if(!reservation||event?.token!==reservation.token)return -1;
 const current=queue?.items?.[queue.index]?.queueItemId;
 const before=reservation.items.findIndex(x=>x.queueItemId===current);
 const after=reservation.items.findIndex(x=>x.queueItemId===event.queueItemId);
 if(before<0||after<=before)return -1;
 for(let offset=0;offset<=after-before;offset++){
  if(queue.items[queue.index+offset]?.queueItemId!==reservation.items[before+offset]?.queueItemId)return -1;
 }
 return queue.index+after-before;
}
export function pcmBytes(buffer){return buffer.length*buffer.numberOfChannels*4;}
export const ALBUM_PCM_LIMIT=256*1024*1024;
export const ALBUM_FILE_LIMIT=48*1024*1024;
