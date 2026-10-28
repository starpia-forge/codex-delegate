# 10: Installer: `install --with-pet` end to end

**What to build:** `install --with-pet` turns the pet on in one command: it downloads the pinned pet bundle, verifies its checksum, installs the bundle and state directories, registers the leader hooks in the user's Claude Code settings (with a backup), and reminds the user to restart Claude Code. Anything that can fail without side effects (options, download, checksum, unpacking, parsing settings) fails before any skill, pet file or setting changes. Explicit pet options that don't fit the scope, agent or platform are refused with nothing changed. `--dry-run` and `list` report pet actions and state.

**Blocked by:** 01, 03, 04

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Installer behaviour, Claude Code settings merge, Testing seam 1)

- [x] `--with-pet` and `--without-pet` parsed; contradictory together; `--with-pet` refused for project scope, for an agent selection without Claude Code, and off Windows (test-only platform override).
- [x] Pet pin (release tag, asset, SHA-256) shipped in the package's published files; download base URL overridable by environment variable; checksum mismatch refused.
- [x] Bundle unpacked to staging on the destination volume, then moved into place; state directory created with token and marker (bundle version, settings path, owned hook commands).
- [x] Settings: created if missing; unparseable file aborts; backup before writing; our hook entries added for the events 01 confirmed; written via temp file and rename after checking it hasn't changed since it was read.
- [x] Failure boundary: preflight failures leave skills, pet and settings unchanged; an apply failure reports exactly what was applied and where the backup is.
- [x] `--dry-run` reports every pet action and changes nothing; `list` shows pet state and version.
- [x] Seam 1 tests with a fake release server: fresh install; unrelated settings and user hooks survive; checksum mismatch, download failure and unparseable settings each change nothing; each refused combination changes nothing; dry-run; list.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass.
