# 구조화된 출력 (`--json-schema`)

모델의 최종 답변을 사용자가 제공하는 JSON Schema로 제한합니다. Qwen Code는 모델이 반드시 호출해야 하는 합성 터미널 도구를 등록하고, 호출의 인수를 스키마에 대해 검증한 후, 유효성 검사가 완료된 페이로드를 stdout(또는 JSON / stream-json 결과 인벨롭)에 노출합니다. 첫 번째 유효한 호출이 실행을 종료합니다.

헤드리스 전용 — `qwen -p`, 위치 프롬프트, 또는 stdin을 통해 파이프로 전달된 프롬프트와 함께 작동합니다.

## 빠른 시작

```bash
qwen --prompt "Summarize the changes in HEAD with risk_level" \
  --json-schema '{
    "type": "object",
    "properties": {
      "summary":    { "type": "string" },
      "risk_level": { "type": "string", "enum": ["low", "medium", "high"] }
    },
    "required": ["summary", "risk_level"],
    "additionalProperties": false
  }'
```

stdout의 출력 (기본 `--output-format text`):

```json
{ "summary": "…", "risk_level": "low" }
```

라인은 정확히 JSON-stringified 페이로드 + 개행입니다 — 인벨롭 없음, 이벤트 로그 없음. `jq`나 다른 컨슈머로 직접 파이프하세요.

**text** 모드에서 stdout은 성공 시 JSON 페이로드 전용이며 실패 시 비어 있습니다; 오류 메시지와 로그 라인은 stderr로 이동합니다. 이렇게 하면 `$(qwen --json-schema …) || exit 1` 캡처 패턴이 text 모드에서 안전합니다 — 실패는 stderr로 이동하며 캡처된 변수에 섞이지 않습니다. 계획 중 모델의 부수적 산문은 stderr에도 미러링되지 **않습니다** — text 모드는 이를 삭제합니다; 보려면 `--output-format json` 또는 `stream-json`을 사용하세요.

`--output-format json` 및 `stream-json`에서 실패 결과 메시지는 성공 경로와 함께 **stdout**에서 출력됩니다(JSON 배열의 마지막 요소, 또는 JSONL 스트림의 종료 `result` 라인). 모든 실패 모드가 stdout에 결과를 출력하는 것은 아닙니다 — max-session-turns(종료 53)와 시그널 인터럽트(종료 130)는 stderr 출력만 있고 종료합니다. 먼저 종료 코드를 확인하세요; 결과 객체의 `is_error`는 결과를 생성하는 실패의 하위 집합 내에서 구분합니다.

> **빈 스키마:** `{}`를 전달하면 stdout에서 `{}`(빈 JSON 객체)가 생성됩니다. 모델이 인수 없이 `structured_output`을 호출하고; 업스트림 인수 정규화 경로가 빈 함수 호출을 빈 객체 페이로드로 변환하며, 빈 스키마에 대한 검증을 통과하고 그대로 출력됩니다.

## 스키마 제공

두 가지 동일한 형식:

```bash
# 인라인 JSON 리터럴
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# 파일에서 읽기
qwen -p "…" --json-schema @./schemas/summary.json
```

`@path` 형식은 `~`를 확장하고, 경로를 정규화하고, `utf8` 인코딩으로 파일을 읽습니다.

> **지연 참고:** 성공적인 실행은 결과가 출력되기 전에 인플레이 중인 백그라운드 에이전트가 최종 알림을 flush하는 동안 **최대 약 500ms**로 제한되는 종료 보류를 발생시킵니다. 보류는 대기 중인 백그라운드 작업이 없으면 일찍 종료되므로 간단한 실행은 거의 영향이 없습니다; 바쁜 에이전트에 대해 수백 개의 `--json-schema` 호출을 팬아웃하는 배치 파이프라인은 이 상한을 고려해야 합니다.

> **보안 참고:** 스키마는 `pattern` 키워드에 사용자가 제공한 정규식을 포함할 수 있습니다. Ajv는 ECMAScript 정규식 엔진으로 이를 컴파일하며, 이는 치명적인 백트래킹에 취약합니다. 도구 인수는 항상 객체이므로, `pattern` 키워드는 문자열 속성 내부에서만 발생합니다 — `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}`와 같은 악성 스키마는 모델이 적당히 긴 매칭 값을 제공할 때 CLI를 중단시킬 수 있습니다. 신뢰하는 소스의 스키마로만 `--json-schema`를 실행하세요.

파싱 시 검증:

