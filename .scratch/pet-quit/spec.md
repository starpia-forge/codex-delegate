# Spec: Quit the pet app from the tray

Status: ready-for-agent

## Problem Statement

While the **pet app** runs, the user can hide the pets but can't end the app itself. The only ways out are waiting ten idle minutes, calling an authenticated HTTP endpoint by hand, killing the process, or removing the pet with the installer. A user who has finished working, and sees no reason to keep about 180 MB and a tray icon around, has no direct way to say so.

The `pet-tray` spec left this out on purpose, on the grounds that the tray should stay minimal and the app restarts anyway. That reasoning doesn't hold when the user isn't working: nothing is about to restart it, and the user still has to wait.

A related gap makes any explicit end feel broken. Today every report starts an absent pet app, including the report that a session has ended. A user who stops the app and then closes Claude Code gets the app back, with an empty strip and a tray icon, for ten more minutes, at the exact moment they stopped working. The same happens after an idle exit.

## Solution

The tray menu gains a **Quit** entry at the bottom, after a separator. Choosing it ends the pet app at once, without asking. It is available in every state, including while pets are hidden and while work is running.

Quit is not a setting. It changes neither **pet enabled** nor **pets hidden**, and it remembers nothing. The next report from a leader or worker starts the pet app again, with one exception: a report that a session has ended no longer starts an absent pet app, because there is nothing left to show.

## User Stories

### Quit

1. As a user who has finished working, I want a Quit entry in the tray menu, so that I can end the pet app without waiting ten idle minutes.
2. As a user, I want Quit to take effect at once, with no confirmation, so that a reversible action costs one click.
3. As a user, I want Quit at the bottom of the menu after a separator, so that it sits where Windows users expect it and is hard to hit by accident.
4. As a user, I want Quit to read `Quit` in English and `종료` in Korean, so that it matches the rest of the menu.
5. As a user, I want the Quit label to change with the Language submenu, without a restart, so that the menu stays in one language.
6. As a user with pets hidden, I want Quit to be available, so that hiding doesn't take away my way to end the app.
7. As a user, I want the tray icon to disappear when I quit, so that a stale icon never points at a process that is gone.
8. As a user with the licences window open, I want it to close with the app, so that no orphan window stays behind.
9. As a user, I want Quit to end the app within a couple of seconds of being chosen, even if shutdown stalls, so that a Quit that registered always finishes.

### What Quit leaves alone

10. As a user, I want Quit to leave the pet enabled, its hooks registered and its bundle installed, so that it never touches my Claude Code settings.
11. As a user, I want pets hidden to survive Quit, so that a relaunch never shows pets I chose to hide.
12. As a user, I want name tags, cursor clearance and language to survive Quit, so that quitting doesn't reset my choices.
13. As a user, I want `list` to keep reporting the pet as enabled after Quit, so that Quit is never mistaken for removal.
14. As a user, I want `doctor` to keep reporting a quit pet app as not running at OK level, so that a deliberate quit never looks like a fault.
15. As a user, I want `install --without-pet` to remain the way to remove the pet, so that there is still one well-defined removal path.

### Starting again

16. As a user, I want the pet app to start again on the next report from a leader or worker, so that I never have to start it by hand.
17. As a user, I want open sessions to reappear with their leader pets when the app starts again, so that quitting doesn't lose my teams.
18. As a user who quits while a worker is running, I want the worker to carry on untouched, so that the pet never affects delegated work.
19. As a user who quits while a worker is running, I want that worker's pet back within its next heartbeat, so that running work stays visible.
20. As a user who quits during computer use, I want the app that starts again to keep pets out of capture, so that a worker's screenshots stay clean.
21. As a user, I want to be able to quit again after the app starts again, so that Quit always works the same way.

### Closing a session

22. As a user who quit the pet app and then closes Claude Code, I want the app to stay closed, so that it doesn't come back with nothing to show.
23. As a user whose pet app exited after ten idle minutes, I want closing a session to leave it closed too, so that the two ways of ending behave alike.
24. As a user with the pet app running, I want closing a session to remove its pets as it does today, so that nothing changes while the app is up.
25. As a user with events already queued for delivery, I want a closing session's report to stay in order behind them, so that replaying them can't leave a closed session showing as open.
26. As a user with a pet app still starting, I want a closing session's report to reach it, so that the new app doesn't show a closed session.

## Implementation Decisions

- **Supersedes** part of the `pet-tray` spec: user stories 9 and 10, and "Quitting the pet app from the tray" in its Out of Scope. "Any way to suppress relaunching it" stays out of scope. The old spec gets a `(Superseded…)` note pointing here, as it already has for the Language submenu.
- No ADR: the decision is cheap to reverse.

### Pet shell

