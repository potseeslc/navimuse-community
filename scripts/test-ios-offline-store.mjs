import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'navimuse-offline-store-'));
try {
 const binary=join(directory,'store');
 const sdk=execFileSync('xcrun',['--sdk','iphonesimulator','--show-sdk-path'],{encoding:'utf8'}).trim();
 execFileSync('xcrun',['clang','-fobjc-arc','-Werror','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,'-framework','Foundation','src-tauri/ios/offline-access.m','src-tauri/ios/offline-store.m','test/fixtures/native-offline-store.m','-o',binary],{stdio:'inherit'});
 execFileSync('xcrun',['simctl','spawn',process.argv[2]||'booted',binary,join(directory,'state')],{stdio:'inherit',timeout:30000});
}finally{rmSync(directory,{recursive:true,force:true});}
