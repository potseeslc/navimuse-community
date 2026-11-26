# Artwork palette implementation status

Original draft base: merged main 57176b380d9ecfb8af20c5ffdf9c022986f1d881.
Current integration base: merged M8 main 12cd594c116f4072d3e4221165427b18220f2bc1.
Current branch: codex/m8-artwork-palette-integration. Not deployed; owner acceptance remains open.

The approved adaptive-color contract already exists in the product plan and
`designSystem.js`, but extraction and runtime application were absent. The new pure
RGBA sampler bounds input to 4096 pixels, ignores transparent/near-neutral samples,
selects the most populated quantized color deterministically, and derives restrained
atmosphere plus a contrast-checked accent. Structural neutrals remain fixed. Missing,
invalid, transparent and neutral samples retain the established coral fallback.

Palette validation now checks foreground, muted foreground and accent against the
background, surface and raised surface, as well as accent-foreground contrast.
Previously a light surface could pass while making the foreground unreadable.
Eight focused palette/design-system tests pass, including a 216-color gamut grid.
This is numeric palette evidence, not a rendered visual comparison.

Worker and runtime integration are now implemented locally. The worker requests only
an existing BFF cover path at size 300, with credentials, no-store, no redirects,
a four-second fetch deadline, a one-MiB input bound, and a 64×64 sample. Unsupported
worker/canvas/decoding paths return the neutral fallback; the caller terminates the
worker after five seconds or when superseded. No render-critical canvas extraction
is used. The hook accepts only existing cover paths and resolves the configured BFF
origin through the existing API helper.

The in-memory service caches at most 16 palettes, cancels prior requests, refuses
late results and clears on account/library scope changes or lock. Current legacy
identity uses verified session subject plus selected library; the eventual immutable
account contract must replace the legacy-local scope when wired. No disk cache or
private artwork evidence is introduced. Both real player components receive local
accent/atmosphere properties. Structural neutrals stay fixed; local artwork shadow
transitions over 450 ms, with reduced-motion and reduced-transparency fallbacks.

All 698 tests and the production build pass. Service regressions cover cancellation,
late results, sharing an in-flight request, bounded eviction, account clearing and
retry after extraction failure. The build emits the worker asset. These tests do not
yet prove real browser-worker execution or final rendered contrast across gradients,
translucent controls and accessibility modes.

Next: run an actual browser worker against controlled artwork, then visually inspect
the rendered production player at desktop/compact/PWA sizes against the approved
references. Verify extraction latency, image failure, rapid track changes, account
changes, and reduced preferences. Native and authenticated real-library acceptance
remain open. Keep this branch a local draft until that QA is recorded; no PR or
production deployment has occurred.


## Browser worker evidence — 2026-09-06

Started the loopback-only `scripts/serve-artwork-palette-qa.mjs` server at port 5208
and inspected `docs/evidence/m8/artwork-palette/fixture.html` through the Codex in-app
browser. The fixture uses actual production useArtworkPalette/MiniPlayer components
and synthetic 8×8 PNGs, with no live authentication or audio. Worker extraction
returned red accent #df6868, blue #8181e4, and missing-art coral #ff5a36.

The visible Run worker checks action uses actual workers and the cache service:
start delayed red preparation, wait 100 ms, request blue, await both, then clear the
account scope. Browser output was canceledOld=true, latestBlue=true,
lockedFallback=true, elapsedMs=115. This is a controlled functional observation,
not a production latency budget or native-performance benchmark.

Screenshot inspection confirmed the production MiniPlayer received the blue accent
and retained neutral text/background. Its isolated 744px container overflowed because
it lacked the normal responsive shell; this is fixture-context evidence, not proof
of a production layout regression or responsive acceptance. Width controls are now
explicitly labeled as container resizing. Full-shell wide/compact/PWA, expanded-player,
contrast on rendered backgrounds and native checks remain open before PR submission.


## Full-shell browser follow-up

Added shell.html/shell.jsx to the same loopback fixture server. An iframe supplies
actual 390, 744 and 1440px document widths at 900px height, rendering the production
AppShell, MiniPlayer and PlayerSheet with the same hook and controlled artwork.
Inspected the compact shell and expanded player in the in-app browser. Blue extraction
propagates to the player while navigation remains the fixed coral/neutral theme.
Phone layout changes to the existing stacked composition; desktop retains its rail.
The host browser capture cannot show the entire 1440×900 iframe at once, so these
observations are not complete viewport screenshot artifacts or final design signoff.

The older main-branch expanded-player composition remains visible. Its replacement
is in held shared-player PR #266; repeat visual comparisons after integration rather
than approving the older composition as M8 complete. Native, real artwork/library,
rendered contrast sampling and accessibility-preference verification are still open.
This pass is ready for draft code review only; hold merge/deployment until the
required integration and acceptance evidence is collected.

## Rendered color and transition follow-up

Removed a fixture-only body foreground override before measuring. Production DOM
computed colors are now foreground #f3f1ed, muted #a8a8a5, blue accent #8181e4 and
play-icon foreground #080b0f. The adjacent blue-rendered-contrast.json records ratios
against structural and atmosphere endpoints: accent minimum 5.11:1, muted minimum
7.27:1, main foreground minimum 15.36:1, mini play-icon ratio 5.82:1. This uses actual
computed CSS colors and numeric contrast, not screenshot-pixel sampling.

