import { createAccountAdmission } from './accountAdmission.mjs';
import { normalizeLocalUsername, ACCOUNT_MODES } from '../shared/accountSession.js';

// Internal orchestration only. The HTTP adapter must enforce the request boundary,
// body size and configured proxy identity before calling this service. No request
// header is accepted here as a network identity; the adapter supplies a verified IP.
export function createAccountPasswordLogin({ store, passwords, mode, throttleSecret }) {
  if (!ACCOUNT_MODES.includes(mode) || !Buffer.isBuffer(throttleSecret) || throttleSecret.length !== 32) throw new TypeError('Invalid password login configuration');
  const admit = createAccountAdmission(store, throttleSecret);
  const invalid = () => ({ ok: false, code: 'INVALID_CREDENTIALS' });
  return Object.freeze({
    async login({ username, password, remember = false } = {}, { networkAddress } = {}) {
      if (mode === 'oidc') return { ok: false, code: 'PASSWORD_LOGIN_DISABLED' };
      let canonical = null;
      try { canonical = normalizeLocalUsername(username); } catch {}
      try {
        const admitted = await admit(canonical ?? '<invalid>', networkAddress);
        if (admitted === null) return { ok: false, code: 'LOGIN_UNAVAILABLE' };
        if (!admitted) return { ok: false, code: 'LOGIN_THROTTLED' };
        const account = canonical ? await store.findByUsername(canonical) : null;
        const saved = account ? await store.getPasswordCredential(account.id) : null;
        const matches = await passwords.verifyPassword(saved?.credential ?? null, password);
        if (!matches || !account || account.disabled || !saved || typeof remember !== 'boolean') return invalid();
        const issued = await store.issuePasswordSession(account.id, {
          expectedGeneration: account.authorizationGeneration, expectedRevision: saved.revision, remember,
        });
        // Internal bearer result for cookie serialization only, never a JSON body.
        return { ok: true, issued };
      } catch (error) {
        if (error.code === 'PASSWORD_BUSY') return { ok: false, code: 'LOGIN_UNAVAILABLE' };
        // A concurrent disable/password update denies issuance without leaking its
        // cause. Storage failures also fail closed and expose no database details.
        return invalid();
      }
    },
  });
}
