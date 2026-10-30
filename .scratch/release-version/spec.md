# Spec: The pet follows the release version

Status: ready-for-agent

## Problem Statement

codex-delegate has two version lines. A **Release** is a `vX.Y.Z` git tag, while the **pet** app is built and published on its own `pet-vX.Y.Z` tags, and a committed `pet-pin.json` names the pet bundle, its tag and its SHA-256 for the installer. Shipping a pet change means: tag `pet-v*`, wait for the Pet release workflow, copy the pin from the job summary, commit the pin, and only then cut a Release. No Release has shipped the pet yet: `v0.3.0` predates it, and installs from `main` take whatever pin `main` currently holds.

This has already gone wrong. `pet-v0.2.1` was tagged and pushed, but its workflow hung in `npm.cmd test` until the six-hour job limit cancelled it. No GitHub Release was created, so the pin could not be bumped, and nothing flagged the failure for a day. The maintainer has to remember two version numbers, users see a pet version unrelated to the Release they installed, and the README release badge looks for `v*` GitHub Releases that have never been created.

## Solution

The pet has no version of its own (ADR 0002). Pushing a `vX.Y.Z` tag runs one release workflow. It checks that the tag matches the version in `package.json`, runs the tests under a time limit, builds the pet app with that version, and creates the `vX.Y.Z` GitHub Release with the pet bundle and its `.sha256` file attached. `install --with-pet` downloads the bundle from the Release named by the installed package's own version and checks it against that Release's `.sha256` file. `doctor` expects the installed pet and the running pet app to report that same version. `pet-pin.json` goes away.

The first Release under this model is `v0.4.0`. It ships the pet for the first time, including the tray work merged after `pet-v0.2.1`. Before that, the hang that cancelled the `pet-v0.2.1` workflow is diagnosed and fixed.

## User Stories

