# codex-delegate

[English](../README.md) | **한국어**

Claude Code(Opus 5.5)가 Leader로 워크플로우를 진행하고, 조사·계획 검토·구현은 Codex 워커에게 위임하도록 스킬을 설치하는 도구입니다.

> [mattpocock/skills](https://github.com/mattpocock/skills)를 기반으로 한 **비공식** 확장입니다. 원작자와 관련이 없으며, 원작자가 승인하지 않았습니다.

원본 스킬을 그대로 가져온 뒤, 워크플로우 진입점 스킬 5개에만 작은 패치를 적용했습니다. 설치 후에는 평소처럼 `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement`를 입력하면 됩니다.

## 설치

필요한 것: Node.js 18.18 이상, git, Codex CLI(`npm i -g @openai/codex` 후 `codex login`).

```
npx github:starpia-forge/codex-delegate install             # 기본 브랜치 최신
npx github:starpia-forge/codex-delegate#v0.1.0 install      # 태그 고정
```

명령 하나로 각 에이전트에 아래 구성이 설치됩니다. 구성은 [`install-manifest.json`](../install-manifest.json)에 정의되어 있습니다.

| 에이전트 | 설치 위치 (user / project) | 설치되는 스킬 |
|---|---|---|
| Claude Code (Leader) | `~/.claude/skills` / `.claude/skills` | `skills/claude/*` 전부와 `skills/shared/*` 전부 (30개) |
| Codex (워커) | `~/.codex/skills` / `.agents/skills` | `tdd`, `codebase-design`, `research` |

설치가 끝나면 `doctor`가 자동으로 실행됩니다. Claude Code와 Codex를 재시작해야 새 스킬이 반영됩니다.

### 명령

```
npx github:starpia-forge/codex-delegate install     [--scope user|project] [--agent <id>] [--force] [--dry-run]
npx github:starpia-forge/codex-delegate uninstall   [--scope user|project] [--agent <id>] [--dry-run]
npx github:starpia-forge/codex-delegate list        [--scope user|project] [--agent <id>]
npx github:starpia-forge/codex-delegate doctor
```

- **업데이트**: `install`을 다시 실행합니다. 새 버전에서 빠진 스킬은 자동으로 제거됩니다.
- **안전 장치**: 설치한 스킬마다 `.codex-delegate.json` 표시 파일을 남깁니다. `install`, `uninstall`, `update`는 이 표시가 있는 스킬만 건드립니다.
- **이름 충돌**: 같은 이름의 스킬이 이미 있고 이 도구가 설치한 것이 아니면(예: 원본 mattpocock-skills), **아무것도 바꾸지 않고 중단**합니다. 덮어쓰려면 `--force`를 붙입니다.
- **`doctor` 점검 항목**: Node 버전, Codex 설치와 로그인 상태, 역할별 모델과 effort를 현재 Codex 계정에서 쓸 수 있는지, Claude Code에 원본 mattpocock-skills 플러그인이 중복 설치되어 있는지.

### 대상 저장소 준비

- 대상 저장소에서 `/setup-matt-pocock-skills`를 한 번 실행합니다.
- `.gitignore`에 `.scratch/codex/`를 추가합니다. 위임 작업마다 이 디렉터리에 `prompt.md`, `result.md`, `result.md.log`가 남습니다.

## 역할

| 역할 | 모델 / effort | sandbox | 사용하는 스킬 |
|---|---|---|---|
| Leader | Opus 5.5 / medium | – | 모든 워크플로우를 진행하고 위임 결과를 검증 |
| `luna` (조사) | `gpt-6-luna` / max, 웹 검색 | read-only | `codex-research` |
| `astra` (공격적 검토) | `gpt-6-astra` / medium | read-only | `codex-plan-review` |
| `sol` (구현) | `gpt-6.1-sol` / medium | workspace-write | `codex-implement` |

기본값은 [`src/runner/roles.json`](../src/runner/roles.json)에 있습니다. 사용자별로 바꾸려면 `~/.codex-delegate/roles.json`에 바꿀 필드만 적습니다. 이 파일은 재설치해도 유지됩니다.

```json
{ "sol": { "model": "gpt-6-sol", "effort": "high" } }
```

## 위임 흐름

```
/grill-with-docs  외부 사실이 필요할 때 → codex-research (백그라운드)
/to-spec          초안 작성 → codex-plan-review → 반영 → 게시
/to-tickets       분할 초안 → codex-plan-review → 반영 → 사용자 확인 → 게시
/implement        티켓마다 codex-implement → Leader가 diff, 타입체크, 테스트 검증 → code-review → 커밋
/implement-spec   티켓별 서브에이전트가 자기 worktree에서 codex-implement → 검증 → 커밋 → 병합
```

워커는 git 상태를 바꾸지 않습니다. 커밋, 브랜치, 병합은 Leader나 Claude 서브에이전트가 맡습니다.

## 저장소 구조

```
bin/cli.mjs                 npx 설치 도구
install-manifest.json       에이전트별 설치 구성
src/skills/                 직접 작성한 스킬 (codex-research, codex-plan-review, codex-implement)
src/runner/                 codex-run.mjs와 roles.json (빌드 시 위 스킬 각각에 복사됨)
src/worker-skills.json      워커가 쓰는 원본 스킬 목록 (skills/shared/로 분류됨)
patches/                    원본 대비 변경분 (스킬당 1개)
upstream.json               고정된 원본 커밋
scripts/build.mjs           skills/ 생성
skills/                     빌드 산출물. 직접 수정하지 말 것
  claude/                   mattpocock 기본 스킬(진입점 5개는 패치본) + src/skills. Claude Code 전용
  shared/                   워커에게 필요한 원본 스킬만, 수정 없이. Claude와 Codex 공용
```

`skills/`는 `skills/{scope}/<name>/SKILL.md` 규칙을 따르므로 `gh skill install`이나 `npx skills add`로도 개별 설치할 수 있습니다. 다만 그 경우에는 에이전트별 구성을 사용자가 직접 맞춰야 합니다.

## 유지보수

```
node scripts/build.mjs              # 고정된 커밋으로 skills/ 다시 생성
node scripts/build.mjs --ref main   # 원본을 최신으로 올리고 다시 생성
```

- **패치가 적용되지 않을 때**: `skills/`는 그대로 두고 실패합니다. 해당 패치를 새 원본에 맞게 고친 뒤 다시 실행합니다. 패치 경로는 `a/engineering/<skill>/SKILL.md`처럼 원본 `skills/` 디렉터리 기준입니다.
- **스킬 분류 규칙**: `src/worker-skills.json`에 있는 원본 스킬만 `shared/`로 가고, 나머지 원본 스킬은 모두 `claude/`로 갑니다. 워커 스킬은 수정 없이 원본 그대로여야 하므로, 이 목록에 있는 스킬에 패치가 걸려 있으면 빌드가 실패합니다.
- **워커 스킬 추가**: `src/worker-skills.json`에 이름을 넣고 다시 빌드하면 Codex 설치 대상에도 자동으로 포함됩니다. 매니페스트는 `shared/*`를 설치합니다.
- **릴리스 절차**: `package.json`의 `version`을 올리고, `skills/`를 포함해 커밋한 뒤 같은 버전으로 태그를 붙입니다. 표시 파일에 이 버전이 기록됩니다.

## 알려진 제약

- **Windows sandbox의 git 소유권 오류**: sandbox가 별도 OS 사용자로 실행되어 git이 "dubious ownership"으로 저장소를 거부합니다. `codex-run.mjs`가 해당 프로세스에만 `safe.directory=*`를 넣어 우회합니다.
- **네트워크 차단**: `sol`과 `astra`는 네트워크가 막혀 있어서 이슈 트래커를 직접 읽지 못합니다. 그래서 위임 스킬이 티켓과 spec 본문을 프롬프트에 직접 담습니다.
- **Bash 시간 제한**: Bash의 foreground 시간 제한은 10분입니다. 그래서 `luna`와 `sol`은 백그라운드로 실행합니다.

## 라이선스

[MIT](../LICENSE). 포함된 원본 스킬(mattpocock/skills)도 MIT 라이선스이며, 고지문은 [`skills/THIRD_PARTY_LICENSE-mattpocock-skills`](../skills/THIRD_PARTY_LICENSE-mattpocock-skills)에 있습니다.
