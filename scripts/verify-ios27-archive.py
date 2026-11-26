"""Verify real host/ExtensionKit layout and deployment availability; no signing claim."""
from pathlib import Path
import json, plistlib, subprocess, sys
archive = Path(sys.argv[1])
app = archive/'Products/Applications/NaviMuse.app'
extension = app/'Extensions/NaviMuseRemotePlayer.appex'
assert extension.is_dir(), 'Remote player must be embedded under Extensions/'
assert not (app/'PlugIns/NaviMuseRemotePlayer.appex').exists()
host = plistlib.loads((app/'Info.plist').read_bytes())
ext = plistlib.loads((extension/'Info.plist').read_bytes())
assert host['MinimumOSVersion'] == '17.0'
assert ext['MinimumOSVersion'] == '27.0'
assert ext['CFBundleIdentifier'] == host['CFBundleIdentifier']+'.remote-player'
assert ext['CFBundleVersion'] == host['CFBundleVersion']
assert ext['EXAppExtensionAttributes']['EXExtensionPointIdentifier'] == 'com.apple.nowplaying.remote-media'
assert host['NaviMuseRemoteKeychainAccessGroup'] == ext['NaviMuseRemoteKeychainAccessGroup']
assert host['UIApplicationSceneManifest']['UIApplicationSupportsMultipleScenes'] is False
assert 'audio' in host['UIBackgroundModes']
load = subprocess.check_output(['otool','-l',str(app/'NaviMuse')],text=True)
nowplaying = [block for block in load.split('Load command ') if 'NowPlaying.framework' in block]
assert len(nowplaying) == 1 and 'LC_LOAD_WEAK_DYLIB' in nowplaying[0]
assert not list(app.rglob('*.a')), 'Static archive included as an app resource'
print(json.dumps({'layout':'Extensions/NaviMuseRemotePlayer.appex','hostMinimum':'17.0','extensionMinimum':'27.0','optionalFrameworkLink':True,'enabled':host.get('NaviMuseRemoteNowPlayingEnabled'),'signedAcceptance':'not checked'}))
