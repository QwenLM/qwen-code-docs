# FileChanged hook


`FileChanged`를 사용하여 Qwen Code, 셸 명령어, 편집기 또는 다른 프로세스에 의해 변경된 파일을 관찰합니다. 로컬의 관리되지 않는 세션에서 실행됩니다. hook 구성, 실행기, 신뢰 규칙에 대한 내용은 [Hooks 가이드](./hooks.md)를 참조하세요.

## 이벤트 입력

입력은 [공통 hook 필드](./hooks.md#hook-input-structure)와 다음을 포함합니다:

```json
{
  "file_path": "/home/me/work/demo/.envrc",
  "event": "change"
}
```

`file_path`는 절대 경로입니다. `event`는 관찰된 파일의 추가, 수정, 삭제에 대해 각각 `add`, `change`, `unlink`입니다. 공통 `session_id`와 `cwd`는 수신 세션에 속하며, 작성자를 식별하지 않습니다. 공유 디렉토리를 관찰하는 여러 세션이 각각 변경 사항을 수신할 수 있습니다. 파일 내용은 포함되지 않습니다.

파일 이벤트만 전달됩니다. 디렉토리 자체의 `addDir` 및 `unlinkDir` 이벤트는 전달되지 않습니다. 관찰 중인 루트의 자체 수명 주기를 추적하는 통합은 파일시스템 상태를 확인(예: `stat` 사용)하고 독립적으로 조정해야 합니다. 하위의 `unlink`가 루트가 제거되었음을 증명하지는 않습니다.

## 작업 디렉토리에서 파일 이름 관찰

`|`로 구분된 리터럴 파일 이름으로 `FileChanged` hook을 추가합니다:

```json
{
  "hooks": {
    "FileChanged": [
      {
        "matcher": ".envrc|.env",
        "hooks": [
          {
            "type": "command",
            "name": "configuration-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

이는 세션의 cwd에 `.envrc`와 `.env`를 등록합니다. 정적 등록은 glob을 확장하거나 디렉토리를 재귀적으로 스캔하지 않습니다. 생략되거나 비어 있는 matcher, `*`, `.*`는 정적 경로를 등록하지 않습니다. 이러한 hook은 동적 경로를 포함하여 세션이 관찰하는 경로에서 이벤트를 수신합니다. 이벤트는 [기존 matcher 규칙](./hooks.md#matcher-patterns)을 사용하여 파일의 basename에 대해 필터링됩니다.

정규식 패턴은 이미 관찰 중인 경로를 필터링합니다. 해당 파일이나 디렉토리를 `watchPaths`를 통해 명시적으로 등록합니다.

정적 루트는 dotfiles를 포함한 순수 리터럴 파일 이름만 허용합니다. 정규식/glob 메타문자와 경로 구분자는 정적 루트를 생성하지 않습니다. 기존 디렉토리와 검사할 수 없는 경로는 제외됩니다. 누락된 파일은 생성을 위해 관찰될 수 있습니다. 정적 파일 검색은 순회 전에 관련 없는 항목을 제외하면서 부모 디렉토리를 관찰합니다. 재귀적 디렉토리에는 명시적 `watchPaths`를 사용하세요. 세션 작업 디렉토리를 변경하면 재위치 완료 전에 정적 루트가 재위치됩니다. 명시적 절대 동적 루트는 변경되지 않습니다.

## cwd 외부의 디렉토리 및 경로 관찰

성공적인 동기 `SessionStart` hook은 `hookSpecificOutput.watchPaths`를 통해 절대 파일이나 디렉토리를 등록할 수 있습니다. 디렉토리는 나중에 생성되는 하위를 포함하여 재귀적으로 관찰됩니다. 재귀 검색은 `.git` 및 `node_modules` 하위 트리를 건너뜁니다. 내부 경로를 관찰하려면 해당 파일이나 디렉토리를 명시적으로 등록하세요. 특수 파일 유형은 무시되며, 일반 디렉토리는 깊이 제한이 없습니다. 초기 등록은 `SessionStart`가 반환되기 전에 watcher 준비를 대기합니다.

재귀 검색은 `<target>.<12 lowercase hex characters>.tmp` 이름의 atomic-write 임시 파일을 무시합니다. 여기에는 지연된 이름 변경과 고아 파일이 포함됩니다. 이러한 파일을 명시적으로 등록하면 계속 관찰됩니다. 이 접미사를 가진 디렉토리는 계속 순회 가능하며, 다른 `.tmp` 파일은 정상적으로 관찰됩니다.

예를 들어, memory 폴더를 등록합니다:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "watch-memory-folders",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/watch-memory.mjs\""
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "memory-file-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

`watch-memory.mjs`가 이 JSON을 stdout에 출력하도록 합니다. 예제 경로를 `/memory`가 표시하는 실제 절대 폴더로 바꾸세요:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "watchPaths": [
      "/home/me/.qwen/projects/demo/memory",
      "/home/me/.qwen/memories"
    ]
  }
}
```

`FileChanged` hook에는 matcher가 없으므로 등록된 디렉토리 전체의 변경 사항을 수신합니다. 핸들러는 stdin에서 이벤트 JSON을 읽습니다. 관찰 경로 외부의 로그나 동기화 대상을 선택하여 자체 write로 핸들러가 트리거되는 것을 방지하세요.

## 동적 경로 업데이트

동일한 파일시스템의 여러 워크스페이스의 경우, 모든 실제 memory 디렉토리를 하나의 목록에 등록합니다. 수신 세션의 `cwd`가 아닌 `file_path`와 자체 디렉토리-워크스페이스 매핑을 사용하여 알림을 라우팅합니다. 독립적인 세션이 동일한 공유 루트를 관찰할 수 있으므로 비즈니스 핸들러에서 작업을 중복 제거합니다. 다른 컨테이너나 원격 인스턴스의 루트는 해당 파일시스템 소유자의 watcher가 필요합니다. 호스트에서 경로를 등록해도 관찰되지 않습니다.

성공적인 동기 `SessionStart` 및 `FileChanged` 출력은 `watchPaths`를 설정할 수 있습니다. `hookSpecificOutput`에 일치하는 `hookEventName`을 포함합니다.

| 출력                                  | 동적 경로에 대한 영향            |
| --------------------------------------- | ---------------------------------- |
| 절대 파일이나 디렉토리 목록 | 이전 동적 목록을 대체 |
| `[]`                                    | 동적 목록을 비움            |
| 생략되거나 유효하지 않은 `watchPaths`         | 이전 동적 목록을 유지    |
| 비동기 hook의 출력               | 경로를 등록하거나 변경하지 않음  |

여러 hook이 목록을 반환할 때, hook 실행 순서에서 마지막 유효하고 명시적으로 제공된 목록이 우선합니다. 모든 항목은 절대 경로여야 합니다. 하나의 유효하지 않은 항목이 목록을 유효하지 않게 만듭니다. 정적 파일 이름 등록은 동적 대체나 비우기 후에도 활성 상태로 유지됩니다.

`FileChanged` 핸들러에서 동적 경로를 비우려면 다음을 반환합니다:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "FileChanged",
    "watchPaths": []
  }
}
```

## 관찰 제한

초기 디렉토리 스캔은 리플레이되지 않습니다. 최근 write의 네이티브 파일시스템 이벤트는 등록 후에 도착할 수 있습니다. 명시적으로 등록된 심볼릭 링크 파일과 디렉토리 루트는 조상 경로의 링크를 포함하여 대상을 관찰합니다. 알림은 구성된 별칭을 사용합니다. 하나의 대상에 여러 별칭을 등록하면 각 별칭에 대한 알림이 생성됩니다. 링크를 재대상화한 후 등록을 새로 고치세요. 재귀 루트 내부에서 발견된 심볼릭 링크는 순회되지 않습니다. 이벤트는 write가 안정된 후에 보고됩니다. 관찰은 최선 노력입니다: 파일시스템 병합, 접근할 수 없는 경로, 프로세스 가동 중단, 경로 재구성이 간격을 남길 수 있습니다. 완전한 동기화 사본이 필요한 통합은 초기 스캔, 조정, 재시도를 처리해야 합니다. Watcher 또는 hook 실패는 기록되며 원본 파일 작업은 변경되지 않은 상태로 유지됩니다.

`FileChanged`는 write를 거부하거나 취소하거나 모델 컨텍스트를 추가할 수 없습니다. 명시적으로 등록된 경로만 관찰됩니다: memory 폴더는 자동으로 등록되지 않으며, 전용 auto-memory 활성화/비활성화 이벤트가 없습니다. 관찰된 파일을 write하는 hook은 자체적으로 트리거될 수 있습니다. 해당 write를 피하거나 작업을 중복 제거하세요.

SSH 실행 환경, 셸 샌드박스 워커, 관리되는 디스패처는 로컬 파일시스템 watcher를 시작하지 않습니다. 일반 hook 활성화 및 신뢰 규칙이 계속 적용됩니다. 관찰은 소유 세션이 종료될 때 중지됩니다.
