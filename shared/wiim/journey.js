import {internetRadioQueue} from './internetRadio.js';
import {createQueueSourceDescriptor} from '../../src/productInteractionContract.js';
import {ordinaryQueue,PlaybackError} from './contract.js';
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
export function playbackQueue(input) {
 const radio=internetRadioQueue(input);if(radio)return radio;
 if(input?.source?.kind==='downloads')return ordinaryQueue(input);
 if(input?.instanceId)throw new PlaybackError('Detach the Atlas route before transferring to a WiiM speaker.');
 if(!Array.isArray(input?.items))return ordinaryQueue(input);
 const seedItem=input.items.find(item=>item?.radioSessionId&&item?.radioSeed);
 if(!input?.journey&&input?.source?.kind!=='radio'&&!seedItem)return ordinaryQueue(input);
 const raw=input.journey || {version:1,sessionId:seedItem?.radioSessionId,seed:seedItem?.radioSeed,autoExtend:true};
 const seed=raw.seed;
 if(raw.version!==1||typeof raw.sessionId!=='string'||!/^[a-zA-Z0-9._:-]{1,160}$/.test(raw.sessionId)||typeof raw.autoExtend!=='boolean'||!seed||!['song','artist','genre'].includes(seed.seedType)||!['journey','artist-dj'].includes(seed.sessionKind)||!validId(seed.seedSongId)||typeof seed.seedId!=='string'||!seed.seedId||seed.seedId.length>512||typeof seed.seedLabel!=='string'||seed.seedLabel.length>240)throw new PlaybackError('This Journey is missing its seed. Start the Journey again before transferring.');
 const journey={version:1,sessionId:raw.sessionId,autoExtend:raw.autoExtend&&seed.sessionKind==='journey',seed:Object.fromEntries(['seedType','seedId','seedLabel','seedSongId','sessionKind'].map(key=>[key,seed[key]]))};
 // First apply the ordinary media/occurrence boundary; only feeder metadata is relaxed.
 const normalized=ordinaryQueue({...input,source:{kind:'queue'},items:input.items?.map(item=>{
  if(item.atlas)throw new PlaybackError('Detach the Atlas route before transferring to a WiiM speaker.');
  if(item.radioSessionId&&item.radioSessionId!==journey.sessionId)throw new PlaybackError('This queue contains different Journeys. Start a new Journey before transferring.');
  return {...item,provenance:'explicit'};
 })});
 normalized.items=normalized.items.map((item,index)=>({...item,...(input.items[index].radioSessionId?{radioSessionId:journey.sessionId,radioSeed:journey.seed,provenance:input.items[index].provenance==='generated'?'generated':'source'}:{})}));
 return {...normalized,source:createQueueSourceDescriptor({kind:'radio',label:seed.seedLabel}),journey};
}
