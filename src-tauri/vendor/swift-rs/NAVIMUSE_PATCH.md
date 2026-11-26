# NaviMuse Xcode 27 compatibility patch

Base: swift-rs 1.0.8 from the pinned Cargo registry dependency, retaining its MIT and Apache licenses.

Xcode 27.0 (27A266a) internalizes the C ABI helpers in SwiftRs.o embedded in Tauri’s static product. The upstream globalizer handles Tauri.o only. There is no separately linked SwiftRs archive, leaving retain_object, release_object and string_from_bytes undefined.

For the Tauri product only, allow those three exact names from SwiftRs.o through the existing local-symbol and unique-occurrence checks. All other dependency symbols remain local. No linker validation is disabled. Rust llvm-tools must still be installed. Revisit this bounded patch when an upstream release handles embedded runtime exports.

Validation: a clean Tauri dependency build and final signed iOS linking must succeed; inspect the three symbols as global definitions in libTauri.a. Full application and native regression evidence is recorded in the Build 26 release record.
