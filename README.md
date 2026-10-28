# codex-delegate

**English** | [한국어](docs/README_ko-kr.md)

## Purpose and philosophy

codex-delegate keeps [Matt Pocock's skill](https://github.com/mattpocock/skills) philosophy and puts each agent on the work it does best. It vendors the upstream skills as-is and patches only the five workflow entry points and `code-review`, so they delegate to Codex workers.

> An **unofficial** extension of mattpocock/skills. It is not affiliated with or endorsed by the original author.

### Who does what

| Agent               | Strengths                                                         | Weaknesses                                                       | Role here                                                                                         |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Claude (Opus 5.5)   | Understanding user intent, code analysis, design                  | Web search                                                       | **Leader**: interviews the user, writes specs and tickets, briefs workers, verifies their results |
| Codex (GPT 6.1 Sol) | Implementation performance for the cost                           | Often misreads user intent; tends to mark work as done too early | **Implementer**: builds one ticket at a time, test-first                                          |
| Codex (GPT 6 Astra) | Sharp critic and code reviewer; especially strong at computer use |                                                                  | **Adversarial reviewer**: attacks specs and ticket breakdowns before they are published, and reviews code alongside Claude. **Computer use**: drives native desktop apps for the leader |
| Codex (GPT 6 Luna)  | Cost-effective; can use Codex's excellent web search tool         |                                                                  | **Researcher**: answers outside questions from cited sources, covering the leader's weak spot     |

### Principles

1. **The workflow stays Matt Pocock's.** Same commands, same discipline: grill the design, write the spec, slice tracer-bullet tickets, build test-first. Delegation is added inside those steps, not around them.
2. **The leader owns intent.** Only Claude talks to the user. Workers never have to guess what the user meant: they get self-contained briefs with the ticket, acceptance criteria and agreed test seams.
3. **"Done" is verified, not trusted.** A worker's report is a claim. The leader reads the diff, reruns typechecking and tests, and checks every acceptance criterion before anything is committed.
4. **Critique comes before commitment.** Plans are challenged by a reviewer that didn't write them, while changing them is still cheap.

## Installation

Requirements: Node.js 18.18 or later, git, and the Codex CLI (`npm i -g @openai/codex`, then `codex login`).

```
npx github:starpia-forge/codex-delegate install             # latest on the default branch
npx github:starpia-forge/codex-delegate#v0.3.0 install      # pinned to a tag
```

On Windows, if PowerShell refuses to run `npx` because running scripts is disabled on this system, use `npx.cmd` instead, or allow local scripts once with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

One command installs the following set into each agent. The set is defined in [`install-manifest.json`](install-manifest.json).

| Agent | Location (user / project) | Skills installed |
|---|---|---|
| Claude Code (leader) | `~/.claude/skills`¹ / `.claude/skills` | everything in `skills/claude/*` (32 skills) |
| Codex (workers) | `~/.codex/skills`¹ / `.agents/skills` | everything in `skills/codex/*`: `tdd`, `codebase-design`, `research` |

¹ When `CLAUDE_CONFIG_DIR` or `CODEX_HOME` is set, user-scope skills go to `$CLAUDE_CONFIG_DIR/skills` or `$CODEX_HOME/skills` instead, matching where each agent looks for them.

A skill both agents use, such as `tdd`, is installed as two separate copies. Each copy is written for its own agent's role, so the delegating and the delegated agent never read the same instructions.

`doctor` runs automatically after installing. Restart Claude Code and Codex to pick up the new skills.

### Commands

```
npx github:starpia-forge/codex-delegate install     [--scope user|project] [--agent <id>] [--force] [--dry-run] [--with-pet | --without-pet]
npx github:starpia-forge/codex-delegate uninstall   [--scope user|project] [--agent <id>] [--dry-run]
npx github:starpia-forge/codex-delegate list        [--scope user|project] [--agent <id>]
npx github:starpia-forge/codex-delegate doctor
```

- **Updating**: run `install` again. Skills dropped in the new version are removed automatically. An enabled [pet](#pet) is kept and updated.
- **Safety**: every installed skill gets a `.codex-delegate.json` marker file. `install`, `uninstall` and updates only touch skills that carry this marker.
- **Name conflicts**: if a skill with the same name already exists and this tool did not install it (for example, the original mattpocock-skills), installation **stops without changing anything**. Add `--force` to overwrite.
- **Claude Code's built-in `/code-review`**: the installed `code-review` skill replaces it. The built-in review stays available as `/review`, which never runs this skill.
- **Personal over project**: when the same skill name exists in both, Claude Code uses the personal one (`~/.claude/skills`). After a project install, a personal skill with the same name that this tool didn't install hides the project copy.
- **What `doctor` checks**: the Node version, whether Codex is installed and logged in, whether this Codex account offers each role's model and effort, whether the Computer Use plugin (`computer-use@openai-bundled`) is enabled in Codex (warns without failing if disabled or missing), whether the original mattpocock-skills plugin is also installed in Claude Code, and whether personal skills hide skills installed into the current project.

### Preparing a target repository

- Run `/setup-matt-pocock-skills` once in the target repository.
- Add `.scratch/codex/` to `.gitignore`. Successful delegations remove their task directory after consuming the result; failed ones keep it for diagnosis until you choose how to proceed, and any leftovers can be deleted by hand.

## Worker configuration

| Role | Model / effort | Sandbox | Used by |
|---|---|---|---|
| `researcher` (research) | `gpt-6-luna` / max, web search | read-only | `codex-research` |
| `critic` (adversarial review) | `gpt-6-astra` / medium | read-only | `codex-plan-review`, `codex-code-review` |
| `implementer` (implementation) | `gpt-6.1-sol` / high | workspace-write | `codex-implement` |
| `computer-user` (computer use) | `gpt-6-astra` / medium | none: approvals and sandbox bypassed | `codex-computer-use` |

Defaults live in [`src/runner/roles.json`](src/runner/roles.json). To change them for yourself, put only the fields you want to override in `~/.codex-delegate/roles.json`. This file survives reinstalls.

```json
{ "implementer": { "model": "gpt-6-sol", "effort": "high" } }
```

A key that names no role is an error: the runner refuses to start any worker and `doctor` fails until you fix it.

### Upgrading from 0.2.x

Roles are now named for their job instead of their model. Rename the keys in `~/.codex-delegate/roles.json`:

| 0.2.x | Now |
|---|---|
| `luna` | `researcher` |
| `astra` | `critic` |
| `sol` | `implementer` |
| `astra-cu` | `computer-user` |

### Computer use (`computer-user`)

`codex-computer-use` hands desktop-app work (a click through a Windows app, typing into a dialog, checking what an app shows) to a Codex worker. Websites are out of scope; they stay with browser tools. The worker saves a final screenshot, `final.png`, and the leader checks it against the completion criterion before calling the task done.

Prerequisites:

- the Codex desktop app is installed, and it is **running** while the skill runs (the worker reaches the screen through it; with the app closed the run fails with `Computer Use native pipe is unavailable`);
- the Computer Use plugin is enabled in Codex (`doctor` warns when it is not).

**Why no sandbox.** Under `codex exec`, the Computer Use plugin asks for approval per app, nobody can answer, and the request is rejected (`Computer Use was not approved to use <app>`). So `computer-user` runs Codex with `--dangerously-bypass-approvals-and-sandbox`. That turns off the shell sandbox as well as approvals: the worker can run any command, write anywhere your user account can, and use the network, and it can operate any app on your desktop. To turn it off, set `{ "computer-user": { "dangerouslyBypassApprovalsAndSandbox": false } }` in `~/.codex-delegate/roles.json`; computer use then stops working.

**One worker at a time.** There is one desktop, so the runner holds a per-user lock, the directory `~/.codex-delegate/computer-use.lock/`, while a `computer-user` worker runs, across all Claude sessions and worktrees. A second run exits at once with code 75 ("computer use busy") without starting Codex. The lock records the runner's and the Codex process's PIDs and is reclaimed automatically once both are dead. Residual risks:

- if the runner is killed hard (for example from Task Manager), a grandchild process of the shell can outlive both recorded PIDs and keep driving the desktop while a new worker takes the lock;
- each reclaimed lock is renamed to `computer-use.lock.stale-<hash>` rather than deleted, so these copies can accumulate in `~/.codex-delegate/` (a released lock that could not be fully deleted is left as `computer-use.lock.released-<id>`); delete them when no worker is running;
- a lock left incomplete (the runner died before recording the Codex PID) counts as busy forever; delete `~/.codex-delegate/computer-use.lock/` by hand once you are sure no worker is running;
- the operating system can reuse a dead worker's PID for an unrelated process, and the lock then stays busy until that process ends.

## Pet

An optional desktop pet for each running leader session and each worker. Pets live in a strip along the bottom of the primary monitor, just above the taskbar, and show what their session or worker is doing: `running` while the leader works, `waiting` at an approval prompt or question, `review` when a turn ends (back to `idle` after a minute), `failed` after an error. A worker's pet carries its role and task directory name, for example `researcher · task-one`, sits beside the pet of the leader that started it, and plays a short scene with it when it starts and when it reports back. Concurrent workers of the same role are separate pets. Several Claude Code windows appear as separate teams, left to right in the order they opened; when the strip is full, the newest pets collapse into `+N` badges.

Workers leave off the strip's left edge after reporting back. The strip never takes focus and lets every click through to the window below. It stays above other windows, pauses and drops behind any fullscreen app, and is hidden from screen capture while a `computer-user` worker runs, so it never appears in that worker's screenshots.

### Turning it on and off

```
npx github:starpia-forge/codex-delegate install --with-pet      # install or update the pet
npx github:starpia-forge/codex-delegate install --without-pet   # remove the pet, keep the skills
npx github:starpia-forge/codex-delegate uninstall               # remove the skills and the pet
```

Restart Claude Code after turning the pet on or off, so the hook changes take effect.

Once enabled, the pet stays on across updates: a later user-scope `install` without either option keeps it and updates it to the bundle this version expects. `--dry-run` prints every pet action (download, bundle swap, hook changes, settings backup) without doing it, and `list` shows whether the pet is enabled, its bundle version and which settings file holds its hooks.

Pet changes happen only for user scope with Claude Code in the agent selection; a project-scope run or one that leaves out Claude Code leaves an enabled pet untouched. These are refused with nothing changed:

- `--with-pet` together with `--without-pet`;
- either option with a command other than `install`, with `--scope project`, or with an `--agent` selection that leaves out `claude-code`;
- `--with-pet` on anything other than Windows.

Requirements: Windows (the first version supports nothing else), the Microsoft Edge WebView2 Runtime (part of Windows 11; install it on Windows 10 if it is missing), and `node` on the `PATH` Claude Code runs hooks with.

### What it changes on your machine

- **Pet bundle**: the installer downloads one pinned release asset, `codex-delegate-pet-windows-x64.zip`, from this repository's GitHub Releases and refuses it unless its SHA-256 matches the pin shipped with the package. It holds the pet app (`codex-delegate-pet.exe`), the client that reports events, the leader hook script and the bundled default pets, and is unpacked to `~/.codex-delegate/pet/`. Updates replace this directory whole.
- **Pet state**: `~/.codex-delegate/pet-state/` holds the marker that records the pet as enabled (bundle version, settings file and the exact hook commands), a random per-user token that the app requires on every request, open session records and pending events. It survives updates.
- **Claude Code settings**: command hooks that run the leader hook script, `~/.codex-delegate/pet/hook/leader-hook.mjs`, with Node are added to the user settings file (`$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json`, created if missing) for `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PermissionRequest`, `Notification`, `Stop`, `StopFailure` and `PostToolUse`. UTF-8 BOM settings are accepted. Before every change the old file is copied next to it as `settings.json.codex-delegate-backup-<time>-<id>`. Reinstalling updates owned entries in place; identical pre-existing commands are left alone and never taken over. Removal deletes exactly the entries the installer recorded, from the settings file they were written to, and leaves every other key and hook untouched.

Downloading, checking the bundle and reading the settings file happen before anything is changed: if any of them fails (for example, the settings file is not valid JSON), the installer stops with nothing changed. Uninstall preflight errors print `Nothing was changed.` and exit 1. While it replaces or removes the bundle, it stops a running pet app and keeps hooks and workers from starting it again. If health is unavailable, it stops a hung app only after verifying its executable; otherwise install or uninstall fails with a message to close the app or resolve the port conflict and retry. If a later step fails, it lists which steps were and weren't applied and where the settings backup is; run the same command again to finish.

Removal (`--without-pet` or `uninstall`) deletes `~/.codex-delegate/pet/` and `~/.codex-delegate/pet-state/` as well as the hooks.

The pet app starts on the first event and quits on its own after ten minutes without any. Leader and worker reporting never blocks Claude Code or a worker and never changes their output.

### Configuration and custom pets

Optional, in `~/.codex-delegate/pet.json`:

```json
{
  "scale": 0.6,
  "pets": { "leader": "my-pet", "researcher": "critic" }
}
```

- `scale`: pet size relative to a 192 × 208 sprite cell, from 0.3 to 1.0 (default 0.6).
- `pets`: pet folder names for any role matching `[a-z][a-z0-9-]*`, including user roles. The five built-in roles default to their matching bundled pets; other roles without a configured pet use bundled `implementer` art.

Unknown keys and invalid values are ignored, and invalid JSON falls back to the defaults. The app reads this file and pet packages once at startup; restart it to load changes.

A pet name is looked up in this order:

1. `~/.codex-delegate/pets/<name>/`
2. your Codex pets folder, `$CODEX_HOME/pets/<name>/` (default `~/.codex/pets/<name>/`), so pets you already have for Codex work as-is
3. the bundled pet of that name (`leader`, `researcher`, `critic`, `implementer`, `computer-user`)

A pet folder uses the Codex pet package format: a `pet.json` manifest with `id`, `displayName`, `description` and `spritesheetPath`, and a transparent PNG or WebP sprite sheet of 1536 × 1872 pixels (8 × 9 cells of 192 × 208). If the first folder found doesn't match, or a named pet isn't found anywhere, that slot shows its bundled default.

### What `doctor` checks for the pet

Only when the pet is installed, `doctor` also reports:

- `FAIL` for an invalid pin or missing bundle/executable; `WARN` if the marker's tag, SHA-256 or version differs from the pin;
- `FAIL` for missing recorded hooks or unreadable settings; `WARN` when that file is in a different config directory than the current one;
- `FAIL` for a missing WebView2 Runtime (Windows);
- `WARN` for invalid `pet.json` settings, and per-slot warnings for missing, invalid or unreadable pet packages, with bundled fallback;
- `WARN` if the port is held by something other than the pet app, or the running app's version differs from the pin; an app that is not running is `OK`.

## Workflow

You type the four commands, one per stage. Orange steps are run by Claude (the leader), blue ones by Codex workers, and grey ones by you. Dotted arrows are delegations and their results.

```mermaid
flowchart TD
    subgraph grill["/grill-with-docs"]
        direction LR
        G1["Grill the design,<br/>update glossary and ADRs"]
        Luna{{"Codex · GPT 6 Luna<br/>codex-research"}}
        G1 -. "outside facts" .-> Luna
        Luna -. "cited notes" .-> G1
    end

    subgraph spec["/to-spec"]
        direction LR
        P1["Draft spec"]
        A1{{"Codex · GPT 6 Astra<br/>codex-plan-review"}}
        P2["Revise"]
        P3["Publish spec"]
        P1 -. "draft" .-> A1
        A1 -. "findings" .-> P2
        P2 --> P3
    end

    subgraph tickets["/to-tickets"]
        direction LR
        T1["Draft tracer-bullet<br/>tickets"]
        A2{{"Codex · GPT 6 Astra<br/>codex-plan-review"}}
        T2["Revise"]
        T3(["User approves"])
        T4["Publish tickets"]
        T1 -. "breakdown" .-> A2
        A2 -. "findings" .-> T2
        T2 --> T3 --> T4
    end

    subgraph impl["/implement"]
        direction LR
        I1["Brief the worker"]
        Sol{{"Codex · GPT 6.1 Sol<br/>codex-implement"}}
        I2["Verify diff, typecheck,<br/>tests, acceptance criteria"]
        I3["Commit the ticket"]
        R1["code-review: Claude subagents<br/>Standards · Spec · Correctness"]
        A3{{"Codex · GPT 6 Astra<br/>codex-code-review"}}
        R2["Merge per axis, verify<br/>single-source findings"]
        I1 -. "ticket brief" .-> Sol
        Sol -. "code + report" .-> I2
        I2 -- "pass" --> I3
        I2 -. "fail: follow-up" .-> Sol
        I3 -- "next ticket" --> I1
        I3 -- "all tickets done" --> R1
        I3 -. "same diff and briefs" .-> A3
        R1 --> R2
        A3 -. "findings" .-> R2
    end

    U(["User"]) --> grill
    grill --> spec
    spec --> tickets
    tickets --> impl

    classDef user fill:#e8e8e8,stroke:#666,color:#111
    classDef claude fill:#f6dcc8,stroke:#c15f2c,color:#111
    classDef codex fill:#d6e6f5,stroke:#2f6aa3,color:#111
    class U,T3 user
    class G1,P1,P2,P3,T1,T2,T4,I1,I2,I3,R1,R2 claude
    class Luna,A1,A2,A3,Sol codex
```

`/implement-spec` follows the same `/implement` loop for every ticket, with one Claude subagent per ticket working in its own worktree; the leader merges each result into the integration branch and runs one `code-review` over it at the end.

`code-review` has every axis reviewed twice, independently: by a Claude subagent and by Codex, from the same diff and the same briefs. One model's blind spots are caught by the other. The leader merges the two sets of findings per axis, tags each with who found it, and checks any finding only one reviewer reported against the code before accepting it.

Workers never change git state. Commits, branches and merges are handled by the leader or Claude subagents.

## Repository layout

```
bin/cli.mjs                 npx installer
install-manifest.json       per-agent install set
src/skills/                 authored skills (codex-research, codex-plan-review, codex-implement, codex-code-review, codex-computer-use)
src/runner/                 codex-run.mjs, roles.json and the Windows helpers windows-codex.mjs and
                            windows-stop-tree.ps1 (copied into each skill above at build time)
src/codex-skills.json       upstream skills the workers use (copied into skills/codex/)
patches/                    changes against upstream (one per skill)
  claude/                   applied to skills/claude/
  codex/                    applied to skills/codex/
upstream.json               pinned upstream commit
scripts/build.mjs           generates skills/
skills/                     build output; do not edit by hand
  claude/                   every mattpocock skill (5 entry points and code-review patched) + src/skills; Claude Code only
  codex/                    only the upstream skills workers need, patched for the worker role; Codex only
pet/                        the optional Windows pet: app, client, leader hook (see pet/README.md)
pet-pin.json                release tag, asset and SHA-256 of the pet bundle the installer downloads
docs/                       translated documentation
```

`skills/` follows the `skills/{scope}/<name>/SKILL.md` convention, so individual skills can also be installed with `gh skill install` or `npx skills add`. In that case you have to match the per-agent set yourself.

## Maintenance

```
node scripts/build.mjs              # regenerate skills/ at the pinned commit
node scripts/build.mjs --ref main   # move to the latest upstream and regenerate
```

- **When a patch no longer applies**: the build fails and leaves `skills/` untouched. Update that patch against the new upstream and run again. Patch paths are relative to upstream's `skills/` directory, e.g. `a/engineering/<skill>/SKILL.md`.
- **How skills are sorted**: every upstream skill goes to `claude/`. The upstream skills listed in `src/codex-skills.json` are also copied, separately, to `codex/`. Each copy is built from a clean upstream checkout with only its own `patches/<agent>/` applied, so a patch for one agent never changes the other agent's copy. The build fails if `patches/codex/` touches a skill not listed in `src/codex-skills.json`.
- **Adding a worker skill**: add its name to `src/codex-skills.json` and rebuild. It is then installed into Codex automatically, since the manifest installs `codex/*`. If its instructions assume the leader's role (talking to the user, spawning agents, writing files), add a patch under `patches/codex/`.
- **Releasing**: bump `version` in `package.json`, commit including `skills/`, and tag with the same version. The marker files record this version.

## Known limitations

- **git ownership errors in the Windows sandbox**: the sandbox runs as a separate OS user, so git rejects the repository as "dubious ownership". `codex-run.mjs` works around this by setting `safe.directory=*` for that process only.
- **No network**: `implementer` and `critic` run without network access and cannot read the issue tracker. The delegation skills therefore put the ticket and spec text directly into the prompt.
- **Computer use on Windows 10**: GitHub issues report screenshot time-outs and wrong click positions with Codex's Computer Use on Windows 10 (build 19045). Expect more failed attempts there.
- **Bash time limit**: foreground Bash commands time out after 10 minutes, so `researcher`, `implementer`, `computer-user` and code review by `critic` run in the background.

## License

[MIT](LICENSE). The bundled upstream skills (mattpocock/skills) are also MIT-licensed; their notice is in [`skills/THIRD_PARTY_LICENSE-mattpocock-skills`](skills/THIRD_PARTY_LICENSE-mattpocock-skills).
