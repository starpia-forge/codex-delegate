# Spec: Delegate computer use to Codex (`codex-computer-use`)

Status: ready-for-agent

## Problem Statement

When a task needs a native desktop app driven (a click through a Windows app, typing into a dialog, checking what an app shows), the **leader** today either does it with Claude's own computer-use tools or skips it. The project's division of labour says Codex GPT 6 Astra is especially strong at **computer use**, but there is no way for the leader to hand that work to a **worker**. And the obvious way to run one does not work: under `codex exec`, Codex's Computer Use plugin asks for per-app approval, nobody can answer, and the request is auto-rejected (`Computer Use was not approved to use <app>`).

## Solution

A new leader skill, `codex-computer-use`, that delegates computer use to a Codex worker running a new **role**, `astra-cu` (GPT 6 Astra, medium effort), in the same shape as the existing `codex-*` delegation skills: the leader writes a brief, runs the worker through the shared runner, then verifies the result from a screenshot the worker saves. The `astra-cu` role runs Codex with approvals and sandbox bypassed, because that is the only way the Computer Use plugin can act in a non-interactive run. `doctor` warns when the Computer Use plugin is not enabled, and the README documents the prerequisites (Codex desktop app installed and running, plugin enabled) and the bypass trade-off.

Verified on this machine (Windows 10 19045, codex-cli 0.164.0, Codex desktop app 26.1021):

- With `-s read-only` or `-s workspace-write`: the worker sees `computer-use:computer-use` and `mcp__node_repl__js`, but app launch is auto-rejected.
- With `--dangerously-bypass-approvals-and-sandbox`: the worker opened Notepad, typed, saved `final.png` in its cwd, closed without saving.
- With the Codex desktop app closed: `Computer Use native pipe is unavailable: failed to connect native pipe ... (os error 2)`; nothing on screen changed.

## User Stories

1. As a leader, I want a skill whose description tells me to delegate desktop-app work to Codex instead of using my own computer-use tools or skill, so that the work goes to the worker best at it.
2. As a leader, I want the skill to exclude websites, so that browser work stays with Playwright and other browser tools.
3. As a leader, I want a brief template with goal, target app and starting state, completion criterion, and final-report format, so that the worker knows what "done" looks like and I can check it.
4. As a leader, I want the completion criterion phrased as what the screen must show, so that I can judge success from a screenshot.
5. As a leader, I want the worker to save a final screenshot in the task directory, so that I can open it and verify the result myself.
6. As a leader, I want the worker's report to list the steps taken, the screenshot path, and where it got stuck, so that I can understand partial failures.
7. As a leader, I want the brief to tell the worker to use the `computer-use:computer-use` plugin skill, so that it follows OpenAI's maintained guidance rather than a copy in this repo.
8. As a leader, I want to ask the user before delegating an irreversible action that I chose on my own, so that nothing hard to undo happens without consent.
9. As a leader, I want to skip that confirmation when the user explicitly asked for the action, so that I don't ask twice.
10. As a user, I want to be told not to touch the mouse and keyboard before the worker starts, so that I don't derail it.
11. As a leader, I want to run only one computer-use worker at a time, so that two workers never fight over one desktop.
12. As a user running several Claude sessions (e.g. in worktrees), I want the runner itself to refuse a second computer-use worker while one is running, so that the one-at-a-time rule holds across sessions, not just within one.
13. As a leader, I want a clear "busy" failure when another computer-use worker holds the desktop, so that I can tell the user instead of retrying blindly.
14. As a user, I want a lock left behind by a crashed run to be reclaimed automatically, so that one crash doesn't block computer use forever.
15. As a leader, I want the worker's report to mark every step as done, not done, or uncertain, so that I know which side effects may already have happened.
16. As a leader, I want at most one follow-up run when the screenshot misses the completion criterion, briefed to first confirm uncertain steps by observation only, then continue from the current screen without repeating completed steps, so that side effects are not duplicated.
17. As a leader, I want every attempt (first run, follow-up, rerun) in its own new task directory, and to treat a missing screenshot or report from that attempt as a failure, so that stale artifacts from an earlier attempt never pass verification.
18. As a leader, I want to stop and report to the user when the follow-up still misses, so that I don't loop.
19. As a leader, I want to recognise the "native pipe is unavailable" failure and ask the user to start the Codex desktop app; if the report shows no action was taken, rerun the same brief without counting it as a follow-up, otherwise treat the rerun as the follow-up, so that a closed app doesn't cost the retry budget but a mid-task disconnect doesn't repeat actions.
20. As a leader, I want any other failure to show the tail of the log and ask the user whether I should do it myself, so that I don't silently fall back to my own tools.
21. As a leader, I want never to drive the desktop myself while the skill applies, except after the user agrees on failure, so that roles stay clear.
22. As a user, I want a separate `astra-cu` role, so that I can tune computer use independently of the review role `astra`.
23. As a user, I want the bypass to be a visible, named field on the role, so that I can see the role runs without a sandbox and turn it off in `~/.codex-delegate/roles.json`.
24. As a user, I want every other role to run exactly as before, without a lock, so that the change doesn't loosen or slow down review, research or implementation.
25. As a user, I want the runner's start-up line to say when a role runs with approvals and sandbox bypassed, so that the log shows it.
26. As a user, I want `doctor` to warn (not fail) when the Computer Use plugin is not enabled in Codex, so that people who don't use computer use still get a clean doctor.
27. As a user, I want `doctor` to check the `astra-cu` model and effort like every other role, so that a missing model is caught at install.
28. As a user, I want the README (English and Korean) to list the new role and skill in "Who does what" and "Worker configuration", so that I know it exists.
29. As a user, I want the README to state the prerequisites: Codex desktop app installed, Computer Use plugin enabled, app running while the skill runs, so that I can set it up.
30. As a user, I want the README to say why `astra-cu` runs without a sandbox and what that means, so that I can make an informed choice.
31. As a user on Windows 10, I want the README to note reported reliability issues with Computer Use on Windows 10, so that failures don't surprise me.
32. As a maintainer, I want the new skill authored with the repo's own skills and built into the Claude skill set with the runner bundled, like the other `codex-*` skills, so that install and uninstall handle it with no special cases.
33. As a maintainer, I want automated tests for the runner's argument building, its lock, and the doctor plugin check, so that regressions are caught without a desktop.

