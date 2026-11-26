import {LoadingDots} from './LoadingDots.jsx';
import {supportsOfflineDownloads} from './offlineDownloads.js';
import {useOfflineDownloads} from './useOfflineDownloads.js';
import {DownloadsSurface} from './DownloadsSurface.jsx';
import {scopedQueueStorage} from './queueStorageScope.js';
import {createAccountPreferencesClient} from './services/accountPreferencesService.js';
import React, {useEffect, useMemo, useState} from 'react';
import {AccountAccessGate} from './AccountAccessGate.jsx';
import {createAccountStorage} from './accountStorage.js';
import {apiRequestUrl, initializeAccountMusicScope, enterOfflineDocument} from './services/apiClient.js';

export function accountApplicationMode(config) {
  if (!config || config.app !== 'NaviMuse') throw new Error('Invalid app configuration');
  if (config.accountMode === 'local' && config.accountApi === 'navimuse-account/v1') return 'local';
  if (config.accountMode === undefined && config.accountApi === undefined && config.services && typeof config.services === 'object') return 'legacy';
  throw new Error('Unsupported account configuration');
}

function AccountPlayer({session, actions, renderPlayer}) {
  const [storage, setStorage] = useState(null);
  const client = useMemo(() => createAccountPreferencesClient(session.account.id), [session.account.id]);
  const [snapshot,setSnapshot] = useState(null), [loadError,setLoadError] = useState(false), [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active=true;
    setLoadError(false);
    client.read().then(value=>{if(active)setSnapshot(value);}).catch(()=>{if(active)setLoadError(true);});
    return()=>{active=false;};
  }, [client,attempt]);
  useEffect(() => {
    if (!initializeAccountMusicScope(session.queueScope)) {
      window.location.reload();
      return;
    }
    let backing = null;
    try { backing = window.localStorage; } catch { /* Playback can run without persistence. */ }
    setStorage(createAccountStorage(session.queueScope, backing));
  }, [session.queueScope]);
  if(loadError) return <main className="onboarding-shell"><section className="onboarding-frame"><h1>Preferences could not be loaded</h1><button onClick={()=>setAttempt(value=>value+1)}>Try again</button><button onClick={actions.refresh}>Check session</button><button onClick={actions.logout}>Sign out</button></section></main>;
  if (!storage || !snapshot) return <main aria-busy="true"><LoadingDots label="Opening your library"/></main>;
  return renderPlayer({accountSession:session, accountStorage:storage, accountPreferences:snapshot, accountPreferencesClient:client, onAccountRefresh:actions.refresh, onAccountLogout:actions.logout});
}

function OfflinePlayer({snapshot,renderPlayer}) {
  const {controller,state}=useOfflineDownloads({scope:snapshot.scope,authenticated:false,resolved:true,offline:true});
  const reconnect=()=>window.__nmAudioTransport.request({action:'offline.reconnect'});
  const storage=useMemo(()=>{
    let backing;try{backing=window.localStorage;}catch{}
    return snapshot.scope?.startsWith('queue-scope-v2:')?createAccountStorage(snapshot.scope,backing):scopedQueueStorage(backing,snapshot.scope);
  },[snapshot.scope]);
  if(!state.available)return <DownloadsSurface state={state} controller={controller} offline onReconnect={reconnect} playbackBlockedReason="Reconnect to verify access before playing downloads."/>;
  return renderPlayer({offlineAccess:state,accountStorage:storage,onOfflineReconnect:reconnect});
}

export function AccountApplication({renderPlayer, accountClient}) {
  const [offlineSnapshot,setOfflineSnapshot]=useState(null);
  const [slow,setSlow]=useState(false);
  const [mode, setMode] = useState(null), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      abort.abort();
      setFailed(true);
    }, 15000);
    const slowTimer = setTimeout(() => { if (active) setSlow(true); }, 4000);
    setFailed(false);
    setSlow(false);
    (async () => {
      try {
        if(supportsOfflineDownloads()) {
          const snapshot=await window.__nmAudioTransport.request({action:'offline.status'});
          if (!active) return;
          if(snapshot?.offlineLaunch===true) {
            enterOfflineDocument();
            if(snapshot.available && snapshot.scope?.startsWith('queue-scope-v2:'))initializeAccountMusicScope(snapshot.scope);
            if(active)setOfflineSnapshot(snapshot);return;
          }
        }
        const response = await fetch(apiRequestUrl('/api/config'), {credentials:'include', cache:'no-store', redirect:'error', signal:abort.signal});
        if (!response.ok) throw new Error('Configuration unavailable');
        const next = accountApplicationMode(await response.json());
        if (active) setMode(next);
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timer); clearTimeout(slowTimer); }
    })();
    return () => {active=false; clearTimeout(timer); clearTimeout(slowTimer); abort.abort();};
  }, [attempt]);
  if(offlineSnapshot)return <OfflinePlayer snapshot={offlineSnapshot} renderPlayer={renderPlayer}/>;
  if (mode === 'legacy') return renderPlayer({});
  if (mode === 'local') return <AccountAccessGate client={accountClient}>{(session, actions) => <AccountPlayer key={session.queueScope} session={session} actions={actions} renderPlayer={renderPlayer}/>}</AccountAccessGate>;
  return <main className="startup-shell"><section className="startup-card" aria-labelledby="startup-title">
    <h1 id="startup-title">{failed ? 'NaviMuse could not connect' : 'NaviMuse'}</h1>
    <div className="startup-status" role="status">
      {!failed && <LoadingDots label="Opening NaviMuse"/>}
      <p>{failed ? 'Check your connection and try again.' : slow ? 'Connecting is taking longer than usual. Your library will open when it is ready.' : 'Connecting to your library…'}</p>
    </div>
    <div className="startup-actions">
      {failed && <button onClick={() => setAttempt(value => value+1)}>Try again</button>}
      {supportsOfflineDownloads() && <button onClick={() => {
        window.__nmAudioTransport.request({action:'offline.open'}).catch(() => setFailed(true));
      }}>Open downloaded music</button>}
    </div>
  </section></main>;
}
