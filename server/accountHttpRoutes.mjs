import {preferenceResponseForClient} from './accountPreferences.mjs';
import {parseAccountSession,ACCOUNT_SESSION_VERSION} from '../shared/accountSession.js';
import {readAccountRequestBody} from './accountRequestBody.mjs';

// A mountable HTTP handler. Authentication and approved upstream namespace
// resolution are server dependencies; request account IDs never establish either.
export function createAccountHttpRoutes({boundary,store,login,setup,mode,methods,legacyConfigured,queueScopeForAccount,bindingForCredential=null,passkeys=null,listMusicConnections=null,recovery=null,creation=null}) {
  if (typeof legacyConfigured!=='boolean' || typeof queueScopeForAccount!=='function' || bindingForCredential!==null && typeof bindingForCredential!=='function') throw new TypeError('Invalid account routes configuration');
  if (listMusicConnections!==null && typeof listMusicConnections!=='function') throw new TypeError('Invalid account catalogue configuration');
  const signedOut=state=>parseAccountSession({version:ACCOUNT_SESSION_VERSION,mode,state,methods,account:null,session:null,queueScope:null});
  signedOut('signed-out'); // Fail invalid mode/method configuration before serving.
  const project=async state=>{
    let queueScope=null;
    // Binding resolution is not authentication. Missing/unavailable mapping must
    // never consume a successful login or refresh without delivering its cookies.
    try {queueScope=await queueScopeForAccount(state.account.id);} catch {}
    return parseAccountSession({version:ACCOUNT_SESSION_VERSION,mode,state:'authenticated',methods,
      account:{id:state.account.id,username:state.account.username,displayName:state.account.displayName,roles:state.account.roles},
      session:state.session,queueScope});
  };
  const routes=new Map([['/admin/accounts','GET'],['/setup','POST'],['/password/login','POST'],['/session','GET'],['/refresh','POST'],['/logout','POST'],['/devices','GET'],['/logout-everywhere','POST']]);
  if (recovery) routes.set('/recovery','POST');
  if (creation) routes.set('/accounts','POST');
  if (listMusicConnections) routes.set('/admin/music-connections','GET');
  if (passkeys) {routes.set('/passkeys','GET');routes.set('/passkeys/change','POST');}
  if (passkeys) routes.set('/passkeys/policy','GET');
  if (passkeys) for (const path of ['/passkeys/register/options','/passkeys/register/verify','/passkeys/login/options','/passkeys/login/verify','/passkeys/cancel']) routes.set(path,'POST');
  return async function handleAccountRequest(req,res) {
    const path=new URL(req.url,'http://account.invalid').pathname;
    if (!path.startsWith('/api/auth/v1/')) return false;
    const route=path.slice('/api/auth/v1'.length);
    const deviceId=route.match(/^\/devices\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/)?.[1];
    const bindingId=bindingForCredential && route.match(/^\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/upstream-binding$/)?.[1];
    const recoveryId=recovery && route.match(/^\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/recovery-code$/)?.[1];
    const accessId=route.match(/^\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/access$/)?.[1];
    const allowedMethods=accessId?['GET','PUT']:recoveryId?['POST']:route==='/preferences'?['GET','PUT']:bindingId?['GET','PUT']:deviceId?['DELETE']:[routes.get(route)].filter(Boolean);
    const send=(status,body)=>{if (!res.destroyed) {res.writeHead(status);res.end(JSON.stringify(body));} return true;};
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    // Also bounds unread bodies on pre-parser rejection and bodyless operations.
    res.setHeader('Connection','close');res.setHeader('Vary','Origin');
    if (!boundary.allowedRequest(req,{write:!['GET','OPTIONS'].includes(req.method)})) return send(403,{ok:false,code:'REQUEST_DENIED'});
    if (req.headers.origin) {res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Credentials','true');}
    if (!allowedMethods.length) return send(404,{ok:false,code:'ACCOUNT_ROUTE_NOT_FOUND'});
    if (req.method==='OPTIONS') {
      const headers=req.headers['access-control-request-headers'];
      if (!req.headers.origin || !allowedMethods.includes(req.headers['access-control-request-method']) ||
          headers!==undefined && (typeof headers!=='string' || headers.length>256 || headers.split(',').some(value=>!['content-type','x-requested-with'].includes(value.trim().toLowerCase())))) return send(403,{ok:false,code:'REQUEST_DENIED'});
      res.setHeader('Access-Control-Allow-Methods',allowedMethods.join(', '));res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Requested-With');res.writeHead(204);res.end();return true;
    }
    if (!allowedMethods.includes(req.method)) {res.setHeader('Allow',allowedMethods.join(', '));return send(405,{ok:false,code:'METHOD_NOT_ALLOWED'});}
    const token=()=>boundary.readCookie(req,'session');
    const completeLogin=async issued=>{
      const response=await project(issued);
      const cookies=[boundary.cookie('session',issued.token,issued.session.expiresAt)];
      if (issued.deviceToken) {
        const device=(await store.listDevices(issued.token)).find(item=>item.current);
        if (!device) throw new Error('Device unavailable');
        cookies.push(boundary.cookie('device',issued.deviceToken,device.idleExpiresAt));
      } else cookies.push(boundary.cookie('device','',0));
      if (token()) await store.logoutSession(token());
      res.setHeader('Set-Cookie',cookies);return send(200,response);
    };
    try {
      if (recovery && (recoveryId || route==='/recovery')) {
        const networkAddress=boundary.networkAddress(req);
        if(!networkAddress)return send(403,{ok:false,code:'REQUEST_DENIED'});
        const payload=await readAccountRequestBody(req,recoveryId?'recovery-issue':'recovery');
        const result=recoveryId?await recovery.issue(recoveryId,{sessionToken:token(),networkAddress}):await recovery.redeem(payload,{networkAddress});
        if(result.ok) return recoveryId?send(201,{code:result.code,expiresAt:result.expiresAt}):send(200,{ok:true,next:'sign-in'});
        const statuses={SIGN_IN_REQUIRED:401,OWNER_REQUIRED:403,RECENT_AUTH_REQUIRED:403,RECOVERY_DISABLED:409,RECOVERY_THROTTLED:429,RECOVERY_UNAVAILABLE:503,PASSWORD_SCREENING_UNAVAILABLE:503,PASSWORD_INVALID:400,PASSWORD_COMPROMISED:400,RECOVERY_FAILED:400};
        const code=Object.hasOwn(statuses,result.code)?result.code:'RECOVERY_UNAVAILABLE';
        if(code==='RECOVERY_THROTTLED')res.setHeader('Retry-After','900');
        return send(statuses[code],{ok:false,code});
      }
      if (passkeys && (route==='/passkeys' || route==='/passkeys/change')) {
        if (!await store.authenticateSession(token())) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        try {
          if(route==='/passkeys')return send(200,{credentials:await store.listPasskeys(token())});
          const payload=await readAccountRequestBody(req,'passkey-change');
          return send(200,await store.changePasskey(token(),payload));
        }catch(error){
          const codes={'Recent authentication required':[403,'RECENT_AUTH_REQUIRED'],'Passkey changed':[409,'PASSKEY_CHANGED'],'Last recovery method':[409,'LAST_RECOVERY_METHOD'],'Passkey operation denied':[403,'PASSKEY_DENIED']};
          const known=codes[error.message];if(known)return send(known[0],{ok:false,code:known[1]});throw error;
        }
      }
      if (passkeys && route.startsWith('/passkeys/')) {
        // A native custom origin must use the canonical first-party ceremony flow.
        // It is never accepted as the WebAuthn relying-party origin here.
        if (!boundary.allowedPasskeyRequest(req)) return send(403,{ok:false,code:'REQUEST_DENIED'});
        if(route==='/passkeys/policy')return send(200,passkeys.policy());
        const networkAddress=boundary.networkAddress(req);
        if (!networkAddress) return send(403,{ok:false,code:'REQUEST_DENIED'});
        const options=route.endsWith('/options'),register=route.includes('/register/'),cancel=route==='/passkeys/cancel';
        const payload=await readAccountRequestBody(req,options?(register?'passkey-options':'passkey-login-options'):cancel?'passkey-cancel':register?'passkey-register':'passkey-login');
        const context={networkAddress,bindingToken:boundary.readCookie(req,'passkey'),sessionToken:token()};
        const result=cancel?await passkeys.cancel(payload,context):options?
          await (register?passkeys.registrationOptions(context):passkeys.authenticationOptions({...context,...payload})):
          await (register?passkeys.verifyRegistration(payload,context):passkeys.verifyAuthentication(payload,context));
        if (!result.ok) return send(401,{ok:false,code:'PASSKEY_FAILED'});
        if (cancel) return send(200,{ok:true});
        if (options) {
          res.setHeader('Set-Cookie',boundary.cookie('passkey',result.bindingToken,result.expiresAt));
          return send(200,result.public);
        }
        return register?send(201,result.public):await completeLogin(result.issued);
      }
      if(creation&&route==='/accounts'){
        const state=await store.authenticateSession(token());
        if(!state)return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        if(!state.account.roles.includes('owner'))return send(403,{ok:false,code:'OWNER_REQUIRED'});
        const result=await creation.create(await readAccountRequestBody(req,'create-account'),{sessionToken:token(),networkAddress:boundary.networkAddress(req)});
        if(result.ok)return send(201,{ok:true,account:result.account});
        const statuses={SIGN_IN_REQUIRED:401,OWNER_REQUIRED:403,RECENT_AUTH_REQUIRED:403,ACCOUNT_CREATION_DISABLED:409,ACCOUNT_CREATION_THROTTLED:429,ACCOUNT_CREATION_UNAVAILABLE:503,INVALID_ACCOUNT_CREATION:400,USERNAME_UNAVAILABLE:409,PASSWORD_INVALID:400,PASSWORD_COMPROMISED:400,PASSWORD_SCREENING_UNAVAILABLE:503};
        const code=Object.hasOwn(statuses,result.code)?result.code:'ACCOUNT_CREATION_UNAVAILABLE';
        if(code==='ACCOUNT_CREATION_THROTTLED')res.setHeader('Retry-After','900');
        return send(statuses[code],{ok:false,code});
      }
      if(accessId){
        const state=await store.authenticateSession(token());
        if(!state)return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        if(!state.account.roles.includes('owner'))return send(403,{ok:false,code:'OWNER_REQUIRED'});
        try{
          const access=req.method==='GET'?await store.getManagedAccessForSession(token(),accessId):await store.setManagedAccessForSession(token(),accessId,await readAccountRequestBody(req,'access'));
          return send(200,access);
        }catch(error){
          if(error.code==='INVALID_ACCOUNT_BODY'||error.status)throw error;
          const known={'Sign in required':[401,'SIGN_IN_REQUIRED'],'Owner access required':[403,'OWNER_REQUIRED'],'Recent authentication required':[403,'RECENT_AUTH_REQUIRED'],'Account operation denied':[403,'ACCOUNT_ACCESS_DENIED'],'Account access changed':[409,'ACCOUNT_ACCESS_CHANGED'],'Cannot remove the last enabled owner':[409,'LAST_OWNER_REQUIRED']};
          const [status,code]=known[error.message]||[503,'ACCOUNT_ACCESS_UNAVAILABLE'];return send(status,{ok:false,code});
        }
      }
      if (route==='/admin/music-connections') {
        const state=await store.authenticateSession(token());
        if (!state) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        if (!state.account.roles.includes('owner')) return send(403,{ok:false,code:'OWNER_REQUIRED'});
        const connections=await listMusicConnections();
        // The route owns its response projection, even for an injected provider.
        if (!Array.isArray(connections) || connections.length>256 || new Set(connections.map(item=>item?.reference)).size!==connections.length ||
            connections.some(item=>typeof item?.reference!=='string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(item.reference) ||
              typeof item.label!=='string' || !item.label.trim() || item.label!==item.label.trim() || item.label.length>120 ||
              !item.label.isWellFormed() || /[\u0000-\u001f\u007f]/.test(item.label))) throw new Error('Invalid connection catalogue');
        return send(200,{connections:connections.map(({reference,label})=>({reference,label}))});
      }
      if (route==='/admin/accounts') {
        const query=new URL(req.url,'http://account.invalid').searchParams;
        if ([...query.keys()].some(key=>!['after','limit'].includes(key)) ||
            query.getAll('after').length>1 || query.getAll('limit').length>1 ||
            query.has('after') && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(query.get('after')) ||
            query.has('limit') && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(query.get('limit')))
          return send(400,{ok:false,code:'INVALID_ACCOUNT_PAGE'});
        const result=await store.listManagedAccountsForSession(token(),{after:query.get('after')||'',limit:Number(query.get('limit')||50)});
        if (!result) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        return send(result.ok?200:403,result);
      }
      if (route==='/preferences') {
        const current=await store.readPreferencesForSession(token());
        if (!current) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        const expanded=req.headers['x-navimuse-preferences']==='3'?3:req.headers['x-navimuse-preferences']==='2';
        if (req.method==='GET') return send(200,preferenceResponseForClient(current,expanded));
        const change=await readAccountRequestBody(req,'preferences');
        const result=await store.writePreferencesForSession(token(),change);
        if (!result) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        return send(result.ok?200:409,preferenceResponseForClient(result,expanded || Object.hasOwn(change.preferences,'appearance')));
      }
      if (bindingId) {
        const state=await store.authenticateSession(token());
        if (!state) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        if (!state.account.roles.includes('owner')) return send(403,{ok:false,code:'OWNER_REQUIRED'});
        if (req.method==='GET') {
          const current=await store.getUpstreamBindingForSession(token(),bindingId);
          return send(200,{revision:current.revision,credentialRef:current.binding?.credentialRef??null});
        }
        const payload=await readAccountRequestBody(req,'binding');
        const binding=payload.credentialRef===null?null:await bindingForCredential(payload.credentialRef);
        if (payload.credentialRef!==null && (!binding || binding.credentialRef!==payload.credentialRef)) return send(400,{ok:false,code:'INVALID_UPSTREAM_CLIENT'});
        let result;
        try {result=await store.setUpstreamBindingForSession(token(),bindingId,{expectedRevision:payload.expectedRevision,binding});}
        catch(error) {
          if (error.message==='Recent authentication required') return send(403,{ok:false,code:'RECENT_AUTH_REQUIRED'});
          if (error.message==='Account operation denied') return send(403,{ok:false,code:'OWNER_REQUIRED'});
          if (error.message==='Upstream binding changed') return send(409,{ok:false,code:'UPSTREAM_BINDING_CHANGED'});
          throw error;
        }
        const reauthenticate=state.account.id===bindingId && result.revision!==payload.expectedRevision;
        if (reauthenticate) res.setHeader('Set-Cookie',boundary.clearCookies());
        return send(200,{ok:true,revision:result.revision,reauthenticate});
      }
      if (route==='/session') {
        const state=await store.authenticateSession(token());
        return send(200,state?await project(state):signedOut(await store.hasAccounts()?'signed-out':legacyConfigured?'migration-required':'setup-required'));
      }
      if (route==='/devices') {
        if (!await store.authenticateSession(token())) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        return send(200,{devices:await store.listDevices(token())});
      }
      if (route==='/setup' || route==='/password/login') {
        const networkAddress=boundary.networkAddress(req);
        if (!networkAddress) return send(403,{ok:false,code:'REQUEST_DENIED'});
        const payload=await readAccountRequestBody(req,route==='/setup'?'setup':'login');
        if (route==='/setup') {
          const result=await setup.setup(payload,{networkAddress});
          if (result.ok) return send(201,{ok:true,next:'sign-in'});
          const status=result.code==='SETUP_THROTTLED'?429:['MIGRATION_REQUIRED','SETUP_CLOSED','PASSWORD_SETUP_DISABLED'].includes(result.code)?409:result.code.includes('UNAVAILABLE')?503:400;
          if (status===429) res.setHeader('Retry-After','900');
          return send(status,{ok:false,code:result.code});
        }
        const result=await login.login(payload,{networkAddress});
        if (!result.ok) {
          const status=result.code==='LOGIN_THROTTLED'?429:result.code==='LOGIN_UNAVAILABLE'?503:result.code==='PASSWORD_LOGIN_DISABLED'?409:401;
          if (status===429) res.setHeader('Retry-After','900');
          return send(status,{ok:false,code:result.code});
        }
        return await completeLogin(result.issued);
      }
      if (req.headers['transfer-encoding']!==undefined || req.headers['content-length']!==undefined && req.headers['content-length']!=='0') return send(400,{ok:false,code:'UNEXPECTED_ACCOUNT_BODY'});
      if (route==='/logout') {
        await store.logoutSession(token());res.setHeader('Set-Cookie',boundary.clearCookies());return send(200,{ok:true});
      }
      if (route==='/logout-everywhere' || deviceId) {
        const state=await store.authenticateSession(token());
        if (!state) return send(401,{ok:false,code:'SIGN_IN_REQUIRED'});
        try {
          if (deviceId) await store.revokeDevice(token(),deviceId);
          else await store.logoutEverywhere(token());
        } catch(error) {
          if (error.message==='Recent authentication required') return send(403,{ok:false,code:'RECENT_AUTH_REQUIRED'});
          if (error.message==='Account operation denied') return send(403,{ok:false,code:'DEVICE_OPERATION_DENIED'});
          throw error;
        }
        if (!deviceId || state.session.deviceId===deviceId) res.setHeader('Set-Cookie',boundary.clearCookies());
        return send(200,{ok:true});
      }
      const issued=await store.refreshDevice(boundary.readCookie(req,'device'));
      // A losing request must not clear or replace the winning client's cookies.
      if (!issued) return send(409,{ok:false,code:'REFRESH_NOT_CURRENT',next:'recheck-session'});
      const response=await project(issued),device=(await store.listDevices(issued.token)).find(item=>item.current);
      if (!device) throw new Error('Device unavailable');
      res.setHeader('Set-Cookie',[boundary.cookie('session',issued.token,issued.session.expiresAt),boundary.cookie('device',issued.deviceToken,device.idleExpiresAt)]);
      return send(200,response);
    } catch(error) {
      // Keep parser codes only; never expose storage/provider exception messages.
      const known=['INVALID_ACCOUNT_BODY','UNSUPPORTED_ACCOUNT_BODY','ACCOUNT_BODY_TOO_LARGE','ACCOUNT_BODY_TIMEOUT'].includes(error.code);
      return send(known?error.status:503,{ok:false,code:known?error.code:'ACCOUNT_UNAVAILABLE'});
    }
  };
}