1. As a user, I want `install --with-pet` from a Release tag to install the pet built for that same Release, so that the skills, installer and pet always match.
2. As a user, I want `install --with-pet` from `main` to install the pet of the Release named in `main`'s `package.json`, so that installing "latest" gives a pet that was actually released.
3. As a user, I want the installer to verify the downloaded bundle against the Release's published SHA-256, so that a corrupt or truncated download is never installed.
4. As a user, I want the installer to reject a `.sha256` file that is malformed or names a different file, so that a broken Release can't pass verification by accident.
5. As a user, I want a clear message when the Release for my version has no pet bundle yet, so that I know to retry shortly or install a tagged Release instead of reading a bare HTTP 404.
6. As a user, I want a failed download or a checksum mismatch to leave my existing pet, hooks and settings unchanged, so that a bad Release never breaks a working setup.
7. As a user, I want `install --with-pet --dry-run` to show which Release URL it would download from and that the hash comes from the Release's `.sha256` file, so that I can see what will happen before anything changes.
8. As a user with the pet enabled, I want a plain `install` (a skill update) that runs before the Release's pet bundle exists to stop with the missing-Release message and change nothing, so that my skills, installer and pet never end up on different Releases.
9. As a user with a pet installed from `pet-v0.2.0`, I want running `install --with-pet` again to replace it with the Release's pet, so that upgrading needs no special steps.
10. As a user with a pet installed from `pet-v0.2.0`, I want `doctor` to warn that my pet doesn't match the installed Release and tell me to run `install --with-pet`, so that I notice the outdated pet.
11. As a user, I want `doctor` to report the installed pet as OK when its version matches the package version, so that a correct install isn't flagged because there is no pinned hash to compare.
12. As a user, I want `doctor` to warn when the running pet app reports a different version from the package, so that I can tell when an old pet app is still running after an update.
13. As a user, I want `list` to show the version and tag of the pet that is actually installed, even when it is older than the package, so that I can see what is on disk at a glance.
14. As a user, I want the pet app's executable properties to show the Release version, so that the file on disk agrees with what `/health` and `doctor` report.
15. As a user, I want the README release badge to show the latest `v*` Release, so that the badge reflects what I can install.
16. As a maintainer, I want one version number for the whole project, so that I never have to keep a pet version and a package version in step.
17. As a maintainer, I want to cut a Release by committing the version bump and pushing that commit together with its `vX.Y.Z` tag, so that releasing takes one step.
18. As a maintainer, I want the release workflow to fail before running tests or building when the tag doesn't match `package.json`, so that a mistyped tag or a forgotten version bump never publishes a mislabelled Release and costs no build time.
19. As a maintainer, I want the release workflow to accept only `vX.Y.Z` tags, so that other tags never trigger a release.
20. As a maintainer, I want the release workflow to give up after a bounded time, so that a hung test fails within minutes instead of holding a runner for six hours.
21. As a maintainer, I want every build of the pet app, local or CI, to take its version from `package.json`, so that `/health`, the tray and the executable's properties can never disagree.
22. As a maintainer, I want the release workflow to check the built executable's file version against `package.json` before publishing, so that a version that didn't propagate is caught before users can download it.
23. As a maintainer, I want the release workflow to create the `vX.Y.Z` GitHub Release with generated notes, the pet bundle and its `.sha256` file, so that every Release is a downloadable, documented GitHub Release.
24. As a maintainer, I want no pin commit after a release, so that the tagged commit is complete as it stands.
25. As a maintainer, I want the bundle script to take its version from `package.json`, so that local previews and CI builds name their output the same way.
26. As a maintainer, I want the bundle script to fail when told to expect a tag that doesn't match `package.json`, and to offer a check-only mode, so that the tag check is tested code the workflow can run first.
27. As a maintainer, I want the bundle script to produce only the zip and its `.sha256` file, so that no leftover pin artefact suggests a pin is still needed.
28. As a maintainer, I want a single release procedure in `docs/releasing.md`, so that I don't follow outdated pet-only steps.
29. As a maintainer, I want the release procedure to end with an install from the real Release in an isolated home, so that each Release is checked the way users get it.
30. As a maintainer, I want the hang that cancelled the `pet-v0.2.1` workflow diagnosed and fixed before `v0.4.0` is tagged, so that the first unified Release doesn't stall at the same step.
31. As a maintainer, I want the old `pet-v*` GitHub Releases kept, so that existing download links and history stay valid.
32. As a maintainer, I want the `pet-v0.1.1` and `pet-v0.2.1` tags, which have no Release, removed from the remote, so that every remaining `pet-v*` tag points at a real Release.
33. As a contributor, I want tests to serve a fake Release by version, so that I can exercise install and doctor without a pin file or a test-only pin variable.
34. As a contributor, I want the packaged-install smoke test to prove that the shipped package downloads from the Release for its own version, so that packaging can't silently drop the version wiring.

## Implementation Decisions

