import {constants,openSync,closeSync,lstatSync,writeFileSync,fsyncSync,unlinkSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openAccountStore} from '../server/accountStore.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function privateDirectory(path){const stat=lstatSync(path);if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o077))throw new Error('Private directory required');}
// Local operator entry point only. No worker/RPC or HTTP route exposes this mode.
export async function prepareOwnerRecovery(args){
 const values={},keys=['--accounts-dir','--owner-id','--confirm-owner-id','--expected-generation','--output','--backup-dir'];
 if(!Array.isArray(args)||args.length!==keys.length*2)throw new Error('Invalid recovery arguments');
 for(let i=0;i<args.length;i+=2){if(!keys.includes(args[i])||Object.hasOwn(values,args[i]))throw new Error('Invalid recovery arguments');values[args[i]]=args[i+1];}
 if(!uuid.test(values['--owner-id'])||values['--owner-id']!==values['--confirm-owner-id']||!/^\d+$/.test(values['--expected-generation']))throw new Error('Explicit owner confirmation required');
 const generation=Number(values['--expected-generation']);if(!Number.isSafeInteger(generation)||generation<1)throw new Error('Invalid owner generation');
 for(const key of ['--accounts-dir','--output','--backup-dir'])if(!isAbsolute(values[key]))throw new Error('Absolute paths required');
 privateDirectory(values['--accounts-dir']);privateDirectory(dirname(values['--output']));privateDirectory(values['--backup-dir']);
 // Refuse symlinks/foreign-owned databases and never initialize a fresh account store.
 const database=lstatSync(values['--accounts-dir']+'/accounts.sqlite');
 if(!database.isFile()||database.uid!==process.getuid()||(database.mode&0o077))throw new Error('Private existing account database required');
 const {DatabaseSync}=await import('node:sqlite');
 const probe=new DatabaseSync(values['--accounts-dir']+'/accounts.sqlite',{readOnly:true,allowExtension:false});
 try{if(probe.prepare('PRAGMA user_version').get().user_version!==10)throw new Error('Upgrade and back up the account store before using recovery');}finally{probe.close();}
 let store,fd,created=false;
 try{
  fd=openSync(values['--output'],constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);created=true;
  store=await openAccountStore(values['--accounts-dir'],{deploymentRecovery:true});
  const backup=store.createBackup(values['--backup-dir']);
  const grant=store.issueDeploymentRecoveryCode(values['--owner-id'],generation);
  writeFileSync(fd,JSON.stringify({accountId:values['--owner-id'],...grant})+'\n');fsyncSync(fd);closeSync(fd);fd=undefined;
  const directory=openSync(dirname(values['--output']),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{fsyncSync(directory);}finally{closeSync(directory);}
  return {output:values['--output'],backup:backup.path,expiresAt:grant.expiresAt};
 }catch{
  if(fd!==undefined)closeSync(fd);
  if(created){try{unlinkSync(values['--output']);}catch{}}
  throw new Error('Owner recovery could not be prepared. Check the private paths, owner identity and generation; existing output files are never replaced.');
 }finally{store?.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await prepareOwnerRecovery(process.argv.slice(2))));}
 catch{console.error('Owner recovery failed. Required: --accounts-dir ABSOLUTE_PRIVATE_DIR --owner-id UUID --confirm-owner-id SAME_UUID --expected-generation INTEGER --output NEW_PRIVATE_FILE --backup-dir EXISTING_PRIVATE_DIR');process.exitCode=1;}
}