- The tray menu becomes: Show pets, Show name tags, Clear around cursor, Licences, Language, a separator, Quit.
- Quit is a plain menu item with its own menu id, labelled from the catalogue and relabelled with the rest of the tray on a language change.
- Quit is always enabled. It does not consult the stage, the renderer or computer-use state.
- Quit uses the same bounded exit as `POST /quit` and the idle exit: ask Tauri to exit so that it removes its tray resources, and force the process to end after two seconds. The shell has one exit routine, reachable from the tray. The bound starts once the tray callback runs: a UI thread that is already stuck can't dispatch Quit at all.
- The tray keeps no quit state and writes no preference. The HTTP protocol is unchanged.

### Translation catalogue

- A new message id, `tray.quit`: `Quit` in English, `종료` in Korean.

### Delivery (producer side)

- Both the leader hook and the runner keep sending reports as they do. The rule lives in the shared client, at the single point that decides between posting, spooling and starting the helper.
- When the event is a leader `session-end`, health reports the app **absent**, and nothing is pending (no spool file, no delivery lock), the event is dropped: no spool file, no helper, no launch.
- In every other case the event follows the existing path. That includes a `session-end` while the app is `starting`, while delivery is pending, while the `updating` flag is set, and on a healthy app.
- Nothing is normally lost by dropping it. The leader hook tries to remove the session's record before delivering, so an app that starts afterwards doesn't restore that session, and a restarted stage has no such team to close.
- The drop is deliberately not coordinated with other producers. Two cases can still show a closed session's leader pet for a moment: a report another producer hasn't published yet (the leader's asynchronous tool report, for example) starts the app after the drop, or removing the record failed. Both end by themselves, because the shell's liveness check removes the team within seconds of the leader process ending.
- Worker `end`, leader `stop` and every other report keep starting an absent app.

### Documentation

- The pet README's description of the app's lifetime, its tray manual checks and the menu order mention Quit and the `session-end` exception.

### Unchanged

- Hooks, the event format, the HTTP protocol, the installer, the stage, `list`, `doctor`, pet preferences.

## Testing Decisions

- Good tests here drive public seams and check observable results: events received by a stub app, files in the spool, whether the app was launched, catalogue contents. They never check internal calls.
- **Delivery**: the existing delivery test harness, which runs the installed producer against a stub app and a configured launch command. New cases:
  - `session-end` with no app listening and nothing pending: no launch, no spool file, no helper left behind.
  - `session-end` with no app listening and a queued event: the event stays in order, and delivery proceeds as today.
  - `session-end` with no app listening, an empty spool and a held delivery lock: it is spooled, not dropped.
  - `session-end` with no app listening and a fresh `updating` flag: it is spooled and delivered once the update ends, as other events are.
  - `session-end` with a starting app (503 health): it is spooled and delivered.
  - `session-end` with a healthy app: posted as today.
  - Any other leader type and worker `end`, with no app listening: still launch. Prior art: "an absent app starts in the background…" and "concurrent producers launch once…".
- **Leader hook**: one case through the real hook with no app listening: a `SessionEnd` input removes the session's record and starts nothing. Prior art: the leader hook tests.
- **Translation catalogue**: the existing test already requires both languages for every message id. The tray's id list, if it enumerates ids, gains `tray.quit`.
- **Shell (Rust)**: a `cargo test` case covers the Quit label in each language if the tray's label lookup is testable like the Language submenu label. The tray menu itself isn't automated.
- **Not automated**: a manual checklist in the pet README, run on the real app on Windows 10:
  - Menu order, the separator, and the label in both languages, including after switching language.
  - Quit removes the tray icon and strip and ends the process, while shown, while hidden, and with the licences window open.
  - After Quit, `list` still reports enabled and `doctor` reports not running at OK level.
  - A prompt in an open session starts the app, with the leader pet restored and hidden preserved.
  - Quit during a running worker: the worker's result is unaffected and its pet returns.
  - Quit during computer use: the restarted strip stays out of capture.
  - Quit, then `/exit` the last session: the app stays closed.

## Out of Scope

- Any way to suppress relaunching: a "don't start again" option, a snooze, or a tray-side off switch.
- Disabling Quit while work is running, and any confirmation dialog.
- Stopping `stop`, worker `end` or other reports from starting an absent app.
- Coordinating a dropped `session-end` with reports other producers are still publishing.
- Dropping a `session-end` that sits in the spool when the helper finds no app. Such an event still starts the app, for example after an update.
- Stopping leaders or workers from the tray. Quit ends only the pet app.
- A CLI command to quit the pet app.
- Showing a leader's activity after a restart. A leader that was working shows `idle` until its next prompt, as it does after any restart today.

## Further Notes

- A quit made while work is running usually lasts only moments, because the next report starts the app again. This is accepted: Quit is meant for when work has stopped, and it never harms work in progress.
- After a dropped `session-end`, a worker that outlives its session reports to an app that doesn't know the session ended, so its pet shows as a team without a leader until it finishes.
