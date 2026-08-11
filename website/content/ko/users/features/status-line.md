# Status Line

> 푸터에 사용자 정의 정보를 표시합니다.

Status line은 세션 인식 정보 — 모델 이름, 토큰 사용량, git 브랜치 등 — 를 푸터의 왼쪽 섹션에 표시합니다. 두 가지 설정 모드가 있습니다:

- **프리셋 모드** — 대화형 대화상자 또는 JSON 설정을 통해 내장 데이터 항목을 선택합니다. 스크립팅이 필요 없습니다.
- **명령어 모드** — stdin을 통해 구조화된 JSON 컨텍스트를 받는 셸 명령어를 실행합니다. 사용자 정의 포맷팅에 대한 완전한 유연성을 제공합니다.

```
한 줄 상태 (기본 승인 모드 — 1행):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← status line
└─────────────────────────────────────────────────────────────────┘

여러 줄 상태 (최대 2줄 — 2행):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
└─────────────────────────────────────────────────────────────────┘

여러 줄 상태 + 기본이 아닌 모드 (최대 3행):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
│  auto-accept edits (shift + tab to cycle)                       │  ← 모드 표시기
└─────────────────────────────────────────────────────────────────┘
```

설정되면 status line은 기본 "? for shortcuts" 힌트를 대체합니다. 우선순위가 높은 메시지(Ctrl+C/D 종료 프롬프트, Esc, vim INSERT 모드)가 status line을 일시적으로 재정의합니다. Status line 텍스트는 사용 가능한 너비에 맞게 잘립니다.

## 빠른 설정

Status line을 설정하는 가장 쉬운 방법은 `/statusline` 명령어입니다. 프리셋 항목 선택, 테마 색상 토글, 실시간 미리보기를 제공하는 대화형 대화상자를 엽니다:

```
/statusline
```

이렇게 하면 프리셋 모드 설정기가 열립니다. 방향 키로 탐색하고, 스페이스로 항목을 토글하고, 엔터로 확인합니다. 선택 사항이 자동으로 설정에 저장됩니다.

`/statusline`에 특정 지시를 제공하여 명령어 모드 설정을 생성하게 할 수도 있습니다:

```
/statusline show model name and context usage percentage
```

---

## 프리셋 모드

프리셋 모드는 선택하여 조합할 수 있는 내장 데이터 항목을 제공합니다 — 셸 명령어 없음, `jq` 없음, 스크립팅 없음. 항목은 한 줄에 `item1 | item2 | item3`으로 렌더링됩니다.

### 설정

`~/.qwen/settings.json`의 `ui` 키 아래에 `statusLine` 객체를 추가합니다:

```json
{
  "ui": {
    "statusLine": {
      "type": "preset",
      "items": [
        "model-with-reasoning",
        "git-branch",
        "context-remaining",
        "current-dir",
        "context-used"
      ],
      "useThemeColors": true
    }
  }
}
```

| 필드                   | 유형       | 필수 | 설명                                                                                                      |
| ---------------------- | ---------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | 예   | `"preset"`이어야 합니다                                                                                   |
| `items`                | string[]   | 예   | 표시할 프리셋 항목 ID의 정렬된 목록 (아래 표 참조). 항목은 `\|`를 구분자로 결합됩니다.                   |
| `useThemeColors`       | boolean    | 아니오 | 활성 `/theme` 색상을 status line 텍스트에 적용합니다. 기본값 `true`.                                    |
| `hideContextIndicator` | boolean    | 아니오 | 푸터 오른쪽 섹션의 내장 컨텍스트 사용량 표시기를 숨깁니다. 설정하지 않으면 `items`에 `context-used` 또는 `context-remaining`이 포함될 때 컨텍스트 사용량이 두 번 표시되지 않도록 자동으로 숨겨집니다. 항상 표시하려면 `false`로 설정합니다. |

### 사용 가능한 프리셋 항목

