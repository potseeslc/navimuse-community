// The scope is public identity, not a credential. Never import legacy keys into
// an account automatically: their ownership cannot be established.
export function createAccountStorage(scope, storage) {
  if (typeof scope !== 'string' || !/^queue-scope-v2:[a-f0-9]{64}$/.test(scope)) {
    throw new TypeError('Verified account scope required');
  }
  const prefix = `navimuse.account:${scope}:`;
  return Object.freeze({
    getItem: key => storage?.getItem(prefix + key) ?? null,
    setItem: (key, value) => {
      if (!storage) throw new Error('Account storage unavailable');
      storage.setItem(prefix + key, value);
    },
    removeItem: key => storage?.removeItem(prefix + key),
  });
}
