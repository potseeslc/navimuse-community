# iPhone Duo adaptive layout direction

Owner instruction, September 13, 2026: “I am going to get that phone so we should
build with that in mind.” This extends the bounded iOS pilot's design and future
physical acceptance scope. It does not replace current iPhone support or authorize
a separate playback engine.

## Product requirements

- Adapt to available window size and safe-area insets, not a device-name check.
- Compact layout: retain the familiar one-column navigation and persistent player.
- Expanded layout: explore Library/detail panes and player/queue side by side;
  prioritize readable content and reachable controls over stretching phone cards.
- Preserve selected page, scroll position, search, queue, track position, open-player
  state and speaker ownership when resizing or changing display configuration.
- Keep one playback authority. React layout changes must not remount the transport,
  recreate native playback, reset a speaker session, or duplicate Now Playing cards.
- Keep interactive controls within supported safe areas. Validate fold and camera
  constraints against Apple's documentation before encoding platform dimensions.
- Support portrait/landscape, light/dark, Dynamic Type and VoiceOver. Respect reduced
  motion; avoid large artwork movement or disorienting transitions on resizing.
- Keep the web app and existing iPhones usable at their current viewport sizes.

## Implementation sequence

1. Confirm official window geometry, safe-area and adaptive-layout behavior against
   Apple documentation and the installed SDK. Record sources and exact versions.
2. Audit AppShell, full player, Queue/Lyrics, Home shelves, Library/detail and artist
   pages for fixed dimensions and layout-dependent state lifetime.
3. Prototype compact/expanded layouts with existing design tokens and components.
   Add container queries where components depend on pane width; do not infer device
   posture from width alone. Retain stable transport and queue ownership above panes.
4. Verify repeated resizing, navigation restoration, output continuity and accessible
   focus in browser/simulator. Treat these as preliminary evidence.
5. On the owner's phone, verify supported display/posture transitions, touch reach,
   safe areas, rotation, Lock Screen, direct UPnP playback and background recovery.

## Reference kit

https://www.figma.com/community/file/1681029753837117390/iphone-duo-adaptive-design-starter-kit

Inspected Community description September 13, 2026. Noah Elhadedy's unofficial kit
advertises device-state frames, safe-area/folding-region guides, split views,
adaptive patterns and light/dark styles. The author distinguishes official,
derived, recommended and illustrative values. Use it for visual exploration;
verify each platform measurement against Apple before shipping. The page lists
CC BY 4.0; preserve attribution if copying kit assets. No kit assets have been
imported, and no device-specific dimensions have been adopted.

This document establishes design direction, not implemented adaptive support.
