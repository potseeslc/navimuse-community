import {changeAccountAccess,publicAccountAccess} from './accountAccessChange.mjs';
import {accountRecoveryOperations} from './accountRecovery.mjs';
import {accountPasskeyCredentialOperations} from './accountPasskeyCredentials.mjs';
import {accountPasskeyCeremonyOperations} from './accountPasskeyCeremonies.mjs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
export const SESSION_LIFETIME_MS = 30 * 60 * 1000;
export const RECENT_AUTH_MS = 5 * 60 * 1000;
const DAY = 86400000;
const DEFAULT_POLICY = Object.freeze({shortMs:SESSION_LIFETIME_MS,recentMs:RECENT_AUTH_MS,
  idleMs:30*DAY,absoluteMs:180*DAY,maxDevices:20,maxSessions:128});
export function normalizeSessionPolicy(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key=>!Object.hasOwn(DEFAULT_POLICY,key))) throw new TypeError('Invalid session policy');
  const policy={...DEFAULT_POLICY,...input};
  for (const key of Object.keys(DEFAULT_POLICY)) {
    if (!Number.isSafeInteger(policy[key]) || policy[key]<1 || policy[key]>DEFAULT_POLICY[key]) throw new TypeError('Invalid session policy');
  }
  if (policy.recentMs>policy.shortMs || policy.shortMs>policy.idleMs || policy.idleMs>policy.absoluteMs) throw new TypeError('Invalid session policy');
  return Object.freeze(policy);
}
const mint = kind => `${kind}.${randomBytes(32).toString('base64url')}`;
function verifier(token, kind) {
  if (typeof token !== 'string' || token.length !== 46 || !token.startsWith(`${kind}.`)) return null;
  const encoded = token.slice(3);
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded) || Buffer.from(encoded,'base64url').toString('base64url') !== encoded) return null;
  return createHash('sha256').update(`navimuse-session-v1:${token}`).digest('hex');
}
export function initializeAccountSessions(db) {
  db.exec(`
    CREATE TABLE device_families (
      id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
      verifier TEXT UNIQUE NOT NULL, generation INTEGER NOT NULL, label TEXT NOT NULL,
      authenticated_at INTEGER NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL,
      idle_expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
    ) STRICT;
    CREATE TABLE account_sessions (
      verifier TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
      generation INTEGER NOT NULL, authenticated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      device_id TEXT REFERENCES device_families(id), revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
    ) STRICT;
    CREATE INDEX account_sessions_account ON account_sessions(account_id);
    CREATE INDEX account_sessions_device ON account_sessions(device_id);
    CREATE INDEX device_families_account ON device_families(account_id);
    PRAGMA user_version=3;
  `);
}
// Private BFF operations: only a verified server caller supplies issuance proof.
export function accountSessionOperations(db, transaction, readAccount, now = Date.now, policy = normalizeSessionPolicy(), changeUpstreamBinding,readUpstreamBinding,preferences,deploymentRecovery=false,insertManagedListener) {
  const validFamily = (row,time) => row && !row.revoked && row.idle_expires_at > time && row.absolute_expires_at > time;
  function authenticate(token,time) {
    const key=verifier(token,'s1'); if (!key) return null;
    const row=db.prepare('SELECT * FROM account_sessions WHERE verifier=?').get(key);
    if (!row || row.revoked || row.expires_at <= time || row.authenticated_at > time) return null;
    const account=readAccount(row.account_id);
    if (!account || account.disabled || account.authorizationGeneration !== row.generation) return null;
    if (row.device_id) {
      const family=db.prepare('SELECT * FROM device_families WHERE id=?').get(row.device_id);
      if (!validFamily(family,time) || family.account_id !== account.id || family.generation !== row.generation) return null;
    }
    return {account,session:{authenticatedAt:row.authenticated_at,expiresAt:row.expires_at,deviceId:row.device_id}};
  }
  function prune(account,time) {
    db.prepare(`DELETE FROM account_sessions WHERE account_id=? AND
      (revoked=1 OR expires_at<=? OR generation<>? OR device_id IN
        (SELECT id FROM device_families WHERE revoked=1 OR idle_expires_at<=? OR absolute_expires_at<=?))`)
      .run(account.id,time,account.authorizationGeneration,time,time);
    db.prepare(`DELETE FROM device_families WHERE account_id=? AND
      (revoked=1 OR idle_expires_at<=? OR absolute_expires_at<=? OR generation<>?)`)
      .run(account.id,time,time,account.authorizationGeneration);
  }
  function issue(account,authenticatedAt,deviceId,time,ceiling=Infinity) {
    if (db.prepare('SELECT count(*) AS n FROM account_sessions WHERE account_id=?').get(account.id).n >= policy.maxSessions) throw new Error('Session limit reached');
    const token=mint('s1'),expiresAt=Math.min(time+policy.shortMs,ceiling);
    db.prepare('INSERT INTO account_sessions(verifier,account_id,generation,authenticated_at,expires_at,device_id) VALUES(?,?,?,?,?,?)')
      .run(verifier(token,'s1'),account.id,account.authorizationGeneration,authenticatedAt,expiresAt,deviceId);
    return {token,account,session:{authenticatedAt,expiresAt,deviceId}};
  }
  function recent(token,time) {
    const state=authenticate(token,time);
    if (!state || state.session.authenticatedAt > time || time-state.session.authenticatedAt >= policy.recentMs) throw new Error('Recent authentication required');
    return state;
  }
  function revokeFamily(id) {
    db.prepare('UPDATE device_families SET revoked=1 WHERE id=?').run(id);
    db.prepare('UPDATE account_sessions SET revoked=1 WHERE device_id=?').run(id);
  }
  function issueLogin(account,{remember,label},time) {
    let deviceToken=null,deviceId=null;
    prune(account,time);
    if (remember) {
      if (db.prepare('SELECT count(*) AS n FROM device_families WHERE account_id=?').get(account.id).n >= policy.maxDevices) throw new Error('Device limit reached');
      deviceToken=mint('d1');deviceId=randomUUID();
      db.prepare('INSERT INTO device_families(id,account_id,verifier,generation,label,authenticated_at,created_at,last_used_at,idle_expires_at,absolute_expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(deviceId,account.id,verifier(deviceToken,'d1'),account.authorizationGeneration,label,time,time,time,time+policy.idleMs,time+policy.absoluteMs);
    }
    return {...issue(account,time,deviceId,time),deviceToken};
  }
  return {
    ...accountRecoveryOperations(db,transaction,now,recent,readAccount,deploymentRecovery),
    ...accountPasskeyCredentialOperations(db,transaction,now,recent,readAccount,issueLogin,authenticate),
    ...accountPasskeyCeremonyOperations(db,transaction,now,authenticate,recent),
    issuePasswordSession(accountId,{expectedGeneration,expectedRevision,remember=false,label='This device'}) {
      if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration<1 || !Number.isSafeInteger(expectedRevision) || expectedRevision<1 || typeof remember!=='boolean' ||
          typeof label!=='string' || !label.trim() || label.length>120 || /[\u0000-\u001f\u007f]/.test(label)) throw new TypeError('Invalid session issuance');
      return transaction(()=>{
        const account=readAccount(accountId),credential=db.prepare('SELECT revision FROM password_credentials WHERE account_id=?').get(accountId);
        if (!account || account.disabled || account.authorizationGeneration!==expectedGeneration || credential?.revision!==expectedRevision) throw new Error('Account operation denied');
        return issueLogin(account,{remember,label},now());
      });
    },
    authenticateSession(token) {return transaction(()=>authenticate(token,now()));},
    readPreferencesForSession(token) {
      return transaction(()=>{const state=authenticate(token,now());return state?preferences.read(state.account.id):null;});
    },
    writePreferencesForSession(token,input) {
      return transaction(()=>{const state=authenticate(token,now());return state?preferences.write(state.account.id,input):null;});
    },
    createManagedListenerForSession(token,input,credential){
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!Object.hasOwn(input,'username')||!Object.hasOwn(input,'displayName'))throw new TypeError('Invalid account creation');
      return transaction(()=>{
        const state=recent(token,now());
        if(!state.account.roles.includes('owner'))throw new Error('Owner access required');
        try{return insertManagedListener(input,state.account.id,credential);}
        catch(error){if(error.errcode===2067)throw new Error('Username unavailable');throw error;}
      });
    },
    getManagedAccessForSession(token,accountId){
      return transaction(()=>{
        const state=authenticate(token,now());
        if(!state)throw new Error('Sign in required');
        if(!state.account.roles.includes('owner'))throw new Error('Owner access required');
        const account=readAccount(accountId);if(!account)throw new Error('Account operation denied');
        return publicAccountAccess(account);
      });
    },
    setManagedAccessForSession(token,accountId,change){
      if(!Number.isSafeInteger(change?.expectedGeneration)||change.expectedGeneration<1)throw new TypeError('Invalid account access');
      return transaction(()=>{
        const time=now(),state=recent(token,time);
        if(!state.account.roles.includes('owner'))throw new Error('Owner access required');
        return publicAccountAccess(changeAccountAccess(db,readAccount,state.account.id,accountId,change,time));
      });
    },
    listManagedAccountsForSession(token,{after='',limit=50}={}) {
      return transaction(()=>{
        const state=authenticate(token,now());
        if (!state) return null;
        if (!state.account.roles.includes('owner')) return {ok:false,code:'OWNER_REQUIRED'};
        if (typeof after!=='string' || after!=='' && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(after) ||
            !Number.isSafeInteger(limit) || limit<1 || limit>100) throw new TypeError('Invalid account page');
        const rows=db.prepare(`SELECT a.id,a.username,a.display_name,a.owner,a.disabled,
          b.revision,b.server_id IS NOT NULL AS music_configured
          FROM accounts a LEFT JOIN account_upstream_bindings b ON b.account_id=a.id
          WHERE a.id>? ORDER BY a.id LIMIT ?`).all(after,limit+1);
        const accounts=rows.slice(0,limit).map(row=>({id:row.id,username:row.username,
          displayName:row.display_name,roles:row.owner?['owner','listener']:['listener'],
          disabled:Boolean(row.disabled),musicConfigured:Boolean(row.music_configured),bindingRevision:row.revision??0}));
        return {ok:true,accounts,page:{limit,nextAfter:rows.length>limit?accounts.at(-1).id:null}};
      });
    },
    getUpstreamBindingForSession(token,accountId) {
      return transaction(()=>{
        const state=authenticate(token,now());
        if (!state || !state.account.roles.includes('owner') || !readAccount(accountId)) throw new Error('Account operation denied');
        return readUpstreamBinding(accountId);
      });
    },
    setUpstreamBindingForSession(token,accountId,change) {
      return transaction(()=>{
        const state=recent(token,now());
        if (!state.account.roles.includes('owner')) throw new Error('Account operation denied');
        return changeUpstreamBinding(state.account.id,accountId,change);
      });
    },
    // Authenticate and snapshot approval in one transaction. Never look up a
    // request-selected account ID after a separate session check.
    authenticateUpstreamSession(token) {
      return transaction(()=>{
        const state=authenticate(token,now());if (!state) return null;
        const row=db.prepare('SELECT * FROM account_upstream_bindings WHERE account_id=?').get(state.account.id);
        return {...state,upstream:{revision:row?.revision??0,binding:row?.server_id?{
          serverId:row.server_id,username:row.username,credentialRef:row.credential_ref,
        }:null}};
      });
    },
    refreshDevice(token) {
      const key=verifier(token,'d1');if (!key) return null;
      return transaction(()=>{
        const time=now(),family=db.prepare('SELECT * FROM device_families WHERE verifier=?').get(key);
        if (!validFamily(family,time)) return null;
        const account=readAccount(family.account_id);
        if (!account || account.disabled || account.authorizationGeneration!==family.generation) return null;
        prune(account,time);
        const deviceToken=mint('d1'),idleExpiresAt=Math.min(time+policy.idleMs,family.absolute_expires_at);
        db.prepare('UPDATE device_families SET verifier=?,last_used_at=?,idle_expires_at=? WHERE id=? AND verifier=?')
          .run(verifier(deviceToken,'d1'),time,idleExpiresAt,family.id,key);
        return {...issue(account,family.authenticated_at,family.id,time,idleExpiresAt),deviceToken};
      });
    },
    logoutSession(token) {
      const key=verifier(token,'s1');if (!key) return;
      return transaction(()=>{
        // A recognized expired token may still revoke its own family.
        const row=db.prepare('SELECT device_id FROM account_sessions WHERE verifier=?').get(key);
        if (!row) return;
        if (row.device_id) revokeFamily(row.device_id);
        db.prepare('UPDATE account_sessions SET revoked=1 WHERE verifier=?').run(key);
      });
    },
    listDevices(token) {
      return transaction(()=>{
        const time=now(),state=authenticate(token,time);if (!state) throw new Error('Account operation denied');
        return db.prepare('SELECT id,label,created_at,last_used_at,idle_expires_at,absolute_expires_at FROM device_families WHERE account_id=? AND generation=? AND revoked=0 AND idle_expires_at>? AND absolute_expires_at>? ORDER BY created_at,id')
          .all(state.account.id,state.account.authorizationGeneration,time,time).map(row=>({id:row.id,label:row.label,createdAt:row.created_at,lastUsedAt:row.last_used_at,idleExpiresAt:row.idle_expires_at,absoluteExpiresAt:row.absolute_expires_at,current:row.id===state.session.deviceId}));
      });
    },
    revokeDevice(token,deviceId) {
      return transaction(()=>{
        const state=recent(token,now()),family=db.prepare('SELECT account_id FROM device_families WHERE id=?').get(deviceId);
        if (!family || family.account_id!==state.account.id) throw new Error('Account operation denied');
        revokeFamily(deviceId);
      });
    },
    logoutEverywhere(token) {
      return transaction(()=>{
        const state=recent(token,now());
        db.prepare('UPDATE device_families SET revoked=1 WHERE account_id=?').run(state.account.id);
        db.prepare('UPDATE account_sessions SET revoked=1 WHERE account_id=?').run(state.account.id);
      });
    },
  };
}
