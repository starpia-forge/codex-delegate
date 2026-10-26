# codex-delegate

**English** | [한국어](docs/README_ko-kr.md)

Installs skills that let Claude Code (Opus 5.5) lead the workflow while delegating research, plan review and implementation to Codex workers.

> An **unofficial** extension based on [mattpocock/skills](https://github.com/mattpocock/skills). It is not affiliated with or endorsed by the original author.

The upstream skills are vendored as-is, with small patches applied only to the five workflow entry points. Once installed, keep typing `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` as usual.

## Installation

Requirements: Node.js 18.18 or later, git, and the Codex CLI (`npm i -g @openai/codex`, then `codex login`).

```
npx github:starpia-forge/codex-delegate install             # latest on the default branch
npx github:starpia-forge/codex-delegate#v0.1.0 install      # pinned to a tag
```

One command installs the following set into each agent. The set is defined in [`install-manifest.json`](install-manifest.json).

| Agent | Location (user / project) | Skills installed |
|---|---|---|
| Claude Code (leader) | `~/.claude/skills` / `.claude/skills` | everything in `skills/claude/*` and `skills/shared/*` (30 skills) |
| Codex (workers) | `~/.codex/skills` / `.agents/skills` | `tdd`, `codebase-design`, `research` |

`doctor` runs automatically after installing. Restart Claude Code and Codex to pick up the new skills.

### Commands

```
npx github:starpia-forge/codex-delegate install     [--scope user|project] [--agent <id>] [--force] [--dry-run]
npx github:starpia-forge/codex-delegate uninstall   [--scope user|project] [--agent <id>] [--dry-run]
npx github:starpia-forge/codex-delegate list        [--scope user|project] [--agent <id>]
npx github:starpia-forge/codex-delegate doctor
```

- **Updating**: run `install` again. Skills dropped in the new version are removed automatically.
- **Safety**: every installed skill gets a `.codex-delegate.json` marker file. `install`, `uninstall` and updates only touch skills that carry this marker.
- **Name conflicts**: if a skill with the same name already exists and this tool did not install it (for example, the original mattpocock-skills), installation **stops without changing anything**. Add `--force` to overwrite.
- **What `doctor` checks**: the Node version, whether Codex is installed and logged in, whether this Codex account offers each role's model and effort, and whether the original mattpocock-skills plugin is also installed in Claude Code.

### Preparing a target repository

- Run `/setup-matt-pocock-skills` once in the target repository.
- Add `.scratch/codex/` to `.gitignore`. Each delegated task leaves `prompt.md`, `result.md` and `result.md.log` in this directory.

## Roles

| Role | Model / effort | Sandbox | Used by |
|---|---|---|---|
| Leader | Opus 5.5 / medium | – | Runs every workflow and verifies delegated results |
| `luna` (research) | `gpt-6-luna` / max, web search | read-only | `codex-research` |
| `astra` (adversarial review) | `gpt-6-astra` / medium | read-only | `codex-plan-review` |
| `sol` (implementation) | `gpt-6.1-sol` / medium | workspace-write | `codex-implement` |

Defaults live in [`src/runner/roles.json`](src/runner/roles.json). To change them for yourself, put only the fields you want to override in `~/.codex-delegate/roles.json`. This file survives reinstalls.

```json
{ "sol": { "model": "gpt-6-sol", "effort": "high" } }
```

## Delegation flow

```
/grill-with-docs  when outside facts are needed → codex-research (background)
/to-spec          draft → codex-plan-review → revise → publish
/to-tickets       draft breakdown → codex-plan-review → revise → user approval → publish
/implement        per ticket: codex-implement → leader checks diff, typecheck, tests → code-review → commit
/implement-spec   per-ticket subagents run codex-implement in their own worktree → verify → commit → merge
```

Workers never change git state. Commits, branches and merges are handled by the leader or Claude subagents.

## Repository layout

```
bin/cli.mjs                 npx installer
install-manifest.json       per-agent install set
src/skills/                 authored skills (codex-research, codex-plan-review, codex-implement)
src/runner/                 codex-run.mjs and roles.json (copied into each skill above at build time)
src/worker-skills.json      upstream skills the workers use (sorted into skills/shared/)
patches/                    changes against upstream (one per skill)
upstream.json               pinned upstream commit
scripts/build.mjs           generates skills/
skills/                     build output; do not edit by hand
  claude/                   mattpocock's skills (5 entry points patched) + src/skills; Claude Code only
  shared/                   only the upstream skills workers need, unmodified; shared by Claude and Codex
docs/                       translated documentation
```

`skills/` follows the `skills/{scope}/<name>/SKILL.md` convention, so individual skills can also be installed with `gh skill install` or `npx skills add`. In that case you have to match the per-agent set yourself.

## Maintenance

```
node scripts/build.mjs              # regenerate skills/ at the pinned commit
node scripts/build.mjs --ref main   # move to the latest upstream and regenerate
```

- **When a patch no longer applies**: the build fails and leaves `skills/` untouched. Update that patch against the new upstream and run again. Patch paths are relative to upstream's `skills/` directory, e.g. `a/engineering/<skill>/SKILL.md`.
- **How skills are sorted**: only the upstream skills listed in `src/worker-skills.json` go to `shared/`; every other upstream skill goes to `claude/`. Worker skills must be unmodified upstream, so the build fails if any of them is patched.
- **Adding a worker skill**: add its name to `src/worker-skills.json` and rebuild. It is then installed into Codex automatically, since the manifest installs `shared/*`.
- **Releasing**: bump `version` in `package.json`, commit including `skills/`, and tag with the same version. The marker files record this version.

## Known limitations

- **git ownership errors in the Windows sandbox**: the sandbox runs as a separate OS user, so git rejects the repository as "dubious ownership". `codex-run.mjs` works around this by setting `safe.directory=*` for that process only.
- **No network**: `sol` and `astra` run without network access and cannot read the issue tracker. The delegation skills therefore put the ticket and spec text directly into the prompt.
- **Bash time limit**: foreground Bash commands time out after 10 minutes, so `luna` and `sol` run in the background.

## License

[MIT](LICENSE). The bundled upstream skills (mattpocock/skills) are also MIT-licensed; their notice is in [`skills/THIRD_PARTY_LICENSE-mattpocock-skills`](skills/THIRD_PARTY_LICENSE-mattpocock-skills).
