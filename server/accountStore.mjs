import {changeAccountAccess} from './accountAccessChange.mjs';
import {initializeAccountRecovery} from './accountRecovery.mjs';
import {initializeAccountPasskeyCredentials} from './accountPasskeyCredentials.mjs';
import {initializeAccountPasskeyCeremonies,initializeUsernamePasskeyCeremonies} from './accountPasskeyCeremonies.mjs';
import {initializeAccountPreferences,accountPreferenceOperations} from './accountPreferences.mjs';
import {initializeAccountUpstreamBindings,accountUpstreamBindingOperations} from './accountUpstreamBindings.mjs';
import { initializeLoginThrottle, loginThrottleOperations } from './accountLoginThrottle.mjs';
import { initializeAccountSessions, accountSessionOperations, normalizeSessionPolicy } from './accountSessions.mjs';
import { randomUUID } from 'node:crypto';
import { closeSync, constants, copyFileSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeLocalUsername } from '../shared/accountSession.js';
import { validPasswordCredential } from './passwordCredentialRecord.mjs';

// Private persistence only. Callers must verify setup credentials or a session
// before passing actor IDs. No HTTP route imports this module yet.
export async function openAccountStore(directory, { now = Date.now, sessionPolicy, deploymentRecovery = false } = {}) {
  if(typeof deploymentRecovery!=='boolean')throw new TypeError('Invalid deployment recovery policy');
  const policy = normalizeSessionPolicy(sessionPolicy);
  directory = resolve(directory);
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dir = lstatSync(directory);
  if (!dir.isDirectory() || (dir.mode & 0o077)) throw new Error('Account directory must be private');
  const path = join(directory, 'accounts.sqlite');
  try { closeSync(openSync(path, 'wx', 0o600)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const file = lstatSync(path);
  if (!file.isFile() || (file.mode & 0o077)) throw new Error('Account database must be a private regular file');
  const db = new DatabaseSync(path, { timeout: 5000, allowExtension: false });
  const transaction = (run) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = run(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    transaction(() => {
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (version !== 0 && version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8 && version !== 9 && version !== 10) throw new Error('Unsupported account database version');
      if (version === 0) db.exec(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          owner INTEGER NOT NULL CHECK(owner IN (0,1)),
          disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
          authorization_generation INTEGER NOT NULL DEFAULT 1 CHECK(authorization_generation > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE account_events (
          sequence INTEGER PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id),
          actor_id TEXT REFERENCES accounts(id),
          operation TEXT NOT NULL,
          occurred_at INTEGER NOT NULL
        ) STRICT;
        PRAGMA user_version=1;
      `);
      if (version < 2) db.exec(`
        CREATE TABLE password_credentials (
          account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
          version TEXT NOT NULL CHECK(version='argon2id-v1'),
          hash TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        ) STRICT;
        PRAGMA user_version=2;
      `);
      if (version < 3) initializeAccountSessions(db);
      if (version < 4) initializeLoginThrottle(db);
      if (version < 5) initializeAccountUpstreamBindings(db);
      if (version < 6) initializeAccountPreferences(db);
      if (version < 7) initializeAccountPasskeyCeremonies(db);
      if (version < 8) initializeAccountPasskeyCredentials(db);
      if (version < 9) initializeAccountRecovery(db);
      if (version < 10) initializeUsernamePasskeyCeremonies(db);
    });
  } catch (error) { db.close(); throw error; }
  const read = (id) => {
    const row = db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
    return row ? { id: row.id, username: row.username, displayName: row.display_name,
      roles: row.owner ? ['owner', 'listener'] : ['listener'], disabled: Boolean(row.disabled),
      authorizationGeneration: row.authorization_generation, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  };
  const requireOwner = (id) => {
    const actor = read(id);
    if (!actor || actor.disabled || !actor.roles.includes('owner')) throw new Error('Account operation denied');
  };
  const event = (id, actor, operation, now) => db.prepare('INSERT INTO account_events(account_id,actor_id,operation,occurred_at) VALUES(?,?,?,?)').run(id,actor,operation,now);
  const insert = ({ username, displayName }, owner, actor, credential) => {
    if (!validPasswordCredential(credential)) throw new TypeError('Invalid password credential');
    const canonical = normalizeLocalUsername(username);
    if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(displayName)) throw new TypeError('Invalid display name');
    const id = randomUUID(), now = Date.now();
    db.prepare('INSERT INTO accounts(id,username,display_name,owner,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,canonical,displayName,owner ? 1 : 0,now,now);
    db.prepare('INSERT INTO password_credentials(account_id,version,hash,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,credential.version,credential.hash,now,now);
    event(id,actor,'created',now);
    return read(id);
  };
  const {changeWithinTransaction,...bindings}=accountUpstreamBindingOperations(db,transaction,read,requireOwner,event,now);
  return Object.freeze({
    ...accountSessionOperations(db,transaction,read,now,policy,changeWithinTransaction,bindings.getUpstreamBinding,accountPreferenceOperations(db,now),deploymentRecovery,(input,actor,credential)=>insert(input,false,actor,credential)),
    ...loginThrottleOperations(db, transaction, now),
    ...bindings,
    hasAccounts: () => Boolean(db.prepare('SELECT 1 FROM accounts LIMIT 1').get()),
    getAccount: read,
    findByUsername(value) {
      const row = db.prepare('SELECT id FROM accounts WHERE username=?').get(normalizeLocalUsername(value));
      return row ? read(row.id) : null;
    },
    createFirstOwner(input, credential) {
      return transaction(() => {
        if (db.prepare('SELECT 1 FROM accounts LIMIT 1').get()) throw new Error('Account setup already completed');
        return insert(input,true,null,credential);
      });
    },
    createListener(actorId, input, credential) {
      return transaction(() => { requireOwner(actorId); return insert(input,false,actorId,credential); });
    },
    // Private credential read for BFF verification only; never serialize to UI.
    getPasswordCredential(accountId) {
      const row = db.prepare('SELECT version,hash,revision FROM password_credentials WHERE account_id=?').get(accountId);
      return row ? { credential: { version: row.version, hash: row.hash }, revision: row.revision } : null;
    },
    replaceOwnPassword(actorId, { expectedGeneration, expectedRevision, credential }) {
      if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1 ||
          !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !validPasswordCredential(credential)) throw new TypeError('Invalid password replacement');
      return transaction(() => {
        const account = read(actorId);
        if (!account || account.disabled || account.authorizationGeneration !== expectedGeneration) throw new Error('Account operation denied');
        const now = Date.now();
        const changed = db.prepare('UPDATE password_credentials SET version=?,hash=?,revision=revision+1,updated_at=? WHERE account_id=? AND revision=?').run(credential.version,credential.hash,now,actorId,expectedRevision);
        if (changed.changes !== 1) throw new Error('Password credential changed');
        db.prepare('UPDATE accounts SET authorization_generation=authorization_generation+1,updated_at=? WHERE id=?').run(now,actorId);
        event(actorId,actorId,'password-changed',now);
        return read(actorId);
      });
    },
    setAccess(actorId,accountId,change) {
      return transaction(()=>changeAccountAccess(db,read,actorId,accountId,change,now()));
    },
    // Deployment-only operation; no public backup endpoint exists.
    createBackup(backupDirectory) {
      backupDirectory = resolve(backupDirectory);
      mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
      const info = lstatSync(backupDirectory);
      if (!info.isDirectory() || (info.mode & 0o077)) throw new Error('Backup directory must be private');
      const destination = join(backupDirectory, `${randomUUID()}.sqlite`);
      const partial = `${destination}.partial`;
      closeSync(openSync(partial, 'wx', 0o600));
      try {
        db.prepare('VACUUM INTO ?').run(partial);
        syncPath(partial);
        renameSync(partial, destination);
        syncPath(backupDirectory);
        return { path: destination, schemaVersion: db.prepare('PRAGMA user_version').get().user_version };
      } catch (error) {
        try { unlinkSync(partial); } catch {}
        throw error;
      }
    },
    close() { db.close(); },
  });
}


function syncPath(path) {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

// Offline deployment utility. Restore into a NEW directory; never overwrite live
// database/WAL files. Stop consumers and switch directories only after success.
export async function restoreAccountStoreBackup(backupPath, directory) {
  backupPath = resolve(backupPath); directory = resolve(directory);
  const source = lstatSync(backupPath);
  if (!source.isFile() || (source.mode & 0o077) || backupPath.endsWith('.partial')) throw new Error('Invalid account backup file');
  mkdirSync(directory, { mode: 0o700 }); // EEXIST deliberately rejects an existing target.
  const partial = join(directory, 'accounts.sqlite.partial');
  const destination = join(directory, 'accounts.sqlite');
  try {
    copyFileSync(backupPath, partial, constants.COPYFILE_EXCL);
    const { DatabaseSync } = await import('node:sqlite');
    const candidate = new DatabaseSync(partial, { readOnly: true, allowExtension: false });
    let version;
    try {
      version = candidate.prepare('PRAGMA user_version').get().user_version;
      if (![1,2,3,4,5,6,7,8,9,10].includes(version) ||
          candidate.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
          candidate.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Invalid account backup database');
      candidate.prepare('SELECT id,username,display_name,owner,disabled,authorization_generation,created_at,updated_at FROM accounts LIMIT 1').get();
      candidate.prepare('SELECT sequence,account_id,actor_id,operation,occurred_at FROM account_events LIMIT 1').get();
      if (version >= 2) candidate.prepare('SELECT account_id,version,hash,revision,created_at,updated_at FROM password_credentials LIMIT 1').get();
      if (version >= 10) candidate.prepare('SELECT ceremony_id,account_id,generation,credential_ids FROM passkey_login_targets LIMIT 1').get();
      if (version >= 9) candidate.prepare('SELECT account_id,verifier,generation,issuer_id,issuer_generation,created_at,expires_at FROM account_recovery_codes LIMIT 1').get();
      if (version >= 8) {
        candidate.prepare('SELECT account_id,user_handle FROM passkey_accounts LIMIT 1').get();
        candidate.prepare('SELECT id,account_id,public_key,counter,transports,device_type,backed_up,label,revision,created_at,last_used_at,revoked FROM passkey_credentials LIMIT 1').get();
      }
      if (version >= 7) candidate.prepare('SELECT id,purpose,challenge,origin,rp_id,binding_verifier,session_verifier,account_id,generation,created_at,expires_at FROM passkey_ceremonies LIMIT 1').get();
      if (version >= 6) candidate.prepare('SELECT account_id,revision,preferences,updated_at FROM account_preferences LIMIT 1').get();
      if (version >= 5) candidate.prepare('SELECT account_id,server_id,username,credential_ref,revision,updated_at FROM account_upstream_bindings LIMIT 1').get();
      if (version >= 4) candidate.prepare('SELECT bucket_key, attempts, expires_at FROM login_throttle LIMIT 1').get();
      if (version >= 3) {
        candidate.prepare('SELECT verifier,account_id,generation,authenticated_at,expires_at,device_id,revoked FROM account_sessions LIMIT 1').get();
        candidate.prepare('SELECT id,account_id,verifier,generation,label,authenticated_at,created_at,last_used_at,idle_expires_at,absolute_expires_at,revoked FROM device_families LIMIT 1').get();
      }
    } finally { candidate.close(); }
    // Restoring a historical snapshot must not resurrect revoked bearer tokens.
    if (version >= 3) {
      const restored = new DatabaseSync(partial, { allowExtension: false });
      try { restored.exec(`PRAGMA foreign_keys=ON; BEGIN IMMEDIATE; ${version >= 9 ? 'DELETE FROM account_recovery_codes;' : ''} ${version >= 7 ? 'DELETE FROM passkey_ceremonies;' : ''} ${version >= 8 ? 'UPDATE passkey_credentials SET revoked=1,revision=revision+1;' : ''} DELETE FROM account_sessions; DELETE FROM device_families; COMMIT;`); }
      finally { restored.close(); }
    }
    syncPath(partial);
    renameSync(partial,destination);
    syncPath(directory);
    return { path: destination, schemaVersion: version };
  } catch (error) {
    try { unlinkSync(partial); } catch {}
    throw error;
  }
}
