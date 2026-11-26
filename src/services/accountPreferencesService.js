import {apiFetch} from './apiClient.js';
import {ACCOUNT_PREFERENCES_VERSION,parseAccountPreferences,parseAccountPreferenceChange} from '../../shared/accountPreferences.js';

export function createAccountPreferencesClient(accountId) {
 const failure=code=>Object.assign(new Error(code==='PREFERENCES_CHANGED'?'Preferences changed in another window. Refresh saved values before saving again.':code==='ACCOUNT_SCOPE_CHANGED'?'The signed-in account changed. Check your session.':'Preferences could not be saved or loaded. Try again.'),{code});
 const snapshot=(value,write=false)=>{
  const keys=['version','accountId','revision','preferences',...(write?['ok']:[])];
  if(!value||typeof value!=='object'||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.version!==ACCOUNT_PREFERENCES_VERSION||!Number.isSafeInteger(value.revision)||value.revision<0||write&&value.ok!==true)throw failure('INVALID_PREFERENCES_RESPONSE');
  if(value.accountId!==accountId)throw failure('ACCOUNT_SCOPE_CHANGED');
  return {version:value.version,accountId,revision:value.revision,preferences:parseAccountPreferences(value.preferences)};
 };
 async function request(body) {
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
  try {
   const response=await apiFetch('/api/auth/v1/preferences',{method:body?'PUT':'GET',cache:'no-store',redirect:'error',signal:abort.signal,headers:{'X-Requested-With':'NaviMuse','X-NaviMuse-Preferences':'3',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const value=await response.json();
   if(!response.ok)throw failure(response.status===409&&['PREFERENCES_CHANGED','ACCOUNT_SCOPE_CHANGED'].includes(value?.code)?value.code:'PREFERENCES_UNAVAILABLE');
   return snapshot(value,Boolean(body));
  } finally {clearTimeout(timer);}
 }
 return Object.freeze({read:()=>request(),save:(expectedRevision,preferences)=>request(parseAccountPreferenceChange({expectedAccountId:accountId,expectedRevision,preferences}))});
}
