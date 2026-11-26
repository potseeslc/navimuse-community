import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openAccountStore, restoreAccountStoreBackup } from '../server/accountStore.mjs';
import { openAccountStoreWorker } from '../server/accountStoreWorker.mjs';
import { createPasswordService } from '../server/passwordCredentials.mjs';
import { createAccountPasswordLogin } from '../server/accountPasswordLogin.mjs';
import { LOGIN_THROTTLE } from '../server/accountLoginThrottle.mjs';
import { accountCredentialFixture } from '../test-support/accountCredentialFixture.mjs';
const key = n => n.toString(16).padStart(64, '0');
const secret = Buffer.alloc(32, 7); // Synthetic test configuration only.
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'navimuse-login-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let clock = Date.now();
  const directory = join(root, 'accounts');
  const store = await openAccountStore(directory, { now: () => clock });
  let closed = false;
  const close = () => { if (!closed) { store.close(); closed = true; } };
  t.after(close);
  return { root, directory, store, close, advance: ms => { clock += ms; } };
}

test('schema 3 upgrades without losing active sessions or password revisions', async t => {
  const { directory, store, close } = await setup(t);
  const owner = store.createFirstOwner({ username: 'owner', displayName: 'Owner' }, accountCredentialFixture);
  const issued = store.issuePasswordSession(owner.id, { expectedGeneration: 1, expectedRevision: 1, remember: true });
  close();
  const db = new DatabaseSync(join(directory, 'accounts.sqlite'));
  db.exec('DROP TABLE passkey_login_targets; DROP TABLE account_recovery_codes; DROP TABLE passkey_credentials; DROP TABLE passkey_accounts; DROP TABLE passkey_ceremonies; DROP TABLE account_preferences; DROP TABLE account_upstream_bindings; DROP TABLE login_throttle; PRAGMA user_version=3'); db.close();
  const upgraded = await openAccountStoreWorker(directory); t.after(() => upgraded.close());
  assert.equal((await upgraded.authenticateSession(issued.token)).account.id, owner.id);
  assert.ok(await upgraded.refreshDevice(issued.deviceToken));
  assert.equal((await upgraded.getPasswordCredential(owner.id)).revision, 1);
  assert.equal(await upgraded.consumePasswordLoginAttempt(key(1), key(2)), true);
});

test('login limits survive restart and backup; normalized identities contain no raw username or address', async t => {
  const { root, directory, store, close } = await setup(t);
  const passwords = { verifyPassword: async () => false };
  const login = createAccountPasswordLogin({ store, passwords, mode: 'local', throttleSecret: secret });
  for (let i = 0; i < 5; i++) assert.equal((await login.login({ username: i % 2 ? ' ＯＷＮＥＲ ' : 'owner', password: 'wrong' }, { networkAddress: '192.0.2.1' })).code, 'INVALID_CREDENTIALS');
  assert.equal((await login.login({ username: 'OWNER', password: 'wrong' }, { networkAddress: '192.0.2.2' })).code, 'LOGIN_THROTTLED');
  const db = new DatabaseSync(join(directory, 'accounts.sqlite'));
  const rows = JSON.stringify(db.prepare('SELECT * FROM login_throttle').all()); db.close();
  assert.equal(rows.includes('owner'), false); assert.equal(rows.includes('192.0.2.'), false);
  const backup = store.createBackup(join(root, 'backups')); assert.equal(backup.schemaVersion, 10);
  close();
  const reopened = await openAccountStoreWorker(directory); t.after(() => reopened.close());
  assert.equal((await createAccountPasswordLogin({ store: reopened, passwords, mode: 'local', throttleSecret: secret }).login({ username: 'owner' }, { networkAddress: '192.0.2.3' })).code, 'LOGIN_THROTTLED');
  const restoredDir = join(root, 'restored'); await restoreAccountStoreBackup(backup.path, restoredDir);
  const restored = await openAccountStore(restoredDir); t.after(() => restored.close());
  assert.equal((await createAccountPasswordLogin({ store: restored, passwords, mode: 'local', throttleSecret: secret }).login({ username: 'owner' }, { networkAddress: '192.0.2.4' })).code, 'LOGIN_THROTTLED');
});

test('two actual workers share admission atomically before any expensive work', async t => {
  const { directory } = await setup(t);
  const one = await openAccountStoreWorker(directory), two = await openAccountStoreWorker(directory);
  t.after(() => one.close()); t.after(() => two.close());
  const outcomes = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? one : two).consumePasswordLoginAttempt(key(1), key(i + 100))));
  assert.equal(outcomes.filter(Boolean).length, 5);
});

test('network and global limits bound password spraying; expiration recovers without sliding a lockout', async t => {
  const { store, advance } = await setup(t);
  for (let i = 0; i < 30; i++) assert.equal(store.consumePasswordLoginAttempt(key(i), key(1)), true);
  assert.equal(store.consumePasswordLoginAttempt(key(31), key(1)), false);
  for (let i = 31; i < 100; i++) assert.equal(store.consumePasswordLoginAttempt(key(i), key(i)), true);
  assert.equal(store.consumePasswordLoginAttempt(key(101), key(101)), false);
  advance(60_000);
  assert.equal(store.consumePasswordLoginAttempt(key(101), key(1)), true);
  for (let i = 0; i < 4; i++) assert.equal(store.consumePasswordLoginAttempt(key(101), key(1)), true);
  assert.equal(store.consumePasswordLoginAttempt(key(101), key(2)), false);
  advance(900_000);
  assert.equal(store.consumePasswordLoginAttempt(key(101), key(1)), true);
});

