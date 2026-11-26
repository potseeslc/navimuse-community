import {AsyncLocalStorage} from 'node:async_hooks';

// Server-only request context. Bind after authentication; no request parameter or
// global mutable credential object may select a client once the scope is bound.
export function createNavidromeRequestContext() {
  const storage=new AsyncLocalStorage();
  return Object.freeze({
    run(operation) {return storage.run({resolve:null},operation);},
    bind(resolve) {
      const scope=storage.getStore();
      if (!scope || scope.resolve || typeof resolve!=='function') throw new Error('Invalid Navidrome request context');
      scope.resolve=resolve;
    },
    client(legacyResolver) {
      const resolver=storage.getStore()?.resolve??legacyResolver;
      if (typeof resolver!=='function') throw new Error('Navidrome request context unavailable');
      return resolver();
    },
  });
}
