# Complete TestFlight repair program

Owner request: plan and repair the audited issues one by one, use PRs as needed,
and deploy one final integrated app build for owner testing. This program retains
all work in audit #343; it does not equate code changes with device acceptance.

Baseline: origin/main `9000c3e994679fc9d382e2eb312203349d115094`, current native
shell Build 9 and public frontend `index-ndmGeUET.js`. Audit includes 56 reports
and 50 screenshots. Gitea #343 owns their immutable source references and status.

## Delivery order

1. Native outputs and playback: #349 radio/receiver artwork, #344 route selection,
   #345 network/foreground recovery, #346 startup, #358 clipped beginnings.
   Start with the verified radio-art URL rejection; investigate route and stream
   causes before changing timing. Preserve one queue and output authority.
2. Phone usability: #347 native landscape, #356 touch focus, #118 overflow menu,
   #353 speaker naming and group footer. Verify actual rendered surfaces as well
   as component behavior. Keep keyboard and VoiceOver access.
3. Data and radio: #350 pagination/retry, #59 ordinary-track feedback rejection,
   #348 radio handoff/playback/source metadata, #357 shipped-fix regression.
4. Output scope and capabilities: #351 nearby versus server speakers, #352
   direct-speaker hardware volume, #333 discovery/transfer/disconnect acceptance,
   #355 formats/delivered-signal details. Unsupported platform behavior must be
   documented with evidence and an explicit usable design, never simulated by
   controlling an unrelated output.
5. Offline feature #354: record a superseding bounded native download/storage
   design under the owner's current authorization, then implement account-bound
   downloads, cellular permission, management and real offline playback. Retain
   BFF credentials and authorization; do not treat a cache setting as completion.
6. Integrate and release once: full relevant regression/build, native compile and
   package verification, rendered phone portrait/landscape and desktop QA, live
   service checks. Merge reviewed topic PRs under existing authorization, build
   one signed final TestFlight binary, deploy its matching web/BFF revision once,
   verify Apple processing/pilot assignment and provide owner acceptance checks.

Use one topic branch/worktree per bounded repair, preserve existing worktrees,
and reference the appropriate issues in PRs. Automatic Code Bot review is advisory;
evaluate material findings, never weaken unrelated checks or claim review passed
when unavailable. No intermediate production deployment merely to test a candidate.
No household audio starts without authorization for that test. Keep service scope
limited to NaviMuse and retain rollback artifacts at final deployment.

## Proof and tracking

For each work item record cause, change, exact commit, tests, rendered/native
evidence, remaining hardware checks, PR and deployment state. Keep an issue open
where acceptance remains unproved; use PR text to state implementation completion
without auto-closing device QA. A test of an adapter is not a physical AirPlay test.

Final owner checklist includes route-picker taps, direct/local handoff and powered-
off disconnect, radio and ordinary track art on lock screen/receiver, first-track
Previous, network changes and background progression, clipped beginnings, landscape,
long library lists, favorites/ratings in another session, offline playback and
download settings. Maintain earlier accepted lyrics/scrubbing/system controls.

## Progress

- PRs #359–371 merged; integrated source is `63ca8ad` before Build 10 packaging.
- Radio metadata/art (#359), native AirPlay target (#360), stream recovery (#361),
  startup (#362), landscape/menu/focus/naming (#363), feedback writes (#364),
  library recovery (#365), home-speaker preference (#366), on-screen remote volume
  (#367), received formats (#368), supported format choices (#369), offline
  downloads/cold startup (#370), and native start preparation (#371) are implemented.
- Full integrated regression: 1,074/1,074 tests pass, zero skips. Production build,
  arm64 iOS 17 syntax check and arm64 iOS Cargo check pass. Real native WebView
  portrait/landscape fixtures pass; landscape and portrait menu snapshots inspected.
- Hardware buttons remain system-route controls; direct home-speaker controls are
  explicit on-screen controls. No unsupported hardware remapping is claimed.
- AirPlay clipped starts have a readiness mitigation, not physical causal proof.
  Receiver artwork, listening/network transitions and other owner acceptance checks
  remain on the final-build checklist; keep the relevant issues open.
- Build 10 signed release is uploaded, processed VALID and IN_BETA_TESTING in
  NaviMuse Pilot. The matching web/BFF source `a7664f0` is deployed once; public
  assets, live server source and service health verified. PR #372 records release
  metadata. Receipts and owner checklist: `../evidence/m8/feedback-build10/README.md`.
  Physical acceptance remains with the owner testing this delivered build.
