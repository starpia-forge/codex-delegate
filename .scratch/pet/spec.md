# Spec: Desktop pets for the leader and workers (`--with-pet`)

Status: ready-for-agent

## Problem Statement

While a delegated workflow runs, the user has no ambient sense of what is happening: whether the **leader** is thinking or waiting for them, which **workers** are running, which have finished, and which failed. The only signal is the terminal, which is often behind other windows. The user also wants the multi-agent workflow to be fun to watch: each agent as a character on the desktop, spawning, working, reporting back and interacting with the others.

This must stay an opt-in extra. Most users of codex-delegate should never download a desktop binary or have their Claude Code settings touched.

## Solution

An optional feature, installed only with `install --with-pet`, that shows a **pet** on the desktop for every running leader session and every running worker. A leader and the workers it started form a **team**; pets in a team act out the delegation flow: the leader waves a new worker off, the worker runs to its spot and works, then runs back to report (or reacts to a failure) and leaves.

Pets live in a transparent, click-through strip along the bottom of the primary monitor, above the taskbar. The strip stays above other windows, never blocks clicks, pauses and drops behind any fullscreen app, and hides from screen capture while computer use is running. Pet artwork uses the Codex pet package format, so the user can reuse pets they already have for Codex or swap in their own.

Once enabled, the pet stays installed across updates until the user runs `install --without-pet` or `uninstall`. First version: Windows only, user scope only.

A throwaway prototype on branch `prototype/tauri-overlay` (commits `6be7cbd`, `0f72062`) confirmed on Windows 10 with Tauri v2: per-pixel alpha, click-through that survives hide/show, re-asserting topmost against newer always-on-top windows, fullscreen detection with pause and z-order drop, capture exclusion, about 180 MB private memory including WebView2, and under 3 % of one core while animating.

## User Stories

### Installing and removing

