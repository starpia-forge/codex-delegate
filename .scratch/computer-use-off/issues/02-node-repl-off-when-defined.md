# 02: Turn `node_repl` off when Codex says it is defined

Spec: `.scratch/computer-use-off/spec.md`

**What to build:** The Codex desktop app's `node_repl` MCP server also reaches the computer-use native pipe, and it survives disabling the plugins. For a role with computer use off, the runner first asks Codex whether that server is defined, by running `codex mcp get node_repl --json` in the worker's working directory with the worker's environment, spawned the same way as the worker. Disabling a server that isn't defined stops Codex from starting, so the answer decides:

- **defined** (exit 0, JSON with `name` equal to `node_repl`) → add `-c mcp_servers.node_repl.enabled=false`;
- **absent** (non-zero exit, stderr says no MCP server named `node_repl` was found) → add nothing;
- **unknown** (anything else, including a 5-second deadline passing) → add nothing, let the run continue, and print `computer-use=off(node_repl unknown)` so the log never claims the route is closed.

On the deadline the runner terminates the probe's whole process tree (on Windows the shell and npm shim sit between it and Codex). Roles with computer use on are not probed. Every fake `codex` in the test suite answers the probe as absent by default and acts as a worker only for `exec`, so existing tests neither hang nor write stray files. The generated skill copies are regenerated.

Same feature branch as ticket 01.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Probe answers defined → the `node_repl` override is passed; `computer-use=off`.
- [ ] Probe answers absent → no `node_repl` override; the run succeeds; `computer-use=off`.
- [ ] Probe fails or prints unparseable output → no override; the run succeeds; `computer-use=off(node_repl unknown)`.
- [ ] Probe hangs, with a descendant holding its pipes open → the worker starts within a bounded time with the unknown marker, and no probe process is left running.
- [ ] Runner launched from one directory with `--cwd` another → the probe ran in the same directory and with the same `CODEX_HOME` as `exec`.
- [ ] `computer-user` makes no probe.
- [ ] Every other test that fakes `codex` still passes and records only the `exec` call as a worker.
- [ ] Skills regenerated; `npm test` passes on Windows.
