# Spec: Remove task directories once their result is consumed

Status: ready-for-agent

## Problem Statement

Every delegation from the **leader** to a **worker** creates a **task directory** under `.scratch/codex/` holding the brief, the worker's result and its event log (plus `draft.md`, `diff.patch`, `spec.md` or `final.png`, depending on the skill). Nothing ever removes them. After a day of grilling, spec writing, implementing and reviewing, `.scratch/codex/` fills up with dozens of directories that nobody reads again. They are temporary by nature: once the leader has taken what it needs from a result, the directory has no further use, yet it sits in the repo next to the issue tracker files under `.scratch/<feature>/`, which *are* meant to be kept.

## Solution

Each task directory is removed by the skill that last consumes its result, as soon as that result has been used. A failed delegation keeps its task directory so the user can read the log; it is removed once the user has decided what to do about the failure. The leader deletes the directory itself with its shell's recursive delete, following a short set of safety rules that limit it to exactly the one task directory it created. Issue tracker files under `.scratch/<feature>/` are never touched. The README explains that successful delegations leave nothing behind and that only failed ones remain, which the user may delete by hand.

## User Stories

1. As a user, I want `.scratch/codex/` to stay empty after successful delegations, so that the repo does not fill up with files nobody reads again.
2. As a user, I want the spec and ticket files under `.scratch/<feature>/` left alone, so that my issue tracker is never damaged by cleanup.
3. As a user, I want a failed delegation's task directory kept, so that I can read `result.md.log` and decide whether to retry.
4. As a user, I want a kept failed task directory removed once I have decided how to handle the failure, so that failures do not accumulate either.
5. As a leader running `codex-research`, I want to remove the task directory right after I have brought the needed facts into the conversation, so that the research result does not linger.
6. As a leader running `codex-research` on behalf of a caller that needs durable notes (such as the exploration subagent in `/implement-spec`), I want to copy what the caller needs into its own notes location before removing the task directory, so that no needed finding is lost.
7. As a leader running `codex-plan-review`, I want to remove the task directory once I have revised the draft from the review and the user has answered any "needs the user" findings, so that the review leaves nothing behind.
8. As a leader running `codex-plan-review`, I want the revised draft to exist outside the task directory (at its publish location or in the conversation) before I remove it, so that the calling skill can still publish it.
9. As a leader running `codex-implement`, I want to keep the ticket's task directories while follow-ups are still possible, so that I can show the user where the work is stuck if follow-ups don't converge.
10. As a leader running `codex-implement`, I want to remove every task directory created for the ticket (first run and follow-ups) once the ticket is verified and I return to the calling skill, so that a finished ticket leaves nothing behind.
11. As a leader running `codex-implement` whose follow-ups did not converge, I want to keep the ticket's task directories until the user decides, so that the user can inspect them.
12. As a leader running `/code-review`, I want `codex-code-review` to hand me the path of the task directory it created when it returns, so that I know which directory to remove.
13. As a leader running `/code-review`, I want to remove the Codex review's task directory after I have aggregated the findings, so that the review leaves nothing behind.
14. As a leader running `/code-review` whose Codex review failed, I want to keep the task directory and give its path and log tail in the final report, so that the user can inspect it and tell me to remove it (or remove it by hand).
15. As a leader running `codex-computer-use`, I want every attempt's task directory kept until the task ends, so that a follow-up can refer to the previous attempt's directory and screenshot.
16. As a leader running `codex-computer-use`, I want to remove all of the task's attempt directories once I have verified the result and reported to the user, so that screenshots do not pile up in the repo.
17. As a user who wants the screenshot of a computer-use task, I want the leader to copy it to a location outside `.scratch/codex/` before removal, so that I keep the evidence I asked for.
18. As a leader whose computer-use attempt came back busy (exit 75), I want to remove that attempt's task directory when I rerun in a new one, since no worker ran in it.
19. As a user, I want the leader to remove only the single task directory it created, by its exact path, so that a mistaken path can never delete my repo files.
20. As a user, I want the leader never to use wildcards and never to remove `.scratch/codex/` or `.scratch/` themselves, so that concurrent sessions' task directories and the issue tracker are safe.
21. As a user running several Claude sessions at once, I want each session to remove only its own task directories, so that a worker still running in another session keeps its files.
22. As a user running two sessions that start the same kind of delegation in the same second, I want each session to create a fresh task directory and pick another name if one already exists, so that two workers never share a directory.
23. As a user, I want a failed removal (a locked file, a permission error) not to turn a successful delegation into a failure, so that I get my result and just see which path is left to delete by hand.
24. As a user on Windows or on a POSIX shell, I want the leader to use whatever recursive delete fits its shell, so that the instructions work on either platform without a helper script.
25. As a user, I want the README (English and Korean) to describe the new behaviour, so that I know which files to expect in `.scratch/codex/` and that leftovers can be deleted by hand.
26. As a user, I want the README to keep recommending `.scratch/codex/` in `.gitignore`, so that kept failed task directories are never committed.
27. As a maintainer, I want the glossary to name the **task directory**, so that it is not confused with the issue tracker's `.scratch/<feature>/` directories.

