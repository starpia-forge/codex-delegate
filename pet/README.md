# Worker pets (developer tracer)

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
8 columns, 9 rows, frame counts 6/8/8/4/5/8/6/6/6. Playback is at scale 0.6.
Exact Codex frame durations were not available: provisional per-frame timings
are collected in `CODEX_V1_FRAME_TIMINGS_MS` in `app/ui/renderer.mjs`.

Tests: `npm.cmd test`. The runner tests use fake Codex, a fake HTTP listener,
isolated homes and a runner copied from the generated `codex-implement` skill.
The delivery tests launch a delayed stub app and replay cold-start events into
the real stage. The stage tests inject wall time. Expiry removes a missing worker but permits
a newer heartbeat to recover it; an explicit `end` permanently tombstones its id.

Later tickets own leader pets, scenes, overflow, fullscreen,
capture exclusion, process liveness,
configuration, and production installation/release. This app only accepts
worker events on loopback; it does not implement those later features.
