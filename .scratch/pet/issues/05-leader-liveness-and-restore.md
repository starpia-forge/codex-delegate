# 05: Leader liveness and restore after restart

**What to build:** A leader pet leaves when its Claude Code window crashes or is closed without a session-end event. Quiet but still-open sessions come back with their leader pets when the pet app restarts, whether after its idle exit or an update.

**Blocked by:** 03, 04

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Pet shell: liveness, restore after restart; Pet stage model: teams)

- [x] The leader hook writes a per-session record (team key, session id, start time) in the pet state directory on `session-start` and removes it on `session-end`.
- [x] The shell checks each team key's process periodically and reports liveness to the stage; a dead process removes the team and tombstones it.
- [x] On start, the shell recreates leader pets for recorded sessions whose process is alive and deletes records whose process is dead.
- [x] Seam 2 tests (real hook processes, isolated home): records are written and removed on the matching hook inputs, and a record survives when its session hasn't ended.
- [x] Seam 3 tests: a dead-process liveness fact removes the team; later events for it are ignored until a new `session-start`.
- [ ] Manual check: close a session window without exiting, its pet leaves; restart the pet app with an open quiet session, its pet comes back.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass. The manual check above is not run yet; it is part of ticket 16's full manual checklist (steps in `pet/README.md`).
