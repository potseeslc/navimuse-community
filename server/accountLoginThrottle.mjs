// Internal durable admission gate; keys are deployment-keyed HMACs, never raw
// usernames or addresses. All writers must use this same database and policy.
export const LOGIN_THROTTLE = Object.freeze({ account: 5, network: 30, global: 100,
  accountWindowMs: 900_000, networkWindowMs: 60_000, globalWindowMs: 60_000, maxRows: 4096 });

export function initializeLoginThrottle(db) {
  db.exec(`CREATE TABLE login_throttle (
    bucket_key TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER NOT NULL CHECK(attempts > 0),
    expires_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX login_throttle_expiry ON login_throttle(expires_at);
  PRAGMA user_version=4;`);
}

export function loginThrottleOperations(db, transaction, now) {
  return {
    consumePasswordLoginAttempt(accountKey, networkKey) {
      if (![accountKey, networkKey].every(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key))) {
        throw new TypeError('Invalid login throttle key');
      }
      return transaction(() => {
        const time = now();
        if (!Number.isSafeInteger(time) || time < 0 || time > Number.MAX_SAFE_INTEGER - LOGIN_THROTTLE.accountWindowMs) throw new Error('Invalid login clock');
        db.prepare('DELETE FROM login_throttle WHERE expires_at<=?').run(time);
        const take = (key, limit, lifetime) => {
          const row = db.prepare('SELECT attempts FROM login_throttle WHERE bucket_key=?').get(key);
          if (row) {
            if (row.attempts >= limit) return false;
            db.prepare('UPDATE login_throttle SET attempts=attempts+1 WHERE bucket_key=?').run(key);
          } else {
            if (db.prepare('SELECT COUNT(*) AS count FROM login_throttle').get().count >= LOGIN_THROTTLE.maxRows) return false;
            db.prepare('INSERT INTO login_throttle VALUES(?,1,?)').run(key, time + lifetime);
          }
          return true;
        };
        // Denied account attempts still spend network/global admission. Do not
        // create attacker-selected buckets after the broader gates are exhausted.
        if (!take('global', LOGIN_THROTTLE.global, LOGIN_THROTTLE.globalWindowMs)) return false;
        if (!take(`network:${networkKey}`, LOGIN_THROTTLE.network, LOGIN_THROTTLE.networkWindowMs)) return false;
        return take(`account:${accountKey}`, LOGIN_THROTTLE.account, LOGIN_THROTTLE.accountWindowMs);
      });
    },
  };
}
