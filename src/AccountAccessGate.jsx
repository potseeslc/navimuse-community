import { TowerArtwork } from './TowerArtwork.jsx';
import {AccountRecovery} from './AccountRecovery.jsx';
import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {RadioTower,LoaderCircle,Music2,ShieldCheck,Fingerprint} from 'lucide-react';
import {accountSessionService} from './services/accountSessionService.js';
import {createAccountAccessController} from './services/accountAccessController.js';

const messages={
  PASSKEY_CANCELLED:'Passkey sign-in cancelled. You can try again.',
  PASSKEY_NOT_COMPLETED:'The passkey request was cancelled or timed out. Try again when you are ready.',
  PASSKEY_UNAVAILABLE:'Passkeys are not available in this browser. Open NaviMuse at its secure website or use your password.',
  PASSKEY_FAILED:'That passkey could not be verified. Try again or choose another sign-in method.',
  INVALID_CREDENTIALS:'That username or password did not match. Try again.',
  ACCOUNT_COORDINATION_UNAVAILABLE:'This browser cannot safely coordinate sign-in. Use a browser with Web Locks support.',
  LOGIN_THROTTLED:'Too many sign-in attempts. Wait a little and try again.',
  PASSWORD_COMPROMISED:'Choose a password that has not appeared in a known breach.',
  PASSWORD_INVALID:'Use at least 15 characters for your new password.',
  PASSWORD_SCREENING_UNAVAILABLE:'Password checking is unavailable. Try again shortly.',
  SESSION_RECHECK_REQUIRED:'Your session could not be confirmed. Check again before continuing.',
};
export function AccountAccessGate({children,client=accountSessionService}) {
  const controller=useMemo(()=>createAccountAccessController(client),[client]);
  const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  useEffect(()=>{controller.activate();void controller.check();return()=>controller.dispose();},[controller]);
  const [usernameFirstAvailable,setUsernameFirstAvailable]=useState(false);
  useEffect(()=>{
    let active=true;setUsernameFirstAvailable(false);
    if(state.session?.state==='signed-out'&&state.session?.methods.passkey&&client.readPasskeyPolicy){
      void client.readPasskeyPolicy().then(policy=>{if(active)setUsernameFirstAvailable(policy.usernameFirst===true);}).catch(()=>{});
    }
    return()=>{active=false;};
  },[client,state.session?.state,state.session?.methods.passkey]);
  const ready=state.session?.state==='authenticated' && state.session.queueScope!==null;
  const error=state.errorCode?(messages[state.errorCode]||'NaviMuse could not complete the account request. Check the connection and try again.'):'';
  if(ready)return <React.Fragment key={state.session.queueScope}>
    {error&&<div className="account-access-notice" role="alert"><span>{error}</span><button type="button" disabled={state.busy} onClick={()=>controller.check()}>Check session</button></div>}
    {children(state.session,{refresh:controller.check,logout:controller.logout})}
  </React.Fragment>;
  return <AccountAccessSurface session={state.session} busy={state.busy} error={error} onLogin={controller.login} onSetup={controller.setup} onRetry={controller.check} onLogout={controller.logout} onPasskey={controller.loginPasskey} passkeyAvailable={client.passkeyAvailable?.()??false} onCancelPasskey={client.cancelPasskey} usernameFirstAvailable={usernameFirstAvailable}/>;
}

