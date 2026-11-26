import {createAccountAdmission} from './accountAdmission.mjs';
import {normalizeLocalUsername} from '../shared/accountSession.js';
const failure=code=>({ok:false,code});
export function createAccountCreation({store,passwords,mode,throttleSecret}) {
 if(!['local','hybrid','oidc'].includes(mode))throw new TypeError('Invalid creation policy');
 const admit=createAccountAdmission(store,throttleSecret);
 return Object.freeze({async create(input,{sessionToken,networkAddress}={}){
  if(mode==='oidc')return failure('ACCOUNT_CREATION_DISABLED');
  try{
   const state=await store.authenticateSession(sessionToken);
   if(!state)return failure('SIGN_IN_REQUIRED');
   if(!state.account.roles.includes('owner'))return failure('OWNER_REQUIRED');
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==3||typeof input.password!=='string'||!input.password.isWellFormed()||Buffer.byteLength(input.password)>1024||[...input.password].length<15||typeof input.displayName!=='string'||!input.displayName.isWellFormed()||!input.displayName.trim()||input.displayName.length>120||/[\u0000-\u001f\u007f]/.test(input.displayName))return failure('INVALID_ACCOUNT_CREATION');
   let username;try{username=normalizeLocalUsername(input.username);}catch{return failure('INVALID_ACCOUNT_CREATION');}
   const allowed=await admit(`account-create:${state.account.id}`,networkAddress);
   if(allowed!==true)return failure(allowed===false?'ACCOUNT_CREATION_THROTTLED':'ACCOUNT_CREATION_UNAVAILABLE');
   const credential=await passwords.enrollPassword(input.password);
   // The write rechecks enabled owner status and recent session authority after hashing.
   const account=await store.createManagedListenerForSession(sessionToken,{username,displayName:input.displayName.trim()},credential);
   return {ok:true,account:{id:account.id,username:account.username,displayName:account.displayName,roles:['listener'],disabled:false,musicConfigured:false,bindingRevision:0}};
  }catch(error){
   if(error.message==='Recent authentication required')return failure('RECENT_AUTH_REQUIRED');
   if(error.message==='Owner access required')return failure('OWNER_REQUIRED');
   if(error.message==='Username unavailable')return failure('USERNAME_UNAVAILABLE');
   if(['PASSWORD_INVALID','PASSWORD_COMPROMISED','PASSWORD_SCREENING_UNAVAILABLE'].includes(error.code))return failure(error.code);
   return failure('ACCOUNT_CREATION_UNAVAILABLE');
  }
 }});
}
