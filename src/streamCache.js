import {queueAdvancePlan} from './playerState.js';
// Follow queue authority without consuming its shuffle reservation or history.
export function cacheAheadSongs(queue,controls={},pool=[],history=[],downloadedIds=[],{includeCurrent=true,maxUpcoming=10}={}) {
 if(!queue?.items?.length)return [];
 const result=[],seen=new Set(downloadedIds),visited=new Set([queue.index]);let current=queue;
 const add=song=>{if(song?.id&&!song.id.startsWith('radio:')&&!song.isRadio&&!song.streamUrl&&!seen.has(song.id)){result.push(song);seen.add(song.id);}};
 if(includeCurrent)add(queue.items[queue.index]?.song);
 let seconds=0;
 for(let i=0;i<Math.min(10,maxUpcoming) && seconds<30*60;i++){
  const plan=queueAdvancePlan(current,controls,{pool,history,random:()=>0});
  if(plan.nextIndex<0||visited.has(plan.nextIndex))break;
  visited.add(plan.nextIndex);pool=plan.pool;history=plan.history;current={...current,index:plan.nextIndex};
  const song=current.items[current.index]?.song;
  add(song);seconds+=Number(song?.duration)>0?Number(song.duration):240;
 }
 return result;
}
