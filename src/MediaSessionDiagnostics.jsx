import {exportPlaybackLog,clearPlaybackLog} from './playbackLog.js';
import {nativeAudioTransport,nativeAudioDiagnosticSnapshot} from './nativeAudio.js';
import React, { useState } from 'react';
import { mediaSessionDiagnosticSnapshot } from './mediaSession.js';

const snapshotNow=()=>nativeAudioTransport()?nativeAudioDiagnosticSnapshot():mediaSessionDiagnosticSnapshot();
export function MediaSessionDiagnostics() {
  const [snapshot, setSnapshot] = useState(snapshotNow);
  const [logNotice,setLogNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const logAction=async(clear=false)=>{setBusy(true);setLogNotice('');try{if(clear)await clearPlaybackLog(nativeAudioTransport());else await exportPlaybackLog(nativeAudioTransport());setLogNotice(clear?'Playback log cleared.':nativeAudioTransport()?.playbackLog?'Choose where to save or share the log.':'Playback log downloaded.');}catch{setLogNotice('Could not export or clear the playback log. Please try again.');}finally{setBusy(false);}};
  return <section aria-label="System playback diagnostics" className="transition-diagnostic">
    <h3>System playback controls</h3>
    <p className="settings-note">{nativeAudioTransport() ? "Native AVPlayer transport. Track commands use the existing app queue. Receiver behavior still requires device verification." : "On-device snapshot. Accepted means the browser accepted the request, not that a receiver displayed it."} No song details or artwork URLs are included.</p>
    <h4>Playback log</h4>
    <p className="settings-note">The latest 2,000 events from the past 7 days stay on this device. Includes buffering, connection changes and error codes. No song titles, account details, credentials or stream URLs. Only shared when you export it.</p>
    {nativeAudioTransport()&&!nativeAudioTransport().playbackLog&&<p className="settings-note">Update the iPhone app to enable detailed native playback logs.</p>}
    <button type="button" disabled={busy||Boolean(nativeAudioTransport()&&!nativeAudioTransport().playbackLog)} onClick={()=>logAction()}>Export playback log</button>{' '}
    <button type="button" disabled={busy} onClick={()=>logAction(true)}>Clear playback log</button>
    <p role="status">{logNotice}</p>
    <dl>
      <dt>Check version</dt><dd>{snapshot.revision}</dd>
      <dt>Media Session</dt><dd>{snapshot.available ? 'Available' : 'Unavailable'}</dd>
      <dt>Playback</dt><dd>{snapshot.playbackState}</dd>
      <dt>Metadata / artwork</dt><dd>{`${snapshot.metadataPresent ? 'Present' : 'Absent'} / ${snapshot.artworkPresent ? 'Present' : 'Absent'}`}</dd>
      {['previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto', 'play', 'pause'].map(action => <React.Fragment key={action}><dt>{action}</dt><dd>{snapshot.actions[action] || 'Not attempted'}</dd></React.Fragment>)}
      {nativeAudioTransport() && <><dt>Queue command result</dt><dd>{snapshot.commandResult}</dd><dt>Playback preparation</dt><dd>{snapshot.startPhase}</dd><dt>Last prepared start</dt><dd>{snapshot.startPosition==null?'Not reported':`${snapshot.startPosition.toFixed(2)} s · ${snapshot.startCount} preparations`}</dd><dt>Audio route</dt><dd>{snapshot.routeKind}</dd><dt>Reported output latency</dt><dd>{snapshot.outputLatency==null?'Not reported':`${Math.round(snapshot.outputLatency*1000)} ms`}</dd></>}
      <dt>Last received command</dt><dd>{snapshot.lastAction}</dd>
    </dl>
    <button type="button" onClick={() => setSnapshot(snapshotNow())}>Refresh system playback check</button>
  </section>;
}
