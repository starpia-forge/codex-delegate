# 01: Release tests finish instead of hanging

**What to build:** The release workflow's test step finishes in minutes again. The `npm.cmd test` run that hung on the `pet-v0.2.1` workflow (run 40897872527) is diagnosed and fixed at its cause. It sat in the test step until GitHub's six-hour job limit cancelled it; on the `pet-v0.2.0` run the same step took under 2 minutes. The workflow job also gets a time limit, so any future hang fails within about 30 minutes instead of six hours.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The hang is reproduced or narrowed down. Try locally on Windows first, by bisecting between `pet-v0.2.0` and `pet-v0.2.1` or by running the test files in isolation. If it can't be reproduced locally, use a workflow run on a throwaway tag.
- [ ] The root cause is recorded under `## Comments` in this ticket.
- [ ] The cause is fixed in code or tests, not only hidden by the time limit. A regression test is added where the cause allows one.
- [ ] The release workflow's job has a time limit of about 30 minutes.
- [ ] `npm.cmd test` passes locally on Windows.

## Comments
