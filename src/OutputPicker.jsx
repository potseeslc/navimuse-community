import {useNearbySpeakers} from './useNearbySpeakers.js';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Airplay,Check,MonitorSpeaker,RefreshCw,Speaker,Volume1,Volume2,X} from 'lucide-react';
import {nativeAudioTransport} from './nativeAudio.js';
const homeSpeakersKey='navimuse-show-home-speakers-v1';
function savedHomeSpeakers(){try{return window.localStorage.getItem(homeSpeakersKey)==='true';}catch{return false;}}
export function OutputPicker({open,onClose,state,onChoose,onLocal,onRefresh,onSpeakerVolume,audio,airplayActive=false}){
 const [manualHomeSpeakers,setShowHomeSpeakers]=useState(savedHomeSpeakers);
 const nearby=useNearbySpeakers(open,state.outputs);
 const showHomeSpeakers=nearby.automatic?nearby.ids.length>0:manualHomeSpeakers;
 const refresh=useRef(onRefresh);refresh.current=onRefresh;
 useEffect(()=>{if(open&&(nearby.automatic?nearby.localNetwork:manualHomeSpeakers))void refresh.current?.();},[open,nearby.automatic,nearby.network,nearby.epoch,manualHomeSpeakers]);
 const changeHomeSpeakers=event=>{const enabled=event.target.checked;setShowHomeSpeakers(enabled);try{window.localStorage.setItem(homeSpeakersKey,String(enabled));}catch{}};
 const speakerVolume=state.session?.volume;
 const volumeKnown=typeof speakerVolume==='number'&&Number.isFinite(speakerVolume)&&speakerVolume>=0&&speakerVolume<=100;
 const volumeDisabled=state.busy||!['playing','paused','ended'].includes(state.session?.status)||!volumeKnown||!onSpeakerVolume;
 const nearbyOutputs=nearby.automatic?state.outputs.filter(o=>nearby.ids.includes(o.id)):state.outputs;
 const visibleOutputs=[...new Map([...(state.session?.device?[state.session.device]:[]),...(showHomeSpeakers?nearbyOutputs:[])].map(o=>[o.id,o])).values()];
 const dialog=useRef(null);const routeAnchor=useRef(null);const inlineRoute=Boolean(nativeAudioTransport()?.inlineRoutePicker);const fullRouteRow=Boolean(nativeAudioTransport()?.inlineRoutePickerRow);const [inlineReady,setInlineReady]=useState(false);const [message,setMessage]=useState('');const [confirmDisconnect,setConfirmDisconnect]=useState(false);
 useEffect(()=>setConfirmDisconnect(false),[open,state.session?.id,state.session?.status]);
 useEffect(()=>{if(open){dialog.current?.showModal();setMessage('');}else dialog.current?.close();},[open]);
 useLayoutEffect(()=>{
  setInlineReady(false);
  if(!open||!inlineRoute||state.session||state.busy)return;
  const native=nativeAudioTransport();
  let disposed=false,sequence=0;
  const viewport=window.visualViewport;
  const position=()=>{const r=routeAnchor.current?.getBoundingClientRect();if(!r)return;const revision=++sequence;void native.request({action:'routePickerFrame',x:r.x-(fullRouteRow?(viewport?.offsetLeft||0):0),y:r.y-(fullRouteRow?(viewport?.offsetTop||0):0),width:r.width,height:r.height,...(fullRouteRow?{fullRow:true,viewportWidth:viewport?.width||window.innerWidth,viewportHeight:viewport?.height||window.innerHeight}:{})}).then(result=>{if(!disposed&&revision===sequence)setInlineReady(result?.mounted===true);}).catch(()=>{if(!disposed&&revision===sequence)setInlineReady(false);});};
  const frame=requestAnimationFrame(position);const observer=new ResizeObserver(position);if(dialog.current)observer.observe(dialog.current);
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  viewport?.addEventListener('resize',position);viewport?.addEventListener('scroll',position);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);viewport?.removeEventListener('resize',position);viewport?.removeEventListener('scroll',position);void native.request({action:'routePickerFrame',hidden:true}).catch(()=>{});};
 },[open,inlineRoute,fullRouteRow,Boolean(state.session),state.busy]);
 const airplay=async()=>{
  setMessage('');
  if(state.session){await onLocal({keepOpen:true});return;}
  try{
  const native=nativeAudioTransport();
  if(native?.routePicker)await native.request({action:'routePicker'});
  else if(typeof audio?.webkitShowPlaybackTargetPicker==='function')audio.webkitShowPlaybackTargetPicker();
  else setMessage('Open Control Center on your iPhone or Mac, then choose an AirPlay output. This browser does not provide an in-page picker.');
  }catch{setMessage('AirPlay could not open. Open Control Center and choose an AirPlay output.');}
 };
 return <dialog ref={dialog} className="output-picker" aria-labelledby="output-picker-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <header><h2 id="output-picker-title">Play on</h2><button type="button" onClick={onClose} aria-label="Close output picker"><X/></button></header>
  <button className="output-choice" type="button" disabled={state.busy} onClick={airplayActive&&!state.session?airplay:onLocal}><MonitorSpeaker/><span><strong>This device</strong><small>Speaker, headphones or Bluetooth</small></span>{!state.session&&!airplayActive&&<Check/>}</button>
  {inlineRoute&&!state.session&&!state.busy?(fullRouteRow?<button ref={routeAnchor} className="output-choice native-route-row" type="button" aria-hidden={inlineReady||undefined} tabIndex={inlineReady?-1:0} onClick={airplay}><Airplay/><span><strong>AirPlay{airplayActive&&!state.session?' · Connected':''}</strong><small>Speakers & TVs available to this device</small></span></button>:<div className="output-choice"><span ref={routeAnchor} className="native-route-anchor"/><button type="button" className="native-route-label" onClick={airplay}><strong>AirPlay{airplayActive&&!state.session?' · Connected':''}</strong><small>Speakers & TVs available to this device</small></button></div>):<button className="output-choice" type="button" disabled={state.busy} onClick={airplay}><Airplay/><span><strong>AirPlay{airplayActive&&!state.session?' · Connected':''}</strong><small>{state.session?'Stop speaker playback and switch to this device for AirPlay':'Speakers & TVs available to this device'}</small></span></button>}
  {!nearby.automatic&&<><label className="output-remote-preference"><input type="checkbox" checked={showHomeSpeakers} onChange={changeHomeSpeakers} aria-describedby="home-speakers-description"/><span>Show home network speakers on this device</span></label>
  <p id="home-speakers-description" className="output-caption">Home speakers are found by your server and can play even when you are away. This setting stays on this device.</p></>}
  {nearby.automatic&&nearby.localNetwork&&nearby.checking&&<p className="output-caption">Checking nearby speakers…</p>}
  {nearby.automatic&&nearby.localNetwork&&nearby.error&&<p className="output-caption">Nearby speakers could not be checked. Allow Local Network access in iOS Settings, then reopen Play on.</p>}
  {nearby.automatic&&nearby.localNetwork&&!nearby.checking&&!nearby.ids.length&&<p className="output-caption">No nearby home speakers found. At home, allow Local Network access in iOS Settings. <button type="button" onClick={nearby.recheck}>Check again</button></p>}
  {(showHomeSpeakers||state.session)&&<><div className="output-section"><h3>Network speakers</h3>{showHomeSpeakers&&<button type="button" disabled={state.busy} onClick={nearby.automatic?nearby.recheck:onRefresh} aria-label="Refresh speakers"><RefreshCw size={18}/></button>}</div>
  {visibleOutputs.map(output=><button className="output-choice" key={output.id} type="button" disabled={state.busy||!showHomeSpeakers||(nearby.automatic&&!nearby.ids.includes(output.id))||!output.available||output.follower} onClick={()=>onChoose(output.id)}><Speaker/><span><strong>{output.name}</strong><small>{(!showHomeSpeakers||(nearby.automatic&&!nearby.ids.includes(output.id)))?'Current session · use This device to stop':!output.available?'Unavailable':output.follower?'Select this group’s leader':output.members?.length?`With ${output.members.map(m=>m.name).join(', ')}`:'Ready to play'}</small></span>{state.session?.device?.id===output.id&&<Check/>}</button>)}
  <p className="output-caption">{nearby.automatic?'Nearby speakers · UPnP':'Speakers on your server’s network · UPnP'}</p>
  {showHomeSpeakers&&!state.outputs.length&&<p className="output-caption">{state.available?'No speakers found. Check they’re on your server’s network.':'Checking the server’s network…'}</p>}</>}
  {state.session&&<section className="output-speaker-volume" aria-label="Home speaker volume">
   <strong>{state.session.device?.name || 'Home speaker'} volume</strong>
   <SpeakerVolumeSlider key={state.session.id} volume={speakerVolume} known={volumeKnown} disabled={volumeDisabled} onCommit={value=>onSpeakerVolume(state.session.id,value)}/>
   {nativeAudioTransport()?.network&&<p className="output-caption">Use these controls for this home speaker. iPhone volume buttons adjust the phone or its AirPlay output.</p>}
  </section>}
  {(state.error||state.session?.notice||message)&&<p role="status" className="output-notice">{state.error||state.session?.notice||message}</p>}
  {state.session?.queue?.journey&&<p className="output-caption">{state.session.journeyNotice||(state.session.queue.journey.seed.sessionKind==='artist-dj'?'Artist DJ plays this finite queue.':state.session.queue.journey.autoExtend?'Your Journey continues on this speaker, even when NaviMuse is closed.':'Playing the current Journey queue. Automatic continuation is off.')}</p>}
  {state.session?.status==='unreachable'&&<div className="output-notice">
   {confirmDisconnect?<><p>The speaker may still be playing. Disconnecting removes this session from NaviMuse without confirming it stopped. Playback on this device will stay paused.</p><button type="button" disabled={state.busy} onClick={()=>onLocal({disconnect:true,keepOpen:true})}>Disconnect anyway</button><button type="button" disabled={state.busy} onClick={()=>setConfirmDisconnect(false)}>Cancel</button></>:<button type="button" disabled={state.busy} onClick={()=>setConfirmDisconnect(true)}>Disconnect unavailable speaker</button>}
  </div>}
  {state.busy&&<p role="status">Connecting playback…</p>}
 </dialog>;
}

