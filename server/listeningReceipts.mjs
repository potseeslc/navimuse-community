import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

// Serialize per account. Receipts make retries after a lost HTTP response safe.
// As with other upstream writes, a process crash between upstream acknowledgement
// and the local receipt remains an unavoidable cross-service ambiguity.
export function createListeningReceipts(directory,{now=Date.now}={}) {
 const locks=new Map();
 return async function submit(scope,event,send) {
  if(typeof scope!=='string'||!scope||typeof event?.id!=='string'||!/^[a-f0-9-]{36}$/i.test(event.id)||typeof event.songId!=='string'||!event.songId||event.songId.length>512||!Number.isSafeInteger(event.time)||event.time<=0||event.time>now()+300000){const error=new Error('Invalid listening record');error.status=400;error.publicMessage=error.message;throw error;}
  const previous=locks.get(scope)||Promise.resolve();
  const work=previous.catch(()=>{}).then(async()=>{
   await mkdir(directory,{recursive:true,mode:0o700});
   const path=join(directory,createHash('sha256').update(scope).digest('hex')+'.json');
   let records=[];try{records=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(!Array.isArray(records))throw Error('Invalid listening receipt store');
   const prior=records.find(r=>r.id===event.id);
   if(prior){if(prior.songId!==event.songId||prior.time!==event.time){const e=Error('Listening record changed');e.status=409;throw e;}return {ok:true,id:event.id,duplicate:true};}
   await send(event);
   records.push({id:event.id,songId:event.songId,time:event.time});
   const temp=path+'.'+randomUUID()+'.tmp';
   await writeFile(temp,JSON.stringify(records.slice(-10000)),{mode:0o600});await rename(temp,path);
   return {ok:true,id:event.id};
  });
  locks.set(scope,work);try{return await work;}finally{if(locks.get(scope)===work)locks.delete(scope);}
 };
}
