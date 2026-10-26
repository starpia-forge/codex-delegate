# 02: `codex-plan-review` removes its task directory after the revised draft is safe

**What to build:** After the draft is revised and any "needs the user" findings are answered, and the revised draft exists outside the task directory, the task directory is removed before returning to the calling skill. Failure path keeps it until the user picks retry or continue-without-review.

**Blocked by:** 01

**Status:** resolved

Spec: `.scratch/task-directory-cleanup/spec.md`

**Shared cleanup rules:** the rules from the spec: create the task directory with an exclusive create that fails if it already exists, retry with another name on collision, and write files only after creation succeeds; remove only this delegation's task directory by exact path, a direct child of `.scratch/codex/`, no wildcards, never `.scratch/codex/` or `.scratch/` themselves, using the shell's own recursive delete; a failed removal leaves the outcome unchanged and the leader reports the leftover path; failed delegations keep their directory until the user decides and the leader no longer needs it (a retry that refers to it keeps it).

- [x] Removal happens only after the revised draft lives outside the task directory (publish location or conversation).
- [x] Shared cleanup rules present; failure path as above.
- [x] Build regenerates the skill; `node --test` passes.
- [ ] Dogfood: `/to-spec` on a small feature leaves the published, revised spec and no plan-review task directory.

## Comments

- Implemented on `feat/task-directory-cleanup`; build and `node --test` pass. The manual dogfood criterion is not yet run (needs the regenerated skills installed).