- **Version source.** The installed package's `package.json` version is the only version. The pet Release tag is `v` + that version. The asset name stays `codex-delegate-pet-windows-x64.zip`, and its checksum file is that name + `.sha256`.
- **Pin removal.** `pet-pin.json` is deleted from the repository and from the package's shipped files. The pin reader and the `CODEX_DELEGATE_PET_TEST_PIN` override are removed with no replacement. `CODEX_DELEGATE_PET_BASE_URL` stays as the only override, for tests and local previews.
- **Release descriptor.** The pet module gets one function that turns the package root into the expected Release's tag, asset, version and the two download URLs. The installer and `doctor` use it instead of reading a pin. `list` keeps reading the installed marker, because it reports what is installed, not what is expected.
- **Download and verify order.** The installer first downloads `<asset>.sha256` from the Release. It must contain exactly one line, a 64-character hex hash, two spaces and the asset name; anything else fails. Then it downloads the zip and compares hashes. Both downloads keep the existing 30-second timeout and redirect following. Any failure stops before settings, hooks or the existing bundle are touched, as today.
- **Missing Release message.** An HTTP 404 on either download produces an error that names the version and says its Release has no pet bundle yet, that the release workflow may still be running, and that the user can retry later or install from a tagged Release. Other HTTP errors keep the existing "Pet download failed (<url>)" form.
- **Plain install while the Release is missing.** A plain user-scope `install` with the pet enabled already prepares the pet before touching skills. That stays: if the Release's pet bundle is missing, the whole install stops with the missing-Release message and "Nothing was changed", leaving skills, hooks and the existing pet as they were. The skills, installer and pet always move to a new Release together. ADR 0002 and the release procedure record this.
- **Dry run.** The dry run prints the zip URL and says the SHA-256 comes from the `.sha256` file at the Release, instead of printing a pinned hash. It still downloads nothing.
- **Marker shape unchanged.** The install marker's `bundle` field keeps `{ tag, asset, sha256, version }`. `tag` and `version` come from the package version, and `sha256` records the hash of the zip that was verified and installed. Existing markers, including `pet-v0.2.0` ones, are read as they are, so a reinstall replaces them with no migration.
- **Doctor.** The "Pet bundle" check passes when the marker's bundle version equals the package version. It no longer compares tag or SHA-256. On a mismatch it warns with the installed and expected versions and tags and tells the user to run `install --with-pet`. The running-app check compares `/health`'s version with the package version. Both checks keep their current wording apart from where the expected values come from.
- **Bundle script.** The bundle script reads the version from `package.json` and no longer takes `--tag`. It takes an optional `--expect-tag`; if that differs from `v` + the version, it fails before writing anything. With `--check` it only performs that comparison and exits, so the workflow can run it before anything else. It writes the zip and `<asset>.sha256` only and prints the hash and output paths. `--exe`, `--notices` and `--out` are unchanged.
- **Release workflow.** The Pet release workflow becomes the project's release workflow. It triggers on `v*` tags and rejects any tag that isn't `vX.Y.Z`. Its job has a time limit of about 30 minutes; the tests ran in under 2 minutes on the last successful run. Its steps, in order:
  1. Right after checkout and Node setup, run the bundle script with `--check --expect-tag` set to the pushed tag.
  2. Run the tests.
  3. Generate the notices.
  4. Build the pet.
  5. Check that the built executable's file version equals the `package.json` version.
  6. Run the bundle script with `--expect-tag` again.
  7. Create the GitHub Release with generated notes and both assets. The step that printed pin JSON into the job summary is removed. It needs no permissions beyond `contents: write`.
- **App version, single source.** Every pet build takes its version from the repository's `package.json`, whether it runs locally or in CI. That version is what `/health` and the tray report and what the executable's version metadata carries. The `CODEX_DELEGATE_PET_VERSION` override and the fallback to the Rust crate's own version are removed, so a local build can no longer report `0.1.0`. The Tauri config points its version at `package.json`, if Tauri 2 accepts that; this is checked during implementation. The Rust side reads the same file at build time through a build script. If Tauri can't read `package.json`, the build script supplies the version to both.
- **Hung test diagnosis.** The `npm.cmd test` run that hung on the `pet-v0.2.1` workflow is reproduced or bisected locally. If it can't be reproduced locally, a workflow run on a throwaway tag is used. The cause is fixed in code or tests, not only hidden by the timeout. The fix lands before `v0.4.0` is tagged.
- **Tags and Releases.** The `pet-v0.1.0`, `pet-v0.1.2` and `pet-v0.2.0` Releases and tags stay. The `pet-v0.1.1` and `pet-v0.2.1` tags, which have no Release, are deleted from the remote, after the maintainer confirms at the time.
- **First Release.** `v0.4.0` is a minor bump, because it ships the pet for the first time.
- **Docs.** The pet-only release section in the pet README is replaced by a pointer to `docs/releasing.md`. That page describes: bump the version and commit `chore(release): X.Y.Z`; tag `vX.Y.Z`; push the commit and tag together; wait for the release workflow; install from `npx github:starpia-forge/codex-delegate#vX.Y.Z install --with-pet` in an isolated home; run `doctor`. It also states that installs from `main` fail with the missing-Release message until the workflow finishes. Other mentions of `pet-pin.json`, `pet-v*` tags or a separate pet version in README files and the pet README are updated. `.scratch` history is left alone.
- **Domain language.** **Release** is defined in `GLOSSARY.md`; "pet release" and "pet version" are avoided in code, messages and docs. The decision and its trade-off are recorded in ADR 0002.

## Testing Decisions

