import {useEffect,useRef,useState} from 'react';
import {nativeAudioTransport} from './nativeAudio.js';
import {carPlayCatalog,performCarPlaySelection} from './carPlay.js';

export function useCarPlay(options) {
 const transport=nativeAudioTransport();const current=useRef({});const identity=useRef('');const revision=useRef('');const cancelled=useRef(new Set());const [refresh,setRefresh]=useState(0);const [library,setLibrary]=useState({scope:null,items:[]});
 const scope=options.scope,enabled=options.enabled;
 useEffect(()=>{
  if(!transport?.carplay||!enabled||options.offline||!scope)return;
  const controller=new AbortController();let active=true;
  options.fetchFn('/api/navidrome/library/playlists',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(active)setLibrary({scope,items:data.playlists||[]});}).catch(()=>{});
  return()=>{active=false;controller.abort();};
 },[transport,scope,enabled,options.offline,options.playlistRevision,refresh]);
 const catalog=carPlayCatalog({...options,playlists:library.scope===scope?library.items:[]});
 const key=JSON.stringify([scope,enabled,options.blocked,catalog.sections]);
 if(identity.current!==key){identity.current=key;revision.current=globalThis.crypto.randomUUID();}
 current.current={...options,...catalog,revision:revision.current};
 useEffect(()=>{
  if(!transport?.carplay)return;
  const publish=()=>transport.request({action:'carplay.catalog',snapshot:{scope:scope||'',revision:revision.current,sections:current.current.sections}}).catch(()=>{});
  void publish();
  const listener=async({detail})=>{
   if(detail?.type!=='carplay')return;
   if(detail.action==='cancel'){cancelled.current.add(detail.requestId);if(cancelled.current.size>32)cancelled.current.delete(cancelled.current.values().next().value);return;}
   if(detail.action==='refresh'){setRefresh(value=>value+1);void publish();return;}
   if(detail.action!=='select')return;
   let ok=false;
   try{ok=await performCarPlaySelection(detail,()=>current.current,{
    isCancelled:()=>cancelled.current.has(detail.requestId),
    fetchJson:async(path,timeout)=>{const response=await current.current.fetchFn(path,{signal:AbortSignal.timeout(timeout)});if(!response.ok)throw Error();return response.json();},
    playSongs:(songs,label)=>current.current.playSongs(songs,label),resume:()=>current.current.resume(),selectQueue:id=>current.current.selectQueue(id)
   });}catch{}
   void transport.request({action:'carplay.result',requestId:detail.requestId,ok}).catch(()=>{});
  };
  window.addEventListener('navimuse-native-audio',listener);
  return()=>window.removeEventListener('navimuse-native-audio',listener);
 },[transport,key,scope]);
 useEffect(()=>()=>{if(transport?.carplay)void transport.request({action:'carplay.clear'}).catch(()=>{});},[transport]);
}
