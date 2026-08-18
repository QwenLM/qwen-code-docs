# 서브에이전트

서브에이전트는 Qwen Code 내에서 특정 유형의 작업을 처리하는 전문 AI 어시스턴트입니다. 작업별 프롬프트, 도구, 동작이 구성된 AI 에이전트에 집중 작업을 위임할 수 있습니다.

## 서브에이전트란?

서브에이전트는 독립적인 AI 어시스턴트로, 다음 특성을 가집니다:

- **특정 작업 전문화** - 각 서브에이전트는 특정 유형의 작업에 집중하도록 시스템 프롬프트가 구성됩니다
- **독립 컨텍스트** - 메인 대화와 분리된 자체 대화 기록을 유지합니다
- **통제된 도구 사용** - 각 서브에이전트가 접근할 수 있는 도구를 구성할 수 있습니다
- **자율 작동** - 작업이 부여되면 완료 또는 실패할 때까지 독립적으로 작업합니다
- **상세한 피드백** - 진행 상황, 도구 사용, 실행 통계를 실시간으로 확인할 수 있습니다

## Fork 서브에이전트

Qwen Code는 이름 지정 서브에이전트 외에도 **포킹**을 지원합니다 — `subagent_type: "fork"`로 명시적으로 선택합니다. Fork는 부모의 전체 대화 컨텍스트를 상속하며 일반적으로 백그라운드에서 분리되어 실행됩니다. Fork는 인터랙티브 세션과 헤드리스 세션 모두에서 동작합니다. 헤드리스 fork는 항상 백그라운드 경로를 사용합니다. `subagent_type`을 생략하면 fork가 **아니며**, 범용 서브에이전트가 실행됩니다. 최상위 이름 지정 서브에이전트는 기본적으로 백그라운드에서 실행되며 완료 알림을 통해 결과를 전달합니다. 일반 서브에이전트의 결과를 현재 턴에서 바로 기다려야 하는 경우 `run_in_background: false`를 설정합니다.

## `fork_turns`로 Fork 컨텍스트 제어

`fork_turns`는 `subagent_type: "fork"`에서만 사용합니다:

- 생략하거나 `all`을 사용하면 부모 대화 전체를 상속합니다.
- `"3"`과 같은 양의 정수 문자열은 가장 최근 세 개의 실제 사용자 턴을 상속합니다.

도구 응답과 순수 시스템 리마인드는 사용자 턴으로 계산하지 않습니다. 일반 이름 지정 서브에이전트와 에이전트 팀 팀메이트는 `fork_turns`를 받지 않으며, 독립적인 대화 컨텍스트를 유지합니다.

## `fork_tools`로 Fork 도구 실행 제한

`fork_tools`는 `subagent_type: "fork"`에서만 사용합니다. 배열에는 `read_file`, `grep_search` 같은 정확한 표준 도구 이름이나 `mcp__github` 같은 MCP 서버 패턴을 포함할 수 있습니다. Fork는 제한 없는 fork와 동일한 모델 노출 도구 선언을 받으며 프롬프트 캐시 접두사가 유지되지만, 작업 프롬프트가 제한을 식별하고 `fork_tools`와 일치하지 않는 호출은 스케줄링 또는 승인 전에 거부됩니다.

- Fork는 `ask_user_question`을 절대 실행하지 않습니다. 사용자 입력이 필요하면 부모 에이전트에 차단 사항을 보고합니다.
- `fork_tools`를 생략하면 다른 모든 상속 도구를 허용합니다.
- 빈 배열은 모든 도구 호출을 거부합니다.
- `*`는 허용되지 않습니다. 모든 실행 가능한 상속 도구를 허용하려면 `fork_tools`를 생략합니다.
- 도구 이름에 앞뒤 공백이 있으면 안 됩니다. 와일드카드는 `mcp__*` 또는 `mcp__github__read_*`와 같은 MCP 도구 접두사 패턴에서만 허용됩니다.
- `mcp__*`는 의도적으로 모든 MCP 도구를 허용하면서도 나열되지 않은 내장 도구는 거부합니다.
- 셸 명령어 인수 패턴은 지원되지 않습니다. `run_shell_command`을 나열하면 해당 도구가 일반 권한 검사를 통과하지만 어떤 명령어도 사전 승인하지 않습니다.

이것은 호출자가 제공하는 호출별 제한입니다. 자식 fork의 기능을 좁히지만, 호출자가 목록을 생략하거나 확장할 수 있으므로 관리자가 강제하는 보안 샌드박스는 아닙니다.

## `fork_profile`로 Fork 제한 재사용

프로젝트는 `.qwen/fork-profiles/<name>.md`에 이름 지정 fork 제한을 저장하고 `fork_profile`로 선택할 수 있습니다. 여러 호출이 동일한 도구 경계와 작업 안내가 필요할 때 유용합니다:

