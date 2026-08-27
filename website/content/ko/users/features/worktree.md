# Worktree

> 현재 세션을 벗어나지 않고 임시 [git worktree](https://git-scm.com/docs/git-worktree)에서 실험적 작업을 격리합니다. 모델이 메인 체크아웃과 분리하고 싶은 광범위한 편집을 수행하려 할 때, 또는 서브에이전트를 전용 샌드박스에서 작업하게 하고 싶을 때 유용합니다.

## 빠른 시작

### 세션을 worktree 내에서 시작 (`--worktree` 플래그)

세션 전체를 worktree 내에서 실행해야 한다고 미리 알고 있다면, 시작 시 `--worktree`를 전달합니다:

```bash
# 자동 생성 슬러그 (예: tender-jemison-037f0a)
qwen --worktree

# 명시적 이름
qwen --worktree my-feature

# `=` 형태 (위치 기반 프롬프트도 함께 전달할 때 권장 — 아래 팁 참조)
qwen --worktree=my-feature

# PR 참조 — `origin`에서 refs/pull/<N>/head를 fetch
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# 이전 --worktree 세션 이어가기 — 기존 디렉토리에 재연결
qwen --resume <session-id> --worktree=my-feature
```

> **팁 — 위치 기반 프롬프트 앞에 bare `--worktree`를 사용하면 모호합니다.** `--worktree`는 선택적 값을 받기 때문에, `qwen --worktree "say hi"`는 yargs가 `"say hi"`를 슬러그로 소비합니다(공백 때문에 거부됨). 다음 중 하나를 사용하세요:
>
> - `qwen --worktree=my-feature "say hi"` (항상 동작 — `=`로 명시적 슬러그 지정)
> - `qwen "say hi" --worktree` (위치를 먼저, 플래그를 마지막에 → 자동 슬러그)
> - `qwen --worktree --approval-mode yolo "say hi"` (사이에 다른 플래그가 있으면 bare 형태가 앵커됨)

> **팁 — `qwen --resume --worktree foo`(세션 ID 없음)는 첫 사용 시 빈 피커를 표시합니다.** 피커는 선택한 worktree의 세션 저장소로 범위가 제한되므로, 해당 worktree 외부에서 시작된 세션은 목록에 나타나지 않습니다. `foo` 내부에서 시작된 세션을 이어가려면 `qwen --resume <id> --worktree foo`를 직접 사용하세요 — CLI가 기존 `foo/` 디렉토리를 재생성하지 않고 재연결합니다.

`process.cwd()`와 모델의 워크스페이스는 첫 턴이 실행되기 전에 worktree로 전환됩니다. `Ctrl+C`를 두 번 눌러 종료하면 [종료 대화상자](#종료-대화상자-ctrlc--ctrld)에서 worktree를 유지할지 제거할지 선택할 수 있습니다.

`--worktree` 플래그는 `--acp`/`--experimental-acp`와 함께 사용할 수 없습니다 — ACP 호스트(Zed 등)의 경우, worktree 경로를 `loadSession`/`newSession` 요청의 `cwd`로 전달하세요.

### 또는 세션 도중에 요청

또는 기존 세션 내에서 Qwen Code에게 자연어로 worktree 생성을 요청할 수 있습니다:

```text
> start a worktree called experiment-a
Worktree experiment-a created on branch worktree-experiment-a
.qwen/worktrees/experiment-a
```

이 시점부터 모델은 모든 파일 편집과 셸 명령어를 `.qwen/worktrees/experiment-a/` 내부로 라우팅합니다. 원래 작업 디렉토리는 변경되지 않습니다.

작업이 완료되면:

```text
> exit the worktree and remove it
Removed worktree experiment-a (branch worktree-experiment-a)
```

나중에 다시 돌아오고 싶다면, worktree를 디스크에 유지한 채로 종료하라고 요청하세요:

```text
> exit the worktree but keep it
Kept worktree experiment-a at .qwen/worktrees/experiment-a
```

## Worktree가 사용되는 경우

Worktree는 네 가지 독립적인 경로에서 활성화됩니다:

| 트리거                                        | 동작                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--worktree`로 시작                           | CLI가 모델 턴 실행 전에 worktree를 생성하고 세션을 해당 디렉토리로 전환합니다. PR 형태(`#N`, 전체 URL)는 먼저 fetch합니다. |
| 세션 도중 명시적으로 worktree 요청            | 모델이 `enter_worktree`를 호출합니다. 이후 파일 편집은 worktree 내부로 전달됩니다.                                           |
| 명시적으로 종료 요청                          | 모델이 `exit_worktree`를 `keep` 또는 `remove`와 함께 호출합니다.                                                             |
| 모델이 격리 활성화 상태로 서브에이전트 생성   | 일회용 worktree(`agent-<hex>`)가 자동 생성되며, 에이전트에 diff가 없으면 정리됩니다.                                        |

두 가지 세션 중 도구(`enter_worktree` / `exit_worktree`)는 명시적인 표현 뒤에 의도적으로 게이트되어 있습니다 — "fix this bug" 또는 "create a branch"라고 말해도 트리거되지 **않습니다**. "use a worktree", "start a worktree", "in a worktree"와 같이 말해야 합니다. `--worktree` CLI 플래그에는 이러한 가드가 없습니다. 존재하면 항상 생성합니다.

## 생성되는 것

모든 Qwen이 관리하는 worktree는 프로젝트의 `.qwen` 디렉토리 아래에 배치됩니다:

```
<repoRoot>/.qwen/worktrees/<slug>/         # 작업 디렉토리
                          ↳ branch worktree-<slug>   # 현재 브랜치에서 생성
```

- **슬러그** — 영문, 숫자, 점, 밑줄, 하이픈. 최대 64자. 이름을 지정하지 않으면 `<adjective>-<noun>-<6hex>` 슬러그가 자동 생성됩니다(예: `tender-jemison-037f0a`). PR 참조는 `pr-<N>`을 생성합니다.
- **브랜치** — 항상 `worktree-<slug>`, worktree를 요청할 때 체크아웃되어 있는 브랜치에서 분기됩니다(반드시 메인 작업 트리의 `HEAD`일 필요는 없음). PR worktree의 경우 브랜치는 `worktree-pr-<N>`이며, 로컬 브랜치가 아닌 `FETCH_HEAD`(GitHub 측 PR의 끝)를 기반으로 합니다.
- **Hook** — worktree의 `core.hooksPath`가 자동으로 메인 레포의 `.husky/`(선호) 또는 `.git/hooks/`를 가리키도록 설정되어, worktree 내부의 커밋에서도 기존 pre-commit / commit-msg hook이 트리거됩니다.
- **선택적 심볼릭 링크** — `worktree.symlinkDirectories`([설정](#설정) 참조)에 나열된 디렉토리는 메인 레포에서 새 worktree로 심볼릭 링크되어, `node_modules` 같은 무거운 디렉토리를 재설치 없이 재사용할 수 있습니다.

범용 worktree 경로는 **설정할 수 없습니다** — CLI가 재시작 및 오래된 정리 스윕에서 찾을 수 있도록 `<repoRoot>/.qwen/worktrees/` 아래에 위치해야 합니다. (관련 없는 `agents.arena.worktreeBaseDir` 설정은 [Agent Arena](./arena.md) worktree만 제어하며, `~/.qwen/arena/` 아래 별도의 경로 트리를 사용합니다.)

## 푸터 및 상태 표시줄

Worktree가 활성화되면, 푸터에 별도의 행으로 어두운 인디케이터가 표시됩니다:

```
⎇ worktree-experiment-a (experiment-a)
```

[커스텀 상태 표시줄 스크립트](./status-line.md)를 사용하는 경우, stdin으로 전달되는 JSON 페이로드에 `worktree` 객체도 포함됩니다:

```json
{
  "worktree": {
    "name": "experiment-a",
    "path": "/path/to/repo/.qwen/worktrees/experiment-a",
    "branch": "worktree-experiment-a",
    "original_cwd": "/path/to/repo",
    "original_branch": "main"
  }
}
```

이 페이로드 필드는 worktree가 활성화된 경우에만 존재하므로, `null` 체크(`input.worktree?.name`)로 충분합니다.

커스텀 상태 표시줄에서 이미 worktree 정보를 렌더링하고 있다면, 중복을 피하기 위해 내장 푸터 행을 숨길 수 있습니다 — 아래 [설정](#설정)을 참조하세요.

## 종료 대화상자 (Ctrl+C / Ctrl+D)

Worktree가 활성화된 상태에서 종료 단축키를 두 번 누르면 CLI를 닫는 대신 **Worktree 종료 대화상자**가 열립니다:

```
⎇ Active worktree: "experiment-a" (worktree-experiment-a)

  • 2 new commit(s) on worktree-experiment-a
  • 3 uncommitted file(s)
  Removing the worktree will discard everything above.

What would you like to do?
  ○ Keep worktree (exit without deleting)
  ○ Remove worktree and branch (discards 2 commit(s), 3 file(s))
  ○ Cancel (stay in session)
```

대화상자는 열릴 때 worktree를 검사합니다(`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`). 두 카운트를 모두 표시하여 정확히 무엇을 폐기하게 되는지 알 수 있습니다. `ESC`로 취소합니다.

`git status` 자체가 실패하면(예: 손상된 인덱스, worktree 디렉토리가 CLI 아래서 제거됨), 대화상자에 `⚠ Could not measure worktree state` 경고가 표시되며 카운트가 신뢰할 수 없을 수 있습니다 — 기본 레포 문제를 진단할 때까지 **Keep** 또는 **Cancel**을 선택하세요.

## `--resume` 복원

활성 worktree 바인딩은 세션 트랜스크립트와 함께 사이드카 파일로 저장됩니다:

```
<chatsDir>/<sessionId>.worktree.json
```

CLI를 `--resume <sessionId>`로 시작하거나(`/resume`에서 세션을 선택), **인터랙티브 TUI**, **헤드리스 `-p`**, **ACP/Zed** 모드 전반에 걸쳐 일관되게 세 가지 일이 발생합니다:

1. 사이드카가 로드되고 worktree 디렉토리가 여전히 디스크에 존재하는지 확인합니다.
2. 존재하면, 모델은 바로 다음 프롬프트에서 일회성 알림을 받습니다:
   ```
   [Resumed] Active worktree: "<slug>" at <path> (branch: <branch>). Continue using this path for all file operations.
   ```
3. 세션 사이에 worktree 디렉토리가 삭제된 경우, 오래된 사이드카가 자동으로 정리됩니다 — 오류 없이, worktree 컨텍스트 없이 이어가기만 진행됩니다.

각 모드는 자체 주입 메커니즘을 선택하지만, 사용자 눈에 보이는 동작은 동일합니다:

| 모드              | 메커니즘                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| 인터랙티브 (TUI)  | `INFO` 히스토리 항목 + 다음 사용자 프롬프트에 system-reminder 접두사.                                  |
| 헤드리스 (`-p`)   | 프롬프트에 `<system-reminder>` 접두사 + 출력 스트림의 `worktree_restored` JSON 시스템 이벤트.          |
| ACP (예: Zed)     | 다음 `prompt()` 호출에 연결된 보류 알림.                                                               |

모델은 자동으로 worktree로 `chdir`되지 **않습니다** — 알림이 모델이 worktree 경로를 통해 편집을 라우팅하도록 유지하는 것입니다.

## 서브에이전트 격리

`agent` 도구는 선택적 `isolation: "worktree"` 파라미터를 받습니다. 설정되면, Qwen Code는 서브에이전트 시작 전에 `<repoRoot>/.qwen/worktrees/agent-<7hex>/`에 임시 worktree를 생성하고:

- **변경 없음** → 에이전트가 완료되면 worktree가 자동으로 제거됩니다.
- **변경 있음** → worktree가 유지되며, 경로와 브랜치가 에이전트의 결과에 추가됩니다. 예:
  ```
  …agent output…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  diff를 검토하고 수동으로 병합하거나 삭제하세요.

두 가지 제약:

- `isolation: "worktree"`는 non-fork `subagent_type`이 필요합니다 — 포크된 서브에이전트(`subagent_type: "fork"`)는 부모의 전체 대화 컨텍스트를 재사용하므로, 격리하면 의도와 작업 트리가 분할됩니다.
- `isolation: "worktree"`를 사용하는 에이전트는 기본 백그라운드 동작을 따르며, 에이전트가 완료를 보고하면 정리가 실행됩니다. 인라인 결과를 원하면 `run_in_background: false`를 설정하세요. 이름 없는 호출자 소유 `working_dir` 실행은 포그라운드에서 실행됩니다. 명시적 백그라운드 실행은 거부되며, 구성된 백그라운드 실행(서브에이전트 정의의 `background: true`)은 수명이 외부에서 관리되므로 최상위 수준에서 거부되고 중첩되면 포그라운드 실행으로 다운그레이드됩니다.

### 자동 오래된 정리

크래시 또는 `--no-cleanup` 종료에서 생존한 임시 에이전트 worktree는 모든 CLI 시작 시 회수됩니다. 보수적인 실패 폐쇄 규칙을 따릅니다:

| 가드                                     | 동작                                           |
| ---------------------------------------- | ---------------------------------------------- |
| 슬러그가 `agent-<7hex>` 패턴과 일치해야 함 | 사용자가 생성한 이름 있는 worktree는 절대 건드리지 않습니다. |
| 디렉토리 `mtime` > 30일                  | 더 최근 항목은 건너뜁니다.                     |
| 커밋되지 않은 추적 변경이 있음           | 항목을 건너뜁니다(삭제하지 않음).             |
| 원격에서 도달할 수 없는 커밋이 있음      | 항목을 건너뜁니다(삭제하지 않음).             |
| git 상태를 읽는 중 오류 발생             | 항목을 건너뜁니다(삭제하지 않음).             |

이름 있는 사용자 worktree(`enter_worktree` 슬러그)는 **절대** 자동 정리되지 않습니다 — 제거를 요청할 때까지 유지됩니다.

## `exit_worktree action="remove"` 안전 가드

디렉토리와 브랜치가 삭제되기 전에 세 가지 독립적인 가드가 트리거됩니다:

1. **세션 소유권** — 각 worktree는 생성한 세션 ID가 포함된 사이드카 마커를 가집니다. 다른 세션이 제거를 시도하면 명확한 오류와 함께 거부되며, 수동 탈출구를 위한 `git worktree remove`를 안내합니다.
2. **더티 작업 트리** — 커밋되지 않은 추적 또는 미추적 변경이 제거를 차단합니다. 재정의하려면 `discard_changes: true`를 전달하세요. (우회는 명시적 사용자 확인이 필요합니다 — `action: "remove"`는 AUTO_EDIT 모드에서도 절대 자동 승인되지 않습니다.)
3. **병합되지 않은 커밋** — 다른 로컬 브랜치나 원격 참조가 가리키지 않는 `worktree-<slug>`의 커밋이 무조건 제거를 차단합니다. 커밋된 작업을 잃는 것은 사용자가 의도하는 경우가 드물기 때문에 "discard commits" 플래그가 없습니다. 먼저 병합, 푸시, 또는 브랜치를 다른 곳으로 이름 변경하세요.

동일한 세 가지 가드가 `WorktreeExitDialog → Remove` 버튼에도 적용됩니다.

## 설정

두 가지 설정이 범용 worktree 경험을 조정합니다:

| 키                                  | 타입       | 기본값      | 효과                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator`   | boolean    | `false`     | 내장 `⎇ worktree-… (…)` 푸터 행을 숨깁니다. `worktree` 필드는 여전히 커스텀 상태 표시줄 스크립트에 전달됩니다. 상태 표시줄에서 이미 worktree를 렌더링하는 경우에만 `true`로 설정하세요. 그렇지 않으면 모든 UI affordance가 사라집니다.                                  |
| `worktree.symlinkDirectories`       | `string[]` | `undefined` | 생성 시 모든 범용 worktree로 심볼릭 링크할 메인 레포의 디렉토리. 경로는 레포 루트 기준 상대 경로입니다. 절대 경로와 `..`를 포함하는 항목은 거부됩니다. 누락된 소스와 기존 대상은 자동으로 건너뜁니다(덮어쓰기 없음).                                                    |

예시:

```jsonc
// ~/.qwen/settings.json 또는 <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

모든 worktree 생성 경로에 적용됩니다: `--worktree` 플래그, `enter_worktree` 도구, `agent isolation: "worktree"`.

범용 worktree와 관련 없지만 알아두면 좋은 설정:

- `agents.arena.worktreeBaseDir` — **Agent Arena** worktree 배치를 제어합니다(기본값 `~/.qwen/arena`). 범용 worktree에는 영향을 주지 않으며, 범용 worktree는 항상 `<repoRoot>/.qwen/worktrees/` 아래에 위치합니다.

`worktree.sparsePaths`에 대한 스키마는 아직 없습니다 — 로드맵 항목입니다([제한사항](#제한사항) 참조).

## 도구 레퍼런스

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| 필드   | 타입   | 필수 | 참고                                                                                         |
| ------ | ------ | ---- | -------------------------------------------------------------------------------------------- |
| `name` | string | 아니오 | 슬러그. 영문, 숫자, 점, 밑줄, 하이픈. 최대 64자. 생략 시 자동 생성됩니다.                  |

다음 경우 실행이 거부됩니다:

- CLI가 git 레포지토리에 있지 않은 경우.
- 현재 작업 디렉토리가 이미 `.qwen/worktrees/` 내부인 경우(중첩 worktree 불가).

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| 필드              | 타입                   | 필수                                   | 참고                                                               |
| ----------------- | ---------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `name`            | string                 | 예                                     | `enter_worktree`에서 사용한 슬러그와 일치해야 합니다.              |
| `action`          | `"keep"` \| `"remove"` | 예                                     | `keep`은 디렉토리 + 브랜치를 유지. `remove`는 둘 다 삭제.          |
| `discard_changes` | boolean                | `action="remove"`이고 더티인 경우에만  | 더티 트리 가드를 재정의합니다. `action="keep"`에는 영향이 없습니다. |

`action: "remove"`는 `AUTO_EDIT` 승인 모드에서도 항상 확인을 요청합니다 — 정보 전용 도구가 아닌 파괴적 셸 작업으로 처리됩니다.

### `agent` — `isolation` 파라미터

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| 필드        | 타입           | 필수 | 참고                                                                                               |
| ----------- | -------------- | ---- | -------------------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"`   | 아니오 | 에이전트를 새 `agent-<7hex>` worktree에서 실행합니다. `subagent_type` 설정이 필요합니다(fork 불가). |

agent 도구의 나머지 레퍼런스는 [서브에이전트](./sub-agents.md)를 참조하세요.

## CLI 레퍼런스

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # 슬러그 자동 생성
qwen --worktree my-feature                                    # 명시적 슬러그
qwen --worktree=my-feature                                    # = 형태
qwen --worktree=#123                                          # PR 참조
qwen --worktree https://github.com/owner/repo/pull/123        # PR URL
```

| 입력                          | 결과                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Bare 플래그(값 없음)          | 자동 슬러그 `<adjective>-<noun>-<6hex>`, 브랜치 `worktree-<slug>`, 기반 = 현재 브랜치.                               |
| 일반 슬러그                   | 브랜치 `worktree-<slug>`, 기반 = 현재 브랜치. 슬러그 유효성 검사: 영문/숫자/점/밑줄/하이픈, 최대 64자.               |
| `#N` 또는 `<github-url>/pull/N` | 슬러그 `pr-<N>`, 브랜치 `worktree-pr-<N>`, 기반 = `git fetch origin pull/<N>/head` 후 `FETCH_HEAD` (30초 타임아웃). |

`--worktree`는 `--acp` / `--experimental-acp`와 함께 사용할 수 없습니다.

`--worktree`가 `--resume <session-id>`와 함께 사용되면, worktree가 우선합니다: 이어진 세션의 저장된 worktree(있다면)가 재정의되며, stderr 줄과 첫 프롬프트 알림이 재정의를 보고합니다.

인터랙티브(TUI) 및 헤드리스(`-p`) 모드에서 worktree가 자동으로 생성되고, 첫 턴 전에 세션이 해당 디렉토리로 전환됩니다.

PR fetch 실패 모드(종료 코드 != 0, worktree 생성되지 않음):

| 원인                          | 메시지 발췌                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| `origin` 원격 누락            | `requires an "origin" remote that points at GitHub`         |
| origin에 PR이 존재하지 않음   | `Failed to fetch PR #<N>: the PR does not exist on origin`  |
| 30초 네트워크 타임아웃        | `Failed to fetch PR #<N>: timed out after 30s`              |
| PR 번호가 범위를 벗어나거나 0 | `Invalid PR number`                                         |

## 제한사항

다음 항목은 현재 단계에서 의도적으로 구현되지 않았습니다:

- **스파스 체크아웃 없음.** 대형 모노레포는 전체 트리를 체크아웃합니다. (`worktree.sparsePaths`는 로드맵 항목입니다.)
- **tmux 통합 없음.** CLI는 새 tmux 창에서 worktree 세션을 생성하지 않습니다.
- **Worktree는 세션 저장소에서 별도의 "프로젝트"입니다.** `--worktree foo`로 시작된 세션은 해당 worktree의 chats 디렉토리에 저장됩니다. 나중에 이어가려면 `--worktree foo`를 다시 전달해야 합니다. `--worktree` 없이 시작된 세션은 메인 체크아웃 아래에 저장되며 worktree의 이어가기 피커에 나타나지 않습니다.
- **크로스 슬러그 세션 재정의 없음.** `<sid>`가 `--worktree first`로 생성된 경우 `qwen --resume <sid> --worktree second`는 세션을 찾지 못합니다 — 세션과 worktree는 `projectHash(cwd)`로 강하게 결합됩니다. 기존 세션에서 worktree를 전환하려면 종료한 후 새 `--worktree`와 새 프롬프트로 다시 시작해야 합니다. 향후 아키텍처 변경(저장소를 `cwd` 대신 레포 루트에 앵커링)이 이 제약을 해소할 것입니다.
- **세션 중 `enter_worktree`는 `process.cwd()`나 `Config.targetDir`을 전환하지 않습니다.** 해당 도구는 모델 컨텍스트 전용 규칙을 사용합니다([서브에이전트](./sub-agents.md) 참조). 시작 시 `--worktree` 플래그만 실제로 프로세스 작업 디렉토리를 전환합니다.
- **다른 인수 필드의 상대 경로는 worktree chdir 이전에 해석됩니다.** 경로 인수를 받는 플래그(`--mcp-config`, `--openai-logging-dir`, `--json-file`, `--input-file`, `--telemetry-outfile`, `--include-directories`)는 `--worktree`가 설정되면 시작 cwd 기준으로 절대 경로로 정규화됩니다. 이 목록에 없는 다른 경로 형태의 argv 필드는 여전히 worktree cwd 기준으로 해석됩니다 — 안전하려면 절대 경로를 사용하세요.

로드맵은 `docs/design/worktree.md`에서 추적하세요.

## 문제 해결

**Worktree를 방금 생성했는데 푸터에 worktree 인디케이터가 표시되지 않습니다.**
`ui.hideBuiltinWorktreeIndicator`가 `true`로 설정되지 않았는지 확인하세요. 또한 도구의 성공 메시지에서 슬러그가 비어있지 않은지 확인하세요.

**`--resume`이 worktree를 복원하지 않습니다.**
`<chatsDir>/<sessionId>.worktree.json`이 존재하는지 확인하세요. CLI는 worktree 디렉토리가 사라지면 사이드카를 자동으로 삭제하므로, 누락된 사이드카와 누락된 디렉토리는 "복원할 worktree가 없음"의 정상 상태입니다 — 버그가 아닙니다. `--debug`로 실행하고 `restoreWorktreeContext`를 grep하여 원인을 확인하세요.

**`exit_worktree`가 "created by a different session"이라고 합니다.**
세션 소유권 가드입니다. 원래 세션을 이어가기하고 거기서 종료하거나, 제안된 `git worktree remove …` 명령을 수동으로 실행하세요.

**오래된 `agent-<hex>` worktree가 계속 쌓입니다.**
30일 차단 기간은 보수적입니다. `git worktree list && git worktree remove <path>`로 수동 정리하거나, 기다리세요 — 30일 경과 후 다음 CLI 시작 시 clean하고 push된 상태라면 회수됩니다.
