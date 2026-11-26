# Sonic Atlas M6 Completion Evidence

Date: 2026-08-29

## Source State

- Repository: `example-user-projects/navimuse`
- Final source head: `09a78bc` (`Merge pull request 'fix: derive Atlas reroute start from queue state' (#174)`)
- Live deployment: `https://navimuse.example.com/` and LAN service `http://192.168.1.242:8099/`
- Deployment host: Mac mini Docker container `navimuse`
- Runtime health at final verification: `/api/health` returned `ok: true`; Navidrome and AudioMuse each returned HTTP 200.

## M6 Acceptance Matrix

| M6 requirement | Evidence |
| --- | --- |
| Integrate Atlas as the primary Sonic surface | PR #166 through PR #174 place the planner, overview, fallback, lifecycle, and renderer resilience in the Sonic surface. |
| Implement Follow, Overview, and Explore camera modes | PR #166 added the modes. Live authenticated verification exercised Follow, Overview, and Explore with the active route attached. |
| Preserve current track, route, and destination through every LOD | PR #167 added semantic LOD preservation. Live verification confirmed current and destination stayed visible in Follow, Overview, and Explore. |
| Make preview, start, skip, dislike, destination change, and reroute truthful | PR #171 persisted route history and truthful skip/dislike/reroute state. PR #173 and PR #174 fixed active-reroute start selection found during the live proof. |
| Provide a complete ordered Journey alternative for keyboard and screen readers | PR #168 added the ordered fallback. Live verification used the fallback to confirm current, skipped, upcoming, and completed destination states. |
| Save, resume, revalidate, and visibly repair Journeys | PR #169 added save/resume/revalidation/repair behavior. Live verification reloaded the app after starting a Journey and saw `Saved Journey revalidated and remains attached to the current queue.` |
| Maintain playback through renderer loss and AudioMuse degradation | PR #170 added renderer-loss and async failure resilience without stopping playback. Full regression coverage remained green on final head. |
| Authenticated Journey planned, played, explored, rerouted, saved, resumed, and completed without map/audio divergence | Live authenticated verification on final deployed head completed the flow described below. |

## Live Authenticated Journey

The final live proof used Atlas-backed tracks discovered from the deployed AudioMuse map and Navidrome service:

- Initial start: `Scud` by Jeff Greinke.
- Initial destination: `Hypnotised (EP Mix)` by Coldplay.
- Reroute start after resume: `Maintain Circulation` by Jeff Greinke.
- Reroute destination: `Now This Is Fun` by Depeche Mode.

Observed flow:

1. Signed in through Pocket ID in the Codex in-app browser.
2. Started ordinary playback from an Atlas-backed track.
3. Previewed a 25-stop Journey. The preview showed `Latest route event: preview`, `Preview ready`, and `Ordered Journey sequence is not attached to the current playback queue`, proving preview did not mutate the queue.
4. Started the Journey. The UI showed `Latest route event: start`, `Active Journey`, and `ATTACHED TO CURRENT QUEUE`; stop 1 was current and the destination remained marked as a waypoint.
5. Exercised Follow, Overview, and Explore. Each mode preserved the attached route, current stop, and destination in the ordered fallback.
6. Skipped stop 1. The UI showed `Latest route event: skip`; stop 1 became `Skipped` and stop 2 became current.
7. Used `More track actions` -> `Dislike and skip this Journey stop`. The UI showed `Latest route event: dislike`; the disliked stop became `Skipped` and playback advanced to the next ordered stop.
8. Reloaded the app. The UI restored the Journey and showed `Saved Journey revalidated and remains attached to the current queue.`
9. Changed destination to `Now This Is Fun` by Depeche Mode. The first reroute preview failure exposed an active-Journey start-reference bug, fixed by PR #173 and hardened by PR #174.
10. On final head `09a78bc`, previewed the reroute. The UI showed `Latest route event: preview`, `Preview ready`, and the preview fallback was detached from the current queue.
11. Committed the reroute. The UI showed `Latest route event: reroute`, `Active Journey`, `ATTACHED TO CURRENT QUEUE`, current stop preserved, and destination updated to `Now This Is Fun`.
12. Advanced through the remaining ordered queue using the player authority. Current, skipped, and destination states stayed aligned between playback and Atlas fallback.
13. Let the final destination naturally end. The UI showed `Latest route event: complete`, `Completed ordered Journey`, `Now This Is Fun` as `Completed destination. Waypoint.`, and the player notice `Reached the end of the queue.`

No browser console warnings or errors were observed during the final live flow after PR #174 deployed.

## Fixes Landed During Final Proof

- PR #173: active reroute previews no longer resolve an Atlas stream reference as a raw Navidrome track ID.
- PR #174: active reroute previews derive the start from the current authoritative queue item ID, which also covers restored Journey state.

Both PRs passed Code Bot Review before merge.

## Verification Commands

Final functional fix verification before PR #174:

```sh
npm test -- test/atlasJourneyPlannerUi.test.mjs test/atlasJourneyController.test.mjs test/playerIntegration.test.mjs
npm test
npm run build
git diff --check
```

Results:

- Focused tests: 76/76 passed.
- Full tests: 487/487 passed.
- Production build passed with generated assets `index-BJT4eZt9.js`, `index-eTeZrjC5.css`, and `reglAtlasRenderer-5R1w0_uZ.js`.
- Whitespace check passed.

## Remaining Non-Blocking Notes

- The Atlas UI and its milestone gateways are functionally complete enough for
  M6 but need the separate M8 redesign and product polish gate before they should
  be treated as finished product design. The current
  [M8 placeholder](plans/NAVIMUSE_M8_PRODUCT_REDESIGN_PLAN_2026-08-29.md)
  reserves that work for the dedicated planning session.
- The target-track slider did not respond to keyboard or pointer automation during the live run, although its DOM min/max were `10..50` and the default 25-stop Journey completed successfully. Track-count control polish should be handled in the post-M6 UI follow-up unless it blocks a future acceptance gate.
- Search results can include ordinary Navidrome tracks that are not present in the Atlas projection. The planner returns a visible safe error for those tracks. A future UX pass should make Atlas eligibility clearer before selection.

## Conclusion

M6 exit evidence is satisfied on final deployed head `09a78bc`: an authenticated Journey was planned, played, explored, rerouted, saved, resumed, and completed without map/audio divergence, with contract tests, full regression tests, production build, Code Bot review, and live deployment evidence all tied to merged source.
