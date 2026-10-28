# 08: Layout and overflow

**What to build:** However many sessions and workers run, the strip stays readable. At most as many pets as fit the work area's width at the current scale are shown, never more than 16. Leader pets come first; a team's extra workers collapse into a "+N" badge on that team, and sessions beyond what fits collapse into one "+N sessions" badge.

**Blocked by:** 04, 07

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Pet stage model: layout and overflow)

- [x] The shell computes the fit limit from the work-area width and scale (including name-tag and badge space) and passes it to the stage; recomputed when either changes.
- [x] Overflow rules as specified, newest hidden first.
- [x] Seam 3 tests: workers beyond the limit per team, more leaders than fit, limit changes while pets are shown.
- [ ] Manual check at a small scale and at the maximum scale.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass. The manual check above is not run yet; it is part of ticket 16's full manual checklist (steps in `pet/README.md`).
