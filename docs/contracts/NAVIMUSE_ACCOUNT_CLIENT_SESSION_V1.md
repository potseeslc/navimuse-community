# Account client session service v1

Status: client integration prerequisite; existing screens still use legacy session APIs.
Current integration baseline: `50c5cdc31e8e532a24ee9136aa52c5ef6bbbd80d`.

The shared accountSessionService exposes readSession, setup, login, logout and renew.
It freezes its BFF destination at construction and uses credentialed, no-store JSON
requests with the required X-Requested-With header and redirect refusal. Passwords
are passed unchanged; neither passwords nor cookie values are stored by this service.
A server change must construct a new client rather than reusing an old session service.

Session responses pass the reviewed exact public parser. Authenticated responses with
null queueScope retain identity but grant no queue namespace. The service bypasses the
legacy apiFetch 401 event, so a failed login or renewal cannot prematurely trigger the
legacy logout UI. Request failures use stable codes and generic text, never raw response messages
or transport causes. Requests have a 15-second deadline; uncertain mutation outcomes
are not automatically retried. The UI must preserve queues and offer explicit recovery.

All operations serialize within the shared document instance. Renewal calls share one
promise. Mutations and reads use the same exclusive Web Lock when available, keyed by
the canonical account endpoint. A queued renewal rechecks the session while holding
the lock; another document's successful renewal therefore avoids another rotation.
See the [Web Locks specification](https://w3c.github.io/web-locks/). Locks coordinate
only cooperating contexts in the same storage bucket, not separate browser profiles,
PWA/native cookie stores or arbitrary applications. No lock failure silently falls back
to uncoordinated work. When the API is absent, setup/login/logout/renew reject with
ACCOUNT_COORDINATION_UNAVAILABLE before dispatching requests. readSession remains
available for authoritative reconciliation. A local promise queue cannot coordinate
separate documents, and the client cannot undo a late HttpOnly Set-Cookie response;
server atomic device rotation alone does not serialize competing login responses.
The UI must report this capability requirement and preserve existing queues. Native
WebView capability and coordination still require live acceptance evidence.

Renew reads session first. Authenticated, setup-required and migration-required states
return without attempting rotation. Signed-out proceeds to one bodyless refresh POST.
A 409 REFRESH_NOT_CURRENT performs session rechecks immediately, after 100 ms, then
after another 300 ms. A recovered authenticated session wins. If all reads still show
signed-out, SESSION_RECHECK_REQUIRED remains an explicit retryable uncertainty, not an
automatic logout/queue deletion. The UI may offer sign-in and retry. Network failures,
invalid responses and timeout never synthesize signed-out state. Explicit logout must
succeed before the UI treats it as confirmed; a successful renewal completes before a queued logout
begins. Transport timeout still leaves an uncertain server-side outcome and must not
be treated as proof of logout or cancellation. After an uncertain logout, the UI can
explicitly call readSession to reconcile with the server, or retry logout. A real HTTP
regression drops the logout response after committed revocation, retains stale cookies,
and verifies that readSession reports signed-out and a logout retry clears cookies.

## Evidence and integration gates

Deterministic tests cover shared renewal promises, logout ordering, two simulated
document clients using one lock manager, delayed conflict recovery, unresolved
conflicts, malformed responses, transport failure, timeout recovery and exact password
preservation. A real HTTP test uses the assembled runtime and Argon2 service for setup,
wrong-password rejection, login, remembered renewal and logout. Its Node cookie harness
models Path matching; it does not establish HttpOnly/SameSite or native cookie behavior.

Connect the service to the real onboarding/session UI only with account runtime mode
selection and explicit state-generation handling. Queue writes/restores must pause on
null scope; no fallback namespace may be invented. Owner management, UI wire-up,
native and HTTPS cookie checks, real library playback and all M8 acceptance
gates remain open. No deployed authentication behavior changes in this prerequisite.

Initial validation before the required-lock change on Node v26.7.0: seven focused client/HTTP tests and all 804 suite tests
pass with zero failures/skips; production build passes. Logs:
`/tmp/navimuse-account-client-focused-http.log`, `/tmp/navimuse-account-client-all.log`,
and `/tmp/navimuse-account-client-build.log`. Existing bundle-size warning remains.
The full suite includes canonical lock-name resolution added after the focused run.

[Actual two-tab Chrome evidence](../evidence/m8/account-session/browser-qa-results.md)
covers one refresh for competing renewals, HttpOnly visibility, refresh-only device
cookie routing, service-failure recovery, and cross-tab logout.

The lock-capability regression failed against the former uncoordinated fallback and
passes with explicit pre-dispatch rejection. A second regression holds a renewal in
one document while another logs into a different account; login waits, and both
subsequent session reads observe the new account. The real HTTP test injects a lock
adapter for its isolated single-client cookie harness; it does not claim browser
coordination from that adapter.

[Revised coordination browser evidence](../evidence/m8/account-session/coordination-qa-results.md)
records the capability rejection and actual two-tab renewal/logout on the updated
client. Current combined validation: nine focused tests, all 817 tests, build passed.
