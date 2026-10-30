# Leader and worker pets (developer tracer)

Windows only. The first event starts the app automatically. The runner
reports only when `<home>/.codex-delegate/pet/client/pet-client.mjs` exists.
No hooks, settings, real home directories, or normal installation paths are
changed by the build. Use an isolated home for testing.

From PowerShell at the repository root (Rust MSVC toolchain and WebView2 needed):

```powershell
node pet/generate-placeholders.mjs
cargo build --release --offline --manifest-path pet/app/src-tauri/Cargo.toml
npm.cmd run build
node scripts/pet-dev-install.mjs C:\temp\pet-test-home
```

`npm.cmd run build` does the full upstream rebuild and needs network access.
Assets are embedded into the executable; the developer
installer also copies their Codex v1 packages into `pet/default-pets` for inspection.
Rebuild the app after changing assets or frontend code. `Cargo.lock` is retained;
`target/` is ignored.

The replaceable bundle lives in `<home>/.codex-delegate/pet/`. Mutable state
lives beside it in `pet-state/`: a random per-user `token`, the delivery `spool/`,
leader records in `sessions/<team-key>.json`, and the installer's `updating` flag.
Records contain `team`, `session` and the session-start timestamp `at` in Unix
milliseconds. They survive idle exits and bundle updates. The shell restores
live recorded leaders before accepting events and deletes dead records. Every
five seconds it checks recorded teams and teams seen in leader events using
their Windows process ids; a dead process removes and tombstones the whole team.
Process creation times also guard against restoring a reused PID.
The developer installer preserves an existing
token. Every HTTP request requires it. The helper serializes startup and replay;
events and update flags expire after five minutes. The app exits after ten
minutes without accepted events (health checks do not keep it alive).

In a **new** PowerShell terminal, set the isolated home before starting the
runner. The task's working directory can be any real repository. `CODEX_HOME`
keeps pointing at your real Codex home so the worker stays logged in.

```powershell
$petTestHome = 'C:\temp\pet-test-home'
$env:CODEX_HOME = "$env:USERPROFILE\.codex"
$env:HOME = $petTestHome
$env:USERPROFILE = $petTestHome
$env:CLAUDE_CONFIG_DIR = "$petTestHome\.claude"
$env:CODEX_DELEGATE_PET_PORT = '47800' # optional; app and runner must agree
# A real leader supplies these. Omit both to exercise an unkeyed worker.
$env:CLAUDE_PID = '12345'
$env:CLAUDE_CODE_SESSION_ID = 'manual-test'
New-Item -ItemType Directory -Force "$petTestHome\task-one" | Out-Null
Set-Content "$petTestHome\task-one\prompt.md" 'Inspect the repository and summarize its purpose. Do not edit files.'
node skills/claude/codex-research/scripts/codex-run.mjs researcher --prompt-file "$petTestHome\task-one\prompt.md" --cwd (Get-Location).Path
# Allow a cold start to finish before inspecting health.
$petHeaders = @{ 'X-Codex-Delegate-Pet-Token' = (Get-Content "$petTestHome\.codex-delegate\pet-state\token" -Raw).Trim() }
Invoke-RestMethod "http://127.0.0.1:$env:CODEX_DELEGATE_PET_PORT/health" -Headers $petHeaders
# Stop it explicitly when finished (otherwise it exits after ten idle minutes).
Invoke-RestMethod "http://127.0.0.1:$env:CODEX_DELEGATE_PET_PORT/quit" -Method Post -Headers $petHeaders
```

Manual checks for this ticket:

1. Health returns `app: codex-delegate-pet`, `protocol: 1`, and the bundle version
   set at build time by `CODEX_DELEGATE_PET_VERSION` (Cargo version if unset locally).
2. A real worker shows a running pet with `researcher · task-one` above the
   primary monitor's taskbar. Transparent pixels reveal the desktop; clicking
   the pet reaches the window below. It never takes keyboard focus or adds a
   taskbar entry. Moving focus to another topmost window keeps the strip above it.
3. Start two workers of the same role with different task directories. Both
   pets appear with their own labels; finishing one removes just that pet.
4. Kill a runner and its worker process tree. Its pet disappears within about
   30 seconds of the last report. Ordinary success and failure play a report
   scene, then remove the pet after it exits off the strip's left edge.
5. Check a non-100% DPI, change the primary work area, and confirm the strip follows.
6. Stop the app via `/quit` and run again. Output, results and exit status
   match a run with the installed client removed; nothing pet-related is printed.

