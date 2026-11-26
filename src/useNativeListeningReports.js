import {browserListeningTransport} from './browserListeningReports.js';
import {useEffect} from 'react';
import {nativeAudioTransport} from './nativeAudio.js';
import {createNativeListeningReporter} from './nativeListeningReports.js';
export function useNativeListeningReports({scope,enabled,fetchFn}) {
 useEffect(()=>{
  if(!scope||!enabled)return;
  const native=nativeAudioTransport();let transport;
  try{transport=native?.listeningLedger?native:browserListeningTransport(scope);}catch{return;}
  const reporter=createNativeListeningReporter({transport,scope,fetchFn});
  const refresh=()=>{void reporter.flush();};
  const event=({detail})=>{if(detail?.type==='listeningReady')refresh();};
  refresh();const timer=setInterval(refresh,30000);
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('navimuse-native-audio',event);
  return()=>{reporter.stop();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('navimuse-native-audio',event);};
 },[scope,enabled,fetchFn]);
}
