# 06: Scenes

**What to build:** Pets in a **team** act out the delegation flow. Delegation: the leader waves, the new worker pet runs from beside it to its spot and starts working. Report: the worker runs back, jumps, the leader acknowledges with `review`, the worker runs off. Failure report: the worker shows `failed`, the leader briefly shows `failed`, the worker leaves. Waiting: the leader keeps `waiting` while workers keep `running`. Idle leaders wander. Poses are brief and never hide what the leader is actually doing.

**Blocked by:** 04

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Pet stage model: scene poses, scenes)

- [x] Delegation, report and failure-report scenes with durations from the Codex per-frame timings; pets face their direction of movement (`running-left`/`running-right`).
- [x] Leaderless teams play the worker's part only.
- [x] Pose rules: a pose returns the leader to its activity state; a pose never replaces `waiting`.
- [x] Idle leaders wander along the strip.
- [x] Seam 3 tests for each scene's sequence of states, positions and facings, and for reports arriving while the leader is `running` or `waiting`.
- [ ] Manual check with real workers succeeding and failing.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass. The manual check above is not run yet; it is part of ticket 16's full manual checklist (steps in `pet/README.md`).
