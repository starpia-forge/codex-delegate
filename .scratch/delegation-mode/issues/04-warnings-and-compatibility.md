# 04: Warn when minimum isn't what Claude Code will follow, and keep uninstall and the pet independent

Spec: `.scratch/delegation-mode/spec.md`

**What to build:** Users are told when heavy delegation is still reachable despite a minimum install, and the delegation mode stays independent of uninstall and the pet.
- **Mixed scopes.** Claude Code takes a personal skill over a project skill of the same name, so precedence is decided per skill and the result can be mixed. When a project install's mode differs from the user install's, `install --scope project` and `doctor` warn about it, but neither refuses. The warning says which scope's `implement` and `implement-spec` win, and lists the heavy-delegation skills (`codex-implement`, `codex-computer-use`) still reachable from either scope. This covers tool-owned skills too, unlike the existing shadowing check.
- **Unowned excluded skills.** In minimum, a `codex-implement` or `codex-computer-use` directory without this tool's marker is never removed or overwritten. `install` and `doctor` warn that it is present.
- **Uninstall** removes every skill this tool installed, whatever the mode, including an unresolved scope, and leaves unowned skills alone.
- **Pet.** Switching modes never changes **pet enabled** or the pet's own update behaviour.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] User minimum + project standard: `install --scope project` and `doctor` warn that the user's minimum `implement` and `implement-spec` win, and that the project's `codex-implement` and `codex-computer-use` are still reachable
- [ ] User standard + project minimum: `install --scope project` and `doctor` warn that the user's standard `implement` and `implement-spec` and its heavy-delegation skills win
- [ ] Neither mixed direction refuses the install
- [ ] An unowned `codex-implement` or `codex-computer-use` directory survives a minimum install byte-for-byte and is warned about by `install` and `doctor`
- [ ] `uninstall` of a minimum scope and of an unresolved scope removes every tool-owned skill and leaves unowned skills in place
- [ ] Switching modes with the pet enabled keeps the pet enabled and updates it as a plain install would; with the pet disabled it stays disabled; `--with-pet`/`--without-pet` combine with `--mode` as they do today
