---

# 헤드리스 모드

헤드리스 모드를 사용하면 대화형 UI 없이 커맨드라인 스크립트와 자동화 도구에서 Qwen Code를 프로그래밍 방식으로 실행할 수 있다. 스크립팅, 자동화, CI/CD 파이프라인, AI 기반 도구 구축에 적합하다.

## 개요

헤드리스 모드는 Qwen Code의 헤드리스 인터페이스를 제공하며 다음과 같은 기능을 지원한다:

- 커맨드라인 인자나 stdin을 통해 프롬프트를 전달
- 구조화된 출력(텍스트 또는 JSON) 반환
- 파일 리다이렉션 및 파이프 지원
- 자동화 및 스크립팅 워크플로우 지원
- 오류 처리를 위한 일관된 종료 코드 제공
- 현재 프로젝트에 한정된 이전 세션을 재개하여 다단계 자동화 가능

## 기본 사용법

### 직접 프롬프트

`--prompt`(또는 `-p`) 플래그를 사용하여 헤드리스 모드로 실행한다:

```bash
qwen --prompt "What is machine learning?"
```

### Stdin 입력

터미널에서 Qwen Code로 입력을 파이프한다:

```bash
echo "Explain this code" | qwen
```

### 파일 입력과 결합

파일에서 읽어서 Qwen Code로 처리한다:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### 이전 세션 재개 (헤드리스)

헤드리스 스크립트에서 현재 프로젝트의 대화 컨텍스트를 재사용한다:

```bash
# 이 프로젝트의 가장 최근 세션을 이어받아 새 프롬프트 실행
qwen --continue -p "Run the tests again and summarize failures"

# 특정 세션 ID를 직접 재개 (UI 없음)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - 세션 데이터는 `~/.qwen/projects/<sanitized-cwd>/chats` 아래에 프로젝트 단위로 저장되는 JSONL이다.
> - 새 프롬프트를 보내기 전에 대화 이력, 도구 출력, 대화 압축 체크포인트를 복원한다.

## 지속적인 목표 실행

헤드리스 모드에서는 프롬프트 전체로 `/goal`을 전달할 수 있다. 목표 상태는 세션과 함께 저장되므로, `--continue` 또는 `--resume <sessionId>`를 사용하여 이후 프로세스에서 동일한 Goal을 확인하거나 제어할 수 있다. 이를 위해서는 `general.chatRecording`이 계속 활성화되어 있어야 한다(기본값).

```bash
# Goal을 생성하고 워커 시작
qwen -p "/goal Finish the release checklist"

