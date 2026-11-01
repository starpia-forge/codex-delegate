# 02: Commits decide the next version

**What to build:** The repository holds a semantic-release configuration for `main`, and its tooling is pinned as development dependencies. Given the commits since the last Release, it works out the next version under the agreed rules: `feat` is minor, `fix` is patch, a breaking change is minor below 1.0, and everything else releases nothing.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/semantic-release/spec.md` (user stories 2–8, 33, semantic-release configuration, Release rules test).

- [x] Plugins in the spec's order, using the `conventionalcommits` preset, with `breaking` mapped to `minor`.
- [x] npm publishing is off. GitHub plugin comments, labels and failure issues are off.
- [x] Only `package.json` and `package-lock.json` are committed, as `chore(release): X.Y.Z`.
- [x] A Node test passes real commit messages through the repository's actual configuration, covering `feat`, `fix`, `feat!:`, `fix(scope)!:`, a `BREAKING CHANGE:` footer, `docs`, `refactor`, `test`, `ci`, `chore(release):`, `merge:` and a default `Merge branch` subject.
- [x] A rehearsal that leaves the committed configuration restricted to `main` overrides the branch for a dry run, finds `v0.4.0` as the last Release, ignores `pet-v*` tags, and reports `0.5.0`. The ticket's comment records how it was run.
- [x] Release configuration isn't in the package.
- [x] `npm test` passes.

## Comments

- 2026-11-01: Built test-first by Codex on `ticket/semantic-release-02`. Configuration is `.releaserc.json`; `test/release-rules.test.mjs` passes 14 cases through the real commit analyzer; the package smoke test asserts `.releaserc.json` isn't packed. `npm test`: 470 passed, 0 failed.

  Rehearsal: run on Windows, Node 24.18.0, semantic-release 25.0.9. `--branches` only accepts a branch that exists on the remote, and a first run without one stopped with `ERELEASEBRANCHES`. So `rehearsal/semantic-release-02` was created locally at `c006bcd`, with this work uncommitted in the tree (the configuration is read from disk), pushed to origin, and run with `GITHUB_TOKEN` and `GH_TOKEN` from `gh auth token`:

  `node_modules/.bin/semantic-release.cmd --dry-run --no-ci --branches rehearsal/semantic-release-02`

  `.releaserc.json` stayed restricted to `main`. The run found `v0.4.0` as the last Release and 16 commits since it, ignored `pet-v*`, and reported `The next release version is 0.5.0`, exit 0. Every `verifyConditions` step passed; prepare, tag, publish and success were skipped by dry-run. The notes list the three `feat` commits and the `fix`; `merge:` and `Merge branch` subjects don't appear. The tray Quit `feat` appears twice, once for `4e1341e` and once for `ef072c6`, which are separate commits. The branch was deleted from origin and locally afterwards; `main`, the tags and the Releases were unchanged. The tag trigger meant the branch push started no workflow.

  The first rehearsal with a remote branch reached `0.5.0` and then failed in `generateNotes`: `conventional-changelog-conventionalcommits` 10 needs `conventional-changelog-writer` 9, and the notes generator 14.1.1 and commit analyzer 13.0.1 depend on writer 8. The preset is held at `^9.3.1` for that reason. Don't raise it until those plugins move to writer 9. `test/release-rules.test.mjs` doesn't exercise notes, so only a rehearsal shows this.

  Not done: the spec's build step (4) and success step (7) aren't in `.releaserc.json`. The rehearsal would still work with them, because dry-run skips those steps, but neither ticket 03 nor 04 has agreed a command name yet, and a guessed name would only fail during a real Release. `@semantic-release/exec` is already a dev dependency, so ticket 04 adds both entries, in the spec's order, around the git and GitHub plugins, and rehearses again.
