---
name: codex-plan-review
description: Adversarial review of a draft plan, spec, or ticket breakdown by Codex running GPT 6 Astra (read-only). Use after drafting a spec or tickets and before publishing them, or whenever a plan should be challenged before work starts.
---

Have the Codex review worker attack a draft before anyone builds on it. You stay the decision-maker: the worker's findings are input, not instructions.

## Process

1. Create a fresh task directory `.scratch/codex/<YYYYMMDD-HHMMSS>-plan-review-<slug>/` with an exclusive create that fails if it already exists. On collision, retry with another name (for example, a later timestamp). Save the draft there as `draft.md`, exactly as it would be published, only after creation succeeds.

2. Write `prompt.md` in the same directory using the template below. The worker runs at the repo root and can read the codebase, `GLOSSARY.md` and ADRs on its own, so point to them rather than pasting them.

3. Run the worker (Bash, `timeout: 600000`):

   ```
   node "${CLAUDE_SKILL_DIR}/scripts/codex-run.mjs" astra --prompt-file <task-dir>/prompt.md
   ```

   For a large draft, run it with `run_in_background: true` instead and wait for the notification. Don't publish anything until it has finished.

4. Triage every finding:
   - **Accept**: revise the draft.
   - **Reject**: note why in one line (wrong about the codebase, out of scope, already decided with the user).
   - **Needs the user**: the finding reopens a decision the user made, or the fix is a judgment call.

5. Show the user a short table: finding, severity, disposition. Ask about the "needs the user" ones and wait for answers before continuing.

6. Revise the draft to incorporate the user's answers. Ensure the revised draft lives outside the task directory (at its publish location or in the conversation), not only in `<task-dir>/draft.md`. Then remove the task directory following Cleanup below and return to the step of the calling skill that comes after the review.

If the run fails (non-zero exit, empty result), keep the task directory, show the user the tail of `<task-dir>/result.md.log` and ask whether to retry or continue without the review. Remove the directory following Cleanup below once the user has chosen and you no longer need it.

## Cleanup

1. Create each task directory fresh with an exclusive create that fails if it already exists. On collision, retry with another name (for example, a later timestamp). Write files only after creation succeeds.
2. Remove only the task directory created for this delegation, addressed by its exact path. Verify that the path is a direct child of `.scratch/codex/`.
3. Use your shell's recursive delete. Never use wildcards; never remove `.scratch/codex/` or `.scratch/` themselves.
4. If removal fails (for example, a locked file or permission error), leave the delegation's outcome unchanged and report the path left behind so the user can delete it by hand.
5. Keep a failed delegation's task directory until the user has chosen how to proceed and you no longer need it, then remove it. A retry that refers to it keeps it until the task ends.

<prompt-template>

# Adversarial review

Review the draft at `<task-dir>/draft.md`. It is a <spec | ticket breakdown | plan> for: <one-line summary>.

Read the codebase areas it touches, plus `GLOSSARY.md` and ADRs if they exist. Do not modify any files.

## Attack

- Assumptions that are unstated, unverified, or contradicted by the code.
- Failure modes, edge cases, and user stories that are missing.
- Scope: work that is missing, or work that doesn't belong.
- Test seams: too many, too low, or ones that won't actually exercise the behaviour.
- For ticket breakdowns: slices that are horizontal rather than vertical, tickets too large for one context window, and blocking edges that are wrong or missing.
- Conflicts with the glossary vocabulary or existing ADRs.
- A materially simpler design that meets the same goals.

Skip wording and formatting nits.

## Output

Return a Markdown list of findings, most severe first. For each: severity (blocker / major / minor), the problem, evidence (file paths or quotes from the draft), and a suggested change. End with a one-line verdict: ship as is, ship after fixes, or rethink.

</prompt-template>
