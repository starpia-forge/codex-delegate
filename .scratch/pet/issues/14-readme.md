# 14: README for the pet

**What to build:** The English and Korean READMEs explain the pet: what it shows, how to turn it on (`--with-pet`) and off (`--without-pet`, `uninstall`), that it stays on across updates, its requirements (Windows, WebView2, user scope), exactly what it changes on the machine (downloaded bundle, Claude Code settings hooks with a backup), restarting Claude Code, configuration and custom or Codex pets, and what `doctor` checks.

**Blocked by:** 11

**Status:** resolved

Spec: `.scratch/pet/spec.md`

- [x] English README section and matching Korean section.
- [x] Commands, requirements and changed files match the implemented behaviour.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass.