Five original placeholder PNGs follow Codex v1: 1536×1872, cells 192×208,
8 columns, 9 rows, frame counts 6/8/8/4/5/8/6/6/6. Playback defaults to scale 0.6.
Frame durations follow [OpenAI's animation guide](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)
at twice its durations, collected in `CODEX_V1_FRAME_TIMINGS_MS` in
`app/ui/animations.mjs`. Ambient states rest on their first frame after playback:
`idle` for 2400 ms, `waiting` for 1500 ms, and `review` for 1000 ms. These rests
are not doubled. All states keep looping while active; scene cycles include rests.
Walking, including exits off the strip, moves at a shared stride of half a slot per
running cycle, so pets in teams further right take longer to leave.

Tests: `npm.cmd test`. The runner tests use fake Codex, a fake HTTP listener,
isolated homes and a runner copied from the generated `codex-implement` skill.
The delivery tests launch a delayed stub app and replay cold-start events into
the real stage. The stage tests inject wall time. Expiry removes a missing worker but permits
a newer heartbeat to recover it; an explicit `end` tombstones its id until
inactive metadata expires after ten minutes.

Optional configuration: `<home>/.codex-delegate/pet.json`:

```json
{
  "scale": 0.6,
  "pets": { "leader": "my-pet", "researcher": "critic" }
}
```

`scale` accepts numbers from 0.3 through 1.0. `pets` accepts any role name
matching `[a-z][a-z0-9-]*`, including user roles; values are pet folder names.

The checked **Show name tags** tray item (**이름표 표시** in Korean), directly
below **Show pets**, turns all name tags on or off immediately, including for
pets added later. It works while pets are hidden and defaults to on. The choice
is remembered in `pet-state/pet-preferences.json` alongside pets hidden and
language, surviving restarts and bundle updates. With name tags off, the tags
leave the layout: pets drop instantly by the tag's height so their canvases sit
on the strip's 4 px bottom padding, level with the overflow badges just above
the taskbar. Slot width, gaps, row fit, scene and exit offsets, and strip window
size stay unchanged. Turning tags back on restores the previous vertical position.

The checked **Clear around cursor** tray item (**커서 주변 숨기기** in Korean),
directly below **Show name tags**, turns cursor clearance on or off immediately.
It defaults to on and remembers the choice as `cursorClearance` in
`pet-state/pet-preferences.json` alongside pets hidden, name tags and language,
surviving restarts and bundle updates. It works while pets are hidden and takes
effect when they are shown. Turning it off removes the mask immediately and
stops cursor polling; turning it on resumes polling. The whole strip gives way
within a circle 500 logical pixels in diameter around the pointer: transparent
up to radius 190 px, fading linearly to opaque at 250 px. It follows directly.
Cursor polling runs about 60 Hz within 250 logical px of the strip and 10 Hz
farther away, and stops while pets are hidden or the strip is paused for
fullscreen. The strip stays click-through at every display scale.

Unknown keys and invalid values are ignored. Missing or invalid JSON uses
defaults. The shared `app/ui/pet-config.mjs` resolver returns diagnostic issues
alongside the selected pets. The renderer reads configuration and packages once
at startup; restart the app to load configuration or package changes.
`doctor` resolves them on each run.

Lookup is `<home>/.codex-delegate/pets/<name>/`, then
`$CODEX_HOME/pets/<name>/` (default `<home>/.codex/pets/<name>/`), then the bundled
name or the slot's default. A folder without `pet.json` is absent. The first
present package must have the Codex v1 manifest and a transparency-capable
1536×1872 PNG or WebP; rejection falls back to that slot's bundled default.
The five built-in roles have matching defaults; other roles fall back to
`implementer` art when no pet is configured or their package is rejected.
Header validation does not check animation frame contents.

Manual configuration check: in the isolated home above, copy a valid package
to `.codex-delegate/pets/my-pet/`, set `pets.researcher` to `my-pet` and `scale`
to `1.0`, then restart the rebuilt app and run a researcher. Confirm its artwork,
192×208 CSS-pixel canvas, name tag, and strip fit; repeat with `scale: 0.3`.
Break its manifest and restart to confirm the researcher placeholder appears.

Manual visibility check: use the rebuilt app and isolated home above, keeping
the same workers and pet scale. Tray changes take effect without restarting.

1. **Name tags:** uncheck and recheck **Show name tags** in the tray without
   restarting. Keep the pointer away and compare matching scene positions:
   unchecking must remove the tags and instantly drop each canvas by the tag's
   height onto the strip's 4 px bottom padding, level with the overflow badges.
   Rechecking must restore the previous vertical position without animation.
   Horizontal positions, slot widths, gaps, visible pet count, scene and exit
   offsets, and strip window size must stay unchanged. Add another pet while
   unchecked and confirm it also has no tag and sits at the same bottom edge.
   Hide pets, turn tags off, add a pet, then show pets and confirm all pets sit
   at the lower edge. Hide pets again, turn tags on, then show pets and confirm
   the tags and previous vertical position return for every pet.
   Restart with the item unchecked and confirm both the checkmark and
   tags stay off. Switch language and confirm **Show name tags** / **이름표 표시**
   is relabelled without changing its checkmark.
2. **Cursor clearance:** with **Clear around cursor** checked, check at 100% display
   scale, then another scale such as 150%. Around the pointer, expect a fully
   clear core about 380 logical (CSS) px wide, with a soft edge fading to opaque
   at about 500 px diameter. It should look the same size relative to the pets
   at both scales. A pet half inside the circle loses only that half; pets,
   name tags and overflow badges all give way. Clicking through the strip must
   still reach the window below.
3. **Immediate return:** move the pointer away from the strip. Pets must
   reappear immediately, without fade-in lag.
4. **Clearance toggle:** keep the pointer over a pet and uncheck **Clear around
   cursor**. The cut-out must disappear immediately. Move the pointer across the
   strip: no cut-out should appear. Recheck the item and confirm clearance
   resumes. Hide pets, toggle clearance off, show pets and confirm no cut-out;
   repeat with clearance on and confirm it returns. Restart with the item
   unchecked and confirm the checkmark and clearance stay off. Switch language
   and confirm **Clear around cursor** / **커서 주변 숨기기** is relabelled
   without changing its checkmark. Confirm tray order is **Show pets**, **Show
   name tags**, **Clear around cursor**, **Licences**, **Language**.
5. **No cursor polling while clearance off, pets hidden or fullscreen:** with
   clearance off, watch the pet app's CPU in Task Manager while moving the
   pointer near the strip. Expect near-idle CPU with no mouse-driven increase.
   Check **Clear around cursor** again. In Task Manager, watch the pet app's CPU
   while pets are hidden (uncheck "Show pets" in the tray); compare a stationary
   pointer with continuous mouse movement near the strip. Expect near-idle CPU
   with no mouse-driven increase. Repeat while the strip is paused behind a
   fullscreen app (view Task Manager on a second monitor if available), then
   show pets or leave fullscreen and confirm cursor clearance resumes.

Manual language submenu check: use the rebuilt app and isolated home above.
Keep overflow badges visible and the **Licences** window open while switching.

1. Right-click the tray icon. Confirm the order is **Show pets**, **Show name
   tags**, **Clear around cursor**, **Licences**, then the **Language** submenu.
   In English its label is **Language**; in Korean it is **언어 (Language)**.
   Opening the submenu must leave the current language unchanged.
2. With no `language` key in the isolated home's
   `.codex-delegate/pet-state/pet-preferences.json`, restart on Korean Windows
   and confirm only **한국어** is checked; on English or another non-Korean
   Windows display language, only **English** is checked. Both entries must
   always read **English** and **한국어**, regardless of the display language.
3. Choose the other language. Tray labels, overflow badge text and tooltips,
   and the open licences window's title and headings must update immediately.
   The tray tooltip stays `codex-delegate pet <version>` in both languages.
   Reopen the submenu and confirm exactly the chosen entry is checked.
4. Choose the already-checked entry. Confirm the language and visible content
   stay the same and that the entry remains checked when the submenu reopens.
   Repeat switching both ways, including while pets are hidden, then show pets
   and confirm the current language is used. Left-click must still toggle pets;
   right-click must still open the menu.
5. Restart after choosing each language and confirm the choice and checkmark
   survive, including when the stored choice differs from Windows. Repeat the
   no-stored-choice check by removing only `language` from the isolated
   preferences file while the app is stopped, preserving other preferences.

## Tray icon

The tray icon is pixel art in `app/src-tauri/icons/tray.json`: the pet peeking
over a bar that stands for the taskbar, and ducked behind it with closed eyes
while pets are hidden. Each pose is drawn at 16, 20 and 24 px, the sizes the
notification area uses at 100%, 125% and 150% display scale. After editing the
maps, run `node pet/generate-tray-icon.mjs` to rewrite `icon.ico`, `icon.png`
and the SVG previews in `art/tray-icon/`, then rebuild the app.

Manual tray icon check: use the rebuilt app at 100% display scale, then at 150%,
each on a dark and on a light taskbar. If Windows puts the icon among the hidden
icons (^), drag it onto the taskbar first.

1. The tray icon shows the pet peeking over the bar. Left-click it: the pets
   hide and the icon ducks behind the bar with its eyes closed. Left-click again
   and both come back. **Show pets** in the menu switches the icon the same way.
2. Hide pets and restart the app. The ducked icon appears from the start.
3. Zoom into a screenshot of the tray. The icon's edges must be hard pixel steps
   with no blur, matching `art/tray-icon/shown-16.svg` at 100% and
   `shown-24.svg` at 150%.

## Releasing the pet bundle

Cut a pet release only when the pet app, client, hook, or default pets change.
Package-only changes can keep the existing bundle pin. The bundle contains
`codex-delegate-pet.exe`, all of `client/`, `hook/leader-hook.mjs`, and
`default-pets/` from `app/ui/assets/`. The assets are committed, so the release
build does not regenerate placeholders.

1. Choose `pet-vX.Y.Z`. If desired, bump the app version in
   `app/src-tauri/tauri.conf.json` and `app/src-tauri/Cargo.toml` (and refresh
   `Cargo.lock`). Commit the source changes normally and run `npm.cmd test`.
2. Tag that commit and push the tag, for example:

   ```powershell
   git tag pet-v1.2.3
   git push origin pet-v1.2.3
   ```

3. Wait for the **Pet release** GitHub Actions workflow. It tests the shipped
   package, sets `CODEX_DELEGATE_PET_VERSION` to the tag without `pet-v` for
   `/health`, builds on Windows with the locked Rust dependencies, and creates
   a GitHub Release with `codex-delegate-pet-windows-x64.zip` and its `.sha256`
   file. Verify the release bundle installs before updating the package pin.
4. Copy the pin JSON from the workflow job summary into the repository's
   `pet-pin.json`. Its fields are `tag`, `asset`, `sha256`, and `version`; the
   version is the tag without `pet-v`. You can also download the release's
   `.sha256` file to get the checksum of the published zip. Commit the pin as a
   normal commit, for example `chore(pet): pin bundle pet-v1.2.3`.
5. Run `npm.cmd test` and release the npm package as usual. Its shipped pin
   selects this pet release; pet and npm versions are independent.

To preview the bundle locally after building the release executable:

```powershell
$env:CODEX_DELEGATE_PET_VERSION = '1.2.3'
cargo build --release --locked --manifest-path pet/app/src-tauri/Cargo.toml
node scripts/pet-bundle.mjs --tag pet-v1.2.3 --out dist
```

The script accepts `--exe <path>` for another executable, writes the zip,
`<asset>.sha256`, and `pet-pin.json` into `dist/`, and prints the pin JSON.
Local output is a preview: use the checksum of the zip actually attached to
the release when committing the pin, since a locally built executable can
differ from the workflow's executable.

For a real release, `CODEX_DELEGATE_PET_BASE_URL` is not needed. With the new
pin, `codex-delegate install --with-pet` downloads and verifies the pinned
asset from GitHub Releases. To verify it before the npm release, run
`node bin/cli.mjs install --scope user --agent claude-code --with-pet` with
`HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, and `CODEX_HOME` pointing to isolated
test directories. Restart Claude Code to load the installed hooks.

The offline shipped-package smoke test runs `npm pack`, checks the pin and
generated runner files, installs the extracted package and a test bundle into
an isolated home, then checks that the installed runner sends `start` and
successful `end` events to an authenticated fake pet listener. It uses a fake
executable and Codex CLI; the real Windows app and a test-tag workflow run
still need human verification.

## Window behaviour

Fullscreen detection polls every 300 ms against the primary monitor's full
physical bounds. It excludes captioned windows, the desktop and taskbar. The
strip drops out of topmost and goes directly behind the fullscreen window;
on exit it becomes topmost again. Sprite time pauses, while stage events and
wall-time lifecycle deadlines continue. Work-area placement keeps running.

For `computer-user`, the runner takes the computer-use lock, asks an already
running app to exclude capture, and waits for acknowledgement for at most one
second before starting Codex. No listener means no exclusion wait. This request
never launches the app; ordinary worker events can still cold start it.
The authenticated `POST /exclude` endpoint returns 200 only after Windows reports
`WDA_EXCLUDEFROMCAPTURE` on the strip (503 if it cannot apply it). Every 500 ms,
the shell checks for a live recorded runner or token-matched child process, or
a live `computer-user` worker reported by the stage. It clears protection when
none remain, allowing a two-second grace after an exclusion request. A cold
start checks the lock before showing the strip. Dead, missing or unreadable lock
records do not keep protection on.

Run this checklist on Windows 10 and, if available, Windows 11. Rebuild and
developer-install into the isolated home above, restart the app, and keep a
leader pet visible (the registered hooks above or a synthetic leader event).
Use the same home and port in every test terminal.

1. **Fullscreen and z-order:** start a long-running worker, then put a video
   player or borderless application into fullscreen on the primary monitor.
   Within 300 ms the strip should disappear behind it and animation should stop.
   Exit fullscreen: the strip should return above other windows and animate
   without jumping forward through paused frames. Repeat with another topmost
   window, switching focus several times. Fullscreen on a secondary monitor
   alone must leave the strip active on the primary monitor.
2. **Auto-hide taskbar:** enable taskbar auto-hide in Windows settings, maximize
   a normal captioned window, and focus it. The strip should stay visible and
   animate; maximizing must not trigger fullscreen. Enter real fullscreen and
   exit again, then restore the taskbar setting.
3. **DPI:** in Display settings select a primary-monitor scale other than 100%
   (for example 150%). Repeat fullscreen entry/exit. The strip should fit the
   primary work area's width and bottom edge, and full monitor coverage should
   still trigger fullscreen. Restore the original scale.
4. **Work area:** with pets visible, change taskbar auto-hide, taskbar size or
   position where supported, or change the primary display resolution. Verify
   the strip follows the new work-area bottom and width. Repeat while fullscreen
   and confirm it stays behind the app, then returns correctly on exit.
5. **Events and deadlines while fullscreen:** finish one worker and start another
   from a second terminal while fullscreen. Exit and verify only the current
   worker is shown. With a leader in `review`, remain fullscreen for over 60 s:
   it should be `idle` on return. Kill a runner and its worker process tree,
   remain fullscreen for over 30 s, and confirm its expired pet is absent.
6. **Capture boundary:** leave a leader visible and start continuous screen
   recording with Windows Graphics Capture (or take repeated Snipping Tool
   screenshots). Run `node skills/claude/codex-computer-use/scripts/codex-run.mjs
   computer-user --prompt-file <prompt.md> --cwd <repository>` in the isolated
   terminal, using a task that lasts long enough to inspect. Watch
   `<home>/.codex-delegate/computer-use.lock/holder.json` and `child.json`.
   The strip should stay visible on the desktop but be absent from capture
   before the worker starts, throughout computer use, and while either recorded
   process is alive. After worker exit, it should reappear in capture within
   about one second (or the remaining two-second request grace for a short run).
   Hard-kill only the runner while leaving its recorded child alive: capture
   exclusion must remain until that child exits and the stage's worker expires.
   Also quit the pet, start a computer-user worker, and let its first event cold
   start the app: its first visible frame should already be excluded.
7. **Stale lock:** after all computer-user processes have exited and their pets
   have expired, create the isolated home's `computer-use.lock` directory with
   `holder.json` containing `{"token":"manual-stale","runnerPid":<dead-pid>}`
   and `child.json` containing `{"token":"manual-stale","childPid":<dead-pid>}`.
   Use PIDs of processes you started and have confirmed exited with Task Manager.
   The visible strip must remain present in screenshots after one second; the
   stale directory alone must not enable exclusion. Remove only these synthetic
   records afterward. Do not overwrite a live lock.
8. **Acknowledgement and token:** with no computer-user activity, POST `/exclude`
   using `$petHeaders` from above. A 200 response should coincide with exclusion
   already active; screenshots should show it again after the two-second grace.
   Repeat with a wrong token: expect 401 and no new protection interval.

These desktop checks are manual and have not been run by the Node test suite.

## Leader hooks (manual registration)

The developer installer copies `hook/leader-hook.mjs` beside `client/` under
`<home>/.codex-delegate/pet/`. It does not change Claude Code settings. The first
event starts the app. In a new terminal, set `HOME`, `USERPROFILE`,
`CLAUDE_CONFIG_DIR` and the optional pet port to the same isolated values.
Remove the synthetic worker-test identity before launching a real Claude session:

```powershell
Remove-Item Env:CLAUDE_PID, Env:CLAUDE_CODE_SESSION_ID -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $env:CLAUDE_CONFIG_DIR | Out-Null
```

Merge the following `hooks` entries into
`$env:CLAUDE_CONFIG_DIR\settings.json`, preserving any existing settings and hooks.
This example uses `<home> = C:\temp\pet-test-home`; replace that path in every
command if your isolated home differs. Backslashes and command quotes must be
escaped as shown in JSON. Node must be on the Claude session's `PATH`.

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5
    }] }],
    "SessionEnd": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5
    }] }],
    "UserPromptSubmit": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5
    }] }],
    "PermissionRequest": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5
    }] }],
    "Notification": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5
    }] }],
    "Stop": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5
    }] }],
    "StopFailure": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5
    }] }],
    "PostToolUse": [{ "hooks": [{
      "type": "command", "command": "node \"C:\\temp\\pet-test-home\\.codex-delegate\\pet\\hook\\leader-hook.mjs\"", "timeout": 5, "async": true
    }] }]
  }
}
```

Restart Claude Code after changing hooks. Claude supplies `CLAUDE_PID` as the
team key to both hooks and commands it runs; `session_id` is informational and
can change after `/clear`. No hooks are registered for Claude subagents.
The hook filters `SessionStart` sources `clear`/`compact`, `SessionEnd` reason
`clear`, and every notification except `elicitation_dialog`. Permission prompts
and questions are detected immediately through `PermissionRequest`, and
`PostToolUse` resumes only a waiting leader. `StopFailure` marks the leader as
failed until the next prompt. Stdin is bounded to one second and 1 MiB; invalid
or oversized input is ignored. Delivery uses the client's existing short deadline;
hook exits are always silent and successful.

Manual checks with the rebuilt app and a real Claude session:

1. Launch `claude` from that terminal: an idle pet named `leader` appears.
2. Submit a prompt: the leader shows `running`.
3. Trigger a permission prompt or question: the leader shows `waiting`.
   Approve or answer it: the leader returns to `running` after `PostToolUse`.
4. Let the turn finish: the leader shows `review`, then `idle` after 60 seconds.
   A new prompt during review immediately shows `running`.
5. Run `/clear`: the leader stays in the same team. Submit another prompt and
   confirm its activity still updates. Idle reminders must not show `waiting`.
6. Have the session start a worker through the installed runner: its pet sits
   to the right of its leader and leaves when it finishes.
7. Open a second real Claude session with the same isolated settings. Two
   teams appear left to right in order of appearance; each session's workers
   stay beside its own leader, and one team's activity does not change the other.
8. Use `/exit` in one session: its leader and workers disappear together, leaving
   the other team. Use `/exit` in the other session to remove that team too.
9. Start a session, then close its terminal window without `/exit`. Its leader
   and workers leave within about five seconds and its session record is deleted.
10. Leave a session open and quiet. Stop the pet app through `/quit`, then start
    the installed executable again with the same isolated environment. Its idle
    leader returns without another hook event. Repeat after an idle exit or a
    bundle update; closed sessions must not return.

Seam 2 tests run the installed-layout hook as real child processes against a
fake HTTP listener with isolated homes, including concurrent deliveries replayed
out of order. Seam 3 tests drive leader activity, wall-time review expiry,
timestamp ordering, restore ordering, generations, process death, team tombstones
and worker grouping directly. Hook tests also check session record persistence,
replacement and removal, including clear/compact and unavailable listeners.
The existing worker tests remain unchanged.

## Scenes

The pure `app/ui/scenes.mjs` timelines use injected wall time, starting when
an event is received so queued short workers still get a scene. Snapshot
`state` remains the activity; `displayState`, `x`, and `facing` describe playback.
Positions are team-relative slot units: leader home `0`, worker homes `1, 2, ...`,
beside the leader `0.5`. Exit phases use `-1` for pacing; the renderer projects
them beyond the strip's left edge. It translates pets from their flex slots;
layout and overflow hide pets after scenes are computed.
Idle wander stays within a quarter slot of the leader's home.

Manual scene checks with the rebuilt app, isolated home, and real leader hooks
above (for a human to run):

1. Have the leader start a real worker that succeeds. The leader waves once;
   the worker runs right to its spot and works, then runs left back, jumps,
   pauses while the leader shows `review` once, and exits left. A busy leader
   returns to `running` after its pose.
2. Run a real worker whose process exits with a failure. Its pet shows `failed`
   twice, pauses while its leader shows `failed` once, then exits left.
3. While a worker is running, leave the leader at an approval prompt or
   question. During the worker's report the leader keeps `waiting`; other
   workers keep working. Answer the prompt and confirm it resumes `running`.
4. Run a worker from a terminal without `CLAUDE_PID` or
   `CLAUDE_CODE_SESSION_ID`. Its pet delegates and reports without a leader or
   the leader's acknowledgement pause. Repeat with a failing run.
5. Leave a leader idle: it pauses and wanders slowly both ways, facing its
   movement. Submit a prompt and confirm `running` replaces wandering.

## Layout and overflow manual check

Rebuild and install into the isolated home above. Run these checks once with
`scale: 0.3` and again with `scale: 1.0` in that home's
`.codex-delegate/pet.json`, restarting the app after each configuration change.
Keep any existing `pets` mapping when editing the file. Scale is read on startup;
work-area and DPI changes update the fit limit through window resize events.

The fit calculation reserves the 192 * scale + 24 CSS-pixel pet/name-tag width,
a 48px worker badge with a 4px gap for every possible visible team, 16px team
gaps, 8px side padding, and a trailing 96px sessions badge. Reservations are
conservative even when badges are absent: at 1920 CSS pixels the limit is 12
at scale 0.3, 8 at 0.6, and 6 at 1.0, always capped at 16. A strip too narrow
for a pet has limit zero. A fully hidden leaderless team counts in the sessions
badge; partially visible leaderless teams show their own worker badge.

Use a fresh app instance without real sessions, with the isolated environment
and pet port configured as above (start it with one runner as above so the
token exists). Send synthetic events from PowerShell:

```powershell
$petHeaders = @{ 'X-Codex-Delegate-Pet-Token' = (Get-Content "$petTestHome\.codex-delegate\pet-state\token" -Raw).Trim() }
$petDemoUrl = "http://127.0.0.1:$env:CODEX_DELEGATE_PET_PORT/event"
function Send-PetDemo($eventFields) {
  Invoke-RestMethod -Method Post -Uri $petDemoUrl -Headers $petHeaders -ContentType 'application/json' `
    -Body ($eventFields | ConvertTo-Json -Compress) | Out-Null
}
function Add-PetDemoSession($team) {
  Send-PetDemo @{ v = 1; source = 'leader'; type = 'session-start'; team = $team;
    session = $team; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
}
Add-PetDemoSession 'layout-0'
# Rerun this worker loop to refresh their 30-second leases during inspection.
1..30 | ForEach-Object {
  $petDemoAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Send-PetDemo @{ v = 1; source = 'worker'; type = 'heartbeat'; team = 'layout-0';
    session = 'layout-0'; worker = "layout-worker-$_"; role = 'implementer';
    label = "worker-$_ with a long name tag to check truncation";
    at = $petDemoAt; seq = $petDemoAt }
}
```

1. Confirm the leader stays visible, the oldest workers fit beside it, long
   name tags truncate within their pets, and the team's trailing `+N` equals
   30 minus the visible worker count. Neither pets nor badges shrink or overlap.
2. Change display resolution/work-area width or DPI while workers are live.
   Confirm the visible count changes immediately, newest workers disappear
   first, and widening restores them in order. Refresh the worker loop if needed.
3. Run `1..20 | ForEach-Object { Add-PetDemoSession "layout-$_" }`.
   Confirm leaders take every slot before workers: the oldest sessions remain,
   `layout-0` shows `+30` while those workers are live, and the single trailing
   `+N sessions` equals 21 minus the visible leader count. No team's workers
   appear after its leader is hidden. On a very wide display, still show at most
   16 pets.
4. Remove the added sessions and confirm the original workers reappear if live:
   `1..20 | ForEach-Object { Send-PetDemo @{ v = 1; source = 'leader'; type = 'session-end'; team = "layout-$_"; session = "layout-$_"; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } }`.
   Stop the app via Task Manager to clear synthetic sessions before using it
   with real leaders. Repeat the checks at the other scale.
