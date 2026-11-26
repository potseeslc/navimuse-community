import {normalizeLocalUsername} from '../shared/accountSession.js';
import {createUsernamePasskeyAllowList} from './accountPasskeyAllowList.mjs';
import {randomBytes} from 'node:crypto';
import {createAccountAdmission} from './accountAdmission.mjs';
import {createAccountPasskeyVerifier} from './accountPasskeyVerifier.mjs';
const validBinding=value=>typeof value==='string'&&/^p1\.[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value.slice(3),'base64url').toString('base64url')===value.slice(3);

// Private orchestration. The HTTP adapter must enforce origin/body limits and
// supply verified network/session/cookie context. Never serialize whole results:
// `public` is JSON-safe; bindingToken and issued contain cookie-only bearer values.
export function createAccountPasskeys({store,canonicalOrigin,rpID,developmentLocalhost=false,throttleSecret,usernameFirstEnabled=false}) {
 if(typeof usernameFirstEnabled!=='boolean')throw new TypeError('Invalid username-first passkey policy');
 const allowList=createUsernamePasskeyAllowList(throttleSecret);
 const verifier=createAccountPasskeyVerifier({canonicalOrigin,rpID,developmentLocalhost});
 const admit=createAccountAdmission(store,throttleSecret);
 const context={origin:canonicalOrigin,rpID};
 const failure=()=>({ok:false,code:'PASSKEY_FAILED'});
 async function allowed(key,networkAddress) {return (await admit(`passkey:${key}`,networkAddress))===true;}
 async function consume(purpose,{ceremonyId,bindingToken,sessionToken=null}) {
  if(!validBinding(bindingToken))return null;
  return store.consumePasskeyCeremony({id:ceremonyId,purpose,...context,bindingToken,sessionToken});
 }
 return Object.freeze({
  policy:()=>({usernameFirst:usernameFirstEnabled}),
  async registrationOptions({bindingToken=null,sessionToken,networkAddress}={}) {
   try {
    const token=bindingToken??`p1.${randomBytes(32).toString('base64url')}`;
    if(!validBinding(token)||!await allowed(`options:${token}`,networkAddress))return failure();
    const prepared=await store.preparePasskeyEnrollment(sessionToken);
    const options=await verifier.registrationOptions({userHandle:prepared.userHandle,username:prepared.account.username,displayName:prepared.account.displayName,credentials:prepared.credentials,residentKey:usernameFirstEnabled?'preferred':'required'});
    const ceremony=await store.createPasskeyCeremony({purpose:'register',challenge:options.challenge,...context,bindingToken:token,sessionToken,developmentLocalhost});
    return {ok:true,public:{ceremonyId:ceremony.id,options},bindingToken:token,expiresAt:ceremony.expiresAt};
   }catch{return failure();}
  },
  async verifyRegistration({ceremonyId,response,label}={},{bindingToken,sessionToken,networkAddress}={}) {
   try {
    const proof=await consume('register',{ceremonyId,bindingToken,sessionToken});
    if(!proof||!await allowed(`verify:${bindingToken}`,networkAddress))return failure();
    const prepared=await store.preparePasskeyEnrollment(sessionToken);
    if(prepared.account.id!==proof.accountId||prepared.account.authorizationGeneration!==proof.generation)return failure();
    const verification=await verifier.verifyRegistration({challenge:proof.challenge,response});
    if(!verification.verified)return failure();
    const info=verification.registrationInfo;
    const result=await store.registerPasskey(sessionToken,{expectedGeneration:proof.generation,userHandle:prepared.userHandle,credential:info.credential,
      deviceType:info.credentialDeviceType,backedUp:info.credentialBackedUp,label,ceremonyExpiresAt:proof.expiresAt});
    return {ok:true,public:{credential:result}};
   }catch{return failure();}
  },
  async authenticationOptions({bindingToken=null,networkAddress,username}={}) {
   try {
    const token=bindingToken??`p1.${randomBytes(32).toString('base64url')}`;
    if(!validBinding(token)||!await allowed(`options:${token}`,networkAddress))return failure();
    const named=username!==undefined;
    if(named&&!usernameFirstEnabled)return failure();
    const canonical=named?normalizeLocalUsername(username):null;
    if(named&&!await allowed(`username:${canonical}`,networkAddress))return failure();
    // Discoverable options continue to reveal no credential inventory.
    const options=await verifier.authenticationOptions();
    const ceremony=await store.createPasskeyCeremony({purpose:'login',challenge:options.challenge,...context,bindingToken:token,developmentLocalhost,...(named?{username:canonical}:{})});
    if(named)options.allowCredentials=allowList(canonical,ceremony.credentials);
    return {ok:true,public:{ceremonyId:ceremony.id,options},bindingToken:token,expiresAt:ceremony.expiresAt};
   }catch{return failure();}
  },
  async verifyAuthentication({ceremonyId,response,remember=false}={},{bindingToken,networkAddress}={}) {
   try {
    const proof=await consume('login',{ceremonyId,bindingToken});
    if(!proof||!await allowed(`verify:${bindingToken}`,networkAddress))return failure();
    const saved=await store.getPasskeyCredential(response?.id);
    if(!saved||!await allowed(`account:${saved.accountId}`,networkAddress))return failure();
    if(proof.usernameFirst&&(!usernameFirstEnabled||saved.accountId!==proof.accountId||saved.generation!==proof.generation||!proof.credentialIds.includes(saved.credential.id)))return failure();
    const verification=await verifier.verifyAuthentication({challenge:proof.challenge,response,credential:saved.credential,userHandle:saved.userHandle,discoverable:!proof.usernameFirst});
    if(!verification.verified)return failure();
    const info=verification.authenticationInfo;
    const issued=await store.issuePasskeySession(saved.credential.id,{expectedGeneration:saved.generation,expectedRevision:saved.revision,newCounter:info.newCounter,
      deviceType:info.credentialDeviceType,backedUp:info.credentialBackedUp,remember,ceremonyExpiresAt:proof.expiresAt});
    return {ok:true,issued};
   }catch{return failure();}
  },
  async cancel({ceremonyId,purpose}={},{bindingToken,sessionToken=null}={}) {
   try {await consume(purpose,{ceremonyId,bindingToken,sessionToken});}catch{}
   return {ok:true};
  },
 });
}
