// Called only while the account store's write transaction is held.
export function changeAccountAccess(db,readAccount,actorId,accountId,{owner,disabled,expectedGeneration},time){
 if(typeof owner!=='boolean'||typeof disabled!=='boolean')throw new TypeError('Invalid account access');
 const actor=readAccount(actorId),current=readAccount(accountId);
 if(!actor||actor.disabled||!actor.roles.includes('owner')||!current)throw new Error('Account operation denied');
 if(expectedGeneration!==undefined&&current.authorizationGeneration!==expectedGeneration)throw new Error('Account access changed');
 if(current.roles.includes('owner')===owner&&current.disabled===disabled)return current;
 if(current.roles.includes('owner')&&!current.disabled&&(!owner||disabled)&&db.prepare('SELECT count(*) AS n FROM accounts WHERE owner=1 AND disabled=0').get().n<=1)throw new Error('Cannot remove the last enabled owner');
 db.prepare('UPDATE accounts SET owner=?,disabled=?,authorization_generation=authorization_generation+1,updated_at=? WHERE id=?').run(owner?1:0,disabled?1:0,time,accountId);
 db.prepare('UPDATE account_sessions SET revoked=1 WHERE account_id=?').run(accountId);
 db.prepare('UPDATE device_families SET revoked=1 WHERE account_id=?').run(accountId);
 db.prepare('DELETE FROM passkey_ceremonies WHERE account_id=? OR id IN (SELECT ceremony_id FROM passkey_login_targets WHERE account_id=?)').run(accountId,accountId);
 db.prepare('DELETE FROM account_recovery_codes WHERE account_id=? OR issuer_id=?').run(accountId,accountId);
 db.prepare('INSERT INTO account_events(account_id,actor_id,operation,occurred_at) VALUES(?,?,?,?)').run(accountId,actorId,'access-changed',time);
 return readAccount(accountId);
}
export const publicAccountAccess=account=>({accountId:account.id,owner:account.roles.includes('owner'),disabled:account.disabled,revision:account.authorizationGeneration});
