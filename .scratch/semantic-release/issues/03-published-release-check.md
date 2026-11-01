# 03: The published Release can be checked

**What to build:** The bundle script can check a Release that has already been published. Given a version, it downloads that Release's `.sha256` file and zip, and fails unless the checksum line is valid and matches the zip. It is separate from the existing local `--check`, which stays as the packaging guard.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/semantic-release/spec.md` (user story 23, Published-Release check).

- [ ] The version is an explicit input and may differ from the checkout's `package.json`.
- [ ] It reads the same base-URL override as the installer and accepts exactly the checksum format the installer accepts.
- [ ] As a process against the fake-Release helper, it passes on a good Release, and fails on a missing zip, a missing `.sha256` file, a malformed line and a mismatched hash.
- [ ] A test checks a Release whose version differs from `package.json`, so a check that ignores its input fails.
- [ ] Run by hand against the real `v0.4.0` Release, it passes.
- [ ] `npm test` passes.
