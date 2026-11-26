# ADR-008: Optional ordinary queue continuation

Accepted September 12 under the owner's five-step daily-listening work and
TestFlight #109. The accepted provider is the existing authorized AudioMuse
similarity adapter, resolving library tracks through the active BFF music binding.
No new discovery service, Atlas route, playback engine or queue authority is added.

Autoplay after queue is off by default and independent of Journey extension. When
enabled, an ordinary album/queue prepares at most 12 deduplicated library tracks
when fewer than three upcoming songs or five minutes remain. The provider seeds
from the queue tail. Generated additions retain occurrence identity and a typed
`autoplay: true` marker. Explicit insertions keep precedence. Settings persistence
accepts an actual boolean in both legacy and account mode.

Local playback appends through the shared queue; WiiM uses the existing serialized
coordinator and survives client suspension. Native cache-ahead sees the resulting
queue normally and preserves the listener's selected format. Neither feeder starts
or selects a track. Natural-end handling advances only committed tracks. Late
results after stop/end, output replacement, revoked authorization or disabled
continuation cannot restart playback. There is no fallback to another account's
AudioMuse credentials. Account-mode provider unavailability leaves queued music
playing and reports an unavailable-discovery notice.

Repeat, pause-after-current, disabled queue advancement, radio, downloads and
attached Journeys suppress ordinary generation. Disabling the behavior removes
unplayed automatic additions, retaining current and explicitly chosen music.
Existing Journey continuation remains separate. Failed analysis is bounded and
has a 60-second cooldown. Queue size stays at most 1000; recent sequential history
is retained when trimming. The local shuffle queue stops adding at that bound and
asks the listener to clear played tracks. Similar music may repeat after retained
history is exhausted.

Verification: 1,112 Node checks passed, including actual mounted native-event
queue advancement, no-client WiiM continuation, opt-out, repeat, request races,
timeout and authorization regressions. Production build passed. Physical iPhone
and WiiM listening remain owner acceptance checks on the forthcoming release.
