"""Export an unsigned Tauri archive without dropping its passkey entitlement.

The temporary ad-hoc signature carries the requested entitlements into Xcode's
App Store export. Only the final Apple distribution signature passes verification.
No upload is performed. The profile must be an existing, unexpired app profile.
"""
import argparse, datetime, json, pathlib, plistlib, shutil, subprocess, tempfile
parser=argparse.ArgumentParser()
parser.add_argument('archive',type=pathlib.Path)
parser.add_argument('profile',type=pathlib.Path)
parser.add_argument('output',type=pathlib.Path)
parser.add_argument('--config',type=pathlib.Path,default=pathlib.Path.home()/'.config/appstore-connect/config.json')
a=parser.parse_args()
app=a.archive/'Products/Applications/NaviMuse.app'
if list(app.rglob('*.appex')): raise SystemExit('Extension candidates require their own signing verification; this exporter handles the host-only pilot.')
profile=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(a.profile)]))
info=plistlib.loads((app/'Info.plist').read_bytes())
team=profile['TeamIdentifier'][0]
identity=team+'.'+info['CFBundleIdentifier']
assert profile['Entitlements']['application-identifier']==identity, 'Profile does not match the app'
assert profile['ExpirationDate']>datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Profile expired'
requested=plistlib.loads(pathlib.Path('src-tauri/gen/apple/navimuse_iOS/navimuse_iOS.entitlements').read_bytes())
assert 'webcredentials:id.example.com' in requested['com.apple.developer.associated-domains']
requested.update({'application-identifier':identity,'com.apple.developer.team-identifier':team,'get-task-allow':False,'keychain-access-groups':[identity],'beta-reports-active':True})
config=json.loads(a.config.read_text())
with tempfile.TemporaryDirectory(prefix='navimuse-export-') as temporary:
    temporary=pathlib.Path(temporary)
    entitlements=temporary/'entitlements.plist';entitlements.write_bytes(plistlib.dumps(requested))
    shutil.copyfile(a.profile,app/'embedded.mobileprovision')
    subprocess.run(['codesign','--force','--sign','-','--entitlements',str(entitlements),'--generate-entitlement-der',str(app)],check=True)
    archive_info=plistlib.loads((a.archive/'Info.plist').read_bytes())
    archive_info['ApplicationProperties'].update({'Team':team,'SigningIdentity':'-'})
    (a.archive/'Info.plist').write_bytes(plistlib.dumps(archive_info))
    options=temporary/'ExportOptions.plist';options.write_bytes(plistlib.dumps({'method':'app-store-connect','destination':'export','signingStyle':'automatic','teamID':team,'manageAppVersionAndBuildNumber':False}))
    subprocess.run(['xcodebuild','-exportArchive','-archivePath',str(a.archive),'-exportPath',str(a.output),'-exportOptionsPlist',str(options),'-allowProvisioningUpdates','-authenticationKeyPath',config['p8Path'],'-authenticationKeyID',config['keyId'],'-authenticationKeyIssuerID',config['issuerId']],check=True)
ipa=list(a.output.glob('*.ipa'))
assert len(ipa)==1, 'Expected one exported IPA'
subprocess.run(['python3','scripts/verify-ios-passkeys.py',str(ipa[0])],check=True)
