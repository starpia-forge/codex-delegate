# 02: Tracer bullet: a running worker shows a pet

**What to build:** With the pet put in place by a developer script, running any worker shows its own **pet** in a transparent, click-through, always-on-top strip along the bottom of the primary monitor. The pet shows `running` with a name tag (role and task label) and leaves when the worker ends or stops reporting for 30 seconds. Concurrent workers, including two of the same role, are separate pets in leaderless teams (leader pets come in 04). Without the pet installed, the runner behaves exactly as today.

**Blocked by:** 01 (go result)

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Modules, Event protocol, Pet stage model, Pet shell, Testing seams 2 and 3)

- [ ] Pet app (Tauri v2, Windows): strip window as specified (undecorated, shadowless, non-focusable, no taskbar entry, click-through, topmost re-asserted directly through Win32 when the foreground window changes), event and health endpoints on `127.0.0.1` at the default port (overridable by environment variable), renders Codex v1 sprite sheets (placeholder sheets for now) with the Codex per-frame timings at scale 0.6.
- [ ] Pet stage model (one pure JS module, injected time) for worker pets: `start`/`heartbeat`/`end`, self-contained worker events (team, role, label on every event), `seq` ordering, duplicate drop, tombstones against late heartbeats, 30-second expiry, leaderless team per unknown team key. Seam 3 tests for each rule.
- [ ] Pet client (direct POST with a short timeout, failures swallowed) and runner integration gated on the client being installed: `start` after spawn, `heartbeat` every 10 seconds on a timer that doesn't keep the process alive, `end` with `success`/`failed`, capped so exit isn't noticeably delayed, nothing printed.
- [ ] Seam 2 tests with the fake `codex` and a fake listener: events and their fields for success, failure and a slow run; no request without the pet client; no listener, a listener that never answers, and a foreign listener all leave exit code, result file and stdout identical to a run without the pet, and not noticeably slower.
- [ ] `npm run build` regenerates the skills with the new runner, and a test or dogfood run starts the runner from an installed generated skill and shows it reporting.
- [ ] Developer script installs a locally built app and client into a given home directory for manual testing; manual check that a real worker run shows and removes its pet.
- [ ] `npm test` passes.
