import {createAccountCreation} from './accountCreationService.mjs';
import {createAccountRecovery} from './accountRecoveryService.mjs';
import {createAccountAtlasAccess} from './accountAtlasAccess.mjs';
import {loadNavidromeRegistryFile} from './navidromeRegistryFile.mjs';
import {isAbsolute,join} from 'node:path';
import {mkdirSync,lstatSync} from 'node:fs';
import {loadAccountSecrets} from './accountSecrets.mjs';
import {openAccountStoreWorker} from './accountStoreWorker.mjs';
import {createPasswordService} from './passwordCredentials.mjs';
import {createAccountPasskeys} from './accountPasskeys.mjs';
import {createAccountPasswordLogin} from './accountPasswordLogin.mjs';
import {createAccountSetup} from './accountSetup.mjs';
import {createAccountHttpBoundary} from './accountHttpBoundary.mjs';
import {createAccountHttpRoutes} from './accountHttpRoutes.mjs';
import {createAccountUpstreamAccess} from './accountUpstreamAccess.mjs';
import {createNavidromeAccountRegistry} from './navidromeAccountRegistry.mjs';

// Trusted startup configuration only. The local implementation is explicit:
// OIDC/hybrid/passkey runtime adapters remain required before those modes ship.
export async function openLocalAccountRuntime({directory,initialize=false,legacyConfigured,boundaryOptions,
  navidromeEntries,navidromeRegistryFile,assertAllowedNavidromeUrl,verifySetupToken,passwordOptions,atlasDatasets=[],atlasMaxScopes=4,passkeyEnabled=false,passkeyUsernameFirstEnabled=false}={}) {
  let store;
  try {
    if (typeof passkeyUsernameFirstEnabled!=='boolean'||passkeyUsernameFirstEnabled&&!passkeyEnabled||typeof passkeyEnabled!=='boolean' || typeof directory!=='string' || !isAbsolute(directory) || typeof initialize!=='boolean' ||
        typeof legacyConfigured!=='boolean' || typeof verifySetupToken!=='function') throw new Error();
    const boundary=createAccountHttpBoundary(boundaryOptions);
    // Exactly one trusted source. A broken file must never fall back to shared
    // credentials or an empty registry, including during first initialization.
    if ((navidromeEntries===undefined)===(navidromeRegistryFile===undefined)) throw new Error();
    const entries=navidromeRegistryFile===undefined?navidromeEntries:loadNavidromeRegistryFile(navidromeRegistryFile);
    const registry=createNavidromeAccountRegistry({entries,assertAllowedUrl:assertAllowedNavidromeUrl});
    if (initialize) mkdirSync(directory,{recursive:true,mode:0o700});
    const stat=lstatSync(directory);
    if (!stat.isDirectory() || stat.uid!==process.getuid() || (stat.mode&0o077)!==0) throw new Error();
    let existing=false,database=false;
    for (const name of ['accounts.sqlite','accounts.sqlite-wal','accounts.sqlite-shm']) {
      try {lstatSync(join(directory,name));existing=true;if (name==='accounts.sqlite') database=true;} catch(error) {if (error.code!=='ENOENT') throw error;}
    }
    if (!database && (!initialize || existing)) throw new Error();
    const secrets=loadAccountSecrets({dataDir:directory,allowCreate:initialize&&!existing});
    store=await openAccountStoreWorker(directory);
    const passwords=await createPasswordService(passwordOptions);
    const access=createAccountUpstreamAccess({store,queueSecret:secrets.queueSecret,clients:registry.clients});
    const atlas=createAccountAtlasAccess({upstreamAccess:access,secret:secrets.queueSecret,datasets:atlasDatasets,maxScopes:atlasMaxScopes});
    const login=createAccountPasswordLogin({store,passwords,mode:'local',throttleSecret:secrets.throttleSecret});
    const setup=createAccountSetup({store,passwords,mode:'local',legacyConfigured,verifySetupToken,throttleSecret:secrets.throttleSecret});
    const passkeys=passkeyEnabled?createAccountPasskeys({store,canonicalOrigin:boundaryOptions.canonicalOrigin,rpID:new URL(boundaryOptions.canonicalOrigin).hostname,developmentLocalhost:boundaryOptions.developmentLoopback===true,throttleSecret:secrets.throttleSecret,usernameFirstEnabled:passkeyUsernameFirstEnabled}):null;
    const creation=createAccountCreation({store,passwords,mode:'local',throttleSecret:secrets.throttleSecret});
    const recovery=createAccountRecovery({store,passwords,mode:'local',throttleSecret:secrets.throttleSecret});
    const handleAccountRequest=createAccountHttpRoutes({boundary,store,login,setup,recovery,creation,mode:'local',
      methods:{password:true,passkey:passkeyEnabled,oidc:false},passkeys,legacyConfigured,queueScopeForAccount:access.queueScopeForAccount,bindingForCredential:registry.bindingForCredential,listMusicConnections:registry.listConnections});
    return Object.freeze({
      handleAccountRequest,
      withPrincipal:access.withPrincipal,
      async withUpstreamRequest(req,operation) {
        if (!boundary.allowedRequest(req,{write:!['GET','HEAD','OPTIONS'].includes(req.method)})) return {ok:false,code:'REQUEST_DENIED'};
        return access.withUpstream(boundary.readCookie(req,'session'),operation);
      },
      async withAtlasRequest(req,operation) {
        if (!boundary.allowedRequest(req,{write:!['GET','HEAD','OPTIONS'].includes(req.method)})) return {ok:false,code:'REQUEST_DENIED'};
        return atlas.withAtlas(boundary.readCookie(req,'session'),operation);
      },
      close:()=>store.close(),
    });
  } catch {
    if (store) {try {await store.close();} catch {}}
    throw new Error('Account runtime unavailable');
  }
}
