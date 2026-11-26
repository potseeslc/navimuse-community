export const offlineAccessVersion='navimuse-offline/v1';
export const offlineAccessDays=30;
// This public scope is identity only. The route must authenticate first; the
// native client must obtain this directly from the trusted BFF, not JavaScript.
export function offlineAccessSnapshot(scope,now=Date.now()) {
  if(typeof scope!=='string'||!/^queue-scope-v[12]:[a-f0-9]{64}$/.test(scope)||!Number.isSafeInteger(now)||now<0)throw new TypeError('Verified offline scope required');
  return {version:offlineAccessVersion,scope,issuedAt:now,expiresAt:now+offlineAccessDays*86400000};
}
