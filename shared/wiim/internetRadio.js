import {PlaybackError} from './contract.js';

export function internetRadioStationId(songId) {
 return typeof songId==='string'&&/^radio:[a-zA-Z0-9_-]{1,128}$/.test(songId)?songId.slice(6):null;
}

// Station identity is the only client media input. The BFF resolves its URL and
// display metadata for the current principal; client URLs never become grants.
export function internetRadioQueue(input) {
 const items=input?.items;
 if(!Array.isArray(items)||!items.some(item=>String(item?.song?.id||'').startsWith('radio:')))return null;
 if(input.instanceId||input.journey||input.source?.kind==='downloads'||items.length!==1||input.index!==0)throw new PlaybackError('Choose one live radio station to transfer.');
 const item=items[0],stationId=internetRadioStationId(item?.song?.id);
 if(!stationId||item.atlas||item.radioSeed||item.radioSessionId||item.provenance==='generated')throw new PlaybackError('This live radio station cannot be transferred.');
 if(typeof item.queueItemId!=='string'||!item.queueItemId||item.queueItemId.length>160)throw new PlaybackError('The radio station needs a queue occurrence.');
 return {index:0,items:[{queueItemId:item.queueItemId,provenance:'explicit',song:{id:`radio:${stationId}`}}],internetRadio:{stationId},source:{kind:'radio',label:'Internet Radio'}};
}
