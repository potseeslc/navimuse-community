import {useEffect, useRef, useState} from 'react';
import {nativeAudioTransport} from './nativeAudio.js';
import {createSleepTimer, sleepTimerDeadline, sleepTimerLabel} from './sleepTimer.js';

export function useSleepTimer({remoteSession, wiim, pauseLocal, notify}) {
  const [deadline, setDeadline] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const callbacks = useRef({pauseLocal, notify});
  callbacks.current = {pauseLocal, notify};
  const timer = useRef(null);
  if (!timer.current) timer.current = createSleepTimer({onChange:setDeadline, onExpire:()=>{
    callbacks.current.pauseLocal(); callbacks.current.notify('Sleep timer finished. Play to continue.');
  }});
  const native = nativeAudioTransport();
  const nativeTimer = native?.sleepTimer === true;
  const remoteId = remoteSession?.id;
  useEffect(()=>{
    timer.current.cancel();
    if (nativeTimer) native.request({action:'sleepTimer',minutes:0}).catch(()=>{});
    return ()=>{
      timer.current.cancel();
      if (nativeTimer) native.request({action:'sleepTimer',minutes:0}).catch(()=>{});
    };
  },[remoteId, nativeTimer]);
  useEffect(()=>{
    const update = () => { setClock(Date.now()); if (!nativeTimer) timer.current.tick(); };
    const sync = () => {
      update();
      if (nativeTimer && !remoteId) native.request({action:'sleepTimerStatus'}).then(result=>setDeadline(result.deadline || 0)).catch(()=>{});
    };
    const event = ({detail}) => { if(detail?.type==='sleepTimer') setDeadline(detail.deadline || 0); };
    const interval = setInterval(update,1000);
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    window.addEventListener('navimuse-native-audio',event);
    return ()=>{clearInterval(interval);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);window.removeEventListener('navimuse-native-audio',event);};
  },[nativeTimer,remoteId]);
  const activeDeadline = remoteSession ? remoteSession.sleepTimerDeadline || 0 : deadline;
  return {
    deadline:activeDeadline, label:activeDeadline?sleepTimerLabel(activeDeadline,clock):'', busy:busy || (remoteSession && wiim.state.busy),
    unavailable: !remoteSession && native && !nativeTimer ? 'Update NaviMuse to use the sleep timer.' : '',
    async set(minutes) {
      if(busy)return false;
      setBusy(true);
      try {
        if(minutes) sleepTimerDeadline(minutes);
        if(remoteSession) return await wiim.command('sleepTimer',{minutes});
        if(wiim.blocksLocal) throw Error('Confirm the playback output before setting a sleep timer.');
        if(native) {
          if(!nativeTimer) throw Error('Update NaviMuse to use the sleep timer.');
          const result = await native.request({action:'sleepTimer',minutes});
          setDeadline(result.deadline || 0);
        } else if(minutes) timer.current.start(minutes); else timer.current.cancel();
        setClock(Date.now());
        return true;
      } catch(error) { callbacks.current.notify(error.message || 'Sleep timer could not be changed.'); return false; }
      finally { setBusy(false); }
    }
  };
}
