# iOS 27 launch recovery / Build 42

Apple TestFlight crash submission confirmed Build 40 (0.2.0) on iPhone18,1, iOS 27.0 (24A435), terminating 0.506 seconds after launch on the main thread in `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`. This occurs before application playback. No full personal crash report is committed.

The exported app lacked UIApplicationSceneManifest. iOS 27 requires scene lifecycle adoption for apps built against the latest SDK. Tauri 2.11.5 resolves Tao 0.35.3, whose scene support also has two relevant issues: it gates scene adoption on the multi-window flag, and returns a scene configuration pointer after releasing its owner.

Build 42 adds a static TaoScene / TaoSceneDelegate configuration with multiple scenes disabled. A local, licensed Tao 0.35.3 patch separates scene adoption from multi-window support and backports upstream PR 1245's autorelease fix. No new player, audio session, or remote playback authority is introduced. iOS 27 remote Now Playing remains separate work.

Validation:

- Xcode 27.0 (27A266a), arm64 device release archive and App Store export passed; signature deep/strict verification, non-debug entitlements and associated-domain entitlement passed.
- `python3 scripts/verify-ios-scene-manifest.py src-tauri/gen/apple/build/arm64/NaviMuse.ipa` verifies the exported manifest and preserved background-audio configuration.
- `python3 scripts/test-ios-scene-launch.py` compiles the exact patched Tao in optimized release mode and launches a disposable UIKit app on the booted iPhone 17 Pro simulator, iOS 26.5 (23F77). Output: `ready=1 scenes=1 multi=0 windows=1 visible=1 result=PASS`. The probe is uninstalled afterward and never plays audio or accesses accounts.
- Web production build passed as part of native packaging; ListenBrainz dashboard and mix matching were separately verified in the deployed web app.

Physical iOS 27 launch, foreground/background recovery and playback remain required acceptance checks. Only iOS 26.5 is installed as an iOS simulator runtime; no physical iPhone is connected to the build machine. Compilation and the iOS 26.5 lifecycle probe do not establish physical iOS 27 acceptance.

Build 41 also lacks the manifest and must not be uploaded as the recovery build. Build 42 supersedes that pending artifact. Upload/distribution state is recorded separately in release evidence; building an IPA does not mean it is available in TestFlight.

Upstream references and patch removal criteria are in `src-tauri/vendor/tao/NAVIMUSE-PATCH.md`.
