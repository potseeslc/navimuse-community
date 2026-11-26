# Sonic Atlas Bounded Journey BFF

M5.4 implements the authenticated service boundary for the accepted bounded Branch B
Journey contract. It does not mutate the client queue or add Journey UI.

## Endpoint

```text
POST /api/atlas/journeys/plan
```

Requires:

- authenticated NaviMuse app session;
- `Content-Type: application/json`;
- `X-Requested-With: NaviMuse` or trusted server equivalent;
- shared `sonic-atlas/v1` ordered-waypoint request.

Native CORS permits `X-Request-ID`. One validated request ID is used for success,
errors, and protected logs.

## Immutable projection lease

Planning acquires one immutable map snapshot lease before any waypoint resolution.
Every waypoint alias, raw AudioMuse ID, returned stop alias, coordinate, and final
projection identity comes from that exact snapshot. TTL refresh or settings
invalidation cannot mix projections within a Journey.

Raw provider mappings and reverse lookup maps live only inside BFF worker/snapshot
memory. Reverse stop lookup is O(1).

## Planning and resolution

For every adjacent waypoint pair:

1. resolve opaque point aliases privately;
2. verify both endpoints through Navidrome;
3. call AudioMuse `/api/find_path` with explicit:
   - `max_steps=targetTrackCount`;
   - `path_fix_size=false`;
   - `path_space=audio`;
4. disable redirects and enforce timeout plus bounded 8 MiB JSON body;
5. require two or more and no more than target stops;
6. require exact raw start/end IDs;
7. concatenate segments and remove only the shared boundary;
8. require every stop in the leased projection;
9. resolve unique stops through Navidrome with bounded concurrency;
10. freeze the allow-listed shared Journey response.

One 45-second Journey deadline and request abort signal flow through AudioMuse and
Navidrome work. Timed out work returns `RESOLUTION_TIMEOUT`; projection supersession,
upstream outage, malformed input, and resolution failures retain distinct safe codes.

## Public identifiers and playback

Public Journey, segment, stop, queue-item, and point identifiers are opaque aliases.
`playback.trackRef` is a persistable authenticated AES-GCM reference containing only
the private raw song ID and projection digest. It is usable only through:

```text
GET|HEAD /api/atlas/tracks/:trackRef/stream
```

The BFF decrypts the reference and proxies through the existing Navidrome media
boundary. Tampering, wrong keys, malformed references, and oversized values fail
closed. No raw ID, cover ID, service URL, stream URL, token, embedding, mood, or
AudioMuse response field appears in the public Journey.

Artwork reference support remains deferred rather than exposing an unusable alias.

## Queue authority

The response is a frozen Journey plan and queue-binding input. This PR does not
replace or mutate the queue. M5 client wiring must atomically map stops into the
existing queue and prove playback using only public `trackRef` values before M5 exit.

## Safe errors

All errors use the shared fixed-catalog `atlas-resolution-error` envelope. It exposes
only request ID, code, safe message, retryability, optional waypoint/segment/stop
indices, and opaque incident ID. Upstream messages, IDs, URLs, bodies, stacks, and
credentials never cross the boundary.
