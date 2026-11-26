import {OwnerAccountCreation} from './OwnerAccountCreation.jsx';
import {OwnerAccessEditor} from './OwnerAccessEditor.jsx';
import {OwnerRecovery} from './AccountRecovery.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {OwnerConnectionEditor} from './OwnerConnectionEditor.jsx';
import {ownerAccounts} from './services/ownerAccountsService.js';

export function OwnerAccounts({accountId,onReauthenticate,load=ownerAccounts}) {
 const [items,setItems]=useState(null),[next,setNext]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null);
 const [access,setAccess]=useState(null);
 const [creating,setCreating]=useState(false);
 const [selected,setSelected]=useState(null),[recovering,setRecovering]=useState(null);
 const opener=useRef(null),returnToAccount=useRef(false),accountButtons=useRef(new Map());
 const request=useRef(null),heading=useRef(null),more=useRef(null),restore=useRef(false);
 async function read(append=false){
  if(request.current)return;
  const controller=new AbortController();request.current=controller;setBusy(true);setError(null);
  try{
   const result=await load({after:append?next:'',signal:controller.signal});
   if(request.current!==controller)return;
   setItems(current=>append?[...(current||[]),...result.accounts]:result.accounts);setNext(result.nextAfter);
  }catch(e){
   if(request.current!==controller||e.name==='AbortError')return;
   const denied=e.status===401||e.status===403;
   if(denied){setItems(null);setNext(null);}
   setError({append,denied,message:denied?'Owner access is no longer available. Check your sign-in.':append?'More accounts could not be loaded. Your current results are still available.':'Accounts could not be refreshed. Check the connection and try again.'});
  }finally{if(request.current===controller){request.current=null;setBusy(false);}}
 }
 useEffect(()=>{setItems(null);setNext(null);void read();return()=>{request.current?.abort();request.current=null;};},[accountId,load]);
 useEffect(()=>{if(busy||!restore.current)return;restore.current=false;if(document.activeElement===document.body)(more.current||heading.current)?.focus();},[busy,items,next,error]);
 useEffect(()=>{if(!busy&&!selected&&!recovering&&!access&&!creating&&returnToAccount.current){returnToAccount.current=false;(accountButtons.current.get(opener.current)||heading.current)?.focus();}},[selected,recovering,access,creating,busy]);
 if(creating)return <OwnerAccountCreation onReauthenticate={onReauthenticate} onClose={()=>{returnToAccount.current=true;setCreating(false);void read();}} onDenied={()=>{setCreating(false);setItems(null);setNext(null);setError({denied:true,message:'Owner access is no longer available. Sign in again.'});returnToAccount.current=true;}}/>;
 if(access)return <OwnerAccessEditor key={access.id} account={access} self={access.id===accountId} onReauthenticate={onReauthenticate} onClose={()=>{returnToAccount.current=true;setAccess(null);}} onSaved={changed=>setItems(current=>current?.map(item=>item.id===changed.id?{...item,...changed}:item))} onDenied={()=>{setAccess(null);setItems(null);setNext(null);setError({denied:true,message:'Owner access is no longer available. Sign in again.'});returnToAccount.current=true;}}/>;
 if(recovering)return <OwnerRecovery account={recovering} onClose={()=>{returnToAccount.current=true;setRecovering(null);}} onReauthenticate={onReauthenticate} onDenied={()=>{setRecovering(null);setItems(null);setNext(null);setError({denied:true,message:'Owner access is no longer available. Check your sign-in.'});returnToAccount.current=true;}}/>;
 if(selected)return <section className="owner-accounts"><OwnerConnectionEditor key={selected.id} account={selected} self={selected.id===accountId} onReauthenticate={onReauthenticate} onClose={()=>{returnToAccount.current=true;setSelected(null);}} onSaved={changed=>setItems(current=>current?.map(item=>item.id===changed.id?{...item,...changed}:item))} onDenied={()=>{setItems(null);setNext(null);setSelected(null);setError({denied:true,message:'Owner access is no longer available. Check your sign-in.'});returnToAccount.current=true;}} /></section>;
 return <section className="owner-accounts" aria-labelledby="owner-accounts-heading" aria-busy={busy}>
  <header className="owner-accounts-heading"><div><h3 id="owner-accounts-heading" tabIndex={-1} ref={heading}>Music access</h3><p>Accounts and their approved music connections.</p></div><button type="button" disabled={busy||error?.denied} ref={node=>{if(node)accountButtons.current.set('create',node);else accountButtons.current.delete('create');}} onClick={()=>{opener.current='create';setCreating(true);}}>Create account</button><button type="button" disabled={busy} onClick={()=>{heading.current?.focus();void read();}}>Refresh accounts</button></header>
  {busy&&<p role="status">{items?'Loading accounts…':'Loading account overview…'}</p>}
  {error&&<p role="alert">{error.message}</p>}
  {error?.denied&&onReauthenticate&&<button type="button" onClick={onReauthenticate}>Sign out to sign in again</button>}
  {items?.length===0&&<p>No accounts returned. Refresh to check again.</p>}
  {items?.length>0&&<><p className="settings-note" aria-live="polite">Showing {items.length} accounts{next?' · more available':''}</p><ul className="owner-account-list">{items.map(item=><li key={item.id}>
   <div><strong>{item.displayName}</strong><p>@{item.username} · {item.roles.includes('owner')?'Owner':'Listener'}{item.id===accountId?' · You':''}</p></div>
   <div className="owner-account-state"><button type="button" disabled={busy} ref={node=>{if(node)accountButtons.current.set(`access:${item.id}`,node);else accountButtons.current.delete(`access:${item.id}`);}} aria-label={`Manage account access for ${item.displayName}`} onClick={()=>{opener.current=`access:${item.id}`;setAccess(item);}}>Manage account access</button><span>{item.disabled?'Account disabled':'Account enabled'}</span><span>{item.musicConfigured?'Music connection assigned':'No music connection'}</span><button type="button" disabled={busy} ref={node=>{if(node)accountButtons.current.set(item.id,node);else accountButtons.current.delete(item.id);}} aria-label={`Manage music access for ${item.displayName}`} onClick={()=>{opener.current=item.id;setSelected(item);}}>Manage music access</button><button type="button" disabled={busy||item.disabled} ref={node=>{if(node)accountButtons.current.set(`recovery:${item.id}`,node);else accountButtons.current.delete(`recovery:${item.id}`);}} aria-label={`Password recovery for ${item.displayName}`} onClick={()=>{opener.current=`recovery:${item.id}`;setRecovering(item);}}>Password recovery</button></div>
  </li>)}</ul></>}
  {error&&!error.denied&&<button ref={more} disabled={busy} type="button" onClick={e=>{restore.current=document.activeElement===e.currentTarget;void read(error.append);}}>Retry loading accounts</button>}
  {next&&!error&&<button ref={more} disabled={busy} type="button" onClick={e=>{restore.current=document.activeElement===e.currentTarget;void read(true);}}>Load more accounts</button>}
  <p className="settings-note">An assigned connection does not confirm that the music server is reachable.</p>
 </section>;
}
