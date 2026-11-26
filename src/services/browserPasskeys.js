import {browserSupportsWebAuthn,startAuthentication,startRegistration,WebAuthnAbortService} from '@simplewebauthn/browser';
export const browserPasskeys=Object.freeze({
 available(baseUrl){
  try {
   const page=new URL(globalThis.location.href),server=new URL(baseUrl,page);
   return page.origin===server.origin && (page.protocol==='https:' || page.protocol==='http:'&&page.hostname==='localhost') && browserSupportsWebAuthn();
  }catch{return false;}
 },
 authenticate:optionsJSON=>startAuthentication({optionsJSON}),
 register:optionsJSON=>startRegistration({optionsJSON}),
 cancel:()=>WebAuthnAbortService.cancelCeremony(),
});
export function passkeyErrorCode(error) {
 if(error?.code==='ERROR_CEREMONY_ABORTED'||error?.name==='AbortError')return 'PASSKEY_CANCELLED';
 if(error?.cause?.name==='NotAllowedError'||error?.name==='NotAllowedError')return 'PASSKEY_NOT_COMPLETED';
 if(error?.cause?.name==='InvalidStateError'||error?.name==='InvalidStateError')return 'PASSKEY_ALREADY_REGISTERED';
 if(error?.cause?.name==='NotSupportedError'||error?.name==='NotSupportedError'||['ERROR_INVALID_DOMAIN','ERROR_INVALID_RP_ID'].includes(error?.code))return 'PASSKEY_UNAVAILABLE';
 return 'PASSKEY_FAILED';
}
