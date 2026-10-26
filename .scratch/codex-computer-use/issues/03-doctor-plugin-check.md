# 03: `doctor` warns when the Computer Use plugin is off

Spec: `.scratch/codex-computer-use/spec.md`

**What to build:** `doctor` reads `config.toml` in the Codex home (respecting `CODEX_HOME`) and reports OK when the `computer-use@openai-bundled` plugin is enabled, and WARN when it is disabled, its section is absent, or the file is missing. This check never fails `doctor`, so users who don't use computer use still get a clean result. No dependency is added. The README's (English and Korean) description of what `doctor` checks mentions the new check.

**Blocked by:** 01

**Status:** resolved

- [x] Tests isolate `CODEX_HOME`, `CLAUDE_CONFIG_DIR` and the home directory, provide a fake `codex` (version, logged-in status) and a models-cache fixture covering every role, and cover: plugin enabled, disabled, section absent, file missing.
- [x] Each case prints the expected OK or WARN line for the computer-use check and exits 0.
- [x] The `astra-cu` role line appears in `doctor` output.
- [x] Both READMEs' "What `doctor` checks" lists the computer-use plugin check.
- [x] `npm test` passes on Windows.

## Comments

Resolved on branch `feat/codex-computer-use` (review base 973b340). Manual acceptance (ticket 04) passed on 2026-10-26: Notepad task, app-closed rerun, app killed mid-task treated as the follow-up.
