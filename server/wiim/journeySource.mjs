import {PlaybackError} from '../../shared/wiim/contract.js';

// The principal's music binding is rechecked before analysis and on every song read.
export function createJourneySource({isAccountMode=()=>false,authorize,configuration,resolveSong,readJson,fetchImpl=fetch}) {
 return async(principal,seed,{excludeIds=[],signal})=>{
  if(principal.mode!=='legacy'||isAccountMode())throw new PlaybackError('Journey analysis is unavailable for this account',503);
  await authorize(principal);
  const {url,headers}=configuration();const target=new URL(url);
  target.searchParams.set('item_id',seed);target.searchParams.set('n','100');target.searchParams.set('eliminate_duplicates','true');target.searchParams.set('mood_similarity','true');
  const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(12000)]);
  const response=await fetchImpl(target,{headers,redirect:'manual',signal:bounded});
  if(!response.ok)throw new PlaybackError('Journey analysis is unavailable',503);
  const payload=await readJson(response,2*1024*1024);
  const candidates=Array.isArray(payload)?payload:payload?.results||payload?.similar_tracks||payload?.similarTracks||payload?.tracks;
  if(!Array.isArray(candidates))throw new PlaybackError('Journey analysis returned an invalid response',502);
  const excluded=new Set([seed,...excludeIds]);
  const ids=[...new Set(candidates.slice(0,100).map(row=>String(row?.item_id||row?.itemId||row?.song_id||row?.id||''))
   .filter(id=>/^[a-zA-Z0-9_-]{1,128}$/.test(id)&&!excluded.has(id)))].slice(0,24);
  const tracks=new Array(ids.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(8,ids.length)},async()=>{
   while(cursor<ids.length){const index=cursor++;try{const song=await resolveSong(principal,ids[index],bounded);if(song?.id===ids[index])tracks[index]=song;}catch(error){if(error.status!==404)throw error;}}
  }));
  return tracks.filter(Boolean).slice(0,12);
 };
}
