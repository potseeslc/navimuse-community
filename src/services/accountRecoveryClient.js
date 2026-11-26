import {apiFetch} from './apiClient.js';
export const recoveryMessages={RECENT_AUTH_REQUIRED:'Sign in again before creating a recovery code.',OWNER_REQUIRED:'Owner access is no longer available.',SIGN_IN_REQUIRED:'Sign in again to continue.',RECOVERY_DISABLED:'Password recovery is not enabled here.',RECOVERY_THROTTLED:'Too many recovery attempts. Wait 15 minutes before trying again.',RECOVERY_FAILED:'This code is invalid, expired, or already used. Ask an owner for a new code.',PASSWORD_INVALID:'Use at least 15 characters for your new password.',PASSWORD_COMPROMISED:'Choose a password that has not appeared in a known breach.',PASSWORD_SCREENING_UNAVAILABLE:'Password checking is unavailable. Try again shortly.'};
const codePattern=/^r1\.[A-Za-z0-9_-]{43}$/;
async function post(path,body,{signal}={}){
 const controller=new AbortController();
 const cancel=()=>controller.abort(signal.reason);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 let rejectAbort;const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(controller.signal.reason||new DOMException('Cancelled','AbortError'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
 const timer=setTimeout(()=>controller.abort(new DOMException('Recovery request timed out','TimeoutError')),15000);
 try{return await Promise.race([aborted,(async()=>{
  controller.signal.throwIfAborted();
  const response=await apiFetch(path,{method:'POST',body:JSON.stringify(body),signal:controller.signal,cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-Requested-With':'NaviMuse'}});
  const value=await response.json();
  if(!response.ok)throw Object.assign(new Error('Recovery request failed'),{status:response.status,code:Object.hasOwn(recoveryMessages,value?.code)?value.code:''});
  return value;
 })()]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',rejectAbort);}
}
export const accountRecoveryClient={
 async issue(id,options){
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw new Error('Invalid account');
  const value=await post(`/api/auth/v1/accounts/${id}/recovery-code`,{},options);
  if(typeof value?.code!=='string'||!codePattern.test(value.code)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+16*60*1000)throw new Error('Unconfirmed recovery code');
  return {code:value.code,expiresAt:value.expiresAt};
 },
 async redeem({code,password},options){
  if(typeof code!=='string'||!codePattern.test(code)||typeof password!=='string'||!password.isWellFormed()||new TextEncoder().encode(password).length>1024)throw new Error('Invalid recovery input');
  const value=await post('/api/auth/v1/recovery',{code,password},options);
  if(value?.ok!==true||value.next!=='sign-in')throw new Error('Unconfirmed password reset');
  return {ok:true};
 }
};
