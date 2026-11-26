// Public BFF response contract only. This parser does not verify credentials,
// authorize requests, or turn client-supplied account/queue IDs into authority.
export const ACCOUNT_SESSION_VERSION = 'navimuse-account/v1';
export const ACCOUNT_MODES = Object.freeze(['local', 'oidc', 'hybrid']);
export const ACCOUNT_SESSION_STATES = Object.freeze(['setup-required', 'migration-required', 'signed-out', 'authenticated']);

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const username = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const queueScope = /^queue-scope-v2:[0-9a-f]{64}$/;
const invalid = () => { throw new TypeError('Invalid account session response'); };

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
}

function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}

export function normalizeLocalUsername(value) {
  if (typeof value !== 'string' || value.length > 256) throw new TypeError('Invalid username');
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!username.test(normalized)) throw new TypeError('Invalid username');
  return normalized;
}

export function parseAccountSession(value) {
  exactObject(value, ['version', 'mode', 'state', 'methods', 'account', 'session', 'queueScope']);
  if (value.version !== ACCOUNT_SESSION_VERSION || !ACCOUNT_MODES.includes(value.mode) || !ACCOUNT_SESSION_STATES.includes(value.state)) invalid();
  exactObject(value.methods, ['password', 'passkey', 'oidc']);
  if (Object.values(value.methods).some(method => typeof method !== 'boolean')) invalid();
  if (value.mode === 'local' && value.methods.oidc || value.mode === 'oidc' && value.methods.password) invalid();
  const methods = {password:value.methods.password, passkey:value.methods.passkey, oidc:value.methods.oidc};
  if (value.state !== 'authenticated') {
    if (value.account !== null || value.session !== null || value.queueScope !== null) invalid();
    return {version:ACCOUNT_SESSION_VERSION, mode:value.mode, state:value.state, methods, account:null, session:null, queueScope:null};
  }
  exactObject(value.account, ['id', 'username', 'displayName', 'roles']);
  const account = value.account;
  if (typeof account.id !== 'string' || !uuid.test(account.id)) invalid();
  if (account.username !== null && (typeof account.username !== 'string' || !username.test(account.username))) invalid();
  if (!Array.isArray(account.roles) || !account.roles.length || account.roles.length > 2 || new Set(account.roles).size !== account.roles.length || account.roles.some(role => !['owner', 'listener'].includes(role))) invalid();
  exactObject(value.session, ['authenticatedAt', 'expiresAt', 'deviceId']);
  const session = value.session;
  if (!Number.isSafeInteger(session.authenticatedAt) || session.authenticatedAt < 0 || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= session.authenticatedAt) invalid();
  if (session.deviceId !== null && (typeof session.deviceId !== 'string' || !uuid.test(session.deviceId))) invalid();
  // Authentication survives an unassigned/unavailable music binding. Null grants
  // no queue namespace; callers must not synthesize a fallback or log out.
  if (value.queueScope !== null && (typeof value.queueScope !== 'string' || !queueScope.test(value.queueScope))) invalid();
  return {
    version:ACCOUNT_SESSION_VERSION, mode:value.mode, state:value.state, methods,
    account:{id:account.id, username:account.username, displayName:text(account.displayName,120), roles:[...account.roles]},
    session:{authenticatedAt:session.authenticatedAt, expiresAt:session.expiresAt, deviceId:session.deviceId},
    queueScope:value.queueScope,
  };
}
