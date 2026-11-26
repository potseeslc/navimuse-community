import {apiFetch} from './apiClient.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function request(path,{signal,...init}={}) {
 const controller=new AbortController();let timer,abort;
 const cancelled=new Promise((_,reject)=>{abort=()=>reject(controller.signal.reason||new DOMException('Cancelled','AbortError'));controller.signal.addEventListener('abort',abort,{once:true});});
 const cancel=()=>controller.abort(signal.reason);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 timer=setTimeout(()=>controller.abort(new DOMException('Account access request timed out','TimeoutError')),15000);
 try{return await Promise.race([cancelled,(async()=>{
  if(controller.signal.aborted)throw controller.signal.reason;
  const response=await apiFetch(path,{...init,signal:controller.signal,cache:'no-store',redirect:'error',headers:{'X-Requested-With':'NaviMuse',...(init.body?{'Content-Type':'application/json'}:{})}});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error('Account access request failed'),{status:response.status,code:['SIGN_IN_REQUIRED','RECENT_AUTH_REQUIRED','OWNER_REQUIRED','ACCOUNT_ACCESS_DENIED','ACCOUNT_ACCESS_CHANGED','LAST_OWNER_REQUIRED'].includes(value?.code)?value.code:''});
  return value;
 })()]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',abort);}
}
function path(id){if(!uuid.test(id))throw new Error('Invalid account');return `/api/auth/v1/accounts/${id}/access`;}
function project(value,id){
 if(!value||Object.keys(value).length!==4||value.accountId!==id||typeof value.owner!=='boolean'||typeof value.disabled!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<1)throw new Error('Uncertain account access result');
 return {accountId:id,owner:value.owner,disabled:value.disabled,revision:value.revision};
}
export const ownerAccessClient={
 async read(id,options){return project(await request(path(id),options),id);},
 async save(id,change,options){
  if(!Number.isSafeInteger(change?.expectedGeneration)||change.expectedGeneration<1||typeof change.owner!=='boolean'||typeof change.disabled!=='boolean')throw new Error('Invalid account access');
  const value=project(await request(path(id),{...options,method:'PUT',body:JSON.stringify({expectedGeneration:change.expectedGeneration,owner:change.owner,disabled:change.disabled})}),id);
  if(value.owner!==change.owner||value.disabled!==change.disabled||value.revision<change.expectedGeneration||value.revision>change.expectedGeneration+1)throw new Error('Uncertain account access result');
  return value;
 },
};
