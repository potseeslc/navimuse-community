export const sessionRequiredEvent = 'navimuse:session-required';

let documentAccountScope = null;
let offlineDocument = false;
export function enterOfflineDocument() { offlineDocument = true; }

export function initializeAccountMusicScope(scope) {
  if (typeof scope !== 'string' || !/^queue-scope-v2:[a-f0-9]{64}$/.test(scope)) throw new TypeError('Verified music scope required');
  if (documentAccountScope && documentAccountScope !== scope) return false;
  documentAccountScope = scope;
  return true;
}

const apiPathPattern = /^\/api(?:\/|$)/;

export function configuredBffOrigin() {
  const runtimeOrigin = typeof globalThis !== 'undefined' ? globalThis.__NAVIMUSE_BFF_ORIGIN__ : '';
  const viteOrigin = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_NAVIMUSE_BFF_ORIGIN : '';
  const origin = String(runtimeOrigin || viteOrigin || '').trim();
  if (!origin) return '';
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function apiRequestUrl(input) {
  if (typeof input !== 'string') return input;
  if (documentAccountScope && input.startsWith('/api/navidrome/')) {
    const url = new URL(input, 'http://navimuse.invalid');
    if (!url.pathname.startsWith('/api/navidrome/')) throw new TypeError('Invalid music path');
    const expected = url.searchParams.getAll('accountScope');
    if (expected.length && (expected.length !== 1 || expected[0] !== documentAccountScope)) throw new TypeError('Account scope mismatch');
    url.searchParams.set('accountScope', documentAccountScope);
    input = url.pathname + url.search + url.hash;
  }
  const origin = configuredBffOrigin();
  if (!origin || !apiPathPattern.test(input)) return input;
  return `${origin}${input}`;
}

export function apiNavigationUrl(path) {
  return apiRequestUrl(path || '/api/auth/login');
}

export function nativeFirstPartyBffRedirectTarget(location = globalThis.location) {
  const origin = configuredBffOrigin();
  if (!origin || location?.protocol !== 'tauri:') return '';
  return `${origin}${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
}

export function apiFetch(input, init) {
  if (offlineDocument) return Promise.reject(new Error('Reconnect to NaviMuse to use this feature.'));
  return fetch(apiRequestUrl(input), { credentials: 'include', ...(init || {}) }).then(async (response) => {
    const scopeChanged = response.status === 409 && (await response.clone().json().catch(() => null))?.code === 'ACCOUNT_SCOPE_CHANGED';
    if ((response.status === 401 || scopeChanged) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(sessionRequiredEvent));
    }
    return response;
  });
}

export async function apiJson(input, init, fallbackError = 'NaviMuse request failed.') {
  const response = await apiFetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || payload.message || fallbackError);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function jsonRequest(method, body, init = {}) {
  return {
    ...init,
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'NaviMuse', ...(init.headers || {}) },
    body: JSON.stringify(body)
  };
}
