import { ACCOUNT_MODES, normalizeLocalUsername } from '../shared/accountSession.js';
import { createAccountAdmission } from './accountAdmission.mjs';

// Private fresh-install service. Deployment policy and token verification come
// from trusted server configuration, never the submitted request body.
export function createAccountSetup({store,passwords,verifySetupToken,mode,legacyConfigured,throttleSecret}) {
  if (!ACCOUNT_MODES.includes(mode) || typeof legacyConfigured!=='boolean' || typeof verifySetupToken!=='function') throw new TypeError('Invalid account setup configuration');
  const admit=createAccountAdmission(store,throttleSecret);
  const failed=code=>({ok:false,code});
  return Object.freeze({
    async setup(input,{networkAddress}={}) {
      if (legacyConfigured) return failed('MIGRATION_REQUIRED');
      if (mode==='oidc') return failed('PASSWORD_SETUP_DISABLED');
      try {
        // One shared bootstrap bucket cannot be evaded by changing usernames.
        const admitted=await admit('<setup>',networkAddress);
        if (admitted===null) return failed('SETUP_UNAVAILABLE');
        if (!admitted) return failed('SETUP_THROTTLED');
        if (!input || typeof input!=='object' || Array.isArray(input) ||
            Object.keys(input).length!==4 || ['setupToken','username','displayName','password'].some(key=>!Object.hasOwn(input,key))) return failed('INVALID_SETUP');
        if (typeof input.setupToken!=='string' || input.setupToken.length<16 || input.setupToken.length>1024 ||
            await verifySetupToken(input.setupToken)!==true) return failed('INVALID_SETUP');
        if (await store.hasAccounts()) return failed('SETUP_CLOSED');
        let username;
        try {username=normalizeLocalUsername(input.username);} catch {return failed('INVALID_SETUP');}
        if (typeof input.displayName!=='string' || !input.displayName.trim() || input.displayName.length>120 || /[\u0000-\u001f\u007f]/.test(input.displayName)) return failed('INVALID_SETUP');
        const credential=await passwords.enrollPassword(input.password);
        // The preliminary read is only an optimization. This transaction remains
        // the authoritative one-owner decision across concurrent workers.
        const account=await store.createFirstOwner({username,displayName:input.displayName},credential);
        return {ok:true,accountId:account.id};
      } catch (error) {
        if (['PASSWORD_COMPROMISED','PASSWORD_INVALID','PASSWORD_SCREENING_UNAVAILABLE'].includes(error.code)) return failed(error.code);
        return failed('SETUP_UNAVAILABLE');
      }
    },
  });
}
