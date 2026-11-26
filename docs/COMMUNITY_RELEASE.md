# Community source release — November 26, 2026

Based on the last integrated NaviMuse private source revision `df9f6da`.
This repository starts a new public history. It deliberately omits private
QA screenshots/logs, deployment secrets, and historical private Git branches.
Household domains and Apple signing identifiers are replaced with examples.

## Status

The original deployment is retired. This is an MIT-licensed experimental source
release for study, forks, and community development. There is no hosted backend,
maintained binary, or promise of support. Native builds require your own server
configuration, signing account, and entitlements. Historical documents are retained
for context and may refer to removed QA artifacts or superseded plans.

## Validation

- Dependency installation and production web build completed on Node.js 26.7.0.
- The build retains an existing large-bundle warning.
- A Gitleaks scan of the source snapshot reported no secrets.
- The complete historical `npm test` command did not pass: it includes native
  simulator harnesses that require a booted simulator, old UI assertions, and
  environment-specific checks. No booted iOS simulator was available.
- This release does not claim renewed iPhone, CarPlay, Plexamp, or physical
  UPnP-speaker QA. See subsequent validation notes below for final check results.

## Security and licenses

Use isolated test data, keep the data volume private, and configure authentication
and HTTPS before exposing a fork beyond localhost. Preserve native origin checks.
Third-party vendored code retains its original notices and licenses.

## Final source checks

- Production build: passed (`npm run build`).
- Standalone Compose: passed (`docker compose --env-file .env.community.example -f compose.yaml config --quiet`).
- Isolated local server smoke test: web shell and `/api/health` returned HTTP 200;
  a first-run setup token was created in a temporary private data directory.
- Gitleaks 8.30.1: zero findings in the exported source and initial public Git history.
- JavaScript regression run on Node.js 26.7.0:
  `NAVIMUSE_DATA_DIR=<temporary-directory> NODE_ENV=test node --test 'test/*.test.mjs'`:
  **1,375 passed, 14 failed, 1,389 total**. This is not a green test suite.
  Failures cover historical UI/layout assertions and browser interaction checks;
  they are retained for future maintainers to investigate, not disabled.

### Failing checks retained

- production entry scopes music, tears down on logout and restores saved Library preferences after sign-in
- App playback respects continuation, queue selection, recovery and latest album intent
- M8 Home names the primary destination consistently with navigation
- M8 Search exposes its input and groups results by music entity
- owner overview retains pages on failure, restores focus, clears denied data and ignores old-account responses
- application shell adapts navigation and content grids for desktop and tablet
- M8 stylesheet custom properties use one namespace
- desktop shell keeps a contextual queue inspector separate from now playing
- Library is one filtered surface with complete album browse and album-only view controls
- playback reporting uses the protected scrobble transport
- protected BFF and expired media sessions route the browser back to the unlock screen
- search renders artist results and only advertises supported result types
- Home distinguishes shelf loading and failure states from an empty library
- radio cards and station results play inside NaviMuse instead of opening external streams
