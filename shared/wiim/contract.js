import {queueAdvancePlan,queueSelectionHistory,pauseAfterCurrentBoundary} from '../../src/playerState.js';
import {appendExplicitQueueItem,insertNextQueueItem,removeUpcomingQueueItem,moveUpcomingQueueItem,clearUpcomingQueue,clearPlayedQueue} from '../../src/queueMutations.js';

export class PlaybackError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function ordinaryQueue(input){
  if(!input||input.instanceId||['radio','downloads'].includes(input.source?.kind)||!Array.isArray(input.items)||!input.items.length||input.items.length>1000||!Number.isInteger(input.index)||input.index<0||input.index>=input.items.length)throw new PlaybackError('Choose an ordinary library queue for WiiM Direct.');
  const seen=new Set();
  const items=input.items.map(item=>{
    if(!item?.song||typeof item.song.id!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(item.song.id)||item.song.streamUrl||item.atlas||(item.provenance==='generated'&&item.autoplay!==true))throw new PlaybackError('This source cannot transfer to WiiM Direct.');
    if(typeof item.queueItemId!=='string'||!item.queueItemId||item.queueItemId.length>160||seen.has(item.queueItemId))throw new PlaybackError('Queue occurrences must have unique IDs.');seen.add(item.queueItemId);
    return {queueItemId:item.queueItemId,provenance:item.autoplay===true&&item.provenance==='generated'?'generated':'explicit',...(item.autoplay===true&&item.provenance==='generated'?{autoplay:true}:{}),song:{id:item.song.id}};
  });
  let source;
  if(input.source?.kind==='plex'){
    if(!/^\d{1,18}$/.test(input.source.playQueueId)||!/^\d{1,18}$/.test(input.source.playQueueVersion))throw new PlaybackError('Invalid Plex queue identity');
    source={version:1,kind:'plex',label:'Plex',playQueueId:input.source.playQueueId,playQueueVersion:input.source.playQueueVersion,windowed:input.source.windowed===true,hasMoreBefore:input.source.hasMoreBefore===true,hasMoreAfter:input.source.hasMoreAfter===true};
  }else if(input.source?.kind==='listenbrainz')source={version:1,kind:'listenbrainz',label:'ListenBrainz'};
  return {items,index:input.index,...(source?{source}:{})};
}
export function remoteControls(value={}) {return {shuffle:value.shuffle===true,repeat:value.repeat===true,...(value.repeatAll===true?{repeatAll:true}:{}),pauseAfterCurrent:value.pauseAfterCurrent===true,...(value.autoplayAfterQueue===true?{autoplayAfterQueue:true}:{}),...(value.continueThroughQueue===false?{continueThroughQueue:false}:{})};}
export function advanceRemoteQueue(state,{direction='next',natural=false}={}){
  if(natural&&state.controls.continueThroughQueue===false)return {...state,status:'ended'};
  if(natural&&state.controls.pauseAfterCurrent){const boundary=pauseAfterCurrentBoundary(state.controls,{naturalEnd:true});const next=advanceRemoteQueue({...state,controls:boundary.controls},{direction});return {...next,status:next.status==='ended'?'ended':'paused',pauseAtBoundary:true};}
  if(natural&&state.controls.repeat)return {...state,generation:state.generation+1,position:0};
  const plan=queueAdvancePlan(state.queue,state.controls,{direction,fromEnded:natural,pool:state.pool,history:state.history});
  if(plan.nextIndex<0)return {...state,status:'ended'};
  return {...state,queue:{...state.queue,index:plan.nextIndex},pool:plan.pool,history:queueSelectionHistory(state.queue,plan.nextIndex,plan.history,50,plan.recordHistory),generation:state.generation+1,position:0};
}
export function mutateRemoteQueue(queue,{action,index,direction,item}){
  const mutations={append:()=>appendExplicitQueueItem(queue,item),insertNext:()=>insertNextQueueItem(queue,item),remove:()=>removeUpcomingQueueItem(queue,index),move:()=>moveUpcomingQueueItem(queue,index,direction),clearUpcoming:()=>clearUpcomingQueue(queue),clearPlayed:()=>clearPlayedQueue(queue)};
  if(!mutations[action])throw new PlaybackError('Unknown queue command');return mutations[action]();
}
// STOPPED alone is not completion. Require our URI and recent playing evidence.
// A terminal position can corroborate crossing the end between polls; it cannot
// establish completion after a restart, source change, or a mid-track stop.
export function completedObservation(previous,current,{uri,duration,now=Date.now()}={}){
  const elapsed=now-previous?.at;
  if(current?.state!=='STOPPED'||current.uri!==uri||previous?.uri!==uri||previous.state!=='PLAYING'||!Number.isFinite(duration)||duration<=0||!Number.isFinite(elapsed)||elapsed<0||elapsed>6000||!Number.isFinite(previous.position))return false;
  if(previous.position>=Math.max(0,duration-3))return true;
  return Number.isFinite(current.position)&&current.position>=duration-1&&current.position<=duration+1&&current.position>=previous.position&&current.position-previous.position<=elapsed/1000+1;
}
