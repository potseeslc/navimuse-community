"""Release-mode launch probe using the exact vendored Tao and real UIKit scene lifecycle.
Requires a booted iOS simulator and the aarch64-apple-ios-sim Rust target.
No network, login, or playback. Build outputs live in .scratch.
"""
from pathlib import Path
import json, os, plistlib, shutil, subprocess
root = Path(__file__).resolve().parents[1]
probe = root / '.scratch/ios-scene-probe'
probe.mkdir(parents=True, exist_ok=True)
manifest = '[package]\nname="navimuse_scene_probe"\nversion="0.1.0"\nedition="2021"\n[lib]\ncrate-type=["staticlib"]\npath=' + json.dumps(str(root/'test/fixtures/ios-scene-launch/lib.rs')) + '\n[dependencies]\ntao={path=' + json.dumps(str(root/'src-tauri/vendor/tao')) + '}\n'
(probe/'Cargo.toml').write_text(manifest)
subprocess.run(['cargo','build','--manifest-path',str(probe/'Cargo.toml'),'--release','--target','aarch64-apple-ios-sim','--offline'],check=True)
app = probe / 'SceneProbe.app'
app.mkdir(exist_ok=True)
info = plistlib.loads((root/'src-tauri/Info.ios.plist').read_bytes())
info.update(CFBundleExecutable='SceneProbe', CFBundleIdentifier='com.developer.navimuse.scene-probe', CFBundleName='SceneProbe', CFBundlePackageType='APPL', CFBundleVersion='1', CFBundleShortVersionString='1.0', MinimumOSVersion='17.0', LSRequiresIPhoneOS=True, UIDeviceFamily=[1,2], UILaunchScreen={})
(app/'Info.plist').write_bytes(plistlib.dumps(info))
sdk = subprocess.check_output(['xcrun','--sdk','iphonesimulator','--show-sdk-path'],text=True).strip()
subprocess.run(['xcrun','clang','-fobjc-arc','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,str(root/'test/fixtures/ios-scene-launch/main.m'),str(probe/'target/aarch64-apple-ios-sim/release/libnavimuse_scene_probe.a'),'-o',str(app/'SceneProbe'),'-lobjc','-lc++','-liconv',*[s for f in ['Foundation','UIKit','CarPlay','CoreFoundation','CoreGraphics','QuartzCore','CoreVideo'] for s in ['-framework',f]]],check=True)
subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
subprocess.run(['xcrun','simctl','install','booted',str(app)],check=True)
try:
    result = subprocess.run(['xcrun','simctl','launch','--console','booted',info['CFBundleIdentifier']],capture_output=True,text=True,timeout=20)
    print(result.stdout); print(result.stderr)
    assert result.returncode == 0 and 'result=PASS' in result.stdout, 'Release scene startup failed'
finally:
    subprocess.run(['xcrun','simctl','uninstall','booted',info['CFBundleIdentifier']],check=True)
