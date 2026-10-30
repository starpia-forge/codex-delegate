# 03: install and doctor follow the Release for the package version

**What to build:** `install --with-pet` installs the pet bundle from the **Release** named by the installed package's own version, checked against that Release's `.sha256` file. `doctor` expects that same version. `pet-pin.json` disappears. The bundle script changes in the same ticket, so the packaged-install smoke test stays green. See spec sections "Version source" to "Docs" and ADR 0002.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Bundle script:
- [x] Reads the version from `package.json`; `--tag` is removed. It writes only the zip and `<asset>.sha256`, as one line: `<hash>  <asset>`.
- [x] `--expect-tag` that doesn't equal `v` + the version fails before writing anything. `--check` only performs that comparison and writes nothing.
- [x] Bundle script tests cover these outputs and flags.

Installer, doctor, list:
- [x] `pet-pin.json`, the pin reader and `CODEX_DELEGATE_PET_TEST_PIN` are removed, including from the package's shipped files. `CODEX_DELEGATE_PET_BASE_URL` remains.
- [x] install downloads `v<version>/<asset>.sha256` first, then the zip. It rejects a malformed or misnamed checksum line and a hash mismatch.
- [x] A 404 on either download gives the missing-Release message, which names the version, says the workflow may still be running, and says to retry later or install from a tag. Other HTTP errors keep the "Pet download failed (<url>)" form.
- [x] Preflight, download and verification failures stop before skills, settings, hooks or the existing bundle are touched. This includes a plain user-scope `install` with the pet enabled. Failures after applying starts keep today's applied-step reporting and recovery.
- [x] The dry run shows the zip URL and says the hash comes from the Release's `.sha256` file. It makes no requests.
- [x] The marker keeps `{ tag, asset, sha256, version }`: tag and version come from the package version, and `sha256` is the verified hash.
- [x] doctor's "Pet bundle" check compares versions only. Matching versions are OK even when the marker's tag and hash differ. A version mismatch, such as a `pet-v0.2.0` marker, warns and tells the user to run `install --with-pet`. The running-app check compares `/health` with the package version.
- [x] `list` keeps showing the installed marker.

Tests and docs:
- [x] The fake-Release test helper serves `/v<version>/<asset>.sha256` and the zip, with switches for each failure.
- [x] CLI-process tests cover:
  - request order and paths;
  - the marker after a successful install;
  - each verification failure leaving state unchanged;
  - the 404 message;
  - a dry run that makes no requests;
  - reinstalling over a `pet-v0.2.0` marker;
  - a plain install with the Release missing, leaving skills, hooks and pet files unchanged;
  - the doctor cases above;
  - `list` with a legacy marker.
- [x] The packaged-install smoke test asserts that `pet-pin.json` is not shipped. It serves the real bundle script's zip and `.sha256` and asserts the requests `/v<version>/<asset>.sha256` then `/v<version>/<asset>`. This also proves the script's checksum format matches what the installer accepts.
- [x] Mentions of `pet-pin.json`, the pin or a separate pet version in the README files are updated, except the release procedure, which belongs to ticket 04.
- [x] `npm.cmd test` passes.

## Comments

- 2026-10-30: Implemented the package-derived Release descriptor, checksum-first downloads with strict checksum-line validation, missing-Release guidance on either 404, version-only doctor checks, and marker-based legacy listing. Removed the pin file, shipped-file entry, reader and test override. The existing CLI preflight/apply flow remains intact.
- Updated the fake-Release helper and CLI-process tests for exact request paths/order, verified markers, checksum/HTTP failures with byte-identical existing skills/hooks/bundle, no-request dry runs, legacy-marker reinstall/list, doctor version matching and running-app mismatch. The packaged smoke test serves the real bundle script's two outputs and proves cross-format compatibility without shipping a pin.
- Bundle script tests cover zip/checksum-only output, removed --tag, --expect-tag mismatch before inputs/writes, and check-only mode. README installation/preview guidance now follows the Release.
- Scope note for ticket 04: `.github/workflows/pet-release.yml` still invokes the removed --tag flag and expects pin output. The numbered historical procedure in `pet/README.md` still references the removed pin file; it is explicitly marked obsolete rather than rewritten here. Workflow and release-procedure migration remain outside this ticket. Rust is untouched.
- Validation: every test command used `--test-timeout=60000` and an outer Python subprocess timeout of 180 seconds. Red/green runs used `--test-name-pattern` for bundle outputs/flags, successful install, checksum validation, missing-Release errors and doctor matching. Final file-level runs: `node --test --test-timeout=60000 test/pet-bundle.test.mjs` (4 passed); `node --test --test-timeout=60000 test/install-pet.test.mjs` (120 passed before the final six checksum cases); `node --test --test-timeout=60000 test/doctor-pet.test.mjs test/doctor.test.mjs` (79 passed); `node --test --test-timeout=60000 test/package-smoke.test.mjs` (1 passed). The last targeted install run (`--test-name-pattern=legacy marker|preflight failure|dry run`) passed 22 tests, including the final checksum cases and explicit legacy reinstall.
- Final validation: `npm.cmd test -- --test-timeout=60000` passed all 440 tests, with zero failures, skips or cancellations, in 103.4 seconds. The first full-run wrapper failed while printing captured output because of the Windows console encoding; the full run was repeated with UTF-8 reporting and exited 0. `git diff --check` is clean. All ticket criteria are complete; no branches, commits, staging or other git-state changes were made.
