import React,{useEffect,useRef,useState} from 'react';
import {Fingerprint,KeyRound} from 'lucide-react';
import {accountSessionService} from './services/accountSessionService.js';
const messages={
 RECENT_AUTH_REQUIRED:'Sign out and sign in again before changing passkeys.',
 SIGN_IN_REQUIRED:'Your account session changed. Check your session before continuing.',
 PASSKEY_CHANGED:'This passkey changed in another session. Refresh the list and try again.',
 LAST_RECOVERY_METHOD:'Add another passkey or a password before removing your last recovery method.',
 PASSKEY_CANCELLED:'Passkey creation cancelled. You can try again.',
 PASSKEY_NOT_COMPLETED:'The passkey request was cancelled or timed out. Try again when you are ready.',
 PASSKEY_ALREADY_REGISTERED:'This authenticator already has a passkey for your account. Choose another device or security key.',
 PASSKEY_UNAVAILABLE:'Passkeys are unavailable here. Open NaviMuse at its secure website to add a passkey.',
 PASSKEY_FAILED:'The passkey could not be verified. Try again with your device or security key.',
};
export function AccountPasskeys({accountId,client=accountSessionService}) {
 const [items,setItems]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[stage,setStage]=useState('idle'),[name,setName]=useState(''),[editing,setEditing]=useState(null),[rename,setRename]=useState(''),[removing,setRemoving]=useState(null);
 const alive=useRef(true),running=useRef(false),generation=useRef(0),editInput=useRef(null),removeButton=useRef(null),heading=useRef(null);
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;generation.current++;client.cancelPasskey?.();};},[accountId,client]);
 useEffect(()=>{if(editing)editInput.current?.focus();if(removing)removeButton.current?.focus();},[editing,removing]);
 async function refresh(){
  const own=++generation.current;setError('');
  try{const list=await client.listPasskeys(accountId);if(alive.current&&own===generation.current){setItems(list);setEditing(null);setRemoving(null);}}
  catch(e){if(alive.current&&own===generation.current)setError(messages[e.code]||'Passkeys could not be loaded. Check the connection and try again.');}
 }
 async function run(operation,success){
  if(running.current)return;running.current=true;setBusy(true);setError('');setMessage('');
  try{await operation();if(alive.current){setMessage(success);setName('');await refresh();heading.current?.focus();}}
  catch(e){if(alive.current)setError(messages[e.code]||'The passkey change could not be completed. Check the connection and try again.');}
  finally{running.current=false;if(alive.current){setBusy(false);setStage('idle');}}
 }
 const available=client.passkeyAvailable?.()??false;
 return <section className="account-passkey-settings" aria-labelledby="account-passkeys-title">
  <div className="account-passkey-heading"><Fingerprint size={24} aria-hidden="true"/><div><h3 id="account-passkeys-title" tabIndex={-1} ref={heading}>Passkeys</h3><p>Use your device or a security key to sign in.</p></div></div>
  {items===null&&!error&&<p role="status">Loading your passkeys…</p>}
  {items?.length===0&&<p>No passkeys yet. Add one for a faster sign-in.</p>}
  {items?.length>0&&<ul className="account-passkey-list">{items.map(item=><li key={item.id}>
   <div className="account-passkey-details"><KeyRound size={19} aria-hidden="true"/><div><strong>{item.label}</strong><p>{item.deviceType==='multiDevice'?'Sync-capable passkey':'Device or security key'} · {item.lastUsedAt?`Last used ${new Date(item.lastUsedAt).toLocaleDateString()}`:'Not used to sign in yet'}</p></div></div>
   {editing===item.id?<form className="account-passkey-edit" onSubmit={event=>{event.preventDefault();void run(()=>client.changePasskey({id:item.id,expectedRevision:item.revision,label:rename.trim()},accountId),'Passkey renamed.');}}><label><span>Passkey name</span><input ref={editInput} aria-label={`New name for ${item.label}`} maxLength={120} required value={rename} disabled={busy} onChange={e=>setRename(e.target.value)}/></label><button disabled={busy||!rename.trim()}>Save name</button><button type="button" disabled={busy} onClick={()=>{setEditing(null);heading.current?.focus();}}>Cancel rename</button></form>:
    removing===item.id?<div className="account-passkey-confirm"><p>Remove “{item.label}”? It will no longer sign in to NaviMuse. Existing sessions can be revoked separately.</p><button ref={removeButton} type="button" disabled={busy} onClick={()=>run(()=>client.changePasskey({id:item.id,expectedRevision:item.revision,remove:true},accountId),'Passkey removed.')}>Remove passkey</button><button type="button" disabled={busy} onClick={()=>{setRemoving(null);heading.current?.focus();}}>Keep passkey</button></div>:
    <div className="account-passkey-actions"><button type="button" disabled={busy} aria-label={`Rename ${item.label}`} onClick={()=>{setEditing(item.id);setRename(item.label);setRemoving(null);}}>Rename</button><button type="button" disabled={busy} aria-label={`Remove ${item.label}`} onClick={()=>{setRemoving(item.id);setEditing(null);}}>Remove</button></div>}
  </li>)}</ul>}
  <p className="account-access-help">Adding or changing passkeys requires a recent sign-in.</p>
  <form className="account-passkey-add" onSubmit={event=>{event.preventDefault();void run(()=>client.registerPasskey({accountId,label:name.trim(),onStage:value=>{if(alive.current)setStage(value);}}),'Passkey added. You can use it next time you sign in.');}}>
   <label className="settings-field"><span>Name your new passkey</span><input placeholder="e.g. MacBook or security key" maxLength={120} required disabled={busy||!available} value={name} onChange={e=>setName(e.target.value)}/></label>
   <button type="submit" disabled={busy||!available||!name.trim()}><Fingerprint size={18} aria-hidden="true"/>Add passkey</button>
  </form>
  {!available&&<p className="account-access-help">Open NaviMuse at its secure website in a browser that supports passkeys to add one.</p>}
  {stage!=='idle'&&<p role="status">{stage==='verifying'?'Verifying and saving your passkey…':stage==='authenticator'?'Complete the passkey request on your device.':'Preparing your passkey…'}</p>}
  {stage!=='idle'&&stage!=='verifying'&&<button type="button" onClick={()=>client.cancelPasskey()}>Cancel passkey request</button>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <button type="button" disabled={busy} onClick={refresh}>Refresh passkeys</button>
 </section>;
}
