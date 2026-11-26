import React,{useEffect,useRef,useState} from 'react';
import {ownerConnectionClient} from './services/ownerConnectionService.js';
const reloadSession=()=>window.location.reload();
export function OwnerConnectionEditor({account,self=false,onClose,onSaved,onDenied,onReauthenticate=reloadSession,client=ownerConnectionClient}) {
 const [current,setCurrent]=useState(null),[choices,setChoices]=useState([]),[draft,setDraft]=useState(''),[phase,setPhase]=useState('loading'),[message,setMessage]=useState('');
 const request=useRef(null),heading=useRef(null),confirmation=useRef(null),dirty=useRef(false);
 const busy=phase==='loading'||phase==='saving';
 useEffect(()=>{heading.current?.focus();},[]);
 useEffect(()=>{if(phase==='confirm')confirmation.current?.focus();else if(!['loading','saving'].includes(phase)&&document.activeElement===document.body)heading.current?.focus();},[phase]);
 const denied=e=>e.status===401||e.status===403&&e.code!=='RECENT_AUTH_REQUIRED';
 async function refresh(){
  if(request.current)return;
  const controller=new AbortController();request.current=controller;setPhase('loading');setMessage('');
  try{
   const [catalog,binding]=await Promise.all([client.catalog({signal:controller.signal}),client.read(account.id,{signal:controller.signal})]);
   if(request.current!==controller)return;
   setChoices(catalog);setCurrent(binding);
   if(!dirty.current)setDraft(binding.credentialRef||'');
   setPhase('ready');setMessage(dirty.current?'Current access refreshed. Review your selection before saving.':'');
  }catch(e){if(request.current!==controller)return;if(denied(e)){onDenied();return;}setPhase('refresh');setMessage('Music access could not be loaded. Refresh before making a change.');}
  finally{if(request.current===controller){request.current=null;}}
 }
 useEffect(()=>{void refresh();return()=>{request.current?.abort();request.current=null;};},[account.id,client]);
 async function save(){
  if(request.current||phase!=='confirm')return;
  const controller=new AbortController();request.current=controller;setPhase('saving');setMessage('');
  try{
   const result=await client.save(account.id,{expectedRevision:current.revision,credentialRef:draft||null},{signal:controller.signal});
   if(request.current!==controller)return;
   if(result.reauthenticate){setPhase('reauthenticate');setMessage('Your music access changed. Sign in again to continue.');onReauthenticate();return;}
   dirty.current=false;setCurrent({revision:result.revision,credentialRef:draft||null});setPhase('ready');setMessage('Music access saved.');onSaved({id:account.id,musicConfigured:Boolean(draft),bindingRevision:result.revision});
  }catch(e){
   if(request.current!==controller)return;
   if(denied(e)){onDenied();return;}
   if(e.code==='RECENT_AUTH_REQUIRED'){setPhase('reauthenticate');setMessage('Sign in again before changing music access.');return;}
   setPhase('refresh');setMessage(e.status===409?'Music access changed elsewhere. Refresh and review before saving again.':'The save could not be confirmed. Refresh to check current access before saving again.');
  }finally{if(request.current===controller)request.current=null;}
 }
 const available=draft===''||choices.some(item=>item.reference===draft);
 const changed=current&&draft!==(current.credentialRef||'');
 return <section className="owner-connection-editor" aria-labelledby="connection-editor-heading" aria-busy={busy}>
  <header className="owner-accounts-heading"><div><h3 id="connection-editor-heading" tabIndex={-1} ref={heading}>Music access for {account.displayName}</h3><p>@{account.username}{self?' · You':''}</p></div><button type="button" disabled={busy} onClick={onClose}>Back to accounts</button></header>
  {busy&&<p role="status">{phase==='saving'?'Saving music access…':'Loading music access…'}</p>}
  {message&&<p role={phase==='refresh'||phase==='reauthenticate'?'alert':'status'}>{message}</p>}
  {current&&<><label className="settings-field"><span>Music connection</span><select aria-label="Music connection" value={draft} disabled={phase!=='ready'} onChange={e=>{dirty.current=true;setDraft(e.target.value);setMessage('');}}><option value="">No music connection</option>{!available&&<option value={draft} disabled>Unavailable connection ({draft})</option>}{choices.map(item=><option key={item.reference} value={item.reference}>{item.label}</option>)}</select></label>
   <p className="settings-note">Changing this assignment signs this account out on all devices and removes its trusted-device sessions.{self?' You will need to sign in again.':''} Removing the connection prevents music access.</p>
   {phase==='ready'&&<button type="button" disabled={!changed||!available} onClick={()=>setPhase('confirm')}>Review change</button>}
  </>}
  {phase==='confirm'&&<div role="group" aria-label="Confirm music access change" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setPhase('ready');heading.current?.focus();}}}><p>Set {account.displayName} to {draft?choices.find(item=>item.reference===draft)?.label:'No music connection'} and sign this account out on all devices?</p><button ref={confirmation} type="button" onClick={()=>void save()}>Save music access</button><button type="button" onClick={()=>{setPhase('ready');heading.current?.focus();}}>Cancel change</button></div>}
  {phase==='refresh'&&<button type="button" onClick={()=>void refresh()}>Refresh current access</button>}
  {phase==='reauthenticate'&&<button type="button" onClick={onReauthenticate}>Sign out to sign in again</button>}
 </section>;
}
