import {normalizeLocalUsername} from '../shared/accountSession.js';
import {createHash,randomUUID} from 'node:crypto';
import {createAccountPasskeyVerifier,PASSKEY_CEREMONY_MS} from './accountPasskeyVerifier.mjs';
const digest=value=>createHash('sha256').update(`navimuse-passkey-binding-v1:${value}`).digest('hex');
const base64=(value,min,max)=>typeof value==='string' && /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value,'base64url').toString('base64url')===value && Buffer.from(value,'base64url').length>=min && Buffer.from(value,'base64url').length<=max;
const binding=value=>typeof value==='string' && value.startsWith('p1.') && base64(value.slice(3),32,32);
export function initializeAccountPasskeyCeremonies(db) {
  db.exec(`CREATE TABLE passkey_ceremonies (
    id TEXT PRIMARY KEY NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('register','login')),
    challenge TEXT UNIQUE NOT NULL, origin TEXT NOT NULL, rp_id TEXT NOT NULL,
    binding_verifier TEXT NOT NULL, session_verifier TEXT,
    account_id TEXT REFERENCES accounts(id), generation INTEGER,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    CHECK(expires_at>created_at AND expires_at-created_at<=300000),
    CHECK((purpose='login' AND session_verifier IS NULL AND account_id IS NULL AND generation IS NULL) OR
      (purpose='register' AND session_verifier IS NOT NULL AND account_id IS NOT NULL AND generation>0))
  ) STRICT;
  CREATE INDEX passkey_ceremonies_expiry ON passkey_ceremonies(expires_at);
  CREATE INDEX passkey_ceremonies_binding ON passkey_ceremonies(binding_verifier);
  PRAGMA user_version=7;`);
}
// Separate targets preserve the existing registration/discoverable ceremony schema.
// Cascading deletion keeps expiry, cancellation and backup restore atomic.
export function initializeUsernamePasskeyCeremonies(db) {
  db.exec(`CREATE TABLE passkey_login_targets (
    ceremony_id TEXT PRIMARY KEY NOT NULL REFERENCES passkey_ceremonies(id) ON DELETE CASCADE,
    account_id TEXT REFERENCES accounts(id), generation INTEGER,
    credential_ids TEXT NOT NULL,
    CHECK((account_id IS NULL AND generation IS NULL) OR (account_id IS NOT NULL AND generation>0))
  ) STRICT;
  PRAGMA user_version=10;`);
}
// Private worker operations. No browser tokens or account identifiers are accepted
// as authority. Enrollment derives identity from a currently recent session while
// holding the same database write lock used for insertion/consumption.
export function accountPasskeyCeremonyOperations(db,transaction,now,authenticate,recent) {
  const prune=time=>db.prepare('DELETE FROM passkey_ceremonies WHERE expires_at<=?').run(time);
  return {
    createPasskeyCeremony({purpose,challenge,origin,rpID,bindingToken,sessionToken=null,developmentLocalhost=false,username=null}={}) {
      if (!['register','login'].includes(purpose) || !base64(challenge,32,128) || !binding(bindingToken) || (purpose==='login' && sessionToken!==null)) throw new TypeError('Invalid passkey ceremony');
      if(username!==null && purpose!=='login')throw new TypeError('Invalid passkey ceremony');
      const canonicalUsername=username===null?null:normalizeLocalUsername(username);
      createAccountPasskeyVerifier({canonicalOrigin:origin,rpID,developmentLocalhost});
      return transaction(()=>{
        const time=now(),state=purpose==='register'?recent(sessionToken,time):null;
        prune(time);const key=digest(bindingToken);
        if (db.prepare('SELECT count(*) AS n FROM passkey_ceremonies WHERE binding_verifier=?').get(key).n>=4 || db.prepare('SELECT count(*) AS n FROM passkey_ceremonies').get().n>=4096) throw new Error('Passkey ceremony limit reached');
        const id=randomUUID(),expiresAt=time+PASSKEY_CEREMONY_MS;
        db.prepare('INSERT INTO passkey_ceremonies VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,purpose,challenge,origin,rpID,key,state?digest(sessionToken):null,state?.account.id??null,state?.account.authorizationGeneration??null,time,expiresAt);
        if(canonicalUsername!==null){
          const target=db.prepare('SELECT id,authorization_generation FROM accounts WHERE username=? AND disabled=0').get(canonicalUsername);
          const credentials=db.prepare('SELECT id,transports FROM passkey_credentials WHERE account_id=? AND revoked=0 ORDER BY id LIMIT 20').all(target?.id??null).map(row=>({id:row.id,transports:JSON.parse(row.transports)}));
          db.prepare('INSERT INTO passkey_login_targets VALUES(?,?,?,?)').run(id,target?.id??null,target?.authorization_generation??null,JSON.stringify(credentials.map(c=>c.id)));
          // Private result. The HTTP layer must not serialize account lookup state
          // or expose an empty credential list for an unknown username.
          return {id,challenge,expiresAt,credentials};
        }
        return {id,challenge,expiresAt};
      });
    },
    consumePasskeyCeremony({id,purpose,origin,rpID,bindingToken,sessionToken=null}={}) {
      if (typeof id!=='string' || id.length!==36 || !binding(bindingToken)) return null;
      return transaction(()=>{
        const time=now();prune(time);
        const row=db.prepare('SELECT * FROM passkey_ceremonies WHERE id=?').get(id);
        if (!row || row.created_at>time || row.purpose!==purpose || row.origin!==origin || row.rp_id!==rpID || row.binding_verifier!==digest(bindingToken)) return null;
        if (row.purpose==='register' && (typeof sessionToken!=='string' || row.session_verifier!==digest(sessionToken))) return null;
        if (row.purpose==='login' && sessionToken!==null) return null;
        // Consume before cryptographic verification. Invalid/revoked enrollment
        // consumes its correctly bound attempt too, without rolling back deletion.
        const target=db.prepare('SELECT * FROM passkey_login_targets WHERE ceremony_id=?').get(id);
        db.prepare('DELETE FROM passkey_ceremonies WHERE id=?').run(id);
        if(target){
          const account=db.prepare('SELECT disabled,authorization_generation FROM accounts WHERE id=?').get(target.account_id);
          if(!account||account.disabled||account.authorization_generation!==target.generation)return null;
        }
        if (row.purpose==='register') {
          const state=authenticate(sessionToken,time);
          if (!state || state.account.id!==row.account_id || state.account.authorizationGeneration!==row.generation) return null;
          try {recent(sessionToken,time);} catch {return null;}
        }
        return {id:row.id,purpose:row.purpose,challenge:row.challenge,origin:row.origin,rpID:row.rp_id,
          accountId:target?.account_id??row.account_id,generation:target?.generation??row.generation,...(target?{usernameFirst:true,credentialIds:JSON.parse(target.credential_ids)}:{}),createdAt:row.created_at,expiresAt:row.expires_at};
      });
    },
  };
}
