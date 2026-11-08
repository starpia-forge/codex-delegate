# Spec: Only the computer-user role can drive the desktop

Status: ready-for-agent

## Problem Statement

Every **worker** inherits the user's Codex configuration, and on a machine with the Codex desktop app that configuration turns on **computer use** for all of them. The Computer Use plugins and the desktop app's `node_repl` MCP server are visible to the `implementer`, `critic` and `researcher` roles, not just to `computer-user`. The `implementer` runs with approvals and sandbox bypassed (ADR 0004), so nothing stops it from opening an app and taking the user's mouse and keyboard in the middle of an unrelated task. The user's first requirement for delegation is that a worker never takes control of their computer unless the task is computer use, and today that rests only on the model's judgement.

## Solution

Computer use becomes a per-**role** capability that is off unless the role turns it on. The shipped `computer-user` role turns it on; every other role, including any role added later, starts Codex with every known computer-use route disabled for that run only. The user's `config.toml` is not edited. A user can turn computer use on for another role in `~/.codex-delegate/roles.json`, provided that role is also exclusive. The runner's start-up line says whether computer use is on or off, and says so when it couldn't tell whether a route is closed.

Verified on this machine (Windows 10 19045, codex-cli 0.167.0, Codex desktop app 26.1103):

- Two plugins provide computer use: `computer-use@openai-bundled` and `unified-computer-use@openai-bundled`. The second contributes a `cua_repl` MCP server, which disappears when the plugin is disabled.
- The desktop app also writes a top-level `[mcp_servers.node_repl]` into `config.toml`. Its environment carries the computer-use native pipe (`SKY_CUA_NATIVE_PIPE`) and the browser and Chrome backends. It survives disabling the plugins; `-c mcp_servers.node_repl.enabled=false` turns it off.
- `-c plugins.computer-use@openai-bundled.enabled=false` (no quotes) disables the plugin. The quoted form `-c 'plugins."computer-use@openai-bundled".enabled=false'` is accepted without error and does nothing, because Codex splits `-c` keys on `.` and keeps the quotes as part of the key.
- A `-c` override for a plugin that isn't installed is harmless. A `-c mcp_servers.<name>.enabled=false` override for a server that isn't configured makes Codex refuse to start (`invalid transport in mcp_servers.<name>`).
- `codex mcp get node_repl --json` answers in about a quarter of a second: exit 0 and a JSON object whose `name` is `node_repl` when the server is defined (enabled or not); exit 1 and `No MCP server named 'node_repl' found.` on stderr when it isn't.
- `codex -c … plugin list --json` and `codex -c … mcp list` show the effective state under the same overrides.

## User Stories

1. As a user, I want workers that aren't doing computer use to be unable to drive my desktop, so that a delegated task never takes my mouse and keyboard.
2. As a user, I want the `implementer`, which runs without a sandbox, to have no computer-use plugin, skill or tool, so that the bypass can't turn into desktop control.
3. As a user, I want the `critic` and `researcher` to have computer use off too, so that read-only roles can't take screenshots or act on the screen either.
4. As a user, I want the `computer-user` role to keep working exactly as before, so that delegated computer use is unaffected.
5. As a maintainer, I want computer use off by default for every role, so that a role added later without thinking about it is safe.
6. As a user, I want my `config.toml` left untouched, so that my own interactive Codex sessions still have computer use.
7. As a user, I want both Computer Use plugins disabled, so that a second plugin ID doesn't leave a route open.
8. As a user, I want the desktop app's `node_repl` MCP server disabled for these roles, so that the native pipe can't be reached through it.
9. As a user, I want `node_repl` found however my configuration defines it (any TOML spelling, a project-level config), so that an unusual spelling doesn't leave the route open.
10. As a user without the Codex desktop app, I want workers to start normally, so that disabling a server I don't have never breaks a run.
11. As a user, I want workers to start normally when the runner can't tell whether `node_repl` is defined, so that the protection never becomes an outage.
12. As a user, I want the start-up line to say when the runner couldn't tell whether `node_repl` is defined, so that a log never claims computer use is off when it may not be.
13. As a user, I want to turn computer use on for a specific role in `~/.codex-delegate/roles.json`, so that I can opt in deliberately.
14. As a user who turns computer use on for another role, I want the runner to refuse unless that role is also exclusive, so that two workers never fight over one desktop and an interrupted run doesn't leave a desktop-driving worker behind.
15. As a user, I want the runner never to make a role exclusive on its own, so that I don't silently lose parallel implementation.
16. As a user, I want a `computerUse` value that isn't `true` or `false` rejected before Codex starts, so that a typo such as `"false"` in quotes can't turn computer use on.
17. As a user, I want to turn computer use off for `computer-user` the same way, so that I control every role with one field.
18. As a user, I want the runner not to force computer use on for `computer-user`, so that a plugin I disabled in Codex stays disabled.
19. As a user, I want the runner's start-up line to say `computer-use=on` or `computer-use=off`, so that a log shows which it was.
20. As a user, I want every other Codex argument (model, effort, sandbox or bypass, web search, cwd, output) unchanged, so that nothing else about my workers changes.
21. As a user, I want the README (English and Korean) to say which role has computer use, and how to turn it on for another role, so that I know what my workers can do.
22. As a user, I want the README to say that roles without computer use also lose the browser and Chrome plugins' `node_repl` route, so that a missing browser plugin doesn't surprise me.
23. As a maintainer, I want automated tests of the arguments the runner hands to Codex, so that a regression in the overrides is caught without a desktop.
24. As a maintainer, I want a recorded manual check against a real Codex install, so that the overrides are known to take effect, not just to be passed.
25. As a user, I want this to ship in a Release, so that my installed skills get it.

