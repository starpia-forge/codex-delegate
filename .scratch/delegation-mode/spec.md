# Spec: Delegation mode (standard and minimum)

Status: ready-for-agent

## Problem Statement

codex-delegate installs one fixed setup: the **leader** hands every kind of work to a Codex **worker**. Implementation goes to the `implementer` **role** (GPT 6.1 Sol) and computer use to the `computer-user` role (GPT 6 Astra). Those two are the heaviest delegations. They burn the most Codex tokens, and some users would rather have Claude write the code and drive the desktop itself. They still want the cheap, high-value delegations: web research (`researcher`) and adversarial plan and code review (`critic`).

Today the only way to get that is to hand-delete the `codex-implement` and `codex-computer-use` skills. That leaves the patched `implement` and `implement-spec` skills telling the leader to call a skill that no longer exists. The next `install` puts everything back, and `doctor` keeps checking models and the Computer Use plugin for roles the user never runs.

## Solution

Installation gains a **delegation mode**, chosen with `--mode standard|minimum`:

- `standard` is today's behaviour: the leader delegates to every role.
- `minimum` delegates only research and review. The leader implements tickets itself, test-first with `tdd`, and does computer use with Claude's own tools. `codex-implement` and `codex-computer-use` are not installed. The installed `implement` and `implement-spec` skills are a minimum variant that never mentions them. They keep everything else the standard patches add: recording the review base, passing it to `code-review` as the fixed point, and sending external documentation lookups to `codex-research`.

The installation remembers the delegation mode. A plain `install` (an update) keeps it, and only an explicit `--mode` changes it. Switching modes adds or removes the affected skills. `list` and `doctor` show the mode. In `minimum`, `doctor` stops checking things only the `implementer` and `computer-user` roles need.

## User Stories