```markdown
---
name: ro-research
tools:
  - read_file
  - grep_search
  - glob
  - mcp__search__*
promptHint: |
  Work read-only. Prefer targeted searches and cite file evidence.
---
```

그런 다음 fork를 다음과 같이 실행합니다:

```text
agent(description="Research", prompt="Inspect the retry path", subagent_type="fork", fork_profile="ro-research")
```

- `fork_profile`은 fork에만 유효하며 `fork_tools`나 이름 지정 팀메이트와 함께 사용할 수 없습니다.
- 프로필은 현재 프로젝트 전용입니다. 요청된 이름, 파일 이름, frontmatter `name`이 정확히 일치해야 합니다. 프로필은 `.qwen/fork-profiles/` 내의 일반 파일로 해석되어야 하며 64 KiB를 초과할 수 없습니다.
- `tools`는 필수이며 `fork_tools` 규칙을 따릅니다. 빈 배열 거부 동작도 포함됩니다.
- `promptHint`는 선택 사항이며 200자로 제한됩니다. 이스케이프 처리되어 fork 지시문 이후, 권위 있는 도구 제한 이전에 프로젝트 제공 안내로 프레이밍됩니다. 상속된 시스템 지시나 모델 노출 도구 선언을 변경하지 않습니다. 프로필 파일은 frontmatter 전용이므로 닫는 `---` 이후의 비어 있지 않은 마크다운은 조용히 무시되는 대신 거부됩니다.
- 프로필은 실행 시 한 번만 해석됩니다. 유지된 fork는 프로젝트 파일이 나중에 변경되어도 해석된 도구 스냅샷으로 계속 진행합니다.
- 프로젝트 fork 프로필은 로컬 커스터마이제이션을 비활성화하는 안전 모드(safe mode)와 베어 모드(bare mode)에서는 사용할 수 없습니다.

`fork_tools`와 마찬가지로, fork 프로필은 호출자 선택 제한이며 관리자 샌드박스가 아닙니다. 선택적인 프롬프트 안내는 프로젝트 제어 콘텐츠입니다.

### Fork와 이름 지정 서브에이전트의 차이점

|               | 이름 지정 서브에이전트                                         | Fork 서브에이전트                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 컨텍스트       | 부모 대화 기록 없이 새로 시작                                   | 기본적으로 전체 부모 기록을 상속. `fork_turns`로 최근 제한된 창을 선택할 수 있음                                                                                                                          |
| 시스템 프롬프트 | 자체 구성된 프롬프트 사용                                      | 부모의 정확한 시스템 프롬프트 사용 (캐시 공유를 위해)                                                                                                                                                     |
| 도구           | 인터랙티브 질문 도구가 없는 구성된 선언 집합                    | 캐싱을 위해 부모 파생 선언 집합을 유지. 실행은 항상 `ask_user_question`을 거부하며, `fork_tools` 또는 `fork_profile`으로 선언을 변경하지 않고 독립적으로 좁힐 수 있음                                     |
| 실행           | 기본적으로 백그라운드. 명시적 포그라운드 옵트아웃 지원          | 항상 분리됨. 부모가 즉시 계속 진행                                                                                                                                                                        |
| 사용 사례      | 전문화된 작업 (테스트, 문서)                                    | 현재 컨텍스트가 필요한 병렬 작업                                                                                                                                                                          |

### Fork가 사용되는 경우

AI는 다음이 필요할 때 자동으로 fork를 사용합니다:

- 여러 연구 작업을 병렬로 실행 (예: "모듈 A, B, C를 조사해줘")
- 메인 대화를 계속하면서 백그라운드 작업 수행
- 현재 대화 컨텍스트에 대한 이해가 필요한 작업 위임

### 프롬프트 캐시 공유

모든 fork는 부모의 정확한 API 요청 접두사(시스템 프롬프트, 도구, 대화 기록)를 공유하여 DashScope 프롬프트 캐시 적중을 가능하게 합니다. 3개의 fork가 병렬로 실행될 때, 공유 접두사는 한 번 캐시되고 재사용되어 독립 서브에이전트 대비 80% 이상의 토큰 비용을 절감합니다.

### 재귀 위임 방지

Fork 자식은 추가 서브에이전트를 생성할 수 없습니다. 런타임에서 강제됩니다 — fork가 Agent 도구를 호출하면 작업을 직접 실행하라는 오류를 받습니다.

### 현재 제한 사항

- **Worktree 격리 없음**: Fork는 부모의 작업 디렉토리를 공유합니다. 여러 fork의 동시 파일 수정이 충돌할 수 있습니다.

## 주요 이점

