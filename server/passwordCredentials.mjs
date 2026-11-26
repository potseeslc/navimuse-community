import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { createPasswordScreener } from './passwordScreening.mjs';

import { PASSWORD_CREDENTIAL_VERSION, validPasswordCredential } from './passwordCredentialRecord.mjs';
export { PASSWORD_CREDENTIAL_VERSION } from './passwordCredentialRecord.mjs';
export const PASSWORD_HASH_OPTIONS = Object.freeze({ type: argon2.argon2id, version: 0x13,
  memoryCost: 65536, timeCost: 3, parallelism: 1, hashLength: 32 });
function boundedPassword(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
    value.isWellFormed() && Buffer.byteLength(value, 'utf8') <= 1024;
}
// Initialize once before accepting login requests. A missing/unsupported credential
// uses the same verification work factor; route throttling is still required.
export async function createPasswordService({ screenPassword = createPasswordScreener() } = {}) {
  const dummy = await argon2.hash(randomBytes(32), PASSWORD_HASH_OPTIONS);
  let active = 0;
  async function boundedWork(run) {
    if (active >= 2) {
      const error = new Error('Password service busy'); error.code = 'PASSWORD_BUSY'; throw error;
    }
    active += 1;
    try { return await run(); } finally { active -= 1; }
  }
  const service = {
    async enrollPassword(password) {
      const status = await screenPassword(password);
      if (status !== 'allowed') {
        const error = new Error(status === 'compromised' ? 'Choose a password not found in known breaches' : status === 'invalid' ? 'Invalid new password' : 'Password screening unavailable');
        error.code = status === 'compromised' ? 'PASSWORD_COMPROMISED' : status === 'invalid' ? 'PASSWORD_INVALID' : 'PASSWORD_SCREENING_UNAVAILABLE';
        throw error;
      }
      return service.hashPassword(password);
    },
    async hashPassword(password) {
      if (!boundedPassword(password) || [...password].length < 15) throw new TypeError('Invalid new password');
      // Low-level hashing for benchmark/migration. New enrollment uses enrollPassword.
      return boundedWork(async () => ({ version: PASSWORD_CREDENTIAL_VERSION,
        hash: await argon2.hash(password, PASSWORD_HASH_OPTIONS) }));
    },
    async verifyPassword(record, password) {
      if (!boundedPassword(password)) return false;
      const recognized = validPasswordCredential(record);
      return boundedWork(async () => {
        const matches = await argon2.verify(recognized ? record.hash : dummy, password);
        return recognized && matches;
      });
    },
  };
  return Object.freeze(service);
}
