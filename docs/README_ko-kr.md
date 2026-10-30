# codex-delegate

[![Release](https://img.shields.io/github/v/release/starpia-forge/codex-delegate?filter=v*&sort=semver)](https://github.com/starpia-forge/codex-delegate/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

[English](../README.md) | **한국어**

## 개요

codex-delegate는 [Matt Pocock의 스킬](https://github.com/mattpocock/skills) 워크플로우를 그대로 유지하면서, 각 에이전트에게 가장 잘하는 일을 맡깁니다. Claude가 리더로서 사용자와 대화하고, 스펙과 티켓을 작성하고, 모든 결과를 검증합니다. Codex 워커는 조사, 리뷰, 구현을 맡습니다.

업스트림 스킬은 그대로 가져오고, 다섯 개의 워크플로우 진입점과 `code-review`만 Codex에 위임하도록 패치합니다.

> mattpocock/skills의 **비공식** 확장이며, 원작자와 관련이 없고 원작자의 보증을 받지 않았습니다.

## 설치

Node.js 18.18 이상, git, Codex CLI(`npm i -g @openai/codex` 후 `codex login`)가 필요합니다.

```sh
# 설치 (최신 버전, 또는 태그 고정)
npx github:starpia-forge/codex-delegate install
npx github:starpia-forge/codex-delegate#v0.3.0 install

# 사용자 폴더 대신 현재 프로젝트에 설치
npx github:starpia-forge/codex-delegate install --scope project

# 업데이트: install을 다시 실행

# 설정 점검, 설치된 스킬 목록
npx github:starpia-forge/codex-delegate doctor
npx github:starpia-forge/codex-delegate list

# 제거
npx github:starpia-forge/codex-delegate uninstall
```

설치 후 Claude Code와 Codex를 재시작하세요. 이 도구가 설치한 스킬만 건드리며, 같은 이름의 기존 스킬이 있으면 `--force`를 주지 않는 한 설치를 중단합니다. Windows에서 PowerShell이 `npx`를 막으면 `npx.cmd`를 사용하세요.

## 펫

<p align="center"><img src="images/pets.png" alt="기본 펫 다섯: momo, mikan, sion, shamiko, lico"></p>

Claude 세션과 Codex 워커마다 귀여운 데스크톱 펫이 하나씩 생깁니다. 작업 표시줄 바로 위에 앉아 담당 에이전트의 상태(`running`, `waiting`, `review`, `failed`)를 보여 주고, 워커는 시작할 때와 결과를 보고할 때 리더에게 인사합니다. 클릭은 펫을 그대로 통과합니다.

```sh
npx github:starpia-forge/codex-delegate install --with-pet      # 켜기
npx github:starpia-forge/codex-delegate install --without-pet   # 끄기 (스킬은 유지)
```

Windows 전용이며 WebView2 Runtime이 필요합니다. 켜거나 끈 뒤에는 Claude Code를 재시작하세요. 크기와 사용자 펫은 `~/.codex-delegate/pet.json`에서 설정합니다. 자세한 내용은 [pet/README.md](../pet/README.md)를 참고하세요.

펫은 설치한 버전의 Release에서 내려받으며, 해당 Release의 `.sha256` 파일로 검증합니다.
새 버전이 공개된 직후에는 펫을 켠 상태의 설치(일반 `install` 포함)가 잠시
Release가 없다는 안내와 함께 중단될 수 있습니다. 잠시 후 다시 시도하거나
Release 태그를 지정해 설치하세요.

> I Love まちカドまぞく

## 워크플로우

`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` (또는 `/implement-spec`). 명령과 규율은 업스트림과 같고, 위임은 각 단계 안에서 일어납니다.

| 역할 | 모델 | 강점 | 약점 | 이 역할을 맡긴 이유 |
|---|---|---|---|---|
| 리더 | Claude Opus 5.5 | 사용자 의도 파악, 코드 분석, 설계 | 웹 검색 | 리더만 사용자와 대화하므로 의도가 흐려지지 않습니다. 스펙과 티켓을 쓰고, 워커에게 지시하고, 결과를 검증합니다 |
| 조사 | GPT 6 Luna | 저렴함, Codex의 강력한 웹 검색 | 낮은 지능 | 출처가 있는 답으로 외부 질문에 답해 리더의 약점을 보완합니다 |
| 비평 | GPT 6 Astra | 날카로운 비평가이자 코드 리뷰어 | 높은 비용 | 스펙과 티켓을 게시 전에 공격하고, Claude와 함께 코드를 리뷰합니다 |
| 구현 | GPT 6.1 Sol | 비용 대비 구현 품질 | 의도를 오해함, 작업을 너무 일찍 완료로 표시함 | 자체 완결된 지시를 받아 티켓 하나씩 테스트 우선으로 구현하고, 리더가 테스트를 다시 돌려 모든 기준을 확인합니다 |
| 컴퓨터 사용 | GPT 6 Astra | 데스크톱 앱 조작에 강함 | 높은 비용 | 리더 대신 네이티브 앱을 조작합니다. **샌드박스와 승인 없이** 실행되며, Codex 데스크톱 앱이 실행 중이어야 합니다 |

워커의 "완료"는 사실이 아니라 주장입니다. 리더는 커밋 전에 diff와 테스트를 직접 확인합니다. `code-review`는 모든 축을 Claude와 Codex가 각각 한 번씩 리뷰하므로, 한 모델이 놓친 것을 다른 모델이 잡아냅니다. 역할별 모델은 `~/.codex-delegate/roles.json`에서 바꿀 수 있습니다.

## 라이선스

[MIT](../LICENSE). 함께 포함된 업스트림 스킬(mattpocock/skills)도 MIT 라이선스이며, [`skills/THIRD_PARTY_LICENSE-mattpocock-skills`](../skills/THIRD_PARTY_LICENSE-mattpocock-skills)를 참고하세요.