Validation now includes both atmosphere colors as possible backgrounds. Registered
color properties animate local player atmosphere over 450 ms, while the player-panel
opening transform retains its independent 520 ms timing. Browser computed styles
confirmed registration, both 450 ms transitions, and the unchanged transform. The
artwork shadow follows the inherited animated color without an additional lagging
transition. Reduced-motion disables color transitions; reduced-transparency removes
the shadow. Actual OS-preference/native execution remains to be verified.

All 698 tests and the production build pass after this follow-up. Draft status and
remaining native/shared-player integration gates are unchanged.


## Native worker compatibility observation — 2026-09-06

Tested source `8467aada857311bef12959829615184ccfcc8cdb` through the existing
ad-hoc NaviMuse M8 Integration QA Tauri shell at the loopback-only 5208 fixture.
This is native WebView execution of live development source, not final packaged
release-candidate or authenticated production acceptance.

Environment: Mac14,2, macOS 26.6.2 (25G83). QA executable SHA-256:
`99353a7feb923c40091b9e4e4c6d934b3b641de31acdf3be32c9123569ffd91f`.
Exact WebKit version and power state were not captured; no performance claim.

Observed in the native accessibility tree:

- Initial red accent: `#df6868`.
- Run worker checks: `canceledOld=true`, `latestBlue=true`,
  `lockedFallback=true`, `elapsedMs=271`. Timing includes a deliberate 100 ms
  fixture delay; it is not an extraction benchmark.
- Blue: accent `#8181e4`, atmosphere `#14142e` / `#201528`.
- Missing artwork: fallback accent `#ff5a36`, atmosphere `#341712` / `#112833`.
- Returning to blue restored its palette.

A subsequent manual Lock click could not be verified: two observation attempts
failed with Computer Use `failedToCreateImageDestination`. The manual hook/UI check
remains open despite the passing service-level lock check above. The screenshot
showed fixture values but not the below-fold MiniPlayer; it does not prove native
player composition or contrast. A subsequent evidence write failed with no space
left on device. Removed only this branch's regenerable, untracked dist output to
save this record; the already recorded build result remains tied to tested source.

The temporary navigation link in pass-integration/index.html was restored
byte-for-byte immediately after navigation. No production app, account, audio, or
service configuration changed. Shared-player #266 integration, authenticated real
artwork, native responsive visuals, OS accessibility preferences, and final
release-candidate acceptance remain open. Draft merge/deployment hold remains.


## Native lock recovery follow-up

Recovered approximately 820 MiB by removing only untracked Cargo intermediates
(`deps`, `build`, `.fingerprint`, `incremental`) from shared-player-pass's target
release directories after verifying no cargo/rustc process was running. Both
packaged app executable SHA-256 values remained unchanged. Free space increased
from 132 MiB to 954 MiB; this is limited working space, not capacity for a full
native rebuild.

Native accessibility observation then recovered on the same running fixture.
The previously clicked Lock state showed `scope=null`, blue artwork retained,
and fallback accent `#ff5a36`. Clicking Unlock restored `scope=qa-account` and
blue accent `#8181e4` with atmosphere `#14142e` / `#201528`. This closes the
previously interrupted manual hook lock/unlock check. It does not establish
real authentication or multi-account identity isolation.

Added a fixture-only link to the direct full-shell scene for subsequent native
QA. The existing WebView did not show the newly added link after its reload
shortcut, so no new full-shell visual acceptance is claimed in this follow-up.
Review recheck: #266, #278, and #279 remain failed on their existing heads;
#270 passed on f725ad98 but remains behind its player dependency. #280 was
pending on 2eb6e3a. No gate was bypassed or merge performed.

## Post-#266 integration QA — 2026-09-07

Replayed the four reviewed palette commits onto merged M8 main after PR #266
landed. The only conflict was the append point in `src/styles.css`; resolution
retained the complete account-access and recovery styles, then placed the
registered atmosphere color properties after those blocks. No player geometry,
navigation color, or access styling was replaced.

The loopback full-shell fixture ran from the reconciled branch with the actual
merged `AppShell`, `MiniPlayer`, and `PlayerSheet`. Browser screenshots and the
accessibility tree were inspected at 390, 744, and 1440 CSS-pixel iframe widths.
The responsive player compositions remained reachable and unclipped within the
fixture viewport. Changing controlled artwork from blue to red changed the local
accent from `#8181e4` to `#df6868` and the surrounding atmosphere from
`#14142e`/`#201528` to `#2e1414`/`#282015`; structural navigation and neutral
surfaces remained unchanged. This keeps adaptive player color subordinate to the
high-color Atlas nebula instead of turning every daily surface into the map.

Focused palette tests passed 7/7 and the production build emitted the dedicated
worker asset. Reduced-motion and reduced-transparency rules remained present in
the reconciled output. Real authenticated artwork, native OS preferences, and
owner visual acceptance still belong to the final packaged QA gate.