| 항목 ID                | 기본 | 설명                                                          |
| ---------------------- | ---- | ------------------------------------------------------------- |
| `model-with-reasoning` | 예   | 추론 수준 포함 현재 모델 이름 (예: `qwen-3-235b high`)        |
| `model`                |      | 추론 수준 제외 현재 모델 이름                                  |
| `git-branch`           | 예   | 현재 Git 브랜치 이름 (git 리포 외부에서 숨김)                  |
| `context-remaining`    | 예   | 남은 컨텍스트 창 백분율 (예: `Context 65.7% left`)             |
| `total-input-tokens`   |      | 세션 중 누적 입력 토큰 (예: `30.0k total in`)                 |
| `total-output-tokens`  |      | 세션 중 누적 출력 토큰 (예: `5.0k total out`)                 |
| `current-dir`          | 예   | 현재 작업 디렉토리                                             |
| `project-name`         |      | 프로젝트 이름 (작업 디렉토리의 basename)                       |
| `pull-request-number`  |      | 현재 브랜치의 열린 PR 번호 (`gh` CLI 필요)                     |
| `branch-changes`       |      | 세션 파일 변경 통계 (예: `+120 -30`)                           |
| `context-used`         | 예   | 사용된 컨텍스트 창 백분율 (예: `Context 34.3% used`)           |
| `run-state`            |      | 간결한 세션 상태 (`Ready`, `Working`, 또는 `Confirm`)          |
| `qwen-version`         |      | Qwen Code 버전 (예: `v0.14.1`)                                 |
| `context-window-size`  |      | 전체 컨텍스트 창 크기 (예: `131.1k window`)                    |
| `used-tokens`          |      | 현재 프롬프트 토큰 수 (예: `45.0k used`)                       |
| `session-id`           |      | 현재 세션 식별자                                               |

**기본**으로 표시된 항목은 `/statusline` 대화상자를 처음 열 때 미리 선택됩니다.

`total-input-tokens`과 `total-output-tokens`은 세션 합계입니다. 턴 간 토큰 사용량을 합산하므로, 각 새 모델 요청에 현재 대화 컨텍스트가 다시 포함되기 때문에 입력 토큰이 빠르게 증가할 수 있습니다. 현재 프롬프트 크기를 알고 싶으면 누적 세션 비용 대신 `used-tokens`를 사용하세요.

### 예시 출력

기본 항목을 사용하면 status line은 다음과 같습니다:

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### 대화상자를 통한 커스터마이징

`/statusline`을 실행하면 대화형 다중 선택 대화상자가 열립니다:

```
┌ Configure Status Line ────────────────────────────────────────┐
│ Select which items to display in the status line.             │
│                                                               │
│ Type to search                                                │
│ >                                                             │
│                                                               │
│ [x] Use theme colors        Apply colors from the active /theme│
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Current model name with reasoning │
│ [ ] model-only              Current model name without reason │
│ [x] git-branch              Current Git branch when available │
│ [x] context-remaining       Percentage of context remaining   │
│ ...                                                           │
│                                                               │
│ Preview                                                       │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ Use up/down to navigate, space to select, enter to confirm    │
└───────────────────────────────────────────────────────────────┘
```

- 이름을 입력하여 항목 필터링
- 항목을 토글하면 실시간 미리보기 업데이트
- 엔터를 눌러 설정 저장

---

## 명령어 모드

명령어 모드는 stdout이 status line에 표시되는 셸 명령어를 실행합니다. 명령어는 세션 인식 출력을 위해 stdin을 통해 구조화된 JSON 컨텍스트를 받습니다.

### 사전 요구사항

