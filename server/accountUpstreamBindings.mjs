import {createHmac} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function bindingRecord(value) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==3 ||
      !['serverId','username','credentialRef'].every(key=>Object.hasOwn(value,key)) || (typeof value.serverId!=='string' || !uuid.test(value.serverId)) ||
      typeof value.username!=='string' || !value.username.isWellFormed() || !value.username.trim() || value.username!==value.username.trim() ||
      Buffer.byteLength(value.username,'utf8')>256 || /[\u0000-\u001f\u007f]/.test(value.username) ||
      typeof value.credentialRef!=='string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.credentialRef)) throw new TypeError('Invalid upstream binding');
  return {serverId:value.serverId,username:value.username,credentialRef:value.credentialRef};
}
export function initializeAccountUpstreamBindings(db) {
  db.exec(`CREATE TABLE account_upstream_bindings (
    account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id),
    server_id TEXT, username TEXT, credential_ref TEXT,
    revision INTEGER NOT NULL CHECK(revision>0), updated_at INTEGER NOT NULL,
    CHECK((server_id IS NULL AND username IS NULL AND credential_ref IS NULL) OR
      (server_id IS NOT NULL AND username IS NOT NULL AND credential_ref IS NOT NULL))
  ) STRICT; PRAGMA user_version=5;`);
}
export function accountUpstreamBindingOperations(db,transaction,read,requireOwner,event,now) {
  const get=accountId=>{
    const row=db.prepare('SELECT * FROM account_upstream_bindings WHERE account_id=?').get(accountId);
    return row?{revision:row.revision,binding:row.server_id===null?null:{serverId:row.server_id,username:row.username,credentialRef:row.credential_ref}}:{revision:0,binding:null};
  };
  // Internal transaction body; accountStore does not expose this member.
  const changeWithinTransaction=(actorId,accountId,{expectedRevision,binding})=>{
    if (typeof accountId!=='string' || !uuid.test(accountId) || !Number.isSafeInteger(expectedRevision) || expectedRevision<0 || expectedRevision>=Number.MAX_SAFE_INTEGER) throw new TypeError('Invalid binding update');
    const next=binding===null?null:bindingRecord(binding);
    requireOwner(actorId);
    if (!read(accountId)) throw new Error('Account operation denied');
    const current=get(accountId);
    if (current.revision!==expectedRevision) throw new Error('Upstream binding changed');
    if (JSON.stringify(current.binding)===JSON.stringify(next)) return current;
    const time=now();
    db.prepare(`INSERT INTO account_upstream_bindings VALUES(?,?,?,?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET server_id=excluded.server_id,username=excluded.username,
      credential_ref=excluded.credential_ref,revision=excluded.revision,updated_at=excluded.updated_at`)
      .run(accountId,next?.serverId??null,next?.username??null,next?.credentialRef??null,current.revision+1,time);
    db.prepare('UPDATE accounts SET authorization_generation=authorization_generation+1,updated_at=? WHERE id=?').run(time,accountId);
    db.prepare('UPDATE account_sessions SET revoked=1 WHERE account_id=?').run(accountId);
    db.prepare('UPDATE device_families SET revoked=1 WHERE account_id=?').run(accountId);
    event(accountId,actorId,next?'upstream-binding-approved':'upstream-binding-cleared',time);
    return get(accountId);
  };
  return {
    getUpstreamBinding:get,
    changeWithinTransaction,
    setUpstreamBinding:(actorId,accountId,change)=>transaction(()=>changeWithinTransaction(actorId,accountId,change)),
  };
}

// Server-only namespace derivation after an approved binding has been resolved.
// Credential rotation preserves queue identity; an account/server/username change
// creates a distinct namespace. Never accept these identity fields from a request.
export function accountQueueScope(secret,accountId,binding) {
  if (!Buffer.isBuffer(secret) || secret.length!==32 || typeof accountId!=='string' || !uuid.test(accountId)) throw new TypeError('Invalid queue scope configuration');
  const valid=bindingRecord(binding);
  const digest=createHmac('sha256',secret).update('navimuse-account-upstream-queue:v2\0')
    .update(JSON.stringify([accountId,valid.serverId,valid.username])).digest('hex');
  return `queue-scope-v2:${digest}`;
}
