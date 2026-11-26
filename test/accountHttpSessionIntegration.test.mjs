import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openAccountStoreWorker} from '../server/accountStoreWorker.mjs';
import {createAccountHttpBoundary} from '../server/accountHttpBoundary.mjs';
import {accountCredentialFixture} from '../test-support/accountCredentialFixture.mjs';

test('HTTP cookie boundary interoperates with durable session issuance, rotation and revocation',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'navimuse-http-session-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=await openAccountStoreWorker(directory);t.after(()=>store.close());
  // Storage-only credential/proof fixture: this does not test password verification or a login endpoint.
  const owner=await store.createFirstOwner({username:'owner',displayName:'Owner'},accountCredentialFixture);
  const login=await store.issuePasswordSession(owner.id,{expectedGeneration:1,expectedRevision:1,remember:true});
  const boundary=createAccountHttpBoundary({canonicalOrigin:'https://music.example'});
  const cookiePair=(kind,value,expiry)=>boundary.cookie(kind,value,expiry).split(';',1)[0];
  const sessionCookie=cookiePair('session',login.token,login.session.expiresAt);
  const req={headers:{cookie:sessionCookie}};
  const parsed=boundary.readCookie(req,'session');
  assert.equal((await store.authenticateSession(parsed)).account.id,owner.id);
  const devices=await store.listDevices(parsed);
  const deviceCookie=cookiePair('device',login.deviceToken,devices[0].absoluteExpiresAt);
  const refreshToken=boundary.readCookie({headers:{cookie:deviceCookie}},'device');
  const rotated=await store.refreshDevice(refreshToken);
  assert.ok(rotated);
  assert.equal(await store.refreshDevice(refreshToken),null,'old cookie cannot rotate twice');
  const newSessionCookie=cookiePair('session',rotated.token,rotated.session.expiresAt);
  assert.equal((await store.authenticateSession(boundary.readCookie({headers:{cookie:newSessionCookie}},'session'))).account.id,owner.id);
  assert.equal(boundary.readCookie({headers:{cookie:`${boundary.names.session}=${rotated.deviceToken}`}},'session'),null);
  // Well-formed format is not authentication: an unissued random-looking token is rejected by storage.
  const unissued=`s1.${Buffer.alloc(32,7).toString('base64url')}`;
  assert.equal(await store.authenticateSession(boundary.readCookie({headers:{cookie:`${boundary.names.session}=${unissued}`}},'session')),null);
  await store.logoutSession(rotated.token);
  assert.equal(await store.authenticateSession(parsed),null);
  assert.equal(await store.authenticateSession(rotated.token),null);
  assert.equal(await store.refreshDevice(rotated.deviceToken),null);
  assert.ok(boundary.clearCookies().every(cookie=>cookie.includes('Max-Age=0')));
});