- JSON 입력 파싱에 [`jq`](https://jqlang.github.io/jq/) 권장 (`brew install jq`, `apt install jq` 등으로 설치)
- JSON 데이터가 필요 없는 간단한 명령어(예: `git branch --show-current`)는 `jq` 없이 작동

### 설정

`~/.qwen/settings.json`의 `ui` 키 아래에 `statusLine` 객체를 추가합니다:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

| 필드                   | 유형        | 필수 | 설명                                                                                                                           |
| ---------------------- | ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `type`                 | `"command"` | 예   | `"command"`여야 합니다                                                                                                         |
| `command`              | string      | 예   | 실행할 셸 명령어. stdin을 통해 JSON을 받으며, stdout이 표시됩니다(최대 2줄).                                                   |
| `refreshInterval`      | number      | 아니오 | N초마다 명령어를 재실행합니다(최소 1). 에이전트 상태 이벤트 없이 변경되는 데이터(시계, 할당량, 업타임)에 유용합니다.             |
| `respectUserColors`    | boolean     | 아니오 | 명령어 출력의 ANSI 색상 코드를 보존하여 흐리게 처리된 푸터 스타일링 대신 적용합니다. 기본값 `false`.                           |
| `hideContextIndicator` | boolean     | 아니오 | 푸터 오른쪽 섹션의 내장 컨텍스트 사용량 표시기를 숨깁니다. 기본값 `false`.                                                      |

### JSON 입력

명령어는 stdin을 통해 다음 필드가 포함된 JSON 객체를 받습니다:

```json
{
  "session_id": "abc-123",
  "version": "0.14.1",
  "model": {
    "display_name": "qwen-3-235b"
  },
  "context_window": {
    "context_window_size": 131072,
    "used_percentage": 34.3,
    "remaining_percentage": 65.7,
    "current_usage": 45000,
    "total_input_tokens": 30000,
    "total_output_tokens": 5000
  },
  "workspace": {
    "current_dir": "/home/user/project"
  },
  "git": {
    "branch": "main"
  },
  "worktree": {
    "name": "fix-auth",
    "path": "/home/user/project/.qwen/worktrees/fix-auth",
    "branch": "fix-auth",
    "original_cwd": "/home/user/project",
    "original_branch": "main"
  },
  "metrics": {
    "models": {
      "qwen-3-235b": {
        "api": {
          "total_requests": 10,
          "total_errors": 0,
          "total_latency_ms": 5000
        },
        "tokens": {
          "prompt": 30000,
          "completion": 5000,
          "total": 35000,
          "cached": 10000,
          "thoughts": 2000
        }
      }
    },
    "files": {
      "total_lines_added": 120,
      "total_lines_removed": 30
    }
  },
  "vim": {
    "mode": "INSERT"
  }
}
```

| 필드                                    | 유형             | 설명                                                                              |
| --------------------------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `session_id`                            | string           | 고유 세션 식별자                                                                  |
| `version`                               | string           | Qwen Code 버전                                                                    |
| `model.display_name`                    | string           | 현재 모델 이름                                                                    |
| `context_window.context_window_size`    | number           | 토큰 단위의 전체 컨텍스트 창 크기                                                 |
| `context_window.used_percentage`        | number           | 백분율로서의 컨텍스트 창 사용량 (0–100)                                           |
| `context_window.remaining_percentage`   | number           | 백분율로서의 컨텍스트 창 잔여량 (0–100)                                           |
| `context_window.current_usage`          | number           | 마지막 API 호출의 토큰 수 (현재 컨텍스트 크기)                                    |
| `context_window.total_input_tokens`     | number           | 이번 세션에서 소비된 총 입력 토큰                                                 |
| `context_window.total_output_tokens`    | number           | 이번 세션에서 소비된 총 출력 토큰                                                 |
| `workspace.current_dir`                 | string           | 현재 작업 디렉토리                                                                |
| `git`                                   | object \| absent | git 리포지토리 내부일 때만 존재합니다.                                            |
| `git.branch`                            | string           | 현재 브랜치 이름                                                                  |
| `worktree`                              | object \| absent | 활성 worktree 내부일 때만 존재합니다 (`enter_worktree`로 생성됨).                 |
| `worktree.name`                         | string           | Worktree 슬러그 이름                                                              |
| `worktree.path`                         | string           | Worktree 디렉토리의 절대 경로                                                     |
| `worktree.branch`                       | string           | Worktree에서 체크아웃된 브랜치                                                    |
| `worktree.original_cwd`                 | string           | Worktree 진입 전 작업 디렉토리                                                    |
| `worktree.original_branch`              | string           | Worktree 진입 전 활성 브랜치                                                      |
| `metrics.models.<id>.api`               | object           | 모델별 API 통계: `total_requests`, `total_errors`, `total_latency_ms`             |
| `metrics.models.<id>.tokens`            | object           | 모델별 토큰 사용량: `prompt`, `completion`, `total`, `cached`, `thoughts`         |
| `metrics.files`                         | object           | 파일 변경 통계: `total_lines_added`, `total_lines_removed`                        |
| `vim`                                   | object \| absent | vim 모드가 활성화된 경우에만 존재합니다. `mode` (`"INSERT"` 또는 `"NORMAL"`) 포함. |

> **중요:** stdin은 한 번만 읽을 수 있습니다. 항상 먼저 변수에 저장하세요: `input=$(cat)`.

### 예시

#### 모델 및 토큰 사용량

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

출력: `qwen-3-235b  ctx:34%`

#### Git 브랜치 + 디렉토리

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // empty'); dir=$(basename \"$(echo \"$input\" | jq -r '.workspace.current_dir')\"); echo \"$dir${branch:+ ($branch)}\""
    }
  }
}
```

출력: `my-project (main)`

> 참고: `git.branch` 필드는 JSON 입력에 직접 제공됩니다 — `git`을 호출할 필요가 없습니다.

#### 파일 변경 통계

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); added=$(echo \"$input\" | jq -r '.metrics.files.total_lines_added'); removed=$(echo \"$input\" | jq -r '.metrics.files.total_lines_removed'); echo \"+$added/-$removed lines\""
    }
  }
}
```

출력: `+120/-30 lines`

#### 라이브 시계와 git 브랜치