export function AccountAccessSurface({session,busy,error,onLogin,onSetup,onRetry,onLogout,onPasskey,passkeyAvailable=false,onCancelPasskey,usernameFirstAvailable=false}) {
  const mode=session?.state||'loading';
  const [username,setUsername]=useState(''),[displayName,setDisplayName]=useState(''),[password,setPassword]=useState(''),[token,setToken]=useState(''),[remember,setRemember]=useState(true);
  const [passkeyStage,setPasskeyStage]=useState('idle');
  const [usernamePasskey,setUsernamePasskey]=useState(false);
  const usernamePasskeyInput=useRef(null);
  useEffect(()=>{if(usernamePasskey)usernamePasskeyInput.current?.focus();},[usernamePasskey]);
  useEffect(()=>{if(!usernameFirstAvailable)setUsernamePasskey(false);},[usernameFirstAvailable]);
  const [recovering,setRecovering]=useState(false);
  useEffect(()=>setRecovering(false),[mode]);
  const passkeyButton=useRef(null);
  const signInWithPasskey=async()=>{if(busy||submitting.current)return;if(usernamePasskey&&!username.trim()){usernamePasskeyInput.current?.focus();usernamePasskeyInput.current?.reportValidity();return;}submitting.current=true;try{await onPasskey({remember,onStage:setPasskeyStage,...(usernamePasskey?{username}:{})});}finally{submitting.current=false;passkeyButton.current?.focus();}};
  const submitting=useRef(false),titleRef=useRef(null);
  useEffect(()=>{if(!recovering)titleRef.current?.focus();},[recovering]);
  useEffect(()=>{setPassword('');setToken('');if(mode!=='loading')titleRef.current?.focus();},[mode]);
  const submit=async event=>{
    event.preventDefault();if(usernamePasskey){await signInWithPasskey();return;}if(busy||submitting.current)return;submitting.current=true;
    try {const ok=mode==='setup-required'?await onSetup({username,displayName,password,setupToken:token}):await onLogin({username,password,remember});
    if(ok){setPassword('');setToken('');}}finally{submitting.current=false;}
  };
  const form=(mode==='setup-required'||mode==='signed-out')&&(session?.methods.password||mode==='signed-out'&&session?.methods.passkey);
  if(recovering&&mode==='signed-out'&&session?.methods.password)return <AccountRecovery onBack={()=>setRecovering(false)}/>;
  return <main className="onboarding-shell account-access-screen"><section className="onboarding-frame" aria-label="NaviMuse account access">
    <header className="onboarding-brand"><RadioTower aria-hidden="true" size={30}/><span>NaviMuse</span></header>
    <TowerArtwork />
        <div className="onboarding-copy">
      {form?<form className="onboarding-state" onSubmit={submit}>
        <p className="onboarding-eyebrow">{mode==='setup-required'?'First run':'Your listening space'}</p>
        <h1 ref={titleRef} tabIndex={-1}>{mode==='setup-required'?'Make NaviMuse yours':'Welcome back'}</h1>
        <p>{mode==='setup-required'?'Create your account to get started.':'Sign in to continue listening.'}</p>
        {mode==='signed-out'&&session?.methods.passkey&&<div className="account-passkey-entry">
          {usernamePasskey&&<label className="onboarding-field"><span>Username</span><input ref={usernamePasskeyInput} required maxLength={256} disabled={busy} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)}/></label>}
          <button ref={passkeyButton} className="onboarding-primary" type="button" disabled={busy||!passkeyAvailable} onClick={signInWithPasskey}><Fingerprint size={21} aria-hidden="true"/>{usernamePasskey?'Continue with security key':'Sign in with a passkey'}</button>
          {usernameFirstAvailable&&<button className="onboarding-secondary" type="button" disabled={busy||!passkeyAvailable} onClick={()=>setUsernamePasskey(value=>!value)}>{usernamePasskey?'Back to other sign-in methods':'Use a security key with your username'}</button>}
          {usernamePasskey&&<p className="account-access-help">Enter your NaviMuse username, then use your registered security key.</p>}
          {!passkeyAvailable&&<p className="account-access-help">Passkeys are unavailable here. Use your password or open NaviMuse at its secure website.</p>}
          {passkeyStage!=='idle'&&<p role="status">{passkeyStage==='verifying'?'Verifying your passkey…':passkeyStage==='authenticator'?'Complete the passkey request on your device.':'Preparing secure sign-in…'}</p>}
          {passkeyStage!=='idle'&&passkeyStage!=='verifying'&&<button type="button" className="onboarding-secondary" onClick={onCancelPasskey}>Cancel passkey request</button>}
          {(!session.methods.password||usernamePasskey)&&<label className="account-access-remember"><input type="checkbox" disabled={busy} checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember this device</label>}
          {session.methods.password&&!usernamePasskey&&<p className="account-access-divider">or use your password</p>}
        </div>}
        {session?.methods.password&&!usernamePasskey&&<fieldset className="account-access-fields" disabled={busy}>
          {mode==='setup-required'&&<><label className="onboarding-field"><span>Setup token</span><input required autoComplete="one-time-code" value={token} onChange={e=>setToken(e.target.value)}/></label><label className="onboarding-field account-access-name"><span>Your name</span><input required maxLength={120} autoComplete="name" value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label></>}
          <label className={`onboarding-field ${mode==='setup-required'?'account-access-username':''}`}><span>Username</span><input required autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)}/></label>
          <label className="onboarding-field"><span>Password</span><input required type="password" autoComplete={mode==='setup-required'?'new-password':'current-password'} minLength={mode==='setup-required'?15:undefined} value={password} onChange={e=>setPassword(e.target.value)}/></label>
          {mode==='setup-required'?<p className="account-access-help">Use at least 15 characters.</p>:<label className="account-access-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember this device</label>}
          <button className="onboarding-primary" type="submit">{busy?'Please wait…':mode==='setup-required'?'Create account':'Sign in'}</button>
        </fieldset>}
        {mode==='signed-out'&&session?.methods.password&&<button className="onboarding-secondary" type="button" disabled={busy} onClick={()=>{setPassword('');setRecovering(true);}}>Use a recovery code</button>}
      </form>:<div className="onboarding-state">
        {mode==='loading'?<><LoaderCircle aria-hidden="true" className={busy?'onboarding-spinner':''} size={28}/><h1 ref={titleRef} tabIndex={-1}>{error?'NaviMuse is out of reach':'Finding your session'}</h1><p>Checking secure access on this device.</p></>:
         mode==='authenticated'?<><Music2 aria-hidden="true" size={28}/><p className="onboarding-eyebrow">Signed in as {session.account.displayName}</p><h1 ref={titleRef} tabIndex={-1}>Your library is not connected</h1><p>Your account is ready. An owner needs to approve its music connection before you can listen.</p></>:
         mode==='migration-required'?<><ShieldCheck aria-hidden="true" size={28}/><h1 ref={titleRef} tabIndex={-1}>Your installation needs migration</h1><p>Existing accounts must be migrated on the server before sign-in can continue.</p></>:
         <><h1 ref={titleRef} tabIndex={-1}>Sign-in is not available here</h1><p>This installation needs another supported sign-in method.</p></>}
        <button className="onboarding-primary" type="button" disabled={busy} onClick={onRetry}>{busy?'Checking…':'Check again'}</button>
        {mode==='authenticated'&&<button type="button" className="onboarding-secondary" disabled={busy} onClick={onLogout}>Sign out</button>}
      </div>}
      {error&&<p className="onboarding-message" role="alert">{error}</p>}
      {form&&error&&<button className="onboarding-secondary" type="button" disabled={busy} onClick={onRetry}>Check session</button>}
    </div>
  </section></main>;
}
