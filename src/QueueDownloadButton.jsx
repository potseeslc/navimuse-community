import React from 'react';
import {Check,Download} from 'lucide-react';
import {downloadableSongs} from './offlineDownloads.js';
export function QueueDownloadButton({songs,state={},onDownload}) {
  const selected=downloadableSongs(songs),ids=new Set(selected.map(song=>song.id));
  const tracks=(state.tracks||[]).filter(track=>ids.has(track.song.id));
  const complete=tracks.filter(track=>track.state==='complete').length;
  const pending=tracks.some(track=>['queued','downloading'].includes(track.state));
  const progress=ids.has(state.progress?.songID)?state.progress:null;
  const fraction=progress?.expectedBytes>0?Math.min(1,progress.receivedBytes/progress.expectedBytes):0;
  const percent=selected.length?Math.round((complete+fraction)/selected.length*100):0;
  const done=selected.length>0&&complete===selected.length;
  const label=done?'Save downloaded queue as a collection':pending?`Downloading queue: ${percent}%`:'Download queue';
  return <div className="queue-download-action"><button className="queue-download-button" type="button" disabled={!selected.length||selected.length>500||state.busy||pending} aria-label={label} title={selected.length>500?'Download up to 500 songs at a time':label} onClick={onDownload}>
    {pending&&<svg className="queue-download-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" pathLength="100" strokeDasharray={`${percent} 100`}/></svg>}{done?<Check size={18}/>:<Download size={18}/>}<span>{pending?`${percent}%`:done?'Save queue':'Download'}</span>
  </button>{state.error&&<small role="alert">{state.error}</small>}</div>;
}
