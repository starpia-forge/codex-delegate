# 05: The release procedure and commit rules are written down

**What to build:** A maintainer can read how a push becomes a Release, and what to do when a run fails. A contributor can read how to name commits so that a change reaches users, and users see no stale version in the install example.

**Blocked by:** 04

**Status:** ready-for-agent

Spec: `.scratch/semantic-release/spec.md` (user stories 22, 29–32, 34, Failure states, Documentation).

- [x] `docs/releasing.md` explains how a push becomes a Release, and keeps the explanation of the missing-Release message.
- [x] Each failure state in the spec has a way to recognise it and a repair, including rebuilding the bundle from the tagged commit.
- [x] The isolated-home install check stays as an optional procedure.
- [x] `AGENTS.md` says that a change to anything users receive is a `feat` or `fix`, and that merge commits use `merge:`.
- [x] Both READMEs' pinned-install example reads `#vX.Y.Z`.
- [x] No doc tells anyone to bump or tag by hand for a routine Release, including the pet README. Manual tagging appears only as a repair step.

## Comments

- 2026-11-01: Written by Codex on `ticket/semantic-release-05`. Changed `docs/releasing.md`, `AGENTS.md`, both READMEs and `pet/README.md`; `CLAUDE.md` is untouched. `npm.cmd test`: 480 passed, 0 failed.

  Commands checked, with nothing created, changed or deleted on GitHub or in this repository. Against gh 2.92.0 `--help`: `gh release create` (`--verify-tag`, `--notes-start-tag`, `--generate-notes`), `gh release upload --clobber`, `gh release edit --draft=false`, `gh run download --name --dir`. Run for real under Windows PowerShell 5.1: `--check-published 0.4.0` passed, `git ls-remote --exit-code` gave 0 for `v0.4.0` and 2 for `v9.9.9`, `gh release view` printed `release not found` for `v9.9.9` and the two asset names for `v0.4.0`, the `git log --fixed-strings --grep` line found `8c15e42`, and `git describe --match 'v*' "v0.4.0^"` gave `v0.3.0`. The tag and tag-push lines ran in a throwaway local repository with a bare remote, not this one. The `Release tags` ruleset has only the `deletion` and `update` rules, so creating a `v*` tag by hand is allowed. Immutable releases are off, so `--clobber` works on a published Release. `v0.4.0` is a lightweight tag and its Release title is the tag, which the repair commands match.

  The commit table was checked against the real analyzer with the committed configuration. It also gives `patch` for `perf:` and for a git-generated revert, so the table lists those beyond the spec's list; `style:` and `build:` give nothing. The draft repair uploads both files with `--clobber` rather than only what's missing, so the zip and `.sha256` always come from one build.

  Not exercised, because each needs a failed Release: `gh release view` on a real draft, `gh run download` of a real `release-bundle` artifact (its flat layout in `dist/` is inferred from `upload-artifact` using the two files' common parent), and the rebuild worktree end to end. The script itself ran to completion in ticket 04.

  `npm.cmd test` is timing-sensitive here: two runs in a row failed, and the second, the one whose names were captured, failed on `simultaneous stale reclamation permits exactly one worker and preserves its lock` and `session-end is spooled while an app returns 503 health and delivered once it is ready`, the first with a timeout. The next run passed 480 of 480. Codex saw one such failure too. This ticket changes no code, but `scripts/release-build.ps1` runs these tests, so such a flake can turn a Release run red. It is the Tests or build failed state, and it can be retried by rerunning the run if `main` hasn't moved.
