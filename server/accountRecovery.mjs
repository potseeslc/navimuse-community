import {createHash,randomBytes} from 'node:crypto';
import {validPasswordCredential} from './passwordCredentialRecord.mjs';

export const ACCOUNT_RECOVERY_CODE_MS=15*60*1000;
function verifier(code) {
 if(typeof code!=='string'||!/^r1\.[A-Za-z0-9_-]{43}$/.test(code)||Buffer.from(code.slice(3),'base64url').toString('base64url')!==code.slice(3))return null;
 return createHash('sha256').update(`navimuse-account-recovery-v1:${code}`).digest('hex');
}
export function initializeAccountRecovery(db) {
 db.exec(`CREATE TABLE account_recovery_codes (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
  verifier TEXT UNIQUE NOT NULL,
  generation INTEGER NOT NULL,
  issuer_id TEXT NOT NULL REFERENCES accounts(id),
  issuer_generation INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
 ) STRICT; PRAGMA user_version=9;`);
}
// Private BFF persistence. Recovery HTTP must rate-limit requests and screen/hash
// the new password through the existing password service before redemption.
export function accountRecoveryOperations(db,transaction,now,recent,readAccount,deploymentRecovery=false) {
 const event=(account,actor,operation,time)=>db.prepare('INSERT INTO account_events(account_id,actor_id,operation,occurred_at) VALUES(?,?,?,?)').run(account,actor,operation,time);
 function mintGrant(account,actor,time,operation) {
    const code=`r1.${randomBytes(32).toString('base64url')}`,expiresAt=time+ACCOUNT_RECOVERY_CODE_MS;
    db.prepare('DELETE FROM account_recovery_codes WHERE expires_at<=?').run(time);
    db.prepare(`INSERT INTO account_recovery_codes(account_id,verifier,generation,issuer_id,issuer_generation,created_at,expires_at) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(account_id) DO UPDATE SET verifier=excluded.verifier,generation=excluded.generation,issuer_id=excluded.issuer_id,issuer_generation=excluded.issuer_generation,created_at=excluded.created_at,expires_at=excluded.expires_at`)
     .run(account.id,verifier(code),account.authorizationGeneration,actor.id,actor.authorizationGeneration,time,expiresAt);
    event(account.id,actor.id,operation,time);
    // The code is returned once to the authorized issuer; never log this result.
    return {code,expiresAt};
 }
 return {
  ...(deploymentRecovery?{issueDeploymentRecoveryCode(accountId,expectedGeneration){
   if(!Number.isSafeInteger(expectedGeneration)||expectedGeneration<1)throw new Error('Recovery unavailable');
   return transaction(()=>{
    const account=readAccount(accountId);
    if(!account||account.disabled||!account.roles.includes('owner')||account.authorizationGeneration!==expectedGeneration||
       db.prepare('SELECT count(*) AS n FROM accounts WHERE owner=1 AND disabled=0').get().n!==1)throw new Error('Recovery unavailable');
    return mintGrant(account,account,now(),'deployment-recovery-code-issued');
   });
  }}:{}),
  issueRecoveryCodeForSession(sessionToken,accountId) {
   return transaction(()=>{
    const time=now(),actor=recent(sessionToken,time).account;
    if(!actor.roles.includes('owner'))throw new Error('Owner access required');
    const account=readAccount(accountId);
    if(!account||account.disabled)throw new Error('Recovery unavailable');
    return mintGrant(account,actor,time,'recovery-code-issued');
   });
  },
  recoverPasswordWithCode(code,credential) {
   if(!validPasswordCredential(credential))throw new TypeError('Invalid password credential');
   const key=verifier(code);if(!key)return null;
   return transaction(()=>{
    const time=now(),saved=db.prepare('SELECT * FROM account_recovery_codes WHERE verifier=?').get(key);
    if(!saved)return null;
    const account=readAccount(saved.account_id),issuer=readAccount(saved.issuer_id);
    if(saved.created_at>time||saved.expires_at<=time||!account||account.disabled||account.authorizationGeneration!==saved.generation||
       !issuer||issuer.disabled||!issuer.roles.includes('owner')||issuer.authorizationGeneration!==saved.issuer_generation)return null;
    db.prepare(`INSERT INTO password_credentials(account_id,version,hash,revision,created_at,updated_at) VALUES(?,?,?,1,?,?)
     ON CONFLICT(account_id) DO UPDATE SET version=excluded.version,hash=excluded.hash,revision=password_credentials.revision+1,updated_at=excluded.updated_at`)
     .run(account.id,credential.version,credential.hash,time,time);
    db.prepare('UPDATE accounts SET authorization_generation=authorization_generation+1,updated_at=? WHERE id=?').run(time,account.id);
    db.prepare('UPDATE account_sessions SET revoked=1 WHERE account_id=?').run(account.id);
    db.prepare('UPDATE device_families SET revoked=1 WHERE account_id=?').run(account.id);
    db.prepare('DELETE FROM passkey_ceremonies WHERE account_id=? OR id IN (SELECT ceremony_id FROM passkey_login_targets WHERE account_id=?)').run(account.id,account.id);
    db.prepare('DELETE FROM account_recovery_codes WHERE account_id=?').run(account.id);
    event(account.id,saved.issuer_id,'password-recovered',time);
    return {ok:true}; // Sign in normally; recovery never issues a session.
   });
  },
 };
}
