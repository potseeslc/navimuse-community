import {normalizeLocalUsername} from '../../shared/accountSession.js';
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
  if(!response.ok)throw Object.assign(new Error('Account access request failed'),{status:response.status,code:['SIGN_IN_REQUIRED','RECENT_AUTH_REQUIRED','OWNER_REQUIRED','USERNAME_UNAVAILABLE','INVALID_ACCOUNT_CREATION','PASSWORD_INVALID','PASSWORD_COMPROMISED','PASSWORD_SCREENING_UNAVAILABLE','ACCOUNT_CREATION_DISABLED','ACCOUNT_CREATION_THROTTLED'].includes(value?.code)?value.code:''});
  return value;
 })()]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',abort);}
}
export const ownerCreationClient={async create(input,options){
 const username=normalizeLocalUsername(input.username),displayName=input.displayName.trim();
 const value=await request('/api/auth/v1/accounts',{...options,method:'POST',body:JSON.stringify({username,displayName,password:input.password})});
 const a=value?.account;
 if(!value||Object.keys(value).length!==2||value.ok!==true||!a||Object.keys(a).length!==7||!uuid.test(a.id)||a.username!==username||a.displayName!==displayName||!Array.isArray(a.roles)||a.roles.length!==1||a.roles[0]!=='listener'||a.disabled!==false||a.musicConfigured!==false||a.bindingRevision!==0)throw new Error('Uncertain account creation result');
 return {id:a.id,username:a.username,displayName:a.displayName,roles:['listener'],disabled:false,musicConfigured:false,bindingRevision:0};
}};