- **작업 전문화**: 특정 워크플로우(테스트, 문서화, 리팩토링 등)에 최적화된 에이전트를 생성합니다
- **컨텍스트 격리**: 전문화된 작업을 메인 대화와 분리합니다
- **컨텍스트 상속**: Fork 서브에이전트는 기본적으로 전체 대화를 상속하며 최근 부모 턴의 제한된 수를 선택할 수 있습니다
- **프롬프트 캐시 공유**: Fork 서브에이전트는 부모의 캐시 접두사를 공유하여 토큰 비용을 절감합니다
- **재사용성**: 에이전트 구성을 프로젝트와 세션에 걸쳐 저장하고 재사용합니다
- **통제된 접근**: 보안과 집중을 위해 각 에이전트가 사용할 수 있는 도구를 제한합니다
- **진행 상황 가시성**: 실시간 진행 업데이트로 에이전트 실행을 모니터링합니다

## 서브에이전트 동작 방식

1. **구성**: 서브에이전트의 동작, 도구, 시스템 프롬프트를 정의하는 서브에이전트 구성을 생성합니다
2. **위임**: 메인 AI는 자동으로 적절한 서브에이전트에 작업을 위임하거나 — 부모 대화 컨텍스트가 필요하면 자체 fork(`subagent_type: "fork"`)를 생성합니다
3. **실행**: 서브에이전트는 구성된 도구를 사용하여 독립적으로 작업을 완료합니다
4. **결과**: 백그라운드 실행은 결과를 포함하는 완료 알림을 메인 대화로 전송합니다. 포그라운드 일반 서브에이전트는 결과를 인라인으로 반환합니다
5. **계속**: 메인 AI는 `list_agents`를 사용하여 백그라운드 에이전트를 찾고 `send_message`를 사용하여 실행 중, 일시 중지 또는 완료된 에이전트를 계속할 수 있습니다

## 백그라운드 에이전트 계속

최상위 일반 서브에이전트는 기본적으로 백그라운드에서 실행됩니다. 백그라운드 에이전트가 완료된 후, Qwen Code는 중복 에이전트를 실행하지 않고 관련 작업을 계속할 수 있을 만큼의 상태를 유지합니다:

- `list_agents`는 현재 세션에서 주소 지정 가능한 백그라운드 에이전트를 반환하며, 재개된 세션과 함께 복원된 호환 에이전트도 포함됩니다. 각 항목에는 `task_id`, 상태, 메시지 수신 가능 여부가 포함됩니다.
- 해당 `task_id`와 함께 `send_message`를 사용하면 실행 중인 에이전트에 메시지를 큐잉하거나, 일시 중지된 에이전트를 재개하거나, 완료된 에이전트를 계속합니다. 완료된 에이전트는 사용 가능한 경우 상주 런타임을 재사용하고, 그렇지 않으면 보존된 트랜스크립트에서 부활합니다.
- 계속된 에이전트는 다음 결과를 또 다른 완료 알림을 통해 보고합니다.

세션이 복원되면 호환 백그라운드 에이전트가 세션 목록에 다시 추가됩니다. 보존된 상태가 누락되었거나 호환되지 않아 작업이 보이지만 계속할 수 없는 경우가 있을 수 있습니다. `list_agents`가 해당 사유를 보고합니다.

관련 후속 작업에는 계속을 사용하세요. 작업이 관련이 없거나 이전 에이전트를 재개할 수 없는 경우 새 에이전트를 실행하세요.

## 에이전트 작업 디렉토리

이름 지정 일반 서브에이전트의 경우, `working_dir`는 에이전트를 현재 저장소의 기존 git worktree에 고정합니다. 상대 경로는 현재 디렉토리에서 해석되며, worktree는 이미 git에 등록되어 있어야 하고 저장소 내부에 있어야 합니다.

`working_dir` 실행은 포그라운드에서 실행됩니다. Qwen Code가 해당 worktree의 라이프사이클을 소유하지 않기 때문입니다. `subagent_type: "fork"` 또는 백그라운드 실행과 함께 사용할 수 없습니다. `working_dir`와 `isolation: "worktree"`가 모두 제공되면, Qwen Code는 새 worktree를 생성하는 대신 호출자 소유 worktree를 재사용합니다.

## 시작하기

### 빠른 시작

1. **첫 서브에이전트 생성**:

   `/agents create`

   안내 마법사를 따라 전문 에이전트를 생성합니다.

2. **기존 에이전트 관리**:

   `/agents manage`

   구성된 서브에이전트를 보고 관리합니다.

3. **서브에이전트 자동 사용**: 메인 AI에게 서브에이전트의 전문 분야에 맞는 작업을 요청하면 됩니다. AI가 자동으로 적절한 작업을 위임합니다.

### 사용 예시

```
사용자: "인증 모듈에 대한 종합적인 테스트를 작성해줘"
AI: 테스트 전문 서브에이전트에 위임하겠습니다.
["testing-expert" 서브에이전트에 위임]
[테스트 생성의 실시간 진행 상황 표시]
[완료된 테스트 파일과 실행 요약 반환]
```

## 관리

