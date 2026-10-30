# 04: Pushing a vX.Y.Z tag publishes the Release with the pet

**What to build:** The maintainer cuts a **Release** by committing the version bump and pushing it together with a `vX.Y.Z` tag. One workflow then checks the tag, runs every test, builds the pet with the package version, and creates the `vX.Y.Z` GitHub Release with the pet bundle and its `.sha256` file. No pin commit follows. See spec "Release workflow" and "Docs".

**Blocked by:** 01 (same workflow file and its time limit), 02 (package version source; the old override must be gone), 03 (bundle script `--check` and `--expect-tag`, and no pin output)

**Status:** ready-for-agent

- [ ] The Pet release workflow becomes the project's release workflow. It triggers on `v*` tags, rejects tags that aren't `vX.Y.Z`, and needs no permissions beyond `contents: write`. The time limit from ticket 01 is kept.
- [ ] Steps run in this order:
  1. bundle script `--check --expect-tag <tag>`, right after checkout and Node setup;
  2. `npm.cmd test`;
  3. `cargo test` for the pet app;
  4. notices;
  5. release build;
  6. check that the executable's file version equals the `package.json` version;
  7. bundle script `--expect-tag <tag>`;
  8. `gh release create` with generated notes, the zip and the `.sha256`.
- [ ] The step that printed pin JSON into the job summary and the `CODEX_DELEGATE_PET_VERSION` setting are removed.
- [ ] `docs/releasing.md` describes:
  - bumping the version and committing `chore(release): X.Y.Z`;
  - tagging `vX.Y.Z`;
  - pushing the commit and the tag together;
  - waiting for the workflow;
  - installing with `npx github:starpia-forge/codex-delegate#vX.Y.Z install --with-pet` in an isolated home;
  - running `doctor`;
  - the window in which installs from `main`, including plain installs by users with the pet enabled, stop with the missing-Release message.

  It links ADR 0002.
- [ ] The pet README's release section is replaced by a pointer to `docs/releasing.md`. Its local preview instructions use the new bundle script flags.

## Comments
