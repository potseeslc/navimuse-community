# September 10 owner QA and recovery pass

Build 9, iPhone 17 Pro, iOS 26.6.1. Owner accepts the accented WiiM cast
indicator and cleaned player header from PR 340. AirPlay and radio remain open.

Fresh Chrome TestFlight list reviewed September 10. The newest radio screenshot,
report AEhuyrpNcfTT3rMs1LRRMK4, shows an existing album playing on WiiM and
“This source cannot transfer to WiiM Direct.” The next report says selecting a
station dismisses the station card without starting radio. This is evidence of
an unsupported remote transport plus premature sheet dismissal, not proof of a
native process crash. Crash-feedback page was not checked in this pass.

## Candidate repair

- Station selection explicitly says playback will move to this device and stop
  the named WiiM output. Await confirmed release before starting local radio.
  Never fall back to local playback after a failed/uncertain release.
- Keep the sheet visible while starting; failed starts show an inline error and
  permit retry. Close only on success.
- AirPlay while WiiM owns playback offers a switch to this device instead of an
  inert disabled row. Keep the output sheet open after release so the user can
  invoke Apple's picker with a fresh tap. Local native picker implementation is
  unchanged and still requires physical acceptance.

## Captured remaining feedback

- AirPlay button still does not function: continue physical native investigation
  after verifying which output owns playback; do not mark resolved by UI tests.
- Landscape remains broken on the phone.
- Streams fail across low connectivity/network changes and need song switching
  to recover.
- Offline/download mode requested, with explicit cellular-download preference.
  Requires a separate storage, authorization and native playback plan.
- Server-discovered WiiMs appear away from home, possibly while using a VPN.
  Need explicit distinction between nearby phone routes and remote home speakers,
  with an owner preference for remote control; no reliable LAN inference from
  public server reachability alone.
- Radio lock-screen artwork missing.
- Player overflow menu should match the app and omit duplicate lyrics actions.
- “This can be removed” screenshot needs visual inspection before interpretation.

## Verification

Actual React station-sheet tests cover delayed handoff, failed stop, retained
sheet/error, and successful retry. Output-picker test proves the WiiM-to-local
action is invoked without opening AirPlay prematurely. Production build passed.
Device playback, AirPlay route presentation and network recovery are not claimed
as passed by these automated checks. No household audio was started.

## Power-outage WiiM recovery

Owner confirmed the selected WiiM was powered off during the outage. After a
failed stop, the output sheet now offers an explicit disconnect confirmation.
The server requires unreachable state, current revision, account ownership and
acknowledgment. Disconnect revokes grants, persists a released session and records
that stop was unconfirmed. It never sends a new playback command; local playback
remains paused until the listener starts it. A restart does not reattach it.

Validation: 33 WiiM/client/output/radio tests passed; production build passed.
Native AirPlay presentation still needs physical iPhone acceptance. This change
updates the shared web UI and BFF, with no native binary changes.
