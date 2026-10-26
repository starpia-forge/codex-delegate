# 04: Leader skill `codex-computer-use` and docs

Spec: `.scratch/codex-computer-use/spec.md`

**What to build:** The leader can delegate desktop-app work to a Codex worker. A new leader skill `codex-computer-use`, shaped like the other `codex-*` skills, with the description from the spec, the full process (confirm self-initiated irreversible actions; a new task directory per attempt; the "don't touch the PC" notice; run `astra-cu` with `--cwd` set to the task directory, in the background; require this attempt's `final.png` and `result.md`; verify the screenshot against the completion criterion; at most one follow-up that first confirms uncertain steps by observation only; busy handling; pipe-unavailable handling, where a missing report or any done/uncertain step makes the rerun the follow-up; other failures) and the brief template (goal and why; target app and starting state; completion criterion; instructions to use `computer-use:computer-use` and save `final.png`; final message with each step marked done / not done / uncertain). The skill is built into the Claude skill set with the runner bundled. Both READMEs (English and Korean) gain: the `astra-cu` row in "Worker configuration", computer use in Astra's "Who does what" row, the updated skill count, the prerequisites (Codex desktop app installed and running, Computer Use plugin enabled), why `astra-cu` runs without a sandbox and what that allows, the one-worker lock and its residual risk after a hard kill, and the Windows 10 reliability caveat.

**Blocked by:** 01, 02

**Status:** resolved

- [x] The skill exists in the authored skills and in the build output with the runner bundled; `install --dry-run` lists it.
- [x] The skill text covers every process step, failure path and brief-template section listed above.
- [x] Both READMEs updated as listed.
- [x] Leader walkthrough with representative artifacts gives the right next step for: a report with done and uncertain steps that misses the criterion; a missing report; a missing `final.png`; a follow-up that still misses (stop and report); a busy exit.
- [x] Manual acceptance with the user: the Notepad "type hello, don't save" task succeeds with a verified `final.png`; with the Codex desktop app closed, the pipe-unavailable path is followed and the rerun is free; with the app closed partway through a task, the rerun is treated as the follow-up.

## Comments

Resolved on branch `feat/codex-computer-use` (review base 973b340). Manual acceptance (ticket 04) passed on 2026-10-26: Notepad task, app-closed rerun, app killed mid-task treated as the follow-up.
