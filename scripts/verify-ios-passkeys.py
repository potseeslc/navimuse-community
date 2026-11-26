"""Verify the exported binary, not only the Xcode/source entitlement file."""
import argparse, hashlib, json, pathlib, plistlib, subprocess, tempfile, zipfile
parser = argparse.ArgumentParser()
parser.add_argument('ipa', type=pathlib.Path)
args = parser.parse_args()
app_id = 'ABCDE12345.com.developer.navimuse'
domain = 'webcredentials:id.example.com'
with tempfile.TemporaryDirectory(prefix='navimuse-passkey-signature-') as directory:
    with zipfile.ZipFile(args.ipa) as archive:
        archive.extractall(directory)
    app = pathlib.Path(directory) / 'Payload/NaviMuse.app'
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    signature = subprocess.run(['codesign', '-dv', '--verbose=4', str(app)], check=True, capture_output=True).stderr.decode()
    assert 'Authority=Apple Distribution:' in signature or 'Authority=iPhone Distribution:' in signature, 'Apple distribution signature required'
    signed = subprocess.run(['codesign', '-d', '--entitlements', ':-', str(app)], check=True, capture_output=True)
    entitlements = plistlib.loads(signed.stdout)
    assert entitlements.get('application-identifier') == app_id
    assert domain in entitlements.get('com.apple.developer.associated-domains', [])
    assert entitlements.get('get-task-allow') is False
    profile = subprocess.run(['security', 'cms', '-D', '-i', str(app / 'embedded.mobileprovision')], check=True, capture_output=True)
    allowed = plistlib.loads(profile.stdout)['Entitlements']
    assert allowed['application-identifier'] == app_id
    domains = allowed.get('com.apple.developer.associated-domains', [])
    assert domains == '*' or '*' in domains or domain in domains
    if 'CPTemplateApplicationSceneSessionRoleApplication' in info.get('UIApplicationSceneManifest',{}).get('UISceneConfigurations',{}):
        assert entitlements.get('com.apple.developer.carplay-audio') is True, 'Signed CarPlay entitlement missing'
        assert allowed.get('com.apple.developer.carplay-audio') is True, 'Profile does not allow CarPlay'
    print(json.dumps({'build': info['CFBundleVersion'], 'version': info['CFBundleShortVersionString'], 'applicationIdentifier': app_id, 'associatedDomains': entitlements['com.apple.developer.associated-domains'], 'distributionSignature': True, 'profileAllowsAssociatedDomains': True, 'bytes': args.ipa.stat().st_size, 'sha256': hashlib.sha256(args.ipa.read_bytes()).hexdigest()}, indent=2))