- 파일은 일반 파일이어야 합니다(FIFO, 문자 디바이스, 디렉토리 불가).
- 파일 크기는 4 MiB로 제한됩니다. 실제 JSON 스키마는 이보다 훨씬 작습니다; 수 MiB 파일은 거의 항상 잘못된 경로 실수입니다.
- 스키마는 유효한 JSON이어야 합니다. `@path` 입력의 경우, 파싱 오류는 제네릭("content of `<path>` is not valid JSON")이며 SyntaxError 세부 정보를 에코하지 않으므로, stderr를 표시하는 래핑 프로세스는 오류에서 파일 내용의 접두사를 읽을 수 없습니다.
- 스키마는 엄격한 Ajv 설정에서 컴파일되어야 합니다 — `propertees`와 같은 오타는 표면화되지만, 사양상 유효한 패턴(예: `properties`의 모든 키를 나열하지 않는 `required`)은 허용됩니다.
- 스키마 루트는 객체 유형 값을 받아들여야 합니다. 함수 호출 API(Gemini, OpenAI, Anthropic)는 모두 도구 인수가 JSON 객체여야 하므로, 비객체 루트는 사용 불가능한 도구를 등록합니다.

루트 허용 검사는 `type`, `const`, `enum`, `anyOf`, `oneOf`, `allOf`, `not`, 그리고 `if`/`then`/`else`(결정 가능한 경우에 대한 최선 노력)를 순회합니다. 의심스러울 때는 런타임에 Ajv로 연기합니다.

> **루트 `$ref`는 거부됩니다** 파싱 시 검사에서. 스키마가 `$ref`를 통해 정의를 재사용하면 `allOf`로 감싸세요:
>
> ```jsonc
> // 거부됨:
> { "$ref": "#/$defs/MyObj", "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
>
> // 허용됨 (allOf 브랜치를 통해 루트가 객체를 받아들임):
> { "allOf": [{ "$ref": "#/$defs/MyObj" }], "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
> ```
>
> `anyOf` / `oneOf` / `allOf` 내부의 `$ref`는 런타임에 Ajv로 연기되므로, 래핑된 형식이 루트 허용 검사를 통과합니다.

## 형식별 출력 모양

| `--output-format` | stdout으로 나가는 내용                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (기본)     | `JSON.stringify(payload) + "\n"` — 한 줄, 검증된 객체.                                                                                                                                                                |
| `json`            | 메시지 객체의 단일 JSON **배열** (전체 이벤트 로그). 마지막 요소는 `type: "result"` 메시지이며, `result`(`JSON.stringify(payload)`)와 `structured_result`(원시 객체)를 모두 포함합니다.                                |
| `stream-json`     | 각 이벤트가 JSONL로 자체 라인에. 종료 `result` 라인은 `result`(stringified)와 `structured_result`(원시 객체)를 포함합니다.                                                                                             |

두 JSON 형식에서 객체를 원할 때 `result`보다 `structured_result`를 읽는 것이 좋습니다; `result`는 해당 필드에 항상 문자열을 기대하는 컨슈머를 위해 제공되는 stringified 형식입니다. `--output-format json`의 경우 배열의 마지막 요소를 읽고 거기서 `structured_result`를 가져옵니다(예: `jq '.[-1].structured_result'`); `stream-json`의 경우 스트림의 마지막 `type: "result"` 라인을 읽습니다.

## 제한 사항

