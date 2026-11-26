import {apiFetch} from './apiClient.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export async function ownerAccounts({after='',signal}={}) {
 const controller=new AbortController();
 const cancel=()=>controller.abort(signal.reason);
 if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>controller.abort(new DOMException('Account loading timed out','TimeoutError')),15000);
 try{
  if(after&&!uuid.test(after))throw new Error('Invalid account cursor');
  const query=new URLSearchParams({limit:'50'});if(after)query.set('after',after);
  const response=await apiFetch('/api/auth/v1/admin/accounts?'+query,{signal:controller.signal,cache:'no-store',redirect:'error',headers:{'X-Requested-With':'NaviMuse'}});
  if(!response.ok)throw Object.assign(new Error('Account overview unavailable'),{status:response.status});
  const value=await response.json();
  if(value?.ok!==true||!Array.isArray(value.accounts)||value.accounts.length>50||value.page?.limit!==50||
     value.page.nextAfter!==null&&!uuid.test(value.page.nextAfter))throw new Error('Invalid account overview');
  let previous=after;
  const accounts=value.accounts.map(item=>{
   if(!uuid.test(item?.id)||item.id<=previous||typeof item.username!=='string'||!item.username||item.username.length>64||
      typeof item.displayName!=='string'||!item.displayName||item.displayName.length>200||
      !Array.isArray(item.roles)||!['listener','owner,listener'].includes(item.roles.join(','))||
      typeof item.disabled!=='boolean'||typeof item.musicConfigured!=='boolean'||
      !Number.isSafeInteger(item.bindingRevision)||item.bindingRevision<0)throw new Error('Invalid account overview');
   previous=item.id;
   return {id:item.id,username:item.username,displayName:item.displayName,roles:item.roles,
    disabled:item.disabled,musicConfigured:item.musicConfigured,bindingRevision:item.bindingRevision};
  });
  if(value.page.nextAfter!==null&&(!accounts.length||value.page.nextAfter!==accounts.at(-1).id))throw new Error('Invalid account cursor');
  return {accounts,nextAfter:value.page.nextAfter};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
