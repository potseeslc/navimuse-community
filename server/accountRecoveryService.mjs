import {createAccountAdmission} from './accountAdmission.mjs';
const failure=code=>({ok:false,code});
const accountIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function createAccountRecovery({store,passwords,mode,throttleSecret}) {
 if(!['local','hybrid','oidc'].includes(mode))throw new TypeError('Invalid recovery policy');
 const admit=createAccountAdmission(store,throttleSecret);
 return Object.freeze({
  async issue(accountId,{sessionToken,networkAddress}={}) {
   if(mode==='oidc')return failure('RECOVERY_DISABLED');
   try {
    const state=await store.authenticateSession(sessionToken);
    if(!state)return failure('SIGN_IN_REQUIRED');
    if(!state.account.roles.includes('owner'))return failure('OWNER_REQUIRED');
    if(typeof accountId!=='string'||!accountIdPattern.test(accountId))return failure('RECOVERY_FAILED');
    const allowed=await admit(`recovery-issue:${state.account.id}`,networkAddress);
    if(allowed!==true)return failure(allowed===false?'RECOVERY_THROTTLED':'RECOVERY_UNAVAILABLE');
    const result=await store.issueRecoveryCodeForSession(sessionToken,accountId);
    return {ok:true,code:result.code,expiresAt:result.expiresAt};
   }catch(error){
    if(error.message==='Recent authentication required')return failure('RECENT_AUTH_REQUIRED');
    if(error.message==='Owner access required')return failure('OWNER_REQUIRED');
    return failure('RECOVERY_UNAVAILABLE');
   }
  },
  async redeem(input,{networkAddress}={}) {
   if(mode==='oidc')return failure('RECOVERY_DISABLED');
   try {
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||
       typeof input.code!=='string'||!/^r1\.[A-Za-z0-9_-]{43}$/.test(input.code)||typeof input.password!=='string'||
       !input.password.isWellFormed()||Buffer.byteLength(input.password,'utf8')>1024)return failure('RECOVERY_FAILED');
    const allowed=await admit(`recovery-redeem:${input.code}`,networkAddress);
    if(allowed!==true)return failure(allowed===false?'RECOVERY_THROTTLED':'RECOVERY_UNAVAILABLE');
    // Identical screening/hash work for existing, unknown, expired and used codes.
    // The database checks the grant and generation atomically only after this work.
    const credential=await passwords.enrollPassword(input.password);
    const result=await store.recoverPasswordWithCode(input.code,credential);
    return result?.ok?{ok:true,next:'sign-in'}:failure('RECOVERY_FAILED');
   }catch(error){
    if(['PASSWORD_INVALID','PASSWORD_COMPROMISED','PASSWORD_SCREENING_UNAVAILABLE'].includes(error.code))return failure(error.code);
    return failure('RECOVERY_UNAVAILABLE');
   }
  },
 });
}
