# Atlas point inspection v1

Status: prerequisite for review; no endpoint or UI is enabled by this change.
This extends the accepted bounded Branch B interface without changing projection
coordinates, routing semantics, renderer ownership or the authoritative queue.

The intended endpoint is POST /api/atlas/points/inspect. Its request is a strict
object with contractVersion `sonic-atlas/v1`, kind `atlas-point-inspection-request`,
requestId, pointId and identity. Identity contains contractVersion, projectionId,
projectionVersion and projectionDigest, using the existing Atlas identity parser.
Clients send no coordinate, raw upstream ID, stream URL or authorization claim.

The success response retains requestId, pointId and exact identity, changes kind to
`atlas-point-inspection`, and adds coordinate {x,y} and playback. Playback uses the
same bounded fields as resolved Journey stops: opaque signed trackRef, title,
artist, optional album, nonnegative durationSeconds and opaque artworkRef. No new
stream/token format is introduced. Metadata strings must render as text, not HTML.
All parsers reject extra/private fields and return detached frozen response data.

`validateAtlasPointInspectionAgainstRequest` rejects a response from another
request, point, projection ID, version or digest. Consumers must additionally
cancel stale requests, gate publication on the latest local selection/session,
and compare coordinates with the selected validated tile point. A matching syntax
or request ID is not proof that a track is authorized or in the projection.

## Required BFF implementation before consumption

- Require the existing application authentication and write-origin checks before
  reading/handling the request; apply bounded request-body parsing.
- Lease the projection and verify its identity exactly against the request.
- Resolve pointId from that lease's private mapping; never trust client metadata,
  coordinates or a separately supplied raw track ID.
- Check playable track access through the current authorized upstream binding.
  Future multi-account use must scope both lease membership and track access to the
  immutable authorized account/library; the current appliance session is not a
  substitute for that migration.
- Build safe metadata and existing signed BFF transport references. Never return
  upstream credentials, paths, private service addresses, raw IDs or provider URLs.
- Do not refresh to a new projection halfway through an inspection. Return an
  IDENTITY_MISMATCH if the requested projection is stale.
- Use no-store responses for inspection metadata. Avoid publishing raw exception
  messages or lookup details that distinguish unauthorized private libraries.

## Outcomes

Use the existing structured `atlas-resolution-error` format. Add POINT_NOT_FOUND
for a point absent from the authorized projection and POINT_NOT_PLAYABLE for a
resolved point whose track cannot be played. Both have fixed public messages and
are not automatically retried. Reuse IDENTITY_MISMATCH, UPSTREAM_UNAVAILABLE,
UPSTREAM_INVALID_RESPONSE and RESOLUTION_TIMEOUT as appropriate. HTTP mapping,
authentication failure handling and live service behavior remain implementation
work, not claims established by these pure parsers.

## Remaining acceptance

Review and land this boundary before implementing its consumers. Then implement
BFF membership/authorization tests, exact-coordinate picking, stale-selection
cancellation, accessible inspector actions under the existing queue restrictions,
and full-population native QA. This contract alone does not complete map selection.
