# 01: Verify team identity and Claude Code hook facts

**What to build:** A short findings note, appended to the spec under `## Findings`, that settles the facts the pet design rests on, and a go/no-go on the team key. A **team** must survive `/clear` inside one Claude Code window, and a worker must find the team of the leader that started it. The spec's candidate team key is the Claude Code process id (`CLAUDE_PID` is visible to commands the leader runs on this machine); this ticket proves or disproves it. Needs a real interactive Claude Code session on Windows, including `/clear`, so it is for a human (the leader can drive it with the user).

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Team identity, Claude Code settings merge, Event protocol)

- [x] Shows whether hook commands and commands run by the leader see the same Claude process id (`CLAUDE_PID`, or the hook's parent process) on Windows, before and after `/clear`, and across two concurrent sessions.
- [x] Shows whether the hook input's `session_id` and `CLAUDE_CODE_SESSION_ID` match before and after `/clear`.
- [x] Confirms the names and payloads of the hook events the spec uses: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Notification` (and its notification types: which mean a permission prompt or a question for the user), `Stop`, `PostToolUse`.
- [x] Confirms whether Claude Code supports command hooks that don't block the session, and whether a hook exists for a turn ending in an API error.
- [x] Records a go/no-go: go only if a team key shared by hooks and leader-run commands exists and survives `/clear`. On no-go, stop and report to the user; tickets 02 onwards stay blocked until the team design is revisited.

## Comments

- 2026-10-29: Probe run with the user in two sessions (A with `/clear`, B concurrent, closed by its window). Go: `CLAUDE_PID` is shared by hooks and commands and survives `/clear`. Results in the spec's `## Findings`; the spec's team identity, hook events and hook mapping were updated accordingly (`PermissionRequest` for waiting, `SessionEnd`/`SessionStart` around `/clear` ignored, `StopFailure` for leader `failed`, `PostToolUse` registered async).
