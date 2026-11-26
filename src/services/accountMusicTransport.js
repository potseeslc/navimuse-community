import {apiFetch,apiRequestUrl} from './apiClient.js';

// Scope is the verified session's public queue namespace, never a credential.
// Capturing it per player prevents late work from switching to another account.
export function createAccountMusicTransport(scope) {
  if (typeof scope!=='string' || !/^queue-scope-v2:[a-f0-9]{64}$/.test(scope)) throw new TypeError('Verified music scope required');
  const scopedPath=path=>{
    if (typeof path!=='string' || !path.startsWith('/api/navidrome/')) throw new TypeError('Invalid account music path');
    const url=new URL(path,'http://navimuse.invalid');
    if (!url.pathname.startsWith('/api/navidrome/') || url.hash) throw new TypeError('Invalid account music path');
    url.searchParams.set('accountScope',scope);
    return url.pathname+url.search;
  };
  return Object.freeze({
    request:(path,init)=>apiFetch(scopedPath(path),init),
    mediaUrl:path=>apiRequestUrl(scopedPath(path)),
  });
}
