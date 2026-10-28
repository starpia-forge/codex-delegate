# 13: Release workflow and shipped-package smoke test

**What to build:** Tagging a pet release builds the pet bundle on a Windows runner and attaches it to a GitHub Release, and the maintainer has a documented way to bump the package's pin to it. A smoke test proves the packed package contains the pin and that a runner from an installed generated skill reports to the pet, so a stale generated runner or a missing file fails before release.

**Blocked by:** 10

**Status:** ready-for-human

Spec: `.scratch/pet/spec.md` (Installer behaviour: pinned bundle; Testing seam 4)

- [x] GitHub Actions workflow (the repo's first) building the bundle zip (app, client, hook, default pets) on a pet release tag and attaching it with its SHA-256.
- [x] Documented maintainer steps: cut a pet release, bump the pin in a normal commit.
- [x] Seam 4 test: `npm pack`, pin included, install into an isolated home, run the runner from an installed generated skill against the fake listener.
- [ ] The workflow run once on a test tag, producing an installable bundle.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass. Left for the human: the workflow has not run on a test tag yet, because pushing a `pet-v*` tag needs the user's approval.