## Implementation Decisions

- **Role field `computerUse`** (boolean). The runner's built-in defaults set it to `false`, alongside `exclusive` and `dangerouslyBypassApprovalsAndSandbox`. The shipped roles set it to `true` for `computer-user` only. User overrides merge per field as they do today, so `"computerUse": true` or `false` in `~/.codex-delegate/roles.json` decides it for that role. No other field affects it.
- **Validation**, after merging and before anything else happens (no lock, no Codex call, no log): a `computerUse` that is not a JSON boolean fails the run with a message naming the role and the value. Only a literal `true` turns computer use on. A role whose merged config has `computerUse: true` and `exclusive` not `true` fails the run with a message saying both must be set, because the desktop lock, interrupt handling and process-tree stop exist only for exclusive roles, and ADR 0004 keeps `implementer` non-exclusive for parallel runs. The runner never turns `exclusive` on by itself.
- **Blocked routes** are a constant in the runner, not configurable: the plugin IDs `computer-use@openai-bundled` and `unified-computer-use@openai-bundled`, and the MCP server `node_repl`. When OpenAI renames them, a Release updates the constant.
- **Arguments for a role with `computerUse` false**: one `-c plugins.<id>.enabled=false` per plugin ID, always, and `-c mcp_servers.node_repl.enabled=false` only when Codex reports that server as defined. Keys are written without quotes. Each is a single argument; the existing Windows shell quoting needs no change because the tokens contain no spaces or shell metacharacters.
- **Arguments for a role with `computerUse` true**: none added, and no probe. The runner does not force plugins on; Codex's own configuration decides, and `doctor` already warns when the plugin is off.
- **Detecting `node_repl`**: ask Codex rather than parse `config.toml`. For a role with `computerUse` false, before spawning the worker, the runner runs `codex mcp get node_repl --json` in the worker's working directory with the same environment. On Windows it uses the worker's role-specific launch style: an attached shell for non-exclusive roles, or the detached `windows-codex.mjs` host for exclusive roles. Non-exclusive roles still have no signal handlers (ADR 0004); their probe shares the runner's console/process group. On POSIX the probe stays detached for both role styles so its PID leads a process group and deadline cleanup can kill the whole tree with `kill(-pid)`; consequently a non-exclusive POSIX probe does not receive the runner's console signals. Codex's own answer covers every TOML spelling, project-level configuration and the Codex home, and can't be fooled by text inside strings. Three outcomes:
  - **defined**: exit 0 and stdout parses as JSON with `name` equal to `node_repl` → add the override.
  - **absent**: non-zero exit and stderr says no MCP server named `node_repl` was found → no override.
  - **unknown**: anything else (spawn failure, time-out, other error, unparseable output) → no override, because an override for an undefined server stops Codex from starting. The run continues.
  The decision follows process exit, allowing up to 150 ms for buffered stdout/stderr, or until pipe close if sooner; descendants holding pipes open cannot postpone it. The independent 5-second deadline remains active during that grace. On expiry the runner fixes the verdict as unknown and attempts tree cleanup asynchronously before starting the worker. Windows cleanup uses `taskkill /T /F` with a 500 ms bound, then `windows-stop-tree.ps1` with a 1500 ms bound if needed; startup waits at most two additional seconds for cleanup, and failure logs a warning. This shorter budget applies only to probes; real worker shutdown keeps its proven-termination checks. Exclusive shutdown also tracks and stops the active probe within that budget before releasing the lock and exiting, without starting a worker. Every fake `codex` in the test suite answers the probe as absent by default and acts as a worker only for `exec`.