### CLI 명령어

서브에이전트는 `/agents` 슬래시 명령어와 하위 명령어로 관리합니다:

**사용법**: `/agents create`. 안내 단계 마법사를 통해 새 서브에이전트를 생성합니다.

**사용법**: `/agents manage`. 기존 서브에이전트를 보고 관리하는 인터랙티브 관리 대화 상자를 엽니다.

### 저장 위치

서브에이전트는 여러 위치에 마크다운 파일로 저장됩니다:

- **프로젝트 수준**: `.qwen/agents/` (최우선 순위)
- **사용자 수준**: `~/.qwen/agents/` (폴백)
- **확장 수준**: 설치된 확장에서 제공

이를 통해 프로젝트별 에이전트, 모든 프로젝트에서 작동하는 개인 에이전트, 전문 기능을 추가하는 확장 제공 에이전트를 가질 수 있습니다.

### 확장 서브에이전트

확장은 활성화되면 사용할 수 있는 사용자 정의 서브에이전트를 제공할 수 있습니다. 이 에이전트는 확장의 `agents/` 디렉토리에 저장되며 개인 및 프로젝트 에이전트와 동일한 형식을 따릅니다.

확장 서브에이전트:

- 확장이 활성화되면 자동으로 검색됩니다
- `/agents manage` 대화 상자의 "Extension Agents" 섹션에 표시됩니다
- 직접 편집할 수 없습니다 (대신 확장 소스를 편집)
- 사용자 정의 에이전트와 동일한 구성 형식을 따릅니다

어떤 확장이 서브에이전트를 제공하는지 확인하려면 확장의 `qwen-extension.json` 파일에서 `agents` 필드를 확인하세요.

### 파일 형식

서브에이전트는 YAML frontmatter가 있는 마크다운 파일로 구성됩니다. 이 형식은 사람이 읽기 쉽고 모든 텍스트 편집기로 쉽게 편집할 수 있습니다.

#### 기본 구조

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # 선택 사항: inherit, fast, modelId, 또는 authType:modelId
approvalMode: auto-edit # 선택 사항: default, plan, auto-edit, yolo, bubble
tools:         # 선택 사항: 도구 허용 목록
  - tool1
  - tool2
disallowedTools: # 선택 사항: 도구 차단 목록
  - tool3
---

시스템 프롬프트 콘텐츠가 여기에 들어갑니다.
여러 단락을 지원합니다.
```

#### 모델 선택

선택 사항인 `model` frontmatter 필드를 사용하여 서브에이전트가 사용하는 모델을 제어합니다:

- `inherit`: 메인 대화와 동일한 모델을 사용합니다.
- 필드 생략: `inherit`와 동일합니다.
- `fast`: 구성된 `fastModel`을 사용합니다. 유효한 fast 모델이 구성되지 않으면 서브에이전트가 `inherit`로 폴백합니다.
- `glm-5`: 해당 모델 ID를 사용합니다. Qwen Code는 먼저 메인 대화의 auth type을 확인합니다. 해당 모델을 사용할 수 없으면 다른 구성된 프로바이더에서 모델을 해석할 수 있습니다.
- `openai:gpt-4o`: 명시적 프로바이더와 모델 ID를 사용합니다. 서브에이전트가 메인 대화와 다른 auth type으로 등록된 모델에서 실행되어야 할 때 유용합니다.

예시:

```
---
name: fast-reviewer
description: 구성된 fast 모델로 작은 diff를 리뷰합니다
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: 연구 작업에 OpenAI 호환 프로바이더를 사용합니다
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

`fast` 선택자는 `settings.json` 또는 `/model --fast`로 구성된 동일한 `fastModel` 설정을 사용합니다. 해당 설정 자체는 `openai:deepseek-v4-flash`와 같이 다른 구성된 auth type의 모델을 참조할 수 있습니다. 선택자가 다른 auth type으로 해석되면, Qwen Code는 해당 서브에이전트 요청을 위한 전용 런타임 프로바이더를 생성하고 프로바이더에 최소한의 모델 ID만 전송합니다.

내장 Explore 에이전트는 기본적으로 메인 세션 모델을 상속합니다. 해당 내장 에이전트에 대해서만 다른 모델을 선택하려면 `settings.json`에서 `agents.builtin.exploreModel`을 구성하고 Qwen Code를 재시작합니다:

이전 버전은 기본적으로 Explore에 `fastModel`을 사용했습니다. 해당 동작을 유지하려면 `agents.builtin.exploreModel`을 `fast`로 설정합니다.

```json
{
  "agents": {
    "builtin": {
      "exploreModel": "fast"
    }
  }
}
```

이 설정은 위에서 설명한 것과 동일한 선택자를 허용합니다. Qwen Code가 내장 Explore 정의를 해석할 때만 적용됩니다. Explore라는 이름의 세션, 프로젝트, 사용자 또는 확장 에이전트는 자체 `model` 설정을 유지합니다.

