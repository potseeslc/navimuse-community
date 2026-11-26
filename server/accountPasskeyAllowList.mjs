import {createHmac} from 'node:crypto';

// Mitigation, not a guarantee of indistinguishability: authenticators control the
// lengths/formats of real IDs. Never describe this as eliminating enumeration.
// Stable imaginary entries prevent repeat requests from revealing real entries
// through intersection; fixed count and omitted transports remove simple signals.
export function createUsernamePasskeyAllowList(secret){
 if(!Buffer.isBuffer(secret)||secret.length!==32)throw new TypeError('Invalid passkey privacy secret');
 const key=Buffer.from(secret),digest=(kind,username,value)=>createHmac('sha256',key).update(`navimuse-passkey-allow-list-v1:${kind}\0${username}\0${value}`).digest();
 return (username,credentials)=>{
  if(typeof username!=='string'||!Array.isArray(credentials)||credentials.length>20)throw new TypeError('Invalid passkey allow list');
  const ids=new Set(credentials.map(c=>c.id));
  for(let slot=0;ids.size<20;slot++)ids.add(digest('imaginary',username,String(slot)).toString('base64url'));
  return [...ids].sort((a,b)=>Buffer.compare(digest('order',username,a),digest('order',username,b))).map(id=>({type:'public-key',id}));
 };
}
