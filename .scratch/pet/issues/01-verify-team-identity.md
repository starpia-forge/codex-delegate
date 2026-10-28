# 01: Verify team identity and Claude Code hook facts

**What to build:** A short findings note, appended to the spec under `## Findings`, that settles the facts the pet design rests on, and a go/no-go on the team key. A **team** must survive `/clear` inside one Claude Code window, and a worker must find the team of the leader that started it. The spec's candidate team key is the Claude Code process id (`CLAUDE_PID` is visible to commands the leader runs on this machine); this ticket proves or disproves it. Needs a real interactive Claude Code session on Windows, including `/clear`, so it is for a human (the leader can drive it with the user).

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

Spec: `.scratch/pet/spec.md` (Team identity, Claude Code settings merge, Event protocol)

- [ ] Shows whether hook commands and commands run by the leader see the same Claude process id (`CLAUDE_PID`, or the hook's parent process) on Windows, before and after `/clear`, and across two concurrent sessions.
- [ ] Shows whether the hook input's `session_id` and `CLAUDE_CODE_SESSION_ID` match before and after `/clear`.
- [ ] Confirms the names and payloads of the hook events the spec uses: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Notification` (and its notification types: which mean a permission prompt or a question for the user), `Stop`, `PostToolUse`.
- [ ] Confirms whether Claude Code supports command hooks that don't block the session, and whether a hook exists for a turn ending in an API error.
- [ ] Records a go/no-go: go only if a team key shared by hooks and leader-run commands exists and survives `/clear`. On no-go, stop and report to the user; tickets 02 onwards stay blocked until the team design is revisited.
