# 02: Install and use minimum delegation mode

Spec: `.scratch/delegation-mode/spec.md`

**What to build:** The first slice a user can actually use.
- `install --mode minimum` installs the Claude Code skills without `codex-implement` and `codex-computer-use`. Its `implement` and `implement-spec` come from the shared patches only, so the leader, and each `implement-spec` implementer subagent, builds tickets test-first with `tdd`. Research and review delegation stay exactly as in standard.
- The build emits a minimum overlay of the skills that differ from standard. The install manifest declares, per mode, which skills are excluded and which overlay applies.
- `--mode standard` and a fresh install without `--mode` install today's set.
- Every skill marker the installer writes records `mode`. A plain `install` keeps the scope's recorded mode. A marker without `mode` counts as `standard`.
- `--mode` accepts only `standard|minimum`, only on `install`, and only with Claude Code in the agent selection. Anything else is refused before any change.
- `list` shows the mode.
- `doctor`, including the run that follows every install, prints the mode of the user scope and, when present, the project scope. When every installed scope is minimum, it skips the `implementer` and `computer-user` model/effort checks, selected by role name, and the Computer Use plugin check.
- The English and Korean READMEs document `--mode` under Installation and say under Workflow that minimum doesn't use the implementer and computer use roles.

**Blocked by:** 01

**Status:** resolved

- [ ] A fresh `install --mode minimum`, run through the CLI with isolated homes, has no `codex-implement` or `codex-computer-use`, and no Claude Code skill this tool installed mentions either
- [ ] The installed minimum `implement` tells the leader to build with `tdd` at the agreed seams itself, to record the review base before starting, to check and commit each ticket, and to pass the review base to `code-review` as the fixed point
- [ ] The installed minimum `implement-spec` tells each implementer subagent to build with `tdd`, records the review base and passes it to `code-review`, and keeps the `codex-research` instruction for exploration
- [ ] In minimum, `grill-with-docs` still calls `codex-research`, `to-spec` and `to-tickets` still call `codex-plan-review`, and `code-review` still calls `codex-code-review`
- [ ] Markers record the mode; a plain reinstall keeps minimum and keeps standard; a pre-feature marker without `mode` is treated as standard
- [ ] A fresh `install` without `--mode` installs exactly today's standard skill set
- [ ] An invalid `--mode` value, `--mode` on `uninstall`/`list`/`doctor`, and `--mode` with `--agent codex` alone are refused with nothing changed and the accepted values listed
- [ ] `list` prints the mode
- [ ] `doctor` in minimum omits the `implementer` and `computer-user` role lines and the Computer Use plugin line, and still fails for an unsupported `researcher` or `critic` model or effort and for an unknown role override key; an `implementer` override stays valid
- [ ] `doctor` in standard, and with nothing installed, keeps every check
- [ ] The post-install `doctor` after a minimum install passes on an account that doesn't offer the implementer's model
- [ ] Rebuilding the skills leaves the generated trees, including the minimum overlay, with no diff
- [ ] README (English and Korean) updated
