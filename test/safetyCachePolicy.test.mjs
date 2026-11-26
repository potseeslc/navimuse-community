import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

test('safety cache policy prioritizes buffer, uses hysteresis and rejects slow or stale recovery measurements', {skip:process.platform!=='darwin'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'navimuse-native-recovery-'));
 try {
  const binary=join(dir,'policy');
  execFileSync('xcrun',['clang','-fobjc-arc','-framework','Foundation',fileURLToPath(new URL('./fixtures/native-safety-cache-policy.m',import.meta.url)),'-o',binary]);
  execFileSync(binary);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
