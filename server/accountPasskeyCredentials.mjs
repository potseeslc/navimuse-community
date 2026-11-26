import {randomBytes} from 'node:crypto';
const encoded=(value,min,max)=>typeof value==='string' && /^[A-Za-z0-9_-]+$/.test(value) && Buffer.from(value,'base64url').toString('base64url')===value && Buffer.from(value,'base64url').length>=min && Buffer.from(value,'base64url').length<=max;
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff;
const labelValid=value=>typeof value==='string'&&value.trim()&&value.length<=120&&!/[\u0000-\u001f\u007f]/.test(value);
const metadata=(deviceType,backedUp)=>['singleDevice','multiDevice'].includes(deviceType)&&typeof backedUp==='boolean'&&(!backedUp||deviceType==='multiDevice');
const transportsValid=values=>Array.isArray(values)&&values.length<=8&&new Set(values).size===values.length&&values.every(v=>['usb','nfc','ble','internal','hybrid','cable','smart-card'].includes(v));
export function initializeAccountPasskeyCredentials(db) {
 db.exec(`CREATE TABLE passkey_accounts (
   account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id), user_handle TEXT UNIQUE NOT NULL
 ) STRICT;
 CREATE TABLE passkey_credentials (
   id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL REFERENCES passkey_accounts(account_id),
   public_key BLOB NOT NULL, counter INTEGER NOT NULL CHECK(counter>=0), transports TEXT NOT NULL,
   device_type TEXT NOT NULL CHECK(device_type IN ('singleDevice','multiDevice')), backed_up INTEGER NOT NULL CHECK(backed_up IN (0,1)),
   label TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
   created_at INTEGER NOT NULL, last_used_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
   CHECK(backed_up=0 OR device_type='multiDevice')
 ) STRICT;
 CREATE INDEX passkey_credentials_account ON passkey_credentials(account_id);
 PRAGMA user_version=8;`);
}
// Private verified-service arguments only. Registration data must originate from
// the pinned verifier after consuming its ceremony, never a client JSON record.
export function accountPasskeyCredentialOperations(db,transaction,now,recent,readAccount,issueLogin,authenticate) {
 const active=id=>db.prepare('SELECT c.*,a.user_handle FROM passkey_credentials c JOIN passkey_accounts a ON a.account_id=c.account_id WHERE c.id=? AND c.revoked=0').get(id);
 const event=(account,operation,time)=>db.prepare('INSERT INTO account_events(account_id,actor_id,operation,occurred_at) VALUES(?,?,?,?)').run(account,account,operation,time);
 return {
  listPasskeys(token) {
   return transaction(()=>{
    const state=authenticate(token,now());if(!state)throw new Error('Sign in required');
    return db.prepare('SELECT id,label,revision,device_type,backed_up,created_at,last_used_at FROM passkey_credentials WHERE account_id=? AND revoked=0 ORDER BY created_at,id').all(state.account.id).map(row=>({id:row.id,label:row.label,revision:row.revision,deviceType:row.device_type,backedUp:Boolean(row.backed_up),createdAt:row.created_at,lastUsedAt:row.last_used_at}));
   });
  },
  changePasskey(token,{id,expectedRevision,label,remove=false}={}) {
   if(!encoded(id,1,1024)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1||typeof remove!=='boolean'||(!remove&&!labelValid(label)))throw new TypeError('Invalid passkey change');
   return transaction(()=>{
    const time=now(),state=recent(token,time),row=active(id);
    if(!row||row.account_id!==state.account.id)throw new Error('Passkey operation denied');
    if(row.revision!==expectedRevision)throw new Error('Passkey changed');
    if(remove){
     const password=db.prepare('SELECT account_id FROM password_credentials WHERE account_id=?').get(state.account.id);
     const count=db.prepare('SELECT count(*) AS n FROM passkey_credentials WHERE account_id=? AND revoked=0').get(state.account.id).n;
     if(!password&&count<=1)throw new Error('Last recovery method');
     db.prepare('UPDATE passkey_credentials SET revoked=1,revision=revision+1 WHERE id=?').run(id);
    }else db.prepare('UPDATE passkey_credentials SET label=?,revision=revision+1 WHERE id=?').run(label,id);
    event(state.account.id,remove?'passkey-removed':'passkey-renamed',time);
    return {ok:true};
   });
  },
  preparePasskeyEnrollment(token) {
   return transaction(()=>{
    const state=recent(token,now());let handle=db.prepare('SELECT user_handle FROM passkey_accounts WHERE account_id=?').get(state.account.id)?.user_handle;
    if(!handle){handle=randomBytes(32).toString('base64url');db.prepare('INSERT INTO passkey_accounts VALUES(?,?)').run(state.account.id,handle);}
    const credentials=db.prepare('SELECT id,transports FROM passkey_credentials WHERE account_id=? AND revoked=0').all(state.account.id).map(row=>({id:row.id,transports:JSON.parse(row.transports)}));
    if(credentials.length>=20)throw new Error('Passkey limit reached');
    return {account:state.account,userHandle:handle,credentials};
   });
  },
  registerPasskey(token,{expectedGeneration,userHandle,credential,deviceType,backedUp,label,ceremonyExpiresAt}={}) {
   if(!encoded(userHandle,32,32)||!encoded(credential?.id,1,1024)||!(credential?.publicKey instanceof Uint8Array)||credential.publicKey.byteLength<1||credential.publicKey.byteLength>4096||!count(credential.counter)||!transportsValid(credential.transports??[])||!metadata(deviceType,backedUp)||!labelValid(label))throw new TypeError('Invalid passkey credential');
   return transaction(()=>{
    const time=now(),state=recent(token,time),handle=db.prepare('SELECT user_handle FROM passkey_accounts WHERE account_id=?').get(state.account.id)?.user_handle;
    if(!Number.isSafeInteger(ceremonyExpiresAt)||ceremonyExpiresAt<=time||state.account.authorizationGeneration!==expectedGeneration||handle!==userHandle)throw new Error('Account operation denied');
    if(db.prepare('SELECT count(*) AS n FROM passkey_credentials WHERE account_id=? AND revoked=0').get(state.account.id).n>=20)throw new Error('Passkey limit reached');
    db.prepare('INSERT INTO passkey_credentials(id,account_id,public_key,counter,transports,device_type,backed_up,label,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(credential.id,state.account.id,credential.publicKey,credential.counter,JSON.stringify(credential.transports??[]),deviceType,backedUp?1:0,label,time);
    event(state.account.id,'passkey-created',time);return {id:credential.id,label,createdAt:time};
   });
  },
  getPasskeyCredential(id) {
   if(!encoded(id,1,1024))return null;
   return transaction(()=>{
    const row=active(id);if(!row)return null;const account=readAccount(row.account_id);if(!account||account.disabled)return null;
    return {accountId:account.id,generation:account.authorizationGeneration,revision:row.revision,userHandle:row.user_handle,
      credential:{id:row.id,publicKey:new Uint8Array(row.public_key),counter:row.counter,transports:JSON.parse(row.transports)},deviceType:row.device_type,backedUp:Boolean(row.backed_up)};
   });
  },
  issuePasskeySession(id,{expectedGeneration,expectedRevision,newCounter,deviceType,backedUp,remember=false,label='This device',ceremonyExpiresAt}={}) {
   if(!encoded(id,1,1024)||!count(newCounter)||!metadata(deviceType,backedUp)||typeof remember!=='boolean'||!labelValid(label))throw new TypeError('Invalid passkey issuance');
   return transaction(()=>{
    const time=now(),row=active(id),account=row?readAccount(row.account_id):null;
    if(!Number.isSafeInteger(ceremonyExpiresAt)||ceremonyExpiresAt<=time||!row||!account||account.disabled||account.authorizationGeneration!==expectedGeneration||row.revision!==expectedRevision||row.device_type!==deviceType||((row.counter>0||newCounter>0)&&newCounter<=row.counter))throw new Error('Account operation denied');
    db.prepare('UPDATE passkey_credentials SET counter=?,backed_up=?,revision=revision+1,last_used_at=? WHERE id=?').run(newCounter,backedUp?1:0,time,id);
    const issued=issueLogin(account,{remember,label},time);event(account.id,'passkey-login',time);return issued;
   });
  },
 };
}