function SpeakerVolumeSlider({volume,known,disabled,onCommit}){
 const [draft,setDraft]=useState(null);const pending=useRef(null);
 const cancel=()=>{pending.current=null;setDraft(null);};
 useEffect(()=>{if(disabled)cancel();},[disabled]);
 const commit=()=>{const value=pending.current;cancel();if(!disabled&&value!=null&&value!==Math.round(volume))onCommit(value);};
 const value=disabled||draft==null?(known?Math.round(volume):0):draft;
 return <div className="speaker-volume-slider">
  <Volume1 size={20} aria-hidden="true"/>
  <input type="range" min="0" max="100" step="1" value={value} disabled={disabled} aria-label="Home speaker volume" aria-valuetext={known?`${value}%`:'Unavailable'}
   onChange={event=>{if(disabled)return;const next=Math.max(0,Math.min(100,Number(event.currentTarget.value)));pending.current=next;setDraft(next);if(event.nativeEvent.type==='change')commit();}}
   onPointerDown={event=>event.currentTarget.setPointerCapture?.(event.pointerId)} onPointerUp={commit} onPointerCancel={cancel} onKeyUp={commit} onBlur={commit}/>
  <Volume2 size={20} aria-hidden="true"/>
  <output>{known?`${value}%`:'Unavailable'}</output>
 </div>;
}
