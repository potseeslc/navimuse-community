import {clearDownloadArtworkCache} from './DownloadArtwork.jsx';
import React,{useState} from 'react';
import {Trash2} from 'lucide-react';
import {downloadProfile,saveDownloadProfile} from './offlineDownloads.js';
import {deviceStreamFormatOptions} from './mobileStreaming.js';
import {downloadBytes} from './DownloadsSurface.jsx';
export function DownloadSettings({state,controller}) {
 const [profile,setProfile]=useState(downloadProfile),[profileError,setProfileError]=useState(''),[clearPrompt,setClearPrompt]=useState(false);
 const tracks=state.tracks||[];
 const changeProfile=next=>{try{setProfile(saveDownloadProfile(next));setProfileError('');}catch{setProfileError('Download format could not be saved on this device.');}};
 return <section aria-label="Download settings"><h3>Downloads</h3>{(state.error||profileError)&&<p role="alert">{state.error||profileError}</p>}
    <div className="downloads-storage"><div><span>Download storage</span><strong>{downloadBytes(state.usedBytes)} <small>/ {state.budgetBytes===0?'Unlimited':downloadBytes(state.budgetBytes)}</small></strong></div>{state.budgetBytes>0 && <meter min="0" max={state.budgetBytes||1} value={Math.min(state.usedBytes||0,state.budgetBytes||1)} aria-label="Download storage used"/>}</div>
    <div className="downloads-settings">
      <label className="downloads-setting"><span>Allow cellular downloads<small>Off by default. Downloads can use significant data.</small></span><input type="checkbox" checked={Boolean(state.allowsCellular)} disabled={state.busy} onChange={e=>controller.preferences({...state,allowsCellular:e.target.checked})}/></label>
      <label className="downloads-setting"><span>Storage limit<small>Includes downloads from all accounts on this device.</small></span><select value={state.budgetBytes} disabled={state.busy} onChange={e=>controller.preferences({...state,budgetBytes:Number(e.target.value)})}>{[[512*1024**2,'512 MB'],[2*1024**3,'2 GB'],[5*1024**3,'5 GB'],[10*1024**3,'10 GB'],[0,'Unlimited']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="downloads-setting"><span>Download format<small>Applies to new downloads. Existing files keep their format.</small></span><select value={profile.format} onChange={e=>changeProfile({...profile,format:e.target.value})}>{deviceStreamFormatOptions().map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {profile.format!=='raw'&&<label className="downloads-setting"><span>Download bitrate</span><select value={profile.bitrate} onChange={e=>changeProfile({...profile,bitrate:Number(e.target.value)})}>{[96,128,192,256,320].map(value=><option key={value} value={value}>{value} kbps</option>)}</select></label>}
      <p>Downloads continue while iOS permits background work. Interrupted downloads can be retried.</p>
      {state.expiresAt&&<p>Offline access until {new Date(state.expiresAt).toLocaleDateString()}. Reconnect periodically to renew.</p>}
      {!clearPrompt?<button className="downloads-clear" type="button" disabled={state.busy||!state.usedBytes&&!tracks.length} onClick={()=>setClearPrompt(true)}><Trash2 size={16} aria-hidden="true"/>Remove all downloads on this device</button>:<div className="downloads-notice"><p>Remove downloaded music for every account on this device? Your library on the server stays available.</p><button type="button" disabled={state.busy} onClick={async()=>{if(await controller.clearAll()){await clearDownloadArtworkCache();setClearPrompt(false);}}}>Remove all downloads</button><button type="button" onClick={()=>setClearPrompt(false)}>Keep downloads</button></div>}
    </div>
  </section>;
}