Statusline이 에이전트 이벤트 없이 변경되는 데이터(예: 시계, 업타임, 속도 제한 카운터)를 표시할 때 `refreshInterval`을 사용합니다:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // \"no-git\"'); echo \"$(date +%H:%M:%S)  ($branch)\"",
      "refreshInterval": 1
    }
  }
}
```

출력 (매초 새로 고침): `14:32:07  (main)`

#### 복잡한 명령어를 위한 스크립트 파일

긴 명령어의 경우, `~/.qwen/statusline-command.sh`에 스크립트 파일을 저장합니다:

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
pct=$(echo "$input" | jq -r '.context_window.used_percentage')
branch=$(echo "$input" | jq -r '.git.branch // empty')
added=$(echo "$input" | jq -r '.metrics.files.total_lines_added')
removed=$(echo "$input" | jq -r '.metrics.files.total_lines_removed')

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$branch" ] && parts+=("($branch)")
[ "$pct" != "0" ] 2>/dev/null && parts+=("ctx:${pct}%")
([ "$added" -gt 0 ] || [ "$removed" -gt 0 ]) 2>/dev/null && parts+=("+${added}/-${removed}")

echo "${parts[*]}"
```

그런 다음 설정에서 참조합니다:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "bash ~/.qwen/statusline-command.sh"
    }
  }
}
```

## 동작

**두 모드 모두:**

- **업데이트 트리거**: Status line은 모델 변경, 새 메시지 전송(토큰 수 변경), vim 모드 토글, git 브랜치 변경, 도구 호출 완료, 파일 변경 시 업데이트됩니다. 업데이트는 300ms로 디바운스됩니다.
- **출력**: 최대 2줄. 각 줄은 푸터 왼쪽 섹션의 별도 행으로 렌더링됩니다. 사용 가능한 너비를 초과하는 줄은 잘립니다.
- **핫 리로드**: 설정의 `ui.statusLine` 변경이 즉시 적용됩니다 — 재시작 불필요.
- **제거**: 설정에서 `ui.statusLine` 키를 삭제하면 비활성화됩니다. "? for shortcuts" 힌트가 돌아옵니다.

**명령어 모드 전용:**

- **타임아웃**: 5초 이상 걸리는 명령어는 종료됩니다. 실패 시 status line이 비워집니다.
- **새로 고침**: `refreshInterval`(초)을 설정하면 타이머로 추가로 명령어를 재실행합니다 — 에이전트 이벤트 없이 변경되는 데이터(시계, 속도 제한, 빌드 상태)에 유용합니다.
- **셸**: 명령어는 macOS/Linux에서 `/bin/sh`를 통해 실행됩니다. Windows에서는 `cmd.exe`가 기본 사용되며 — POSIX 명령어를 `bash -c "..."`로 감싸거나 bash 스크립트를 가리키세요 (예: `bash ~/.qwen/statusline-command.sh`).

**프리셋 모드 전용:**

- **외부 의존성 없음**: 프리셋 항목은 내부적으로 계산됩니다 — 셸 명령어 없음, `jq` 없음, 타임아웃 없음.
- **테마 통합**: `useThemeColors`가 `true`(기본값)이면 status line 텍스트가 활성 `/theme` 색상을 사용합니다. `false`이면 흐리게 처리된 푸터 스타일링이 적용됩니다.
- **PR 조회**: `pull-request-number` 항목은 백그라운드에서 `gh pr view`를 실행합니다(2초 타임아웃). 브랜치가 변경될 때만 트리거되며 매 업데이트마다 실행되지 않습니다.

## 문제 해결

| 문제                          | 원인                           | 해결 방법                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status line이 표시되지 않음   | 설정 경로가 잘못됨             | 루트 수준 `statusLine`이 아닌 `ui.statusLine` 아래에 있어야 함                                                                                                                                                                                                                                                                                                                                         |
| 빈 출력 (명령어 모드)         | 명령어가 조용히 실패           | 수동 테스트: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| 오래된 데이터 (명령어 모드)   | 트리거가 발생하지 않음         | 메시지를 보내거나 모델을 전환하여 업데이트를 트리거하거나 — `refreshInterval`을 설정하여 타이머로 명령어 재실행                                                                                                                                                                                                                                                                                         |
| 명령어가 너무 느림            | 복잡한 스크립트                | 스크립트를 최적화하거나 무거운 작업을 백그라운드 캐시로 이동                                                                                                                                                                                                                                                                                                                                           |
| 프리셋 항목 누락              | 조건부 항목에 데이터 없음      | `git-branch`는 git 리포 외부에서 숨겨짐; `context-used`는 사용량이 0일 때 숨겨짐; `branch-changes`는 변경된 파일이 없을 때 숨겨짐. 이는 예상된 동작 — 데이터가 사용 가능해지면 항목이 표시됨                                                                                                                                                                                                          |
| PR 번호가 표시되지 않음       | `gh` CLI 미설치                | [GitHub CLI](https://cli.github.com/)를 설치하고 `gh auth login`으로 인증. 조회는 2초 타임아웃으로 실행됨                                                                                                                                                                                                                                                                                              |
