# Design Direction

## Baseline

The baseline is the waveform-hero player concept:

- Large rounded-square artwork.
- Full-screen adaptive color background derived from the current cover.
- Prominent waveform scrubber below artwork.
- Centered metadata with compact technical details.
- Large, thumb-friendly playback controls.
- Icon-forward secondary actions.

Reference mockups:

- `design/mockups/player-waveform-hero.png`
- `design/mockups/library-home-adaptive.png`
- `design/mockups/sonic-controls-light.png`

## Visual Rules

- Artwork is always square with rounded corners, never a circular vinyl substitute.
- Adaptive color must come from the active album art and drive both player and library surfaces.
- Dark and light mode must share structure, spacing, and hierarchy.
- UI should feel like a native music client, not a SaaS dashboard.
- Avoid nested cards, large marketing hero sections, and generic component-kit styling.
- Cards are only for repeated content such as albums, mixes, tracks, and recommendation rows.
- Main sections should be unframed surfaces over the adaptive background.

## Player

Required player elements:

- Album art.
- Waveform scrubber with elapsed and remaining time.
- Track title, artist, album.
- Codec/quality row.
- Favorite and rating controls.
- Previous, play/pause, next.
- Queue, similar/radio, lyrics, cast placeholder, and more actions.

Fallbacks:

- If AudioMuse waveform data is missing, show a standard progress rail.
- If artwork is missing, use a generated neutral cover and a restrained default palette.
- If AudioMuse has not analyzed the track, keep the player fully usable and label sonic features as unavailable.

## Library

Library surfaces should use dense but readable shelves:

- Sonic Mixes.
- Recently Played.
- Recently Added.
- Waveform Picks.
- Forgotten Favorites.
- Music Library and Live Music Archive filters.

The mini-player should inherit the current album palette and stay visually connected to the full-screen player.

## Accessibility

- Text must remain readable against all adaptive backgrounds.
- Minimum touch target is 44 px.
- Motion and blur should respect reduced-motion preferences.
- Color extraction must enforce contrast, not simply mirror dominant cover colors.

