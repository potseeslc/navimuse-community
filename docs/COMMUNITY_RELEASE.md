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
