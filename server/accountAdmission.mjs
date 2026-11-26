import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

function networkGroup(networkAddress) {
  if (typeof networkAddress !== 'string' || !isIP(networkAddress) || networkAddress.includes('%')) return null;
  // Canonicalize equivalent IPv6 spellings and IPv4-mapped addresses. IPv6
  // network admission uses /64 so rotating interface addresses cannot evade it.
  let network = networkAddress;
  if (isIP(network) === 6) {
    network = new URL(`http://[${network}]/`).hostname.slice(1, -1);
    if (network.startsWith('::ffff:')) {
      const words = network.slice(7).split(':');
      const value = words.map(word => parseInt(word, 16));
      network = `${value[0] >>> 8}.${value[0] & 255}.${value[1] >>> 8}.${value[1] & 255}`;
    } else {
      const [left, right = ''] = network.split('::');
      const first = left ? left.split(':') : [], last = right ? right.split(':') : [];
      network = [...first, ...Array(8 - first.length - last.length).fill('0'), ...last].slice(0, 4).map(word => parseInt(word, 16).toString(16)).join(':') + '::/64';
    }
  }
  return network;
}

export function createAccountAdmission(store, throttleSecret) {
  if (!Buffer.isBuffer(throttleSecret) || throttleSecret.length !== 32) throw new TypeError('Invalid admission secret');
  const secret = Buffer.from(throttleSecret);
  const digest = (kind, value) => createHmac('sha256', secret).update(`navimuse-login-v1:${kind}\0${value}`).digest('hex');
  return async (account, networkAddress) => {
    const network = networkGroup(networkAddress);
    if (network === null) return null;
    return store.consumePasswordLoginAttempt(digest('account', account), digest('network', network));
  };
}
