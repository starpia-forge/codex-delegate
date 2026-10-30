# 01: Release tests finish instead of hanging

**What to build:** The release workflow's test step finishes in minutes again. The `npm.cmd test` run that hung on the `pet-v0.2.1` workflow (run 40897872527) is diagnosed and fixed at its cause. It sat in the test step until GitHub's six-hour job limit cancelled it; on the `pet-v0.2.0` run the same step took under 2 minutes. The workflow job also gets a time limit, so any future hang fails within about 30 minutes instead of six hours.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The hang is reproduced or narrowed down. Try locally on Windows first, by bisecting between `pet-v0.2.0` and `pet-v0.2.1` or by running the test files in isolation. If it can't be reproduced locally, use a workflow run on a throwaway tag.
- [ ] The root cause is recorded under `## Comments` in this ticket.
- [ ] The cause is fixed in code or tests, not only hidden by the time limit. A regression test is added where the cause allows one.
- [x] The release workflow's job has a time limit of about 30 minutes.
- [x] `npm.cmd test` passes locally on Windows.

## Comments

### 2026-10-30 — Windows diagnosis and teardown fix

**Incident attribution remains a hypothesis.** The original six-hour hang did not reproduce locally: unmodified HEAD passed 417 tests in 85.849 s wall time, and an archive of `pet-v0.2.1` passed 393 tests in 86.523 s. Both ran on Windows with Node v24.18.0 and npm 11.16.0. The historical workflow logs are unavailable, so these results do not establish which test stalled in run 40897872527. No authenticated workflow run or throwaway tag was created: network/auth are unavailable in this sandbox, and this ticket explicitly prohibits changing git state.

**Confirmed defect and best-supported hang hypothesis:** `test/pet-delivery.test.mjs` registered its fixture teardown before the silent-listener tests' socket cleanup. The fixture awaited `server.close()`, which waits for unfinished connections, while a later `t.after` hook was responsible for destroying those connections. Hooks run in registration order, so a surviving connection can prevent its own cleanup hook from ever running. This is a genuine teardown deadlock, independently reproduced by keeping an HTTP request unfinished. Ordinary client timeouts normally close the connections, explaining why the existing suite can pass locally; a connection surviving into teardown exposes the hang. Whether that happened on the CI runner is unverified.

The tag diff was inspected (`git log pet-v0.2.0..pet-v0.2.1`, `git diff --stat`, and the animation/layout/stage/test diffs). The new animation tests use synchronous, bounded loops and an injected clock; their individual runs finish in less than 0.1 s. The faulty delivery teardown is unchanged between both tags, so there is no evidence that animation pacing itself introduced the hang.

The fix tracks connections in the common delivery fixture and destroys them before awaiting server shutdown. The later, unreachable socket-cleanup hooks were removed. The new regression, “delivery fixture cleanup closes an unfinished HTTP request without waiting for the client”, runs a nested real fixture with an unfinished `/health` request. A two-second rescue timer ensures the old behavior fails rather than hanging the regression. It failed against the old teardown (2.095 s overall) and passed after the fix (0.117 s overall). The rescue timer starts after setup so slow fixture creation does not consume the teardown allowance. The regression itself also has a ten-second timeout.

The only workflow change is `jobs.release.timeout-minutes: 30` in `.github/workflows/pet-release.yml`. Workflow restructuring and release-version wiring remain outside this ticket.

**Commands and measurements:** Every `test/*.test.mjs` file was run individually first with `node --test --test-timeout=60000 <file>`, before either full-suite run. The following are Node's reported file durations in seconds; all files report zero failures.

| Test file under `test/` | Seconds | Passed |
| --- | ---: | ---: |
| `codex-run.test.mjs` | 13.306 | 26 |
| `doctor.test.mjs` | 2.679 | 11 |
| `doctor-pet.test.mjs` | 26.249 | 68 |
| `install-pet.test.mjs` | 87.823 | 106 |
| `package-smoke.test.mjs` | 3.433 | 1 |
| `pet-animations.test.mjs` | 0.076 | 10 |
| `pet-bundle.test.mjs` | 1.468 | 3 |
| `pet-config.test.mjs` | 1.779 | 17 |
| `pet-cursor-clearance.test.mjs` | 0.080 | 6 |
| `pet-delivery.test.mjs` | 18.847 | 25 |
| `pet-draw-pause.test.mjs` | 0.068 | 2 |
| `pet-frame.test.mjs` | 0.066 | 1 |
| `pet-layout.test.mjs` | 0.088 | 8 |
| `pet-leader-hook.test.mjs` | 5.560 | 31 |
| `pet-licences.test.mjs` | 0.074 | 5 |
| `pet-messages.test.mjs` | 0.079 | 2 |
| `pet-notices.test.mjs` | 0.133 | 9 |
| `pet-renderer.test.mjs` | 0.104 | 9 |
| `pet-runner.test.mjs` | 21.599 | 23 |
| `pet-stage.test.mjs` | 0.093 | 47 |
| `pet-tray-icon.test.mjs` | 0.077 | 3 |
| `windows-stop-tree.test.mjs` | 0.393 | 1 |

The first file-loop wrapper allowed 70 s per file. That was too short for the installation file, which intentionally includes a 21-second delivery wait among 106 tests. The wrapper's `taskkill /T` attempt was denied; the child completed normally and its log reported 106 passes in 87.823 s. This was a diagnostic-wrapper limit, not a reproduction of the six-hour hang. The installation file was then rerun with a longer outer limit to verify its exit code.

Full-suite commands used `npm.cmd test -- --test-timeout=60000` inside a 180-second outer process limit. The tag was extracted with `git archive --format=tar --output=<temp>/pet-v0.2.1.tar pet-v0.2.1` and Windows' `tar.exe -xf ... -C <temp>/pet-v0.2.1`, outside the repository, without stash, checkout, branches, commits, or tags. The focused red/green command was `node --test --test-timeout=60000 --test-name-pattern='delivery fixture cleanup' test/pet-delivery.test.mjs`. The fixed delivery file also passed all 27 tests in 18.723 s (18.855 s wall time). Final validation is recorded below.

**Final validation:** `node --test --test-timeout=60000 test/install-pet.test.mjs` completed with exit code 0 and 106 passes in 82.240 s (82.329 s wall time), under a 150-second outer limit. Plain `npm.cmd test`, with no extra Node flags and a 180-second outer limit, completed with exit code 0: 419 passed, zero failures/cancellations/skips, 84.777 s reported by Node (85.264 s wall time). `git diff --check` passed. The remaining historical-incident checkboxes stay open because the fixture deadlock is proven and fixed, but attribution to run 40897872527 is not confirmed; an authenticated CI reproduction remains outstanding.

### 2026-10-30 — v0.4.0 Release run

The first Release workflow (run 41034577899) finished its `npm.cmd test` step in 126 s, inside the 30-minute job limit, so the hang did not recur on the runner. That fits the delivery-teardown hypothesis but does not prove it. The time limit now caps any future recurrence at 30 minutes.
