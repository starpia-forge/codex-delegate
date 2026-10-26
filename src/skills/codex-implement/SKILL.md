---
name: codex-implement
description: Delegate building one ticket or a bounded slice of work to Codex running GPT 6.1 Sol (workspace-write), test-first. Use whenever code needs writing during /implement or /implement-spec, instead of editing the code yourself.
---

Have the Codex implementation worker write the code. Your job is to brief it, then verify what it did. You don't write the implementation yourself.

## Process

1. Create a fresh task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-implement-<slug>/` with an exclusive create that fails if it already exists. On collision, retry with another name (for example, a later timestamp). Write `prompt.md` there using the template below only after creation succeeds.
   - The worker's sandbox has no network, so it can't fetch issues: paste the ticket and the relevant parts of the spec, or point to local files.
   - Point to `GLOSSARY.md`, ADRs and `AGENTS.md` rather than pasting them.

2. Decide the working directory: the repo root, or the worktree you were given. Don't edit files in that directory while the worker runs.

3. Run the worker in the background (Bash with `run_in_background: true`) and wait for the notification:

   ```
   node "${CLAUDE_SKILL_DIR}/scripts/codex-run.mjs" sol --prompt-file <task-dir>/prompt.md --cwd <working-dir>
   ```

4. Verify the work yourself. Don't trust the report alone:
   - read the diff (`git diff`, plus `git status` for new files);
   - run typechecking and the relevant test files;
   - check each acceptance criterion against the diff.

5. If something is wrong or missing, keep earlier task directories and write a follow-up `prompt.md` in a new task directory created per Cleanup rule 1 below. Include the failing output and what still needs doing, then run it again. After two follow-ups that don't converge, stop, keep all of the ticket's task directories and show the user where it's stuck. Remove them following Cleanup below once the user has chosen and you no longer need them.

6. With the ticket verified, remove every task directory created for this ticket (first run and follow-ups) following Cleanup below, then return to the calling skill, which handles code review and committing. Do not remove them after each run.

If the run fails (non-zero exit, empty result), keep all of the ticket's task directories, show the user the tail of `<task-dir>/result.md.log` and ask whether to retry or implement it yourself. Remove them following Cleanup below once the user has chosen and you no longer need them.

## Cleanup

1. Create each task directory fresh with an exclusive create that fails if it already exists. On collision, retry with another name (for example, a later timestamp). Write files only after creation succeeds.
2. Remove only the task directory created for this delegation, addressed by its exact path. Verify that the path is a direct child of `.scratch/codex/`.
3. Use your shell's recursive delete. Never use wildcards; never remove `.scratch/codex/` or `.scratch/` themselves.
4. If removal fails (for example, a locked file or permission error), leave the delegation's outcome unchanged and report the path left behind so the user can delete it by hand.
5. Keep a failed delegation's task directory until the user has chosen how to proceed and you no longer need it, then remove it. A retry that refers to it keeps it until the task ends.

<prompt-template>

# Implement: <ticket title>

## What to build

<the ticket's "what to build", verbatim>

## Acceptance criteria

<the ticket's criteria, verbatim>

## Context

- Spec: <path, or the relevant sections pasted>
- Agreed test seams: <seams>
- Read first: `AGENTS.md`, `GLOSSARY.md`, and ADRs in the area you touch, if they exist.

## Instructions

- Use the `tdd` skill: red-green-refactor, one vertical slice at a time, at the agreed seams.
- Run typechecking and the relevant tests as you go, and make them pass.
- Stay within this ticket. Note anything out of scope instead of doing it.
- Do not commit, create branches, or otherwise change git state.

## Final message

Report: files changed, tests added, the commands you ran with their results, and anything unfinished or assumed.

</prompt-template>
