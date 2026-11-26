import { createHash } from 'node:crypto';

// BFF-only, enrollment-time policy. Never call while a password is being typed.
export function createPasswordScreener({ fetchImpl = globalThis.fetch } = {}) {
  let active = 0;
  return async (password, { signal } = {}) => {
    if (typeof password !== 'string' || password.length > 1024 || !password.isWellFormed() ||
        [...password].length < 15 || Buffer.byteLength(password,'utf8') > 1024) return 'invalid';
    if (active >= 2) return 'unavailable';
    active += 1;
    let reader;
    try {
      const digest = createHash('sha1').update(password,'utf8').digest('hex').toUpperCase();
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
      requestSignal.throwIfAborted();
      const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${digest.slice(0,5)}`, {
        method:'GET', redirect:'error', signal:requestSignal,
        headers:{'Add-Padding':'true','User-Agent':'NaviMuse-password-screening','Accept':'text/plain'},
      });
      if (response.status !== 200 || !response.body) {
        await response.body?.cancel();
        return 'unavailable';
      }
      reader = response.body.getReader();
      const chunks=[];let size=0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 131072) { await reader.cancel(); return 'unavailable'; }
        chunks.push(value);
      }
      const text = new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)).trim();
      if (!text) return 'unavailable';
      let compromised = false;
      for (const line of text.split(/\r?\n/)) {
        const match = /^([0-9A-F]{35}):([0-9]{1,12})$/.exec(line);
        if (!match) return 'unavailable';
        if (match[1] === digest.slice(5) && Number(match[2]) > 0) compromised = true;
      }
      requestSignal.throwIfAborted();
      return compromised ? 'compromised' : 'allowed';
    } catch { return 'unavailable'; }
    finally { reader?.releaseLock(); active -= 1; }
  };
}
