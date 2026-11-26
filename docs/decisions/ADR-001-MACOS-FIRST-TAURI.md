# ADR-001: macOS-First Tauri Application

- Status: accepted
- Date: 2026-08-21
- Scope: NaviMuse application platform and first native release

## Context

NaviMuse is currently a React/Vite PWA backed by a Node BFF. It has working
playback, queue, library, discovery, authentication, responsive behavior, and a
substantial regression suite, but no native application layer. The current frontend
and BFF are concentrated in large files, and the desktop presentation still carries
mobile PWA assumptions.

The first owned validation device is an Apple Silicon MacBook Air. The intended
product is a native NaviMuse application in which Sonic Atlas becomes the flagship
music-discovery feature after its evidence gates pass.

## Decision

Build NaviMuse as a macOS-first Tauri v2 application targeting
`aarch64-apple-darwin` initially.

- Keep the deployed Node BFF as the service, authentication, and credential boundary
  during the first native migration.
- Keep the PWA operational during migration and as the initial phone-access path.
- Prove native authentication, playback, lifecycle recovery, media integration, and
  packaging in a thin shell before broad UI or backend rewrites.
- Make NaviMuse daily-listening quality independent of Sonic Atlas availability.
- Integrate Sonic Atlas only after the lab's ordered Gate 0 decisions authorize a
  production route and renderer architecture.

## Consequences

- Apple Silicon macOS is the only first-release platform commitment.
- Universal macOS, Windows, Linux, and Tauri mobile require later decisions and
  validation.
- The client communicates with the BFF over authenticated HTTPS and does not store
  long-lived Navidrome or AudioMuse service credentials.
- The BFF is not rewritten in Rust or embedded as a sidecar during the initial Tauri
  program without a superseding ADR.
- Web and native clients share domain contracts where practical, while platform
  capabilities remain behind explicit adapters.

## Validation

The decision is validated when a packaged development `.app` on the target MacBook
Air completes real authenticated playback and recovers from sleep/wake, network
loss, and output-device changes while preserving the existing PWA path.

## Authority

The complete delivery and multi-agent execution plan is:

- `docs/plans/NAVIMUSE_MACOS_TAURI_MASTER_PLAN_2026-08-21.md`