1. As a user, I want the pet to be off unless I pass `--with-pet` to `install`, so that a normal install never downloads a binary or changes my Claude Code settings.
2. As a user, I want `install --with-pet` to download the pet app, install it under my home directory and register its hooks, so that one command turns the feature on.
3. As a user, I want a later user-scope `install` without `--with-pet` to keep and update my pet, so that updating codex-delegate never silently turns it off.
4. As a user, I want a project-scope install, or an install for the Codex agent only, to leave my pet untouched, so that installing skills elsewhere never changes my desktop setup.
5. As a user, I want `install --without-pet` to remove the pet app and its hooks while keeping the skills, so that I can turn the feature off without reinstalling everything.
6. As a user, I want `uninstall` at user scope with the Claude Code agent included to also remove the pet app and its hooks, so that nothing is left behind.
7. As a user, I want `--dry-run` to show what the pet install or removal would change, so that I can check before anything happens.
8. As a user, I want `list` to tell me whether the pet is installed and which version, so that I know the current state.
9. As a user, I want `--with-pet` or `--without-pet` together with `--scope project` to be refused with an explanation and nothing changed, so that pet hooks never land in a project settings file my teammates share.
10. As a user on macOS or Linux, I want `--with-pet` to be refused with "not supported on this platform yet" and nothing changed, so that I don't end up with a broken half-install.
11. As a user, I want `--with-pet` together with `--without-pet` to be refused as contradictory, so that the outcome is never ambiguous.
12. As a user, I want `--with-pet` or `--without-pet` with an `--agent` selection that leaves out Claude Code to be refused, so that the pet is always managed together with its leader hooks.
13. As a user, I want the downloaded pet bundle verified against a checksum shipped inside codex-delegate before anything is installed, so that a corrupted or tampered download is never run.
14. As a user, I want a failed download, checksum mismatch or unparseable settings file to stop the install before anything is changed, so that a network problem or odd file can't break my setup.
15. As a user, I want the installer to stop a running pet app, and keep hooks from relaunching it, while it replaces or removes the app, so that a locked file on Windows doesn't make the update fail halfway.
16. As a user, I want a failure in the middle of applying changes reported precisely (what was applied, what wasn't, where the settings backup is), so that I can recover by hand or by re-running.
17. As a user, I want the pet hooks merged into my Claude Code settings without touching any other setting or hook, so that my own configuration survives.
18. As a user, I want a backup of my Claude Code settings written before the installer changes them, so that I can recover if something goes wrong.
19. As a user, I want reinstalling the pet to update its hook entries in place rather than add duplicates, so that each event runs our hook once.
20. As a user who changed `CLAUDE_CONFIG_DIR` since installing the pet, I want removal to clean the settings file it actually modified, so that no settings file is left pointing at deleted scripts.
21. As a user who wrote my own hook that mentions the pet script, I want the installer to leave it alone, so that only entries the installer created are ever changed.
22. As a user, I want the installer to remind me to restart Claude Code after the pet hooks change, so that the hooks actually take effect.

### Doctor

23. As a user, I want `doctor` to check the pet only when it is installed, so that users without the pet see no extra noise.
24. As a user with the pet, I want `doctor` to report whether the installed pet bundle matches the version this codex-delegate expects, so that I know when to reinstall.
25. As a user with the pet, I want `doctor` to report whether every pet hook is registered in the settings file the pet was installed into, so that I can spot a hook I removed by hand.
26. As a user with the pet on Windows 10, I want `doctor` to report whether the WebView2 runtime is present, so that I know why the pet window might not appear.
27. As a user with the pet, I want `doctor` to warn when my pet configuration is invalid or names a pet package that can't be found or doesn't match the Codex pet format, so that I know why the default pet is showing instead.
28. As a user with the pet, I want `doctor` to warn when the pet port is held by something that isn't my pet app, so that I can resolve the conflict.

### Pets and teams

29. As a user, I want a leader pet to appear when a Claude Code session starts, so that each session I have open is visible on the desktop.
30. As a user, I want a separate leader pet for each Claude Code session, so that I can tell my sessions apart.
31. As a user, I want a session to keep its leader pet across `/clear` and similar restarts inside the same Claude Code window, so that one window is always one team.
32. As a user, I want a new pet to appear for every worker the leader starts, so that I can see how many workers are running.
33. As a user, I want concurrent workers of the same role to appear as separate pets, so that parallel work is visible.
34. As a user, I want each worker pet placed next to the leader that started it, so that I can see which session it belongs to.
35. As a user, I want a worker started outside any known Claude Code session to still get a pet, in a team of its own with no leader, so that every running worker is visible.
36. As a user, I want each pet to carry a name tag with its role and a short label of its task, so that I can tell same-looking pets apart.
37. As a user, I want the leader pet to show `running` while the leader is working on my prompt, so that I know it is busy.
38. As a user, I want the leader pet to show `waiting` only when Claude Code needs my approval or an answer, not for routine idle reminders, so that `waiting` always means "go look".
39. As a user, I want the leader pet to go back to `running` once I approve or answer, so that it doesn't keep asking for attention it no longer needs.
40. As a user, I want the leader pet to show `review` when the leader finishes its turn, and fall back to `idle` after a minute or on my next prompt, so that I notice finished work without the pet nagging forever.
41. As a user, I want the leader pet to leave when its Claude Code session ends or its Claude Code process dies, so that closed or crashed sessions don't linger.
42. As a user, I want quiet but still-open sessions to reappear with their pets when the pet app restarts, so that an update or idle shutdown doesn't lose my teams.
43. As a user, I want a worker pet to show `running` while its worker runs, so that I can see work in progress.
44. As a user, I want a worker pet to disappear if its worker stops reporting for 30 seconds, so that a killed worker never leaves a pet stuck on screen.
45. As a user, I want a short worker that finished before the pet app was ready to still show up correctly, so that fast workers aren't invisible.
46. As a user, I want Claude subagents not to get pets, so that only the leader and Codex workers appear.

### Scenes

47. As a user, I want a delegation scene when a worker starts (the leader waves, the new worker pet runs from beside the leader to its spot, then starts working), so that hand-offs are visible.
48. As a user, I want a report scene when a worker succeeds (the worker runs back to its leader and jumps, the leader acknowledges with `review`, then the worker runs off), so that completed delegations feel rewarding.
49. As a user, I want a failure scene when a worker fails (the worker shows `failed`, the leader briefly shows `failed`, then the worker leaves), so that failures stand out.
50. As a user, I want a scene's poses to be brief and then return the leader to what it is actually doing (`running`, `waiting`), so that a report never hides that the leader is busy or needs me.
51. As a user, I want a waiting scene (the leader shows `waiting` while its workers keep `running`), so that I can see the leader needs me even while workers continue.
52. As a user, I want idle leader pets to wander slowly along the strip, so that the desktop feels alive when nothing is happening.
53. As a user, I want pets to face the direction they move (`running-left`/`running-right`), so that movement looks natural.
54. As a user, I want interactions to happen only between a leader and its own workers, so that teams from different sessions don't get mixed up.

### Window behaviour

55. As a user, I want the pets to stay above my other windows, including windows that set themselves always-on-top later, so that the pets stay visible.
56. As a user, I want clicks on and around pets to go to the window underneath, so that the pets never get in my way.
57. As a user, I want the pets to pause and drop behind a fullscreen app on the primary monitor, so that they don't cover games, videos or presentations or waste CPU.
58. As a user, I want the pets to come back on top and resume when I leave fullscreen, with events that arrived meanwhile reflected, so that I don't have to do anything.
59. As a user with an auto-hiding taskbar, I want a maximized window not to count as fullscreen, so that the pets don't vanish whenever I maximize something.
60. As a user, I want the pets hidden from screen capture for as long as computer use is running, from before the worker starts until it has really stopped, so that the worker's screenshots and clicks are never confused by them.
61. As a user, I want the pets visible in my own screenshots the rest of the time, so that I can capture and share them.
62. As a user, I want the number of pets on screen limited to what fits (and never more than 16), with a team's extra workers collapsed into a "+N" badge and extra sessions into a "+N sessions" badge, so that a busy workflow stays readable.
63. As a user, I want to change the pet size within sensible bounds, so that the pets fit my screen.
64. As a user, I want the pet app to start by itself when the first event arrives, so that I never launch it by hand.
65. As a user, I want the pet app to exit by itself after 10 minutes without any event, so that it doesn't hold about 180 MB of memory while I'm away.
66. As a user, I want the pet app never to take keyboard focus or appear in the taskbar, so that it doesn't disturb my work.
67. As a user, I want only my own codex-delegate processes to be able to drive or stop my pet app, so that other programs or users on the machine can't.

### Artwork

68. As a user, I want the bundled default pets (leader, researcher, critic, implementer, computer-user) used when I configure nothing, so that the feature works out of the box.
69. As a user, I want to assign a different pet to the leader or to any role in a configuration file, so that I can choose my own characters.
70. As a user, I want to use pets I already have for Codex, found in my Codex pets folder, so that I don't have to copy them.
71. As a user, I want my own pets folder under codex-delegate checked before the Codex pets folder, so that I can override a Codex pet of the same name.
72. As a pet author, I want the Codex pet package format accepted as-is (a `pet.json` manifest and a 1536 × 1872 sprite sheet of 8 × 9 cells), so that one package works in both Codex and codex-delegate.
73. As a user, I want an invalid pet package to fall back to the bundled default for that slot, so that a broken package never blanks a pet.

### Isolation from the rest of codex-delegate

74. As a user without the pet, I want the worker runner to behave exactly as before, so that the feature costs me nothing.
75. As a user with the pet, I want a slow, missing, crashed or foreign pet listener never to change a worker's result, output or exit code, or noticeably delay it, so that delegation is never broken by the pet.
76. As a user with the pet, I want the Claude Code hooks to return quickly and print nothing, so that my prompts are never delayed and nothing is injected into the conversation.

## Implementation Decisions

### Modules

- **Installer (`bin/cli.mjs`)** gains the pet options and a pet installation step. Skill copying, markers and conflict handling are unchanged.
- **Pet client**: a small Node module installed with the pet. It owns the event protocol: build an event, deliver it to the pet app, launch the pet app when needed. Both event producers use it, so the protocol has one implementation.
- **Leader hook**: a Node script installed with the pet and registered as a Claude Code command hook. It reads the hook input from stdin, maps it to a leader event and hands it to the pet client.
- **Runner (`codex-run.mjs`)**: when the pet client is installed, it loads it and reports the worker's start, heartbeats and end. When it is not installed, nothing changes.
- **Pet app** (Tauri v2, Windows), split in two:
  - **Pet stage model**: one pure JavaScript module in the app's frontend. Given events, liveness facts and the current time, it produces the stage: teams, pets, each pet's pet state, target position and facing, overflow badges, and whether capture exclusion is needed. All team, lifecycle and scene logic lives here.
  - **Pet shell**: the Rust side and the renderer. It owns the window (strip, click-through, topmost, fullscreen handling, capture exclusion), authenticates and receives events over HTTP, supplies liveness facts (process alive, computer-use lock present), feeds both to the stage model, and draws sprite-sheet frames on a canvas.
- **Release workflow**: GitHub Actions on a Windows runner builds the pet bundle and attaches it to a GitHub Release. This repo has no CI today; this is the first workflow.

### Team identity (verify first)

A team must survive `/clear` and similar in-window restarts, and workers must find their leader's team. The draft assumption that the hook input's `session_id` equals `CLAUDE_CODE_SESSION_ID` seen by commands is doubtful: on this machine, after a `/clear`, commands still saw the pre-clear session id while background task output used a different id.

- **Team key**: the Claude Code process id, if both hook commands and commands the leader runs can see it. Commands see `CLAUDE_PID` on this machine; the first ticket confirms that hook commands see the same value (or can find it, for example as their parent process), across `/clear`, on Windows. The session id is kept as an attribute for display and debugging only.
- If no reliable shared key exists, the first ticket reports back before any other pet ticket starts; the team design is revisited with the user.
- A worker event whose team key is missing or unknown to the stage goes into a **leaderless team** of its own. Worker events never create a leader pet.

### Installer behaviour

- New options: `--with-pet` and `--without-pet` for `install`. They are contradictory together.
- **Pet operations happen only when the effective scope is user and the Claude Code agent is in the selection.** Otherwise an enabled pet is left untouched, and an explicit `--with-pet` or `--without-pet` is refused with a reason. `--with-pet` is additionally refused off Windows (a test-only override sets the platform).

| Command | user scope, Claude Code included | project scope, or Claude Code excluded |
|---|---|---|
| `install` (pet disabled) | no pet change | no pet change |
| `install` (pet enabled) | update pet | pet untouched |
| `install --with-pet` | install or update pet | refused, nothing changed |
| `install --without-pet` | remove pet | refused, nothing changed |
| `uninstall` | remove pet | pet untouched |

- **Bundle and state are separate directories under `~/.codex-delegate/`.** The **pet bundle directory** holds only what the bundle ships (app, client, hook, default pets) and is replaced whole on update. The **pet state directory** holds everything that must survive an update: the marker, the token, session records, the delivery spool and the "updating" flag. Updates never touch the state directory except to update the marker; removal deletes both.
- **Pet enabled** means the pet state directory carries this tool's marker. The marker records the installed bundle version, the settings file path and the exact hook commands the installer registered there.
- **Failure boundary**: everything that can fail without side effects runs first: validating options, downloading and verifying the bundle, unpacking it to a staging directory on the same volume as its destination, reading and parsing the settings file. Any failure there aborts with nothing changed. Then changes are applied: skills (as today), the pet directory swapped in by rename, the settings file replaced by write-to-temp-and-rename after checking it hasn't changed since it was read. A failure while applying is reported with exactly what was and wasn't applied and where the settings backup is; re-running the same command completes it. There is no automatic rollback of skill copies.
- **Pinned bundle**: the package ships a pet pin (release tag, asset name, SHA-256). The installer downloads exactly that asset and refuses it on mismatch. The pet bundle is released on its own tag only when the pet app changes, and the pin is bumped in a normal commit, so the package version and pet bundle version are independent. The download base URL can be overridden by an environment variable (used by tests). The pin is in the package's published file list.
- The bundle is a zip containing the pet app executable, the pet client, the leader hook and the bundled default pets.
- **Replacing or removing the app**: the installer first writes an "updating" flag in the pet state directory, which makes the pet client neither launch the app nor deliver events. It then asks a running app to quit, waits for it to exit (force-stopping it after a short timeout), applies the change, and clears the flag. A flag left behind by an interrupted install is ignored once it is older than a few minutes, and the next install clears it. Concurrent installs are serialized with a lock file under `~/.codex-delegate/`.
- `--dry-run` prints the pet actions (download, install, update, remove, hook changes) without performing them. `list` prints the pet state and bundle version.

### Claude Code settings merge

- Target: the user settings file in the Claude Code config directory (`CLAUDE_CONFIG_DIR` when set, else `~/.claude`). Created if missing.
- Hook events (confirm names and payloads against the current Claude Code hooks documentation in the first ticket): `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Notification`, `Stop`, and `PostToolUse` as the signal that the user approved or answered and the leader is working again. `PostToolUse` runs after every tool call, so if Claude Code supports command hooks that run without blocking the session, it is registered that way; otherwise it runs normally and costs one Node start (about 0.05–0.1 s on Windows) per tool call, which the user accepted. If Claude Code offers a hook for a turn ending in an API error, it is registered too and maps to leader `failed`.
- Each registration is a command hook running the leader hook script with Node, with a short timeout. Ownership is by exact match on the command strings recorded in the pet marker, never by a substring. Install replaces our recorded entries in place; removal deletes exactly those leaf entries from the recorded settings file (and drops matcher groups or event keys only if they become empty), leaving every other key and hook untouched.
- A backup copy of the settings file is written next to it before each modification.
- If the file exists but is not valid JSON, abort with nothing changed and say so.
- If `CLAUDE_CONFIG_DIR` now points elsewhere than the recorded settings path, removal still cleans the recorded file; `doctor` warns that the hooks live in a different config directory than the current one.

### Event protocol

One JSON shape for both producers, sent as an HTTP POST to the pet app on `127.0.0.1` at a fixed default port (overridable by an environment variable, used by tests).

| Field | Leader events | Worker events |
|---|---|---|
| `v` | protocol version, `1` | `1` |
| `source` | `leader` | `worker` |
| `team` | team key (see Team identity) | team key from the runner's environment, or none |
| `session` | Claude Code session id, informational | `CLAUDE_CODE_SESSION_ID`, informational |
| `worker` | — | a fresh id per runner invocation |
| `role`, `label` | — | the runner's role; the task directory's name |
| `at` | wall-clock timestamp in milliseconds | same |
| `seq` | — | per-worker sequence number (one runner process owns it) |
| `type` | `session-start`, `prompt`, `waiting`, `resumed`, `stop`, `failed`, `session-end` | `start`, `heartbeat`, `end` |
| `outcome` | — | on `end`: `success` (exit code 0) or `failed` |

- Every worker event carries `team`, `role` and `label`, so a `heartbeat` or `end` whose `start` was lost still produces a correct pet.
- Hook mapping: `SessionStart` → `session-start`; `UserPromptSubmit` → `prompt`; `Notification` → `waiting` only for notification types meaning a permission prompt or a question for the user, ignored otherwise (idle reminders, auth messages); `PostToolUse` → `resumed`; `Stop` → `stop`; `SessionEnd` → `session-end`.
- **Authentication and identity**: the installer generates a random per-user token stored in the pet state directory, kept across updates. Every request carries it; the app rejects requests without it. The health endpoint returns an app identifier, the bundle version and the protocol version; the client delivers only to a listener that identifies as a compatible pet app, and treats anything else on the port as unavailable (no launch loop). Request bodies are size-limited and schema-checked.
- **Delivery never blocks a producer**: a producer tries one direct POST with a short timeout (a few hundred milliseconds). If that fails because nothing is listening, it writes the event to the delivery spool in the pet state directory, starts a detached, hidden delivery helper and returns. Only one helper runs at a time (an exclusive lock in the spool): it launches the pet app (unless the "updating" flag is set), waits for it to become healthy for a bounded time, delivers every spooled event in timestamp order, and exits; events spooled while it runs are picked up before it exits. Because only the helper holding the lock launches the app, concurrent producers launch at most one app. As a backstop, a second app instance that can't bind the port exits. Spooled events older than a few minutes are discarded.
- The runner sends nothing about the pet to stdout or stderr, never changes its exit code or output, and caps the time spent on `end` so exit is not noticeably delayed. Its heartbeat timer never keeps the process alive.
- **Computer use start boundary**: for the `computer-user` role, after taking the computer-use lock and before spawning Codex, the runner asks a running pet app to exclude itself from capture and waits for its acknowledgement, at most one second. If no pet app is running there is nothing on screen to exclude, so it doesn't wait. This is the only place a producer waits for the pet app, and it is bounded.
- The leader hook always exits 0 and writes nothing to stdout or stderr.

### Pet stage model

- Inputs: events, liveness facts from the shell (which team keys' processes are alive), and ticks, each with a timestamp. Output: the stage, a plain data structure. Deterministic for a given input sequence, so tests inject time.
- **Two clocks**: lifecycle rules (heartbeat expiry, `review` fallback, scene completion) use wall time and keep running while paused; animation frames use a separate clock that the shell stops while fullscreen. Events arriving while paused update the stage; the screen catches up on resume.
- **Ordering**: worker events are applied in `seq` order and duplicates dropped. Leader events come from separate hook processes, so they are ordered by `at` instead: a leader event older than the newest leader event already applied for that team is dropped, and a `session-start` begins a new generation of the team that drops anything older than it. An ended worker leaves a tombstone, so a late `heartbeat` doesn't resurrect it. A `session-end` or dead process tombstones the team; later events for it are ignored until a new `session-start`.
- **Teams**: keyed by team key. A team's leader pet appears on `session-start` or any other leader event, and leaves on `session-end` or when the shell reports its process dead. Teams are laid out left to right in order of appearance; worker pets sit beside their leader.
- **Leader activity state** (authoritative): `prompt` → `running`; `waiting` → `waiting`; `resumed` → `running` when the leader is `waiting`, ignored otherwise; `stop` → `review`, then `idle` after 60 seconds or on the next `prompt`; `failed` → `failed` until the next `prompt`. Idle leaders wander along the strip using `running-left`/`running-right`.
- **Scene poses** (temporary): a scene may show a pose on the leader for its duration (`waving`, `review`, `failed`), then the leader returns to its activity state. A pose never replaces `waiting`: while waiting, the leader keeps `waiting` and the worker's part of the scene still plays.
- **Worker pets**: one per `worker` id. A worker with no event for 30 seconds of wall time leaves without a scene.
- **Scenes** (durations from the Codex per-frame timings, one cycle unless stated):
  - Delegation (`start`): leader pose `waving`; the worker appears beside its leader and moves to its slot (`running-left`/`running-right`), then `running`.
  - Report (`end` success): the worker moves back to its leader and plays `jumping`; leader pose `review`; the worker leaves off the edge of the strip.
  - Failure report (`end` failed): the worker plays `failed` for two cycles; leader pose `failed` for one; the worker leaves.
  - Leaderless teams play the worker's part only.
- **Layout and overflow**: the shell tells the stage how many pets fit the strip's width at the current scale; the limit is that number, capped at 16. Leader pets come first; if leaders alone exceed the limit, the newest leaders (and their teams) collapse into one "+N sessions" badge. Remaining room goes to workers; a team's newest workers beyond it collapse into a "+N" badge on that team. Badge and name-tag space is part of the layout.
- **Capture exclusion** is not a stage decision; see the shell.

### Pet shell

- A transparent, undecorated, shadowless, non-focusable window with no taskbar entry, spanning the full width of the primary monitor's work area and sitting on its bottom edge, about one pet tall at the current scale. Always click-through. Follows work-area and DPI changes.
- Topmost, re-asserted directly through Win32 whenever the foreground window changes (the prototype found Tauri's always-on-top setter does nothing when the flag is already set).
- **Fullscreen**: the foreground window on the primary monitor covers that monitor entirely, has no caption, and is not the desktop or taskbar. On fullscreen: stop the animation clock, drop topmost and insert the window directly behind the fullscreen window (dropping topmost alone leaves it above, as the prototype showed). On leaving fullscreen: restore topmost and resume. Detection may poll (the prototype used 300 ms) or use a foreground-change event hook.
- **Capture exclusion** (`WDA_EXCLUDEFROMCAPTURE`) is on from the runner's exclusion request (see the event protocol) and whenever the runner's computer-use lock is **live** or any `computer-user` worker is live (started, not ended, not expired), checked at least once a second. A lock is live while its recorded holder has a runner or child process that is still alive; a stale lock left behind by dead processes doesn't count, so exclusion ends when computer use really ends even if the lock directory lingers until the next exclusive run reclaims it.
- **Liveness**: the shell periodically checks whether each team key's process is alive and reports it to the stage.
- **Restore after restart**: the leader hook records each session (team key, session id, start time) in a small per-session file under the pet state directory on `session-start` and removes it on `session-end`. On start, the shell recreates leader pets for recorded sessions whose process is alive and deletes the rest.
- HTTP endpoints, bound to `127.0.0.1`, token-checked: post an event, health, quit, and the capture-exclusion request (answers once exclusion is applied).
- Exits after 10 minutes without events.
- Renders sprite-sheet cells on a canvas with the Codex per-frame timings, scaled by the configured size (default 0.6 of a 192 × 208 cell, allowed 0.3 to 1.0).

### Pet configuration and artwork

- Configuration file `~/.codex-delegate/pet.json`, optional: `scale` and `pets`, a map from `leader` and each role name to a pet name. Unknown keys and out-of-range values are reported by `doctor` and ignored; missing keys use the bundled default.
- A pet name is resolved in `~/.codex-delegate/pets/<name>/`, then `$CODEX_HOME/pets/<name>/` (default `~/.codex/pets/<name>/`), then the bundled defaults.
- Accepted package: Codex pet contract v1. `pet.json` with `id`, `displayName`, `description`, `spritesheetPath`; a transparent PNG or WebP sheet of 1536 × 1872 px, 8 columns × 9 rows of 192 × 208 cells; rows in order `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`; frame counts per row 6, 8, 8, 4, 5, 8, 6, 6, 6. A package that doesn't match falls back to the bundled default for that slot.
- Bundled defaults: five pets (leader, researcher, critic, implementer, computer-user) drawn by the maintainer, in the format above. Until they are ready, development and tests use placeholder sheets. Codex's built-in pets are neither bundled nor downloaded (no redistribution licence found).

### Prototype reference

Decision-rich parts of the prototype's fullscreen handling, kept for the shell ticket (Rust, `windows` crate):

```rust
// Fullscreen: drop out of topmost AND insert directly behind the fullscreen window.
SetWindowPos(own, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
SetWindowPos(own, fullscreen_hwnd, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
// Not fullscreen and the foreground changed: re-assert topmost directly.
SetWindowPos(own, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
```

## Testing Decisions

- Good tests drive the feature through its public seams and assert observable behaviour: files on disk, settings content, process exit codes and output, events received, stage output. They don't reach into internals.
- Every test isolates the home directory, `CLAUDE_CONFIG_DIR` and `CODEX_HOME`; the real `~/.codex-delegate/`, `~/.claude/` and `~/.codex/` are never read or written. Tests use Node's built-in `node:test`, run by `npm test`.

### Seam 1: the installer CLI process

Run `bin/cli.mjs` as a child process, as `doctor.test.mjs` does, with the pet download base URL pointed at an HTTP server started inside the test that serves a fake pet bundle (and a pin matching it).

- `install` without `--with-pet` downloads nothing and leaves settings untouched.
- `install --with-pet` installs the bundle, records the marker (settings path and owned commands), merges exactly our hook entries and writes a backup; unrelated settings and hooks, including a user hook whose command mentions the pet script path, survive unchanged.
- A second `install --with-pet` doesn't duplicate entries; a user-scope `install` without options keeps and updates an enabled pet.
- The scope/agent matrix above, row by row, including implicit updates and `--without-pet`.
- `install --without-pet` and `uninstall` remove the pet directory and only the owned entries, from the recorded settings file even after `CLAUDE_CONFIG_DIR` has changed.
- Checksum mismatch, download failure and unparseable settings each abort with nothing changed (skills, pet and settings as before). A settings file changed between read and write is not overwritten.
- `--with-pet --without-pet`, `--with-pet` off Windows (via the test override) are refused with nothing changed.
- With an app stub listening, replacing or removing the pet sets the "updating" flag, asks the stub to quit, and clears the flag afterwards.
- `--dry-run` reports pet actions and changes nothing; `list` reports the pet state.
- `doctor` with the pet installed reports bundle version, hooks, configuration, pet package and port problems; without the pet it reports nothing pet-related.
- Prior art: `test/doctor.test.mjs` and `test/helpers/fake-codex.mjs`.

### Seam 2: event producers against a fake pet listener

Start an HTTP listener inside the test, behaving like the pet app (health identity, token check), and point the pet port variable at it.

- Runner (with the fake `codex` from `codex-run.test.mjs`): with the pet client installed in the isolated home, a successful run sends `start`, `heartbeat`s for a slow run, and `end` with `success`; a failing run sends `end` with `failed`; every event carries team, role, label and increasing `seq`. Without the pet client, no request is made. With no listener, a listener that never answers, or a foreign listener on the port, the runner's exit code, result file and stdout are identical to a run without the pet, and it isn't noticeably slower.
- Leader hook: feeding each hook input (as Claude Code sends it on stdin) produces the mapped event, including ignored notification types; it exits 0 with empty stdout and stderr, including when nothing is listening.
- Delivery helper: when nothing listens, the producer returns at once; the helper launches a stub app executable that records its start, waits for the listener to become healthy after a delay, and delivers the queued event. With the "updating" flag set, nothing is launched or delivered. Concurrent producers launch at most one app.
- Prior art: `test/codex-run.test.mjs`.

### Seam 3: the pet stage model

Import the stage model and drive it with event, liveness and tick sequences carrying explicit timestamps.

- Each scene produces the specified sequence of pet states, positions and facings; leaderless teams play the worker part only.
- Leader activity: `waiting` → `resumed` → `running`; `review` falls back to `idle` after 60 seconds or on `prompt`; a report while the leader is `waiting` keeps `waiting`; a report while `running` returns to `running` after the pose.
- `session-end` or a dead-process liveness fact removes the team; later events for it are ignored until a new `session-start`.
- A worker without events for 30 seconds is removed; out-of-order, duplicate and late events (heartbeat after end) are handled as specified; a heartbeat with no prior start creates a correct pet.
- Two teams never interact; concurrent same-role workers are separate pets with their own labels.
- Overflow with a given fit limit: newest workers per team behind a correct "+N"; more leaders than fit collapse into "+N sessions".
- Lifecycle timing advances while the animation clock is paused.

### Seam 4: the shipped package

A smoke test packs the package (`npm pack`), checks the pet pin is included, installs it into an isolated home, and runs the runner from an installed generated skill against the fake listener, so a stale generated runner or a missing file fails the test.

### Not automated

The pet shell gets a manual verification checklist in its ticket, run against the real app on Windows 10 (and Windows 11 if available): transparency, click-through, topmost against other topmost windows, fullscreen pause and z-order, events received while fullscreen, auto-hide taskbar with a maximized window, a DPI scale other than 100 %, work-area change, capture exclusion from lock creation until worker exit, restore of open sessions after a restart, auto-exit, and token rejection. The release workflow is verified by running it once and installing from the resulting release.

## Out of Scope

- macOS and Linux.
- Project-scope pet installs.
- Pets for Claude subagents.
- Pointer interaction with pets (drag, hover, click); `jumping` is used only by the report scene.
- Codex pet sheet v2 and the Codex CLI's manifest extensions (`frame`, `animations`).
- Bundling or downloading Codex's built-in pets.
- Monitors other than the primary one.
- Code signing of the pet app.
- Sound, notifications, a settings UI, or user-defined scenes.
- Automatic rollback of skill copies when applying an install fails partway.

## Further Notes

- An adversarial plan review (Codex critic) reshaped team identity, capture exclusion, leader lifecycle, event delivery, the install failure boundary and settings ownership; the user approved the resulting changes, including `PostToolUse` as the resume signal.
- Grilling refined one earlier decision, which the user approved: instead of the pet binary sharing the package's version, the package pins a separately released pet bundle by tag and checksum. This keeps the checksum inside the package (it can't be known before the binary is built) and avoids rebuilding the pet app for releases that don't touch it.
- The bundled default pet artwork is being drawn by the maintainer; tickets should not block on it.
- Unsigned executables downloaded by Node carry no Mark-of-the-Web, so SmartScreen is not expected to prompt; antivirus false positives remain possible. Neither has been tested.
- Glossary terms used: **Leader**, **Worker**, **Role**, **Computer use**, **Task directory**, **Pet**, **Pet state**, **Team**.
