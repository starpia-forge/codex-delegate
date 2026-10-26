# 03: `doctor` warns when the Computer Use plugin is off

Spec: `.scratch/codex-computer-use/spec.md`

**What to build:** `doctor` reads `config.toml` in the Codex home (respecting `CODEX_HOME`) and reports OK when the `computer-use@openai-bundled` plugin is enabled, and WARN when it is disabled, its section is absent, or the file is missing. This check never fails `doctor`, so users who don't use computer use still get a clean result. No dependency is added. The README's (English and Korean) description of what `doctor` checks mentions the new check.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Tests isolate `CODEX_HOME`, `CLAUDE_CONFIG_DIR` and the home directory, provide a fake `codex` (version, logged-in status) and a models-cache fixture covering every role, and cover: plugin enabled, disabled, section absent, file missing.
- [ ] Each case prints the expected OK or WARN line for the computer-use check and exits 0.
- [ ] The `astra-cu` role line appears in `doctor` output.
- [ ] Both READMEs' "What `doctor` checks" lists the computer-use plugin check.
- [ ] `npm test` passes on Windows.
