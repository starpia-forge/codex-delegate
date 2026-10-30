# 05: Cut v0.4.0 and accept it from the real Release

**What to build:** The first **Release** that ships the pet, `v0.4.0`, is cut with the procedure in `docs/releasing.md` and checked the way users receive it. Pushing and deleting remote tags need the maintainer's approval at the time.

**Blocked by:** 01, 02, 03, 04

**Status:** ready-for-human

- [x] The version is bumped to `0.4.0` and committed as `chore(release): 0.4.0`. The commit and the `v0.4.0` tag are pushed together, after approval.
- [x] The release workflow is green within its time limit. The `v0.4.0` GitHub Release has the zip and `.sha256`, and the zip's hash matches.
- [x] An install from `#v0.4.0` with `--with-pet` into an isolated home passes `doctor`. `/health` reports `0.4.0`, and the executable's file version is `0.4.0`.
- [x] Upgrading the maintainer's own `pet-v0.2.0` install with `install --with-pet` works: `doctor` is all OK at `0.4.0` and the app restarts on the new bundle.
- [x] The README release badge shows `v0.4.0`.
- [ ] Last, and blocking nothing: after confirmation, the `pet-v0.1.1` and `pet-v0.2.1` tags, which have no Release, are deleted from the remote. The `pet-v0.1.0`, `pet-v0.1.2` and `pet-v0.2.0` Releases and tags stay.

## Comments

- 2026-10-30: `chore(release): 0.4.0` (8c15e42) was fast-forwarded onto `main` together with the feature branch. Before that, Rust tests (51) and Node tests (442) passed locally at 0.4.0. `main` and `v0.4.0` were pushed with one `--atomic` push.
- Release workflow run 41034577899 succeeded in about 15 minutes, inside the 30-minute limit. The test step took 126 s; the `pet-v0.2.1` hang did not recur. Step times: `cargo test` 172 s, cargo-about 218 s, release build 235 s; the executable version check passed. The Release was published at 09:49:53Z with `codex-delegate-pet-windows-x64.zip` (16,193,808 bytes) and its `.sha256`. The downloaded zip hashes to `d412cf6e…9366`, which matches the `.sha256` file.
- Isolated home (port 47811): `npx github:starpia-forge/codex-delegate#v0.4.0 install --with-pet` succeeded, and every `doctor` pet check is OK at 0.4.0. The only FAIL, "Codex logged in", is expected in an isolated home. The installed executable reports FileVersion and ProductVersion `0.4.0`. Started by hand, it answered authenticated `/health` with `version: "0.4.0"`, then quit cleanly.
- Maintainer's home: the installed marker said `pet-v0.2.1` (version 0.2.1), a local build that was never released, not `pet-v0.2.0`; the upgrade path is the same. `install --with-pet` from `#v0.4.0` replaced it, and every `doctor` check is OK, with the pet bundle at 0.4.0. The pet app was stopped for the update and starts again on the next leader or worker event.
- The README badge (shields.io, `filter=v*`) shows `v0.4.0`.