모델이 사용자 정의 등급에서 선택할 수 있도록 하면서 구체적인 모델 ID를 노출하지 않으려면 `agents.modelGrades`를 구성하고 선택적으로 `agents.allowedGrades`로 제한합니다:

```json
{
  "agents": {
    "modelGrades": {
      "small": "fast",
      "high": "qwen-max"
    },
    "allowedGrades": ["small", "high"]
  }
}
```

그러면 Agent 도구는 일반 서브에이전트에 대해 `model: "small"` 또는 `model: "high"`를 허용합니다. 알 수 없거나 허용되지 않는 등급 선택, fork 및 이름 지정 팀메이트 등급 선택은 거부됩니다. 사용자 정의 에이전트의 명시적 모델은 여전히 등급보다 우선합니다.

#### 권한 모드

선택 사항인 `approvalMode` frontmatter 필드를 사용하여 서브에이전트의 도구 호출 승인 방식을 제어합니다. 유효한 값:

- `default`: 도구는 인터랙티브 승인이 필요합니다 (메인 세션 기본값과 동일)
- `plan`: 분석 전용 모드 — 에이전트가 계획을 세우지만 변경을 실행하지 않습니다
- `auto-edit`: 도구가 프롬프트 없이 자동 승인됩니다 (대부분의 에이전트에 추천)
- `yolo`: 잠재적으로 파괴적인 도구를 포함한 모든 도구가 자동 승인됩니다
- `bubble`: 백그라운드 에이전트의 도구 승인이 부모 세션에 표시됩니다

이 필드를 생략하면 서브에이전트의 권한 모드가 자동으로 결정됩니다:

- 부모 세션이 **yolo** 또는 **auto-edit** 모드이면, 서브에이전트가 해당 모드를 상속합니다. 허용적인 부모는 허용적으로 유지됩니다.
- 부모 세션이 **plan** 모드이면, 서브에이전트는 plan 모드를 유지합니다. 분석 전용 세션은 위임된 에이전트를 통해 파일을 변경할 수 없습니다.
- 부모 세션이 **default** 모드이면 (신뢰할 수 있는 폴더에서), 서브에이전트는 자율적으로 작업할 수 있도록 **auto-edit**를 받습니다.

`approvalMode`를 설정하더라도 부모의 허용 모드가 여전히 우선합니다. 예를 들어, 부모가 yolo 모드이면 `approvalMode: plan`인 서브에이전트도 yolo 모드로 실행됩니다.

```
---
name: cautious-reviewer
description: 변경 없이 코드를 리뷰합니다
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

You are a code reviewer. Analyze the code and report findings.
Do not modify any files.
```

#### 도구 구성

`tools`와 `disallowedTools`를 사용하여 서브에이전트가 접근할 수 있는 도구를 제어합니다.

**`tools` (허용 목록):** 지정되면 서브에이전트는 나열된 도구만 사용할 수 있습니다. 생략되면 서브에이전트는 부모 세션에서 사용 가능한 모든 도구를 상속합니다.

```
---
name: reader
description: 코드 탐색을 위한 읽기 전용 에이전트
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (차단 목록):** 지정되면 나열된 도구가 서브에이전트의 도구 풀에서 제거됩니다. 모든 허용된 도구를 나열하지 않고 "X를 제외한 모든 것"을 원할 때 유용합니다.

```
---
name: safe-worker
description: 파일을 수정할 수 없는 에이전트
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

`tools`와 `disallowedTools`가 모두 설정되면 허용 목록이 먼저 적용되고, 차단 목록이 해당 집합에서 제거합니다.

**MCP 도구**도 동일한 규칙을 따릅니다. 서브에이전트에 `tools` 목록이 없으면 부모 세션에서 모든 MCP 도구를 상속합니다. 서브에이전트에 명시적 `tools` 목록이 있으면 해당 목록에 명시적으로 이름 지정된 MCP 도구만 받습니다.

`disallowedTools` 필드는 MCP 서버 수준 패턴을 지원합니다:

- `mcp__server__tool_name` — 특정 MCP 도구를 차단합니다
- `mcp__server` — 해당 MCP 서버의 모든 도구를 차단합니다

```
---
name: no-slack
description: Slack 접근이 없는 에이전트
disallowedTools:
  - mcp__slack
---
```

#### Claude Code 호환 필드

Qwen Code는 아래 Claude Code 2.1.168 frontmatter 필드를 허용하므로 CC 에이전트 파일을 `.qwen/agents/`에 넣으면 지원되는 필드가 동일하게 파싱됩니다. 잘못된 값이 있는 선택적 필드는 거부되는 대신 파싱 시 조용히 삭제됩니다 — CC가 사용하는 것과 동일한 관대한 자세입니다.

