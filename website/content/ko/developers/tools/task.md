---
title: Agent Tool
---

# Agent 도구 (`agent`)

이 문서는 Qwen Code의 `agent` 도구에 대해 설명합니다.

## 설명

`agent`를 사용하여 전문 서브에이전트를 시작하여 복잡한 다단계 작업을 자율적으로 처리합니다. Agent 도구는 자체 도구 세트에 접근할 수 있는 전문 에이전트에 작업을 위임하여 독립적으로 작업할 수 있게 하며, 병렬 작업 실행과 전문 지식을 가능하게 합니다.

### 인수

`agent`는 다음 인수를 받습니다:

- `description` (string, 필수): 사용자 가시성 및 추적 목적을 위한 작업의 간단한(3-5 단어) 설명.
- `prompt` (string, required): 서브에이전트가 실행할 자세한 작업 프롬프트. 자율 실행을 위한 포괄적인 지시를 포함해야 합니다.
- `subagent_type` (string, 선택 사항): 이 작업에 사용할 전문 에이전트의 유형. 생략하면 기본값은 `general-purpose`.
- `fork_turns` (string, 선택 사항): `subagent_type="fork"`인 경우에만 유효. 생략하거나 `all`을 사용하여 전체 부모 대화를 포함하거나, `"3"`과 같은 양의 정수 문자열을 사용하여 최근 세 번의 실제 사용자 턴만 포함합니다. 도구 응답과 순수 시스템 리마인드는 턴으로 계산되지 않습니다.
- `fork_tools` (string 배열, 선택 사항): `subagent_type="fork"`인 경우에만 유효. 실행을 정확한 정규 도구 이름 또는 MCP 서버 패턴으로 제한하면서 포크의 현재 모델 표시 도구 선언을 변경하지 않아 프롬프트 캐시 공유를 가능하게 합니다. 항목에 주변 공백이 있을 수 없으며, 와일드카드는 `mcp__*` 또는 `mcp__github__read_*`와 같은 뒤따르는 MCP 도구 접두사 패턴으로 제한됩니다. Fork는 `ask_user_question`을 절대 실행하지 않습니다. `fork_tools`를 생략하면 다른 모든 상속된 도구를 허용하고, 빈 배열을 사용하면 모든 도구 호출을 거부합니다.
- `fork_profile` (string, 선택 사항): `subagent_type="fork"`인 경우에만 유효. 활성 프로젝트 루트에서 최대 64 KiB의 frontmatter 전용 일반 `.qwen/fork-profiles/<name>.md`를 로드하고 필수 `tools` 배열과 최대 200자의 선택적 `promptHint`를 적용합니다. 파일은 프로젝트 프로파일 디렉토리 밖으로 해석될 수 없습니다. `fork_profile`은 `fork_tools` 또는 이름 있는 팀원과 함께 사용할 수 없으며, safe mode나 bare mode에서는 사용할 수 없습니다.
- `run_in_background` (boolean, 선택 사항): 최상위 일반 에이전트의 경우 기본값은 `true`. 일반 에이전트의 결과를 인라인으로 기다리려면 `false`로 설정합니다. 헤드리스 포크는 항상 백그라운드에서 실행됩니다. 중첩 에이전트는 `run_in_background`이 명시적으로 `true`가 아닌 한 포그라운드에서 실행되며, 중첩 에이전트는 백그라운드 완료 알림을 받을 수 없으므로 `true`는 거부됩니다. 호출자 소유 `working_dir` 실행은 포그라운드에서 실행되며 명시적 또는 구성된 백그라운드 실행을 거부합니다.
- `isolation` (string, 선택 사항): `"worktree"`로 설정하여 Qwen Code가 생성하고 관리하는 격리된 git worktree에서 명시적으로 이름 지정된 비-fork 에이전트를 실행합니다.
- `working_dir` (string, 선택 사항): 명시적으로 이름 지정된 비-fork 에이전트를 현재 리포지토리 내의 기존 등록된 git worktree에 고정합니다. 호출자가 worktree 라이프사이클을 소유하므로 이 모드는 포그라운드에서 실행됩니다. `working_dir`과 `isolation`이 모두 제공되면 `working_dir`이 우선합니다.

