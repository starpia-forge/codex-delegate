---
name: codex-computer-use
description: "Delegate computer use (operating a native desktop app through its screen: screenshots, clicks, typing) to Codex running GPT 6 Astra. Use instead of Claude's own computer-use tools or skill whenever a task needs a desktop app driven. Not for websites."
---

Have the Codex computer-use worker drive the desktop. Your job is to brief it, then verify the result from the screenshot it saves. Keep your own hands off the desktop: you drive it only if the user agrees to that after a failure.

An **attempt** is one worker run. Every attempt gets its own new task directory and is judged only by the artifacts in that directory. A task gets the first attempt plus at most one **follow-up**.

## Process

1. **Confirm irreversible actions.** If the task includes an action that is hard to undo (sending, deleting, submitting, purchasing, overwriting a file) that you chose yourself rather than the user asking for it, ask the user before delegating. When the user explicitly asked for that action, go ahead.

2. **Write the brief.** Create a new task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-computer-use-<slug>/` and write `prompt.md` there using the template below. Phrase the completion criterion as what the screen must show, so a screenshot can settle it.

3. **Warn the user.** Tell them a Codex worker is about to drive the desktop and they should leave the mouse and keyboard alone until you say it finished.

4. **Run the worker** in the background (Bash with `run_in_background: true`), one at a time, and wait for the notification:

   ```
   node "${CLAUDE_SKILL_DIR}/scripts/codex-run.mjs" astra-cu --prompt-file <task-dir>/prompt.md --cwd <task-dir>
   ```

5. **Classify the outcome**, checking in this order and taking the first that matches:
   1. Exit code 75 → **Busy** below.
   2. `<task-dir>/result.md.log` or `result.md` contains `Computer Use native pipe is unavailable` → **Pipe unavailable** below.
   3. Any other non-zero exit, or no `<task-dir>/result.md` → **Other failures** below.
   4. Otherwise go to step 6.

6. **Verify.** Open `<task-dir>/final.png` yourself and compare it with the completion criterion, plus any other evidence the criterion names (for example, check that a saved file exists). The worker's report is a claim; the screenshot decides. A missing `final.png` in this attempt's directory fails verification, whatever the report says.
   - Criterion met → tell the user it is done, with the screenshot path.
   - Criterion missed and the follow-up is unused → step 7.
   - Criterion missed after the follow-up → stop. Report to the user: the criterion, what the screenshot shows, each step's status, the screenshot path. Don't run another attempt and don't drive the desktop yourself.

7. **Follow-up.** Write a new task directory using the template, plus a `## Previous attempt` section: the previous task directory, its steps listed under done / not done / uncertain, and what the screenshot showed. Tell the worker to first confirm each uncertain step by observation only (screenshots, reading the screen, no clicks or typing that change anything), then continue from the current screen without repeating steps that are done. When the previous attempt has no report, every step of the brief is uncertain. Go back to step 3.

## Failure paths

- **Busy** (exit 75, `codex-run: computer use busy: ...`): another computer-use worker holds the desktop, possibly from another Claude session. No worker ran and nothing happened, so this attempt costs nothing. Tell the user, and when they say the desktop is free, run the same brief again in a new task directory.
- **Pipe unavailable**: the Codex desktop app isn't running. Ask the user to start it, wait for them to confirm, then pick the rerun:
  - the report exists and marks no step done or uncertain → rerun the same brief in a new task directory. This rerun doesn't use up the follow-up.
  - anything else, including a missing report → the rerun is the follow-up (step 7). If the follow-up is already used, stop and report as in step 6.
- **Other failures**: show the user the tail of `<task-dir>/result.md.log` and ask whether to retry (as the follow-up, step 7) or have you do the task yourself. If the follow-up is already used, the only choices are stopping or you doing it. If the log shows `Computer Use was not approved to use <app>`, the `astra-cu` bypass is turned off, likely by `"dangerouslyBypassApprovalsAndSandbox": false` in `~/.codex-delegate/roles.json`; say so, since a retry will fail the same way.

<prompt-template>

# Computer use: <task title>

## Goal

<what to accomplish, and why>

## Target app and starting state

<the app, how to open it if it isn't open, and what the screen should look like at the start>

## Completion criterion

<what the screen must show when done, plus any task-specific evidence, such as the path of a saved file>

## Instructions

- Use the `computer-use:computer-use` skill to operate the desktop.
- When you finish or get stuck, save a screenshot of the screen as `final.png` in the current directory.

## Final message

Report:

1. every step you took, each marked **done**, **not done** or **uncertain** (uncertain: you acted but couldn't confirm the effect);
2. the absolute path of `final.png`;
3. where you got stuck, if anywhere;
4. any error messages, verbatim.

</prompt-template>
