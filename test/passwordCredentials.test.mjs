import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordService } from '../server/passwordCredentials.mjs';

test('Argon2id credentials use fresh salts and preserve exact password bytes', async () => {
  const service=await createPasswordService();const password='  A long café passphrase  ';
  const first=await service.hashPassword(password),second=await service.hashPassword(password);
  assert.notEqual(first.hash,second.hash);assert.equal(first.version,'argon2id-v1');
  assert.match(first.hash,/^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
  assert.equal(await service.verifyPassword(first,password),true);
  assert.equal(await service.verifyPassword(first,password.trim()),false);
  assert.equal(await service.verifyPassword(first,password.normalize('NFD')),false);
  assert.equal(await service.verifyPassword(first,'different long password'),false);
});

test('missing, unsupported and excessive-cost records cannot authenticate or choose native work factors', async () => {
  const service=await createPasswordService();const password='Long enough passphrase';const record=await service.hashPassword(password);
  for (const bad of [null,{}, {...record,version:'legacy'}, {...record,extra:'private'}, {...record,hash:record.hash.replace('m=65536','m=4294967295')}, {...record,hash:record.hash.replace('argon2id','argon2i')}, {...record,hash:'malformed'}]) {
    assert.equal(await service.verifyPassword(bad,password),false);
  }
});

test('password work is bounded and rejects oversized or ill-formed input', async () => {
  const service=await createPasswordService();
  for (const password of ['', 'short', 'x'.repeat(1025), '😀'.repeat(257), '\ud800'.repeat(20)]) await assert.rejects(service.hashPassword(password),/Invalid new password/);
  assert.equal(await service.verifyPassword(null,'x'.repeat(1025)),false);
  const first=service.hashPassword('First long passphrase'),second=service.hashPassword('Second long passphrase');
  await assert.rejects(service.hashPassword('Third long passphrase'),{code:'PASSWORD_BUSY'});
  await Promise.all([first,second]);
  assert.equal((await service.hashPassword('After pending operations')).version,'argon2id-v1');
});

test('missing and unsupported accounts perform asynchronous verification work before returning false', async () => {
  const service=await createPasswordService();
  for (const records of [[null,undefined],[{version:'unsupported',hash:'invalid'},{}]]) {
    const checks=records.map(record=>service.verifyPassword(record,'A bounded login attempt'));
    await assert.rejects(service.hashPassword('Concurrent enrollment attempt'),{code:'PASSWORD_BUSY'},'Two dummy verifications occupy the same bounded work slots as real checks');
    assert.deepEqual(await Promise.all(checks),[false,false]);
  }
});
