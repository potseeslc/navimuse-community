# ADR-005: WiiM remote playback sessions

Accepted implementation scope: owner request 2026-09-09 to implement plan PR #334 in the installed app and web app. Direct audition confirmed audio and receiver artwork on the existing Master Bedroom/Living Room group. This does not complete M8.

Keep local iOS AVPlayer and browser media playback unchanged when local output is selected. WiiM Direct is a server-owned session in the existing Node BFF, not a fake audio deck. Client state is a projection and command source. Use the existing shared queue transition/mutation functions, occurrence identity and controls. Do not transfer attached Journeys, generated radio, downloads or arbitrary URLs in this release.

Authenticated commands carry command ID and expected revision. A serialized coordinator enforces one session per principal and exclusive group-member ownership. Durable session state and media grants live separately under /data. Resolve authorization and the current upstream binding for every background operation and media request. Cookies may expire while a permitted session plays; logout, account disablement, binding revocation and feature disablement terminate ownership and revoke grants. No global credential fallback for account mode.

Grants are opaque, resource-specific, expiring and revocable, support repeat GET/HEAD and Range, and contain no upstream credentials. Advertise an explicitly configured LAN base URL. Device addresses and certificate pins are deployment-approved configuration. Only fixed WiiM UPnP/HTTPS actions and paths are allowed; no arbitrary URL proxy or external XML entities. Keep existing Docker networking.

Transfer pauses and freezes the current owner before starting the next. Confirm remote stream identity and PLAYING before committing a handoff; on failure keep local playback paused. Never start local audio automatically after remote errors. Reattachment must not load local decks. Restart and uncertain stop/source observations reconcile before advancing; source takeover suspends scheduling instead of fighting the other controller.

Shared Play-on UI distinguishes local, platform AirPlay selection and WiiM Direct. Native iOS uses Apple's supported route picker; browser uses feature detection with honest fallback. WiiM Home owns membership. No arbitrary group edits, local crossfade/gapless promises, or independent multi-zone queues.

Delivery stays feature-gated until account isolation, media ranges, duplicate commands, queue advancement without clients, pause/seek/skip, ownership/source/restart failures, both transfers and physical route/artwork tests pass. W0 confirms only one FLAC and group artwork. Native picker and sustained hardware matrix remain acceptance work.

September 9 owner feedback explicitly authorizes automatic discovery of WiiMs on the network. Replace the single-device deployment list with a host-side LAN SSDP registry, retaining the manual configuration as a fallback. Discovery accepts only private responder addresses at the fixed description/control endpoints, verifies WiiM model/UUID, pins the first certificate, and refuses changed pins. A remembered speaker may move to another private address with the same UUID and pin. No client-supplied addresses, group edits, or public-host probing are introduced. The host job runs outside Docker Desktop's multicast-isolated VM; the BFF reads its bounded, read-only registry. Device reachability is rechecked for the picker and transport commands.

Deployment verification found Docker Desktop's direct LAN speaker-control path unreliable while the host's path responded promptly. The host adapter therefore provides fixed device commands over an authenticated local endpoint in addition to discovery. Its random key is a host/BFF secret, never a browser credential. The adapter receives a known UUID and a bounded action, not arbitrary addresses or commands; load accepts only this BFF's opaque media-grant URLs. This is a transport adapter, with no parallel queue, account store, music credentials or playback scheduling. The BFF retains the full ownership and authorization boundary.

## September 11: ordinary Journey transfer

Owner instruction “do it” approves repairing #397. Supersedes the initial exclusion of non-Atlas generated Journeys: Track, Artist and Genre Journeys can transfer their current occurrence queue, seed identity and captured automatic-continuation preference. Artist DJ transfers as a finite queue. Frozen Atlas routes, downloaded sources and arbitrary/internet-radio URLs remain excluded with a source-specific preflight message before local playback is paused.

The existing BFF coordinator remains the only remote queue and transport authority. Its feeder requests bounded similarity batches without holding the transport lock, resolves every candidate through the session's authorized Navidrome binding, and commits only to the same still-owned Journey. Release, replacement, revocation and shutdown invalidate late results. Refill failures retain the existing queue and retry after a cooldown. The queue retains 50 prior occurrences when trimming, at most 1000 total occurrences and 1000 recently seen song IDs. No extra player or host-side queue is introduced.

Local feeder work is invalidated at handoff. Returning local uses the confirmed released-session queue and controls, preserves the Journey seed, and prepares playback paused. A lost transfer response reconciles before release and restores that latest server snapshot. Same-Journey restoration cannot revive an older pending local refill.

The current legacy deployment uses its approved AudioMuse service. Local-account mode has no AudioMuse binding yet; the new feeder explicitly refuses global credentials for those principals and keeps queued playback available with a discovery notice. This does not authorize an account-service fallback. Physical WiiM acceptance remains an owner device check, separate from simulated protocol/state-machine verification.

## September 12: start a Journey on the selected speaker

Owner feedback #397 also authorizes starting Track, Artist, Genre and Artist DJ
Journeys while WiiM Direct is selected. The client uses the existing discovery
feeder only to prepare candidates, with no local queue or audio effects. It sends
one validated `replace` command to the existing session. The coordinator hydrates
tracks through the current principal and remains the only remote playback owner.
Failed, timed-out, superseded and changed-output preparation leaves playback alone.
No release/transfer cycle or local autoplay is involved. Physical speaker testing
remains separate from the coordinator and client regression evidence.

## September 12: preserve playback when WiiM Home changes a group

The owner reported playback stopping after starting a song in Bedroom and creating
an external group in WiiM Home. Membership changes previously called `release`,
which stopped an owned transport and revoked its stream grant. Group observation
now adopts changed membership only when the leader still reports the exact current
NaviMuse URI and a playing/paused state, with no competing principal reservation.
If Bedroom becomes a follower, only an already approved adapter whose group includes
Bedroom and whose transport reports that same URI can become the session leader.
This never sends a load, play, stop, or grouping command to make ownership true.

A changed group gets 20 seconds of observed settling time with its current queue
and grants retained and transport commands suspended. Verification failure or an
ownership conflict ends automatic control without stopping another source. Grants
are then revoked and output reselection is required. Reset completion observations
when adopting topology so a regrouping stop cannot advance the queue. Existing
account authorization, revocation, explicit release and local-paused rules remain.
Physical continuity across WiiM firmware grouping behavior remains a device check;
the coordinator regression fixtures do not prove that the receiver itself never
interrupts audio during grouping.
