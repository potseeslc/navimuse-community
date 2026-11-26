import pathlib,plistlib,subprocess
root=pathlib.Path('.scratch/carplay-harness');app=root/'CarPlayFixture.app';app.mkdir(parents=True,exist_ok=True)
info={'CFBundleIdentifier':'com.developer.navimuse.carplayfixture','CFBundleExecutable':'Fixture','CFBundleName':'CarPlay Fixture','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','CFBundlePackageType':'APPL','MinimumOSVersion':'17.0','LSRequiresIPhoneOS':True,'UILaunchScreen':{},'UIDeviceFamily':[1,2],'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':False,'UISceneConfigurations':{'UIWindowSceneSessionRoleApplication':[{'UISceneConfigurationName':'Phone','UISceneDelegateClassName':'FixtureScene'}],'CPTemplateApplicationSceneSessionRoleApplication':[{'UISceneConfigurationName':'NaviMuseCarPlay','UISceneClassName':'CPTemplateApplicationScene','UISceneDelegateClassName':'NMCarPlaySceneDelegate'}]}}}
(app/'Info.plist').write_bytes(plistlib.dumps(info))
ent=root/'entitlements.plist';ent.write_bytes(plistlib.dumps({'com.apple.developer.carplay-audio':True}))
sdk=subprocess.check_output(['xcrun','--sdk','iphonesimulator','--show-sdk-path'],text=True).strip()
subprocess.run(['xcrun','clang','-fobjc-arc','-Werror','-target','arm64-apple-ios17.0-simulator','-isysroot',sdk,'-framework','Foundation','-framework','UIKit','-framework','CarPlay','test/fixtures/carplay-scene-harness.m','-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__entitlements','-Xlinker',str(ent),'-o',str(app/'Fixture')],check=True)
subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
subprocess.run(['xcrun','simctl','install','booted',str(app)],check=True)
subprocess.run(['xcrun','simctl','launch','booted',info['CFBundleIdentifier']],check=True)
