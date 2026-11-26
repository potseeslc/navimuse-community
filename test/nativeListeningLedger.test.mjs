import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
test('native listening persists qualified playback through WebView suspension and account changes',{skip:process.platform!=='darwin'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'nm-listening-'));try{const bin=join(dir,'test');execFileSync('xcrun',['clang','-fobjc-arc','-framework','Foundation','test/fixtures/native-listening-ledger.m','-o',bin]);execFileSync(bin);}finally{rmSync(dir,{recursive:true,force:true});}
});