1. As a user who wants to save Codex tokens, I want to install with `--mode minimum`, so that implementation and computer use never start a Codex worker.
2. As a user who prefers Claude to write code, I want `/implement` in minimum mode to have Claude build the ticket test-first itself, so that I get the upstream implementation discipline without delegation.
3. As a user in minimum mode, I want `/implement-spec`'s implementer subagents to build tickets themselves with `tdd`, so that the parallel ticket workflow still works without Codex.
4. As a user in minimum mode, I want `/implement` and `/implement-spec` to keep recording the review base and passing it to `code-review`, so that the review still covers exactly the new work.
5. As a user in minimum mode, I want the exploration subagent in `/implement-spec` to keep using `codex-research` for external documentation, so that research stays delegated.
6. As a user in minimum mode, I want `/grill-with-docs` to keep calling `codex-research`, so that outside facts still come from the researcher.
7. As a user in minimum mode, I want `/to-spec` and `/to-tickets` to keep calling `codex-plan-review`, so that plans are still challenged by the critic.
8. As a user in minimum mode, I want `/code-review` to keep running its Codex reviewer alongside Claude, so that review still gets two independent models.
9. As a user in minimum mode, I want the `codex-computer-use` skill to be absent, so that Claude uses its own computer-use tools when a desktop app needs driving.
10. As a user in minimum mode, I want no Claude Code skill this tool installed to mention `codex-implement` or `codex-computer-use`, so that the leader is never told to call a skill that isn't there.
11. As a new user, I want a plain `install` to set up standard mode, so that the default stays the full delegation workflow.
12. As an existing user upgrading from a version without delegation modes, I want a plain `install` to treat my setup as standard, so that nothing changes under me.
13. As a user in minimum mode, I want a plain `install` (update) to keep minimum mode, so that updating never silently re-enables heavy delegation.
14. As a user in standard mode, I want a plain `install` to keep standard mode, so that updating never silently drops delegation.
15. As a user, I want `install --mode standard` on a minimum install to add `codex-implement` and `codex-computer-use` and restore the standard `implement` and `implement-spec`, so that switching back is one command.
16. As a user, I want `install --mode minimum` on a standard install to remove `codex-implement` and `codex-computer-use` and install the minimum variants, so that switching down is one command.
17. As a user switching modes, I want the install output to say which skills are added and removed because of the mode, so that I can see what the switch did.
18. As a user, I want `install --dry-run --mode minimum` to show the mode and the skills it would add and remove without changing anything, so that I can preview a switch.
19. As a user, I want an invalid `--mode` value rejected with the accepted values, so that a typo never installs something unexpected.
20. As a user, I want `--mode` rejected for `uninstall`, `list` and `doctor`, so that the option only appears where it means something.
21. As a user, I want `--mode` rejected when the agent selection excludes Claude Code, so that I'm not misled into thinking a Codex-only install changed the mode.
22. As a user, I want a Codex-only install (`--agent codex`) to leave the recorded delegation mode alone, so that partial installs never flip it.
23. As a user with both a user-scope and a project-scope install, I want each scope to record its own delegation mode, so that installing into one scope never rewrites the other.
24. As a user whose project-scope mode differs from my user-scope mode, I want `install --scope project` and `doctor` to warn me that my user-scope skills take precedence, to say which variant of `implement` and `implement-spec` wins, and to list any heavy-delegation skills still reachable from the other scope, so that I'm not misled into thinking the project runs in its own mode.
25. As a user whose install was interrupted and left skills recording different modes, I want a plain `install` to refuse and ask me to pass `--mode`, so that a half-finished switch never silently picks a mode for me.
26. As a user in minimum mode who has a `codex-implement` or `codex-computer-use` directory that this tool didn't install, I want `install` and `doctor` to warn that it is still present, while leaving it untouched, so that I know heavy delegation can still be reached.
27. As a user, I want `list` to show the delegation mode of the scope it lists, so that I can tell which setup I have.
28. As a user, I want `doctor` to show the delegation mode of each installed scope, so that its other findings make sense.
29. As a user in minimum mode, I want `doctor` to skip the model and effort checks for the `implementer` and `computer-user` roles, so that roles I never run don't produce WARN or FAIL lines.
30. As a user in minimum mode, I want `doctor` to skip the Computer Use plugin check, so that I'm not told to enable something minimum mode never uses.
31. As a user with any installed scope in standard mode, I want `doctor` to keep every role and Computer Use check, so that a standard install is fully checked.
32. As a user in minimum mode, I want my `~/.codex-delegate/roles.json` overrides for `implementer` and `computer-user` to stay valid, so that switching modes never breaks my override file.
33. As a user, I want `uninstall` to remove every skill this tool installed whatever the mode, so that uninstalling needs no mode knowledge.
34. As a user with the pet enabled, I want the delegation mode to leave the pet alone, so that the two installation choices stay independent.
35. As a user reading the README (English or Korean), I want `--mode` documented under Installation, with a note in Workflow that minimum skips the implementer and computer use roles, so that I can choose a mode before installing.
36. As a maintainer, I want the minimum variants of `implement` and `implement-spec` produced by the skills build from upstream plus patches, so that they follow upstream updates like every other skill.
37. As a maintainer, I want every change both modes need kept in one shared patch, with only the delegation-specific changes in per-mode patches, so that a change to shared behaviour is made once.
38. As a maintainer, I want the build to fail if a mode-specific patch no longer applies, leaving the generated skills untouched, so that the minimum variant never silently drifts from the standard one.

## Implementation Decisions

