# 02: Allow only one computer-use worker at a time across sessions

Spec: `.scratch/codex-computer-use/spec.md`

**What to build:** Roles with `exclusive: true` (on for `astra-cu`, off for every other role) share one per-user lock in `~/.codex-delegate/`, so two Claude sessions can never run computer-use workers on the same desktop at once. A run that finds the lock held exits at once with a distinct "busy" exit code and a message naming the holder, without spawning Codex or creating a log. The lock records the runner's PID and the Codex child's PID; it is reclaimed only when every recorded PID is dead, and an incomplete record counts as busy. Acquisition, reclamation and release are ownership-safe: a runner never deletes a lock it doesn't own. The lock is released on every exit path, and an interrupted runner terminates the Codex process tree before releasing.

**Blocked by:** 01

**Status:** resolved

- [x] Default `astra-cu` has `exclusive: true`; the field defaults to false for every other role.
- [x] A second `astra-cu` run during a first (fake `codex` that waits) exits with the busy code, names the holder, does not invoke `codex`, and creates no log or result file.
- [x] Two exclusive roles share the lock: an `astra-cu` run and another role made exclusive through an isolated override, in separate working directories with the same isolated home, never run together.
- [x] Simultaneous acquisition from several processes on an absent lock: exactly one proceeds.
- [x] Simultaneous reclamation of a stale lock (all recorded PIDs dead): exactly one proceeds; no runner deletes another's fresh lock.
- [x] A lock with an incomplete record is treated as busy.
- [x] Killing the runner while the fake worker stays alive: a new exclusive run is refused until the worker has stopped.
- [x] Interrupting the runner terminates the fake worker and releases the lock.
- [x] The lock is released when Codex exits non-zero, and when spawning genuinely fails (triggered by an invalid `--cwd`); a following exclusive run succeeds in both cases.
- [x] A non-exclusive role (`astra`) runs while the lock is held.
- [x] `npm test` passes on Windows.

## Comments

Resolved on branch `feat/codex-computer-use` (review base 973b340). Manual acceptance (ticket 04) passed on 2026-10-26: Notepad task, app-closed rerun, app killed mid-task treated as the follow-up.
