import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output='/tmp/navimuse-offline-startup',app=join(output,'OfflineStartup.app'),id='com.developer.navimuse.offlinestartupfixture';mkdirSync(app,{recursive:true});
execFileSync(process.execPath,['scripts/build-ios-offline-shell.mjs'],{stdio:'inherit'});
copyFileSync('.scratch/ios-offline-shell.html',join(app,'fixture.html'));copyFileSync('src-tauri/ios/track-controls.js',join(app,'track-controls.js'));
const wav=Buffer.alloc(44+44100*2*12);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);writeFileSync(join(app,'silence.wav'),wav);
writeFileSync(join(app,'Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleName</key><string>Offline startup fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0</string><key>MinimumOSVersion</key><string>17.0</string><key>LSRequiresIPhoneOS</key><true/><key>UILaunchScreen</key><dict/></dict></plist>`);
const sdk=execFileSync('xcrun',['--sdk','iphonesimulator','--show-sdk-path'],{encoding:'utf8'}).trim();
execFileSync('xcrun',['clang','-fobjc-arc','-Werror','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,...['Foundation','CoreGraphics','AVFoundation','CoreMedia','UIKit','WebKit','CarPlay','MediaPlayer','AVKit','Network'].flatMap(n=>['-framework',n]),...['access','store','downloads'].map(n=>`src-tauri/ios/offline-${n}.m`),'scripts/ios-offline-startup-harness.m','-o',join(app,'Fixture')],{stdio:'inherit'});
execFileSync('codesign',['--force','--sign','-',app],{stdio:'inherit'});execFileSync('xcrun',['simctl','install','booted',app]);
const data=execFileSync('xcrun',['simctl','get_app_container','booted',id,'data'],{encoding:'utf8'}).trim(),file=join(data,'Documents/startup.json');
const evidence='docs/evidence/m8/offline-downloads/startup';mkdirSync(evidence,{recursive:true});
try{
 for(const [name,args,blocked] of [['seed-local',['seed','local'],false],['cold-local',[],false],['shared-player',['exercise'],false],['set-remote',['remote'],true],['cold-remote',[],true]]){
  try{execFileSync('xcrun',['simctl','terminate','booted',id],{stdio:'ignore'});}catch{}
  const start=Date.now();execFileSync('xcrun',['simctl','launch','booted',id,...args]);
  for(let i=0;i<450;i++){if(existsSync(file)&&statSync(file).mtimeMs>=start)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(existsSync(file)&&statSync(file).mtimeMs>=start,'fresh startup evidence');
  const result=JSON.parse(readFileSync(file,'utf8'));assert.equal(result.checks.downloadsReady,true,'downloaded list becomes ready within the bounded startup wait');assert.ok(result.text.includes('Saved cold-one'),result.text);assert.deepEqual(result.fetches,[]);assert.equal(result.audio,2);assert.equal(result.playDisabled,blocked);
  if(name==='shared-player'){assert.equal(result.checks.firstReady,true);assert.equal(result.checks.firstFile,true);assert.ok(result.checks.seekSeconds>0.5);assert.equal(result.checks.secondSong,'cold-two');assert.equal(result.checks.stillSilent,true);}
  copyFileSync(file,join(evidence,name+'.json'));
  const png=file.replace('.json','.png');for(let i=0;i<20&&(!existsSync(png)||statSync(png).mtimeMs<start);i++)await new Promise(resolve=>setTimeout(resolve,100));
  if(existsSync(png))copyFileSync(png,join(evidence,name+'.png'));
  console.log(`PASS ${name}: bundled shared player, persisted downloads, zero fetches, playback blocked=${blocked}`);
 }
}finally{try{execFileSync('xcrun',['simctl','terminate','booted',id],{stdio:'ignore'});}catch{}}