# 동일한 세션에서 저장된 상태 확인
qwen --continue -p "/goal"
```

다른 작업에도 동일한 `qwen --continue -p "<control>"` 패턴을 사용한다:

| 제어                                  | 동작                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `/goal`                              | 모델을 호출하지 않고 저장된 상태를 보고한다.                                       |
| `/goal <objective>` 또는 `/goal set …` | Goal을 생성하거나 교체하고 헤드리스 Goal 작업을 시작한다.                                 |
| `/goal edit <objective>`             | 완료되지 않은 Goal을 수정한다. 결과 상태가 active이면 즉시 작업이 시작된다. |
| `/goal pause`                        | 모델을 호출하지 않고 active Goal을 일시 중지한다.                                          |
| `/goal resume`                       | 재개 가능한 Goal을 재개하고 헤드리스 Goal 작업을 시작한다.                                    |
| `/goal clear`                        | 확인이나 모델 호출 없이 Goal을 초기화한다.                                     |

런타임에 예약된 Goal 계속 세그먼트는 `--max-session-turns`에 포함되지 않지만, 실제 사용자 프롬프트는 포함된다. 명시적인 `--max-wall-time` 및 `--max-tool-calls` 예산은 계속 적용되며, 어느 쪽을 초과하면 활성 Goal 작업이 일시 중지된 후 해당 예산 관련 오류로 런이 종료된다.

`--output-format stream-json`과 함께 사용하면, 각 Goal 상태 변경 시 `event.type`이 `goal_state`인 `stream_event`가 발행된다. 이 표준 상태 이벤트는 `--include-partial-messages` 없이도 발행된다. partial 메시지가 활성화되면, 이전 `active_goal` 이벤트가 호환성 프로젝션으로 뒤따라 발행되며, 자동화에서는 `goal_state`를 권위 있는 이벤트로 취급해야 한다.

> [!note]
>
> 이 동작은 표준 헤드리스 CLI 런에 적용된다. ACP는 여전히 레거시 Goal 커맨드 경로를 사용한다.

## 메인 세션 프롬프트 커스터마이즈

공유 메모리 파일을 수정하지 않고도 단일 CLI 런의 메인 세션 시스템 프롬프트를 변경할 수 있다.

### 내장 시스템 프롬프트 오버라이드

`--system-prompt`를 사용하여 현재 런에서 Qwen Code의 내장 메인 세션 프롬프트를 교체한다:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### 추가 명령어 추가

`--append-system-prompt`를 사용하여 내장 프롬프트를 유지한 채 이번 런에 대한 추가 명령어를 추가한다:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

두 플래그를 함께 사용하면 커스텀 기본 프롬프트와 런별 추가 명령어를 결합할 수 있다:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt`는 현재 런의 메인 세션에만 적용된다.
> - `QWEN.md`와 같은 로드된 메모리 및 컨텍스트 파일은 여전히 `--system-prompt` 뒤에 추가된다.
> - `--append-system-prompt`는 내장 프롬프트와 로드된 메모리 뒤에 적용되며, `--system-prompt`와 함께 사용할 수 있다.

## 출력 형식

Qwen Code는 다양한 사용 사례에 대해 여러 출력 형식을 지원한다:

### 텍스트 출력 (기본값)

일반적인 사람이 읽을 수 있는 출력:

```bash
qwen -p "What is the capital of France?"
```

응답 형식:

```
The capital of France is Paris.
```

### JSON 출력

JSON 배열로 구조화된 데이터를 반환한다. 모든 메시지는 버퍼링되었다가 세션이 완료될 때 함께 출력된다. 이 형식은 프로그래밍 방식 처리와 자동화 스크립트에 적합하다.

JSON 출력은 메시지 객체의 배열이다. 출력에는 여러 메시지 유형이 포함된다: 시스템 메시지(세션 초기화), 어시스턴트 메시지(AI 응답), 결과 메시지(실행 요약).

#### 사용 예시

```bash
qwen -p "What is the capital of France?" --output-format json
```

출력 (실행 종료 시):

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON 출력

Stream-JSON 형식은 실행 중 발생하는 JSON 메시지를 즉시 발행하여 실시간 모니터링을 가능하게 한다. 이 형식은 각 메시지가 한 줄의 완전한 JSON 객체인 줄바꿈 구분 JSON을 사용한다.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

출력 (이벤트 발생 시 스트리밍):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

`--include-partial-messages`와 함께 사용하면, 실시간 UI 업데이트를 위한 추가 스트림 이벤트(message_start, content_block_delta 등)가 실시간으로 발행된다.

JSON 및 stream-json 출력에서 텍스트 `tool_result.content` 값은 JSON 문자열 직렬화 후 65,536 UTF-8 바이트로 제한된다. 초과하는 값은 결정적 헤드/테일 미리보기로 발행된다. 동일한 제한이 영속 stream-json 세션, SDK 전송, 서브에이전트 도구 결과 및 Dual Output에도 적용된다. 텍스트 모드는 최종 응답만 출력하며 내부적으로 제한된 미리보기만 유지한다. 이 제한은 전체 JSON 세션, JSONL 이벤트, 도구 입력 또는 부분 메시지의 크기를 제한하지 않는다.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### 입력 형식

`--input-format` 매개변수는 Qwen Code가 표준 입력에서 입력을 소비하는 방식을 제어한다:

