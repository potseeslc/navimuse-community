import { deeplyFreeze, parsePersistedJourneyState, parseResolvedJourney } from '../shared/sonic-atlas/index.js';

export function atlasJourneyFallbackModel(journeyValue, queueSnapshot = null, playHistoryQueueItemIds = []) {
  const journey=parseResolvedJourney(journeyValue),queueItems=Array.isArray(queueSnapshot?.items)?queueSnapshot.items:[],expectedIds=journey.stops.map(stop=>stop.queueItemId),actualIds=queueItems.map(item=>item?.queueItemId),queueInstanceId=String(queueSnapshot?.instanceId||''),expectedInstanceId=String(queueSnapshot?.expectedInstanceId||queueInstanceId),queueAttached=Boolean(queueInstanceId&&queueInstanceId===expectedInstanceId&&actualIds.length===expectedIds.length&&actualIds.every((id,index)=>id===expectedIds[index])),completed=queueAttached&&queueSnapshot?.completed===true,currentIndex=queueAttached&&Number.isInteger(queueSnapshot?.index)&&queueSnapshot.index>=0&&queueSnapshot.index<queueItems.length?queueSnapshot.index:-1,currentQueueId=currentIndex>=0?queueItems[currentIndex]?.queueItemId:null,played=new Set(queueAttached&&Array.isArray(playHistoryQueueItemIds)?playHistoryQueueItemIds:[]),skipped=new Set(queueAttached&&Array.isArray(queueSnapshot?.skippedQueueItemIds)?queueSnapshot.skippedQueueItemIds:[]);
  const stops=journey.stops.map((stop,index)=>({index,stopId:stop.stopId,queueItemId:stop.queueItemId,title:stop.playback.title,artist:stop.playback.artist,album:stop.playback.album||'',artworkRef:stop.playback.artworkRef||null,state:!queueAttached?'unknown':completed&&index===journey.stops.length-1?'completed':skipped.has(stop.queueItemId)?'skipped':!completed&&stop.queueItemId===currentQueueId?'current':completed||index<currentIndex||played.has(stop.queueItemId)?'played':'upcoming',waypoint:journey.waypoints.some(waypoint=>waypoint.pointId===stop.pointId)}));
  return deeplyFreeze({kind:'sonic-atlas-fallback',journeyId:journey.journeyId,frozenRevision:journey.frozenRevision,title:'Sonic Atlas Journey',description:completed?'Completed ordered Journey.':queueAttached?'Ordered Journey sequence controlled by the NaviMuse playback queue.':'Ordered Journey sequence is not attached to the current playback queue.',stops,controls:{previous:currentIndex>0,playPause:currentIndex>=0&&!completed,next:currentIndex>=0&&currentIndex<stops.length-1,openQueue:queueAttached},queueAttached,completed});
}
export function atlasPersistedJourneyFallbackModel(persistedValue,queueSnapshot,playHistoryQueueItemIds=[]){const persisted=parsePersistedJourneyState(persistedValue);return atlasJourneyFallbackModel(persisted.journey,{...queueSnapshot,expectedInstanceId:persisted.queueBinding.queueInstanceId},playHistoryQueueItemIds)}
export function atlasFallbackQueueAction(model, action){if(model?.kind!=='sonic-atlas-fallback')throw new TypeError('Atlas fallback model is required');if(!['previous','playPause','next','openQueue'].includes(action))throw new TypeError('Unsupported fallback action');return deeplyFreeze({authority:'navimuse-queue',action,journeyId:model.journeyId,frozenRevision:model.frozenRevision})}

export function dispatchAtlasFallbackQueueAction(model, action, handlers = {}, event) {
  if (!model?.queueAttached || !model.controls?.[action]) return false;
  const request = atlasFallbackQueueAction(model, action);
  const handler = handlers[request.action];
  if (typeof handler !== 'function') return false;
  if (request.action === 'openQueue') handler(event);
  else handler();
  return true;
}
