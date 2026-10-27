---
name: codex-research
description: Delegate external research (library or API behaviour, standards, versions, prior art) to Codex running GPT 6 Luna with live web search. Use instead of WebSearch/WebFetch whenever a question needs facts from outside the repo.
---

Hand an external research question to the Codex research worker. Don't run the same search yourself while it works.

## Process

1. Frame the question. Write down:
   - the question, in one or two sentences;
   - the decision it informs, so the worker knows what "enough" looks like;
   - constraints: versions, platforms, languages, anything already ruled out;
   - what is already known, so the worker doesn't re-derive it.

2. Create a fresh task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-research-<slug>/` following Cleanup rule 1 below, then write `prompt.md` there using the template below.

3. Run the worker in the background (Bash with `run_in_background: true`):

   ```
   node "${CLAUDE_SKILL_DIR}/scripts/codex-run.mjs" researcher --prompt-file <task-dir>/prompt.md
   ```

   Carry on with other work, or other branches of the conversation, until you are notified that it finished.

4. Read `<task-dir>/result.md`. Treat its findings as sourced claims, not settled truth: say which ones are well-supported and which are thin. Bring the facts needed for the current decision into the conversation, then remove the task directory following Cleanup below. If the caller needs durable notes (for example, an exploration subagent), copy what it needs to its own notes location before removal.

If the run fails (non-zero exit, empty result), keep the task directory, show the user the tail of `<task-dir>/result.md.log` and ask whether to retry or research it yourself. Remove the directory following Cleanup below once the user has chosen and you no longer need it.

## Cleanup

1. Create `.scratch/codex/` first if it is missing; it may already exist, so that create need not be exclusive. Then create each task directory inside it with an exclusive create that fails if the directory already exists. On collision, retry with another name (for example, a later timestamp). An error because `.scratch/codex/` is missing is not a collision. Write files only after the task directory's creation succeeds.
2. Remove only the task directories you created for this task, each addressed by its exact path. Verify that each path is a direct child of `.scratch/codex/`.
3. Use your shell's recursive delete. Never use wildcards; never remove `.scratch/codex/` or `.scratch/` themselves.
4. If removal fails (for example, a locked file or permission error), leave the delegation's outcome unchanged and report the path left behind so the user can delete it by hand.
5. Keep a failed delegation's task directory until the user has chosen how to proceed and you no longer need it, then remove it. A retry that refers to it keeps it until the task ends.

<prompt-template>

# Research question

<the question>

## Why it matters

<the decision this informs>

## Constraints

<versions, platforms, exclusions>

## Already known

<what we already know>

## Instructions

Use the `research` skill if you have it. Prefer primary sources (official docs, specs, source code, release notes) over blog posts. You cannot write files: return the full notes as your final message, in Markdown, with:

1. a short answer first;
2. findings, each with its source URL;
3. open questions and anything you could not verify.

</prompt-template>
