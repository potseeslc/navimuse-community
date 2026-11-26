import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('compiled offline store preserves old downloads across the Navidrome ID transition',{skip:process.platform!=='darwin'},()=>{
  const directory=mkdtempSync(join(tmpdir(),'navimuse-id-transition-'));
  try {
    const binary=join(directory,'transition');
    execFileSync('xcrun',['clang','-fobjc-arc','-Werror','-framework','Foundation','src-tauri/ios/offline-access.m','src-tauri/ios/offline-store.m','test/fixtures/native-id-transition.m','-o',binary],{stdio:'inherit'});
    execFileSync(binary,[join(directory,'state')],{stdio:'inherit',timeout:30000});
  }finally{rmSync(directory,{recursive:true,force:true});}
});