- **Start-up line** appends `computer-use=on` or `computer-use=off` after the existing sandbox or bypass field. When the probe was unknown, it reads `computer-use=off(node_repl unknown)`, so the log never claims a route is closed when it may not be.
- **Unchanged**: model, effort, sandbox or bypass, `--skip-git-repo-check`, `-C`, `-o`, web search, stdin prompt, environment, the exclusive lock and the pet. `doctor` is unchanged.
- **Docs**: README and Korean README describe the field in "Worker configuration": which role has it, how to opt in (with `exclusive`), and that the browser and Chrome plugins' `node_repl` route goes with it. The residual shell risk is not documented for now (user's decision). `GLOSSARY.md` already defines **Computer use**; no new term. No ADR: the default is one field and easy to reverse. ADR 0004 is not edited.
- **Build**: the runner is copied into each `codex-*` skill by the existing build script, and the package smoke test checks that the copies match the source. Regenerate the skills (`npm run build:skills`) and commit the generated copies with the change, before running `npm test` and the manual acceptance.
- **Commit type**: `fix(runner)`, since it changes what users receive.

## Testing Decisions

- One seam, the existing one: run the runner CLI as a process with the fake `codex` first on `PATH` and the home directory and `CODEX_HOME` isolated in temp directories, and assert only on the arguments handed to `codex`, the start-up line and the exit status. No runner internals are imported. The fake `codex` is extended to answer `mcp get node_repl --json` as each test tells it to (defined, absent, or a failure) and to record that call separately from the `exec` call.
- Cases:
  - `implementer`, `critic`, `researcher` → both plugin overrides present, unquoted; `computer-use=off` in the start-up line.
  - Fake `codex` reports `node_repl` defined → the `node_repl` override is present for a role without computer use.
  - Fake `codex` reports it absent → no `node_repl` override; the run succeeds; start-up line `computer-use=off`.
  - Fake `codex` fails the probe, or prints unparseable output → no `node_repl` override; the run succeeds; start-up line `computer-use=off(node_repl unknown)`.
  - Fake `codex` hangs on the probe (with a descendant holding its pipes open) → the worker starts within a bounded time with the unknown marker, and no probe process is left running.
  - Runner launched from one directory with `--cwd` another → the probe runs in the same directory and with the same `CODEX_HOME` as `exec`.
  - `computer-user` → no `mcp get` call, no `plugins.` or `mcp_servers.` override; `computer-use=on`.
  - User override `"computerUse": false` for `computer-user` → overrides present.
  - User override `"computerUse": "false"`, `null` or `1` → the run fails before Codex is invoked, naming the role.
  - `"computerUse": true` for `implementer` without `"exclusive": true` → the run fails before Codex is invoked; with `"exclusive": true` as well → it runs with no overrides and takes the desktop lock.
  - Existing argument tests for every role still pass (sandbox or bypass, web search only for `researcher`).
- Prior art: the bypass and sandbox override tests and the lock tests in the runner test file; the fake `codex` helper already answering `doctor`'s non-`exec` calls.
- `npm test` passes on Windows, after the skills are regenerated.
- **Manual acceptance**, recorded in the ticket's Comments, on a machine with the desktop app installed and both plugins and `node_repl` enabled:
  1. With the overrides the runner builds for `implementer`, `codex … plugin list --json` shows both plugin IDs `enabled: false`, and `codex … mcp list` shows no `cua_repl` and `node_repl` disabled.
  2. A short `implementer` run asked to list its skills and tools, without calling any, reports no `computer-use` skill and no `node_repl` or `cua_repl` tool. This is the model's self-report and is supporting evidence only.
  3. `codex-computer-use` on "open Notepad, type hello, don't save" still produces a matching `final.png`.

## Out of Scope

- Blocking desktop control through the shell. A worker with approvals and sandbox bypassed can still script the desktop (for example SendKeys or UI Automation from PowerShell). Configuration can't prevent this, and the brief gets no prohibition. Documenting it is deferred.
- Disabling the browser or Chrome plugins themselves. They lose their `node_repl` route but stay listed.
- Disabling all plugins (`--disable plugins`) or using `--disable computer_use`, which is not a per-plugin switch.
- A user-configurable list of blocked plugin or server IDs.
- Parsing `config.toml` in the runner.
- Turning `exclusive` on automatically for a role that opts into computer use.
- Forcing computer use on for `computer-user`.
- Changes to `doctor`.
- Process, account or session isolation for workers.

## Further Notes

- The user originally proposed a `disablePlugins` list per role. It became an off-by-default `computerUse` boolean because the routes to block are more than one plugin and a forgotten list would fail open.
- An adversarial review of the first draft led to asking Codex about `node_repl` instead of scanning `config.toml`, to the boolean validation, to the exclusive requirement, and to the explicit build step.
- Behaviour was checked against codex-cli 0.167.0 and the openai/codex source at `rust-v0.164.0` (`-c` parsing in `codex-rs/utils/cli/src/config_override.rs` and `codex-rs/config/src/overrides.rs`, disabled-plugin early return in `codex-rs/core-plugins/src/loader.rs`). openai/codex issue #51932 reports the same quoted-key behaviour on Windows.
