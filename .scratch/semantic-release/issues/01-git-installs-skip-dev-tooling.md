# 01: Git installs don't download development tooling

**What to build:** A user running `npx github:` no longer downloads development dependencies, which today includes `sharp`. npm installs them for a Git dependency whenever the package has a `build` script, so the script that rebuilds the skills from upstream gets a name that isn't a lifecycle name. This has to land before release tooling joins the `devDependencies`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/semantic-release/spec.md` (user story 33, semantic-release configuration, Package contents).

- [ ] No script named `build`, `prepare`, `prepack`, `preinstall`, `install` or `postinstall` remains in `package.json`.
- [ ] The skill rebuild works under its new name, and the pet README's instructions follow.
- [ ] The packaged-install smoke test asserts that no such lifecycle script exists.
- [ ] `npm test` passes.
