import {deviceStreamFormats} from './mobileStreaming.js';
const transport=()=>globalThis.window?.__nmAudioTransport;
export const supportsOfflineDownloads=()=>transport()?.version===1 && transport()?.offlineDownloads===true;
export async function forgetOfflineAccess() {
  if(supportsOfflineDownloads())await transport().request({action:'offline.forget'});
}
export async function reconcileOfflineAccount(scope) {
  if(supportsOfflineDownloads())await transport().request({action:'offline.account',scope:scope||null});
}
export async function saveOfflineOutputOwnership(scope,ownership) {
  if(supportsOfflineDownloads())await transport().request({action:'offline.output',scope,ownership});
}
const profileKey='navimuse-device-download-profile-v1';
export function downloadProfile() {
  let value;try{value=JSON.parse(window.localStorage.getItem(profileKey));}catch{}
  return {format:deviceStreamFormats().includes(value?.format)?value.format:'raw',bitrate:[96,128,192,256,320].includes(value?.bitrate)?value.bitrate:192};
}
export function saveDownloadProfile(value) {
  const profile={format:deviceStreamFormats().includes(value?.format)?value.format:'raw',bitrate:[96,128,192,256,320].includes(Number(value?.bitrate))?Number(value.bitrate):192};
  window.localStorage.setItem(profileKey,JSON.stringify(profile));return profile;
}
export function downloadableSongs(songs) {
  const seen=new Set();return (Array.isArray(songs)?songs:[]).filter(song=>{
    if(!song || typeof song.id!=='string' || !song.id || song.id.startsWith('radio:') || song.streamUrl || song.isRadio || seen.has(song.id))return false;
    seen.add(song.id);return true;
  });
}
// Each instance belongs to one verified account scope. Unscoped/mismatched native
// events never expose another account's metadata, even while effects reconnect.
export function createOfflineDownloadsController(scope,{native=transport(),events=globalThis.window,offline=false}={}) {
  const supported=native?.version===1 && native?.offlineDownloads===true;
  const empty={supported,available:false,tracks:[],allowsCellular:false,budgetBytes:2*1024**3,usedBytes:0,loading:supported,busy:false,error:''};
  let state=Object.freeze(empty),active=true,revision=0;const listeners=new Set();
  const publish=value=>{if(active){state=Object.freeze(value);for(const listener of listeners)listener();}};
  const accept=payload=>{
    if(!payload || !Array.isArray(payload.tracks))throw Error('Downloads could not be read. Try again.');
    const own=payload.available===true && payload.scope===scope;
    publish({...state,...payload,available:own,scope:own?scope:null,expiresAt:own?payload.expiresAt:null,outputOwnership:own?payload.outputOwnership:{state:'unknown'},tracks:own?payload.tracks:[],progress:own?payload.progress:null,loading:false});
  };
  const event=({detail})=>{if(detail?.type==='offline' && active){try{accept(detail.snapshot);}catch{}}};
  async function run(message,{refresh=false}={}) {
    if(!supported || !active)return false;
    if(state.busy)return false;
    const own=++revision;publish({...state,busy:true,error:''});
    try {
      const result=await native.request(message);
      if(!active || own!==revision)return false;
      if(result?.tracks)accept(result);
      else if(refresh){const snapshot=await native.request({action:'offline.status'});if(active && own===revision)accept(snapshot);}
      return true;
    }catch(error){if(active && own===revision)publish({...state,error:error?.message||String(error)||'Download action failed.',loading:false});return false;}
    finally{if(active && own===revision)publish({...state,busy:false});}
  }
  return Object.freeze({
    subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},getSnapshot:()=>state,
    activate(){active=true;events?.addEventListener('navimuse-native-audio',event);},
    dispose(){active=false;revision++;events?.removeEventListener('navimuse-native-audio',event);},
    async refresh({revalidate=false}={}) {
      if(!supported || !active || state.busy)return;
      const own=++revision;
      try {
        if(!offline)await native.request({action:'offline.account',scope:scope||null});
        const result=await native.request({action:'offline.status'});
        if(!active || own!==revision)return;accept(result);
        if(!offline && revalidate && scope && result.available && result.scope===scope)await run({action:'offline.authorize',scope});
      }catch(error){if(active && own===revision)publish({...state,loading:false,error:error?.message||'Downloads unavailable.'});}
    },
    download(songs,profile=downloadProfile(),collection=null) {
      const selected=downloadableSongs(songs);
      if(!selected.length || selected.length>500){publish({...state,error:'Choose between 1 and 500 library songs. Live radio cannot be downloaded.'});return Promise.resolve(false);}
      return run({action:'offline.download',scope,songs:selected.map((song,position)=>collection?.kind==='playlist'&&collection.id?{...song,downloadCollections:[{id:String(collection.id),name:String(collection.name||collection.label||'Playlist'),position}]}:song),format:profile.format,bitrate:profile.format==='raw'?0:Number(profile.bitrate)});
    },
    cancel:songID=>run({action:'offline.cancel',scope,songID}),
    remove:songID=>run({action:'offline.remove',scope,songID}),
    clear:()=>run({action:'offline.clear',scope}),
    clearAll:()=>run({action:'offline.clearAll'},{refresh:true}),
    preferences:value=>run({action:'offline.preferences',allowsCellular:value.allowsCellular,budgetBytes:Number(value.budgetBytes)},{refresh:true}),
    authorize:()=>run({action:'offline.authorize',scope}),
  });
}
