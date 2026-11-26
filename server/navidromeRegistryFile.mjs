import {constants,openSync,closeSync,fstatSync,lstatSync,readSync} from 'node:fs';
import {isAbsolute,dirname} from 'node:path';

// Trusted startup path only; never accept this path or its contents from HTTP.
// Returns private configuration, not a public settings projection.
export function loadNavidromeRegistryFile(path) {
  let fd;
  try {
    if (typeof path!=='string' || !isAbsolute(path)) throw new Error();
    const uid=process.getuid(),parent=lstatSync(dirname(path));
    if (!parent.isDirectory() || parent.uid!==uid || (parent.mode&0o022)!==0) throw new Error();
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const before=fstatSync(fd),limit=1024*1024;
    if (!before.isFile() || before.uid!==uid || (before.mode&0o077)!==0 || before.size>limit) throw new Error();
    const bytes=Buffer.alloc(limit+1);let size=0;
    while (size<bytes.length) {
      const count=readSync(fd,bytes,size,bytes.length-size,size);
      if (!count) break;size+=count;
    }
    const after=fstatSync(fd);
    if (size>limit || size!==before.size || after.size!==before.size ||
        after.mtimeMs!==before.mtimeMs || after.ctimeMs!==before.ctimeMs) throw new Error();
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,size)));
    if (!value || Array.isArray(value) || Object.keys(value).length!==2 ||
        value.version!=='navimuse-navidrome-registry/v1' || !Array.isArray(value.entries) || value.entries.length>256) throw new Error();
    return value.entries;
  } catch {throw new Error('Navidrome registry file unavailable');}
  finally {if (fd!==undefined) closeSync(fd);}
}
