# codex-delegate

[![Release](https://img.shields.io/github/v/release/starpia-forge/codex-delegate?filter=v*&sort=semver)](https://github.com/starpia-forge/codex-delegate/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**English** | [한국어](docs/README_ko-kr.md)

## Overview

codex-delegate keeps [Matt Pocock's skills](https://github.com/mattpocock/skills) workflow and puts each agent on the work it does best. Claude leads: it talks to you, writes specs and tickets, and verifies every result. Codex workers research, review and implement.

It vendors the upstream skills as-is and patches only the five workflow entry points and `code-review` so they delegate to Codex.

> An **unofficial** extension of mattpocock/skills, not affiliated with or endorsed by the original author.

## Installation

Requires Node.js 18.18+, git and the Codex CLI (`npm i -g @openai/codex`, then `codex login`).

```sh
# Install (latest, or pinned to a tag)
npx github:starpia-forge/codex-delegate install
npx github:starpia-forge/codex-delegate#v0.4.0 install

# Install into the current project instead of your user folders
npx github:starpia-forge/codex-delegate install --scope project

# Update: run install again

# Check the setup, list installed skills
npx github:starpia-forge/codex-delegate doctor
npx github:starpia-forge/codex-delegate list

# Uninstall
npx github:starpia-forge/codex-delegate uninstall
```

Restart Claude Code and Codex afterwards. Only skills this tool installed are ever touched; a name clash with an existing skill stops the install unless you pass `--force`. On Windows, use `npx.cmd` if PowerShell blocks `npx`.

## Pet

<p align="center"><img src="docs/images/pets.png" alt="The five default pets: momo, mikan, sion, shamiko and lico"></p>

A cute desktop pet for each Claude session and each Codex worker. They sit just above the taskbar and show what their agent is doing (`running`, `waiting`, `review`, `failed`), and workers greet their leader when they start and report back. Clicks pass straight through them.

```sh
npx github:starpia-forge/codex-delegate install --with-pet      # turn on
npx github:starpia-forge/codex-delegate install --without-pet   # turn off, keep the skills
```

Windows only, with the WebView2 Runtime. Restart Claude Code after turning it on or off. Size and custom pets are set in `~/.codex-delegate/pet.json`; see [pet/README.md](pet/README.md).

The pet comes from the installed version's Release and is verified against its
`.sha256` file. Just after a new version is published, installs with the pet
enabled (including plain `install`) may briefly stop with a clear missing-Release
message. Retry later or install from a tagged Release.

> I Love まちカドまぞく

## Workflow

`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` (or `/implement-spec`). Same commands and discipline as upstream; delegation happens inside each step.

| Role | Model | Strengths | Weaknesses | Why it gets this job |
|---|---|---|---|---|
| Leader | Claude Opus 5.5 | Reads user intent, analyses code, designs | Web search | Only the leader talks to you, so intent is never lost. It writes specs and tickets, briefs workers and verifies their output |
| Researcher | GPT 6 Luna | Cheap; Codex's strong web search | Lower intelligence | Covers the leader's weak spot with cited answers to outside questions |
| Critic | GPT 6 Astra | Sharp critic and code reviewer | High cost | Attacks specs and tickets before they are published, and reviews code alongside Claude |
| Implementer | GPT 6.1 Sol | Implementation quality for the cost | Misreads intent; calls work done too early | Builds one ticket at a time, test-first, from a self-contained brief; the leader reruns tests and checks every criterion |
| Computer use | GPT 6 Astra | Strong at driving desktop apps | High cost | Operates native apps for the leader. Runs **without a sandbox or approvals**; the Codex desktop app must be running |

A worker's "done" is a claim, not a fact: the leader verifies diffs and tests before committing. `code-review` runs every axis twice, by Claude and by Codex, so one model catches what the other misses. Override models per role in `~/.codex-delegate/roles.json`.

## License

[MIT](LICENSE). The bundled upstream skills (mattpocock/skills) are also MIT-licensed; see [`skills/THIRD_PARTY_LICENSE-mattpocock-skills`](skills/THIRD_PARTY_LICENSE-mattpocock-skills).
