# Third-party notices

The root MIT license covers the original NaviMuse code. It does not replace
licenses attached to third-party code or dependencies.

- `src-tauri/vendor/swift-rs/`: preserve `LICENSE-MIT` and `LICENSE-APACHE`.
- `src-tauri/vendor/tao/`: preserve `LICENSE` and `LICENSE.spdx`.
- `src-tauri/ios/TAURI-TEMPLATE-LICENSE-MIT`: upstream Tauri template attribution.
- JavaScript dependencies are recorded in `package-lock.json`; their packages
  include their own license metadata/notices. This includes React, Tauri APIs,
  Lucide, regl, OpenID Client, SimpleWebAuthn, Vite, and other dependencies.
- Rust dependencies are recorded in `src-tauri/Cargo.lock`; retain applicable
  notices when distributing compiled products.
- Optional HLS images include FFmpeg; inspect their build and license obligations
  separately before distributing binaries.

Navidrome, AudioMuse AI, Plex, Pocket ID, and ListenBrainz are separate services.
Their code and media libraries are not relicensed by this repository.
