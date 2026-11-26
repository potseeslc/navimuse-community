import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'navimuse-carplay-'));
try{const sdk=execFileSync('xcrun',['--sdk','iphonesimulator','--show-sdk-path'],{encoding:'utf8'}).trim(),bin=join(dir,'probe');
execFileSync('xcrun',['clang','-fobjc-arc','-Werror','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,'-framework','Foundation','-framework','UIKit','-framework','CarPlay','test/fixtures/native-carplay.m','-o',bin],{stdio:'inherit'});
execFileSync('xcrun',['simctl','spawn',process.argv[2]||'booted',bin],{stdio:'inherit',timeout:15000});}finally{rmSync(dir,{recursive:true,force:true});}
