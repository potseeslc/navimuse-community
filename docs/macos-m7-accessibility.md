# macOS M7 Accessibility Audit

M7 accessibility evidence must prove that the release candidate is operable and
understandable with macOS assistive technologies and keyboard-first workflows.
This audit is release hardening, not the M8 visual redesign.

## Surfaces

Audit the release candidate across:

- app shell navigation;
- Home;
- Library;
- Search;
- Sonic Atlas planner, overview, camera controls, and ordered Journey fallback;
- player controls and now-playing metadata;
- queue overlay;
- track action menus;
- Settings and locked/session-expired states.

## Required Checks

1. VoiceOver can identify the current surface, primary navigation, current track,
   transport controls, queue state, and active Sonic Atlas Journey state.
2. Keyboard navigation reaches every primary command without trapping focus outside
   modal dialogs or menus.
3. Focus order follows the visual task order for each surface.
4. Modal dialogs and menus restore focus to their opener on close.
5. Contrast passes for primary text, secondary text, focus indicators, buttons,
   warnings, disabled states, and map/fallback labels.
6. Reduced-motion mode avoids nonessential animation and preserves playback and
   Journey state changes without relying on motion alone.
7. Sonic Atlas has a complete non-map ordered Journey alternative for screen
   readers and keyboard users.
8. Error, loading, empty, degraded-service, and session-expired states are announced
   or exposed as text, not only by color or visual position.
9. The packaged macOS app and PWA breakpoints both pass the relevant checks; any
   difference must be recorded with reason and impact.

## Evidence Record

For each checked surface, record:

- timestamp, commit SHA, package version, macOS version, and app origin;
- viewport or window size;
- input method used;
- VoiceOver observation when applicable;
- keyboard path and focus-restoration result;
- contrast source, screenshot, or computed evidence;
- reduced-motion observation when applicable;
- result: passed, failed, blocked, or not applicable with reason.

## Current Status

Status: automated accessibility coverage passed; live VoiceOver and contrast
audit still pending for final release signoff.

Automated release hardening coverage now exercises the primary accessibility
contracts across the current client:

- primary navigation and desktop shell expose labeled landmarks for NaviMuse,
  current surfaces, and the now-playing/queue region;
- mini-player and expanded-player transport controls expose stable accessible
  names for previous, play/pause, next, seek, volume, queue, shuffle, repeat,
  rating, favorite, and track actions;
- queue overlay is a modal dialog with `aria-modal`, inert background content,
  deterministic close focus, Escape dismissal, Tab trapping, complete queue
  indices, and an `aria-current` now-playing row;
- track actions use an anchored `role="menu"` / `role="menuitem"` surface with
  Escape/outside dismissal, arrow-key movement, and opener focus restoration;
- locked, loading, empty, degraded, status, and error states are exposed through
  textual `role="status"`, `aria-live`, or `role="alert"` surfaces;
- Sonic Atlas planner and overview expose destination results, planning status,
  renderer errors, camera controls, ordered Journey fallback, current-step
  state, and queue-authoritative fallback playback controls;
- responsive browser fixtures verify visible focus targets and stable control
  geometry across mobile, tablet, desktop, and wide desktop layouts;
- reduced-motion CSS is present through the `prefers-reduced-motion: reduce`
  media query.

Targeted accessibility verification:
`NODE_ENV=test node --test test/playerIntegration.test.mjs test/queueEntry.test.mjs test/queueOverlayBehavior.test.mjs test/layoutBrowser.test.mjs test/atlasOverview.test.mjs test/atlasJourneyPlannerUi.test.mjs`
passed 89/89 on 2026-08-30.

Remaining manual observation: run the signed packaged app with macOS VoiceOver,
keyboard-only navigation, reduced motion enabled, and spot contrast checks across
Home, Library, Search, Sonic Atlas, queue, player, Settings, and locked/session
expired states before claiming final M7 accessibility signoff.