| 필드               | 유형               | 참고 사항                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`   | enum 문자열         | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. 파싱 시 `approvalMode`로 매핑됩니다. 둘 다 설정되면 명시적 `approvalMode`가 우선합니다.                                                                                                                |
| `maxTurns`         | 양의 정수           | 에이전트의 턴 예산을 제한합니다. 런타임에 `runConfig.max_turns`로 연결됩니다. 둘 다 설정되면 최상위 필드가 우선합니다. 레거시 중첩 값은 두 가지 정보 소스를 방지하기 위해 저장 시 디스크 파일에서 정리됩니다.                                                                      |
| `color`            | enum 문자열         | 표시 색상. 허용 목록: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (CC의 `_Y`를 미러링). 레거시 qwen 센티널 `auto`는 하위 호환성을 위해 보존됩니다. 다른 값은 파싱 시 조용히 삭제됩니다.                                                                |
| `mcpServers`       | 사양의 레코드       | 에이전트별 MCP 서버 오버라이드. 에이전트가 생성될 때 세션 수준 MCP 서버 집합과 병합됩니다. 키 충돌 시 에이전트의 사양이 우선합니다 (CC의 `scope: 'agent'` 시맨틱과 일치). 잘못된 항목은 전체 에이전트를 실패시키는 대신 키별로 경고와 함께 삭제됩니다.                                 |
| `hooks`            | 배열의 레코드       | 에이전트별 hook. 키는 CC hook 이벤트 이름(`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …)입니다. 값은 `settings.json`의 `hooks` 필드와 동일한 형태의 `{ matcher?, hooks: [...] }` 정의 배열입니다. 에이전트가 실행되는 동안 등록되고, 중지되면 제거됩니다.                     |

위 모든 것을 포함한 예시:

```
---
name: rigorous-reviewer
description: 턴 제한이 있는 심층 코드 리뷰
permissionMode: plan
maxTurns: 50
color: cyan
tools:
  - read_file
  - grep_search
  - glob
mcpServers:
  filesystem:
    type: stdio
    command: node
    args: [/usr/local/lib/mcp-fs/server.js]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: echo "review-agent about to run a shell command"
---

You are a code reviewer. Analyze the code thoroughly and report findings
ordered by severity.
```

나머지 CC frontmatter 필드 — `effort`, `skills`, `initialPrompt`, `memory`, `isolation` — 은 선언적 에이전트 설계 문서에 문서화되어 있으며, prerequisite 인프라가 준비되면 후속 PR에서 적용됩니다 (`effort`는 모델 계층 파라미터가 필요, `memory`는 범위 지정 메모리 서브시스템이 필요, `--agent` CLI 플래그는 `initialPrompt`를 활성화 등).

> **`hooks` v1 제한 사항.** `hooks`를 선언한 서브에이전트가 실행되는 동안, 해당 hook 항목은 해당 서브에이전트의 자체 도구 호출뿐만 아니라 세션의 모든 일치하는 이벤트에 대해 실행됩니다. 서로 다른 에이전트별 hook 집합을 가진 두 개의 서브에이전트가 동시에 실행되면, 두 집합 모두 두 에이전트 모두에 대해 실행됩니다. hook 실행 시점의 에이전트별 범위 필터링은 후속 작업으로 남깁니다. v1에서는 에이전트의 실행 기간 동안 전역적으로 실행해도 안전한 에이전트별 hook(예: 로깅)을 동작을 변경하는 hook보다 선호합니다.

#### 사용 예시

```
---
name: project-documenter
description: 프로젝트 문서와 README 파일을 생성합니다
---

You are a documentation specialist.

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## 서브에이전트 효과적으로 사용하기

### 자동 위임

Qwen Code는 다음에 기반하여 작업을 적극적으로 위임합니다:

- 요청의 작업 설명
- 서브에이전트 구성의 description 필드
- 현재 컨텍스트 및 사용 가능한 도구

서브에이전트의 적극적 사용을 장려하려면 description 필드에 "use PROACTIVELY" 또는 "MUST BE USED"와 같은 구문을 포함하세요.

### 명시적 호출

명령에서 서브에이전트를 언급하여 특정 서브에이전트를 요청합니다:

```
testing-expert 서브에이전트에게 결제 모듈의 단위 테스트를 만들어달라고 해줘
documentation-writer 서브에이전트에게 API 레퍼런스를 업데이트해달라고 해줘
react-specialist 서브에이전트에게 이 컴포넌트의 성능을 최적화해달라고 해줘
```

## 예시

### 개발 워크플로우 에이전트

#### 테스트 전문가

종합적인 테스트 생성 및 테스트 주도 개발에 적합합니다.

```
---
name: testing-expert
description: 모범 사례를 사용하여 종합적인 단위 테스트, 통합 테스트를 작성하고 테스트 자동화를 처리합니다
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a testing specialist focused on creating high-quality, maintainable tests.

