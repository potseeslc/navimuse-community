# Build 46 Search safe-area spacing

The Search trigger introduced above Discover/Library sat behind the iOS status area. The scrolling child independently applied the safe-area offset, leaving a large gap below Search. On mobile, the bounded Search container now owns the top safe-area padding, and its scroll child resets its separate top offset and percentage height. Build 45's bounded scrolling is preserved.

Browser fixture used the real AppShell and stylesheet with a simulated 62px top inset at 402x874: Search starts at y=76, below the inset; the scrolling surface starts at y=116 with height 758 and content height 3239. Pointer scrolling reached scrollTop 874. Library has the same bounds and tab navigation works. Temporary fixture and viewport override removed. Physical iPhone acceptance remains required.
