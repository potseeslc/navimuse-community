import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX='atr1';
export function createAtlasTrackRef({ rawId, projectionDigest }, key) {
  if(typeof rawId!=='string'||rawId.length<1||rawId.length>512||typeof projectionDigest!=='string'||!/^sha256:[0-9a-f]{64}$/.test(projectionDigest)||!Buffer.isBuffer(key)||key.length!==32)throw new TypeError('Invalid Atlas track reference input');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),plaintext=Buffer.from(JSON.stringify({v:1,r:rawId,p:projectionDigest})),encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return `${PREFIX}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
export function parseAtlasTrackRef(value,key) {
  if(typeof value!=='string'||value.length>1024||!Buffer.isBuffer(key)||key.length!==32)return null;const parts=value.split('.');if(parts.length!==4||parts[0]!==PREFIX)return null;
  try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(parts[1],'base64url'));decipher.setAuthTag(Buffer.from(parts[2],'base64url'));const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3],'base64url')),decipher.final()]).toString('utf8'));if(payload?.v!==1||typeof payload.r!=='string'||payload.r.length<1||payload.r.length>512||typeof payload.p!=='string'||!/^sha256:[0-9a-f]{64}$/.test(payload.p))return null;return Object.freeze({rawId:payload.r,projectionDigest:payload.p})}catch{return null}
}
