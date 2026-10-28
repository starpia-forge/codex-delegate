# 07: Pet configuration and artwork resolution

**What to build:** The user can assign a pet to the leader and to each role, and set the pet size, in the optional pet configuration file. A pet name is found in the codex-delegate pets folder, then the Codex pets folder, then the bundled defaults, so pets the user already has for Codex just work. A package that doesn't match the Codex pet format falls back to the bundled default for that slot.

**Blocked by:** 02

**Status:** resolved

Spec: `.scratch/pet/spec.md` (Pet configuration and artwork)

- [x] Configuration: `scale` (0.3 to 1.0, default 0.6) and `pets` (leader and each role name to a pet name); unknown keys and out-of-range values ignored.
- [x] Resolution order: codex-delegate pets folder, `$CODEX_HOME` pets folder (default `~/.codex`), bundled defaults.
- [x] Codex pet contract v1 validation: manifest fields, sheet format, 1536 × 1872 size; failing packages fall back per slot.
- [x] The app renders the resolved pets at the configured scale.
- [x] Tests (plain Node, isolated home and `CODEX_HOME`) for resolution order, override precedence, each validation failure and its fallback, and scale bounds, through the module that resolves pets.
- [x] `npm test` passes.

## Comments

- 2026-10-29: Implemented on the integration branch `feat/pet` (review fixes merged at bba2cbf); `npm test` 333/333 and the Rust build and tests pass.
