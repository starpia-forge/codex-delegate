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
lives beside it in `pet-state/`: a random per-user `token`, the delivery `spool/`
and the installer's `updating` flag. The developer installer preserves an existing
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

1. Health returns `app: codex-delegate-pet`, `protocol: 1`, `version: 0.1.0`.
2. A real worker shows a running pet with `researcher · task-one` above the
   primary monitor's taskbar. Transparent pixels reveal the desktop; clicking
   the pet reaches the window below. It never takes keyboard focus or adds a
   taskbar entry. Moving focus to another topmost window keeps the strip above it.
3. Start two workers of the same role with different task directories. Both
   pets appear with their own labels; finishing one removes just that pet.
4. Kill a runner and its worker process tree. Its pet disappears within about
   30 seconds of the last report. Ordinary success and failure remove it immediately.
5. Check a non-100% DPI, change the primary work area, and confirm the strip follows.
6. Stop the app via `/quit` and run again. Output, results and exit status
   match a run with the installed client removed; nothing pet-related is printed.

Five original placeholder PNGs follow Codex v1: 1536×1872, cells 192×208,
8 columns, 9 rows, frame counts 6/8/8/4/5/8/6/6/6. Playback defaults to scale 0.6.
Exact Codex frame durations were not available: provisional per-frame timings
are collected in `CODEX_V1_FRAME_TIMINGS_MS` in `app/ui/renderer.mjs`.

Tests: `npm.cmd test`. The runner tests use fake Codex, a fake HTTP listener,
isolated homes and a runner copied from the generated `codex-implement` skill.
The delivery tests launch a delayed stub app and replay cold-start events into
the real stage. The stage tests inject wall time. Expiry removes a missing worker but permits
a newer heartbeat to recover it; an explicit `end` permanently tombstones its id.

Optional configuration: `<home>/.codex-delegate/pet.json`:

```json
{
  "scale": 0.6,
  "pets": { "leader": "my-pet", "researcher": "critic" }
}
```

`scale` accepts numbers from 0.3 through 1.0. `pets` accepts `leader`,
`researcher`, `critic`, `implementer`, and `computer-user`; values are pet folder
names. Unknown keys and invalid values are ignored. Missing or invalid JSON
uses defaults. The shared `app/ui/pet-config.mjs` resolver returns diagnostic
issues alongside the selected pets.

Lookup is `<home>/.codex-delegate/pets/<name>/`, then
`$CODEX_HOME/pets/<name>/` (default `<home>/.codex/pets/<name>/`), then the bundled
name or the slot's default. A folder without `pet.json` is absent. The first
present package must have the Codex v1 manifest and a transparency-capable
1536×1872 PNG or WebP; rejection falls back to that slot's bundled default.
Header validation does not check animation frame contents.

Manual configuration check: in the isolated home above, copy a valid package
to `.codex-delegate/pets/my-pet/`, set `pets.researcher` to `my-pet` and `scale`
to `1.0`, then restart the rebuilt app and run a researcher. Confirm its artwork,
192×208 CSS-pixel canvas, name tag, and strip fit; repeat with `scale: 0.3`.
Break its manifest and restart to confirm the researcher placeholder appears.

Later tickets own scenes, fullscreen, capture exclusion, process
liveness, and production installation/release. This app accepts leader
and worker events on loopback; it does not implement those later features.

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

Seam 2 tests run the installed-layout hook as real child processes against a
fake HTTP listener with isolated homes, including concurrent deliveries replayed
out of order. Seam 3 tests drive leader activity, wall-time review expiry,
timestamp ordering, generations, team tombstones and worker grouping directly.
The existing worker tests remain unchanged.

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
