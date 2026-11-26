import { isIP } from 'node:net';
const REFRESH_PATH='/api/auth/v1/refresh';
const loopback=host=>['localhost','127.0.0.1','::1','[::1]','::ffff:127.0.0.1'].includes(host);
const validToken=(value,kind)=>typeof value==='string' && value.length===46 && value.startsWith(`${kind}.`) &&
  /^[A-Za-z0-9_-]{43}$/.test(value.slice(3)) && Buffer.from(value.slice(3),'base64url').toString('base64url')===value.slice(3);

// Trusted deployment configuration only. This is transport/CSRF protection, not
// authentication; every protected route must still verify its opaque session.
export function createAccountHttpBoundary({canonicalOrigin,developmentLoopback=false,trustedProxyPeers=[],nativeOrigins=[],proxyAddressHeader='x-forwarded-for'}) {
  const url=new URL(canonicalOrigin);
  if (url.username || url.password || url.pathname!=='/' || url.search || url.hash ||
      !['https:','http:'].includes(url.protocol)) throw new TypeError('Invalid account origin');
  const development=developmentLoopback===true && url.protocol==='http:' && loopback(url.hostname);
  if (url.protocol!=='https:' && !development) throw new TypeError('Account origin requires HTTPS');
  if (!Array.isArray(trustedProxyPeers) || trustedProxyPeers.some(peer=>typeof peer!=='string' || !isIP(peer))) throw new TypeError('Invalid proxy peers');
  if (!Array.isArray(nativeOrigins) || nativeOrigins.some(origin=>!['tauri://localhost','http://tauri.localhost','https://tauri.localhost'].includes(origin))) throw new TypeError('Invalid native origin');
  if (!['x-forwarded-for','cf-connecting-ip'].includes(proxyAddressHeader)) throw new TypeError('Invalid proxy address header');
  const proxies=new Set(trustedProxyPeers),origins=new Set([url.origin,...nativeOrigins]);
  const names=development ? {session:'navimuse_session_v1_dev',device:'navimuse_device_v1_dev',passkey:'navimuse_passkey_v1_dev'} :
    {session:'__Host-navimuse_session_v1',device:'__Secure-navimuse_device_v1',passkey:'__Host-navimuse_passkey_v1'};
  function allowedRequest(req,{write=false}={}) {
    if (req.headers.host!==url.host) return false;
    const peer=req.socket?.remoteAddress;
    if (development) {
      if (!loopback(peer)) return false;
    } else if (!req.socket?.encrypted && !(proxies.has(peer) && req.headers['x-forwarded-proto']==='https')) return false;
    if (req.headers.origin!==undefined && !origins.has(req.headers.origin)) return false;
    if (write && !['NaviMuse','NaviMuse-Server'].includes(req.headers['x-requested-with'])) return false;
    return true;
  }
  function cookie(kind,value,expiresAt,now=Date.now()) {
    if (!Object.hasOwn(names,kind)) throw new TypeError('Invalid cookie kind');
    if (value!=='' && !validToken(value,kind==='session'?'s1':kind==='device'?'d1':'p1')) throw new TypeError('Invalid account token');
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(expiresAt) || now<0 || expiresAt<0) throw new TypeError('Invalid cookie expiry');
    const maxAge=value===''?0:Math.max(0,Math.floor((expiresAt-now)/1000));
    return `${names[kind]}=${value}; Path=${kind==='device'?REFRESH_PATH:'/'}; Max-Age=${maxAge}; HttpOnly; SameSite=${kind==='passkey'?'Strict':'Lax'}${development?'':'; Secure'}`;
  }
  function networkAddress(req) {
    // Login is a write. Failed transport/CSRF checks never produce an identity.
    if (!allowedRequest(req,{write:true})) return null;
    const peer=req.socket?.remoteAddress;
    const validAddress=value=>typeof value==='string' && value.length<=45 && !value.includes('%') && isIP(value)!==0;
    if (!validAddress(peer)) return null;
    // Direct clients cannot influence their admission bucket through forwarding
    // headers. A trusted edge must supply the configured header with one verified IP;
    // appended chains, missing values and duplicate headers fail closed.
    if (!proxies.has(peer)) return peer;
    const forwarded=req.headers[proxyAddressHeader];
    if (!validAddress(forwarded)) return null;
    if (Array.isArray(req.rawHeaders)) {
      let count=0;
      for (let i=0;i<req.rawHeaders.length;i+=2) {
        if (req.rawHeaders[i].toLowerCase()===proxyAddressHeader) count+=1;
      }
      if (count!==1) return null;
    }
    return forwarded;
  }
  function readCookie(req,kind) {
    if (!Object.hasOwn(names,kind)) throw new TypeError('Invalid cookie kind');
    const header=req.headers.cookie;
    if (typeof header!=='string' || header.length>8192) return null;
    const matches=header.split(';').map(part=>part.trim()).filter(part=>part.split('=',1)[0]===names[kind]);
    if (matches.length!==1) return null;
    const value=matches[0].slice(names[kind].length+1);
    return validToken(value,kind==='session'?'s1':kind==='device'?'d1':'p1')?value:null;
  }
  return Object.freeze({allowedRequest,allowedPasskeyRequest:req=>req.headers.origin===url.origin && allowedRequest(req,{write:true}),networkAddress,cookie,readCookie,names:Object.freeze(names),
    clearCookies:()=>[cookie('session','',0,0),cookie('device','',0,0),cookie('passkey','',0,0)]});
}