## Implementation Decisions

- **New role `astra-cu`** in the default roles: model `gpt-6-astra`, effort `medium`, purpose "Computer use", `webSearch: false`, and two new boolean fields: `dangerouslyBypassApprovalsAndSandbox: true` and `exclusive: true`. It keeps a `sandbox` value for documentation, but the runner ignores `sandbox` when the bypass field is true. Both new fields default to false for every other role.
- **Runner lock** for roles with `exclusive` true: before spawning Codex, atomically create a per-user lock file in `~/.codex-delegate/` (one lock shared by all exclusive roles, since there is one desktop) recording the runner's PID and, once spawned, the Codex child's PID. If the file exists and either recorded PID is alive, or the record is incomplete, exit immediately with a distinct non-zero code and a "busy" message naming the holder, without spawning Codex or creating a log. Only when every recorded PID is dead is the lock reclaimed. Acquisition, reclamation and release are ownership-safe under concurrent runners: a runner never deletes a lock it doesn't own. Release it when the run ends (normal exit, Codex error, or spawn failure). When the runner is interrupted, it terminates the Codex process tree before releasing. Residual risk, documented in the README: if the runner is killed hard, a grandchild of the shell may outlive both recorded PIDs.
- **Runner**: when the merged role config has `dangerouslyBypassApprovalsAndSandbox` true, pass `--dangerously-bypass-approvals-and-sandbox` instead of `-s <sandbox>`; everything else (`-m`, effort, `-C`, `-o`, web search, stdin prompt, Windows shell quoting, `safe.directory` env) is unchanged. User overrides merge per field as today, so `"dangerouslyBypassApprovalsAndSandbox": false` in the user file turns it off. The start-up log line reports the bypass for such roles instead of the sandbox.
- **New skill `codex-computer-use`** (leader-side), same structure as `codex-research` / `codex-implement`: frontmatter `name` and `description`, a numbered process, and a `<prompt-template>`.
  - Description: "Delegate computer use (operating a native desktop app through its screen: screenshots, clicks, typing) to Codex running GPT 6 Astra. Use instead of Claude's own computer-use tools or skill whenever a task needs a desktop app driven. Not for websites."
  - Process: confirm irreversible self-initiated actions with the user → create a new task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-computer-use-<slug>/` and write `prompt.md` → tell the user not to touch the PC → run the runner with role `astra-cu`, `--prompt-file <task-dir>/prompt.md --cwd <task-dir>`, in the background, one at a time → check that this attempt produced both `final.png` and `result.md` (missing → failure) → open the screenshot and compare with the completion criterion → at most one follow-up → otherwise report.
  - Follow-up: a new task directory; the brief lists the previous attempt's steps by status, tells the worker to first confirm uncertain steps by observation only (no actions), then continue from the current screen without repeating done steps.
  - Busy (runner's lock exit): tell the user another computer-use worker is running; don't retry on your own.
  - Pipe unavailable: ask the user to start the Codex desktop app. If the report exists and shows no step done or uncertain, rerun the same brief in a new task directory (not counted as a follow-up); otherwise (including a missing report) the rerun is the follow-up.
  - Other failures: show the log tail, ask whether to do it directly.
  - Brief template sections: goal and why; target app and starting state; completion criterion (what the screen must show, plus any task-specific evidence such as a saved file path); instructions (use the `computer-use:computer-use` skill; save the final screenshot as `final.png` in the current directory); final message (each step marked done / not done / uncertain, screenshot absolute path, where it got stuck, errors verbatim). No list of forbidden actions: the worker judges (decided with the user).
- **No Codex-side skill**: the worker relies on the plugin's own `computer-use:computer-use` skill. The Codex skill list is unchanged.
- **No upstream patches**: no existing workflow skill is patched to call the new skill.
- **`doctor`**: new check that reads `config.toml` in the Codex home (respecting `CODEX_HOME`) and reports OK when the `computer-use@openai-bundled` plugin section has `enabled = true`, WARN otherwise (file missing, section missing, or disabled). Never FAIL. No dependency added: a minimal line-based read of that one section is enough. `doctor` does not check whether the desktop app is running.
- **Docs**: README and Korean README get the new role row, the new skill in "Who does what" (Astra's role extended to computer use), the skill count updated, prerequisites, the bypass explanation, and the Windows 10 caveat. `GLOSSARY.md` already defines **Computer use**. No ADR: the bypass is a reversible configuration choice.
- **Build**: the generated skill set is regenerated by the existing build script; nothing in the build changes.

## Testing Decisions

- Good tests run the two CLIs as processes and assert only on what a user observes: the arguments the runner hands to `codex`, and `doctor`'s printed lines and exit code. They do not import internals.
- Use Node's built-in `node:test` (no new dependencies) and add a `test` script to `package.json`.
- **Runner seam**: put a fake `codex` executable first on `PATH` that records its arguments (and stdin) to a file and writes a result to the `-o` path. Cases:
  - `astra-cu` → arguments contain `--dangerously-bypass-approvals-and-sandbox` and no `-s`.
  - `astra`, `sol`, `luna` → arguments unchanged from today (`-s <sandbox>`, web search only for `luna`).
  - A user override file (home directory pointed at a temp dir) setting the bypass field to false for `astra-cu` → `-s` is passed again.
  - Lock: while one `astra-cu` run is in progress (fake `codex` that waits), a second `astra-cu` run exits with the busy code and the fake `codex` is not invoked a second time; after the first finishes, a new run succeeds; a lock file holding a dead PID is reclaimed; a non-exclusive role (`astra`) runs while the lock is held.
  - Isolate the home directory in every test so the real `~/.codex-delegate/` (overrides and lock) is never touched.
  - Must work on Windows, where the runner spawns through a shell and needs a `codex.cmd` shim, and on POSIX.
- **Doctor seam**: isolate both agent homes (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`) and the home directory, put a fake `codex` (version, logged-in status) and a models-cache fixture covering every role in place, then vary `config.toml`: plugin enabled, disabled, section absent, file missing. Assert the OK / WARN line and exit code 0 in all four cases.
- **Manual acceptance**: on a machine with the Codex desktop app running and the plugin enabled, run the skill on "open Notepad, type hello, don't save" and confirm `final.png` shows it; with the app closed, confirm the pipe-unavailable path; close the app partway through a task and confirm the leader issues a follow-up rather than replaying the brief.
- Prior art: none in this repo (no tests yet).

## Out of Scope

- Browser automation (Playwright, Chrome, Codex's browser plugin).
- A custom or third-party computer-use MCP server (e.g. FlaUI) for workers.
- Patching upstream workflow skills (`/implement`, `diagnosing-bugs`, ...) to call the new skill.
- Pre-checking whether the Codex desktop app is running.
- A forbidden-action list in the worker brief.
- macOS/Linux-specific handling beyond what the plugin does itself.
- Ignoring `.scratch/codex/` in this repo's `.gitignore`.

## Further Notes

- The bypass turns off the shell sandbox as well as approvals: the worker can write anywhere and use the network. This was the user's explicit choice over `--approve-for-me` and desktop-app pre-approval.
- Research notes: `.scratch/codex/20261026-155411-research-codex-computer-use/result.md`.
- GitHub issues report screenshot time-outs and click-geometry problems on Windows 10 19045; not reproduced here.
