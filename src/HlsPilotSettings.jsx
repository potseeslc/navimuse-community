import React,{useState} from 'react';
import {hlsPilotEnabled,saveHlsPilot} from './nativeHls.js';
export function HlsPilotSettings(){
 const [enabled,setEnabled]=useState(hlsPilotEnabled),[error,setError]=useState('');
 if(!globalThis.window?.__nmAudioTransport?.hls)return null;
 return <div className="downloads-settings"><label className="downloads-setting"><span>Adaptive streaming pilot<small>Experimental AAC quality switching, when enabled for your account by the server administrator. Applies to the next track.</small></span><input type="checkbox" checked={enabled} onChange={e=>{try{saveHlsPilot(e.target.checked);setEnabled(e.target.checked);setError('');}catch{setError('Could not save this setting.');}}}/></label><p className="settings-note">Prepared tracks can use adaptive streaming. Other tracks use normal streaming while the server prepares them for a later play. Downloaded audio takes priority. This pilot does not preserve lossless quality.</p>{error&&<p role="alert">{error}</p>}</div>;
}
