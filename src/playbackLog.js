const KEY='navimuse.playback-log.v1';
export const PLAYBACK_LOG_LIMIT=2000;
const WEEK=7*24*60*60*1000;
const events=new Set(['loadstart','playing','waiting','stalled','pause','ended','error','seeking','seeked','sample','network']);
const connections=new Set(['offline','online','wifi','cellular','ethernet','unknown','slow-2g','2g','3g','4g']);
export function sanitizePlaybackEvent(value) {
 if(!value||!events.has(value.event)||!Number.isFinite(value.at))return null;
 const clean={event:value.event,at:value.at};
 for(const key of ['deck','generation','position','bufferSeconds','readyState','networkState','errorCode'])if(Number.isFinite(value[key])&&value[key]>=0)clean[key]=Math.round(value[key]*100)/100;
 if(connections.has(value.network))clean.network=value.network;
 return clean;
}
export function createPlaybackLog({storage,now=Date.now}={}) {
 let entries=[];
 try{const saved=JSON.parse(storage?.getItem(KEY)||'[]');if(Array.isArray(saved))entries=saved.map(sanitizePlaybackEvent).filter(Boolean);}catch{}
 const prune=()=>{entries=entries.filter(e=>e.at>=now()-WEEK&&e.at<=now()).slice(-PLAYBACK_LOG_LIMIT);};
 const save=()=>{prune();try{storage?.setItem(KEY,JSON.stringify(entries));}catch{}};
 return {
  record(value){const event=sanitizePlaybackEvent({...value,at:now()});if(event){entries.push(event);save();}},
  snapshot(){prune();return {schema:'navimuse-playback-log/v1',platform:'web',timestampUnit:'unix-milliseconds',exportedAt:new Date(now()).toISOString(),events:entries.map(e=>({...e}))};},
  clear(){entries=[];try{storage?.removeItem(KEY);}catch{}}
 };
}
let singleton;
export function playbackLog(){if(!singleton){let storage;try{storage=globalThis.localStorage;}catch{}singleton=createPlaybackLog({storage});}return singleton;}
const bindings=new WeakMap();
export function unbindPlaybackLog(media){bindings.get(media)?.();bindings.delete(media);}
export function bindPlaybackLog(media,deck,{log=playbackLog(),windowLike=globalThis.window,navigatorLike=globalThis.navigator,now=Date.now}={}) {
 if(!media||typeof media.addEventListener!=='function'||bindings.has(media))return;
 let generation=0,lastSample=0;
 const connection=()=>navigatorLike?.onLine===false?'offline':connections.has(navigatorLike?.connection?.type)?navigatorLike.connection.type:'online';
 const record=event=>{
  if(event==='loadstart')generation++;
  const position=Number(media.currentTime);let bufferSeconds=0;
  try{for(let i=0;i<media.buffered.length;i++)if(media.buffered.start(i)<=position&&media.buffered.end(i)>position)bufferSeconds=Math.max(bufferSeconds,media.buffered.end(i)-position);}catch{}
  log.record({event,deck,generation,position,bufferSeconds,readyState:media.readyState,networkState:media.networkState,errorCode:media.error?.code,network:connection()});
 };
 const callbacks=new Map();
 for(const event of events){if(['sample','network'].includes(event))continue;const callback=()=>record(event);callbacks.set(event,callback);media.addEventListener(event,callback);}
 const sample=()=>{if(!media.paused&&now()-lastSample>=30000){lastSample=now();record('sample');}};
 const network=()=>record('network');
 media.addEventListener('timeupdate',sample);windowLike?.addEventListener('online',network);windowLike?.addEventListener('offline',network);navigatorLike?.connection?.addEventListener('change',network);
 bindings.set(media,()=>{for(const [event,callback]of callbacks)media.removeEventListener(event,callback);media.removeEventListener('timeupdate',sample);windowLike?.removeEventListener('online',network);windowLike?.removeEventListener('offline',network);navigatorLike?.connection?.removeEventListener('change',network);});
}
export async function exportPlaybackLog(transport) {
 if(transport?.playbackLog)return transport.request({action:'diagnostics.export'});
 const report=playbackLog().snapshot();
 if(transport){report.platform='ios-legacy';report.note='Detailed native logging requires the newer app build.';}
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='navimuse-playback-log.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export async function clearPlaybackLog(transport){if(transport?.playbackLog)await transport.request({action:'diagnostics.clear'});playbackLog().clear();}
