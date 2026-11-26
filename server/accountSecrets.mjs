import {constants,openSync,closeSync,fstatSync,lstatSync,readSync,writeFileSync,fsyncSync,linkSync,unlinkSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {join,isAbsolute} from 'node:path';

// Startup-only API. dataDir and allowCreate are trusted operator configuration,
// never request parameters. Missing secrets on an existing installation are fatal.
export function loadAccountSecrets({dataDir,allowCreate=false}={}) {
  let temporary;
  try {
    if (typeof dataDir!=='string' || !isAbsolute(dataDir) || typeof allowCreate!=='boolean') throw new Error();
    const directory=lstatSync(dataDir);
    const uid=process.getuid();
    if (!directory.isDirectory() || directory.uid!==uid || (directory.mode&0o022)!==0) throw new Error();
    const target=join(dataDir,'account-secrets-v1');
    const read=()=>{
      // NONBLOCK prevents opening an unexpected FIFO from hanging startup.
      const fd=openSync(target,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      try {
        const stat=fstatSync(fd);
        if (!stat.isFile() || stat.uid!==uid || (stat.mode&0o077)!==0 || stat.size!==64) throw new Error();
        const bytes=Buffer.alloc(65);
        if (readSync(fd,bytes,0,65,0)!==64) throw new Error();
        return {throttleSecret:Buffer.from(bytes.subarray(0,32)),queueSecret:Buffer.from(bytes.subarray(32,64))};
      } finally {closeSync(fd);}
    };
    try {return read();} catch(error) {if (error.code!=='ENOENT' || !allowCreate) throw error;}
    temporary=join(dataDir,`.account-secrets-${randomUUID()}`);
    const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try {writeFileSync(fd,randomBytes(64));fsyncSync(fd);} finally {closeSync(fd);}
    // Publish only a fully written file, without replacing another process's key.
    try {linkSync(temporary,target);} catch(error) {if (error.code!=='EEXIST') throw error;}
    unlinkSync(temporary);temporary=undefined;
    const dirFd=openSync(dataDir,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try {fsyncSync(dirFd);} finally {closeSync(dirFd);}
    return read();
  } catch {
    throw new Error('Account secrets unavailable');
  } finally {
    if (temporary) {try {unlinkSync(temporary);} catch {}}
  }
}
