import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

test('native checkpoint survives restart and enforces account, URL and expiry boundaries', {skip:process.platform!=='darwin'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'navimuse-native-recovery-'));
 try {
  const binary=join(dir,'policy');
  execFileSync('xcrun',['clang','-fobjc-arc','-framework','Foundation',fileURLToPath(new URL('./fixtures/native-playback-checkpoint.m',import.meta.url)),'-o',binary]);
  execFileSync(binary);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
