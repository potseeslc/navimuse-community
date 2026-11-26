# macOS M7 Migration Plan

M7 release hardening must prove that moving between the PWA and the macOS Tauri
app does not strand listening state or hide unrecoverable failures. The first
native release keeps the PWA operational and does not remove or rewrite existing
browser storage without an explicit migration record.

## Persisted State

Known browser/client state that must be considered during release validation:

- `navimuse.queue.v1`: ordinary queue, current index, shuffle pool, play history,
  controls, position, and timestamp.
- `navimuse.sonic-atlas.queue-transaction.v1`: atomic Atlas Journey plus queue
  transaction with exact binding and route history.
- `navimuse.trackFeedback.v1`: bounded local feedback cache used for responsive
  ratings/favorites before Navidrome sync.
- `navimuse.volume.v1`: local playback volume.
- BFF session cookie: first-party session established through the deployed BFF.
- Server data volume: encrypted service settings, setup/admin state, and settings
  encryption key under `${NAVIMUSE_DATA_DIR}`.

## Compatibility Policy

- Do not change persisted client keys during M7 unless a versioned migration and
  rollback test are added in the same release candidate.
- Invalid or incompatible client state must fail closed into a usable app rather
  than blocking ordinary playback.
- Atlas Journey persistence must restore atomically with its matching queue or be
  cleared; it must not create a second queue authority.
- The packaged app must continue using the deployed BFF origin for first-party
  session recovery.
- The PWA remains the rollback path until the native app has independent release
  evidence and user data compatibility evidence.
- Server-side `settings.json` and `settings.key` must be backed up and restored
  together; deleting the key intentionally makes saved encrypted service
  credentials unrecoverable.

## Required Release Evidence

1. Start from an existing authenticated PWA session with ordinary queue state,
   feedback cache, volume, and an Atlas Journey transaction where available.
2. Launch the packaged app against the release BFF origin and record which state
   restores, which state is intentionally isolated by WebView storage, and which
   state requires user action.
3. Confirm invalid `navimuse.queue.v1` state is ignored without breaking ordinary
   playback.
4. Confirm invalid `navimuse.sonic-atlas.queue-transaction.v1` state is cleared
   without breaking ordinary playback.
5. Confirm session recovery remains first-party through the deployed BFF and does
   not require service credentials in the client.
6. Confirm rollback to the PWA can still sign in, play, and either restore or
   safely ignore stale persisted state.
7. Record any intentional state reset with user-visible impact and rollback
   instructions.

## Current Status

Status: storage compatibility and fail-closed migration behavior passed; live
authenticated PWA/native observation remains optional release-review evidence.

The first M7 native release does not perform an automatic cross-store migration
from browser PWA storage into the packaged macOS WebView. That isolation is the
intentional compatibility boundary: the PWA remains deployed at
`https://navimuse.example.com`, native preview users can sign in through the same
BFF origin, and rollback does not require rewriting or deleting browser storage.

Automated release evidence for `679155b` keeps the persisted storage contract
stable and fail-closed:

- `test/queueStore.test.mjs` covers the queue-store implementation that owns
  `navimuse.queue.v1`; it verifies the key and schema version `1`
  remain stable, malformed queue state loads as `null`, and valid queue snapshots
  round-trip with position, controls, shuffle pool, and play history.
- `test/playerQueueState.test.mjs` covers the player queue-state loader; it
  verifies blocked `localStorage` leaves the app with an empty usable queue
  instead of crashing or blocking playback.
- `test/atlasQueueTransaction.test.mjs` covers the Atlas transaction persistence
  helpers; it verifies Atlas Journey plus queue state restores atomically,
  rejects mismatched queue/Journey bindings, and preserves deterministic restore
  priority between ordinary queue state and Atlas transactions.
- `test/contracts/sonicAtlasIdentity.test.mjs` covers the Sonic Atlas identity
  contract; it verifies projection identity mismatches and unknown identity
  fields fail closed instead of accepting stale provider or cache state.
- `test/playerIntegration.test.mjs` covers the app-shell integration path; it
  verifies the packaged client uses the protected BFF/session boundary, preserves
  deterministic app navigation, keeps the versioned PWA service worker, and
  wires the Atlas queue-owned transaction through the app shell without creating
  a second queue authority.

Targeted migration verification:
`NODE_ENV=test node --test test/queueStore.test.mjs test/playerQueueState.test.mjs test/atlasQueueTransaction.test.mjs test/contracts/sonicAtlasIdentity.test.mjs test/playerIntegration.test.mjs`
passed 74/74 on 2026-08-30.

Remaining manual observation, if required by release reviewers: launch the
packaged app, sign in through the release BFF origin, confirm the native WebView
starts with isolated local storage, then confirm the PWA can still sign in and
play without losing or corrupting its own browser-side queue, feedback, volume,
or Atlas Journey state.
