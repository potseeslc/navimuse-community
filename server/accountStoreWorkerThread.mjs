import { parentPort, workerData } from 'node:worker_threads';
import { openAccountStore } from './accountStore.mjs';

const methods = new Set(['createManagedListenerForSession','getManagedAccessForSession','setManagedAccessForSession','issueRecoveryCodeForSession','recoverPasswordWithCode','listManagedAccountsForSession','listPasskeys','changePasskey','preparePasskeyEnrollment','registerPasskey','getPasskeyCredential','issuePasskeySession','createPasskeyCeremony','consumePasskeyCeremony','readPreferencesForSession','writePreferencesForSession','getUpstreamBinding','setUpstreamBinding','setUpstreamBindingForSession','getUpstreamBindingForSession','hasAccounts','consumePasswordLoginAttempt','issuePasswordSession','authenticateSession','authenticateUpstreamSession','refreshDevice','logoutSession','listDevices','revokeDevice','logoutEverywhere','getAccount','findByUsername','createFirstOwner','createListener','setAccess','getPasswordCredential','replaceOwnPassword','createBackup','close']);
try {
  const store = await openAccountStore(workerData.directory, { sessionPolicy: workerData.sessionPolicy });
  parentPort.on('message', ({ id, method, args }) => {
    try {
      if (!methods.has(method) || !Array.isArray(args)) throw new Error('Invalid account operation');
      const result = store[method](...args);
      parentPort.postMessage({ id, result });
      if (method === 'close') parentPort.close();
    } catch (error) { parentPort.postMessage({ id, error: error.message }); }
  });
  parentPort.postMessage({ ready: true });
} catch (error) {
  parentPort.postMessage({ startupError: error.message });
  parentPort.close();
}
