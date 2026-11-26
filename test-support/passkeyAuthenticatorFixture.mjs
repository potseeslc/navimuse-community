// Test-only synthetic authenticator. Production verification uses SimpleWebAuthn.
import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
export function passkeyAuthenticatorFixture(userHandle,{origin='https://music.example.test',rpID='music.example.test'}={}) {
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(32).toString('base64url');
 const publicBytes=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
 const hash=x=>createHash('sha256').update(x).digest();
 const client=(type,challenge,override)=>Buffer.from(JSON.stringify({type,challenge,origin,crossOrigin:false,...override}));
 return {
  id,
  registration(challenge,{flags=69,clientOverride={}}={}) {
   const data=client('webauthn.create',challenge,clientOverride),prefix=Buffer.alloc(55);hash(rpID).copy(prefix);prefix[32]=flags;prefix.writeUInt16BE(32,53);
   const auth=Buffer.concat([prefix,Buffer.from(id,'base64url'),publicBytes]);
   const att=isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(auth)]]));
   return {id,rawId:id,type:'public-key',clientExtensionResults:{credProps:{rk:true}},response:{clientDataJSON:data.toString('base64url'),attestationObject:Buffer.from(att).toString('base64url'),transports:['internal']}};
  },
  authentication(challenge,{counter=1,flags=5,clientOverride={},corrupt=false,handle=userHandle}={}) {
   const data=client('webauthn.get',challenge,clientOverride),auth=Buffer.alloc(37);hash(rpID).copy(auth);auth[32]=flags;auth.writeUInt32BE(counter,33);
   const signature=sign('sha256',Buffer.concat([auth,hash(data)]),privateKey);if(corrupt)signature[signature.length-1]^=1;
   return {id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:data.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:signature.toString('base64url'),userHandle:handle}};
  },
 };
}
