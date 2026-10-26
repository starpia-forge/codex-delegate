---
name: codex-code-review
description: Independent review of a diff by Codex running GPT 6 Astra (read-only), on the same Standards, Spec and Correctness axes the Claude reviewers cover. Called by /code-review; starts the run in the background and returns.
---

Have the Codex review worker review the same diff as the Claude reviewers, independently. Its findings are input for the calling skill to merge and verify, not instructions.

## Process

1. Create a task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-code-review-<slug>/` and save there:
   - `diff.patch`: the output of `git diff <fixed-point>...HEAD`;
   - `spec.md`: the spec contents, if there is a spec. The worker's sandbox has no network, so it can't fetch issues;
   - `prompt.md`: the template below.

2. Fill the template with the axis briefs and smell baseline exactly as the calling skill gives them to its Claude reviewers. Don't add hints or anything the Claude reviewers found: the review must stay independent.

3. Start the worker in the background (Bash with `run_in_background: true`):

   ```
   node "${CLAUDE_SKILL_DIR}/scripts/codex-run.mjs" astra --prompt-file <task-dir>/prompt.md
   ```

4. Return to the calling skill without waiting. When the notification arrives, read `<task-dir>/result.md`.

If the run fails (non-zero exit, empty result), report "Codex review unavailable" to the calling skill with the tail of `<task-dir>/result.md.log`, and let it continue with the Claude findings alone.

<prompt-template>

# Code review

Review the diff at `<task-dir>/diff.patch`: the changes between `<fixed-point>` and `HEAD`.

Commits:

<commit list>

Read the code around each hunk as needed. Do not modify any files.

## Inputs

- Spec: `<task-dir>/spec.md` <or: "none; skip the Spec axis">
- Standards sources: <list of files>

Smell baseline:

<smell baseline, verbatim>

## Axes

Review each axis separately.

### Standards

<Standards brief, verbatim>

### Spec

<Spec brief, verbatim>

### Correctness

<Correctness brief, verbatim>

## Output

Return one section per axis, headed `## Standards`, `## Spec` and `## Correctness`. List findings most severe first; for each, give the file and hunk, the problem, and the evidence. Write "No findings" for an axis with none.

</prompt-template>