| 조합                                                  | 동작                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-i` / `--prompt-interactive`       | 파싱 시 거부됨. 합성 도구의 "session ends now" 메시지가 TUI 루프에 종료자가 없습니다.                                                                                                                                        |
| `--json-schema` + `--input-format stream-json`        | 파싱 시 거부됨. 단일 실행 터미널 계약이 장기 stream-json 입력 프로토콜과 호환되지 않습니다.                                                                                                                                  |
| `--json-schema` + `--acp` / `--experimental-acp`      | 파싱 시 거부됨. ACP는 합성 도구 터미널 계약을 준수하지 않는 자체 턴 루프를 실행합니다.                                                                                                                                       |
| 프롬프트 없고 파이프로 전달된 stdin도 없는 `--json-schema` | 파싱 시 거부됨. 헤드리스 모드에는 프롬프트가 필요합니다 — `-p`, 위치 인수, 또는 파이프를 전달하세요.                                                                                                                        |
| `--bare` + `--json-schema`                            | 지원됨. 합성 도구가 bare 세 개(`read_file`, `edit`, `run_shell_command`)와 함께 등록됩니다.                                                                                                                                   |
| 서브에이전트 내부의 `--json-schema`                    | 도구가 등록되지 **않습니다**. 최상위 실행의 메인 / drain 턴만 터미널 계약을 준수합니다; 서브에이전트가 도구를 호출하면 "session ends now"를 받은 후 루프에 종료자가 없기 때문에 계속 실행됩니다.                              |

## 재시도 및 실패 모드

> **비용 참고:** 두 가지가 `--json-schema` 실행에서 토큰 소비를 곱하며, 둘 다 설계할 가치가 있습니다:
>
> - **모든 턴에 임베딩된 스키마.** 스키마는 첫 요청뿐만 아니라 모든 모델 요청에서 `structured_output` 함수 선언의 `parameters` 블록으로 전송됩니다. 큰 스키마(4 MiB 파싱 캡까지)는 전체 실행에 대해 턴별 입력 토큰을 비례적으로 증가시킵니다.
> - **각 검증 재시도는 전체 모델 턴입니다.** 모델이 반복적으로 놓치는 스키마는 실패마다 곱해집니다(요청 + 추론 + 응답). 모델을 유도할 만큼 충분히 제약적이고 첫 시도에 맞출 만큼 간단한 스키마를 유지하세요; 재시도가 예상되면 `--max-session-turns`를 높이세요.

세션은 첫 번째 유효한 호출에서 종료됩니다. 그 전까지:

- **인수 검증 실패.** `structured_output`이 Ajv의 메시지와 함께 도구 결과 오류를 반환하고, 모델이 다음 턴에 이를 보고, 인수를 수정하고 다시 호출할 수 있습니다.
- **모델이 `structured_output`과 같은 턴에서 부수 효과 도구를 호출.** 사전 스캔이 형제를 억제합니다 — 구조적 호출이 궁극적으로 검증되든 안 되든 실행되지 않습니다. 두 경로는 모델이 다음에 무엇을 보느냐에 따라 나뉩니다:
  - **검증 성공:** 실행이 즉시 종료되고 모델은 다른 턴을 받지 않습니다 — 억제된 형제가 조용히 삭제됩니다.
  - **검증 실패:** 모델이 다른 턴을 받고 억제된 호출에 대한 합성된 "Skipped:" `tool_result`를 보며, **별도 턴**(`structured_output`을 포함하지 않는)에서 해당 호출을 재발행할 수 있습니다.
- **모델이 `structured_output`을 호출하지 않고 일반 텍스트를 출력.** 종료 코드 `1`. 오류 메시지에 턴 수와 모델 출력의 잘린 미리보기가 포함되어 실제 내용을 확인할 수 있습니다.
- **실행이 `maxSessionTurns`에 도달.** 종료 코드 `53`. 표준 "Reached max session turns" 종료와 함께 `--json-schema`별 힌트가 세 가지 일반적인 중단 실행 원인을 가리킵니다: 모델이 도구를 호출하지 않음, `structured_output`이 권한 규칙에 의해 거부됨, 또는 스키마가 충족 불가능함.
- **실행이 인터럽트됨 (SIGINT / Ctrl-C).** 종료 코드 `130`. 구조화된 결과는 일반적으로 출력되지 않지만, 종료 보류 루프는 중단 시그널을 폴링하지 않으므로, 성공적인 호출이 캡처된 후 결과가 stdout에 도달하기 전에 도착하는 SIGINT가 여전히 stdout에 도달할 수 있습니다. 종료 코드를 진실의 원천으로 취급하세요.

## 프라이버시

`structured_output`을 통해 제출하는 인수가 구조화된 페이로드입니다 — 이미 stdout에서 출력됩니다. 동일한 페이로드가 기기 내 표면으로 두 번째 지속되는 것을 방지하기 위해, 인수는 다음에서 `{ __redacted: 'structured_output payload (see stdout result)' }` 플레이스홀더로 삭제됩니다:

- `ToolCallEvent` 텔레메트리 경로(OTLP 내보내기, QwenLogger, ui-telemetry 스트림, chat-recording UI 이벤트 미러).
- 디스크의 chat-recording JSONL `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`(`--continue` / `--resume` 시 모델 컨텍스트로 재공급), 검증 실패 재시도 모두 포함.

도구 호출 메트릭(지속 시간, 성공, 결정)과 주변 이벤트 메타데이터는 보존됩니다.

> **스키마는 모델 공급자에게 전송됩니다.** 삭제는 로컬 표면의 _호출 인수_만 다룹니다. 스키마 자체는 모든 모델 요청에서 `structured_output` 함수 선언의 `parameters` 블록으로 전송되므로 — 그 안에 넣은 모든 리터럴 값(`enum`, `const`, `default`, `examples`, `description`, `$comment` 등)은 프롬프트 텍스트와 마찬가지로 공급자에게 평문으로 도달합니다. 스키마는 모양과 제약을 설명해야 합니다; 공급자에 대해 공개적으로 취급하고 비밀, 고객 기록 및 기타 민감한 페이로드를 스키마 본문에 넣지 마세요.

> **Hook은 원시 인수를 봅니다.** 위에서 설명한 삭제는 텔레메트리와 chat-recording에만 적용됩니다. `PreToolUse`, `PostToolUse`, `PostToolUseFailure` hook(페이로드를 기기 외부로 전달할 수 있는 HTTP hook 포함)은 `structured_output`에 대해 삭제되지 않은 `tool_input`을 받습니다. hook 계약이 "도구가 보는 것을 보기"이기 때문입니다. 감사 스타일의 catch-all hook을 운영한다면, `structured_output`에 대해 비활성화하거나(`tool_name`으로 필터링) 민감한 데이터에 대해 `--json-schema`를 실행하기 전에 hook 측 삭제를 추가하세요.

## 세션 재개 (`--continue` / `--resume`)

`--json-schema`는 실행별 플래그이며 세션별 속성이 아닙니다. 합성 도구는 CLI가 인수를 파싱할 때 등록되므로:

- 터미널 계약이 적용되기를 원하는 모든 `--continue` / `--resume`에서 `--json-schema`를 다시 전달하세요. 원래 실행과 동일한 스키마가 안전한 기본값입니다 — 세션 중 스키마 교환은 허용되지만 모델이 준수해야 하는 계약을 변경합니다.
- `--json-schema` 없이 `--continue`하면, 재개된 실행은 일반 헤드리스 세션입니다: `structured_output`이 도구로 존재하지 않으며, 모델이 자유 형식 텍스트로 응답합니다.
- 재개된 chat-recording의 `__redacted` 플레이스홀더는 실제로 재개 가능성에 영향을 주지 않습니다. 성공적인 `structured_output` 호출은 세션을 즉시 종료하므로, 재개된 실행이 볼 수 있는 삭제된 인수는 실패한 시도에서만 발생합니다. 모델은 여전히 각 시도의 Ajv 검증 오류를 기록된 `tool_result`와 라이브 매개변수 스키마(`--json-schema`에서 재등록됨)에서 가지고 있으며, 재시도하기에 충분합니다.

## 권한 게이트

`structured_output`은 의도적으로 `--core-tools` 허용 목록을 우회합니다: 도구는 `--json-schema`가 설정된 경우에만 존재하므로, 이를 제외하면 실행에 터미널 계약이 없어집니다.

명시적 `permissions.deny` 규칙과 `--exclude-tools` 설정은 적용됩니다 — 둘 다 동일한 거부 메커니즘을 사용하며 둘 다 `structured_output`이 등록되는 것을 방지하므로 모델이 도구 선언을 보지 못합니다. 일반적인 결과는 모델이 일반 텍스트로 응답하는 것입니다(종료 1). 모델이 텍스트를 생성하지 않고 다른 도구를 반복하면 결국 `maxSessionTurns`(종료 53)에 도달하며 `--json-schema` 힌트가 오류 메시지에서 어디를 봐야 하는지 알려줍니다.

> **`--bare` 주의.** Bare 모드는 설정 파생 입력 대부분을 무시하며, 설정 수준의 `permissions.deny`와 `tools.exclude`도 포함됩니다. 합성 도구가 등록된 상태로 유지되므로 `structured_output`의 설정 전용 거부는 `--bare`에서 조용히 무효화됩니다. Argv 수준의 `--exclude-tools structured_output`은 bare 모드에서도 적용됩니다 — bare 실행을 잠금해야 할 경우 설정 대신 플래그를 사용하세요.

## MCP 도구와의 충돌

MCP 서버가 `structured_output`이라는 이름의 도어를 등록하면, 도구 레지스트리 충돌 검사가 MCP 도구를 `mcp__<server-name>__structured_output`으로 이름을 변경하여 합성 도구가 bare 이름을 유지합니다. 사용자가 제공한 스키마가 항상 모델이 보는 스키마입니다.

## 예시: 구조화된 출력을 통한 다단계 실행 게이트

```bash
RESULT=$(qwen --prompt "Audit this diff and rate its risk." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "High-risk diff; pausing pipeline." >&2
  exit 2
fi
```

## 참고 자료

- [Headless Mode](./headless.md) — `--json-schema`가 구축되는 `-p` 기반 플로우.
- [Dual Output](./dual-output.md) — TUI 옆에 JSON-event 사이드카를 기록합니다(기계 판독 가능 출력에 대한 다른 접근 방식; `--json-schema`가 필요하지 않음).