## Implementation Decisions

- Scope of cleanup is `.scratch/codex/<task>/` only. `.scratch/<feature>/` (spec, issues, map) is the issue tracker and is out of reach of these rules.
- Task directories stay inside the repo (workers read their brief and attachments from the workspace); they are not moved to the OS temp directory.
- Ownership rule: a task directory is removed by the skill that last consumes its result. For every `codex-*` skill except `codex-code-review`, that is the skill itself. For `codex-code-review`, which starts its worker in the background and returns immediately, it is the calling `code-review` skill.
- Per-skill removal points:
  - `codex-research`: after the leader has brought the needed facts into the conversation. The existing instruction to "point to the file for the rest" is removed, since the file will not survive. A caller that needs durable notes copies them out before removal.
  - `codex-plan-review`: after the draft has been revised and the user has answered any "needs the user" findings, before returning to the calling skill. The task directory's `draft.md` is a copy for the worker; the revised draft must live outside the task directory (where the caller will publish it, or in the conversation) before removal.
  - `codex-implement`: on returning to the calling skill with the ticket verified, all of that ticket's task directories (first run and follow-ups) are removed.
  - `codex-code-review`: on returning, it gives the calling skill its task directory path. `code-review` removes that directory after aggregating. If the Codex review failed, `code-review` keeps the directory, puts its path and the log tail in the final report, and removes it only when the user says so; otherwise the user deletes it by hand.
  - `codex-computer-use`: all of the task's attempt directories are removed after verification succeeds and the user has been told; the success report no longer points the user at a screenshot path inside the task directory unless the leader copied the screenshot out at the user's request. A busy attempt's directory (no worker ran) is removed when the rerun is started.
- Failure handling: any failure path that currently shows the user the log tail (non-zero exit, empty result, non-converging follow-ups, a computer-use task that stops without meeting its criterion) keeps the task directories. They are removed once the user has chosen how to proceed (retry, do it yourself, continue without, or stop) and the leader no longer needs them. A retry that refers to a previous attempt's directory (as computer-use follow-ups do) keeps it until the task ends.
- Creating a task directory: create it with an exclusive create that fails if the directory already exists; on collision, retry with another name (for example, a later timestamp), and write files into it only after creation succeeds. A task directory is never shared between delegations.
- Deletion mechanism: no helper script and no runner change. The skill instructions say to remove the directory with the shell's own recursive delete, without prescribing a command. Safety rules, stated in each affected skill:
  1. Remove only the task directory created for this delegation, addressed by its exact path.
  2. That path must be a direct child of `.scratch/codex/`.
  3. Never use wildcards; never remove `.scratch/codex/` or `.scratch/` themselves.
- Failed removal: if the delete fails (a locked file, a permission error), the delegation's outcome is unchanged; the leader reports the path left behind so the user can delete it by hand.
- No check for a worker still running: consumers only remove after the completion notification, and the rules limit them to their own directory.
- No bulk cleanup command is added to the CLI. Leftovers (kept failures, sessions that died mid-task, directories from before this change) are deleted by hand, as the README says.
- Modules touched: the five leader skill sources (`codex-research`, `codex-plan-review`, `codex-implement`, `codex-code-review`, `codex-computer-use`), the `code-review` patch on top of upstream, the generated skills (regenerated by the build), the English and Korean READMEs, and the glossary (already updated with **Task directory**).
- No ADR: the decision is cheap to reverse.

## Testing Decisions

- These changes are instructions, not code. A good check exercises the behaviour a user sees (directories appear and disappear), not the wording of the instructions; no test asserts on SKILL.md text.
- Build seam (automated): the existing build regenerates `skills/` from upstream plus patches and sources. It must succeed with the revised `code-review` patch applying cleanly, the regenerated skills must contain the new instructions, and the existing test suite (`node --test`) must keep passing.
- Dogfood seam (manual): with the regenerated skills installed and a neighbouring task directory plus an issue file under `.scratch/<feature>/` in place (both must survive every scenario):
  - `codex-research` once successfully (task directory gone) and once with a forced failure (task directory kept, removed after the user decides);
  - `/to-spec` on a small feature (plan-review task directory gone, published spec present and revised);
  - `/code-review` once (Codex review's task directory gone after aggregation);
  - `codex-implement` on a ticket that needs one follow-up (both task directories kept until the ticket is verified, then both gone).
- Prior art: the existing runner tests exercise the runner as a black box; nothing here changes the runner, so they serve only as a regression check.

## Out of Scope

- Moving task directories out of the repo.
- A CLI command to bulk-delete `.scratch/codex/`.
- Detecting running workers before deletion.
- Cleaning up task directories that already exist.
- Any change to the issue tracker layout under `.scratch/<feature>/`.
- The Codex worker skills under `skills/codex/` (workers never create task directories).

## Further Notes

- The `research` skill used by the Codex worker cannot write files, so its notes only ever live in `result.md`; this is why a caller that needs durable notes must copy them out before removal.
- In `/implement-spec`, implementers work in their own worktrees; any task directory created inside a worktree also disappears with the worktree cleanup in that skill's last step, so the per-ticket rule and the worktree cleanup do not conflict.
