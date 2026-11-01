# 01: Git installs don't download development tooling

**What to build:** A user running `npx github:` no longer downloads development dependencies, which today includes `sharp`. npm installs them for a Git dependency whenever the package has a `build` script, so the script that rebuilds the skills from upstream gets a name that isn't a lifecycle name. This has to land before release tooling joins the `devDependencies`.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/semantic-release/spec.md` (user story 33, semantic-release configuration, Package contents).

- [x] No script named `build`, `prepare`, `prepack`, `preinstall`, `install` or `postinstall` remains in `package.json`.
- [x] The skill rebuild works under its new name, and the pet README's instructions follow.
- [x] The packaged-install smoke test asserts that no such lifecycle script exists.
- [x] `npm test` passes.

## Comments

- 2026-11-01: Implemented on `ticket/semantic-release-01`. The `build` script is now `build:skills`, still running `node scripts/build.mjs`, and `pet/README.md` follows. `test/package-smoke.test.mjs` reads the repository's `package.json` and fails on any of the six script names; it failed on `build` before the rename. `npm.cmd run build:skills` was run with network access and rebuilt `skills/` with no diff. `npm.cmd test` passes 456/456. No real `npx github:` install was run; that is checked by the `v0.5.0` acceptance.
