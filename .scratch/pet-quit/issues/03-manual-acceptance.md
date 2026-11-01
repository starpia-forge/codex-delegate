# 03: Manual acceptance on the real app

**What to build:** The spec's manual checklist is run against a built pet app on Windows 10, and the results are recorded on this ticket, so that Quit and the closing-session rule are confirmed where automated tests can't reach.

**Blocked by:** 01, 02

**Status:** ready-for-human

Spec: `.scratch/pet-quit/spec.md` (Testing Decisions, "Not automated").

- [ ] Menu order, the separator and the Quit label in both languages, including after switching language.
- [ ] Quit removes the tray icon and strip and ends the process, while shown, while hidden and with the licences window open.
- [ ] After Quit, `list` still reports enabled and `doctor` reports not running at OK level.
- [ ] A prompt in an open session starts the app, with the leader pet restored and pets hidden preserved.
- [ ] Quit during a running worker: the worker's result is unaffected and its pet returns.
- [ ] Quit during computer use: the restarted strip stays out of capture.
- [ ] With a real Claude Code session, Quit, then `/exit` the last session: the app stays closed.
- [ ] Every check above passes. A failure in this feature is fixed and retested before this ticket closes; only an unrelated defect may move to a follow-up ticket.
