# 04: A push to main publishes a Release

**What to build:** Pushing to `main` runs the release workflow. If there is something to release, it tests and builds everything, commits the version, tags it, creates the GitHub Release with both assets and checks the result. If there isn't, it does no build work. A tag pushed by hand no longer does anything.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

Spec: `.scratch/semantic-release/spec.md` (user stories 1, 9–16, 20–27, Workflow, Release build).

- [ ] The workflow triggers on pushes to `main`, and the `v*` tag trigger is gone.
- [ ] One `windows-latest` job with a 30-minute limit, a concurrency group that queues rather than cancels, and `contents: write` only.
- [ ] Full history and tags are checked out, Node is pinned to a major semantic-release supports, and dependencies come from the lockfile.
- [ ] One release script takes the version, stops at the first failure and runs every existing check: Node tests, Rust tests, notices, build, executable product and file versions, packaging with `--expect-tag`.
- [ ] The published-Release check runs as the last step of a Release.
- [ ] The bundle is uploaded as an artifact when the job doesn't succeed, including a timeout, and a missing bundle doesn't fail that step.
- [ ] The release script runs locally to completion with a test version, publishing nothing.
- [ ] `npm test` passes.
