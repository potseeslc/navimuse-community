// Only the native shell exposes this capability. No browser/UA fallback.
export function publishNativeRemotePlayer({scope,session,checked,busy,error,userInitiated=false},bridge=globalThis.window?.__NAVIMUSE_REMOTE_NOW_PLAYING__) {
 if(!bridge?.request)return Promise.resolve(false);
 if(!checked||busy||error||['starting','reconnecting','unreachable'].includes(session?.status))return Promise.resolve(false);
 const ended=!session||['released','external','error','ended'].includes(session.status);
 const payload=ended?{action:'end'}:{action:'update',scope,sessionID:session.id,userInitiated};
 return bridge.request(payload).then(()=>true).catch(()=>false);
}
export function endNativeRemotePlayer(bridge=globalThis.window?.__NAVIMUSE_REMOTE_NOW_PLAYING__) {
 return bridge?.request?.({action:'end'}).catch(()=>{}) ?? Promise.resolve();
}
