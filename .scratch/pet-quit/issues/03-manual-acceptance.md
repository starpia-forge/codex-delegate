# 03: Manual acceptance on the real app

**What to build:** The spec's manual checklist is run against a built pet app on Windows 10, and the results are recorded on this ticket, so that Quit and the closing-session rule are confirmed where automated tests can't reach.

**Blocked by:** 01, 02

**Status:** ready-for-human

Spec: `.scratch/pet-quit/spec.md` (Testing Decisions, "Not automated").

- [x] Menu order, the separator and the Quit label in both languages, including after switching language.
- [x] Quit removes the tray icon and strip and ends the process, while shown, while hidden and with the licences window open.
- [x] After Quit, `list` still reports enabled and `doctor` reports not running at OK level.
- [x] A prompt in an open session starts the app, with the leader pet restored and pets hidden preserved.
- [x] Quit during a running worker: the worker's result is unaffected and its pet returns.
- [ ] Quit during computer use: the restarted strip stays out of capture.
- [x] With a real Claude Code session, Quit, then `/exit` the last session: the app stays closed.
- [ ] Every check above passes. A failure in this feature is fixed and retested before this ticket closes; only an unrelated defect may move to a follow-up ticket.

## Comments

- 2026-11-01: Run on `feat/pet-quit` at 2bcf739 on Windows 10, with a release build in an isolated home on port 47811, beside the user's installed pet app. Six of seven checks pass; the ticket stays open for computer use.
  - Through the real tray, by a Codex computer-use worker using real mouse input: menu order and separator, `Quit` and `종료` with the same process across language changes, and Quit while shown, while hidden and with the licences window open. No confirmation appeared, the icon, process and licences window went away, and preferences were unchanged.
  - `list` reports enabled and `doctor` reports `pet app not running` at OK level.
  - Through `POST /quit`, the exit routine the tray shares, because the tray couldn't be reached together with a live session: a real Claude Code session held open over stream-json. A prompt restarted the app with a new process id and the leader pet back; with pets hidden the app restarted with `hidden` kept and no leader pet on screen. Ending the session with the app quit left it closed 20 seconds later, with the session record removed and an empty spool. The session ended by closing its input, not by typing `/exit`.
  - A real researcher worker: after `POST /quit` its next report restarted the app within 7 seconds, `researcher · task-one` returned, and the worker exited 0 with its result.
  - Not run: Quit during computer use. It needs a real computer-user run, and this ticket's computer-use attempts are used up.