- **Glossary.** The term is **Delegation mode**, already added to `GLOSSARY.md`. Its values are `standard` and `minimum`. The CLI option is `--mode`.
- **Mode definition.** Each mode is defined by what the Claude Code agent installs. `standard` is the full Claude Code skill set as today. `minimum` is the same set minus the `codex-implement` and `codex-computer-use` skills, with the minimum variants of `implement` and `implement-spec` in place of the standard ones. The Codex agent's skills (`tdd`, `codebase-design`, `research`) are identical in both modes.
- **Install manifest.** The install manifest gains a per-mode description for the Claude Code agent. It lists the skills a mode excludes and an overlay of mode-specific skill directories that replace same-named skills. The installer resolves the skill list for the chosen mode from it. Adding a mode later means adding a manifest entry, not new installer logic.
- **Build.**
  - Today's `implement` and `implement-spec` patches are split. The shared patches hold what both modes need: recording the review base, passing it to `code-review` as the fixed point, running checks and committing per ticket, and sending external documentation to `codex-research`. A standard-only patch per skill layers the `codex-implement` delegation on top.
  - Shared patches stay where patches live today. Per-mode patches live in one sub-directory per mode. Minimum needs no patch of its own at first; its sub-directory exists only when minimum behaviour has to differ from the shared patches.
  - The build applies the shared patches plus the standard patches to produce the full Claude Code tree, as today. It then applies the shared patches plus any minimum patches on a clean upstream checkout. It copies every skill whose result differs from the standard tree into a separate minimum overlay tree, which in practice is `implement` and `implement-spec`.
  - Every patch set must apply, or the build exits and the generated skills are left unchanged, as today.
  - In minimum, `implement` keeps the review-base recording, the per-ticket checks and commits, and the `code-review` fixed-point step, and calls `tdd` at the pre-agreed seams instead of delegating.
  - In minimum, `implement-spec` keeps the review base and the `codex-research` instruction, and its implementer subagents call `tdd`, as upstream does.
- **Recorded mode.**
  - Every Claude Code skill marker the installer writes gains a `mode` field holding the delegation mode of that install. Codex skill markers do not record a delegation mode.
  - The installer reads the current mode of a scope from the Claude Code skill markers in that scope.
  - A marker without `mode` (an install from before this feature) counts as `standard`.
  - A marker whose `mode` is not a known value, or Claude Code markers in one scope that disagree (for example after an interrupted install), make the scope's mode **unresolved**.
- **Mode resolution on install.**
  - An explicit `--mode` wins, and it also repairs an unresolved scope.
  - If the scope's mode is unresolved and no `--mode` is given, the install is refused before any skill or marker changes. The message names the modes found and asks for `--mode`. The installer lock already recovers interrupted pet state before any install logic runs, and that recovery still happens. It is not part of this refusal.
  - Otherwise the scope's recorded mode is kept.
  - Otherwise (a fresh install) the mode is `standard`.
  - The mode applies only when Claude Code is in the agent selection. A Codex-only install neither needs nor changes it.
- **Switching modes.** Switching reuses the existing plan-then-apply install flow. Skills the new mode doesn't install are removed the way stale skills are removed today. Overlay skills replace their standard counterparts in the same step. The plan output names the mode and labels removals caused by the mode separately from skills that are no longer shipped. `--dry-run` prints the plan, including the mode, and changes nothing.
- **Excluded skills the tool doesn't own.** In minimum, a `codex-implement` or `codex-computer-use` directory without this tool's marker is never removed or overwritten. `install` and `doctor` warn that it is present and that the leader can still reach that delegation through it.
- **Mixed scopes.** Claude Code takes a personal skill over a project skill of the same name, so precedence is decided per skill and the result can be mixed. For example, with user minimum and project standard, the user's minimum `implement` wins. The project's `codex-implement` and `codex-computer-use` are still reachable, because the user scope has nothing to shadow them. When a project install's mode differs from the user install's mode, `install --scope project` and `doctor` warn about it. The warning says which scope's `implement` and `implement-spec` win, and lists the heavy-delegation skills still reachable from either scope. Neither refuses the install. This check covers tool-owned skills too, unlike the existing shadowing check, which only looks at personal skills this tool didn't install.
- **Option validation.** `--mode` accepts only `standard` or `minimum`, and only on `install`. It is refused when Claude Code is not in the agent selection, in the same style as the pet option checks. Errors list the accepted values.
- **list.** `list` prints the delegation mode for the Claude Code agent of the scope being listed. It prints nothing when nothing is installed there.
- **doctor.**
  - `doctor` prints the delegation mode of the user scope and, when the current directory has a project install, of the project scope.
  - When at least one installed scope is `standard`, or nothing is installed, every check stays as today.
  - When every installed scope is `minimum`, `doctor` skips the model and effort checks for `implementer` and `computer-user` and skips the Computer Use plugin check. The skip is decided by role name, never by model, because `critic` and `computer-user` share a model.
  - An unresolved scope counts as `standard` for these checks, and `doctor` reports it as a failure telling the user to reinstall with `--mode`.
  - Role override validation still covers every role, so an `implementer` override is never "unknown".