- **`text`** (기본값): stdin 또는 커맨드라인 인자에서의 표준 텍스트 입력
- **`stream-json`**: 양방향 통신을 위한 stdin 경유 JSON 메시지 프로토콜

> **Note:** Stream-json 입력 모드는 현재 구축 중이며 SDK 통합을 위한 것이다. `--output-format stream-json`이 설정되어 있어야 한다.

### 파일 리다이렉션

출력을 파일로 저장하거나 다른 명령어로 파이프한다:

```bash
# 파일로 저장
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# 파일에 추가
qwen -p "Add more details" >> docker-explanation.txt

# 다른 도구로 파이프
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# 실시간 처리를 위한 Stream-JSON 출력
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## 설정 옵션

헤드리스 사용 시 주요 커맨드라인 옵션:

| 옵션                       | 설명                                                                                                                                                                                                                                                                                                                                                                                                                    | 예시                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | 헤드리스 모드로 실행                                                                                                                                                                                                                                                                                                                                                                                                           | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | 출력 형식 지정 (text, json, stream-json)                                                                                                                                                                                                                                                                                                                                                                                | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | 입력 형식 지정 (text, stream-json)                                                                                                                                                                                                                                                                                                                                                                                       | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | stream-json 출력에 partial 메시지 포함                                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | 이번 런의 메인 세션 시스템 프롬프트 오버라이드                                                                                                                                                                                                                                                                                                                                                                           | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | 이번 런의 메인 세션 시스템 프롬프트에 추가 명령어 추가                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | 디버그 모드 활성화                                                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | 모든 커스터마이징 비활성화 — 컨텍스트 파일, hook, extension, skill, MCP 서버, 커스텀 서브에이전트(내장 서브에이전트만 로드), 권한 규칙, 설정 기반 승인 모드 오버라이드, 메모리 기능, 샌드박스 설정 — 하여 문제를 격리한다. CLI 플래그 `--yolo` 및 `--approval-mode`는 여전히 적용된다. [Troubleshooting](../support/troubleshooting) 참조. `QWEN_CODE_SAFE_MODE=true`로도 설정 가능. | `qwen -p "query" --safe-mode`                                            |
| `--model`, `-m`              | 이번 런에 사용할 모델                                                                                                                                                                                                                                                                                                                                                                                                      | `qwen -p "query" --model qwen3-coder-plus`                               |
| `--include-directories`      | 추가 디렉토리 포함                                                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | 모든 작업 자동 승인                                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | 승인 모드 설정 (`plan`, `default`, `auto-edit`, `auto`, `yolo`)                                                                                                                                                                                                                                                                                                                                                             | `qwen -p "query" --approval-mode auto-edit`                              |
| `--continue`                 | 이 프로젝트의 가장 최근 세션 재개                                                                                                                                                                                                                                                                                                                                                                                | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | 특정 세션 재개 (또는 대화형 선택)                                                                                                                                                                                                                                                                                                                                                                            | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | 런의 사용자/모델/도구 턴 수 상한                                                                                                                                                                                                                                                                                                                                                                             | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | 실제 경과 시간 예산. `90`(초), `30s`, `5m`, `1h`, `1.5h` 허용                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | 런의 누적 도구 호출 예산                                                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "..." --max-tool-calls 50`                                      |

사용 가능한 모든 설정 옵션, 설정 파일, 환경 변수에 대한 전체 세부사항은 [설정 가이드](../configuration/settings)를 참조한다.

## 무인 실행에서의 안전성

`--yolo`(또는 `--approval-mode=yolo`)와 결합된 헤드리스 / CI 런은 `shell`, `write`, `edit`를 포함한 모든 도구 호출을 자동 승인한다. **`--yolo`는 샌드박스를 활성화하지 않는다** — 해당 도구들은 호스트 프로세스의 권한 수준에서 실행된다. Qwen Code가 샌드박스 없이 이 조합을 감지하면, 시작 시 stderr에 한 줄 경고를 출력한다. 트레이드오프를 검토한 후 `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`로 경고를 억제할 수 있다.

