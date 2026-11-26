import {internetRadioStationId} from '../shared/wiim/internetRadio.js';
import {apiJson,jsonRequest,apiRequestUrl} from './services/apiClient.js';
import {playbackQueue} from '../shared/wiim/journey.js';
export function remoteQueue(queue,options={}){const normalized=playbackQueue({...queue,items:queue?.items?.map(item=>({...item,queueItemId:item.queueItemId||crypto.randomUUID()}))});if(normalized.journey&&typeof options.autoExtend==='boolean')normalized.journey.autoExtend=options.autoExtend&&normalized.journey.seed.sessionKind==='journey';return normalized;}
export function createWiiMController({scope,request=apiJson,pauseLocal,saveOwnership=async()=>{},onChange=()=>{}}){
 let state={checked:false,busy:false,session:null,outputs:[],error:'',available:false},disposed=false,refreshing=false,operationVersion=0,recoveryPending=false,pollError=false,playbackSource='';
 const emit=patch=>{state={...state,...(Object.hasOwn(patch,'error')?{errorSource:null}:{}),...patch};if(!disposed)onChange(state);};
 const path=suffix=>'/api/playback/wiim/'+suffix+(scope?.startsWith('queue-scope-v2:')?'?accountScope='+encodeURIComponent(scope):'');
 const post=body=>jsonRequest('POST',body,{headers:{'x-requested-with':'NaviMuse'}});
 const accept=async(session,stillCurrent=()=>!disposed)=>{
  if(!stillCurrent())return;
  const owned=session?.status==='released'?null:session;
  await saveOwnership({state:owned?'remote':'local',label:owned?.device?.name||''});
  if(stillCurrent()){const recovered=recoveryPending&&owned&&['playing','paused'].includes(owned.status);if(recovered)recoveryPending=false;emit({session:owned,releasedSession:session?.status==='released'?session:null,checked:true,available:true,...((recovered||pollError)?{error:''}:{})});pollError=false;}
 };
 async function refresh(){
  if(disposed||refreshing||state.busy)return;
  refreshing=true;const version=operationVersion;
  try{const result=await request(path('session'));if(disposed||state.busy||version!==operationVersion)return;if(result.session&&result.session.status!=='released'&&(!state.checked||result.session.id!==state.session?.id)){emit({checked:false});await pauseLocal();if(disposed||state.busy)return;}await accept(result.session,()=>!disposed&&!state.busy&&version===operationVersion);}
  catch(error){if(disposed||state.busy||version!==operationVersion)return;if(error.status===503&&!state.session)emit({checked:true,available:false,error:''});else if(!state.error||pollError){pollError=true;emit({error:`Could not check home speaker status. ${error.message||'Check your connection.'}`});}}
  finally{refreshing=false;}
 }
 async function run(operation,{reconcile=false}={}){
  if(state.busy)return false;operationVersion++;emit({busy:true,error:''});
  let failed=false;pollError=false;
  try{await operation();return true;}catch(error){failed=true;if(reconcile)recoveryPending=true;emit({error:`${error.message||'Playback change failed.'} ${reconcile?'Checking speaker playback…':'Refresh speakers to check playback before trying again.'}`});return false;}finally{emit({busy:false});if(failed&&reconcile)await refresh();}
 }
 const controller={
  setPlaybackSource(source){
   playbackSource=source||'';
   // Only preflight validation is tied to a track. Uncertain speaker ownership
   // and failed remote commands must remain visible until explicitly resolved.
   if(state.errorSource!=null&&state.errorSource!==playbackSource)emit({error:''});
  },
  get state(){return state;},get blocksLocal(){return !state.checked||state.busy||Boolean(state.session);},refresh,
  async discover(){await refresh();try{const result=await request(path('outputs'));emit({outputs:result.outputs,available:true});}catch(error){emit({error:error.status===503?'WiiM Direct is not configured on this server.':error.message});}},
  transfer:async(deviceId,queue,controls,position,options)=>{
   let normalized;try{normalized=remoteQueue(queue,options);}catch(error){emit({error:error.message,errorSource:playbackSource});return false;}
   return run(async()=>{await saveOwnership({state:'unknown',label:'Home speaker transfer'});await pauseLocal();
   if(state.session){const released=await request(path(`session/${state.session.id}/commands`),post({action:'release',revision:state.session.revision,commandId:crypto.randomUUID()}));if(released.session.status!=='released')throw Error('Speaker stop could not be confirmed.');}
   // If the response is lost, the next refresh reattaches; local playback remains blocked.
   emit({checked:false});
   const result=await request(path('session'),post({transferId:crypto.randomUUID(),deviceId,queue:normalized,controls,position}));await accept(result.session);
  });},
  command:(action,extra={})=>run(async()=>{
   if(!state.session)throw Error('Choose a WiiM output first.');
   const result=await request(path(`session/${state.session.id}/commands`),post({action,...extra,commandId:crypto.randomUUID(),revision:state.session.revision}));await accept(result.session);
  },{reconcile:true}),
  disconnect:()=>controller.command('disconnect',{acknowledgeUnconfirmedStop:true}),
  release:()=>run(async()=>{
   if(!state.session){const result=await request(path('session'));if(result.session&&result.session.status!=='released'){await pauseLocal();await accept(result.session);}else{await accept(null);return;}}
   const result=await request(path(`session/${state.session.id}/commands`),post({action:'release',revision:state.session.revision,commandId:crypto.randomUUID()}));await accept(result.session);
   if(result.session.status!=='released')throw Error('Speaker stop could not be confirmed. Local playback remains paused.');
  }),
  dispose:()=>{disposed=true;}
 };
 return controller;
}

// An offline document cannot reconcile or mutate a home-speaker session. Only a
// previously confirmed local owner may use the existing local player.
export function createOfflineOutputController(ownership) {
 const local=ownership?.state==='local';
 const state=Object.freeze({checked:local,busy:false,session:null,outputs:[],available:false,
  error:local?'':ownership?.state==='remote'?'Reconnect and release the home speaker before playing downloads.':'Reconnect to confirm playback ownership before playing downloads.'});
 const unavailable=async()=>false;
 return Object.freeze({state,blocksLocal:!local,refresh:unavailable,discover:unavailable,transfer:unavailable,command:unavailable,disconnect:unavailable,release:unavailable,setPlaybackSource(){},dispose(){}});
}


// Returning to the local player reconstructs only the fixed, account-scoped BFF
// endpoint. Speaker grants and upstream stream URLs never become local sources.
export function localPlaybackSession(session) {
 if(!session?.queue?.internetRadio)return session;
 const localSong=song=>{
  const stationId=internetRadioStationId(song?.id);
  if(!stationId)throw Error('Invalid returned radio station');
  return {...song,duration:0,streamUrl:apiRequestUrl(`/api/navidrome/radios/${encodeURIComponent(stationId)}/stream`)};
 };
 return {...session,position:0,song:localSong(session.song),queue:{...session.queue,items:session.queue.items.map(item=>({...item,song:localSong(item.song)}))}};
}

// Speaker checks must not override the status of confirmed local playback.
export function outputTransportMessage(state, localMessage = '') {
 if (state.session) return state.error || state.session.notice || state.session.journeyNotice || '';
 if (!state.checked || state.busy) return state.error || localMessage;
 return localMessage;
}
