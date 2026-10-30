# 04: Pushing a vX.Y.Z tag publishes the Release with the pet

**What to build:** The maintainer cuts a **Release** by committing the version bump and pushing it together with a `vX.Y.Z` tag. One workflow then checks the tag, runs every test, builds the pet with the package version, and creates the `vX.Y.Z` GitHub Release with the pet bundle and its `.sha256` file. No pin commit follows. See spec "Release workflow" and "Docs".

**Blocked by:** 01 (same workflow file and its time limit), 02 (package version source; the old override must be gone), 03 (bundle script `--check` and `--expect-tag`, and no pin output)

**Status:** ready-for-agent

- [x] The Pet release workflow becomes the project's release workflow. It triggers on `v*` tags, rejects tags that aren't `vX.Y.Z`, and needs no permissions beyond `contents: write`. The time limit from ticket 01 is kept.
- [x] Steps run in this order:
  1. bundle script `--check --expect-tag <tag>`, right after checkout and Node setup;
  2. `npm.cmd test`;
  3. `cargo test` for the pet app;
  4. notices;
  5. release build;
  6. check that the executable's file version equals the `package.json` version;
  7. bundle script `--expect-tag <tag>`;
  8. `gh release create` with generated notes, the zip and the `.sha256`.
- [x] The step that printed pin JSON into the job summary and the `CODEX_DELEGATE_PET_VERSION` setting are removed.
- [x] `docs/releasing.md` describes:
  - bumping the version and committing `chore(release): X.Y.Z`;
  - tagging `vX.Y.Z`;
  - pushing the commit and the tag together;
  - waiting for the workflow;
  - installing with `npx github:starpia-forge/codex-delegate#vX.Y.Z install --with-pet` in an isolated home;
  - running `doctor`;
  - the window in which installs from `main`, including plain installs by users with the pet enabled, stop with the missing-Release message.

  It links ADR 0002.
- [x] The pet README's release section is replaced by a pointer to `docs/releasing.md`. Its local preview instructions use the new bundle script flags.

## Comments

### 2026-10-30 — Release workflow and procedure

Renamed `.github/workflows/pet-release.yml` on disk to `release.yml`, named
**Release**. It triggers on `v*`, rejects tags outside `^v\d+\.\d+\.\d+$`, and
runs `pet-bundle.mjs --check --expect-tag` immediately after checkout and Node
setup. Permissions remain only `contents: write`; the job retains its 30-minute
limit. The version override, old `--tag` flag and pin-summary step are gone.

Walked through the final step order against this ticket: checkout; Node setup;
tag format/package check; Rust setup; `npm.cmd test`; locked Cargo tests;
install cargo-about; generate notices; locked release build; executable version
check; bundle with `--expect-tag`; `gh release create` with generated notes and
both assets. The executable check requires ProductVersion to equal the package
version and accepts FileVersion as either `X.Y.Z` or `X.Y.Z.0`; any mismatch
fails before packaging or publication.

Added `docs/releasing.md` with the version commit, tag, atomic commit-and-tag
push, workflow wait, isolated-home install from the tag and `doctor`, plus the
missing-Release window for explicit and implicit pet installs. It links ADR
0002. Replaced the pet README's historical procedure with a pointer, retaining
the bundle contents, current local preview flags and smoke-test description.
Shortened the root README's paragraph and aligned the Korean README.

Validation on Windows (Node v24.18.0, npm 11.16.0):

- Parsed `release.yml` with Python/PyYAML 6.0.3 using `yaml.BaseLoader`; syntax
  passed. Parsed every workflow `run` block with PowerShell's language parser;
  no syntax errors. No automated workflow test was added.
- `node scripts/pet-bundle.mjs --check --expect-tag v0.3.0`: exit 0, matching
  the current package version. The same command with `v999.999.999`: exit 1
  with the expected package/tag mismatch message.
- `npm.cmd test -- --test-timeout=60000`, with a 180-second outer process limit:
  exit 0; 440 passed, zero failures/cancellations/skips; 101.753 seconds reported
  by Node, 102.160 seconds wall time.
- Reviewed the changed READMEs and workflow for stale `pet-v*`, pin procedure,
  old workflow-name/path and version-override references; none remain as
  current instructions. Confirmed only `release.yml` remains at the workflow
  path.

No GitHub operations or git-state changes were performed. The package remains
at `0.3.0`; the version bump belongs to cutting the Release. Cargo tests/build,
the actual executable metadata check, publication and install/doctor against
the real Release were not run locally; those remain runner/release-time checks
as specified under Testing Decisions (and the subsequent Release ticket).
