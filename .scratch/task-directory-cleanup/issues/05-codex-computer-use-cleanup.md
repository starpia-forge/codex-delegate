# 05: `codex-computer-use` removes a task's attempt directories after reporting

**What to build:** All attempt directories of a computer-use task stay until the task ends (so a follow-up can refer to the previous attempt) and are removed after verification succeeds and the user is told. The success report no longer points to a screenshot inside the task directory unless the leader copied it out at the user's request. A busy attempt's directory is removed right after the user is told (code review changed this from "when its rerun starts" so it cannot leak). A task that stops without meeting its criterion, or fails otherwise, keeps its directories until the user decides; a retry (follow-up) keeps the previous attempt's directory it refers to until the task ends.

**Blocked by:** 01

**Status:** resolved

Spec: `.scratch/task-directory-cleanup/spec.md`

**Shared cleanup rules:** the rules from the spec: create the task directory with an exclusive create that fails if it already exists, retry with another name on collision, and write files only after creation succeeds; remove only this delegation's task directory by exact path, a direct child of `.scratch/codex/`, no wildcards, never `.scratch/codex/` or `.scratch/` themselves, using the shell's own recursive delete; a failed removal leaves the outcome unchanged and the leader reports the leftover path; failed delegations keep their directory until the user decides and the leader no longer needs it (a retry that refers to it keeps it).

- [x] Removal points and retention exactly as above; shared cleanup rules present.
- [x] Build regenerates the skill; `node --test` passes.
- [ ] Dogfood: a Notepad task that needs one follow-up keeps both attempt directories until verified, then both are gone; with a screenshot requested, it is copied outside `.scratch/codex/` first and the report points there.

## Comments

- Implemented on `feat/task-directory-cleanup`; build and `node --test` pass. The manual dogfood criterion is not yet run (needs the regenerated skills installed).
