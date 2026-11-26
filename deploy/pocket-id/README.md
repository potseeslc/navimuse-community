# Pocket ID passkey association for NaviMuse

This deployment is specific to `id.example.com` on the Mac mini. It preserves the existing Cloudflare Tunnel target `http://pocket-id:1411`, loopback port 1411, external `music_services` network, Pocket ID image, data volume and encryption-key file. Pocket ID moves to `pocket-id-backend` on that network. The `pocket-id` Caddy frontend serves only the two Apple association paths and proxies every other request to Pocket ID. HTTPS remains terminated by the existing tunnel. The trusted network matches the existing Pocket ID trust configuration.

Deploy the compose file and Caddyfile into `/Users/developer/docker/pocket-id`, beside the existing encryption.key. Back up the original compose first. Stop the old Pocket ID before starting the renamed backend so there are never two writers to its SQLite database; take a stopped-volume backup. Keep both existing image digests pinned. Use `docker compose up -d --wait` and verify both services healthy, both association paths return JSON without redirects, OIDC issuer stays `https://id.example.com`, the login page loads, and Apple's association CDN contains the same app ID.

Rollback: stop the frontend and backend, remove the stopped `pocket-id-backend` container to prevent restart as a second database writer, restore the backed-up original compose, and recreate its `pocket-id` service. Do not delete or recreate the data volume or encryption key. No database migration is part of this change.

The association document allows only `ABCDE12345.com.developer.navimuse` to use web credentials for this domain. It grants no app links, wildcard app identities or login bypass. A user still completes the ordinary Pocket ID passkey ceremony.
