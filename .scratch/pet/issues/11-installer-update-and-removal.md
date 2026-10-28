# 11: Installer: update and removal

**What to build:** Once enabled, the pet stays: a later user-scope `install` without options updates it in place, keeping the token, session records and settings ownership. Project-scope and Codex-only installs leave it untouched. `install --without-pet` and `uninstall` remove the bundle, the state and exactly the hook entries the installer added, from the settings file it recorded, even if `CLAUDE_CONFIG_DIR` has changed since. Replacing or removing the app never fights a running pet app or a hook relaunching it, and an interrupted run is completed by running the same command again.

**Blocked by:** 10

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Installer behaviour: scope/agent matrix, failure boundary, replacing or removing the app; Claude Code settings merge)

- [ ] The scope/agent matrix, every row, including implicit updates; `--without-pet` refused for project scope or without Claude Code.
- [ ] Update replaces only the bundle directory; state directory kept (marker updated); hook entries updated in place without duplicates.
- [ ] Removal deletes bundle, state and exactly the owned hook entries (dropping matcher groups or event keys only when empty) from the recorded settings file; a user hook mentioning the pet script path survives.
- [ ] Before replace or remove: "updating" flag set, running app asked to quit, force-stopped after a short timeout, flag cleared afterwards; a flag left by an interrupted run is cleared by the next install; concurrent installs serialized by a lock.
- [ ] Re-running after an apply failure (for example after the bundle swap but before the settings write) completes the change.
- [ ] Seam 1 tests: matrix; update preserves token, session records and ownership; removal after a `CLAUDE_CONFIG_DIR` change; settings changed between read and write not overwritten; app stub asked to quit and force-stopped when it doesn't; stale flag; concurrent install refused or serialized; rerun completes an interrupted apply.
- [ ] `npm test` passes.