test('bounded storage fails closed, reclaims expiry, and rolls back partial admission on database failure', async t => {
  const { store, directory, advance } = await setup(t);
  const db = new DatabaseSync(join(directory, 'accounts.sqlite')); t.after(() => db.close());
  db.exec("CREATE TRIGGER fail_account BEFORE INSERT ON login_throttle WHEN NEW.bucket_key LIKE 'account:%' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  assert.throws(() => store.consumePasswordLoginAttempt(key(1), key(2)), /synthetic failure/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM login_throttle').get().n, 0);
  db.exec('DROP TRIGGER fail_account; BEGIN IMMEDIATE;');
  for (let i = 0; i < LOGIN_THROTTLE.maxRows; i++) db.prepare('INSERT INTO login_throttle VALUES(?,1,?)').run(`fixture:${i}`, Date.now() + 5000);
  db.exec('COMMIT;');
  assert.equal(store.consumePasswordLoginAttempt(key(1), key(2)), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM login_throttle').get().n, LOGIN_THROTTLE.maxRows);
  advance(60_000); assert.equal(store.consumePasswordLoginAttempt(key(1), key(2)), true);
});

test('real password verification issues a revocable session, rejects wrong/unknown/disabled accounts, and checks the captured generation', async t => {
  const { store } = await setup(t);
  const passwords = await createPasswordService();
  const password = 'Synthetic test passphrase 42!';
  const credential = await passwords.hashPassword(password);
  const owner = store.createFirstOwner({ username: 'owner', displayName: 'Owner' }, credential);
  const listener = store.createListener(owner.id, { username: 'listener', displayName: 'Listener' }, credential);
  store.setAccess(owner.id, listener.id, { owner: false, disabled: true });
  const service = createAccountPasswordLogin({ store, passwords, mode: 'hybrid', throttleSecret: secret });
  const context = { networkAddress: '192.0.2.1' };
  const success = await service.login({ username: ' OWNER ', password, remember: true }, context);
  assert.equal(success.ok, true);
  assert.equal(store.authenticateSession(success.issued.token).account.id, owner.id);
  assert.ok(success.issued.deviceToken);
  for (const username of ['owner', 'missing', 'listener']) {
    const result = await service.login({ username, password: username === 'listener' ? password : 'incorrect' }, context);
    assert.deepEqual(result, { ok: false, code: 'INVALID_CREDENTIALS' });
  }
  const racingPasswords = { verifyPassword: async (record, value) => {
    const result = await passwords.verifyPassword(record, value);
    store.replaceOwnPassword(owner.id, { expectedGeneration: 1, expectedRevision: 1, credential });
    return result;
  } };
  assert.deepEqual(await createAccountPasswordLogin({ store, passwords: racingPasswords, mode: 'local', throttleSecret: secret }).login({ username: 'owner', password }, context), { ok: false, code: 'INVALID_CREDENTIALS' });
  assert.equal(store.authenticateSession(success.issued.token), null);
});

test('disabled policy and invalid network fail before hashing; unknown users verify the dummy, and throttled attempts never hash', async () => {
  const calls = [];
  const store = { consumePasswordLoginAttempt: async () => { calls.push('admit'); return true; }, findByUsername: async () => null };
  const passwords = { verifyPassword: async (record) => { calls.push(record); return false; } };
  const make = mode => createAccountPasswordLogin({ store, passwords, mode, throttleSecret: secret });
  assert.equal((await make('oidc').login({}, { networkAddress: '192.0.2.1' })).code, 'PASSWORD_LOGIN_DISABLED');
  for (const networkAddress of ['forwarded-for', 'fe80::1%en0', undefined]) assert.equal((await make('local').login({}, { networkAddress })).code, 'LOGIN_UNAVAILABLE');
  assert.deepEqual(calls, []);
  await make('local').login({ username: 'missing', password: 'wrong' }, { networkAddress: '192.0.2.1' });
  assert.deepEqual(calls, ['admit', null]); calls.length = 0;
  store.consumePasswordLoginAttempt = async () => false;
  assert.equal((await make('local').login({ username: 'missing' }, { networkAddress: '192.0.2.1' })).code, 'LOGIN_THROTTLED');
  assert.deepEqual(calls, []);
});

test('equivalent network spellings and IPv6 /64 addresses share an admission bucket', async () => {
  const keys = [];
  const store = { consumePasswordLoginAttempt: async (account, network) => { keys.push(network); return false; } };
  const service = createAccountPasswordLogin({ store, passwords: {}, mode: 'local', throttleSecret: secret });
  for (const networkAddress of ['192.0.2.1', '::ffff:192.0.2.1', '0:0:0:0:0:ffff:c000:0201', '2001:db8:1:2::1', '2001:0db8:0001:0002:abcd:ef01:2345:6789', '2001:db8:1:3::1']) await service.login({}, { networkAddress });
  assert.equal(keys[0], keys[1]); assert.equal(keys[1], keys[2]);
  assert.equal(keys[3], keys[4]); assert.notEqual(keys[4], keys[5]);
});
