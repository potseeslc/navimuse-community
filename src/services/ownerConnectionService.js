import {apiFetch} from './apiClient.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const reference=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>=0&&value<Number.MAX_SAFE_INTEGER;
async function request(path,{signal,...init}={}) {
 const controller=new AbortController();let timer,abort;
 const cancelled=new Promise((_,reject)=>{abort=()=>reject(controller.signal.reason||new DOMException('Cancelled','AbortError'));controller.signal.addEventListener('abort',abort,{once:true});});
 const cancel=()=>controller.abort(signal.reason);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 timer=setTimeout(()=>controller.abort(new DOMException('Connection request timed out','TimeoutError')),15000);
 try{return await Promise.race([cancelled,(async()=>{
  if(controller.signal.aborted)throw controller.signal.reason;
  const response=await apiFetch(path,{...init,signal:controller.signal,cache:'no-store',redirect:'error',headers:{'X-Requested-With':'NaviMuse',...(init.body?{'Content-Type':'application/json'}:{})}});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error('Music access request failed'),{status:response.status,code:['RECENT_AUTH_REQUIRED','OWNER_REQUIRED','UPSTREAM_BINDING_CHANGED'].includes(value?.code)?value.code:''});
  return value;
 })()]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',abort);}
}
export async function musicConnections(options) {
 const value=await request('/api/auth/v1/admin/music-connections',options);
 if(!Array.isArray(value?.connections)||value.connections.length>256)throw new Error('Invalid connection catalogue');
 const seen=new Set();return value.connections.map(item=>{
  if(!reference(item?.reference)||seen.has(item.reference)||typeof item.label!=='string'||!item.label.trim()||item.label!==item.label.trim()||item.label.length>120||!item.label.isWellFormed()||/[\u0000-\u001f\u007f]/.test(item.label))throw new Error('Invalid connection catalogue');
  seen.add(item.reference);return {reference:item.reference,label:item.label};
 });
}
function path(id){if(!uuid.test(id))throw new Error('Invalid account');return `/api/auth/v1/accounts/${id}/upstream-binding`;}
export async function accountMusicConnection(id,options) {
 const value=await request(path(id),options);
 if(!revision(value?.revision)||value.credentialRef!==null&&!reference(value.credentialRef))throw new Error('Invalid music access');
 return {revision:value.revision,credentialRef:value.credentialRef};
}
export async function saveAccountMusicConnection(id,change,options) {
 if(!revision(change?.expectedRevision)||change.credentialRef!==null&&!reference(change.credentialRef))throw new Error('Invalid music access change');
 const value=await request(path(id),{...options,method:'PUT',body:JSON.stringify({expectedRevision:change.expectedRevision,credentialRef:change.credentialRef})});
 if(value?.ok!==true||!Number.isSafeInteger(value.revision)||value.revision<change.expectedRevision||value.revision>change.expectedRevision+1||typeof value.reauthenticate!=='boolean')throw new Error('Uncertain music access result');
 return {revision:value.revision,reauthenticate:value.reauthenticate};
}
export const ownerConnectionClient={catalog:musicConnections,read:accountMusicConnection,save:saveAccountMusicConnection};
