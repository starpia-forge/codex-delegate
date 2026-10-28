# 06: Scenes

**What to build:** Pets in a **team** act out the delegation flow. Delegation: the leader waves, the new worker pet runs from beside it to its spot and starts working. Report: the worker runs back, jumps, the leader acknowledges with `review`, the worker runs off. Failure report: the worker shows `failed`, the leader briefly shows `failed`, the worker leaves. Waiting: the leader keeps `waiting` while workers keep `running`. Idle leaders wander. Poses are brief and never hide what the leader is actually doing.

**Blocked by:** 04

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Pet stage model: scene poses, scenes)

- [ ] Delegation, report and failure-report scenes with durations from the Codex per-frame timings; pets face their direction of movement (`running-left`/`running-right`).
- [ ] Leaderless teams play the worker's part only.
- [ ] Pose rules: a pose returns the leader to its activity state; a pose never replaces `waiting`.
- [ ] Idle leaders wander along the strip.
- [ ] Seam 3 tests for each scene's sequence of states, positions and facings, and for reports arriving while the leader is `running` or `waiting`.
- [ ] Manual check with real workers succeeding and failing.
- [ ] `npm test` passes.