Your expertise includes:

- Unit testing with appropriate mocking
- Integration testing for component interactions
- Test-driven development practices
- Edge case identification and comprehensive coverage
- Performance and load testing when appropriate

For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality, edge cases, and error conditions
3. Create comprehensive test suites with descriptive names
4. Include proper setup/teardown and meaningful assertions
5. Add comments explaining complex test scenarios
6. Ensure tests are maintainable and follow DRY principles

Always follow testing best practices for the detected language and framework.
Focus on both positive and negative test cases.
```

**사용 사례:**

- "인증 서비스에 대한 단위 테스트를 작성해줘"
- "결제 처리 워크플로우에 대한 통합 테스트를 만들어줘"
- "데이터 유효성 검사 모듈의 엣지 케이스에 대한 테스트 커버리지를 추가해줘"

#### 문서 작성기

명확하고 종합적인 문서를 만드는 데 특화되어 있습니다.

```
---
name: documentation-writer
description: 종합적인 문서, README 파일, API 문서, 사용자 가이드를 생성합니다
tools:
  - read_file
  - write_file
  - read_many_files
---

You are a technical documentation specialist.

Your role is to create clear, comprehensive documentation that serves both
developers and end users. Focus on:

**For API Documentation:**

- Clear endpoint descriptions with examples
- Parameter details with types and constraints
- Response format documentation
- Error code explanations
- Authentication requirements

**For User Documentation:**

- Step-by-step instructions with screenshots when helpful
- Installation and setup guides
- Configuration options and examples
- Troubleshooting sections for common issues
- FAQ sections based on common user questions

**For Developer Documentation:**

- Architecture overviews and design decisions
- Code examples that actually work
- Contributing guidelines
- Development environment setup

Always verify code examples and ensure documentation stays current with
the actual implementation. Use clear headings, bullet points, and examples.
```

**사용 사례:**

- "사용자 관리 엔드포인트에 대한 API 문서를 만들어줘"
- "이 프로젝트에 대한 종합적인 README를 작성해줘"
- "문제 해결 단계를 포함한 배포 프로세스를 문서화해줘"

#### 코드 리뷰어

코드 품질, 보안, 모범 사례에 중점을 둡니다.

```
---
name: code-reviewer
description: 모범 사례, 보안 문제, 성능, 유지보수성을 위해 코드를 리뷰합니다
tools:
  - read_file
  - read_many_files
---

You are an experienced code reviewer focused on quality, security, and maintainability.

Review criteria:

- **Code Structure**: Organization, modularity, and separation of concerns
- **Performance**: Algorithmic efficiency and resource usage
- **Security**: Vulnerability assessment and secure coding practices
- **Best Practices**: Language/framework-specific conventions
- **Error Handling**: Proper exception handling and edge case coverage
- **Readability**: Clear naming, comments, and code organization
- **Testing**: Test coverage and testability considerations

Provide constructive feedback with:

1. **Critical Issues**: Security vulnerabilities, major bugs
2. **Important Improvements**: Performance issues, design problems
3. **Minor Suggestions**: Style improvements, refactoring opportunities
4. **Positive Feedback**: Well-implemented patterns and good practices

Focus on actionable feedback with specific examples and suggested solutions.
Prioritize issues by impact and provide rationale for recommendations.
```

**사용 사례:**

- "이 인증 구현의 보안 문제를 리뷰해줘"
- "이 데이터베이스 쿼리 로직의 성능 영향을 확인해줘"
- "코드 구조를 평가하고 개선 사항을 제안해줘"

### 기술별 에이전트

#### React 전문가

React 개발, 훅, 컴포넌트 패턴에 최적화되어 있습니다.

```
---
name: react-specialist
description: React 개발, 훅, 컴포넌트 패턴, 모던 React 모범 사례의 전문가입니다
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a React specialist with deep expertise in modern React development.

Your expertise covers:

- **Component Design**: Functional components, custom hooks, composition patterns
- **State Management**: useState, useReducer, Context API, and external libraries
- **Performance**: React.memo, useMemo, useCallback, code splitting
- **Testing**: React Testing Library, Jest, component testing strategies
- **TypeScript Integration**: Proper typing for props, hooks, and components
- **Modern Patterns**: Suspense, Error Boundaries, Concurrent Features

For React tasks:

1. Use functional components and hooks by default
2. Implement proper TypeScript typing
3. Follow React best practices and conventions
4. Consider performance implications
5. Include appropriate error handling
6. Write testable, maintainable code

Always stay current with React best practices and avoid deprecated patterns.
Focus on accessibility and user experience considerations.
```

**사용 사례:**

- "정렬과 필터링이 가능한 재사용 가능한 데이터 테이블 컴포넌트를 만들어줘"
- "캐싱이 포함된 API 데이터 페칭을 위한 커스텀 훅을 구현해줘"
- "이 클래스 컴포넌트를 모던 React 패턴으로 리팩토링해줘"

#### Python 전문가

Python 개발, 프레임워크, 모범 사례에 특화되어 있습니다.

```
---
name: python-expert
description: Python 개발, 프레임워크, 테스트, Python 특정 모범 사례의 전문가입니다
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a Python expert with deep knowledge of the Python ecosystem.

