# Build 45: Discover scrolling regression

Build 44 changed the mobile `.desktop-surface` from `display: contents` to flex to place Search above Discover/Library. The new flex container lacked a definite height. Its percentage-height child expanded to the content height, while the phone frame retained hidden overflow. Discover and Library could not scroll.

A browser fixture using the real AppShell and production CSS at 402x874 reproduced a 3293px container inside an 874px phone frame; the child had no scrollable overflow. The fix constrains the container to the frame height and lets its content flex and shrink, retaining an 820px scroll viewport for 3239px of content. Search retains its button height.

Verified pointer scrolling in Discover (scrollTop 874) and Library (1748), tab navigation, Search opening and Escape dismissal with focus restoration, and desktop overflow at 1280x900. Temporary fixture and viewport override were removed. This is browser regression evidence, not a physical iOS acceptance claim. The user's new freeze submission was not yet returned by Apple at investigation time; latest returned report was Build 43 at 13:24 UTC. A full UI hang beyond scrolling would require additional investigation.
