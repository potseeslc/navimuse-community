import {useEffect,useMemo,useRef,useState} from 'react';
import {saveOfflineOutputOwnership} from './offlineDownloads.js';
import {createWiiMController,createOfflineOutputController} from './wiimPlayback.js';
export function useWiiMPlayback({scope,authenticated,pauseLocal,offline=false,offlineOwnership,playbackSource}){
 const pauseRef=useRef(pauseLocal);pauseRef.current=pauseLocal;
 const [state,setState]=useState({checked:false,busy:false,session:null,outputs:[],error:'',available:false});
 const controller=useMemo(()=>offline?createOfflineOutputController(offlineOwnership):createWiiMController({scope,pauseLocal:()=>pauseRef.current(),saveOwnership:ownership=>saveOfflineOutputOwnership(scope,ownership),onChange:setState}),[scope,offline,offlineOwnership?.state]);
 useEffect(()=>{controller.setPlaybackSource(playbackSource);},[controller,playbackSource]);
 useEffect(()=>{
  if(!authenticated||offline)return;
  void controller.refresh();const timer=window.setInterval(()=>void controller.refresh(),2000);
  const refresh=()=>void controller.refresh();window.addEventListener('focus',refresh);
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[controller,authenticated,offline]);
 return {controller,state:offline?controller.state:state};
}
