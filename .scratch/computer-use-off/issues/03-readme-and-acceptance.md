# 03: Document per-role computer use and verify it against real Codex

Spec: `.scratch/computer-use-off/spec.md`

**What to build:** Users can read which roles have computer use and confirm it is really off. The README and Korean README "Worker configuration" sections describe `computerUse`: only `computer-user` has it; opting another role in needs `exclusive` as well; roles without it also lose the browser and Chrome plugins' `node_repl` route. The residual shell risk is not documented (user's decision). Then the overrides are checked against a real Codex install on the user's machine (desktop app installed, both Computer Use plugins and `node_repl` enabled) and the results recorded in this ticket's Comments. Once accepted, the feature branch merges to `main` with a `fix(runner)` change, which publishes a Release.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Both READMEs describe `computerUse` as above; the package smoke test passes.
- [x] With the overrides the runner builds for `implementer`, `codex … plugin list --json` shows `computer-use@openai-bundled` and `unified-computer-use@openai-bundled` with `enabled: false`, and `codex … mcp list` shows no `cua_repl` and `node_repl` disabled.
- [x] A short `implementer` run, asked to list its skills and tools without calling any, reports no computer-use skill and no `node_repl` or `cua_repl` tool (supporting evidence only).
- [x] `codex-computer-use` on "open Notepad, type hello, don't save" still produces a matching `final.png`.
- [ ] Results recorded under Comments; the branch is merged to `main`.

## Comments

Manual acceptance on 2026-11-08, Windows 10 19045, codex-cli 0.167.0, Codex desktop app 26.1103, both Computer Use plugins and `node_repl` enabled in `config.toml`:

1. `codex` with the three overrides the runner builds: `plugin list --json` shows `computer-use@openai-bundled` and `unified-computer-use@openai-bundled` `enabled: false`; `mcp list` shows `node_repl` disabled and no `cua_repl`. Without the overrides both plugins are enabled and `cua_repl` is listed.
2. `implementer` through the integration branch's runner (after the review fixes): start-up line `computer-use=off`; the worker reports no `computer-use:computer-use` skill and no `node_repl` or `cua_repl` tool. Its visible MCP namespaces are only `mcp__codex_apps__*`. One run answered "computer-use skill: yes"; asked to quote it, it pointed at `cloud-environment:cloud-desktop` (managed Codex Cloud only, whose description mentions "computer-use tools"). Out of scope but noted: `spreadsheets:excel-live-control` stays visible; it acts on an open Excel workbook through the ChatGPT add-in, not through the screen.
3. `computer-user` through the integration branch's runner: start-up line `computer-use=on`. The first attempt launched Notepad through the plugin but window capture timed out (`FrameArrived timed out: timed out waiting on channel`), so nothing was typed. The follow-up reused that window, typed `hello`, saved a full-display `final.png` showing "*제목 없음 - Windows 메모장" with `hello` (Ln 1, Col 6), and closed it with "Don't save"; no Notepad process remained. The capture time-out is the known Windows 10 reliability issue, not a regression. Before this check a stale desktop lock from 2026-11-05 had to be removed by hand: its runner PID had been reused by an unrelated process, so the runner kept reporting busy.
