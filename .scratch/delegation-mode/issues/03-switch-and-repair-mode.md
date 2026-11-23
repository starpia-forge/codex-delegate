# 03: Switch and repair the recorded delegation mode

Spec: `.scratch/delegation-mode/spec.md`

**What to build:** Users can move between delegation modes safely, and a half-finished switch never silently picks a mode for them.
- `install --mode standard` on a minimum install adds back `codex-implement` and `codex-computer-use` and restores the standard `implement` and `implement-spec`. `install --mode minimum` on a standard install does the reverse.
- The plan output names the mode, and lists removals caused by the mode separately from skills that are no longer shipped. `--dry-run` shows the same plan and changes nothing.
- A Codex-only install (`--agent codex`) leaves the recorded mode alone.
- User and project scopes record their modes independently.
- When a scope's Claude Code markers disagree, or one records an unknown `mode` value, the scope's mode is unresolved:
  - a plain `install` is refused before any skill or marker changes, naming the modes found and asking for `--mode`;
  - an explicit `--mode` repairs it;
  - `doctor` fails for an unresolved scope with a message to reinstall with `--mode`, and counts it as standard for its other checks.
- The installer lock's existing recovery of interrupted pet state still runs and is not part of the refusal.

**Blocked by:** 02

**Status:** resolved

- [ ] Switching standard → minimum removes `codex-implement` and `codex-computer-use` and installs the minimum variants; minimum → standard restores them; the output labels the mode-caused removals
- [ ] `install --dry-run --mode minimum` on a standard install prints the mode and the planned additions and removals and changes nothing on disk
- [ ] A Codex-only install on a minimum scope leaves every Claude Code marker's mode unchanged
- [ ] Installing into the project scope with one mode leaves the user scope's recorded mode unchanged, and vice versa
- [ ] Disagreeing markers, or an unknown `mode` value, make a plain install refuse with every skill and marker unchanged; the same install with `--mode` succeeds and leaves all markers agreeing
- [ ] An unresolved scope that also has interrupted pet state gets the existing pet recovery, and its skills and markers stay unchanged
- [ ] `doctor` fails for an unresolved scope and keeps the standard role and Computer Use checks
