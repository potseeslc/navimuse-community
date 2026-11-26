import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'navimuse-navigation-'));
try {
 const binary=join(directory,'controller');
 const sdk=execFileSync('xcrun',['--sdk','iphonesimulator','--show-sdk-path'],{encoding:'utf8'}).trim();
 const frameworks=['CoreGraphics','UIKit','WebKit','AVFoundation','AVKit','CarPlay','MediaPlayer','Network','CoreMedia','CoreFoundation'];
 execFileSync('xcrun',['clang','-fobjc-arc','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,...frameworks.flatMap(f=>['-framework',f]),'test/fixtures/native-navigation-recovery.m',...['access','store','downloads'].map(n=>`src-tauri/ios/offline-${n}.m`),'-o',binary],{stdio:'inherit'});
 execFileSync('xcrun',['simctl','spawn',process.argv[2]||'booted',binary],{stdio:'inherit',timeout:15000});
}finally{rmSync(directory,{recursive:true,force:true});}
