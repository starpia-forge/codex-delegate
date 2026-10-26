# 03: `codex-implement` removes a ticket's task directories once it is verified

**What to build:** All task directories created for a ticket (first run and follow-ups) stay while follow-ups are possible and are removed together when the ticket is verified and control returns to the calling skill. When follow-ups don't converge, or the run fails, they stay until the user decides.

**Blocked by:** 01

**Status:** resolved

Spec: `.scratch/task-directory-cleanup/spec.md`

**Shared cleanup rules:** the rules from the spec: create the task directory with an exclusive create that fails if it already exists, retry with another name on collision, and write files only after creation succeeds; remove only this delegation's task directory by exact path, a direct child of `.scratch/codex/`, no wildcards, never `.scratch/codex/` or `.scratch/` themselves, using the shell's own recursive delete; a failed removal leaves the outcome unchanged and the leader reports the leftover path; failed delegations keep their directory until the user decides and the leader no longer needs it (a retry that refers to it keeps it).

- [x] Removal of all the ticket's task directories at the return step, not after each run.
- [x] Non-converging follow-ups and run failures keep the directories until the user's decision.
- [x] Shared cleanup rules present.
- [x] Build regenerates the skill; `node --test` passes.
- [x] Dogfood: a ticket needing one follow-up keeps both directories until verified, then both are gone.

## Comments

- Implemented on `feat/task-directory-cleanup`; build and `node --test` pass.
- Dogfood 2026-10-26: a ticket whose first brief omitted a criterion kept the first task directory during the follow-up; both were removed together after verification, before the commit.
