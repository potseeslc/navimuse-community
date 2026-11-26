import { deeplyFreeze, parseResolvedJourney } from '../shared/sonic-atlas/index.js';
import { createQueueSourceDescriptor } from './productInteractionContract.js';
import { atlasTrackStreamPath } from './services/atlasJourneyService.js';

export function atlasJourneyQueueItems(journeyValue) {
  const journey=parseResolvedJourney(journeyValue);
  return journey.stops.map(stop=>deeplyFreeze({
    queueItemId:stop.queueItemId,
    atlas:Object.freeze({journeyId:journey.journeyId,frozenRevision:journey.frozenRevision,stopId:stop.stopId,pointId:stop.pointId}),
    song:Object.freeze({id:stop.queueItemId,source:'Sonic Atlas',atlasOwned:true,title:stop.playback.title,artist:stop.playback.artist,album:stop.playback.album||'',duration:stop.playback.durationSeconds||0,coverArt:'',streamUrl:atlasTrackStreamPath(stop.playback.trackRef)}),
    album:null
  }));
}
export function atlasJourneyQueueReplacement(journeyValue,{startStopId,currentQueueItemId}={}){const journey=parseResolvedJourney(journeyValue),items=atlasJourneyQueueItems(journey),matchedCurrent=currentQueueItemId?journey.stops.findIndex(stop=>stop.queueItemId===currentQueueItemId):-1,index=startStopId!==undefined?journey.stops.findIndex(stop=>stop.stopId===startStopId):matchedCurrent>=0?matchedCurrent:0;if(index<0)throw new TypeError('Atlas start stop is absent from frozen Journey');return deeplyFreeze({journey,queue:Object.freeze({instanceId:`atlas-${journey.journeyId}-r${journey.frozenRevision}`,source:createQueueSourceDescriptor({kind:'journey',id:journey.journeyId,label:'Journey'}),items,index})})}
export function atlasQueueMatchesJourney(queue,journeyValue){const journey=parseResolvedJourney(journeyValue),ids=journey.stops.map(stop=>stop.queueItemId),actual=Array.isArray(queue?.items)?queue.items.map(item=>item?.queueItemId):[];return Boolean(queue?.instanceId===`atlas-${journey.journeyId}-r${journey.frozenRevision}`&&ids.length===actual.length&&ids.every((id,index)=>id===actual[index]))}
