# 05: Cut v0.4.0 and accept it from the real Release

**What to build:** The first **Release** that ships the pet, `v0.4.0`, is cut with the procedure in `docs/releasing.md` and checked the way users receive it. Pushing and deleting remote tags need the maintainer's approval at the time.

**Blocked by:** 01, 02, 03, 04

**Status:** ready-for-human

- [ ] The version is bumped to `0.4.0` and committed as `chore(release): 0.4.0`. The commit and the `v0.4.0` tag are pushed together, after approval.
- [ ] The release workflow is green within its time limit. The `v0.4.0` GitHub Release has the zip and `.sha256`, and the zip's hash matches.
- [ ] An install from `#v0.4.0` with `--with-pet` into an isolated home passes `doctor`. `/health` reports `0.4.0`, and the executable's file version is `0.4.0`.
- [ ] Upgrading the maintainer's own `pet-v0.2.0` install with `install --with-pet` works: `doctor` is all OK at `0.4.0` and the app restarts on the new bundle.
- [ ] The README release badge shows `v0.4.0`.
- [ ] Last, and blocking nothing: after confirmation, the `pet-v0.1.1` and `pet-v0.2.1` tags, which have no Release, are deleted from the remote. The `pet-v0.1.0`, `pet-v0.1.2` and `pet-v0.2.0` Releases and tags stay.

## Comments
