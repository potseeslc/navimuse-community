import React,{useEffect,useRef,useState} from 'react';
import {accountRecoveryClient,recoveryMessages} from './services/accountRecoveryClient.js';
export function AccountRecovery({onBack,client=accountRecoveryClient}) {
 const [code,setCode]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 const request=useRef(null),heading=useRef(null);
 useEffect(()=>{heading.current?.focus();return()=>{request.current?.abort();request.current=null;};},[]);
 useEffect(()=>{if(done)heading.current?.focus();},[done]);
 async function submit(event){
  event.preventDefault();if(request.current)return;
  if(!/^r1\.[A-Za-z0-9_-]{43}$/.test(code.trim())){setError('Enter the complete recovery code from your owner.');return;}
  if(password!==confirmation){setError('The passwords do not match.');return;}
  const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{await client.redeem({code:code.trim(),password},{signal:controller.signal});if(request.current!==controller)return;setDone(true);setCode('');}
  catch(e){if(request.current===controller)setError(recoveryMessages[e.code]||'The reset could not be confirmed. Try signing in with your new password before requesting another code.');}
  finally{if(request.current===controller){request.current=null;setBusy(false);setPassword('');setConfirmation('');}}
 }
 return <main className="onboarding-shell account-access-screen account-recovery-screen"><section className="onboarding-frame" aria-label="Password recovery" onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.preventDefault();onBack();}}}>
  <header className="onboarding-brand"><span>NaviMuse</span></header><div className="onboarding-copy"><div className="onboarding-state">
   <h1 tabIndex={-1} ref={heading}>{done?'Password updated':'Reset your password'}</h1>
   {done?<p>Your existing sessions have been signed out. Sign in with your new password to continue.</p>:<>
    <p>Ask an owner for a recovery code. It can be used once and expires after 15 minutes.</p>
    <form onSubmit={submit} aria-busy={busy}><fieldset className="account-access-fields" disabled={busy}>
     <label className="onboarding-field"><span>Recovery code</span><input required autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128} value={code} onChange={e=>setCode(e.target.value)}/></label>
     <label className="onboarding-field"><span>New password</span><input required type="password" autoComplete="new-password" minLength={15} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>
     <label className="onboarding-field"><span>Confirm new password</span><input required type="password" autoComplete="new-password" minLength={15} maxLength={1024} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
     <p className="account-access-help">Use at least 15 characters. Resetting signs this account out on all devices.</p>
     <button className="onboarding-primary" type="submit">{busy?'Resetting password…':'Reset password'}</button>
    </fieldset></form>
   </>}
   {error&&<p role="alert" className="onboarding-message">{error}</p>}
   <button className="onboarding-secondary" type="button" disabled={busy} onClick={onBack}>{done?'Return to sign in':'Back to sign in'}</button>
  </div></div>
 </section></main>;
}
export function OwnerRecovery({account,onClose,onReauthenticate,onDenied,client=accountRecoveryClient}) {
 const [grant,setGrant]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reauth,setReauth]=useState(false);
 const request=useRef(null),heading=useRef(null);
 useEffect(()=>{heading.current?.focus();return()=>{request.current?.abort();request.current=null;};},[]);
 useEffect(()=>{if(!grant)return;const timer=setTimeout(()=>{setGrant(null);setError('This code has expired. Create a new one if it is still needed.');},Math.max(0,grant.expiresAt-Date.now()));return()=>clearTimeout(timer);},[grant]);
 async function issue(){
  if(request.current)return;
  const controller=new AbortController();request.current=controller;setBusy(true);setError('');setGrant(null);
  try{const result=await client.issue(account.id,{signal:controller.signal});if(request.current===controller)setGrant(result);}
  catch(e){if(request.current!==controller)return;if(e.code==='RECENT_AUTH_REQUIRED'){setReauth(true);setError(recoveryMessages[e.code]);}else if(e.status===401||e.status===403){onDenied();}else setError(recoveryMessages[e.code]||'Code creation could not be confirmed. Creating a new code replaces any earlier one.');}
  finally{if(request.current===controller){request.current=null;setBusy(false);heading.current?.focus();}}
 }
 return <section className="owner-accounts owner-recovery" aria-labelledby="owner-recovery-heading" aria-busy={busy} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.preventDefault();onClose();}}}>
  <header className="owner-accounts-heading"><h3 id="owner-recovery-heading" tabIndex={-1} ref={heading}>Password recovery for {account.displayName}</h3><button type="button" disabled={busy} onClick={onClose}>Back to accounts</button></header>
  <p>Give this code only to the account holder through a channel you trust. Creating a new code replaces any earlier code. Their password and sessions change only when they use it.</p>
  {grant?<><label className="settings-field"><span>One-time recovery code</span><input className="recovery-code" onFocus={e=>e.currentTarget.select()} readOnly autoComplete="off" value={grant.code}/></label><p role="status">Expires at {new Date(grant.expiresAt).toLocaleTimeString()}. This code is shown only here; keep it private.</p><button type="button" onClick={onClose}>Done — hide code</button></>:reauth?<button type="button" onClick={onReauthenticate}>Sign out to sign in again</button>:<button type="button" disabled={busy||account.disabled} onClick={()=>void issue()}>{busy?'Creating code…':'Create recovery code'}</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
