import {useEffect,useState} from 'react';
import {nativeAudioTransport} from './nativeAudio.js';
export function useNativeOutput(){
 const [kind,setKind]=useState(()=>nativeAudioTransport()?.routeKind || 'Unknown');
 useEffect(()=>{
  const update=({detail})=>{const value=detail?.type==='route'?detail.kind:detail?.type==='diagnostic'?detail.routeKind:null;if(typeof value==='string')setKind(value);};
  const sync=()=>{const native=nativeAudioTransport();if(native?.routeState)void native.request({action:'routeState'}).catch(()=>{});};
  window.addEventListener('navimuse-native-audio',update);window.addEventListener('focus',sync);sync();
  return()=>{window.removeEventListener('navimuse-native-audio',update);window.removeEventListener('focus',sync);};
 },[]);
 return {kind,airplay:kind==='AirPlay'};
}
