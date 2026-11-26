import {isIP} from 'node:net';
import {generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse} from '@simplewebauthn/server';
import {decodeClientDataJSON} from '@simplewebauthn/server/helpers';

export const PASSKEY_CEREMONY_MS = 5 * 60 * 1000;
const encoded = (value,min=1,max=1024) => typeof value==='string' && /^[A-Za-z0-9_-]+$/.test(value) &&
  Buffer.from(value,'base64url').length>=min && Buffer.from(value,'base64url').length<=max && Buffer.from(value,'base64url').toString('base64url')===value;

// Internal cryptographic boundary, not authentication or ceremony storage. Callers
// must atomically consume a live, session-bound ceremony BEFORE verification, then
// recheck account generation/credential revision atomically before session issuance.
export function createAccountPasskeyVerifier({canonicalOrigin,rpID,developmentLocalhost=false}={}) {
  let origin;
  try {
    const url=new URL(canonicalOrigin);
    const local=developmentLocalhost===true && url.hostname==='localhost' && url.protocol==='http:';
    if (canonicalOrigin!==url.origin || (!local && url.protocol!=='https:') || rpID!==url.hostname ||
        isIP(rpID) || rpID.includes(':') || rpID.endsWith('.') ||
        (!local && (rpID==='localhost' || !rpID.includes('.'))) ||
        rpID.split('.').some(label=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error();
    origin=url.origin;
  } catch {throw new TypeError('Invalid passkey relying party configuration');}
  const invalid=()=>({verified:false});
  function validCeremony(challenge,response) {
    if (!encoded(challenge,32,128)) return false;
    // NaviMuse permits first-party top-level ceremonies only. The library handles
    // decoding; reject cross-origin ceremonies even on browsers omitting topOrigin.
    const data=decodeClientDataJSON(response?.response?.clientDataJSON);
    return (data.crossOrigin===undefined || data.crossOrigin===false) && data.topOrigin===undefined;
  }
  return Object.freeze({
    async registrationOptions({userHandle,username,displayName,credentials=[],residentKey='required'}) {
      if (!['required','preferred'].includes(residentKey) || !encoded(userHandle,32,32) || typeof username!=='string' || !username || typeof displayName!=='string' || !displayName) throw new TypeError('Invalid passkey enrollment identity');
      return generateRegistrationOptions({rpName:'NaviMuse',rpID,userID:new Uint8Array(Buffer.from(userHandle,'base64url')),
        userName:username,userDisplayName:displayName,excludeCredentials:credentials,
        attestationType:'none',supportedAlgorithmIDs:[-7,-257],authenticatorSelection:{residentKey,userVerification:'required'},timeout:PASSKEY_CEREMONY_MS});
    },
    authenticationOptions({credentials}={}) {
      return generateAuthenticationOptions({rpID,allowCredentials:credentials,userVerification:'required',timeout:PASSKEY_CEREMONY_MS});
    },
    async verifyRegistration({challenge,response}) {
      try {
        if (!validCeremony(challenge,response)) return invalid();
        return await verifyRegistrationResponse({response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:rpID,
          expectedType:'webauthn.create',supportedAlgorithmIDs:[-7,-257],requireUserVerification:true});
      } catch {return invalid();}
    },
    async verifyAuthentication({challenge,response,credential,userHandle,discoverable=true}) {
      try {
        if (!validCeremony(challenge,response) || !encoded(userHandle,32,32) || response.id!==credential.id) return invalid();
        const returnedHandle=response.response.userHandle;
        if (returnedHandle!==undefined && returnedHandle!==null && returnedHandle!==userHandle) return invalid();
        if (discoverable && returnedHandle!==userHandle) return invalid();
        return await verifyAuthenticationResponse({response,credential,expectedChallenge:challenge,expectedOrigin:origin,
          expectedRPID:rpID,expectedType:'webauthn.get',requireUserVerification:true});
      } catch {return invalid();}
    },
  });
}