## Qwen Code에서 `agent` 사용 방법

Agent 도구는 구성에서 사용 가능한 서브에이전트를 동적으로 로드하고 작업을 위임합니다. 각 서브에이전트는 독립적으로 실행되며 자체 도구 세트를 사용할 수 있어 전문 지식과 병렬 실행이 가능합니다.

Agent 도구를 사용하면 서브에이전트는:

1. 작업 프롬프트와 포크의 경우 선택된 부모 대화 컨텍스트를 받습니다
2. 사용 가능한 도구를 사용하여 작업을 실행합니다
3. 기본적으로 완료 알림을 보고하거나, 일반 에이전트가 포그라운드에서 실행될 때 최종 결과 메시지를 반환합니다
4. 보존된 상태가 계속을 지원하는 경우 백그라운드 실행 후에도 주소 지정 가능한 상태로 유지됩니다

사용법:

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
agent(description="Brief task description", prompt="Detailed task instructions for the fork", subagent_type="fork", fork_turns="3")
agent(description="Read-only investigation", prompt="Inspect the implementation", subagent_type="fork", fork_tools=["read_file", "grep_search", "mcp__github"])
agent(description="Profiled investigation", prompt="Inspect the implementation", subagent_type="fork", fork_profile="ro-research")
```

현재 턴이 서브에이전트 결과를 계속하기 전에 사용해야 하는 경우 `run_in_background=false`를 설정하세요.

## 사용 가능한 서브에이전트

사용 가능한 서브에이전트는 구성에 따라 다릅니다. 일반적인 서브에이전트 유형은 다음과 같을 수 있습니다:

- **general-purpose**: 다양한 도구가 필요한 복잡한 다단계 작업용
- **code-reviewer**: 코드 품질 검토 및 분석용
- **test-runner**: 테스트 실행 및 결과 분석용
- **documentation-writer**: 문서 생성 및 업데이트용

Qwen Code에서 `/agents` 명령을 사용하여 사용 가능한 서브에이전트를 확인할 수 있습니다.

## Agent 도구 기능

### 실시간 진행 업데이트

Agent 도구는 다음을 보여주는 실시간 업데이트를 제공합니다:

- 서브에이전트 실행 상태
- 서브에이전트가 수행하는 개별 도구 호출
- 도구 호출 결과 및 오류
- 전체 작업 진행 및 완료 상태

### 병렬 실행

단일 메시지에서 Agent 도구를 여러 번 호출하여 여러 서브에이전트를 동시에 시작할 수 있으며, 병렬 작업 실행과 향상된 효율성이 가능합니다.

### 전문 지식

각 서브에이전트는 다음으로 구성할 수 있습니다:

- 특정 도구 접근 권한
- 전문 시스템 프롬프트 및 지시사항
- 사용자 정의 모델 구성
- 도메인별 지식 및 기능

### 백그라운드 에이전트 계속

백그라운드 에이전트는 초기 완료 후 후속 작업을 받을 수 있습니다:

1. `list_agents`를 호출하여 현재 세션의 주소 지정 가능한 백그라운드 에이전트와 해당 `task_id` 값을 발견합니다. 여기에는 부모 세션 재개 후 복원된 호환 에이전트가 포함됩니다.
2. `task_id`와 후속 지시와 함께 `send_message`를 호출합니다. 실행 중인 에이전트는 다음 도구 라운드 경계에서 메시지를 받고, 일시 중지된 에이전트는 메시지와 함께 재개되며, 완료된 에이전트는 사용 가능한 상주 런타임에서 계속하거나 보존된 트랜스크립트에서 부활합니다.
3. 후속 결과를 사용하기 전에 다음 완료 알림을 기다립니다.

에이전트를 계속할 수 없는 경우, `list_agents`는 `resume_blocked_reason`을 반환합니다. 복원되거나 계속된 에이전트의 출력을 증거로 취급하고 변경을 통합하기 전에 검증하세요.

## `agent` 예시

### general-purpose 에이전트에 위임

```
agent(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### 병렬 작업 실행

```
# 코드 리뷰와 테스트 실행을 병렬로 시작
agent(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="general-purpose"
)

agent(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-engineer"
)
```

### 문서 생성

```
agent(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="general-purpose"
)
```

## Agent 도구를 사용해야 하는 경우

다음 상황에서 Agent 도구를 사용합니다:

1. **복잡한 다단계 작업** - 자율적으로 처리할 수 있는 여러 작업이 필요한 작업
2. **전문 지식** - 도메인별 지식이나 도구가 이점을 제공하는 작업
3. **병렬 실행** - 동시에 실행할 수 있는 여러 독립 작업이 있는 경우
4. **위임 필요** - 단계를 세밀하게 관리하기보다 완전한 작업을 넘기고 싶은 경우
5. **리소스 집약적 작업** - 상당한 시간이나 계산 리소스가 소요될 수 있는 작업

## Agent 도구를 사용하면 안 되는 경우

다음 경우에는 Agent 도구를 사용하지 마세요:

- **간단한 단일 단계 작업** - Read, Edit 등 직접 도구를 사용하세요
- **대화형 작업** -来回 통신이 필요한 작업
- **특정 파일 읽기** - 더 나은 성능을 위해 Read 도구를 직접 사용하세요
- **간단한 검색** - Grep 또는 Glob 도구를 직접 사용하세요

## 중요 참고 사항

- **독립 컨텍스트**: 일반 서브에이전트는 부모 대화 기록 없이 시작합니다. 포크는 기본적으로 전체 대화를 상속하며, 제한된 최근 창이 충분할 때 `fork_turns`를 허용합니다.
- **서브에이전트 상호 작용**: 일반 서브에이전트는 `ask_user_question`을 받지 않습니다. 포크는 캐시 공유를 위해 부모의 선언 목록을 유지하지만 스케줄링 또는 승인 전에 해당 도구를 거부합니다. 누락된 사용자 입력이 작업을 차단하는 경우, 서브에이전트는 차단 사항을 부모에게 보고합니다.
- **Fork 실행 제한**: `fork_tools`는 포크가 실행할 수 있는 이미 선언된 도구를 추가로 좁힙니다. 허용되지 않는 호출은 스케줄링 또는 승인 전에 오류를 반환합니다. 동일한 선언 목록이 캐시 공유를 위해 모델에 표시된 상태로 유지됩니다. 이것은 호출자가 선택한 호출별 제한이며, 관리자가 시행하는 샌드박스가 아닙니다.
- **Fork 프로파일**: `.qwen/fork-profiles/` 아래의 프로젝트 프로파일은 `fork_tools`와 동일한 실행 게이트를 재사용합니다. 시작 전에 한 번 해석되며, 해석된 목록은 부활을 위해 지속되고, 선택적 `promptHint`는 작업 지시에만 추가됩니다.
- **완료 전달**: 백그라운드 결과는 이후 턴의 완료 알림을 통해 도착합니다. 알림이 도착하기 전에 결과를 가정하지 마세요.
- **계속**: 관련 후속 작업에는 중복 에이전트를 시작하는 대신 `list_agents`와 `send_message`를 사용하세요. 계속은 호환되는 보존된 상태에 따라 달라지며 사용 불가능할 수 있습니다.
- **포괄적 프롬프트**: 초기 프롬프트에는 자율 실행에 필요한 모든 컨텍스트와 지시가 포함되어야 합니다. 일반 서브에이전트는 부모 대화를 볼 수 없습니다.
- **도구 접근**: 서브에이전트는 특정 구성에 구성된 도구에만 접근할 수 있습니다
- **병렬 기능**: 여러 서브에이전트가 향상된 효율성을 위해 동시에 실행될 수 있습니다
- **구성 의존**: 사용 가능한 서브에이전트 유형은 시스템 구성에 따라 다릅니다

## 설정

서브에이전트는 Qwen Code의 에이전트 구성 시스템을 통해 구성됩니다. `/agents` 명령을 사용하여 다음을 수행합니다:

- 사용 가능한 서브에이전트 확인
- 새 서브에이전트 구성 생성
- 기존 서브에이전트 설정 수정
- 도구 권한 및 기능 설정

서브에이전트 구성에 대한 자세한 정보는 서브에이전트 문서를 참조하세요.
