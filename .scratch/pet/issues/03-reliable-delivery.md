# 03: Reliable delivery and a trustworthy pet app

**What to build:** The pet app starts by itself when the first event arrives and no event is lost or reordered while it starts, even for a worker that finishes before the app is ready. Only one app runs, only the user's own codex-delegate processes can drive or stop it, and it exits after 10 minutes without events. Mutable state lives in a pet state directory separate from the replaceable bundle directory.

**Blocked by:** 02

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Installer behaviour: bundle and state directories; Event protocol: authentication, delivery; Pet shell)

- [ ] Pet bundle directory and pet state directory split as specified; the developer script creates the state directory with a token.
- [ ] Delivery: on a failed direct POST the producer spools the event and starts a detached, hidden helper, then returns at once. One helper at a time (exclusive lock); it launches the app unless the "updating" flag is set (a stale flag older than a few minutes is ignored), waits for health within a bound, delivers all spooled events in timestamp order including ones added meanwhile, discards spooled events older than a few minutes.
- [ ] Token required on every request; health returns app identifier, bundle version and protocol version; the client delivers only to a compatible pet app and treats anything else on the port as unavailable; bodies size-limited and schema-checked.
- [ ] Quit endpoint; a second app instance that can't bind the port exits; idle exit after 10 minutes without events.
- [ ] Seam 2 tests with a stub app executable: producer returns immediately when nothing listens; the helper launches the stub once even with concurrent producers; delayed health still gets every event delivered in order; nothing launched or delivered while the "updating" flag is fresh.
- [ ] Cold-start test: a fake listener that feeds received events into the real stage model, a worker that starts and ends before the listener becomes healthy, and the stage ends with the worker correctly labelled and gone, never resurrected.
- [ ] `npm test` passes.
