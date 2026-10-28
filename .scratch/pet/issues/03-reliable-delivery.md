# 03: Reliable delivery and a trustworthy pet app

**What to build:** The pet app starts by itself when the first event arrives and no event is lost or reordered while it starts, even for a worker that finishes before the app is ready. Only one app runs, only the user's own codex-delegate processes can drive or stop it, and it exits after 10 minutes without events. Mutable state lives in a pet state directory separate from the replaceable bundle directory.

**Blocked by:** 02

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Installer behaviour: bundle and state directories; Event protocol: authentication, delivery; Pet shell)

- [x] Pet bundle directory and pet state directory split as specified; the developer script creates the state directory with a token.
- [x] Delivery: on a failed direct POST the producer spools the event and starts a detached, hidden helper, then returns at once. One helper at a time (exclusive lock); it launches the app unless the "updating" flag is set (a stale flag older than a few minutes is ignored), waits for health within a bound, delivers all spooled events in timestamp order including ones added meanwhile, discards spooled events older than a few minutes.
- [x] Token required on every request; health returns app identifier, bundle version and protocol version; the client delivers only to a compatible pet app and treats anything else on the port as unavailable; bodies size-limited and schema-checked.
- [x] Quit endpoint; a second app instance that can't bind the port exits; idle exit after 10 minutes without events.
- [x] Seam 2 tests with a stub app executable: producer returns immediately when nothing listens; the helper launches the stub once even with concurrent producers; delayed health still gets every event delivered in order; nothing launched or delivered while the "updating" flag is fresh.
- [x] Cold-start test: a fake listener that feeds received events into the real stage model, a worker that starts and ends before the listener becomes healthy, and the stage ends with the worker correctly labelled and gone, never resurrected.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass.
