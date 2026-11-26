# NaviMuse iOS 27 scene startup patch

Base: crates.io tao 0.35.3, SHA-256 d1c93047acf68669466a34690ac58cca7010bd1b201e1ec86f1fd0a75d3dd4a9. Upstream license and source are retained. Cargo patches the existing 0.35 dependency locally; desktop source is unchanged.

NaviMuse Build 40 on iPhone18,1 / iOS 27.0 (24A435) traps in `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke` at launch. The app had no static scene manifest.

Changes to upstream iOS source:

- `scene.rs`: recognize scene lifecycle from presence of UIApplicationSceneManifest, independently of the multi-window opt-in. UIKit's supportsMultipleScenes still controls requests for additional windows.
- `view.rs` and `app_state.rs`: use that lifecycle predicate for delegate registration, assigning windows to scenes, and deferring startup until the first scene connects.
- `view.rs`: backport upstream PR 1245's `Retained::autorelease_ptr(config)` fix. Returning a borrowed pointer drops the scene configuration before UIKit retains it in optimized builds.

The app manifest names TaoSceneDelegate and TaoScene and keeps UIApplicationSupportsMultipleScenes false. Remove this patch once the pinned Tauri dependency includes both fixes, after testing single-window release startup and background/foreground playback on the supported OS range.

References:
- https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle
- https://github.com/tauri-apps/tauri/issues/15719
- https://github.com/tauri-apps/tao/issues/1308
- https://github.com/tauri-apps/tao/pull/1245
