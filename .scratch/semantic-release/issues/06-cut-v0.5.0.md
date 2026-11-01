# 06: Cut v0.5.0 through the new path

**What to build:** The integration branch is merged to `main` and pushed, which publishes `v0.5.0`, and the real Release is accepted. This push is a public Release, so the maintainer decides when it happens.

**Blocked by:** 04, 05

**Status:** ready-for-human

Spec: `.scratch/semantic-release/spec.md` (Testing Decisions, "Not automated").

- [ ] The first push creates `chore(release): 0.5.0` on `main`, tag `v0.5.0` and the Release with both assets.
- [ ] The Release's notes list the commits since `v0.4.0`.
- [ ] `npx github:starpia-forge/codex-delegate#v0.5.0 install --with-pet` passes `doctor` in an isolated home, and `/health` and the executable report `0.5.0`.
- [ ] With a clean npm cache, `npx github:starpia-forge/codex-delegate#v0.5.0 list` doesn't install `sharp` or semantic-release.
- [ ] After that, a push of only `docs` commits releases nothing.
- [ ] Every check above passes. A failure is repaired by following `docs/releasing.md`, and the procedure is corrected if it falls short.
