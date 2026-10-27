---
name: codex-computer-use
description: "Delegate computer use (operating a native desktop app through its screen: screenshots, clicks, typing) to Codex running GPT 6 Astra. Use instead of Claude's own computer-use tools or skill whenever a task needs a desktop app driven. Not for websites."
---

Have the Codex computer-use worker drive the desktop. Your job is to brief it, then verify the result from the screenshot it saves. Keep your own hands off the desktop: you drive it only if the user agrees to that after a failure.

An **attempt** is one worker run. Every attempt gets its own new task directory and is judged only by the artifacts in that directory. A task gets the first attempt plus at most one **follow-up**.

## Process

1. **Confirm irreversible actions.** If the task includes an action that is hard to undo (sending, deleting, submitting, purchasing, overwriting a file) that you chose yourself rather than the user asking for it, ask the user before delegating. When the user explicitly asked for that action, go ahead.

2. **Write the brief.** Create a fresh task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-computer-use-<slug>/` following Cleanup rule 1 below, then write `prompt.md` there using the template below. Track every attempt's task directory for cleanup when the task ends. Phrase the completion criterion as what the screen must show, so a screenshot can settle it.

3. **Warn the user.** Tell them a Codex worker is about to drive the desktop and they should leave the mouse and keyboard alone until you say it finished.

4. **Run the worker** in the background (Bash with `run_in_background: true`), one at a time, and wait for the notification:

   ```
   node "${CLAUDE_SKILL_DIR}/scripts/codex-run.mjs" computer-user --prompt-file <task-dir>/prompt.md --cwd <task-dir>
   ```

5. **Classify the outcome**, checking in this order and taking the first that matches:
   1. Exit code 75 → **Busy** below.
   2. `<task-dir>/result.md.log` or `result.md` contains `Computer Use native pipe is unavailable` → **Pipe unavailable** below.
   3. Any other non-zero exit, or no `<task-dir>/result.md` → **Other failures** below.
   4. Otherwise go to step 6.

6. **Verify.** Open `<task-dir>/final.png` yourself and compare it with the completion criterion, plus any other evidence the criterion names (for example, check that a saved file exists). The worker's report is a claim; the screenshot decides. A missing `final.png` in this attempt's directory fails verification, whatever the report says.
   - Criterion met → if the user asked for the screenshot, first copy `final.png` to a location outside `.scratch/codex/` and give that path. Otherwise, do not give a screenshot path inside the task directory. Tell the user it is done, then remove every attempt directory of this task (first attempt, follow-up, and any reruns) following Cleanup below.
   - Criterion missed and the follow-up is unused → step 7.
   - Criterion missed after the follow-up → stop. Keep all the task's attempt directories. Report to the user: the criterion, what the screenshot shows, each step's status, the screenshot path in the kept task directory. Don't run another attempt and don't drive the desktop yourself. Once the user has chosen how to proceed and you no longer need them, copy `final.png` to a location outside `.scratch/codex/` first if the user wants the screenshot, then remove all the task's attempt directories following Cleanup below.

7. **Follow-up.** Create a fresh task directory following Cleanup rule 1 below and write `prompt.md` using the template, plus a `## Previous attempt` section: the previous task directory, its steps listed under done / not done / uncertain, and what the screenshot showed. Keep the previous attempt's directory, which the follow-up refers to, until the task ends. Tell the worker to first confirm each uncertain step by observation only (screenshots, reading the screen, no clicks or typing that change anything), then continue from the current screen without repeating steps that are done. When the previous attempt has no report, every step of the brief is uncertain. Go back to step 3.

## Failure paths

- **Busy** (exit 75, `codex-run: computer use busy: ...`): another computer-use worker holds the desktop, possibly from another Claude session. No worker ran and nothing happened, so this attempt costs nothing. Tell the user, then remove the busy attempt's directory right away following Cleanup below. When they say the desktop is free, run the same brief again in a fresh task directory created following Cleanup rule 1 below.
- **Pipe unavailable**: the Codex desktop app isn't running. Ask the user to start it, wait for them to confirm, then pick the rerun. Keep this attempt's directory until the task ends: the choice below reads its report, and the follow-up may refer to it.
  - the report exists and marks no desktop action (launching an app, clicking, typing, pressing keys) done or uncertain → rerun the same brief in a fresh task directory created following Cleanup rule 1 below. This rerun doesn't use up the follow-up. Reading docs or taking screenshots doesn't count as a desktop action.
  - anything else, including a missing report → the rerun is the follow-up (step 7). If the follow-up is already used, stop and report as in step 6.
- **Other failures**: keep all the task's attempt directories while showing the user the tail of `<task-dir>/result.md.log` and asking whether to retry (as the follow-up, step 7) or have you do the task yourself. If the follow-up is already used, the only choices are stopping or you doing it. Once the user has chosen how to proceed (retry finished, you do it, or stop) and you no longer need them, copy any screenshot the user wants to a location outside `.scratch/codex/` first, then remove all the task's attempt directories following Cleanup below. A retry as the follow-up keeps the previous attempt's directory until the task ends. If the log shows `Computer Use was not approved to use <app>`, the `computer-user` bypass is turned off, likely by `"dangerouslyBypassApprovalsAndSandbox": false` in `~/.codex-delegate/roles.json`; say so, since a retry will fail the same way.

## Cleanup

1. Create `.scratch/codex/` first if it is missing; it may already exist, so that create need not be exclusive. Then create each task directory inside it with an exclusive create that fails if the directory already exists. On collision, retry with another name (for example, a later timestamp). An error because `.scratch/codex/` is missing is not a collision. Write files only after the task directory's creation succeeds.
2. Remove only the task directories you created for this task, each addressed by its exact path. Verify that each path is a direct child of `.scratch/codex/`.
3. Use your shell's recursive delete. Never use wildcards; never remove `.scratch/codex/` or `.scratch/` themselves.
4. If removal fails (for example, a locked file or permission error), leave the delegation's outcome unchanged and report the path left behind so the user can delete it by hand.
5. Keep a failed delegation's task directory until the user has chosen how to proceed and you no longer need it, then remove it. A retry that refers to it keeps it until the task ends.

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
