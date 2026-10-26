# 04: `/code-review` removes the Codex review's task directory after aggregating

**What to build:** `codex-code-review` returns its task directory path to the caller; `code-review` removes it after aggregation. If the Codex review failed, `code-review` keeps it, puts its path and the log tail in the final report, and removes it only when the user says so.

**Blocked by:** 01

**Status:** resolved

Spec: `.scratch/task-directory-cleanup/spec.md`

**Shared cleanup rules:** the rules from the spec: create the task directory with an exclusive create that fails if it already exists, retry with another name on collision, and write files only after creation succeeds; remove only this delegation's task directory by exact path, a direct child of `.scratch/codex/`, no wildcards, never `.scratch/codex/` or `.scratch/` themselves, using the shell's own recursive delete; a failed removal leaves the outcome unchanged and the leader reports the leftover path; failed delegations keep their directory until the user decides and the leader no longer needs it (a retry that refers to it keeps it).

- [x] `codex-code-review` hands its task directory path back when it returns; shared cleanup rules present.
- [x] The `code-review` patch adds removal after aggregation and the failed-review behaviour; the patch applies cleanly to the pinned upstream.
- [x] Build regenerates both skills; `node --test` passes.
- [x] Dogfood: `/code-review` once leaves no Codex review task directory; one forced Codex failure still yields the Claude findings, and the final report gives the kept directory's path and log tail.

## Comments

- Implemented on `feat/task-directory-cleanup`; build and `node --test` pass.
- Dogfood 2026-10-26: a successful /code-review removed its Codex task directory after aggregation; a codex-not-found run produced Claude-only findings, kept the directory, put its path and log tail in the final report, and removed it only when the user asked. Two concurrent reviews with the same slug got distinct directories.
