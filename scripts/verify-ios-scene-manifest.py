"""Check the actual generated/exported app, not just the source configuration."""
import pathlib, plistlib, sys, zipfile
path = pathlib.Path(sys.argv[1])
if path.suffix == '.ipa':
    with zipfile.ZipFile(path) as archive:
        names = [n for n in archive.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('.app/Info.plist')]
        assert len(names) == 1, names
        info = plistlib.loads(archive.read(names[0]))
else:
    info = plistlib.loads(path.read_bytes())
manifest = info['UIApplicationSceneManifest']
assert manifest['UIApplicationSupportsMultipleScenes'] is False, 'Must preserve single-window behavior'
scenes = manifest['UISceneConfigurations']['UIWindowSceneSessionRoleApplication']
assert len(scenes) == 1
assert scenes[0]['UISceneConfigurationName'] == 'TaoScene'
assert scenes[0]['UISceneDelegateClassName'] == 'TaoSceneDelegate'
carplay = manifest['UISceneConfigurations'].get('CPTemplateApplicationSceneSessionRoleApplication')
if carplay:
    assert len(carplay) == 1
    assert carplay[0]['UISceneClassName'] == 'CPTemplateApplicationScene'
    assert carplay[0]['UISceneDelegateClassName'] == 'NMCarPlaySceneDelegate'
assert 'audio' in info['UIBackgroundModes']
assert info['AVInitialRouteSharingPolicy'] == 'LongFormAudio'
print('Scene manifest and background audio configuration verified:', path.name)