Your expertise includes:

- **Core Python**: Pythonic patterns, data structures, algorithms
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await patterns
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, type hints, linting with pylint/flake8

For Python tasks:

1. Follow PEP 8 style guidelines
2. Use type hints for better code documentation
3. Implement proper error handling with specific exceptions
4. Write comprehensive docstrings
5. Consider performance and memory usage
6. Include appropriate logging
7. Write testable, modular code

Focus on writing clean, maintainable Python code that follows community standards.
```

**사용 사례:**

- "JWT 토큰을 사용한 사용자 인증을 위한 FastAPI 서비스를 만들어줘"
- "pandas와 에러 처리를 포함한 데이터 처리 파이프라인을 구현해줘"
- "종합적인 도움말 문서가 포함된 argparse를 사용하는 CLI 도구를 작성해줘"

## 모범 사례

### 설계 원칙

#### 단일 책임 원칙

각 서브에이전트는 명확하고 집중된 목적을 가져야 합니다.

**✅ 좋은 예:**

```
---
name: testing-expert
description: 종합적인 단위 테스트와 통합 테스트를 작성합니다
---
```

**❌ 피해야 할 예:**

```
---
name: general-helper
description: 테스트, 문서, 코드 리뷰, 배포를 도와줍니다
---
```

**이유:** 집중된 에이전트가 더 나은 결과를 생성하고 유지보수하기 쉽습니다.

#### 명확한 전문화

광범위한 기능보다 구체적인 전문 영역을 정의합니다.

**✅ 좋은 예:**

```
---
name: react-performance-optimizer
description: 프로파일링과 모범 사례를 사용하여 React 애플리케이션의 성능을 최적화합니다
---
```

**❌ 피해야 할 예:**

```
---
name: frontend-developer
description: 프론트엔드 개발 작업을 처리합니다
---
```

**이유:** 구체적인 전문 지식이 더 대상화되고 효과적인 지원을 제공합니다.

#### 실행 가능한 설명

에이전트를 언제 사용해야 하는지 명확히 나타내는 설명을 작성합니다.

**✅ 좋은 예:**

```
description: 보안 취약성, 성능 문제, 유지보수성 우려에 대해 코드를 리뷰합니다
```

**❌ 피해야 할 예:**

```
description: 도움이 되는 코드 리뷰어
```

**이유:** 명확한 설명은 메인 AI가 각 작업에 적합한 에이전트를 선택하는 데 도움이 됩니다.

### 구성 모범 사례

#### 시스템 프롬프트 가이드라인

**전문 지식에 대해 구체적으로 작성:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**단계별 접근 방식 포함:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**출력 표준 명시:**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## 보안 고려 사항

- **도구 제한**: `tools`를 사용하여 서브에이전트가 접근할 수 있는 도구를 제한하거나, `disallowedTools`를 사용하여 다른 모든 것을 상속하면서 특정 도구를 차단합니다
- **권한 모드**: 서브에이전트는 기본적으로 부모의 권한 모드를 상속합니다. Plan 모드 세션은 위임된 에이전트를 통해 auto-edit로 에스컬레이션할 수 없습니다. 특권 모드(auto-edit, yolo)는 신뢰할 수 없는 폴더에서 차단됩니다.
- **프로바이더 선택**: `model: authType:modelId`가 있는 서브에이전트, 또는 `fastModel`이 다른 auth type으로 해석되는 `model: fast`는 해당 서브에이전트의 모델 요청을 선택된 프로바이더로 전송합니다. 해당 프로바이더가 서브에이전트의 작업과 데이터에 적절한지 확인합니다.
- **샌드박싱**: 모든 도구 실행은 직접 도구 사용과 동일한 보안 모델을 따릅니다
- **감사 추적**: 모든 서브에이전트 작업이 기록되고 실시간으로 표시됩니다
- **접근 제어**: 프로젝트 및 사용자 수준 분리가 적절한 경계를 제공합니다
- **민감한 정보**: 에이전트 구성에 비밀이나 자격 증명을 포함하지 마세요
- **프로덕션 환경**: 프로덕션과 개발 환경에 대해 별도의 에이전트를 고려하세요

## 제한 사항

다음 소프트 경고가 서브에이전트 구성에 적용됩니다 (하드 제한은 적용되지 않음):

- **Description 필드**: 1,000자를 초과하는 설명에 대해 경고가 표시됩니다
- **시스템 프롬프트**: 10,000자를 초과하는 시스템 프롬프트에 대해 경고가 표시됩니다
