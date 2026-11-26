"""Export the iOS 27 remote-player candidate with both signing boundaries intact.
Uses Xcode-managed distribution signing; never uploads or handles APNs key material.
"""
import argparse, json, pathlib, plistlib, subprocess, tempfile, zipfile, fnmatch
p=argparse.ArgumentParser()
p.add_argument('archive',type=pathlib.Path)
p.add_argument('output',type=pathlib.Path)
p.add_argument('--config',type=pathlib.Path,default=pathlib.Path.home()/'.config/appstore-connect/config.json')
a=p.parse_args()
subprocess.run(['python3','scripts/verify-ios27-archive.py',str(a.archive)],check=True)
app=a.archive/'Products/Applications/NaviMuse.app'
extension=app/'Extensions/NaviMuseRemotePlayer.appex'
team=json.loads(pathlib.Path('src-tauri/tauri.ios.conf.json').read_text())['bundle']['iOS']['developmentTeam']
group=team+'.com.developer.navimuse.remote-now-playing'
c=json.loads(a.config.read_text())
with tempfile.TemporaryDirectory(prefix='navimuse-remote-export-') as tmp:
 tmp=pathlib.Path(tmp)
 for target,source in [(extension,'NaviMuseRemotePlayer/NaviMuseRemotePlayer.entitlements'),(app,'navimuse_iOS/navimuse_iOS.entitlements')]:
  info=plistlib.loads((target/'Info.plist').read_bytes());identity=team+'.'+info['CFBundleIdentifier']
  ent=plistlib.loads((pathlib.Path('src-tauri/gen/apple')/source).read_bytes())
  ent.update({'application-identifier':identity,'com.apple.developer.team-identifier':team,'get-task-allow':False,'beta-reports-active':True,'aps-environment':'production','keychain-access-groups':[identity,group]})
  info['NaviMuseRemoteKeychainAccessGroup']=group
  (target/'Info.plist').write_bytes(plistlib.dumps(info))
  f=tmp/(target.stem+'.plist');f.write_bytes(plistlib.dumps(ent))
  subprocess.run(['codesign','--force','--sign','-','--entitlements',str(f),'--generate-entitlement-der',str(target)],check=True)
 archive_info=plistlib.loads((a.archive/'Info.plist').read_bytes())
 archive_info['ApplicationProperties'].update({'Team':team,'SigningIdentity':'-'})
 (a.archive/'Info.plist').write_bytes(plistlib.dumps(archive_info))
 opts=tmp/'options.plist';opts.write_bytes(plistlib.dumps({'method':'app-store-connect','destination':'export','signingStyle':'automatic','teamID':team,'manageAppVersionAndBuildNumber':False}))
 subprocess.run(['xcodebuild','-exportArchive','-archivePath',str(a.archive),'-exportPath',str(a.output),'-exportOptionsPlist',str(opts),'-allowProvisioningUpdates','-authenticationKeyPath',c['p8Path'],'-authenticationKeyID',c['keyId'],'-authenticationKeyIssuerID',c['issuerId']],check=True)
 ipas=list(a.output.glob('*.ipa'));assert len(ipas)==1
 subprocess.run(['python3','scripts/verify-ios-passkeys.py',str(ipas[0])],check=True)
 subprocess.run(['python3','scripts/verify-ios-scene-manifest.py',str(ipas[0])],check=True)
 with zipfile.ZipFile(ipas[0]) as ipa:ipa.extractall(tmp/'exported')
 host=tmp/'exported/Payload/NaviMuse.app';ext=host/'Extensions/NaviMuseRemotePlayer.appex'
 for target in [host,ext]:
  info=plistlib.loads((target/'Info.plist').read_bytes())
  signature=subprocess.run(['codesign','-dv','--verbose=4',str(target)],check=True,capture_output=True).stderr.decode()
  assert 'Authority=Apple Distribution:' in signature or 'Authority=iPhone Distribution:' in signature
  ent=plistlib.loads(subprocess.check_output(['codesign','-d','--entitlements',':-',str(target)],stderr=subprocess.DEVNULL))
  profile=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(target/'embedded.mobileprovision')]))
  allowed=profile['Entitlements']
  assert ent['application-identifier']==team+'.'+info['CFBundleIdentifier']==allowed['application-identifier']
  assert ent.get('aps-environment')==allowed.get('aps-environment')=='production'
  assert group in ent['keychain-access-groups']
  assert any(fnmatch.fnmatchcase(group,g) for g in allowed['keychain-access-groups'])
  assert info['NaviMuseRemoteKeychainAccessGroup']==group
  assert ent.get('get-task-allow') is False
 print(json.dumps({'remoteExtensionSigned':True,'sharedKeychainVerified':True,'productionPushVerified':True,'physicalAcceptance':'pending'}))
