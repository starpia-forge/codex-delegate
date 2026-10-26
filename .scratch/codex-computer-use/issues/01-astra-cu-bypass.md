# 01: Run the `astra-cu` role with approvals and sandbox bypassed

Spec: `.scratch/codex-computer-use/spec.md`

**What to build:** Running the runner with role `astra-cu` invokes Codex with `gpt-6-astra` / `medium` and `--dangerously-bypass-approvals-and-sandbox` instead of `-s`, so the Computer Use plugin can act in a non-interactive run. Every other role invokes Codex exactly as before, and a user override can switch the bypass off. This ticket also introduces the repo's first automated tests: Node's built-in `node:test`, run by `npm test`, with a fake `codex` executable placed first on `PATH` that records its arguments and writes a result to the `-o` path, working on Windows (through the runner's shell spawn) and POSIX.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Default roles include `astra-cu`: model `gpt-6-astra`, effort `medium`, purpose "Computer use", no web search, `dangerouslyBypassApprovalsAndSandbox: true`. The field defaults to false for every other role.
- [ ] With that field true in the merged config, the Codex arguments contain `--dangerously-bypass-approvals-and-sandbox` and no `-s`; the runner's start-up line shows the bypass instead of the sandbox.
- [ ] `astra`, `sol` and `luna` produce the same Codex arguments as before this change (regression test, web search only for `luna`).
- [ ] An isolated user override file setting the field to false for `astra-cu` brings `-s <sandbox>` back.
- [ ] Every test isolates the home directory; the real `~/.codex-delegate/` is never read or written.
- [ ] `npm test` passes on Windows.
