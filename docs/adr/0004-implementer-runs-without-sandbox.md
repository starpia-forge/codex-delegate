# The implementer runs without a sandbox

The computer-use spec gave only `computer-user` the approvals and sandbox bypass. The `implementer` role now has it by default too, replacing `-s workspace-write`, because of a problem with the Codex sandbox on Windows. The specific failure was not recorded when this was decided. The bypass is the default on every platform, even though the problem is only known on Windows, so that there is one rule and one way to turn it off: set `dangerouslyBypassApprovalsAndSandbox` to `false` for `implementer` in `~/.codex-delegate/roles.json`.

## Considered Options

- **Keep the sandbox and have affected users opt in.** Other users keep their protection and no Release is needed, but every affected user has to find the override.
- **Bypass on Windows only.** macOS and Linux keep their sandbox, but roles would need a new platform condition in their configuration and in the runner.
- **Bypass everywhere by default (chosen).** One line of configuration, the same behaviour on every platform, and an opt-out that already exists. macOS and Linux users lose the sandbox with no known benefit.

## Consequences

Nothing enforces what the sandbox used to enforce. A worker can write outside its working directory, reach the network and use the user's credentials, and `/implement-spec`'s worktree isolation is now a convention. The brief states these limits, and the leader checks that `HEAD` and the branch did not move during a run. Writes outside the working directory are not detected, because concurrent workers change other worktrees legitimately.

The role keeps `exclusive: false` so that `/implement-spec` can still run workers in parallel, and keeps its `sandbox` value so that the opt-out restores `-s workspace-write`.
