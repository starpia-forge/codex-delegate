# 05: The release procedure and commit rules are written down

**What to build:** A maintainer can read how a push becomes a Release, and what to do when a run fails. A contributor can read how to name commits so that a change reaches users, and users see no stale version in the install example.

**Blocked by:** 04

**Status:** ready-for-agent

Spec: `.scratch/semantic-release/spec.md` (user stories 22, 29–32, 34, Failure states, Documentation).

- [ ] `docs/releasing.md` explains how a push becomes a Release, and keeps the explanation of the missing-Release message.
- [ ] Each failure state in the spec has a way to recognise it and a repair, including rebuilding the bundle from the tagged commit.
- [ ] The isolated-home install check stays as an optional procedure.
- [ ] `AGENTS.md` says that a change to anything users receive is a `feat` or `fix`, and that merge commits use `merge:`.
- [ ] Both READMEs' pinned-install example reads `#vX.Y.Z`.
- [ ] No doc tells anyone to bump or tag by hand for a routine Release, including the pet README. Manual tagging appears only as a repair step.
