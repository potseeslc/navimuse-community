import {mkdir,readFile,open,rename,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

// Single-process stores only. A previous validated generation survives a torn
// write or invalid main file. Permission and I/O failures must never mean empty.
export async function openRecoverableJson(file,{initial,validate}){
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 const read=async path=>{
  let bytes;try{bytes=await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return {missing:true};throw e;}
  try{const value=JSON.parse(bytes);if(validate(value))return {value,bytes};}catch{}
  return {invalid:true};
 };
 const atomic=async(path,bytes)=>{
  const temp=path+'.tmp',handle=await open(temp,'w',0o600);
  try{await handle.chmod(0o600);await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  await rename(temp,path);const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
 };
 const main=await read(file);let value=main.value,bytes=main.bytes,recovery='clean';
 if(!bytes){
  const backup=await read(file+'.bak');
  for(const [path,state] of [[file,main],[file+'.bak',backup]])if(state.invalid){await chmod(path,0o600);await rename(path,path+'.corrupt-'+randomUUID());}
  if(backup.bytes){value=backup.value;bytes=backup.bytes;recovery='backup';await atomic(file,bytes);}
  else {value=structuredClone(initial);if(!validate(value))throw Error('Invalid store initial state');recovery=main.invalid||backup.invalid?'empty-after-corruption':'new';}
 }
 let tail=Promise.resolve();
 return {value,recovery,save(next){
  if(!validate(next))return Promise.reject(Error('Invalid state; refusing to persist'));
  const nextBytes=JSON.stringify(next);
  const task=tail.then(async()=>{if(bytes)await atomic(file+'.bak',bytes);await atomic(file,nextBytes);bytes=nextBytes;});
  tail=task.catch(()=>{});return task;
 }};
}
