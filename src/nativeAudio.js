import {canTryNativeHls,resolveNativeHls,pilotProgressiveURL} from './nativeHls.js';
// Versioned, first-party-only transport injected by the iOS shell. No browser fallback
// is started after a native failure: two engines must never play simultaneously.
export const nativeAudioTransport = () => globalThis.window?.__nmAudioTransport?.version === 1 ? window.__nmAudioTransport : null;
const decks = new Map();
const generations = new Map();
let listening = false;
let actions = {};
let lastAction='none';
let nativeStatus={};
let routePickerPresentations=0,routePickerPresenting=false;
export function nativeAudioDiagnosticSnapshot(){const deck=[...decks.values()].find(d=>!d.paused)||decks.get(0);return {revision:'native-audio-1',recovery:nativeStatus.recovery||null,sessionEvents:nativeStatus.sessionEvents||[],nowPlayingActive:Boolean(nativeStatus.nowPlayingActive),available:true,playbackState:!deck?'none':deck.paused?'paused':'playing',metadataPresent:Boolean(nativeStatus.metadataPresent),artworkPresent:Boolean(nativeStatus.artworkPresent),commandResult:nativeStatus.commandResult||'none',routePickerPresentations,routePickerPresenting,actions:Object.fromEntries(Object.keys(actions).map(k=>[k,'registered'])),lastAction,startPhase:nativeStatus.startPhase||'Not reported',startPosition:Number.isFinite(nativeStatus.startPosition)?nativeStatus.startPosition:null,startCount:Number.isFinite(nativeStatus.startCount)?nativeStatus.startCount:0,routeKind:nativeStatus.routeKind||'Not reported',outputLatency:Number.isFinite(nativeStatus.outputLatency)?nativeStatus.outputLatency:null};}
function listen() {
  if (listening) return;
  listening = true;
  const sync=()=>nativeAudioTransport()?.request({action:'sync'}).catch(()=>{});
  window.addEventListener('focus',sync);
  globalThis.document?.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
  window.addEventListener('navimuse-native-audio', ({detail}) => {
    if (detail?.type === 'routePicker') {routePickerPresenting=detail.presenting===true;if(routePickerPresenting)routePickerPresentations++;return;}
    if (detail?.type === 'remote') {lastAction=detail.action;return;}
    if (detail?.type === 'diagnostic') {nativeStatus=detail;return;}
    if (detail?.type === 'command') {
      lastAction=detail.action;let handled=false;
      try {handled=typeof actions[detail.action]==='function' && actions[detail.action]({action:detail.action})!==false;} catch {}
      nativeAudioTransport()?.request({action:'commandResult',id:detail.id,handled}).catch(()=>{});return;
    }
    decks.get(detail?.deck)?.receive(detail);
  });
}
export function bindNativeAudioActions(handlers) {
  listen(); actions = handlers;
  nativeAudioTransport()?.request({action:'commands',previous:typeof handlers.previoustrack==='function',next:typeof handlers.nexttrack==='function'}).catch(()=>{});
  return () => { if (actions === handlers) {actions = {};nativeAudioTransport()?.request({action:'commands',previous:false,next:false}).catch(()=>{});} };
}
export function publishNativeMetadata(track) {
  const transport=nativeAudioTransport();
  if (!transport) return;
  const live=String(track?.id||'').startsWith('radio:');
  transport.request({action:'metadata',metadata:track ? {title:(live&&track.radioTitle)||track.title||'',artist:live&&track.radioTitle?track.title||'Internet Radio':track.artist||'',album:track.album||'',live,artwork:track.artwork ? new URL(track.artwork,window.location.href).href : ''} : {}}).catch(()=>{});
}
export class NativeAudioDeck extends EventTarget {
  constructor(id,transport=nativeAudioTransport()) {
    super();this.id=id;this.transport=transport;this.generation=generations.get(id)||0;this.playIntent=0;this.src='';this.delivery=null;this.readyState=0;this.duration=NaN;this.paused=true;this.ended=false;this.error=null;this._time=0;this._volume=1;this._muted=false;
    decks.set(id,this);listen();
  }
  get supportsAlbumQueue(){return this.transport?.albumQueue===true;}
  async prepareAlbum({token,entries,currentQueueItemId}){await this.pendingLoad;return this.send('album.prepare',{token,entries,currentQueueItemId,currentURL:this.currentSrc});}
  cancelAlbum(){if(this.supportsAlbumQueue)this.send('album.cancel').catch(()=>{});}
  get currentSrc(){return this.src ? new URL(this.src,window.location.href).href : '';}
  get currentTime(){return this._time;}
  set currentTime(time){if(Number.isFinite(time)&&time>=0){this._time=time;this.send('seek',{time}).catch(()=>{});}}
  get volume(){return this._volume;}
  set volume(value){this._volume=Math.max(0,Math.min(1,value));this.send('volume',{volume:this._muted?0:this._volume}).catch(()=>{});}
  get muted(){return this._muted;}
  set muted(value){this._muted=Boolean(value);this.send('volume',{volume:this._muted?0:this._volume}).catch(()=>{});}
  get playbackRate(){return 1;} set playbackRate(_value){}
  get defaultPlaybackRate(){return 1;} set defaultPlaybackRate(_value){}
  get seekable(){const duration=this.duration;return {length:duration>0?1:0,start:()=>0,end:()=>duration};}
  get buffered(){return {length:0,start:()=>{throw new DOMException('No buffered range reported','IndexSizeError');},end:()=>{throw new DOMException('No buffered range reported','IndexSizeError');}};}
  hasAttribute(name){return name==='src' && Boolean(this.src);}
  getAttribute(name){return this.hasAttribute(name)?this.src:null;}
  removeAttribute(name){if(name==='src')this.src='';}
  send(action,data={}) {return this.transport.request({action,deck:this.id,generation:this.generation,...data});}
  load(){
    const generation=this.generation=(generations.get(this.id)||0)+1;generations.set(this.id,generation);this.playIntent++;this.delivery=null;this.readyState=0;this.duration=NaN;this._time=0;this.ended=false;this.error=null;this.paused=true;
    this.dispatchEvent(new Event('loadstart'));
    const restorePosition=this.resumePosition;this.resumePosition=undefined;
    const pilot=canTryNativeHls(this.transport,this.currentSrc);
    const url=pilot?pilotProgressiveURL(this.currentSrc):this.currentSrc;
    const load=hlsUrl=>{if(this.disposed||generation!==this.generation||this.error?.mediaServicesReset)throw new DOMException('Track changed','AbortError');return this.send('load',{url,...(Number.isFinite(restorePosition)&&restorePosition>=0?{restorePosition}:{}),...(hlsUrl?{hlsUrl}:{})});};
    this.pendingLoad=(pilot?this.send('load',{url:''}).then(()=>resolveNativeHls(url)).then(load):load(null)).catch(error=>{if(this.error?.mediaServicesReset)throw new DOMException('Audio system restarted','AbortError');if(!this.disposed&&generation===this.generation)this.fail(error);throw error;});
    this.pendingLoad.catch(()=>{});
  }
  async play(){
    const generation=this.generation,intent=++this.playIntent;
    await this.pendingLoad;
    if(generation!==this.generation||intent!==this.playIntent)throw new DOMException('Track changed','AbortError');
    await this.send('play');
  }
  get toggle(){return this.transport?.toggle === true ? this.toggleNative.bind(this) : undefined;}
  async toggleNative(){
    const generation=this.generation,intent=++this.playIntent;
    await this.pendingLoad;
    if(generation!==this.generation||intent!==this.playIntent)throw new DOMException('Track changed','AbortError');
    let result;
    try {result = await this.send('toggle');}
    catch(error){if(generation===this.generation && intent===this.playIntent)this.fail();throw error;}
    if(generation!==this.generation||intent!==this.playIntent)return;
    if (result && typeof result.paused === 'boolean') this.receive({type:result.paused?'pause':'playing',generation:this.generation,paused:result.paused});
  }
  pause(){this.playIntent++;this.paused=true;this.send('pause').catch(()=>{});this.dispatchEvent(new Event('pause'));}
  fail(){this.readyState=0;this.error={code:4,message:'Native playback failed'};this.dispatchEvent(new Event('error'));}
  receive(data){
    if(data.generation!==this.generation)return;
    if(data.type==='albumhandoff'){if(data.url)this.src=data.url;if(Number.isFinite(data.time))this._time=data.time;this.dispatchEvent(new CustomEvent('albumhandoff',{detail:data}));return;}
    if(data.delivery!==undefined)this.delivery=data.delivery;
    if(Number.isFinite(data.time))this._time=data.time;
    if(Number.isFinite(data.duration)&&data.duration>0)this.duration=data.duration;
    if(typeof data.paused==='boolean')this.paused=data.paused;
    this.ended=data.type==='ended';
    if(data.type==='loadedmetadata'||data.type==='canplay'||data.type==='playing')this.readyState=4;
    if(data.type==='canplay'||data.type==='playing')this.error=null;
    if(data.type==='mediareset'){this.playIntent++;this.paused=true;this.readyState=0;this.error={code:4,mediaServicesReset:true};this.dispatchEvent(new Event('error'));return;}
    if(data.type==='error'){this.fail();return;}
    this.dispatchEvent(new Event(data.type));
  }
  dispose(){this.disposed=true;this.pause();if(decks.get(this.id)===this)decks.delete(this.id);}
}
