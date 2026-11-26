import {browserPasskeys,passkeyErrorCode} from './browserPasskeys.js';
import {createAccountSessionNotices} from './accountSessionNotices.js';
import {apiRequestUrl} from './apiClient.js';
import {parseAccountSession} from '../../shared/accountSession.js';
const knownCodes=new Set(['PASSKEY_FAILED','PASSKEY_CHANGED','PASSKEY_DENIED','LAST_RECOVERY_METHOD','RECENT_AUTH_REQUIRED','SIGN_IN_REQUIRED','INVALID_CREDENTIALS','LOGIN_THROTTLED','LOGIN_UNAVAILABLE','PASSWORD_LOGIN_DISABLED','REQUEST_DENIED','ACCOUNT_UNAVAILABLE','REFRESH_NOT_CURRENT','MIGRATION_REQUIRED','SETUP_CLOSED','PASSWORD_SETUP_DISABLED','SETUP_THROTTLED','INVALID_SETUP','PASSWORD_COMPROMISED','PASSWORD_INVALID','PASSWORD_SCREENING_UNAVAILABLE']);
const problem=(code,status=0)=>Object.assign(new Error('Could not complete the account request.'),{code,status});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function createAccountSessionClient({baseUrl=apiRequestUrl('/api/auth/v1'),fetchImpl=globalThis.fetch,
  locks=globalThis.navigator?.locks,wait=pause,timeoutMs=15000,channelFactory,passkeyAdapter=browserPasskeys}={}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>60000) throw new TypeError('Invalid account client timeout');
  let lockTarget=baseUrl;
  try {lockTarget=new URL(baseUrl,globalThis.location?.href).href;} catch {}
  const lockName=`navimuse-account-v1:${lockTarget}`;
  const notices=createAccountSessionNotices(lockName,channelFactory);
  let tail=Promise.resolve(),renewal=null,activePasskey=null;
  const serial=(operation,requiresLock=true)=>{
    const next=tail.then(()=>{
      if (typeof locks?.request==='function') return locks.request(lockName,{mode:'exclusive'},operation);
      // HttpOnly cookie responses cannot be undone by the client. Do not start
      // competing mutations without coordination across the shared cookie store.
      if (requiresLock) throw problem('ACCOUNT_COORDINATION_UNAVAILABLE');
      return operation();
    });
    tail=next.catch(()=>{});return next;
  };
  async function request(path,{method='GET',body}={}) {
    let response,payload;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      response=await fetchImpl(baseUrl+path,{method,credentials:'include',redirect:'error',cache:'no-store',signal:controller.signal,
        headers:{'X-Requested-With':'NaviMuse',...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      payload=await response.json();
    } catch {throw problem('ACCOUNT_UNAVAILABLE');}
    finally {clearTimeout(timer);}
    if (!response.ok) throw problem(knownCodes.has(payload?.code)?payload.code:'ACCOUNT_REQUEST_FAILED',response.status);
    return payload;
  }
  const session=payload=>{
    try {return parseAccountSession(payload);} catch {throw problem('INVALID_ACCOUNT_RESPONSE');}
  };
  const authenticated=payload=>{
    const result=session(payload);if (result.state!=='authenticated') throw problem('INVALID_ACCOUNT_RESPONSE');return result;
  };
  const ok=(payload,next)=>{
    if (!payload || payload.ok!==true || Object.keys(payload).length!==(next?2:1) || next&&payload.next!==next) throw problem('INVALID_ACCOUNT_RESPONSE');
    return next?{ok:true,next}:{ok:true};
  };
  async function requireAccount(accountId){
    const current=session(await request('/session'));
    if(typeof accountId!=='string'||current.state!=='authenticated'||current.account.id!==accountId)throw problem('SIGN_IN_REQUIRED');
  }
  function ceremony(purpose,{remember=false,label,onStage,accountId,username}={}) {
    if(activePasskey)return Promise.reject(problem('PASSKEY_BUSY'));
    const task={cancelled:false,stage:'preparing'};activePasskey=task;
    const stage=value=>{task.stage=value;try{onStage?.(value);}catch{}};
    return serial(async()=>{
      let started,completed=false;
      try {
        if(!passkeyAdapter.available(baseUrl))throw problem('PASSKEY_UNAVAILABLE');
        if(task.cancelled)throw problem('PASSKEY_CANCELLED');
        stage('preparing');
        if(purpose==='register')await requireAccount(accountId);
        started=await request(`/passkeys/${purpose}/options`,{method:'POST',body:purpose==='login'&&username!==undefined?{username}:{}});
        if(!started || Object.keys(started).length!==2 || typeof started.ceremonyId!=='string' || !/^[0-9a-f-]{36}$/.test(started.ceremonyId) || !started.options || typeof started.options!=='object')throw problem('INVALID_ACCOUNT_RESPONSE');
        if(task.cancelled)throw problem('PASSKEY_CANCELLED');
        stage('authenticator');
        let response;
        try {response=await (purpose==='login'?passkeyAdapter.authenticate(started.options):passkeyAdapter.register(started.options));}
        catch(error){throw problem(task.cancelled?'PASSKEY_CANCELLED':passkeyErrorCode(error));}
        if(task.cancelled)throw problem('PASSKEY_CANCELLED');
        // Once verification starts, resolve its cookie result before releasing the
        // shared Web Lock; cancellation cannot undo an issued HttpOnly cookie.
        stage('verifying');
        const payload=await request(`/passkeys/${purpose}/verify`,{method:'POST',body:{ceremonyId:started.ceremonyId,response,...(purpose==='login'?{remember}:{label})}});
        const value=purpose==='login'?authenticated(payload):payload;
        if(purpose==='register'&&(!value?.credential || typeof value.credential.id!=='string' || typeof value.credential.label!=='string'))throw problem('INVALID_ACCOUNT_RESPONSE');
        completed=true;if(purpose==='login')notices.publish();return value;
      }finally{
        if(started?.ceremonyId&&!completed){try{await request('/passkeys/cancel',{method:'POST',body:{ceremonyId:started.ceremonyId,purpose}});}catch{}}
        stage('idle');
      }
    }).finally(()=>{if(activePasskey===task)activePasskey=null;});
  }
  return Object.freeze({
    passkeyAvailable:()=>passkeyAdapter.available(baseUrl),
    readPasskeyPolicy:()=>serial(async()=>{const value=await request('/passkeys/policy');if(!value||Object.keys(value).length!==1||typeof value.usernameFirst!=='boolean')throw problem('INVALID_ACCOUNT_RESPONSE');return {usernameFirst:value.usernameFirst};},false),
    loginPasskey:options=>ceremony('login',options),
    registerPasskey:options=>ceremony('register',options),
    cancelPasskey:()=>{if(activePasskey&&activePasskey.stage!=='verifying'){activePasskey.cancelled=true;if(activePasskey.stage==='authenticator')passkeyAdapter.cancel();}},
    listPasskeys:accountId=>serial(async()=>{await requireAccount(accountId);const value=await request('/passkeys');if(!Array.isArray(value?.credentials))throw problem('INVALID_ACCOUNT_RESPONSE');return value.credentials;},false),
    changePasskey:(change,accountId)=>serial(async()=>{await requireAccount(accountId);return ok(await request('/passkeys/change',{method:'POST',body:change}));}),
    subscribeSessionChanges:notices.subscribe,
    readSession:()=>serial(async()=>session(await request('/session')),false),
    setup:({setupToken,username,displayName,password})=>serial(async()=>ok(await request('/setup',{method:'POST',body:{setupToken,username,displayName,password}}),'sign-in')),
    login:({username,password,remember=false})=>serial(async()=>{const value=authenticated(await request('/password/login',{method:'POST',body:{username,password,remember}}));notices.publish();return value;}),
    logout:()=>serial(async()=>{const value=ok(await request('/logout',{method:'POST'}));notices.publish();return value;}),
    renew() {
      if (renewal) return renewal;
      const current=serial(async()=>{
        const before=session(await request('/session'));
        if (before.state!=='signed-out') return before;
        try {return authenticated(await request('/refresh',{method:'POST'}));}
        catch(error) {if (error.status!==409 || error.code!=='REFRESH_NOT_CURRENT') throw error;}
        // A competing document may still be receiving its replacement cookies.
        // Never convert unresolved rotation or transport failure into logout.
        for (const delay of [0,100,300]) {
          if (delay) await wait(delay);
          const checked=session(await request('/session'));
          if (checked.state!=='signed-out') return checked;
        }
        throw problem('SESSION_RECHECK_REQUIRED',409);
      });
      renewal=current.finally(()=>{renewal=null;});return renewal;
    },
  });
}

// One instance per document/BFF configuration. Recreate only when changing servers.
export const accountSessionService=createAccountSessionClient();