- **Runner and roles.** The runner, its role table and the user's role overrides do not change. In minimum mode no installed skill starts the `implementer` or `computer-user` roles, so nothing needs blocking.
- **Pet.** The pet is unaffected. Delegation mode and **pet enabled** are independent installation choices.
- **Docs.** The English and Korean READMEs document `--mode` under Installation and add a line under Workflow saying that minimum mode doesn't use the implementer and computer use roles. No ADR is written.

## Testing Decisions

- **Good tests** drive the CLI as a child process with isolated Claude Code and Codex homes and a fake `codex` on `PATH`. They assert only what a user can observe: which skill directories exist, what installed `SKILL.md` files say, what markers record, and what `install`, `list` and `doctor` print, with their exit codes. They don't call installer internals.
- **Seams:** install tests drive the CLI process and check the content of the committed generated skills through what `install --mode minimum` puts on disk. The build also has a network-free child-process test against a local fake upstream, verifying that patch failures preserve the generated skills and upstream pin. Build reproducibility is checked when implementing by rebuilding and confirming the generated tree has no diff.
- **Install tests cover:**
  - minimum installs without `codex-implement` and `codex-computer-use`;
  - no installed Claude Code skill mentions them in minimum;
  - the minimum `implement` and `implement-spec` still mention the review base, `code-review` and (`implement-spec`) `codex-research`, and call `tdd`;
  - markers record the mode;
  - plain reinstall keeps minimum and keeps standard;
  - a fresh install is standard;
  - a pre-feature marker without `mode` is treated as standard;
  - switching both ways adds and removes the right skills;
  - `--dry-run` changes nothing;
  - a Codex-only install keeps the recorded mode;
  - user and project scopes keep separate recorded modes, and a project install whose mode differs from the user install's warns;
  - markers that disagree, or an unknown `mode` value, make a plain install refuse with nothing changed, and an explicit `--mode` repairs it;
  - an unowned `codex-implement` or `codex-computer-use` directory survives a minimum install untouched and is warned about;
  - invalid values and misplaced `--mode` are refused with nothing changed.
- **list and doctor tests cover:**
  - `list` shows the mode;
  - `doctor` in minimum skips the `implementer` and `computer-user` role lines and the Computer Use plugin line;
  - `doctor` in minimum still fails for an unsupported `researcher` or `critic` model or effort, and for an unknown role override key (ADR 0001);
  - `doctor` in standard, with mixed scopes, and with nothing installed keeps every check;
  - `doctor` warns about mixed-scope modes and unowned excluded skills, and fails for an unresolved scope;
  - an `implementer` override stays valid in minimum.
- **Prior art:** `test/doctor.test.mjs` (CLI `doctor` against a fake codex and model cache), `test/install-pet.test.mjs` (CLI `install` with isolated homes and option refusals), `test/helpers/fake-codex.mjs`.

## Out of Scope

- Modes other than `standard` and `minimum`, and per-role toggles on the command line.
- Changing which skills the Codex agent receives per mode.
- Blocking the `implementer` or `computer-user` roles in the runner.
- Any change to the pet, its hooks or which pets exist.
- Changing the shared workflow patches (`grill-with-docs`, `to-spec`, `to-tickets`, `code-review`).
- An ADR for this decision.
- Making a project-scope mode take effect over a different user-scope mode. Claude Code's precedence decides that; this spec only warns about it.
- Build tests that require network access to the real upstream. The network-free local fake-upstream tests for patch-failure preservation are in scope; generated output reproducibility is checked by rebuilding with no diff.

## Further Notes

- The motivation is cost and the preference for Claude to implement and drive the desktop itself. Model availability is not the motivation.
- Today's `implement` and `implement-spec` patches mix delegation with steps both modes need (review base, `codex-research`). That is why those patches are split into shared and standard-only parts, rather than minimum falling back to upstream's unpatched skills.