- Good tests exercise external behaviour at the highest existing seam: run the CLI as a real process against a fake Release server and check what it downloads, what it writes, what it prints and its exit code. They do not test internal helpers on their own.
- **CLI process seam (main).** The install and doctor tests spawn the real CLI with `CODEX_DELEGATE_PET_BASE_URL` pointing at a fake Release server. The shared fake-Release test helper changes from writing a pin file to serving `/v<package version>/<asset>.sha256` and `/v<package version>/<asset>`, with switches for a missing checksum file, a malformed or misnamed checksum line, a mismatched hash, a 404 zip and other HTTP errors. The tests cover:
  - the request order (checksum, then zip) and the exact paths;
  - a successful install, with a marker whose bundle tag and version come from the package version and whose `sha256` is the verified hash;
  - each verification failure leaving the existing bundle, hooks and settings unchanged;
  - the missing-Release message on a 404;
  - the dry-run output, with no network requests;
  - reinstalling over a `pet-v0.2.0` marker;
  - a plain `install` with the pet enabled and the Release missing, which must stop with the message and leave existing skills, hooks and pet files byte-for-byte unchanged;
  - `doctor` passing on a matching version, warning on a `pet-v0.2.0` marker, and warning when `/health` reports a different version;
  - `list` showing a `pet-v0.2.0` marker as installed while running a newer package.
  Prior art: the existing install and doctor pet tests and the fake-Release helper.
- **Package smoke seam.** The packaged-install smoke test packs the package and asserts that `pet-pin.json` is not shipped. It installs from the packed package against a fake Release and asserts that the requests were `/v<version>/<asset>.sha256` then `/v<version>/<asset>`. Prior art: the existing shipped-package smoke test.
- **Bundle script seam.** The bundle script test runs the script with a fake executable and asserts:
  - only the zip and `.sha256` are written;
  - the checksum line is in the format the installer accepts;
  - the version comes from `package.json`;
  - a mismatched `--expect-tag` fails with nothing written, and a matching one succeeds;
  - `--check` writes nothing either way. A test that feeds the script's `.sha256` output to the installer's verification through the CLI seam proves the two formats agree. Prior art: the existing bundle script test.
- **Rust.** The existing `/health` version test changes to compare against the version in the repository's `package.json`, with no environment override. That proves the runtime version comes from the single source in every build.
- **Workflow pre-publication check.** The release workflow compares the built executable's file version with `package.json` before it creates the Release.
- **Not automated.** The workflow YAML (trigger, tag filter, timeout, step order, Release creation) is checked by the real `v0.4.0` Release: the Release exists with both assets, the asset hash matches its `.sha256`, an isolated-home install from the tag passes `doctor`, `/health` reports `0.4.0`, and the executable's file version is `0.4.0`.
- The full `npm.cmd test` suite must pass locally and within the workflow's time limit.

## Out of Scope

- Publishing to npm. The `codex-delegate` npm name belongs to another project, and installs stay `npx github:…`.
- Platforms other than Windows x64 for the pet bundle.
- Signing the bundle or the executable, or any integrity check stronger than the Release's `.sha256` (see ADR 0002).
- Changing how the pet app, hooks, tray or pets behave.
- Deleting or editing the existing `pet-v0.1.0`, `pet-v0.1.2` and `pet-v0.2.0` Releases.
- Automating the version bump (for example a release script or changesets).
- Rewriting `.scratch` history that mentions `pet-v*` tags or the pin.

## Further Notes

- Suggested tickets: (01) diagnose and fix the hung test and add the workflow time limit; (02) switch the installer, doctor, list, bundle script and tests from the pin to the Release version; (03) switch the workflow and the Tauri version source; (04) docs; (05) cut `v0.4.0`, run the acceptance checks against the real Release, and clean up the two Release-less tags. 01 blocks 05. 02 to 04 can run in parallel, and 05 needs all of them. In 05, cleaning up the tags is the last step and blocks nothing.
- The `pet-v0.2.1` workflow run that hung is run 40897872527. Its last successful predecessor, `pet-v0.2.0`, finished its test step in under 2 minutes.
- The tray icon commit `b592c8d` is on local `main` but not yet pushed; it ships in `v0.4.0`.
