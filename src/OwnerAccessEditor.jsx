import React,{useEffect,useRef,useState} from 'react';
import {ownerAccessClient} from './services/ownerAccessService.js';
export function OwnerAccessEditor({account,self=false,onClose,onSaved,onDenied,onReauthenticate,client=ownerAccessClient}){
 const [saved,setSaved]=useState(null),[owner,setOwner]=useState(false),[disabled,setDisabled]=useState(false),[mode,setMode]=useState('loading'),[error,setError]=useState(''),[reauth,setReauth]=useState(false);
 const request=useRef(null),title=useRef(null);
 const busy=mode==='loading'||mode==='saving';
 useEffect(()=>{title.current?.focus();},[mode]);
 const fail=(e,write)=>{
  if(e.code==='RECENT_AUTH_REQUIRED'){setReauth(true);setSaved(null);setMode('error');setError('Sign in again before changing account access.');return;}
  if(e.status===401||e.code==='OWNER_REQUIRED'||e.code==='ACCOUNT_ACCESS_DENIED'){setSaved(null);setReauth(true);setMode('error');setError('Owner access is no longer available. Sign in again.');onDenied?.();return;}
  if(e.code==='LAST_OWNER_REQUIRED'){setMode('edit');setError('Keep at least one enabled owner. This change was not saved.');return;}
  setSaved(null);setMode('error');setError(e.code==='ACCOUNT_ACCESS_CHANGED'?'Account access changed elsewhere. Refresh before reviewing another change.':write?'The save result could not be confirmed. Refresh account access before trying again.':'Account access could not be loaded. Try refreshing.');
 };
 async function load(){
  if(request.current)return;const controller=new AbortController();request.current=controller;setMode('loading');setError('');setReauth(false);
  try{const value=await client.read(account.id,{signal:controller.signal});if(request.current!==controller)return;setSaved(value);setOwner(value.owner);setDisabled(value.disabled);setMode('edit');}
  catch(e){if(request.current===controller&&e.name!=='AbortError')fail(e,false);}
  finally{if(request.current===controller)request.current=null;}
 }
 useEffect(()=>{void load();return()=>{request.current?.abort();request.current=null;};},[account.id,client]);
 useEffect(()=>{const escape=e=>{if(e.key!=='Escape'||e.defaultPrevented)return;e.preventDefault();if(mode==='saving'||mode==='done'&&self)return;if(mode==='review')setMode('edit');else onClose();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[busy,mode,self,onClose]);
 async function save(){
  if(request.current||mode!=='review'||!saved)return;
  const controller=new AbortController();request.current=controller;setMode('saving');setError('');
  try{
   const value=await client.save(account.id,{expectedGeneration:saved.revision,owner,disabled},{signal:controller.signal});if(request.current!==controller)return;
   setSaved(value);setMode('done');onSaved?.({id:account.id,roles:value.owner?['owner','listener']:['listener'],disabled:value.disabled});
   if(self)setReauth(true);
  }catch(e){if(request.current===controller&&e.name!=='AbortError')fail(e,true);}
  finally{if(request.current===controller)request.current=null;}
 }
 const changed=saved&&(owner!==saved.owner||disabled!==saved.disabled);
 return <section className="owner-accounts owner-connection-editor owner-access-editor" aria-labelledby="owner-access-title" aria-busy={busy}>
  <header><h3 id="owner-access-title" tabIndex={-1} ref={title}>{mode==='review'?'Review account access':mode==='done'?'Account access updated':'Account access'}</h3><p>{account.displayName} · @{account.username}{self?' · You':''}</p></header>
  {error&&<p role="alert">{error}</p>}
  {busy&&<p role="status">{mode==='saving'?'Saving account access…':'Loading account access…'}</p>}
  {mode==='edit'&&saved&&<form onSubmit={e=>{e.preventDefault();if(changed){setError('');setMode('review');}}}>
   <label className="settings-field"><span>Role</span><select value={owner?'owner':'listener'} onChange={e=>setOwner(e.target.value==='owner')}><option value="listener">Listener</option><option value="owner">Owner</option></select></label>
   <label className="account-access-remember"><input type="checkbox" checked={!disabled} onChange={e=>setDisabled(!e.target.checked)}/>Account enabled</label>
   <p>Owners can administer accounts and music connections. Disabling an account prevents sign-in.</p>
   <button type="submit" disabled={!changed}>Review change</button>
  </form>}
  {mode==='review'&&saved&&<><p>Role: {saved.owner?'Owner':'Listener'} → {owner?'Owner':'Listener'}</p><p>Account: {saved.disabled?'Disabled':'Enabled'} → {disabled?'Disabled':'Enabled'}</p><p>Existing sessions for this account will be signed out.{self?' This includes your current session.':''}</p><button type="button" onClick={save}>Save account access</button><button type="button" onClick={()=>setMode('edit')}>Keep editing</button></>}
  {mode==='done'&&<p>The account is {saved.disabled?'disabled':'enabled'} with the {saved.owner?'Owner':'Listener'} role.</p>}
  {reauth&&<button type="button" onClick={onReauthenticate} disabled={!onReauthenticate}>Sign out to sign in again</button>}
  {mode==='error'&&!reauth&&<button type="button" onClick={load}>Refresh account access</button>}
  <button type="button" disabled={mode==='saving'||mode==='done'&&self} onClick={onClose}>{mode==='done'?'Done':'Back to accounts'}</button>
 </section>;
}