### 런 수준 예산

Qwen Code는 다음 임계값 중 하나를 초과하면 무인 런을 중단할 수 있다. 각 값은 기본적으로 `-1`(무제한)이며, 어느 하나라도 설정하면 비정상 동작을 제한할 수 있다. 이미 SIGINT를 전달하는 동일한 `AbortController`에 대해 협력적으로 적용되므로, 예산 중단은 구조화된 `FatalBudgetExceededError`(종료 코드 **55**)를 발행한다. 이는 턴 상한 종료 코드 53 및 SIGINT의 130과 구별되므로 CI 스크립트에서 이유에 따라 분기할 수 있다.

| 플래그                  | 설정 키               | 제한 대상                                                                                                                                                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | 전체 런의 실제 경과 시간. 플래그는 `90`(초), `30s`, `5m`, `1h`, `1.5h`(소수 단위 지원)를 허용한다. 최소 1초 — 1초 미만 값은 오타로 간주하여 거부된다. 설정은 초 단위.               |
| `--max-tool-calls`    | `model.maxToolCalls`       | 메인 런 루프에서 디스패치된 누적 최상위 도구 호출 수(성공 _및_ 실패 모두 포함 — 모델은 오류 시에도 토큰을 소비한다). 서브에이전트 / 구조화된 출력 면제에 대해서는 아래 "범위" 참조. |
| `--max-session-turns` | `model.maxSessionTurns`    | 사용자/모델/도구 턴 수. 기존 기능. 초과 시 코드 53으로 종료(예산 종료 55와 구별).                                                                                                  |

#### 범위

- **`--max-tool-calls`는 최상위 디스패치만 계산한다.** 모델이 `agent` 도구를 호출하면 디스패치는 **1**로 계산되며, 생성된 서브에이전트가 수행한 내부 도구 호출은 계산되지 **않는다**. 서브에이전트를 통해 작업을 전달하는 모델은 작은 최상위 예산으로도 무제한의 내부 작업을 수행할 수 있다. 더 엄격한 상한이 필요하면 `--exclude-tools agent`와 함께 사용한다.
- **`structured_output`은 `--max-tool-calls`에서 면제된다.** `--json-schema`에서 모델의 종료 `structured_output` 호출은 실제 작업이 아닌 "완료" 계약이며, `--max-tool-calls`에 포함되지 않아 예산 경계에서의 완료가 오탐지로 중단되지 않는다. 이 면제는 무조건적이며(실패한 Ajv 검증 포함), 잘못된 출력 재시도 루프에 갇힌 모델은 `--max-tool-calls`로 제한되지 **않는다**. 재시도를 제한하려면 `--max-session-turns` 또는 `--max-wall-time`과 함께 사용한다.
- **`structured_output`은 `--max-session-turns`에서 면제되지 않는다.** 이 카운터는 기존 것이며 종료 계약을 포함한 모든 턴에서 증가한다. `--json-schema`에서 `N`회의 실제 작업 턴을 허용하려면 `--max-session-turns`를 `N+1`로 설정한다.
- **단일 실행 vs `--input-format stream-json`:** stream-json 입력 모드에서 데몬은 모든 사용자 메시지 시작 시 예산 카운터를 초기화한다. 예산은 프로세스 단위가 아닌 메시지 단위이다.
- **`qwen serve` / ACP 세션:** 데몬 ACP 세션 경로는 현재 settings.json의 `--max-wall-time` / `--max-tool-calls`를 참조하지 **않는다**. 이 예산은 단일 실행 `qwen -p` 런과 `--input-format stream-json` 세션에만 적용된다. (`qwen serve`는 settings에 `tools.approvalMode: 'yolo'`가 설정되어 있으면 부트 시 YOLO-no-sandbox 경고를 발행한다.)

### 권장 조합

