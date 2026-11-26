import {ALBUM_FILE_LIMIT,ALBUM_PCM_LIMIT,pcmBytes} from './albumPlayback.js';

// decodeAudioData cannot be aborted. Serialize codecs across both decks so rapid
// skips cannot retain an unbounded number of in-flight decoded buffers.
let decoding=Promise.resolve();
// Desktop-only adapter. Ordinary playback stays on the existing media element.
// PCM sources share its gain/output graph; there is never a second audible path.
export class WebAlbumAudio extends EventTarget {
 constructor(media,{fetchImpl=fetch}={}){
  super();this.mediaElement=media;this.fetch=fetchImpl;this.revision=0;this.playIntent=0;this._src='';this.mode=false;this.albumSource=null;this.offset=0;this._paused=true;this._ended=false;this.listeners=[];
  for(const type of ['ended','pause','play','loadedmetadata','durationchange','canplay','playing','waiting','seeked','timeupdate','streamdetails','loadstart','error']){
   const listener=()=>{if(!this.mode)this.emit(type);};media.addEventListener(type,listener);this.listeners.push([type,listener]);
  }
 }
 attach(){for(const [type,listener] of this.listeners)this.mediaElement.addEventListener(type,listener);}
 setPCMOutput(context,output){this.context=context;this.output=output;}
 emit(type,detail){this.dispatchEvent(detail?new CustomEvent(type,{detail}):new Event(type));}
 get supportsAlbumQueue(){return Boolean(this.context&&this.output);}
 get src(){return this._src;}set src(value){this._src=value;}
 get currentSrc(){return this._src?new URL(this._src,globalThis.location?.href||'http://localhost/').href:'';}
 get currentTime(){return this.mode?Math.min(this.duration||0,this.offset+(this._paused?0:Math.max(0,this.context.currentTime-this.startedAt))):this.mediaElement.currentTime;}
 set currentTime(value){if(!Number.isFinite(value)||value<0)return;if(!this.mode){this.mediaElement.currentTime=value;return;}const resume=!this._paused;this.halt();this.offset=Math.min(value,this.duration||0);this._ended=false;if(resume)this.startPCM();this.emit('seeked');}
 get duration(){return this.mode?this.buffer?.duration||NaN:this.mediaElement.duration;}
 get paused(){return this.mode?this._paused:this.mediaElement.paused;}
 get ended(){return this.mode?this._ended:this.mediaElement.ended;}
 get error(){return this.mode?null:this.mediaElement.error;}
 get readyState(){return this.mode?(this.buffer?4:0):this.mediaElement.readyState;}
 get seekable(){const duration=this.duration;return this.mode?{length:duration>0?1:0,start:()=>0,end:()=>duration}:this.mediaElement.seekable;}
 get buffered(){return this.mode?this.seekable:this.mediaElement.buffered;}
 get volume(){return this.mediaElement.volume;}set volume(v){this.mediaElement.volume=v;}
 get muted(){return this.mediaElement.muted;}set muted(v){this.mediaElement.muted=v;}
 get playbackRate(){return 1;}set playbackRate(v){this.mediaElement.playbackRate=v;}
 get defaultPlaybackRate(){return 1;}set defaultPlaybackRate(v){this.mediaElement.defaultPlaybackRate=v;}
 set preload(v){this.mediaElement.preload=v;}
 hasAttribute(n){return n==='src'?Boolean(this._src):this.mediaElement.hasAttribute(n);}
 getAttribute(n){return n==='src'?this._src:this.mediaElement.getAttribute(n);}
 removeAttribute(n){if(n==='src')this._src='';else this.mediaElement.removeAttribute(n);}
 stopNode(node){if(!node)return;node.onended=null;try{node.stop();}catch{}try{node.disconnect();}catch{}}
 halt(){if(!this.mode)return;this.offset=this.currentTime;this._paused=true;this.stopNode(this.node);this.node=null;this.stopNode(this.next?.node);if(this.next)this.next.node=null;}
 cancelAlbum(){this.prepareRevision=(this.prepareRevision||0)+1;this.nextAbort?.abort();this.nextAbort=null;this.stopNode(this.next?.node);this.next=null;this.albumToken=null;}
 async decode(url,signal,metadata={},available=ALBUM_PCM_LIMIT){
  // Declared frame count prevents large high-resolution/multichannel decodes.
  const estimate=Number(metadata.duration)*this.context.sampleRate*Math.max(2,Number(metadata.channelCount)||2)*4;
  if(!Number.isFinite(estimate)||estimate<=0||estimate>available)throw Error('Album exceeds PCM budget');
  const response=await this.fetch(url,{credentials:'same-origin',signal,redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length'))>ALBUM_FILE_LIMIT){await response.body?.cancel();throw Error('Album source unavailable or too large');}
  const reader=response.body?.getReader();if(!reader)throw Error('Bounded streaming reader unavailable');
  let length=0;const chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>ALBUM_FILE_LIMIT)throw Error('Album source exceeds file budget');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  const job=decoding.catch(()=>{}).then(()=>{
   if(signal.aborted)throw new DOMException('Cancelled','AbortError');
   return this.context.decodeAudioData(bytes.buffer);
  });
  decoding=job.then(()=>undefined,()=>undefined);
  const buffer=await job;
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  if(pcmBytes(buffer)>available)throw Error('Decoded album exceeds PCM budget');
  return buffer;
 }
 load(){
  this.playIntent++;this.halt();this.cancelAlbum();this.loadAbort?.abort();this.buffer=null;this.mode=false;this.mediaElement.pause();
  const revision=++this.revision;this.offset=0;this._ended=false;this._paused=true;
  if(!this._src){this.mediaElement.removeAttribute('src');this.mediaElement.load();this.pendingLoad=Promise.resolve();return;}
  const ordinary=()=>{this.mode=false;this.mediaElement.src=this._src;this.mediaElement.load();};
  if(!this.albumSource||!this.supportsAlbumQueue){ordinary();this.pendingLoad=Promise.resolve();return;}
  this.mode=true;this.mediaElement.removeAttribute('src');this.mediaElement.load();this.emit('loadstart');
  const controller=this.loadAbort=new AbortController();
  // A slow full-file decode must never hold ordinary playback indefinitely.
  const timer=setTimeout(()=>controller.abort(),12000);
  this.pendingLoad=this.decode(this.currentSrc,controller.signal,this.albumSource).then(buffer=>{
   if(revision!==this.revision)return;this.buffer=buffer;this.emit('loadedmetadata');this.emit('canplay');
  }).catch(()=>{if(revision===this.revision){ordinary();this.emit('albumfallback',{reason:'current-not-ready'});}}).finally(()=>clearTimeout(timer));
 }
 async play(){const revision=this.revision,intent=++this.playIntent;await this.pendingLoad;if(revision!==this.revision||intent!==this.playIntent)throw new DOMException('Track changed','AbortError');if(!this.mode)return this.mediaElement.play();await this.context.resume();if(revision!==this.revision||intent!==this.playIntent)throw new DOMException('Track changed','AbortError');if(this._paused)this.startPCM();}
 pause(){this.playIntent++;if(!this.mode){this.mediaElement.pause();return;}this.halt();this.emit('pause');}
 startPCM(){
  if(!this.buffer)return;this._paused=false;this._ended=false;this.startedAt=this.context.currentTime;
  const node=this.node=this.source(this.buffer,this.startedAt,this.offset);node.onended=()=>this.finished(node);
  this.scheduleNext();this.emit('playing');
 }
 source(buffer,when,offset,onended){const node=this.context.createBufferSource();node.buffer=buffer;node.connect(this.output);node.onended=onended;node.start(when,offset);node.stop(when+buffer.duration-offset);return node;}
 scheduleNext(){
  if(!this.next||this._paused||this.next.node)return;
  const when=this.startedAt+this.buffer.duration-this.offset;
  if(when<=this.context.currentTime+.05)return;
  this.next.when=when;
  const node=this.next.node=this.source(this.next.buffer,when,0);node.onended=()=>this.finished(node);
 }
 finished(node){
  if(this.next?.node===node)this.promote();
  if(node!==this.node)return;
  if(this.next?.node){this.promote();return;}
  this.offset=this.duration;this._paused=true;this._ended=true;this.node=null;this.emit('ended');
 }
 promote(){
  const next=this.next;if(!next?.node)return;
  this.node=next.node;this.buffer=next.buffer;this._src=next.entry.url;this.startedAt=next.when;this.offset=0;this.next=null;this._ended=false;
  this.emit('albumhandoff',{token:this.albumToken,queueItemId:next.entry.queueItemId});this.emit('loadedmetadata');this.emit('playing');
 }
 async prepareAlbum({token,entries}){
  if(!this.mode||!this.buffer||!entries?.length)return false;
  if(this.albumToken===token)return Boolean(this.next);
  this.cancelAlbum();this.albumToken=token;const revision=this.prepareRevision;
  const controller=this.nextAbort=new AbortController(),entry=entries[0];const timer=setTimeout(()=>controller.abort(),20000);
  try{
   const buffer=await this.decode(entry.url,controller.signal,entry,ALBUM_PCM_LIMIT-pcmBytes(this.buffer));
   if(revision!==this.prepareRevision||this.albumToken!==token)return false;
   this.next={buffer,entry};this.scheduleNext();return true;
  }catch{if(revision===this.prepareRevision)this.emit('albumfallback',{reason:'next-not-ready'});return false;}finally{clearTimeout(timer);}
 }
 dispose(){this.halt();this.cancelAlbum();this.loadAbort?.abort();this.buffer=null;this.mediaElement.pause();for(const [type,listener] of this.listeners)this.mediaElement.removeEventListener(type,listener);}
}
