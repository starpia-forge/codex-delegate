# 01: `/implement` and `/code-review` in repos that don't use git

**What to build:** A user whose project uses another version control system (jj without a colocated `.git`, Mercurial, Perforce, ...) can run `/implement`, `/implement-spec` and `/code-review`. Workers already run outside git repos, because the runner passes `--skip-git-repo-check`. The leader procedures still assume git:

- `src/skills/codex-implement/SKILL.md` records and compares `git rev-parse HEAD` and `git branch --show-current`, and reads the worker's changes with `git diff` and `git status`.
- `src/skills/codex-code-review/SKILL.md` builds `diff.patch` from `git diff <fixed-point>...HEAD`.

Open questions: which systems to support, how the leader detects which one is in use, and what replaces the `HEAD`/branch check where there is no equivalent.

**Blocked by:** None

**Status:** needs-triage
