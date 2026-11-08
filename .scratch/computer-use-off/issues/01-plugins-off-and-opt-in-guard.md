# 01: Roles without computer use start Codex with the Computer Use plugins off

Spec: `.scratch/computer-use-off/spec.md`

**What to build:** Computer use becomes a per-role capability, off unless the role turns it on. A new role field `computerUse` is `false` in the runner's defaults and `true` in the shipped roles only for `computer-user`. For a role with it false, the runner hands Codex `-c plugins.computer-use@openai-bundled.enabled=false` and `-c plugins.unified-computer-use@openai-bundled.enabled=false`, written without quotes (the quoted spelling is silently ignored by Codex). For a role with it true, nothing is added. The start-up line ends with `computer-use=on` or `computer-use=off`. Users decide it per role in `~/.codex-delegate/roles.json` like any other field, but an opt-in that isn't a JSON boolean, or that turns computer use on for a role that isn't `exclusive`, is refused before anything happens: no lock, no Codex call, no log. The runner never makes a role exclusive by itself (ADR 0004 keeps `implementer` parallel). The generated skill copies of the runner are regenerated.

Work on a feature branch; it merges to `main` only after ticket 03's acceptance, because a push to `main` publishes a Release and this ticket alone leaves `node_repl` open.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `implementer`, `critic` and `researcher` pass both plugin overrides, each as one unquoted argument, and print `computer-use=off`.
- [x] `computer-user` passes no `plugins.` override and prints `computer-use=on`.
- [x] A user override `"computerUse": false` for `computer-user` brings both overrides back.
- [x] A user override `"computerUse": true` with `"exclusive": true` for `implementer` passes no overrides and takes the desktop lock.
- [x] `"computerUse": true` for `implementer` without `"exclusive": true` fails before Codex is invoked, with a message saying both must be set.
- [x] `"computerUse"` set to `"false"`, `null` or `1` fails before Codex is invoked, with no log file, naming the role and the value.
- [x] Existing argument tests for every role still pass (sandbox or bypass, web search only for `researcher`).
- [x] Skills regenerated; `npm test` passes on Windows.

## Comments

Implemented by Codex (codex-implement), verified by Claude. `src/runner/codex-run.mjs` adds a `COMPUTER_USE_PLUGINS` constant, defaults `computerUse: false`, validates it (JSON boolean; `true` requires `exclusive: true`) right after merging overrides, before the lock, log or Codex call, and appends `computer-use=on|off` to the start-up line. `roles.json` sets `computerUse: true` for `computer-user` only. 11 new runner tests, including invalid `exclusive` values (`"true"`, `1`) and an invalid value refused while another run holds the lock. Skills regenerated; `npm test` 505/505 on Windows. The `node_repl` probe and README remain for later tickets.
