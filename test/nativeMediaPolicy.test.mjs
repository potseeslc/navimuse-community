import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

test('compiled native artwork policy admits BFF station art and rejects other destinations', {skip:process.platform!=='darwin'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'navimuse-native-art-'));
 try {
  const binary=join(dir,'policy');
  execFileSync('xcrun',['clang','-fobjc-arc','-framework','Foundation',fileURLToPath(new URL('./fixtures/native-media-policy.m',import.meta.url)),'-o',binary]);
  execFileSync(binary);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
