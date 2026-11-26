export const PASSWORD_CREDENTIAL_VERSION = 'argon2id-v1';
const encodedPattern = /^\$argon2id\$v=19\$m=65536,p=1,t=3\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;

export function validPasswordCredential(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).length !== 2 || !Object.hasOwn(record, 'version') ||
      !Object.hasOwn(record, 'hash') || record.version !== PASSWORD_CREDENTIAL_VERSION ||
      typeof record.hash !== 'string') return false;
  const parts = encodedPattern.exec(record.hash);
  return Boolean(parts && parts.slice(1).every(part => Buffer.from(part,'base64').toString('base64').replace(/=+$/,'') === part));
}

