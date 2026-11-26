(() => {
  if (window.top !== window || location.origin !== 'https://navimuse.example.com') return;
  const handler=window.webkit?.messageHandlers?.navimuseAudio;
  if(!handler)return;
  const page=crypto.randomUUID();
  let networkType='unknown',routeKind='Unknown';
  Object.defineProperty(window,'__nmAudioTransport',{value:Object.freeze({version:1,albumQueue:true,playbackLog:true,carplay:true,hls:true,listeningLedger:true,sleepTimer:true,offlineDownloads:true,cacheAhead:true,safetyCache:true,audioFormats:Object.freeze(/*NM_AUDIO_FORMATS*/['raw','mp3']),network:true,nearbySpeakers:true,routeState:true,get routeKind(){return routeKind;},toggle:true,routePicker:true,inlineRoutePicker:true,inlineRoutePickerRow:true,get networkType(){return networkType;},request:message=>handler.postMessage({...message,page})})});
  Object.defineProperty(window,'__nmReceiveAudio',{value:message=>{if(message.page===page){if(message.payload?.type==='route')routeKind=message.payload.kind;if(message.payload?.type==='network')networkType=message.payload.networkType;window.dispatchEvent(new CustomEvent('navimuse-native-audio',{detail:message.payload}));}}});
  const bound=handler.postMessage({action:'bind',page});
  bound.then(()=>Promise.all([handler.postMessage({action:'network',page}),handler.postMessage({action:'routeState',page})])).catch(()=>{});
  const mounted=()=>{if(!document.getElementById('root')?.childElementCount)return;observer.disconnect();bound.then(()=>handler.postMessage({action:'pageReady',page})).catch(()=>{});};
  const observer=new MutationObserver(mounted);observer.observe(document,{childList:true,subtree:true});mounted();
  window.addEventListener('pagehide',()=>handler.postMessage({action:'detach',page}).catch(()=>{}));
})();
