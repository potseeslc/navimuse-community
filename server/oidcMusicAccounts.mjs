import {readFileSync,lstatSync} from 'node:fs';

// Deployment-owned mappings use the immutable OIDC subject, never email or name.
export function loadOidcMusicAccounts(file) {
 if(!file)return null;
 try {
  const readPrivate=path=>{const s=lstatSync(path);if(!s.isFile()||(s.mode&0o077)!==0||s.size>131072)throw Error();return readFileSync(path,'utf8');};
  const entries=JSON.parse(readPrivate(file));
  if(!Array.isArray(entries)||!entries.length||entries.length>256)throw Error();
  const records=new Map();let owners=0;
  for(const entry of entries){
   if(!entry||typeof entry.sub!=='string'||!entry.sub||entry.sub.length>256||records.has(entry.sub))throw Error();
   if(entry.owner===true){if(Object.keys(entry).some(k=>!['sub','owner'].includes(k)))throw Error();owners++;records.set(entry.sub,Object.freeze({owner:true}));continue;}
   if(Object.keys(entry).some(k=>!['sub','username','passwordFile'].includes(k))||typeof entry.username!=='string'||!entry.username.trim()||entry.username!==entry.username.trim()||typeof entry.passwordFile!=='string')throw Error();
   const password=readPrivate(entry.passwordFile).trim();if(password.length<16)throw Error();
   records.set(entry.sub,Object.freeze({owner:false,username:entry.username,password}));
  }
  if(owners!==1)throw Error();
  return Object.freeze({ownerSubject:[...records].find(([,entry])=>entry.owner)[0],get:sub=>records.get(sub)||null,entries:()=>[...records].map(([sub,record])=>({sub,...record}))});
 }catch{throw new Error('OIDC music account configuration is invalid');}
}
