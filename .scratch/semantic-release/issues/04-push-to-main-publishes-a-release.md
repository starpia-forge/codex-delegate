# 04: A push to main publishes a Release

**What to build:** Pushing to `main` runs the release workflow. If there is something to release, it tests and builds everything, commits the version, tags it, creates the GitHub Release with both assets and checks the result. If there isn't, it does no build work. A tag pushed by hand no longer does anything.

**Blocked by:** 01, 02, 03

**Status:** resolved

Spec: `.scratch/semantic-release/spec.md` (user stories 1, 9–16, 20–27, Workflow, Release build).

- [x] The workflow triggers on pushes to `main`, and the `v*` tag trigger is gone.
- [x] One `windows-latest` job with a 30-minute limit, a concurrency group that queues rather than cancels, and `contents: write` only.
- [x] Full history and tags are checked out, Node is pinned to a major semantic-release supports, and dependencies come from the lockfile.
- [x] One release script takes the version, stops at the first failure and runs every existing check: Node tests, Rust tests, notices, build, executable product and file versions, packaging with `--expect-tag`.
- [x] The published-Release check runs as the last step of a Release.
- [x] The bundle is uploaded as an artifact when the job doesn't succeed, including a timeout, and a missing bundle doesn't fail that step.
- [x] The release script runs locally to completion with a test version, publishing nothing.
- [x] `npm test` passes.

## Comments

- 2026-11-01: Built by Codex on `ticket/semantic-release-04`. The release script is `scripts/release-build.ps1`. `.releaserc.json` gains two `@semantic-release/exec` entries in the spec's positions: the build (`prepareCmd`) before the git plugin and the published-Release check (`successCmd`) last. They are separate because plugin steps run in plugin order. `npm.cmd test`: 480 passed, 0 failed, on the restored `0.4.0`, and again inside the script at the test version.

  The exec plugin runs commands through `cmd.exe` here, so `prepareCmd` calls `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`. `powershell.exe` rather than `pwsh`, because this machine has no `pwsh`, so the script runs under Windows PowerShell 5.1 both here and on the runner. That differs from the old workflow steps, which ran in the runner's default `pwsh`. The script's `Invoke-Native` helper decides on the exit code, not on stderr, because cargo's progress on stderr could otherwise stop it under 5.1.

  Local script run: `package.json` and `package-lock.json` were set to `0.99.1` with `npm version --no-git-tag-version` and restored afterwards. The committed `prepareCmd` was run through the real exec plugin's `prepare` with piped output, from a throwaway script, so that shell path is exercised even though dry-run skips it. It finished in 371 s, exit 0: Node 480 passed, Rust 51 passed, notices generated, release build done, the executable reported `0.99.1` for both product and file version, and the zip and `.sha256` were written to `dist/`. Nothing was published. `cargo-about` 0.9.3 was already installed, so that step only confirmed it and the from-scratch install did not run; the first Release runs it on the runner. A clean `target/` was used. Failure paths through the same exec call: `not-a-version` was refused with exit 1 and no steps run; `0.99.2` against a `0.99.1` `package.json` ran the steps and stopped at `--expect-tag` with exit 1. `--check-published 0.4.0` passed by hand, run directly rather than through the exec plugin.

  Rehearsal: Node 24.18.0, semantic-release 25.0.9. As in ticket 02, `rehearsal/semantic-release-04` was created at `a74986a` with this work uncommitted in the tree, pushed, and run with `GITHUB_TOKEN` and `GH_TOKEN` from `gh auth token`:

  `node_modules/.bin/semantic-release.cmd --dry-run --no-ci --branches rehearsal/semantic-release-04`

  Exit 0. It loaded all plugins including both exec entries, passed every `verifyConditions`, found 27 commits since `v0.4.0`, reported `The next release version is 0.5.0` and generated the notes: three `feat` (the tray Quit twice, `4e1341e` and `ef072c6`, as in ticket 02) and one `fix`. Dry-run skips prepare, tag, publish and success, so the rehearsal did not exercise the exec build step or the success step. The branch was deleted from origin and locally; `main` is still `ef072c6`, no `v0.5` tag exists and no workflow started. `.releaserc.json` stayed restricted to `main`.

  Not exercised until `v0.5.0`: the workflow itself, including the `upload-artifact` condition (`failure() || cancelled()`), `npm ci` on the runner, the git plugin's push and the `successCmd` through semantic-release. Ticket 05 has yet to update `docs/releasing.md`, which still describes manual tagging.
