---
name: codex-implement
description: Delegate building one ticket or a bounded slice of work to Codex running GPT 6.1 Sol (workspace-write), test-first. Use whenever code needs writing during /implement or /implement-spec, instead of editing the code yourself.
---

Have the Codex implementation worker write the code. Your job is to brief it, then verify what it did. You don't write the implementation yourself.

## Process

1. Create a task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-implement-<slug>/` and write `prompt.md` there using the template below.
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

5. If something is wrong or missing, write a follow-up `prompt.md` in a new task directory. Include the failing output and what still needs doing, then run it again. After two follow-ups that don't converge, stop and show the user where it's stuck.

6. Return to the calling skill, which handles code review and committing.

If the run fails (non-zero exit, empty result), show the user the tail of `<task-dir>/result.md.log` and ask whether to retry or implement it yourself.

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
