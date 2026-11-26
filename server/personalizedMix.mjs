import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';

// Only verified server-side identity can choose a cache. Persist tracks, never credentials.
export function createPersonalizedMixStore(directory,{now=Date.now}={}) {
 const pending=new Map();
 const path=scope=>join(directory,createHash('sha256').update(scope).digest('hex')+'.json');
 async function read(scope){
  try{const value=JSON.parse(await readFile(path(scope),'utf8'));return value.version===1&&Array.isArray(value.tracks)?value:null;}
  catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
 }
 return {read,async refresh(scope,generate){
  if(pending.has(scope))return pending.get(scope);
  if(pending.size>=8)throw new Error('Mix generation is busy. Try again shortly.');
  const work=(async()=>{
   const tracks=await generate();
   if(!tracks.length)return {mix:await read(scope),empty:true};
   const mix={version:1,generatedAt:now(),tracks};
   await mkdir(directory,{recursive:true,mode:0o700});const file=path(scope);
   await writeFile(file+'.tmp',JSON.stringify(mix),{mode:0o600});await rename(file+'.tmp',file);
   return {mix,empty:false};
  })();pending.set(scope,work);
  try{return await work;}finally{pending.delete(scope);}
 }};
}
