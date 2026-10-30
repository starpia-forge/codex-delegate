# 03: install and doctor follow the Release for the package version

**What to build:** `install --with-pet` installs the pet bundle from the **Release** named by the installed package's own version, checked against that Release's `.sha256` file. `doctor` expects that same version. `pet-pin.json` disappears. The bundle script changes in the same ticket, so the packaged-install smoke test stays green. See spec sections "Version source" to "Docs" and ADR 0002.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Bundle script:
- [ ] Reads the version from `package.json`; `--tag` is removed. It writes only the zip and `<asset>.sha256`, as one line: `<hash>  <asset>`.
- [ ] `--expect-tag` that doesn't equal `v` + the version fails before writing anything. `--check` only performs that comparison and writes nothing.
- [ ] Bundle script tests cover these outputs and flags.

Installer, doctor, list:
- [ ] `pet-pin.json`, the pin reader and `CODEX_DELEGATE_PET_TEST_PIN` are removed, including from the package's shipped files. `CODEX_DELEGATE_PET_BASE_URL` remains.
- [ ] install downloads `v<version>/<asset>.sha256` first, then the zip. It rejects a malformed or misnamed checksum line and a hash mismatch.
- [ ] A 404 on either download gives the missing-Release message, which names the version, says the workflow may still be running, and says to retry later or install from a tag. Other HTTP errors keep the "Pet download failed (<url>)" form.
- [ ] Preflight, download and verification failures stop before skills, settings, hooks or the existing bundle are touched. This includes a plain user-scope `install` with the pet enabled. Failures after applying starts keep today's applied-step reporting and recovery.
- [ ] The dry run shows the zip URL and says the hash comes from the Release's `.sha256` file. It makes no requests.
- [ ] The marker keeps `{ tag, asset, sha256, version }`: tag and version come from the package version, and `sha256` is the verified hash.
- [ ] doctor's "Pet bundle" check compares versions only. Matching versions are OK even when the marker's tag and hash differ. A version mismatch, such as a `pet-v0.2.0` marker, warns and tells the user to run `install --with-pet`. The running-app check compares `/health` with the package version.
- [ ] `list` keeps showing the installed marker.

Tests and docs:
- [ ] The fake-Release test helper serves `/v<version>/<asset>.sha256` and the zip, with switches for each failure.
- [ ] CLI-process tests cover:
  - request order and paths;
  - the marker after a successful install;
  - each verification failure leaving state unchanged;
  - the 404 message;
  - a dry run that makes no requests;
  - reinstalling over a `pet-v0.2.0` marker;
  - a plain install with the Release missing, leaving skills, hooks and pet files unchanged;
  - the doctor cases above;
  - `list` with a legacy marker.
- [ ] The packaged-install smoke test asserts that `pet-pin.json` is not shipped. It serves the real bundle script's zip and `.sha256` and asserts the requests `/v<version>/<asset>.sha256` then `/v<version>/<asset>`. This also proves the script's checksum format matches what the installer accepts.
- [ ] Mentions of `pet-pin.json`, the pin or a separate pet version in the README files are updated, except the release procedure, which belongs to ticket 04.
- [ ] `npm.cmd test` passes.

## Comments
