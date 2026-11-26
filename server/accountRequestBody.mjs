import {parseAccountPreferenceChange} from '../shared/accountPreferences.js';
export const ACCOUNT_BODY_LIMIT=8192;
export const PASSKEY_BODY_LIMIT=32768;
const passkeyKinds=['passkey-options','passkey-login-options','passkey-register','passkey-login','passkey-cancel','passkey-change'];
const failure=(status,code)=>Object.assign(new Error(code),{status,code});

// Private request boundary. Call only after transport/origin and network checks.
// No input or parser exception is included in errors or logs.
export async function readAccountRequestBody(req,kind,{timeoutMs=5000}={}) {
  if (!['create-account','access','login','setup','binding','preferences','recovery','recovery-issue',...passkeyKinds].includes(kind) || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>10000) throw new TypeError('Invalid account parser configuration');
  const limit=passkeyKinds.includes(kind)?PASSKEY_BODY_LIMIT:ACCOUNT_BODY_LIMIT;
  const type=req.headers['content-type'];
  if (typeof type!=='string' || !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(type)) throw failure(415,'UNSUPPORTED_ACCOUNT_BODY');
  if (req.headers['content-encoding']!==undefined && req.headers['content-encoding']!=='identity') throw failure(415,'UNSUPPORTED_ACCOUNT_BODY');
  const length=req.headers['content-length'];
  if (length!==undefined && (typeof length!=='string' || !/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw failure(400,'INVALID_ACCOUNT_BODY');
  if (length!==undefined && Number(length)>limit) throw failure(413,'ACCOUNT_BODY_TOO_LARGE');
  const bytes=await new Promise((resolve,reject)=>{
    let chunks=[],size=0,settled=false;
    const cleanup=()=>{
      clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('error',error);req.off('aborted',aborted);req.off('close',closed);
    };
    const finish=(problem)=>{
      if (settled) return;settled=true;cleanup();
      if (problem) {chunks=[];reject(problem);} else resolve(Buffer.concat(chunks,size));
    };
    const data=chunk=>{
      if (!Buffer.isBuffer(chunk)) {finish(failure(400,'INVALID_ACCOUNT_BODY'));req.destroy();return;}
      size+=chunk.length;
      if (size>limit) {finish(failure(413,'ACCOUNT_BODY_TOO_LARGE'));req.destroy();return;}
      chunks.push(chunk);
    };
    const end=()=>finish(length!==undefined && size!==Number(length)?failure(400,'INVALID_ACCOUNT_BODY'):null);
    const error=()=>finish(failure(400,'INVALID_ACCOUNT_BODY'));
    const aborted=()=>finish(failure(400,'INVALID_ACCOUNT_BODY'));
    const closed=()=>{if (!settled) aborted();};
    const timer=setTimeout(()=>{finish(failure(408,'ACCOUNT_BODY_TIMEOUT'));req.destroy();},timeoutMs);
    req.on('data',data);req.once('end',end);req.once('error',error);req.once('aborted',aborted);req.once('close',closed);
    if (req.destroyed || req.readableEnded) finish(failure(400,'INVALID_ACCOUNT_BODY'));
  });
  let value;
  try {value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch {throw failure(400,'INVALID_ACCOUNT_BODY');}
  if (!value || typeof value!=='object' || Array.isArray(value)) throw failure(400,'INVALID_ACCOUNT_BODY');
  if(kind==='create-account'){
    if(Object.keys(value).length!==3||!['username','displayName','password'].every(key=>Object.hasOwn(value,key)&&typeof value[key]==='string'&&value[key].isWellFormed()&&value[key].length>0)||Buffer.byteLength(value.username)>256||value.displayName.length>120||Buffer.byteLength(value.password)>1024)throw failure(400,'INVALID_ACCOUNT_BODY');
    return {username:value.username,displayName:value.displayName,password:value.password};
  }
  if(kind==='access'){
    if(Object.keys(value).length!==3||!Number.isSafeInteger(value.expectedGeneration)||value.expectedGeneration<1||typeof value.owner!=='boolean'||typeof value.disabled!=='boolean')throw failure(400,'INVALID_ACCOUNT_BODY');
    return {expectedGeneration:value.expectedGeneration,owner:value.owner,disabled:value.disabled};
  }
  if (kind==='recovery-issue') {
    if(Object.keys(value).length)throw failure(400,'INVALID_ACCOUNT_BODY');
    return {};
  }
  if (kind==='recovery') {
    if(Object.keys(value).length!==2 || typeof value.code!=='string' || !/^r1\.[A-Za-z0-9_-]{43}$/.test(value.code) ||
       typeof value.password!=='string' || !value.password.isWellFormed() || !value.password.length || Buffer.byteLength(value.password,'utf8')>1024)throw failure(400,'INVALID_ACCOUNT_BODY');
    return {code:value.code,password:value.password};
  }
  if (kind==='passkey-change') {
    const bad=()=>{throw failure(400,'INVALID_ACCOUNT_BODY');};
    if(Object.keys(value).some(key=>!['id','expectedRevision','label','remove'].includes(key)) || typeof value.id!=='string' || value.id.length>1400 || !/^[A-Za-z0-9_-]+$/.test(value.id) || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision<1)bad();
    if(value.remove===true){if(Object.hasOwn(value,'label'))bad();return {id:value.id,expectedRevision:value.expectedRevision,remove:true};}
    if(Object.hasOwn(value,'remove') || typeof value.label!=='string' || !value.label.trim() || value.label.length>120 || /[\u0000-\u001f\u007f]/.test(value.label))bad();
    return {id:value.id,expectedRevision:value.expectedRevision,label:value.label};
  }
  if (passkeyKinds.includes(kind)) {
    const invalid=()=>{throw failure(400,'INVALID_ACCOUNT_BODY');};
    const keys=kind==='passkey-options'?[]:kind==='passkey-login-options'?['username']:kind==='passkey-cancel'?['ceremonyId','purpose']:kind==='passkey-register'?['ceremonyId','response','label']:['ceremonyId','response','remember'];
    if (Object.keys(value).some(key=>!keys.includes(key))) invalid();
    if (kind==='passkey-options') return {};
    if (kind==='passkey-login-options') {
      if(!Object.hasOwn(value,'username'))return {};
      if(typeof value.username!=='string'||!value.username.isWellFormed()||!value.username.length||Buffer.byteLength(value.username,'utf8')>256)invalid();
      return {username:value.username};
    }
    if (typeof value.ceremonyId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.ceremonyId)) invalid();
    if (kind==='passkey-cancel') {
      if (!['register','login'].includes(value.purpose)) invalid();
      return {ceremonyId:value.ceremonyId,purpose:value.purpose};
    }
    if (!value.response || typeof value.response!=='object' || Array.isArray(value.response)) invalid();
    if (kind==='passkey-register') {
      if (typeof value.label!=='string' || !value.label.trim() || value.label.length>120 || /[\u0000-\u001f\u007f]/.test(value.label)) invalid();
      return {ceremonyId:value.ceremonyId,response:value.response,label:value.label};
    }
    if (Object.hasOwn(value,'remember') && typeof value.remember!=='boolean') invalid();
    return {ceremonyId:value.ceremonyId,response:value.response,remember:value.remember??false};
  }
  if (kind==='preferences') {
    try {
      const change=parseAccountPreferenceChange(value);
      // Keep omission information until the transactional writer can preserve
      // preferences that older clients do not know how to edit.
      if(!Object.hasOwn(value.preferences.playback,'gaplessAlbums'))delete change.preferences.playback.gaplessAlbums;
      if(!Object.hasOwn(value.preferences,'appearance'))delete change.preferences.appearance;
      if(!Object.hasOwn(value.preferences.library,'selectedFolders'))delete change.preferences.library.selectedFolders;
      return change;
    } catch {throw failure(400,'INVALID_ACCOUNT_BODY');}
  }
  if (kind==='binding') {
    if (Object.keys(value).length!==2 || !Object.hasOwn(value,'expectedRevision') || !Object.hasOwn(value,'credentialRef') ||
        !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision<0 || value.expectedRevision>=Number.MAX_SAFE_INTEGER ||
        value.credentialRef!==null && (typeof value.credentialRef!=='string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.credentialRef))) throw failure(400,'INVALID_ACCOUNT_BODY');
    return {expectedRevision:value.expectedRevision,credentialRef:value.credentialRef};
  }
  const required=kind==='login'?['username','password']:['setupToken','username','displayName','password'];
  const allowed=kind==='login'?[...required,'remember']:required;
  if (required.some(key=>!Object.hasOwn(value,key)) || Object.keys(value).some(key=>!allowed.includes(key))) throw failure(400,'INVALID_ACCOUNT_BODY');
  const bounded=(key,max)=>typeof value[key]==='string' && value[key].isWellFormed() && value[key].length>0 && value[key].length<=max && Buffer.byteLength(value[key],'utf8')<=max;
  if (!bounded('username',256) || !bounded('password',1024) ||
      kind==='setup' && (!bounded('setupToken',1024) || !bounded('displayName',480) || value.displayName.length>120) ||
      Object.hasOwn(value,'remember') && typeof value.remember!=='boolean') throw failure(400,'INVALID_ACCOUNT_BODY');
  return kind==='login'?{username:value.username,password:value.password,remember:value.remember??false}:
    {setupToken:value.setupToken,username:value.username,displayName:value.displayName,password:value.password};
}
