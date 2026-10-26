# 01: `codex-research` removes its task directory after use

**What to build:** After a successful research delegation the leader brings the needed facts into the conversation and the task directory is gone. A caller that needs durable notes copies them out first. A failed run keeps the directory until the user chooses retry or research-it-yourself, then it is removed. This ticket sets the wording of the shared cleanup rules that later tickets reuse.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/task-directory-cleanup/spec.md`

**Shared cleanup rules:** the rules from the spec: create the task directory with an exclusive create that fails if it already exists, retry with another name on collision, and write files only after creation succeeds; remove only this delegation's task directory by exact path, a direct child of `.scratch/codex/`, no wildcards, never `.scratch/codex/` or `.scratch/` themselves, using the shell's own recursive delete; a failed removal leaves the outcome unchanged and the leader reports the leftover path; failed delegations keep their directory until the user decides and the leader no longer needs it (a retry that refers to it keeps it).

- [x] The "point to the file for the rest" instruction is gone; the skill tells a caller needing durable notes to copy them out before removal.
- [x] Shared cleanup rules present (fresh creation, safety rules, failed removal).
- [x] Failure path keeps the directory and removes it after the user's decision.
- [x] Build regenerates `skills/claude/codex-research/` with the change; `node --test` passes.
- [ ] Dogfood: one successful run leaves no task directory; one forced failure keeps it until the decision; one run whose task directory cannot be removed (a file held open) still delivers the result and reports the exact leftover path. A neighbouring task directory and an issue file under `.scratch/<feature>/` survive every scenario (this applies to every ticket's dogfood).

## Comments

- Implemented on `feat/task-directory-cleanup`; build and `node --test` pass. The manual dogfood criterion is not yet run (needs the regenerated skills installed).
