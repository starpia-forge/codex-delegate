# 03: Document per-role computer use and verify it against real Codex

Spec: `.scratch/computer-use-off/spec.md`

**What to build:** Users can read which roles have computer use and confirm it is really off. The README and Korean README "Worker configuration" sections describe `computerUse`: only `computer-user` has it; opting another role in needs `exclusive` as well; roles without it also lose the browser and Chrome plugins' `node_repl` route. The residual shell risk is not documented (user's decision). Then the overrides are checked against a real Codex install on the user's machine (desktop app installed, both Computer Use plugins and `node_repl` enabled) and the results recorded in this ticket's Comments. Once accepted, the feature branch merges to `main` with a `fix(runner)` change, which publishes a Release.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Both READMEs describe `computerUse` as above; the package smoke test passes.
- [ ] With the overrides the runner builds for `implementer`, `codex … plugin list --json` shows `computer-use@openai-bundled` and `unified-computer-use@openai-bundled` with `enabled: false`, and `codex … mcp list` shows no `cua_repl` and `node_repl` disabled.
- [ ] A short `implementer` run, asked to list its skills and tools without calling any, reports no computer-use skill and no `node_repl` or `cua_repl` tool (supporting evidence only).
- [ ] `codex-computer-use` on "open Notepad, type hello, don't save" still produces a matching `final.png`.
- [ ] Results recorded under Comments; the branch is merged to `main`.
