import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';

// The caller supplies a verified account/binding scope, never an arbitrary user ID.
export function createRadioFeedbackStore(directory){
 const file=scope=>{
  if(!/^queue-scope-v[12]:[a-f0-9]{64}$/.test(scope||''))throw Object.assign(Error('Verified account scope required'),{status:403});
  // Only a fixed-length hex digest becomes a filename; scope characters never enter the path.
  return join(directory,createHash('sha256').update(scope).digest('hex')+'.json');
 };
 const read=scope=>{
  const path=file(scope); // Keep invalid authorization separate from storage failures.
  try{
   const value=JSON.parse(readFileSync(path,'utf8'));
   if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Invalid stored feedback');
   return value;
  }catch(error){
   if(error.code==='ENOENT')return {};
   // The HTTP boundary catches and logs this without exposing scope, path or file contents.
   // Never turn corruption into an empty map: a subsequent write would erase saved feedback.
   throw Object.assign(Error('Station feedback storage unavailable',{cause:error}),{status:500,publicMessage:'Saved station feedback is temporarily unavailable.'});
  }
 };
 return {read,write(scope,id,feedback){
  if(typeof id!=='string'||!id.startsWith('radio:')||id.length<=6||id.length>256||typeof feedback?.favorite!=='boolean'||!Number.isInteger(feedback?.rating)||feedback.rating<0||feedback.rating>5)throw Object.assign(Error('Invalid station feedback'),{status:400,publicMessage:'Invalid station feedback'});
  const path=file(scope),current=read(scope);
  if(!Object.hasOwn(current,id)&&Object.keys(current).length>=500)throw Object.assign(Error('Station feedback limit reached'),{status:409,publicMessage:'Station feedback limit reached'});
  const value={favorite:feedback.favorite,rating:feedback.rating,updatedAt:Date.now()};
  current[id]=value;mkdirSync(directory,{recursive:true,mode:0o700});
  const temp=path+'.'+randomUUID()+'.tmp';
  try{writeFileSync(temp,JSON.stringify(current),{mode:0o600,flag:'wx'});renameSync(temp,path);}finally{try{unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return value;
 }};
}
