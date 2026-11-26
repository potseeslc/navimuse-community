import React,{useEffect,useRef,useState} from 'react';
import {normalizeLocalUsername} from '../shared/accountSession.js';
import {ownerCreationClient} from './services/ownerCreationService.js';
const messages={USERNAME_UNAVAILABLE:'That username is already in use. Choose another.',INVALID_ACCOUNT_CREATION:'Check the username, display name and password.',PASSWORD_INVALID:'Use a password with at least 15 characters.',PASSWORD_COMPROMISED:'Choose a password not found in known breaches.',PASSWORD_SCREENING_UNAVAILABLE:'Password checking is unavailable. Try again later.',ACCOUNT_CREATION_THROTTLED:'Too many account creation attempts. Try again later.'};
export function OwnerAccountCreation({onClose,onDenied,onReauthenticate,client=ownerCreationClient}){
 const [username,setUsername]=useState(''),[displayName,setDisplayName]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[mode,setMode]=useState('edit'),[error,setError]=useState('');
 const request=useRef(null),heading=useRef(null);
 useEffect(()=>{heading.current?.focus();},[mode]);
 useEffect(()=>()=>{request.current?.abort();request.current=null;},[]);
 useEffect(()=>{const escape=e=>{if(e.key!=='Escape'||e.defaultPrevented)return;e.preventDefault();if(mode==='saving')return;if(mode==='review')setMode('edit');else onClose();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[mode,onClose]);
 function review(e){e.preventDefault();setError('');try{setUsername(normalizeLocalUsername(username));}catch{setError('Enter a valid username.');return;}if(!displayName.trim()){setError('Enter a display name.');return;}if(password!==confirmation){setError('The passwords do not match.');return;}if([...password].length<15){setError(messages.PASSWORD_INVALID);return;}setDisplayName(displayName.trim());setMode('review');}
 async function create(){
  if(request.current||mode!=='review')return;const controller=new AbortController();request.current=controller;setMode('saving');setError('');
  try{await client.create({username,displayName,password},{signal:controller.signal});if(request.current!==controller)return;setMode('done');}
  catch(e){if(request.current!==controller)return;if(e.status===401||e.code==='OWNER_REQUIRED'){onDenied?.();setMode('reauth');setError('Owner access is no longer available. Sign in again.');}else if(e.code==='RECENT_AUTH_REQUIRED'){setMode('reauth');setError('Sign in again before creating an account.');}else if(messages[e.code]){setMode('edit');setError(messages[e.code]);}else{setMode('uncertain');setError('The result could not be confirmed. Return to accounts and check this username before creating another account.');}}
  finally{if(request.current===controller){request.current=null;setPassword('');setConfirmation('');}}
 }
 return <section className="owner-accounts owner-access-editor owner-account-creation" aria-labelledby="owner-create-title" aria-busy={mode==='saving'}>
  <header><h3 id="owner-create-title" tabIndex={-1} ref={heading}>{mode==='done'?'Account created':mode==='review'?'Review new account':'Create account'}</h3><p>Add a listener to your server.</p></header>
  {error&&<p role="alert">{error}</p>}
  {mode==='edit'&&<form onSubmit={review}>
   <label className="settings-field"><span>Username</span><input required autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={256} value={username} onChange={e=>setUsername(e.target.value)}/></label>
   <label className="settings-field"><span>Display name</span><input required autoComplete="off" maxLength={120} value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>
   <label className="settings-field"><span>Initial password</span><input required type="password" autoComplete="new-password" minLength={15} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <label className="settings-field"><span>Confirm password</span><input required type="password" autoComplete="new-password" minLength={15} maxLength={1024} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
   <p>Use at least 15 characters. Share the username and password privately with the listener.</p><button type="submit">Review account</button>
  </form>}
  {mode==='review'&&<><p>{displayName} · @{username}</p><p>Role: Listener. Music access can be assigned after creation.</p><p>The initial password is set and will not be displayed.</p><button type="button" onClick={create}>Create listener account</button><button type="button" onClick={()=>setMode('edit')}>Keep editing</button></>}
  {mode==='saving'&&<p role="status">Creating account…</p>}
  {mode==='done'&&<p>{displayName} (@{username}) can now sign in. Assign a music connection from the account list to enable listening.</p>}
  {mode==='reauth'&&onReauthenticate&&<button type="button" onClick={onReauthenticate}>Sign out to sign in again</button>}
  <button type="button" disabled={mode==='saving'} onClick={onClose}>{mode==='done'?'Done':'Back to accounts'}</button>
 </section>;
}
