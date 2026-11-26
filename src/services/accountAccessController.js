import {forgetOfflineAccess,reconcileOfflineAccount} from '../offlineDownloads.js';
// UI state only. Credentials and authorization remain in the account service/BFF.
export function createAccountAccessController(client) {
  let state=Object.freeze({session:null,busy:false,errorCode:null}),generation=0,active=true,checking=null;
  const listeners=new Set();
  let unsubscribe=null;
  const publish=value=>{state=Object.freeze(value);for(const listener of listeners)listener();};
  async function run(operation) {
    if (!active) return false;
    const own=++generation;publish({...state,busy:true,errorCode:null});
    try {
      const session=await operation();
      if (!active || own!==generation) return false;
      await reconcileOfflineAccount(session.state==='authenticated'?session.queueScope:null);
      if (!active || own!==generation) return false;
      publish({session,busy:false,errorCode:null});return true;
    } catch(error) {
      if (active && own===generation) publish({...state,busy:false,errorCode:error.code||'ACCOUNT_UNAVAILABLE'});
      return false;
    }
  }
  function check() {
    if (checking) return checking;
    const previous=state.session;
    const task=run(async()=>{
      const read=await client.readSession();
      if (read.state!=='signed-out') return read;
      try {return await client.renew();}
      catch(error) {
        // A fresh visitor with no remembered session can sign in. Never apply
        // this fallback to an already-mounted authenticated listening session.
        if (error.code==='SESSION_RECHECK_REQUIRED' && previous?.state!=='authenticated') return read;
        throw error;
      }
    });
    checking=task;void task.finally(()=>{if(checking===task)checking=null;});return task;
  }
  return Object.freeze({
    getSnapshot:()=>state,
    subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    activate:()=>{active=true;if(!unsubscribe)unsubscribe=client.subscribeSessionChanges?.(()=>{void run(()=>client.readSession());})||null;},
    dispose:()=>{client.cancelPasskey?.();active=false;generation++;checking=null;unsubscribe?.();unsubscribe=null;},
    check,
    loginPasskey:fields=>run(()=>client.loginPasskey(fields)),
    login:fields=>run(()=>client.login(fields)),
    setup:fields=>run(async()=>{await client.setup(fields);return client.readSession();}),
    logout:()=>run(async()=>{await forgetOfflineAccess();await client.logout();return client.readSession();}),
  });
}
