# 06: Cut v0.5.0 through the new path

**What to build:** The integration branch is merged to `main` and pushed, which publishes `v0.5.0`, and the real Release is accepted. This push is a public Release, so the maintainer decides when it happens.

**Blocked by:** 04, 05

**Status:** ready-for-human

Spec: `.scratch/semantic-release/spec.md` (Testing Decisions, "Not automated").

- [x] The first push creates `chore(release): 0.5.0` on `main`, tag `v0.5.0` and the Release with both assets.
- [x] The Release's notes list the commits since `v0.4.0`.
- [x] `npx github:starpia-forge/codex-delegate#v0.5.0 install --with-pet` passes `doctor` in an isolated home, and `/health` and the executable report `0.5.0`.
- [x] With a clean npm cache, `npx github:starpia-forge/codex-delegate#v0.5.0 list` doesn't install `sharp` or semantic-release.
- [ ] After that, a push of only `docs` commits releases nothing.
- [ ] Every check above passes. A failure is repaired by following `docs/releasing.md`, and the procedure is corrected if it falls short.

## Comments

- 2026-11-01: PR #2 merged with a merge commit as `265a761`. Run 41291728349 published `v0.5.0` on its second attempt.
  - First attempt: `npm test` failed in prepare, 482 of 483. `doctor reads top-level dotted key with enabled = true` reported `Codex CLI on PATH` as failed, because the fake `codex.cmd` exited non-zero in 141 ms, against about 220 ms for its neighbours. Nothing landed: no commit, tag or Release. This confirms the workflow's PowerShell path, `npm ci --ignore-scripts` and the failed run's artifact step all worked. `docs/releasing.md`'s Tests or build failed state applied, and `main` hadn't moved, so the run was rerun. `doctor` discards the probe's stderr, so the cause isn't known. 720 parallel probes of a freshly written fake `codex` on this machine had no failure, so it isn't reproduced.
  - Second attempt: all 483 tests passed, and the job took about 13 minutes. `ef2dd2c` `chore(release): 0.5.0`, by `semantic-release-bot`, changes only `package.json` and `package-lock.json`, and `v0.5.0` points at it. The Release has the zip (16,206,038 bytes) and `.sha256`, and the success step printed `Release v0.5.0 passed (SHA-256 99257a17…)`.
  - Notes list four features and two fixes since `v0.4.0`. The tray Quit appears twice, as `4e1341e` and `ef072c6`; that merge commit predates the `merge:` rule. The `merge:` subjects don't appear.
  - Clean cache: `npx github:…#v0.5.0 list` with an empty npm cache left `codex-delegate` as the only package in the `_npx` tree, and no `sharp` or `semantic-release` entry in the cache index.
  - Isolated home on port 47812: `install --with-pet` installed bundle `0.5.0` and hooks. Running that app, `/health` reported `0.5.0`, and the executable's FileVersion and ProductVersion are `0.5.0`. `doctor` reported the Pet bundle, hooks, WebView2, configuration, packages and port as OK. It exited 1 only for `Codex logged in`, because that home has no Codex login, and with `CODEX_HOME` pointed at the real login it exited 0. The isolated home was removed afterwards. The user's installed pet app wasn't touched and still runs the older bundle until the next `install`.