- **신뢰할 수 있는 격리 환경(임시 CI 러너, 컨테이너):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. 턴 예산과 실제 경과 시간 예산을 고정하여 멈춘 에이전트가 CI 분태를 소모하지 않도록 하고, `--output-format json`으로 런 후 사용량 / 도구 호출 감사를 위한 데이터를 캡처한다.
- **로컬 머신 또는 공유 인프라:** `--sandbox`를 추가하거나 `QWEN_SANDBOX=1`을 설정하여 shell / write / edit 도구가 샌드박스 이미지 내부에서 실행되도록 한다.
- **레이트 리밋 재시도가 포함된 장시간 CI:** `QWEN_CODE_UNATTENDED_RETRY=1`을 `--max-wall-time`과 함께 사용한다. 재시도 환경 변수는 일시적인 429 / 529 응답을 지나서 런을 유지하고, 실제 경과 시간 예산은 지속적으로 실패하는 프로바이더가 작업을 무기한 연장하지 못하도록 한다.
- **제한된 감사 / 탐색:** 읽기 전용 작업의 경우, `--max-tool-calls 25`로 모델이 grep / read를 얼마나 적극적으로 수행할 수 있는지 제한한다. `--exclude-tools shell,write,edit`와 함께 사용하여 제한을 의미 있게 만든다.

## 예시

### 코드 리뷰

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### 커밋 메시지 생성

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### API 문서

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### 배치 코드 분석

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### PR 코드 리뷰

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### 로그 분석

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### 릴리스 노트 생성

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### 모델 및 도구 사용량 추적

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## 지속적 재시도 모드

Qwen Code가 CI/CD 파이프라인이나 백그라운드 데몬으로 실행될 때, 짧은 API 장애(레이트 리밋 또는 과부하)가 여러 시간에 걸친 작업을 중단시키면 안 된다. **지속적 재시도 모드**는 Qwen Code가 일시적인 API 오류를 서비스가 복구될 때까지 무기한 재시도하도록 한다.

### 작동 방식

- **일시적 오류만**: HTTP 429(레이트 리밋) 및 529(과부하)는 무기한 재시도된다. 다른 오류(400, 500 등)는 정상적으로 실패한다.
- **상한이 있는 지수 백오프**: 재시도 지연은 지수적으로 증가하지만 재시도당 **5분**으로 상한이 정해진다.
- **하트비트 키프**: 긴 대기 중에도 **30초**마다 stderr에 상태 줄이 출력되어, CI 러너가 비활성으로 인해 프로세스를 종료하지 않도록 한다.
- **점진적 저하**: 일시적이지 않은 오류와 대화형 모드는 전혀 영향을 받지 않는다.

### 활성화

`QWEN_CODE_UNATTENDED_RETRY` 환경 변수를 `true` 또는 `1`로 설정한다(대소문자 구분, 엄격 매칭):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> 지속적 재시도는 **명시적 옵트인**이 필요하다. `CI=true`만으로는 활성화되지 **않는다** — 빠른 실패 CI 작업이 무한 대기 작업으로 전환되는 것은 위험하므로 침묵 중에 활성화되지 않는다. 파이프라인 설정에서 항상 `QWEN_CODE_UNATTENDED_RETRY`를 명시적으로 설정한다.

### 예시

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### 야간 배치 처리

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### 백그라운드 데몬

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### 모니터링

지속적 재시도 중 하트비트 메시지가 **stderr**에 출력된다:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

이 메시지는 CI 러너를 활성 상태로 유지하고 진행 상황을 모니터링할 수 있게 한다. stdout에는 표시되지 않으므로 다른 도구로 파이프되는 JSON 출력은 깨끗하게 유지된다.

## 리소스

- [CLI 설정](../configuration/settings#command-line-arguments) - 전체 설정 가이드
- [인증](../configuration/auth.md) - 인증 설정
- [명령어](../features/commands) - 대화형 명령어 레퍼런스
- [튜토리얼](../quickstart) - 단계별 자동화 가이드
