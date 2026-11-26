import { Worker } from 'node:worker_threads';

// Internal async boundary. Authentication remains the caller's responsibility.
export async function openAccountStoreWorker(directory, { sessionPolicy } = {}) {
  const worker = new Worker(new URL('./accountStoreWorkerThread.mjs', import.meta.url), { workerData: { directory, sessionPolicy } });
  const pending = new Map();
  let nextId = 0, closing = false, closed = false;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const fail = (error) => {
    closed = true;
    readyReject(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.on('error', fail);
  worker.on('exit', () => fail(new Error('Account store worker closed')));
  worker.on('message', (message) => {
    if (message.ready) { readyResolve(); return; }
    if (message.startupError) { fail(new Error(message.startupError)); return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  });
  await ready;
  const call = (method, args) => {
    if (closed || closing && method !== 'close') return Promise.reject(new Error('Account store worker closed'));
    if (pending.size >= 64 && method !== 'close') return Promise.reject(new Error('Account store busy'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, method, args }); }
      catch (error) { pending.delete(id); reject(error); }
    });
  };
  let closePromise;
  return Object.freeze({
    getManagedAccessForSession:(...args)=>call('getManagedAccessForSession',args),
    setManagedAccessForSession:(...args)=>call('setManagedAccessForSession',args),
    listPasskeys: (...args) => call('listPasskeys', args),
    changePasskey: (...args) => call('changePasskey', args),
    issueRecoveryCodeForSession: (...args) => call('issueRecoveryCodeForSession', args),
    recoverPasswordWithCode: (...args) => call('recoverPasswordWithCode', args),
    preparePasskeyEnrollment: (...args) => call('preparePasskeyEnrollment', args),
    registerPasskey: (...args) => call('registerPasskey', args),
    getPasskeyCredential: (...args) => call('getPasskeyCredential', args),
    issuePasskeySession: (...args) => call('issuePasskeySession', args),
    createPasskeyCeremony: (...args) => call('createPasskeyCeremony', args),
    consumePasskeyCeremony: (...args) => call('consumePasskeyCeremony', args),
    consumePasswordLoginAttempt: (...args) => call('consumePasswordLoginAttempt', args),
    issuePasswordSession: (...args) => call('issuePasswordSession', args),
    readPreferencesForSession: (...args) => call('readPreferencesForSession', args),
    writePreferencesForSession: (...args) => call('writePreferencesForSession', args),
    listManagedAccountsForSession: (...args) => call('listManagedAccountsForSession', args),
    authenticateSession: (...args) => call('authenticateSession', args),
    getUpstreamBindingForSession: (...args) => call('getUpstreamBindingForSession', args),
    setUpstreamBindingForSession: (...args) => call('setUpstreamBindingForSession', args),
    authenticateUpstreamSession: (...args) => call('authenticateUpstreamSession', args),
    refreshDevice: (...args) => call('refreshDevice', args),
    logoutSession: (...args) => call('logoutSession', args),
    listDevices: (...args) => call('listDevices', args),
    revokeDevice: (...args) => call('revokeDevice', args),
    logoutEverywhere: (...args) => call('logoutEverywhere', args),
    getUpstreamBinding: (...args) => call('getUpstreamBinding', args),
    setUpstreamBinding: (...args) => call('setUpstreamBinding', args),
    hasAccounts: () => call('hasAccounts', []),
    getAccount: (...args) => call('getAccount', args),
    findByUsername: (...args) => call('findByUsername', args),
    createFirstOwner: (...args) => call('createFirstOwner', args),
    createListener: (...args) => call('createListener', args),
    createManagedListenerForSession: (...args) => call('createManagedListenerForSession', args),
    getPasswordCredential: (...args) => call('getPasswordCredential', args),
    replaceOwnPassword: (...args) => call('replaceOwnPassword', args),
    setAccess: (...args) => call('setAccess', args),
    createBackup: (...args) => call('createBackup', args),
    close() {
      if (!closePromise) {
        closing = true;
        closePromise = call('close', []).finally(() => worker.terminate());
      }
      return closePromise;
    },
  });
}
