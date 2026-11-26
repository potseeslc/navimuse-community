import {accountQueueScope} from './accountUpstreamBindings.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Private BFF registry. request functions are preconfigured server-owned clients,
// bound to the declared upstream server and username; never public configuration.
export function createAccountUpstreamAccess({store,queueSecret,clients}) {
  if (!Buffer.isBuffer(queueSecret) || queueSecret.length!==32 || !Array.isArray(clients) ||
      typeof store?.authenticateUpstreamSession!=='function' || typeof store?.getUpstreamBinding!=='function') throw new TypeError('Invalid upstream access configuration');
  const secret=Buffer.from(queueSecret),registry=new Map();
  for (const client of clients) {
    if (!client || typeof client!=='object' || typeof client.credentialRef!=='string' ||
        !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(client.credentialRef) || registry.has(client.credentialRef) ||
        typeof client.serverId!=='string' || !uuid.test(client.serverId) ||
        typeof client.username!=='string' || !client.username.isWellFormed() || !client.username.trim() ||
        client.username!==client.username.trim() || Buffer.byteLength(client.username)>256 || /[\u0000-\u001f\u007f]/.test(client.username) ||
        typeof client.request!=='function') throw new TypeError('Invalid upstream access configuration');
    registry.set(client.credentialRef,Object.freeze({serverId:client.serverId,username:client.username,request:client.request,withPersonalizedCredentials:client.withPersonalizedCredentials}));
  }
  const match=binding=>{
    const client=binding&&registry.get(binding.credentialRef);
    return client&&client.serverId===binding.serverId&&client.username===binding.username?client:null;
  };
  return Object.freeze({
    // Trusted account ID from the login/session projection only. A namespace is
    // public state, not a grant; it cannot be used to execute an upstream request.
    async queueScopeForAccount(accountId) {
      const {binding}=await store.getUpstreamBinding(accountId);
      return match(binding)?accountQueueScope(secret,accountId,binding):null;
    },
    // The principal is captured by the BFF at transfer time, never accepted from
    // a request body. Cookie expiry does not end a durable session, but account
    // generation and binding changes revoke all future background requests.
    async withPrincipal(principal,operation) {
      if (!principal || typeof operation!=='function') return {ok:false,code:'SIGN_IN_REQUIRED'};
      try {
        const account=await store.getAccount(principal.accountId);
        if (!account || account.disabled || account.authorizationGeneration!==principal.authorizationGeneration) return {ok:false,code:'SIGN_IN_REQUIRED'};
        const upstream=await store.getUpstreamBinding(account.id);
        const client=match(upstream.binding);
        if (!client || upstream.revision!==principal.bindingRevision || accountQueueScope(secret,account.id,upstream.binding)!==principal.queueScope) return {ok:false,code:'UPSTREAM_UNAVAILABLE'};
        return {ok:true,value:await operation(client.request)};
      } catch {return {ok:false,code:'UPSTREAM_UNAVAILABLE'};}
    },
    async withUpstream(sessionToken,operation) {
      if (typeof operation!=='function') throw new TypeError('Invalid upstream operation');
      let state;
      try {state=await store.authenticateUpstreamSession(sessionToken);} catch {return {ok:false,code:'ACCOUNT_UNAVAILABLE'};}
      if (!state) return {ok:false,code:'SIGN_IN_REQUIRED'};
      const binding=state.upstream.binding;
      if (!binding) return {ok:false,code:'UPSTREAM_UNASSIGNED'};
      const client=match(binding);
      if (!client) return {ok:false,code:'UPSTREAM_UNAVAILABLE'};
      // Authorization is the transaction snapshot. Revocation stops subsequent
      // requests; it cannot retract bytes from an already dispatched operation.
      const queueScope=accountQueueScope(secret,state.account.id,binding);
      try {return {ok:true,value:await operation(client.request,{accountId:state.account.id,authorizationGeneration:state.account.authorizationGeneration,queueScope,bindingRevision:state.upstream.revision,upstream:Object.freeze({serverId:binding.serverId,username:binding.username})},client.withPersonalizedCredentials)};}
      catch {return {ok:false,code:'UPSTREAM_UNAVAILABLE'};}
    },
  });
}
