# 06: READMEs describe the new task directory lifecycle

**What to build:** The English and Korean READMEs say that successful delegations remove their task directory, failed ones are kept for diagnosis, leftovers can be deleted by hand, and `.scratch/codex/` should still be in `.gitignore`.

**Blocked by:** 01, 02, 03, 04, 05

**Status:** resolved

Spec: `.scratch/task-directory-cleanup/spec.md`

- [x] Both READMEs updated consistently; the `.gitignore` recommendation stays.

## Comments

- Implemented on `feat/task-directory-cleanup`; build and `node --test` pass.
