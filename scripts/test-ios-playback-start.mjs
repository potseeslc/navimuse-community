import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'navimuse-start-'));
try {
 const binary=join(directory,'controller'),wav=join(directory,'silence.wav');
 const data=Buffer.alloc(44+44100*2*3);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(44100,24);data.writeUInt32LE(88200,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);writeFileSync(wav,data);
 const sdk=execFileSync('xcrun',['--sdk','iphonesimulator','--show-sdk-path'],{encoding:'utf8'}).trim();
 const frameworks=['CoreGraphics','UIKit','WebKit','AVFoundation','AVKit','CarPlay','MediaPlayer','Network','CoreMedia','CoreFoundation'];
 execFileSync('xcrun',['clang','-fobjc-arc','-Werror','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,...frameworks.flatMap(f=>['-framework',f]),'test/fixtures/native-playback-start.m',...['access','store','downloads'].map(n=>`src-tauri/ios/offline-${n}.m`),'-o',binary],{stdio:'inherit'});
 execFileSync('xcrun',['simctl','spawn',process.argv[2]||'booted',binary,wav],{stdio:'inherit',timeout:30000});
}finally{rmSync(directory,{recursive:true,force:true});}
