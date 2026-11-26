"""Compile host/extension boundaries and execute projection/wire-format tests.
This does not install an extension or claim physical iOS 27 acceptance.
"""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
native = root / 'src-tauri/ios/remote-now-playing'
scratch = root / '.scratch'; scratch.mkdir(exist_ok=True)
sdk = subprocess.check_output(['xcrun','--sdk','iphoneos','--show-sdk-path'],text=True).strip()
common = ['xcrun','swiftc','-swift-version','6','-typecheck','-parse-as-library','-target','arm64-apple-ios27.0','-sdk',sdk]
subprocess.run(common+[str(p) for p in sorted(native.glob('*.swift'))],check=True)
subprocess.run(common+['-application-extension',*[str(native/('RemoteSpeaker'+name+'.swift')) for name in ['Access','Client','Timestamp','Session']],str(native/'extension/RemoteSpeakerExtension.swift')],check=True)
binary = scratch/'remote-timestamp-test'
subprocess.run(['xcrun','swiftc',str(native/'RemoteSpeakerTimestamp.swift'),str(root/'test/fixtures/remote-speaker-timestamp.swift'),'-o',str(binary)],check=True)
subprocess.run([str(binary)],check=True)
subprocess.run(['node','--test','test/remoteNowPlaying.test.mjs','test/nowPlayingService.test.mjs','test/nowPlayingHttp.test.mjs','test/nowPlayingPush.test.mjs','test/remoteNowPlayingBridge.test.mjs'],cwd=root,check=True)
