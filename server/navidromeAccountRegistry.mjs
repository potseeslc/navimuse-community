import {createNavidromeClient} from './navidromeClient.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// entries and URL policy come exclusively from trusted server configuration.
// Never pass request bodies, client settings or provider claims to this factory.
export function createNavidromeAccountRegistry({entries,assertAllowedUrl}) {
  const records=new Map(),servers=new Map(),clients=[],connections=[];
  try {
    if (!Array.isArray(entries) || entries.length>256 || typeof assertAllowedUrl!=='function') throw new Error();
    for (const entry of entries) {
      const keys=['credentialRef','serverId','url','username','password'];
      if (!entry || typeof entry!=='object' || Object.keys(entry).some(key=>!keys.includes(key)&&key!=='label') || keys.some(key=>!Object.hasOwn(entry,key)) ||
          typeof entry.credentialRef!=='string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(entry.credentialRef) || records.has(entry.credentialRef) ||
          typeof entry.serverId!=='string' || !uuid.test(entry.serverId) || typeof entry.url!=='string' ||
          typeof entry.username!=='string' || !entry.username.isWellFormed() || !entry.username.trim() || entry.username!==entry.username.trim() ||
          Buffer.byteLength(entry.username)>256 || /[\u0000-\u001f\u007f]/.test(entry.username)) throw new Error();
      if (entry.label!==undefined && (typeof entry.label!=='string' || !entry.label.isWellFormed() || !entry.label.trim() ||
          entry.label!==entry.label.trim() || entry.label.length>120 || /[\u0000-\u001f\u007f]/.test(entry.label))) throw new Error();
      connections.push(Object.freeze({reference:entry.credentialRef,label:entry.label||entry.credentialRef}));
      const url=new URL(entry.url);assertAllowedUrl(url);
      const canonical=url.href.replace(/\/$/,'');
      if (servers.has(entry.serverId) && servers.get(entry.serverId)!==canonical) throw new Error();
      servers.set(entry.serverId,canonical);
      const {request}=createNavidromeClient(entry);
      const binding=Object.freeze({credentialRef:entry.credentialRef,serverId:entry.serverId,username:entry.username});
      records.set(entry.credentialRef,{binding,request});
      const personalizedCredentials=Object.freeze({url:canonical,username:entry.username,password:entry.password});
      clients.push(Object.freeze({...binding,request,withPersonalizedCredentials:operation=>operation(personalizedCredentials)}));
    }
  } catch {throw new Error('Invalid Navidrome account registry');}
  return Object.freeze({
    // Private input to createAccountUpstreamAccess, not a public settings payload.
    clients:Object.freeze(clients),
    // Explicit owner-only projection. Never return clients or request closures.
    listConnections:()=>connections.map(connection=>({...connection})),
    async bindingForCredential(reference) {
      const record=records.get(reference);if (!record) return null;
      let reader;
      try {
        const response=await record.request('/rest/ping.view',{}, {signal:AbortSignal.timeout(8000)});
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !response.body) {
          await response.body?.cancel();throw new Error();
        }
        reader=response.body.getReader();const chunks=[];let size=0;
        for (;;) {
          const {done,value}=await reader.read();if (done) break;
          size+=value.byteLength;if (size>16384) throw new Error();chunks.push(Buffer.from(value));
        }
        const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
        if (payload?.['subsonic-response']?.status!=='ok') throw new Error();
        return {...record.binding};
      } catch {throw new Error('Navidrome credential verification unavailable');}
      finally {if (reader) {try {await reader.cancel();} catch {}reader.releaseLock();}}
    },
  });
}
