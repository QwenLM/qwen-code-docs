---
title: Todo Write Tool
---

# Todo Write 도구 (`todo_write`)

이 문서는 Qwen Code의 `todo_write` 도구에 대해 설명합니다.

## 설명

`todo_write`를 사용하여 현재 코딩 세션에 대한 구조화된 작업 목록을 생성하고 관리하세요. 이 도구는 AI 어시스턴트가 진행 상황을 추적하고 복잡한 작업을 정리하는 데 도움이 되며, 어떤 작업이 수행되고 있는지에 대한 가시성을 제공합니다.

### 인수

`todo_write`는 하나의 인수를 받습니다:

- `todos` (array, 필수): todo 항목의 배열이며, 각 항목은 다음을 포함합니다:
  - `content` (string, 필수): 작업에 대한 설명.
  - `status` (string, 필수): 현재 상태(`pending`, `in_progress` 또는 `completed`).
  - `id` (string, 필수): todo 항목의 고유 식별자.

## Qwen Code에서 `todo_write` 사용 방법

AI 어시스턴트는 복잡한 다단계 작업에서 작업할 때 자동으로 이 도구를 사용합니다. 명시적으로 요청할 필요는 없지만, 요청에 대한 계획된 접근 방식을 보고 싶다면 어시스턴트에게 todo 목록을 만들도록 요청할 수 있습니다.

이 도구는 홈 디렉토리(`~/.qwen/todos/`)에 세션별 파일로 todo 목록을 저장하므로, 각 코딩 세션은 자체 작업 목록을 유지합니다.

## AI가 이 도구를 사용하는 경우

어시스턴트는 다음 상황에서 `todo_write`를 사용합니다:

- 여러 단계가 필요한 복잡한 작업
- 여러 구성 요소가 있는 기능 구현
- 여러 파일에 걸친 리팩토링 작업
- 3개 이상의 고유한 작업이 포함된 모든 작업

어시스턴트는 간단한 단일 단계 작업이나 순수 정보 요청에는 이 도구를 사용하지 않습니다.

### `todo_write` 예시

기능 구현 계획 생성:

```
todo_write(todos=[
  {
    "id": "1",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "2",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "3",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## 중요 참고 사항

- **자동 사용:** AI 어시스턴트는 복잡한 작업 중에 자동으로 todo 목록을 관리합니다.
- **진행 상황 가시성:** 작업이 진행됨에 따라 todo 목록이 실시간으로 업데이트되는 것을 볼 수 있습니다.
- **세션 격리:** 각 코딩 세션은 다른 세션과 간섭하지 않는 자체 todo 목록을 가집니다.
