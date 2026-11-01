# 02: Commits decide the next version

**What to build:** The repository holds a semantic-release configuration for `main`, and its tooling is pinned as development dependencies. Given the commits since the last Release, it works out the next version under the agreed rules: `feat` is minor, `fix` is patch, a breaking change is minor below 1.0, and everything else releases nothing.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/semantic-release/spec.md` (user stories 2–8, 33, semantic-release configuration, Release rules test).

- [ ] Plugins in the spec's order, using the `conventionalcommits` preset, with `breaking` mapped to `minor`.
- [ ] npm publishing is off. GitHub plugin comments, labels and failure issues are off.
- [ ] Only `package.json` and `package-lock.json` are committed, as `chore(release): X.Y.Z`.
- [ ] A Node test passes real commit messages through the repository's actual configuration, covering `feat`, `fix`, `feat!:`, `fix(scope)!:`, a `BREAKING CHANGE:` footer, `docs`, `refactor`, `test`, `ci`, `chore(release):`, `merge:` and a default `Merge branch` subject.
- [ ] A rehearsal that leaves the committed configuration restricted to `main` overrides the branch for a dry run, finds `v0.4.0` as the last Release, ignores `pet-v*` tags, and reports `0.5.0`. The ticket's comment records how it was run.
- [ ] Release configuration isn't in the package.
- [ ] `npm test` passes.
