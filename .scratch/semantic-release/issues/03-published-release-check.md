# 03: The published Release can be checked

**What to build:** The bundle script can check a Release that has already been published. Given a version, it downloads that Release's `.sha256` file and zip, and fails unless the checksum line is valid and matches the zip. It is separate from the existing local `--check`, which stays as the packaging guard.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/semantic-release/spec.md` (user story 23, Published-Release check).

- [x] The version is an explicit input and may differ from the checkout's `package.json`.
- [x] It reads the same base-URL override as the installer and accepts exactly the checksum format the installer accepts.
- [x] As a process against the fake-Release helper, it passes on a good Release, and fails on a missing zip, a missing `.sha256` file, a malformed line and a mismatched hash.
- [x] A test checks a Release whose version differs from `package.json`, so a check that ignores its input fails.
- [x] Run by hand against the real `v0.4.0` Release, it passes.
- [x] `npm test` passes.

## Comments

### 2026-11-01 — Implemented

The check is `node scripts/pet-bundle.mjs --check-published <version>`. The version is a bare `X.Y.Z` (semantic-release's `nextRelease.version`); `v0.4.0` is refused. It can't be combined with `--check` or `--expect-tag`, and it writes nothing.

`bin/pet.mjs` now exports `downloadPetRelease`, which the installer and the check both call, so the checksum format is shared rather than copied. `readPetRelease` takes an optional version.

Run by hand, with no base-URL override: `--check-published 0.4.0` printed `Release v0.4.0 passed (SHA-256 d412cf6e81bef2294854f69d7bd352065e227cb3633a243711d732c1631a9366)` and exited 0. `--check-published 0.0.1` exited 1 and named the missing `.sha256` URL. `npm.cmd test`: 466 passed.
