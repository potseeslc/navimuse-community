import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import {createAccountPasskeyVerifier,PASSKEY_CEREMONY_MS} from '../server/accountPasskeyVerifier.mjs';
const origin='https://music.example.test',rpID='music.example.test';
const verifier=createAccountPasskeyVerifier({canonicalOrigin:origin,rpID});
const challenge=randomBytes(32).toString('base64url'),userHandle=randomBytes(32).toString('base64url');
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=publicKey.export({format:'jwk'}),id=randomBytes(32).toString('base64url');
const publicBytes=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
const credential={id,publicKey:publicBytes,counter:1};
const hash=x=>createHash('sha256').update(x).digest();
function assertion({client={},rp=rpID,flags=5,counter=2,handle=userHandle,corrupt=false}={}) {
  const clientData=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false,...client}));
  const auth=Buffer.alloc(37);hash(rp).copy(auth);auth[32]=flags;auth.writeUInt32BE(counter,33);
  const signature=sign('sha256',Buffer.concat([auth,hash(clientData)]),privateKey);if(corrupt) signature[signature.length-1]^=1;
  return {id,rawId:id,type:'public-key',clientExtensionResults:{},response:{clientDataJSON:clientData.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:signature.toString('base64url'),userHandle:handle}};
}
function registration({client={},flags=69,rp=rpID}={}) {
  const clientData=Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin,crossOrigin:false,...client}));
  const prefix=Buffer.alloc(55);hash(rp).copy(prefix);prefix[32]=flags;prefix.writeUInt16BE(Buffer.from(id,'base64url').length,53);
  const auth=Buffer.concat([prefix,Buffer.from(id,'base64url'),publicBytes]);
  const attestation=isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(auth)]]));
  return {id,rawId:id,type:'public-key',clientExtensionResults:{credProps:{rk:true}},response:{clientDataJSON:clientData.toString('base64url'),attestationObject:Buffer.from(attestation).toString('base64url'),transports:['internal']}};
}
test('passkey configuration pins one canonical HTTPS host, with explicit localhost-only development',()=>{
  for(const [canonicalOrigin,rp] of [['http://music.example.test',rpID],[origin,'example.test'],[origin+'/path',rpID],[origin+'/',rpID],['https://127.0.0.1','127.0.0.1'],['tauri://localhost','localhost'],['https://music.example.test.','music.example.test.']]) assert.throws(()=>createAccountPasskeyVerifier({canonicalOrigin,rpID:rp}));
  assert.throws(()=>createAccountPasskeyVerifier({canonicalOrigin:'http://localhost:3000',rpID:'localhost'}));
  assert.doesNotThrow(()=>createAccountPasskeyVerifier({canonicalOrigin:'http://localhost:3000',rpID:'localhost',developmentLocalhost:true}));
});
test('options require discoverable registration and user verification without platform-only restriction',async()=>{
  const options=await verifier.registrationOptions({userHandle,username:'listener',displayName:'Listener'});
  assert.deepEqual(options.pubKeyCredParams.map(p=>p.alg),[-7,-257]);assert.equal(options.rp.id,rpID);assert.equal(options.user.id,userHandle);assert.equal(options.attestation,'none');
  assert.equal(options.authenticatorSelection.residentKey,'required');assert.equal(options.authenticatorSelection.userVerification,'required');assert.equal(options.authenticatorSelection.authenticatorAttachment,undefined);
  const login=await verifier.authenticationOptions();assert.equal(login.userVerification,'required');assert.equal(login.timeout,PASSKEY_CEREMONY_MS);assert.ok(!login.allowCredentials?.length);
  const next=await verifier.authenticationOptions();assert.notEqual(next.challenge,login.challenge);
});
test('registration verifies real none attestation and rejects wrong origin, RP, challenge and missing UV',async()=>{
  assert.equal((await verifier.verifyRegistration({challenge,response:registration()})).verified,true);
  for(const options of [{client:{origin:'https://attacker.test'}},{rp:'other.test'},{client:{challenge:'wrong'}},{client:{type:'webauthn.get'}},{flags:65},{client:{crossOrigin:true}}]) assert.equal((await verifier.verifyRegistration({challenge,response:registration(options)})).verified,false);
});
test('authentication verifies actual ES256 signatures and rejects policy violations',async()=>{
  const verify=(response,saved=credential)=>verifier.verifyAuthentication({challenge,response,credential:saved,userHandle});
  const result=await verify(assertion());assert.equal(result.verified,true);assert.equal(result.authenticationInfo.newCounter,2);
  for(const options of [{client:{origin:'https://attacker.test'}},{rp:'example.test'},{client:{challenge:'wrong'}},{client:{type:'webauthn.create'}},{flags:1},{flags:4},{counter:1},{counter:0},{corrupt:true},{handle:null},{handle:randomBytes(32).toString('base64url')},{client:{crossOrigin:true}},{client:{topOrigin:origin}}]) assert.equal((await verify(assertion(options))).verified,false,JSON.stringify(options));
  assert.equal((await verify(assertion(),{...credential,id:randomBytes(32).toString('base64url')})).verified,false);
  assert.equal((await verify(assertion(),{...credential,counter:2})).verified,false,'persisted counter prevents reuse');
  assert.equal((await verifier.verifyAuthentication({challenge,response:assertion({handle:null}),credential,userHandle,discoverable:false})).verified,true,'username-first credentials may omit handle');
  assert.equal((await verify(assertion({counter:0}),{...credential,counter:0})).verified,true,'zero-counter synced credentials remain supported; ceremony storage must prevent replay');
  assert.deepEqual(await verify(null),{verified:false});
});
