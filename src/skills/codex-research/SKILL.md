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

2. Create a task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-research-<slug>/` and write `prompt.md` there using the template below.

3. Run the worker in the background (Bash with `run_in_background: true`):

   ```
   node "${CLAUDE_SKILL_DIR}/scripts/codex-run.mjs" luna --prompt-file <task-dir>/prompt.md
   ```

   Carry on with other work, or other branches of the conversation, until you are notified that it finished.

4. Read `<task-dir>/result.md`. Treat its findings as sourced claims, not settled truth: say which ones are well-supported and which are thin. Bring only the facts that matter for the current decision into the conversation, and point to the file for the rest.

If the run fails (non-zero exit, empty result), show the user the tail of `<task-dir>/result.md.log` and ask whether to retry or research it yourself.

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
