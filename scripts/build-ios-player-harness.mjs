import {build} from 'esbuild';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

// Build only. Install/launch explicitly on the selected simulator for local QA.
const output=resolve(process.argv[2]||'.scratch/native-player-harness');
mkdirSync(output,{recursive:true});
const app=resolve(output,'NaviMusePlayerFixture.app');mkdirSync(app,{recursive:true});
await build({entryPoints:[process.argv[3]||'docs/evidence/m8/phone-player/fixture.jsx'],bundle:true,minify:false,format:'iife',outfile:resolve(output,'fixture.js'),define:{'process.env.NODE_ENV':'"production"'}});
const js=readFileSync(resolve(output,'fixture.js'),'utf8');
const css=readFileSync(resolve(output,'fixture.css'),'utf8');
writeFileSync(resolve(app,'fixture.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div id="root"></div><script>window.fixtureErrors=[];window.addEventListener("error",event=>window.fixtureErrors.push(event.message));window.addEventListener("unhandledrejection",event=>window.fixtureErrors.push(String(event.reason)));</script><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`);
copyFileSync('src-tauri/ios/track-controls.js',resolve(app,'track-controls.js'));
writeFileSync(resolve(app,'Info.plist'),`<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${process.argv[4]||'com.developer.navimuse.playerfixture'}</string><key>CFBundleExecutable</key><string>OutputFixture</string><key>CFBundleName</key><string>Output Fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0</string><key>MinimumOSVersion</key><string>17.0</string><key>LSRequiresIPhoneOS</key><true/><key>UILaunchScreen</key><dict/><key>UIDeviceFamily</key><array><integer>1</integer></array><key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string><string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string></array></dict></plist>`);
const sdk=execFileSync('xcrun',['--sdk','iphonesimulator','--show-sdk-path'],{encoding:'utf8'}).trim();
execFileSync('xcrun',['clang','-fobjc-arc','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,'-framework','CoreGraphics','-framework','UIKit','-framework','WebKit','-framework','AVFoundation','-framework','AVKit','-framework','CarPlay','-framework','MediaPlayer','-framework','Network','-framework','CoreMedia','scripts/ios-player-layout-harness.m','src-tauri/ios/shell.m','src-tauri/ios/native-audio.m',...['access','store','downloads'].map(n=>`src-tauri/ios/offline-${n}.m`),'-o',resolve(app,'OutputFixture')],{stdio:'inherit'});
execFileSync('codesign',['--force','--sign','-',app],{stdio:'inherit'});
console.log(app);
