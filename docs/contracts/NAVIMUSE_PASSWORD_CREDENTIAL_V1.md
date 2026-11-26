# Password credential v1 prerequisite

Status: hashing/verification helper implemented; enrollment/login/migration not wired.
Extends the account-v1 boundary. `argon2@0.45.1` is an exact production dependency,
with transitive integrity records in package-lock.json. Use Node >=22.23.2, matching
production. The native package loaded and passed tests on local macOS arm64 and the
isolated deployed Linux arm64/Node runtime.

## Private credential and bounded work

A record contains exactly `{ version: 'argon2id-v1', hash: '<PHC string>' }`. The hash
uses Argon2id version 19, 65536 KiB memory, three iterations, one lane, a fresh
library-generated 16-byte salt, and 32-byte output. No pepper or homemade hash
format is introduced. Verification delegates to the maintained native library.

The PHC representation accepted for this version is the pinned library's canonical
`m=65536,p=1,t=3` encoding. Its salt and digest must have canonical base64 encoding.
Unsupported algorithms, costs, versions and malformed records use a dummy credential
at the same work factor and always fail authentication. An attacker-controlled hash
cannot request excessive memory or iterations. Supporting another credential format
requires an explicit version/migration change; this is not a PBKDF2 verifier.

Initialize one password service per BFF process before accepting requests. It creates
a private random dummy credential once and permits at most two active hash/verify
operations with no unbounded queue. Excess calls fail with PASSWORD_BUSY regardless
of account existence. New password hashing requires at least 15 Unicode code points;
all accepted input is well-formed Unicode and at most 1024 UTF-8 bytes. Passwords
are never trimmed, normalized or case-folded. Invalid input is bounded independently
of record validity. No helper logs passwords or hashes.

## Deployment-runtime measurements — 2026-09-06

Host: Macmini9,1, Apple M1, 16 GiB RAM, macOS 15.5. Test container: Linux arm64,
Node v22.23.2, existing pinned image `navimuse:m8-tabs-6f5dd91`, no live data mounts.
Installation used npm ci from the candidate lockfile. Synthetic passwords only.
Reproduce with `node scripts/benchmark-password-credentials.mjs`.

| Measurement | Result |
| --- | --- |
| Hash, 10 samples | 107.3–181.8 ms; median 138.9 ms |
| Verify, 10 samples | 107.3–184.6 ms; median 155.5 ms |
| Two concurrent verifications | 192.4 ms total |
| Observed event-loop p99 | 15.1 ms |
| Process maximum RSS | 186016 KiB |

Three focused tests passed in that container: salt freshness/exact byte matching,
missing and malformed/excessive-cost records, and input/concurrency limits. These
measurements support using Argon2id on the actual runtime; no scrypt fallback is
needed on this evidence. This is a small synthetic benchmark, not load/DoS testing,
constant-time proof, or proof of uninterrupted listening under authentication load.

## Required before credential enrollment or login

- Wire enrollment through `enrollPassword`, including the screening policy below;
  do not expose low-level `hashPassword` as an enrollment shortcut.
- Atomically persist the first account and its credential after the setup/migration
  ceremony; hash off the database transaction and recheck uniqueness/authority at
  commit. Verify legacy PBKDF2 only for controlled migration, then create Argon2id.
- Apply account/network throttling before expensive work. Use generic login outcomes
  and dummy verification for missing/disabled accounts. The busy error must not
  expose whether an account exists; map it consistently at the future route.
- Store credentials only in the private BFF database. Return no credential record in
  session/account JSON, diagnostics, UI state or logs. Require recent authentication
  for replacement, and revoke affected sessions atomically.
- Add login enumeration, rate-limit, failure, credential-update, migration, restart,
  and real-device tests before enabling routes. Test resource contention alongside
  actual streaming on the release candidate.

References checked 2026-09-06: [node-argon2](https://github.com/ranisalt/node-argon2)
for the maintained hash/verify API and supported prebuilt platforms;
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
for Argon2id guidance and work-factor evaluation. The concrete measurements above
come from NaviMuse's isolated runtime test.

## Missing-account work regression

The follow-up test starts two missing/unsupported-record verifications, then checks
that a concurrent hash is refused with PASSWORD_BUSY until they finish. Both checks
return false afterward. This tests that invalid-record paths consume asynchronous
work slots rather than returning immediately; it avoids flaky wall-clock thresholds.
It is not a proof of constant-time login or a substitute for route enumeration tests.

This branch now includes merged storage prerequisite #275 through main b767bc1.
Credentials are still not persisted or connected to an authentication route.

## Enrollment screening policy

`enrollPassword` screens before hashing. The default BFF-only screener checks the
completed password against Pwned Passwords using an HTTPS request with only the
first five SHA-1 hex characters and requests response padding. The complete digest,
password, username and account ID are never sent. SHA-1 is only the corpus lookup
format, not credential storage. A matching suffix with positive prevalence rejects
enrollment; zero-count padding does not.

This is an external service dependency for new-password enrollment only. Existing
login verification never uses it. The screener has a five-second deadline, at most
two concurrent requests, no redirects, and a 128 KiB streamed response limit. An
unavailable/malformed/oversized response prevents enrollment rather than silently
accepting an unchecked password. No raw response or lookup is logged or cached.

The future setup and replacement UI must disclose this prefix lookup and submit
only completed passwords, never incremental keystrokes. It must offer retry on
screening outage while preserving existing sign-in. An offline corpus mode would
require an explicit versioned implementation; it is not silently substituted here.
Low-level hashing remains available for benchmarks and controlled migration, but
migration must require a screened replacement if the retained password fails the
new enrollment policy. No route currently invokes these operations.

Tests use injected synthetic range responses and verify prefix-only requests,
padding, rejection, outage/malformed/oversized/cancelled reads, and continued login
verification during screening outage. No real user password or lookup was sent.
Provider protocol: [Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords),
checked 2026-09-06.

## Screening lifecycle regressions

Additional tests exercise the two-request screening cap and capacity recovery, reject
a completed response after caller cancellation, and prevent already cancelled work
from starting a lookup. A loopback HTTP server sends response headers and a partial
body without ending it; native fetch is cancelled by the five-second deadline, then
a subsequent lookup succeeds. This establishes timeout behavior through the real
HTTP stream implementation without sending any password prefix to an external host.
