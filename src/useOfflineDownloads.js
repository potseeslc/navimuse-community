import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {createOfflineDownloadsController} from './offlineDownloads.js';
export function useOfflineDownloads({scope,authenticated,resolved,offline=false}) {
  const controller=useMemo(()=>createOfflineDownloadsController(scope,{offline}),[scope,offline]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  useEffect(()=>{controller.activate();return()=>controller.dispose();},[controller]);
  useEffect(()=>{
    if(!resolved)return;
    void controller.refresh({revalidate:authenticated});
    if(offline){const timer=window.setInterval(()=>void controller.refresh(),5000);return()=>window.clearInterval(timer);}
  },[controller,resolved,authenticated,offline]);
  return {controller,state};
}
