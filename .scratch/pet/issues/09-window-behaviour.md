# 09: Window behaviour: fullscreen, capture exclusion, clocks

**What to build:** The strip pauses and drops behind a fullscreen app on the primary monitor and comes back on top when fullscreen ends, with events that arrived meanwhile reflected. It is hidden from screen capture from before a `computer-user` worker starts until computer use has really ended, and not longer. Lifecycle timing keeps running while animation is paused.

**Blocked by:** 02, 03

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Event protocol: computer use start boundary; Pet stage model: two clocks; Pet shell: fullscreen, capture exclusion; Prototype reference)

- [x] Fullscreen rule: foreground window on the primary monitor covers it entirely, has no caption, isn't the desktop or taskbar. On fullscreen: stop the animation clock, drop topmost and insert directly behind the fullscreen window; on exit: restore topmost and resume. Follows work-area and DPI changes.
- [x] Capture-exclusion request endpoint answering once exclusion is applied; the runner, for the `computer-user` role, sends it after taking the computer-use lock and before spawning Codex, waits at most one second, and doesn't wait when no pet app is running.
- [x] Exclusion stays on while the computer-use lock is live (a recorded runner or child process alive) or a `computer-user` worker is live, checked at least once a second; a stale lock with dead processes doesn't keep it on.
- [x] Seam 2 tests: the runner sends the exclusion request before spawning for `computer-user` only, waits for the acknowledgement up to the bound, and doesn't wait without a listener.
- [x] Seam 3 test: lifecycle deadlines advance while the animation clock is paused.
- [ ] Manual checklist from the spec's "Not automated" section for fullscreen, auto-hide taskbar, DPI, work-area change, events during fullscreen, exclusion from lock creation until worker exit, and a stale lock.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass. The manual check above is not run yet; it is part of ticket 16's full manual checklist (steps in `pet/README.md`).
