# OpenTelemetry를 활용한 관찰 가능성

Qwen Code의 OpenTelemetry를 활성화하고 설정하는 방법을 알아봅니다.

- [OpenTelemetry를 활용한 관찰 가능성](#opentelemetry를-활용한-관찰-가능성)
  - [주요 이점](#주요-이점)
  - [OpenTelemetry 통합](#opentelemetry-통합)
  - [설정](#설정)
  - [Aliyun Telemetry](#aliyun-telemetry)
    - [수동 OTLP 내보내기](#수동-otlp-내보내기)
  - [로컬 Telemetry](#로컬-telemetry)
    - [파일 기반 출력 (권장)](#파일-기반-출력-권장)
    - [컬렉터 기반 내보내기 (고급)](#컬렉터-기반-내보내기-고급)
  - [로그 및 메트릭](#로그-및-메트릭)
    - [로그](#로그)
    - [메트릭](#메트릭)
    - [데몬 메트릭](#데몬-메트릭)
    - [스팬](#스팬)
    - [리소스 메트릭](#리소스-메트릭)
    - [성능 모니터링 (예약됨)](#성능-모니터링-예약됨)

## 마이그레이션 참고사항

- `tool_output_truncated`가 네임스페이스 일관성을 위해 `qwen-code.tool_output_truncated`로 이름 변경되었습니다 — 이전 이름으로 필터링하는 다운스트림 소비자는 쿼리를 업데이트해야 합니다.

- `tool.call.latency` 히스토그램 문서에 이전에 `decision` 속성이 나열되어 있었습니다 — 이 속성은 히스토그램에 설정된 적이 없습니다(`function_name`만 기록됨). `tool.call.count` 카운터는 계속 `decision`을 포함합니다.

- `qwen-code.file_operation` 로그 이벤트와 `file.operation.count` 메트릭 문서에 이전에 diff-stat 속성(`model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`)이 나열되어 있었습니다 — 이 속성들은 둘 다에 설정된 적이 없습니다. Diff-stat 데이터는 `tool_call` 로그 이벤트의 `metadata` 속성을 통해 사용할 수 있습니다.

## 주요 이점

- **🔍 사용 분석**: 팀 전체의 상호작용 패턴과 기능 채택을 이해
- **⚡ 성능 모니터링**: 응답 시간, 토큰 소비 및 리소스 사용률을 추적
- **🐛 실시간 디버깅**: 병목 현상, 실패 및 오류 패턴을 발생 즉시 식별
- **📊 워크플로 최적화**: 구성과 프로세스를 개선하기 위한 정보에 기반한 의사결정
- **🏢 엔터프라이즈 거버넌스**: 팀 간 사용량을 모니터링하고, 비용을 추적하고, 규정 준수를 보장하고, 기존 모니터링 인프라와 통합

## OpenTelemetry 통합

**[OpenTelemetry]** — 벤더 중립적 업계 표준 관찰 가능성 프레임워크 위에 구축된 Qwen Code의 관찰 가능성 시스템은 다음을 제공합니다:

- **범용 호환성**: 모든 OpenTelemetry 백엔드로 내보내기(Aliyun, Jaeger, Prometheus, Datadog 등)
- **표준화된 데이터**: 도구 체인 전체에서 일관된 형식과 수집 방법 사용
- **미래 보장 통합**: 기존 및 향후 관찰 가능성 인프라와 연결
- **벤더 종속 없음**: 계측을 변경하지 않고도 백엔드 간 전환 가능

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## 설정

모든 telemetry 동작은 `.qwen/settings.json` 파일을 통해 제어됩니다. 이 설정은 환경 변수나 CLI 플래그로 재정의할 수 있습니다.

| 설정                              | 환경 변수                                          | CLI 플래그                                               | 설명                                                                                                                                    | 값                | 기본값                  |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                             | `--telemetry` / `--no-telemetry`                         | telemetry 활성화 또는 비활성화                                                                                                            | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                              | `--telemetry-target <local\|gcp>` _(deprecated)_         | 정보 제공 대상 라벨; 내보내기 라우팅을 제어하지 않음 — 데이터 전송 위치를 구성하려면 `otlpEndpoint` 또는 `outfile`을 설정                  | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | `--telemetry-otlp-endpoint <URL>`                        | OTLP 컬렉터 엔드포인트                                                                                                                | URL 문자열        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP 전송 프로토콜                                                                                                                | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                | -                                                        | trace에 대한 시그널별 엔드포인트 재정의(HTTP만)                                                                                    | URL 문자열        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                  | -                                                        | 로그에 대한 시그널별 엔드포인트 재정의(HTTP만)                                                                                      | URL 문자열        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`               | -                                                        | 메트릭에 대한 시그널별 엔드포인트 재정의(HTTP만)                                                                                   | URL 문자열        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                             | `--telemetry-outfile <path>`                             | telemetry를 파일로 저장(OTLP 내보내기 재정의)                                                                                         | 파일 경로         | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | telemetry 로그에 프롬프트 포함                                                                                                      | `true`/`false`    | `true`                  |
| `userId`                          | `QWEN_TELEMETRY_USER_ID`                             | -                                                        | ARMS 확장 `gen_ai.user.id`로 GenAI 스팬에 기록되는 안정적 최종 사용자 식별자; 가명 값 권장                  | 문자열            | -                       |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | -                                                        | 표준 GenAI 메시지, 지시사항, 도구 정의, 도구 인수 및 성공한 도구 결과를 네이티브 스팬 속성으로 포함 | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                        | 각 민감한 네이티브 스팬 속성의 최대 압축 JSON 문자열 길이. 백엔드가 큰 속성을 거부하면 낮게 설정.       | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)   | -                                                        | 내보내진 모든 스팬/로그/메트릭에 첨부되는 정적 리소스 속성. 아래의 [리소스 속성](#리소스-속성) 참조.      | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`          | -                                                        | 메트릭 데이터 포인트에 `session.id` 포함. 시계열 팬아웃으로부터 메트릭 백엔드를 보호하기 위해 **기본적으로 비활성화**.               | `true`/`false`    | `false`                 |

**부울 환경 변수 참고:** 부울 설정(`enabled`, `logPrompts`, `includeSensitiveSpanAttributes`)의 경우 해당 환경 변수를 `true` 또는 `1`로 설정하면 기능이 활성화됩니다. 다른 값은 비활성화됩니다.

**정수 환경 변수 참고:** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH`는 설정 시 양의 정수여야 합니다. 잘못된 값은 자동으로 폴백하지 않고 telemetry 설정 해상도를 실패시킵니다.

`gen_ai.tool.description`은 민감하지 않은 정적 레지스트리 메타데이터이며 `includeSensitiveSpanAttributes`와 독립적으로 배출됩니다. 여기에는 MCP 서버 및 기타 워크스페이스 도구 프로바이더가 제공한 설명이 포함됩니다. 값은 4096 UTF-16 코드 단위로 제한되며 동적 호출 세부 정보를 포함하지 않습니다.

**민감한 스팬 속성:** `includeSensitiveSpanAttributes`가 활성화되면 두 가지 일이 발생합니다:

1. **네이티브 스팬 속성**이 표준 OpenTelemetry GenAI JSON을 전달:
   - LLM 입력 메시지(`gen_ai.input.messages`)
   - 시스템 지시사항(`gen_ai.system_instructions`)
   - 도구 정의(`gen_ai.tool.definitions`)
   - LLM 출력 메시지(`gen_ai.output.messages`)
   - 최종 실행된 도구 인수(`gen_ai.tool.call.arguments`)
   - 성공한 도구 결과(`gen_ai.tool.call.result`)
   - 인터랙션 스팬은 GenAI 추론 스팬이 아니므로 계속 `new_context`를 사용합니다.

   LLM 값은 프로바이더 최종 SDK 요청 객체와 원본 프로바이더 응답에서 가져오며, 원래 논리적 구성에서 가져오지 않습니다. 도구 값은 최종 호출 매개변수와 성공한 모델 대면 결과에서 가져옵니다. 각 표준 GenAI 값은 압축 JSON이며 완전하고 스키마 유효해야 합니다. 유효하지 않거나 순환적이거나 `sensitiveSpanAttributeMaxLength`를 초과하는 값은 전체가 생략됩니다. JSON은 절대 잘리지 않으며 미리보기, 해시 또는 잘림 메타데이터가 배출되지 않습니다. 인터랙션별 `new_context` 속성은 기존 잘림 동작을 유지합니다. 기본 최대값은 속성당 1 MiB(`1048576`)이며 허용 범위는 `1..104857600`(100 MiB)입니다. 제한은 UTF-8 바이트가 아닌 JavaScript 문자열 길이로 측정됩니다. 따라서 비 ASCII 콘텐츠는 OTLP 내보내기 후에 더 많은 바이트를 차지할 수 있습니다.

2. **로그-스팬 브리지 스팬**(로그 엔드포인트 없이 HTTP trace가 내보내기될 때 사용)은 기존 `prompt`, `function_args` 및 `response_text` 필드를 유지합니다(삭제되지 않음).

⚠️ **보안 경고:** 이 플래그를 활성화하면 전체 대화 기록, `read_file`이 읽은 파일 내용, 셸 명령어와 그 출력(환경 변수나 인수의 비밀 포함), 모델 응답이 구성된 OTLP 백엔드로 스트리밍됩니다. 백엔드를 특권 데이터 싱크로 취급하세요. 플래그의 기본값은 `false`입니다.

**비용 / 페이로드 크기:** 기본 제한에서 하나의 LLM 스팬은 입력, 출력, 시스템 지시사항 및 도구 정의에 걸쳐 최대 약 4 MiB를 전달할 수 있으며, 하나의 Tool 스팬은 인수와 결과에 걸쳐 약 2 MiB를 전달할 수 있습니다. 이것은 Qwen Code의 애플리케이션 측 상한이며, 모든 컬렉터나 백엔드가 그만큼 큰 단일 속성을 수락한다는 보장은 아닙니다. 스팬이 거부되거나 삭제되면 `sensitiveSpanAttributeMaxLength`를 낮추고(예: `61440`) 내보내기 처리량을 모니터링하세요.

이 설정은 OTel 로그나 다른 telemetry 싱크의 민감한 데이터를 비활성화하지 않습니다. 비 내부 API 응답 telemetry는 `response_text`를 채울 수 있으므로 OTel 로그, UI telemetry 및 채팅 기록은 이 설정과 독립적으로 응답 텍스트를 수신할 수 있습니다. QwenLogger는 `response_text`를 포함하지 않습니다.

**HTTP OTLP 시그널 라우팅:** HTTP 프로토콜(`otlpProtocol: "http"`) 사용 시 Qwen Code는 시그널별 경로(`/v1/traces`, `/v1/logs`, `/v1/metrics`)를 기본 `otlpEndpoint`에 자동으로 추가합니다. 예를 들어 `http://collector:4318`은 trace의 경우 `http://collector:4318/v1/traces`가 됩니다. URL이 이미 시그널 경로로 끝나면 그대로 사용됩니다. 시그널별 엔드포인트 재정의(`otlpTracesEndpoint` 등)는 기본 엔드포인트보다 우선하며 그대로 사용됩니다. gRPC 프로토콜은 서비스 기반 라우팅을 사용하며 경로를 추가하지 않습니다.

시그널별 엔드포인트 환경 변수는 표준 OpenTelemetry 이름도 허용합니다: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. `QWEN_TELEMETRY_OTLP_*` 변형이 `OTEL_*` 변형보다 우선합니다.

**최종 사용자 식별:** `telemetry.userId`와 `QWEN_TELEMETRY_USER_ID`는 ARMS 스팬 속성 `gen_ai.user.id`에 대한 명시적 옵트인입니다. 환경 변수는 두 값이 모두 트림된 후 우선합니다. 빈 환경 값은 설정으로 폴백합니다. 식별자는 인터랙션, LLM, Tool 및 Agent 스팬에만 기록됩니다. Resource 속성, 로그 또는 메트릭 속성, 아웃바운드 Baggage 값 또는 현재 OpenTelemetry GenAI 표준 필드가 아닙니다. 안정적 가명 식별자를 권장합니다. 값은 시작 시 해석되므로 구성 변경 시 재시작이 필요합니다. 여러 최종 사용자에게 서비스하는 데몬 또는 채널 인스턴스에 프로세스 전역 값을 설정하지 마세요.

모든 구성 옵션에 대한 자세한 정보는 [설정 가이드](../../users/configuration/settings.md)를 참조하세요.

### 리소스 속성

리소스 속성은 OTLP를 통해 내보내지는 모든 스팬, 로그 및 메트릭에 첨부되는 정적 키-값 쌍입니다. 팀, 환경, 배포 지역 또는 백엔드에서 관심 있는 다른 차원으로 telemetry를 분할하는 데 사용합니다.

두 소스가 우선순위 순(낮음 → 높음)으로 병합됩니다:

1. 표준 `OTEL_RESOURCE_ATTRIBUTES` 환경 변수
2. `.qwen/settings.json`의 `telemetry.resourceAttributes`(키 충돌 시 환경 변수 재정의)

`OTEL_SERVICE_NAME`은 별도의 탈출구입니다 — 설정되면 다른 소스의 `service.name`을 재정의합니다(OpenTelemetry 스펙에 따름).

#### 예시

**팀 / 환경별 telemetry 분할:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**`service.name`으로 테넌트별 컬렉터 라우팅:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**플릿 기본값(`~/.qwen/settings.json`) + 호스트별 재정의:**

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

```bash
# 설정을 건드리지 않고 일회성 태그 추가:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### 예약된 키

일부 키는 런타임에 의해 제어되며 재정의할 수 없습니다:

- `service.version` — 항상 실행 중인 CLI 버전으로 설정됩니다. 어떤 소스에서든 설정하면 경고와 함께 조용히 삭제됩니다.
- `session.id` — 세션별로 런타임에 주입됩니다. 환경 변수나 설정에서 제공된 사용자 값은 경고와 함께 삭제됩니다. 이유는 리소스 속성이 모든 메트릭 데이터 포인트에 자동 첨부되기 때문입니다. 사용자 재정의가 허용되면 아래의 [카디널리티 제어](#카디널리티-제어)를 우회하게 됩니다. 스팬과 로그는 항상 `session.id`를 전달합니다.

`service.name`은 예약되지 **않았습니다**. 위의 우선순위 체인을 따릅니다.

#### 형식

`OTEL_RESOURCE_ATTRIBUTES`는 OpenTelemetry 스펙을 따릅니다: `key1=value1,key2=value2`이며 값은 퍼센트 인코딩됩니다. 값의 공백은 `%20`으로, **쉼표는 `%2C`로** 인코딩해야 합니다(인코딩되지 않은 쉼표는 잘못된 경계에서 값을 분할하며 뒷부분이 잘못된 형태로 삭제됩니다). 잘못된 형식의 쌍은 telemetry 시작을 실패시키지 않고 경고와 함께 건너뜁니다.

#### 문제 해결: 사용자 제공 속성이 적용되지 않는 것처럼 보일 때

예약된 키(`service.version`, `session.id`), 잘못된 형식의 쌍, 비문자열 설정 값 및 잘못된 퍼센트 인코딩은 모두 조용히 삭제되며 OpenTelemetry 진단 채널을 통해 경고가 로그로 기록됩니다. 해당 채널은 디버그 로그 파일(`~/.qwen/log/otel-*.log`)로 라우팅되며 콘솔이 **아니므로** 동작이 조용한 실패처럼 보일 수 있습니다.

커스텀 리소스 속성이 내보내진 telemetry에 나타나지 않으면:

1. `~/.qwen/log/otel-*.log`에서 `cannot override`(예약된 키 삭제), `Skipping malformed`(잘못된 환경 변수 쌍), 또는 `must be a string`(비문자열 설정 값)에 매칭되는 라인을 확인합니다.
2. 환경 변수가 qwen-code 프로세스의 환경에 설정되어 있는지(셸만이 아닌) 확인하고 값이 퍼센트 인코딩되어 있는지 확인합니다.
3. `telemetry.enabled`가 `true`인지 확인합니다 — telemetry 초기화는 활성화된 경우에만 실행됩니다.

### 카디널리티 제어

메트릭은 백엔드에서 속성 집합별로 집계됩니다 — 속성 값의 모든 고유 조합이 새 시계열을 생성합니다. `session.id`와 같은 고카디널리티 필드를 메트릭에 첨부하면 세션 수에 비례하는 시계열 팬아웃이 발생하여 메트릭 백엔드 스토리지를 빠르게 소진합니다.

이를 방지하기 위해 Qwen Code는 기본적으로 고카디널리티 속성을 메트릭 데이터 포인트에서 제거합니다. 스팬과 로그는 이벤트별이며 영향을 받지 않으므로 trace 및 로그 상관관계를 위해 계속 `session.id`를 전달합니다.

#### `telemetry.metrics.includeSessionId`(기본값: `false`)

이 값을 `true`로 설정하면(설정 또는 `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`를 통해) `session.id`가 모든 메트릭 데이터 포인트에 다시 첨부됩니다.

⚠️ **경고:** 각 CLI 세션은 새 값을 생성합니다. 플릿에서 이 옵션을 켜두면 메트릭 스토리지가 폭증합니다. 단기 디버깅에만 권장됩니다. 장기 세션 상관관계의 경우 trace 또는 로그 백엔드를 쿼리하세요.

#### 이전 버전에서의 마이그레이션

이 릴리스 이전에는 `session.id`가 기본적으로 메트릭에 첨부되었습니다. Prometheus 쿼리 / Grafana 대시보드 / 알림 규칙이 메트릭의 `session_id`를 참조하면 두 가지 옵션이 있습니다:

**옵션 A** — 단기 디버깅을 위해 이전 동작 복원:

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

또는:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

**옵션 B(권장)** — 세션 수준 분석을 메트릭에서 이동합니다. 스팬과 로그는 여전히 `session.id`를 전달하며, trace / 로그 백엔드(Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing)는 카디널리티 부담 없이 세션별 슬라이싱을 네이티브로 처리합니다.

### 아웃바운드 fetch의 클라이언트 측 HTTP 스팬

telemetry가 활성화되면 Qwen Code는 `UndiciInstrumentation`을 등록하여 프로세스에서 시작된 모든 아웃바운드 `fetch()` 요청에 대한 클라이언트 측 HTTP 스팬을 생성합니다 — LLM SDK(`openai`, `@google/genai`, `@anthropic-ai/sdk`), MCP StreamableHTTP 클라이언트, `WebFetch` 도구 및 IDE 확장의 프로세스 간 호출을 포함합니다. 이 스팬을 통해 업스트림 모델 처리 시간과 구별하여 네트워크 지연(TTFB / 응답 본문 전송)을 확인할 수 있습니다. 기존 `api.generateContent` 스팬만으로는 구별할 수 없습니다.

이 스팬은 다른 telemetry와 마찬가지로 **사용자 자신의** OTLP 컬렉터(또는 파일 outfile)로 전송됩니다 — 아웃바운드 HTTP 요청 자체에 기록되는 내용에 영향을 주지 않습니다. W3C `traceparent` 헤더가 나가는 요청 스트림에도 기록되는지는 아래의 [아웃바운드 상관관계(보안 관련)](#아웃바운드-상관관계보안-관련)에서 설명하는 **별도의 보안 관련 설정**에 의해 제어됩니다.

**피드백 루프 회피.** OTel SDK는 OTLP 데이터를 업로드하기 위해 내부적으로 `fetch`를 사용합니다. 보호 없으면 `fetch`를 계측하면 해당 업로드를 추적하게 되고, 이 업로드가 다시 업로드되어 무한 루프가 발생합니다. Qwen Code의 undici 계측은 구성된 `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` 접두사와 일치하는 URL을 건너뛰도록 `ignoreRequestHook`로 구성됩니다. 파일 outfile 모드에서는 아웃바운드 HTTP 업로드가 없으므로 훅은 no-op입니다.

## 아웃바운드 상관관계(보안 관련)

이 설정은 `telemetry.*`와 **의도적으로 별도의 최상위 네임스페이스**에 존재합니다: telemetry는 운영자 자신의 관찰 가능성 백엔드로의 데이터 흐름을 제어하는 반면, `outboundCorrelation.*`는 qwen-code가 서드파티 LLM 프로바이더 엔드포인트(DashScope, OpenAI, Anthropic 등)에 도달하는 **아웃바운드 LLM API 요청 스트림에** 기록하는 클라이언트 측 상관관계 데이터를 제어합니다. 수신자가 다르고 동의 결정도 다릅니다. **모든 값은 기본적으로 꺼져 있습니다.** 프레임링 근거는 PR #4390 리뷰 토론을 참조하세요.

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // 기본값
}
```

`false`(기본값)일 때 Qwen Code는 OTel SDK에 no-op `TextMapPropagator`를 설치합니다. UndiciInstrumentation은 여전히 OTLP 컬렉터를 위한 클라이언트 HTTP 스팬을 생성하지만 `propagation.inject()`가 no-op이므로 **아웃바운드 요청에 `traceparent`가 기록되지 않습니다**. Trace ID는 운영자의 컬렉터 내부에 유지됩니다.

`true`일 때 SDK의 기본 W3C 복합 프로파게이터(`tracecontext` + `baggage`)가 설치되고 표준 `traceparent` 헤더가 모든 아웃바운드 `fetch`에 기록됩니다:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

추가로 셸 자식 프로세스(Bash 도구, hook, 모니터)에 `TRACEPARENT` 및 `TRACESTATE` 환경 변수가 설정되어 생성된 명령이 동일한 분산 trace에 참여할 수 있습니다.

LLM 프로바이더도 크로스 프로세스 trace 스티칭을 위해 사용자의 OTel 컬렉터로 보고하는 경우에만 옵트인합니다 — 예: DashScope를 서비스하는 ARMS Tracing. 대부분의 운영자에게 값은 `false`입니다. 크로스 벤더 trace 연속은 니치입니다.

**`telemetry.enabled: true`에 의존.** OTel SDK는 telemetry가 활성화된 경우에만 초기화되므로 `propagateTraceContext`는 해당 상태에서만 적용됩니다. telemetry가 비활성화된 상태에서 `true`로 설정하면 조용한 no-op입니다 — SDK 없음, 프로파게이터 없음, 와이어에 `traceparent` 없음. ARMS+DashScope 상관관계 설정을 연결할 때 두 플래그를 모두 확인하세요:

```jsonc
{
  "telemetry": {
    "enabled": true,
    "otlpTracesEndpoint": "http://tracing-analysis-...",
  },
  "outboundCorrelation": {
    "propagateTraceContext": true,
  },
}
```

### 기타 아웃바운드 상관관계 헤더

`X-Qwen-Code-Session-Id`와 `X-Qwen-Code-Request-Id`는 **이 PR의 일부가 아닙니다**. 동일한 `outboundCorrelation.*` 네임스페이스에서 각각의 위협 모델과 운영자 동의 흐름을 갖춘 후속 PR에서 설계 및 제안될 예정입니다. PR #4390 리뷰(LaZzyMan)는 원칙을 수립했습니다: "telemetry의 작업 범위에 LLM 프로바이더에게 식별자를 전송하는 것은 포함되지 않습니다"; 상관관계 헤더 작업은 telemetry 아래로 들어가지 않고 자체 설계 토론으로 이동합니다.

## Aliyun Telemetry

### 수동 OTLP 내보내기

Alibaba Cloud Managed Service for OpenTelemetry에서 Qwen Code telemetry를 보려면 ARMS가 제공하는 OTLP 엔드포인트로 내보내도록 Qwen Code를 구성합니다.

`"target": "gcp"`만 설정한다고 내보내기 대상이 구성되지 않습니다. `otlpEndpoint`가 설정되지 않으면 Qwen Code는 여전히 `http://localhost:4317`로 기본 설정됩니다. `outfile`이 설정되면 `otlpEndpoint`를 재정의하여 telemetry가 Alibaba Cloud로 전송되는 대신 파일에 기록됩니다.

1. `.qwen/settings.json`에서 telemetry를 활성화하고 OTLP 엔드포인트를 설정합니다:

   **옵션 A: gRPC 프로토콜**(표준 OTLP 엔드포인트):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<your-otlp-endpoint>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **옵션 B: 시그널별 엔드포인트가 있는 HTTP 프로토콜**(표준이 아닌 경로를 사용하는 백엔드의 경우, 예: `/v1/traces` 대신 `/api/otlp/traces`):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "otlpProtocol": "http",
       "otlpTracesEndpoint": "http://<host>/<token>/api/otlp/traces",
       "otlpLogsEndpoint": "http://<host>/<token>/api/otlp/logs",
       "otlpMetricsEndpoint": "http://<host>/<token>/api/otlp/metrics"
     }
   }
   ```

   > **참고:** `otlpEndpoint`만 사용하고 시그널별 재정의가 없는 HTTP 프로토콜을 사용할 때 Qwen Code는 표준 OTLP 경로(`/v1/traces`, `/v1/logs`, `/v1/metrics`)를 기본 URL에 추가합니다. 백엔드가 다른 경로를 사용하면 옵션 B와 같이 시그널별 엔드포인트 재정의를 사용하세요.

   ARMS 세션 분석 `User ID`를 채우려면 안정적 가명 ID를 스팬 수준 설정으로 추가합니다:

   ```json
   {
     "telemetry": {
       "userId": "user-079458",
       "resourceAttributes": {
         "acs.arms.service.feature": "genai_app"
       }
     }
   }
   ```

   컨테이너 배포의 경우 대신 `QWEN_TELEMETRY_USER_ID=user-079458`을 설정하세요. 사용자 정의 `telemetry.resourceAttributes.user.id`는 관련 없는 Resource 차원으로 남아 있으며 ARMS 세션 분석을 채우지 않으므로 스팬 수준 설정으로 마이그레이션할 때 제거하세요.

2. Alibaba Cloud 엔드포인트에 인증이 필요한 경우 `OTEL_EXPORTER_OTLP_HEADERS`(또는 시그널별 변형)와 같은 표준 OpenTelemetry 환경 변수를 통해 OTLP 헤더를 제공합니다. Qwen Code는 현재 `.qwen/settings.json`에서 OTLP 인증 헤더를 직접 노출하지 않습니다.
3. Qwen Code를 실행하고 프롬프트를 전송합니다.
4. Managed Service for OpenTelemetry에서 telemetry를 확인합니다:
   - 제품 개요: [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - 시작하기: [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - 콘솔 진입점:
     - 중국 본토: [trace.console.aliyun.com][aliyun-opentelemetry-console-cn] (레거시 콘솔: [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - 국제: [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - 콘솔에서 `Applications`를 사용하여 trace 및 서비스 토폴로지를 확인합니다.
   - OTLP 엔드포인트 및 액세스 정보를 찾으려면:
     - **새 콘솔**(`trace.console.aliyun.com` 또는 국제): `Integration Center`로 이동합니다.
     - **레거시 콘솔**(`tracing.console.aliyun.com`): `Cluster Configurations` → `Access point information`으로 이동합니다.

## 로컬 Telemetry

로컬 개발 및 디버깅을 위해 telemetry 데이터를 로컬에서 캡처할 수 있습니다:

### 파일 기반 출력 (권장)

1. `.qwen/settings.json`에서 telemetry를 활성화합니다:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **참고:** `outfile`이 설정되면 OTLP 내보내기가 자동으로 비활성화됩니다. `target`과 `otlpEndpoint` 설정은 파일 전용 출력에 필요하지 않으므로 구성에서 안전하게 생략할 수 있습니다.

2. Qwen Code를 실행하고 프롬프트를 전송합니다.
3. 지정된 파일(예: `.qwen/telemetry.log`)에서 로그와 메트릭을 확인합니다.

### 컬렉터 기반 내보내기 (고급)

1. 자동화 스크립트를 실행합니다:
   ```bash
   npm run telemetry -- --target=local
   ```
   이 스크립트는 다음을 수행합니다:
   - Jaeger와 OTEL 컬렉터를 다운로드하고 시작
   - 로컬 telemetry를 위한 워크스페이스 구성
   - Jaeger UI를 http://localhost:16686에서 제공
   - 로그/메트릭을 `~/.qwen/tmp/<projectHash>/otel/collector.log`에 저장
   - 종료 시 컬렉터 중지(예: `Ctrl+C`)
2. Qwen Code를 실행하고 프롬프트를 전송합니다.
3. http://localhost:16686에서 trace를 확인하고 컬렉터 로그 파일에서 로그/메트릭을 확인합니다.

## 로그 및 메트릭

다음 섹션에서는 Qwen Code에 대해 생성되는 로그, 메트릭 및 스팬의 구조를 설명합니다.

- `sessionId`가 모든 로그와 메트릭의 공통 속성으로 포함됩니다.

### 로그

로그는 특정 이벤트의 타임스탬프가 기록된 항목입니다. 모든 로그 레코드에는 `event.name`과 `event.timestamp` 속성이 자동으로 포함됩니다.

다음 이벤트가 기록됩니다:

#### 핵심 세션 이벤트

- `qwen-code.config`: CLI 구성과 함께 시작 시 한 번 배출됨.
  - **속성**: `model`, `sandbox_enabled`, `core_tools_enabled`, `approval_mode`, `file_filtering_respect_git_ignore`, `debug_mode`, `truncate_tool_output_threshold`, `truncate_tool_output_lines`, `hooks`(쉼표로 구분, 비활성화 시 생략), `ide_enabled`, `interactive_shell_enabled`, `mcp_servers`, `mcp_servers_count`, `mcp_tools`, `mcp_tools_count`, `output_format`, `skills`, `subagents`

- `session.start`: 세션 시작. 시작 시 telemetry 초기화 후에 배출되며 세션 전환 시마다 다시 배출됩니다. 수명 주기 의미는 스팬 섹션에 설명되어 있습니다.
  - **속성**: `session.id`(string), `session.previous_id`(string, 이 시작이 새 세션 ID로 지속된 대화를 이어갈 때만 존재)

- `session.end`: 세션 종료. 세션 전환이 현재 세션을 대체하기 전에, 그리고 telemetry 종료 시 배출됩니다.
  - **속성**: `session.id`(string)

- `qwen-code.user_prompt`: 사용자가 프롬프트를 제출.
  - **속성**: `prompt_length`(int), `prompt_id`(string), `prompt`(string, `log_prompts_enabled`가 false이면 제외), `auth_type`(string)

- `qwen-code.user_retry`: 사용자가 마지막 프롬프트를 재시도.
  - **속성**: `prompt_id`(string)

- `qwen-code.conversation_finished`: 대화 턴 시퀀스가 완료.
  - **속성**: `approvalMode`(string), `turnCount`(int)

- `qwen-code.user_feedback`: 사용자가 세션 피드백을 제출.
  - **속성**: `session_id`(string), `rating`(int: 1=나쁨, 2=보통, 3=좋음), `model`(string), `approval_mode`(string), `prompt_id`(string, 선택)

#### 도구 이벤트

- `qwen-code.tool_call`: 각 함수/도구 호출. 터미널 이벤트가 정규화되어 `status`가 권위 있음: success와 cancelled 이벤트는 오류 필드를 생략하며, error 이벤트는 항상 비어 있지 않은 `error_type`(프로듀서가 오류를 분류하지 않은 경우 `unknown`)을 가짐. 빈 도구 이름은 `unknown_tool`로 배출됨. 누락된 `execution_status`는 `unknown`으로 정규화되며 터미널 `status`에서 추론되지 않음.
  - **속성**: `function_name`(string), `function_args`(object), `call_id`(string, 선택), `duration_ms`(int), `status`(string: "success", "error" 또는 "cancelled"), `execution_status`(string: "not_started", "success", "error", "cancelled" 또는 "unknown"), `success`(boolean), `decision`(string: "accept", "reject", "auto_accept" 또는 "modify", 선택), `error`(string, 선택), `error_type`(string, error 이벤트에 존재), `prompt_id`(string), `response_id`(string, 선택), `content_length`(int, 선택), `tool_type`(string: "native" 또는 "mcp"), `mcp_server_name`(string, 선택), `metadata`(object, 선택 — 파일 쓰기 도구의 경우 `model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`, `model_added_chars`, `model_removed_chars`, `user_added_chars`, `user_removed_chars` 포함)

- `qwen-code.file_operation`: 각 파일 작업.
  - **속성**: `tool_name`(string), `operation`(string: "create", "read", "update"), `lines`(int, 선택), `mimetype`(string, 선택), `extension`(string, 선택), `programming_language`(string, 선택)

- `qwen-code.tool_output_truncated`: 도구 출력이 크기 임계값을 초과.
  - **속성**: `tool_name`(string), `original_content_length`(int), `truncated_content_length`(int), `threshold`(int), `lines`(int), `prompt_id`(string)

#### API 이벤트

- `qwen-code.api_request`: LLM API로의 나가는 요청.
  - **속성**: `model`(string), `prompt_id`(string), `request_text`(string, 선택), `subagent_name`(string, 선택)

- `qwen-code.api_response`: LLM API로부터 수신한 응답.
  - **속성**: `response_id`(string), `model`(string), `status_code`(int/string, 선택), `duration_ms`(int), `input_token_count`(int), `output_token_count`(int), `cached_content_token_count`(int), `thoughts_token_count`(int), `total_token_count`(int), `prompt_id`(string), `auth_type`(string, 선택), `response_text`(string, 선택), `subagent_name`(string, 선택)

- `qwen-code.api_error`: API 요청 실패.
  - **속성**: `model`(string), `prompt_id`(string), `duration_ms`(int), `error_message`(string), `response_id`(string, 선택), `auth_type`(string, 선택), `error_type`(string, 선택), `status_code`(int/string, 선택), `subagent_name`(string, 선택)

  추가로 OTel 표준 별칭(`http.status_code`, `error.message`, `model_name`, `duration`)이 호환성을 위해 배출됩니다.

- `qwen-code.api_cancel`: 사용자에 의한 API 요청 취소.
  - **속성**: `model`(string), `prompt_id`(string), `auth_type`(string, 선택), `loop_wakeups_cancelled`(int, 선택)

- `qwen-code.api_retry`: LLM 호출 사이트에서의 HTTP 상태 재시도(429/5xx). `InvalidStreamError` 재시도를 별도의 예산으로 처리하는 `chat.content_retry`와 구별됨.
  - **속성**: `model`(string), `prompt_id`(string, 선택), `attempt_number`(int), `error_type`(string, 선택), `error_message`(string), `status_code`(int/string, 선택), `retry_delay_ms`(int), `duration_ms`(int, retry_delay_ms와 동일 — 백오프 슬립, HTTP 라운드트립이 아님; 시도 기간은 qwen-code.llm_request 스팬 참조), `subagent_name`(string, 선택)

- `qwen-code.malformed_json_response`: `generateJson` 응답을 파싱할 수 없음.
  - **속성**: `model`(string)

- `qwen-code.flash_fallback`: 폴백으로 flash 모델로 전환.
  - **속성**: `auth_type`(string)

- `qwen-code.ripgrep_fallback`: 폴백으로 grep으로 전환.
  - **속성**: `use_ripgrep`(boolean), `use_builtin_ripgrep`(boolean), `error`(string, 선택)

#### 복원력 이벤트

- `qwen-code.chat.content_retry`: 콘텐츠 오류 재시도(예: 빈 스트림).
  - **속성**: `attempt_number`(int), `error_type`(string), `retry_delay_ms`(int), `model`(string)

- `qwen-code.chat.content_retry_failure`: 모든 콘텐츠 재시도 소진.
  - **속성**: `total_attempts`(int), `final_error_type`(string), `total_duration_ms`(int, 선택), `model`(string)

- `qwen-code.chat.invalid_chunk`: 스트림에서 잘못된 청크 수신.
  - **속성**: `error.message`(string, 선택)

#### 명령어 및 확장 이벤트

- `qwen-code.slash_command`: 사용자가 슬래시 명령어를 실행.
  - **속성**: `command`(string), `subcommand`(string, 선택), `status`(string: "success" 또는 "error", 선택)

- `qwen-code.slash_command.model`: 사용자가 `/model` 명령어로 모델을 전환.
  - **속성**: `model_name`(string)

- `qwen-code.skill_launch`: skill이 시작됨.
  - **속성**: `skill_name`(string), `success`(boolean), `prompt_id`(string)

- `qwen-code.extension_install`: 확장이 설치됨.
  - **속성**: `extension_name`(string), `extension_version`(string), `extension_source`(string), `status`(string: "success"/"error")

- `qwen-code.extension_uninstall`: 확장이 제거됨.
  - **속성**: `extension_name`(string), `status`(string)

- `qwen-code.extension_enable`: 확장이 활성화됨.
  - **속성**: `extension_name`(string), `setting_scope`(string)

- `qwen-code.extension_disable`: 확장이 비활성화됨.
  - **속성**: `extension_name`(string), `setting_scope`(string)

- `qwen-code.extension_update`: 확장이 업데이트됨.
  - **속성**: `extension_name`(string), `extension_id`(string), `extension_previous_version`(string), `extension_version`(string), `extension_source`(string), `status`(string: "success"/"error")

- `qwen-code.ide_connection`: IDE 연결 이벤트.
  - **속성**: `connection_type`(string: "start" 또는 "session")

- `qwen-code.auth`: 인증 이벤트.
  - **속성**: `auth_type`(string), `action_type`("auto", "manual", "coding-plan"), `status`("success", "error", "cancelled"), `error_message`(선택)

#### 서브에이전트 이벤트

- `qwen-code.subagent_execution`: 서브에이전트 수명주기 이벤트.
  - **속성**: `subagent_name`(string), `status`("started", "completed", "failed", "cancelled"), `terminate_reason`(선택), `result`(선택), `execution_summary`(선택)

#### Arena 이벤트

- `qwen-code.arena_session_started`: Arena 세션 시작.
  - **속성**: `arena_session_id`(string), `model_ids`(JSON 문자열 배열), `task_length`(int)

- `qwen-code.arena_agent_completed`: Arena 에이전트 완료.
  - **속성**: `arena_session_id`(string), `agent_session_id`(string), `agent_model_id`(string), `status`(string: "completed"/"failed"/"cancelled"), `duration_ms`(int), `rounds`(int), `total_tokens`(int), `input_tokens`(int), `output_tokens`(int), `tool_calls`(int), `successful_tool_calls`(int), `failed_tool_calls`(int)

- `qwen-code.arena_session_ended`: Arena 세션 완료.
  - **속성**: `arena_session_id`(string), `status`(string: "selected"/"discarded"/"failed"/"cancelled"), `duration_ms`(int), `display_backend`(string, 선택), `agent_count`(int), `completed_agents`(int), `failed_agents`(int), `cancelled_agents`(int), `winner_model_id`(string, 선택)

#### 워크플로 이벤트

- `qwen-code.workflow_keyword`: 워크플로 키워드 트리거 발생.

- `qwen-code.workflow_run`: 워크플로 실행이 터미널 상태에 도달.
  - **속성**: `status`(string), `agents_dispatched`(int), `agents_completed`(int), `phase_count`(int), `tokens_spent`(int), `duration_ms`(int)

#### 자동 메모리 이벤트

- `qwen-code.memory.extract`: 메모리 추출 실행 완료.
  - **속성**: `trigger`("auto"/"manual"), `status`("completed"/"skipped"/"failed"), `skipped_reason`(선택), `patches_count`(int), `touched_topics`(string), `duration_ms`(int)

- `qwen-code.memory.dream`: 메모리 통합(dream) 실행 완료.
  - **속성**: `trigger`("auto"/"manual"), `status`("updated"/"noop"/"failed"/"cancelled"), `deduped_entries`(int), `touched_topics_count`(int), `touched_topics`(string), `duration_ms`(int)

- `qwen-code.memory.recall`: 메모리 리콜 작업 완료.
  - **속성**: `query_length`(int), `docs_scanned`(int), `docs_selected`(int), `strategy`("none"/"heuristic"/"model"), `duration_ms`(int)

#### 프롬프트 제안 및 추측 이벤트

- `qwen-code.prompt_suggestion`: 프롬프트 제안 결과.
  - **속성**: `outcome`("accepted"/"ignored"/"suppressed"), `prompt_id`(선택), `accept_method`("tab"/"enter"/"right", 선택), `accept_source`("live"/"fallback", 선택), `time_to_accept_ms`(선택), `time_to_ignore_ms`(선택), `time_to_first_keystroke_ms`(선택), `suggestion_length`(선택), `similarity`(선택), `was_focused_when_shown`(선택), `reason`(선택)

- `qwen-code.speculation`: 추측 실행 결과.
  - **속성**: `outcome`("accepted"/"aborted"/"failed"), `turns_used`(int), `files_written`(int), `tool_use_count`(int), `duration_ms`(int), `boundary_type`(선택), `had_pipelined_suggestion`(boolean)

#### 기타 이벤트

- `qwen-code.chat_compression`: 채팅 컨텍스트 압축.
  - **속성**: `tokens_before`(int), `tokens_after`(int), `compression_input_token_count`(int, 선택), `compression_output_token_count`(int, 선택)

- `qwen-code.next_speaker_check`: 다음 발화자 판정.
  - **속성**: `prompt_id`(string), `finish_reason`(string), `result`(string)

- `loop_detected`: 에이전트 실행 중 루프 감지. _(참고: `qwen-code.` 접두사 없이 배출됨 — 기존 비일관성.)_
  - **속성**: `loop_type`(string), `prompt_id`(string)

- `kitty_sequence_overflow`: Kitty 그래픽 프로토콜 시퀀스가 버퍼 크기를 초과. _(참고: `qwen-code.` 접두사 없이 배출됨 — 기존 비일관성.)_
  - **속성**: `sequence_length`(int), `truncated_sequence`(string, 처음 20자)

### 메트릭

메트릭은 시간에 따른 동작의 수치 측정입니다. 메트릭 이름은 `qwen-code.*` 접두사를 사용합니다.

#### 핵심 메트릭

- `qwen-code.session.count`(Counter, Int): CLI 시작 시 한 번씩 증가.

- `qwen-code.tool.call.count`(Counter, Int): 도구 호출을 카운트.
  - **속성**: `function_name`, `status`("success"/"error"/"cancelled"), `success`(boolean, 호환성을 위해 유지), `decision`("accept"/"reject"/"auto_accept"/"modify", 선택), `tool_type`("mcp"/"native", 선택)

- `qwen-code.tool.execution.count`(Counter, Int): 도구 실행 결과를 카운트. 낮은 카디널리티를 유지하기 위해 의도적으로 `function_name` 차원을 포함하지 않음. 실행 실패율을 특정 도구에 귀속하려면 `qwen-code.tool_call` 로그로 내려가야 함. 실행 실패 비율 계산 시 `unknown`, `not_started` 및 `cancelled`를 제외(분모는 `success` + `error`).
  - **속성**: `execution_status`("not_started"/"success"/"error"/"cancelled"/"unknown"), `tool_type`("mcp"/"native"), 전역 구성된 공통 메트릭 속성(옵트인 `session.id` 등)

- `qwen-code.tool.call.latency`(Histogram, ms): 도구 호출 지연 시간을 측정.
  - **속성**: `function_name`(string)

- `qwen-code.api.request.count`(Counter, Int): 모든 API 요청을 카운트.
  - **속성**: `model`, `status_code`, `error_type`(선택)

- `qwen-code.api.request.latency`(Histogram, ms): API 요청 지연 시간을 측정.
  - **속성**: `model`(string)

- `qwen-code.token.usage`(Counter, Int): 사용된 토큰을 카운트.
  - **속성**: `model`, `type`("input"/"output"/"thought"/"cache")

- `qwen-code.file.operation.count`(Counter, Int): 파일 작업을 카운트.
  - **속성**: `operation`("create"/"read"/"update"), `lines`(선택), `mimetype`(선택), `extension`(선택), `programming_language`(선택)

- `qwen-code.chat_compression`(Counter, Int): 채팅 압축 작업을 카운트.
  - **속성**: `tokens_before`(int), `tokens_after`(int)

- `qwen-code.slash_command.model.call_count`(Counter, Int): 모델 슬래시 명령어 호출을 카운트.
  - **속성**: `slash_command.model.model_name`(string)

- `qwen-code.subagent.execution.count`(Counter, Int): 서브에이전트 실행 이벤트를 카운트.
  - **속성**: `subagent_name`, `status`("started"/"completed"/"failed"/"cancelled"), `terminate_reason`(선택)

#### 복원력 메트릭

- `qwen-code.api.retry.count`(Counter, Int): LLM 호출 사이트에서의 HTTP 상태 재시도(429/5xx).
  - **속성**: `model`(string)

- `qwen-code.chat.content_retry.count`(Counter, Int): 콘텐츠 오류로 인한 재시도.

- `qwen-code.chat.content_retry_failure.count`(Counter, Int): 모든 콘텐츠 재시도 소진.

- `qwen-code.chat.invalid_chunk.count`(Counter, Int): 스트림의 잘못된 청크.

#### Arena 메트릭

- `qwen-code.arena.session.count`(Counter, Int): 상태별 Arena 세션.
  - **속성**: `status`, `display_backend`(선택)

- `qwen-code.arena.session.duration`(Histogram, ms): Arena 세션 지속 시간.
  - **속성**: `status`

- `qwen-code.arena.agent.count`(Counter, Int): Arena 에이전트 완료.
  - **속성**: `status`, `model_id`

- `qwen-code.arena.agent.duration`(Histogram, ms): Arena 에이전트 실행 지속 시간.
  - **속성**: `model_id`

- `qwen-code.arena.agent.tokens`(Counter, Int): Arena 에이전트의 토큰 사용량.
  - **속성**: `model_id`, `type`("input"/"output")

- `qwen-code.arena.result.selected`(Counter, Int): Arena 결과 선택.
  - **속성**: `model_id`

#### 자동 메모리 메트릭

- `qwen-code.memory.extract.count`(Counter, Int): 자동 메모리 추출 실행.
  - **속성**: `trigger`("auto"/"manual"), `status`

- `qwen-code.memory.extract.duration`(Histogram, ms): 추출 지속 시간.
  - **속성**: `trigger`, `status`

- `qwen-code.memory.dream.count`(Counter, Int): 자동 메모리 dream 실행.
  - **속성**: `trigger`("auto"/"manual"), `status`

- `qwen-code.memory.dream.duration`(Histogram, ms): Dream 실행 지속 시간.
  - **속성**: `trigger`, `status`

- `qwen-code.memory.recall.count`(Counter, Int): 자동 메모리 리콜 작업.
  - **속성**: `strategy`("none"/"heuristic"/"model")

- `qwen-code.memory.recall.duration`(Histogram, ms): 리콜 지속 시간.
  - **속성**: `strategy`

#### API 요청 분석

- `qwen-code.api.request.breakdown`(Histogram, ms): 단계별 API 요청 시간 분석.
  - **속성**: `model`, `phase`("request_preparation"/"network_latency"/"response_processing"/"token_processing")

### 데몬 메트릭

데몬 프로세스(장기 실행 HTTP 서버 모드)는 자체 메트릭을 노출합니다.

> **참고:** 세 Observable Gauge(`daemon.session.active`, `daemon.sse.active`, `daemon.process.heap_used`)는 각 수집 간격마다 업데이트되는 콜백 기반 메트릭입니다. `registerDaemonGaugeCallbacks()`는 데몬 초기화 중에 관찰 콜백을 등록하기 위해 호출되어야 합니다.

#### HTTP

- `qwen-code.daemon.http.request.count`(Counter, Int): 라우트 및 상태 클래스별 요청 수.
  - **속성**: `route`, `status_class`("2xx"/"4xx"/"5xx")

- `qwen-code.daemon.http.request.duration`(Histogram, ms): 요청 지속 시간.
  - **속성**: `route`
  - **버킷**: 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000

#### 세션

- `qwen-code.daemon.session.active`(ObservableGauge, Int): 현재 활성 세션.

- `qwen-code.daemon.session.lifecycle`(Counter, Int): 세션 수명주기 이벤트.
  - **속성**: `action`("spawn"/"close"/"die")

#### 채널

- `qwen-code.daemon.channel.lifecycle`(Counter, Int): ACP 채널 수명주기 이벤트.
  - **속성**: `action`("spawn"/"exit"), `expected`(boolean, 선택)

#### 프롬프트

- `qwen-code.daemon.prompt.queue_wait`(Histogram, ms): 프롬프트 FIFO 큐 대기 시간.
  - **버킷**: 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000

- `qwen-code.daemon.prompt.duration`(Histogram, ms): 엔드투엔드 프롬프트 지속 시간.
  - **버킷**: 100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000, 600000

#### 오류

- `qwen-code.daemon.bridge.error.count`(Counter, Int): 유형별 브리지 오류.
  - **속성**: `error_type`(알려진 클래스 이름 또는 "unknown")

- `qwen-code.daemon.cancel.count`(Counter, Int): 취소 요청 수.

#### 리소스

- `qwen-code.daemon.sse.active`(ObservableGauge, Int): 활성 SSE 연결.

- `qwen-code.daemon.process.heap_used`(ObservableGauge, Int, bytes): 힙 메모리 사용량.

### 스팬

분산 추적 스팬은 `qwen-code.interaction`을 루트로 하는 트리를 형성합니다. 각 인터랙션은 자체 `traceId`를 가진 trace 루트이며, 크로스 프롬프트 상관관계는 `session.id` 속성을 사용합니다.

세션 수명 주기는 OpenTelemetry General Session 시맨틱 컨벤션을 통해서도 내보내집니다. OTel 로그 파이프라인이 활성화되면 Qwen Code는 필수 `session.id` 속성을 가진 `session.start` 및 `session.end` 로그 이벤트를 배출합니다(위의 핵심 세션 이벤트에 분류됨). 재개된 지속 대화는 재개된 세션 ID가 현재 것과 다를 때만 `session.start` 이벤트에 `session.previous_id`를 포함합니다. 콜드 스타트 재개(`--resume`, `--continue`, `--fork-session`)는 이를 전달하지 않습니다. `/clear` 및 기타 대체 흐름은 이전 대화를 폐기하므로 의도적으로 연속을 주장하지 않습니다.

기존 Qwen 전용 `qwen-code.config`/`cli_config` 및 RUM `session_start` 레코드는 호환성을 위해 계속 제공됩니다. GenAI 요청 스팬은 동일한 소유 세션 ID에 대해 `gen_ai.conversation.id`를 계속 사용합니다.

- `qwen-code.interaction`: 메인 에이전트 호출 스팬. 하나의 논리적 프롬프트에 대한 모든 LLM 요청, 도구 승인/실행 및 계속을 포함합니다. 사용자 쿼리, 재시도, cron 프롬프트, 알림, 팀메이트 메시지 및 Goal 턴은 호출을 생성하며; 도구 결과, hook 및 스티어링은 정확한 활성 프롬프트 ID를 재사용합니다.
  - **GenAI 속성**: `gen_ai.operation.name`(`invoke_agent`), `gen_ai.agent.name`(`qwen-code`), `gen_ai.conversation.id`, 선택적 `gen_ai.output.type`(구성된 JSON Schema가 있는 경우 `json`만), 민감한 `gen_ai.input.messages`, 민감한 `gen_ai.output.messages` 및 선택적 ARMS 확장 `gen_ai.user.id`
  - **호환성 속성**: `session.id`, `qwen-code.prompt_id`, `qwen-code.message_type`, `qwen-code.model`, `qwen-code.approval_mode`, `interaction.sequence`, `interaction.duration_ms`, `qwen-code.turn_status`("ok"/"error"/"cancelled")
  - `gen_ai.request.model`은 에이전트가 재정의, 폴백 및 동적 모델 선택을 지원하므로 의도적으로 생략됩니다. `gen_ai.provider.name` 및 에이전트 ID/버전/설명 또한 생략됩니다.
  - 에이전트 입력은 하나의 원본 사용자 프롬프트이며 확장된 모델 요청이 아닙니다. 에이전트 출력은 하나의 최종 사용자 가시 텍스트 투영이며, 구조화된 JSON은 `finish_reason=tool_call`과 함께 압축 JSON 텍스트를 사용합니다. 둘 다 민감한 스팬 속성이 활성화되고 완전한 JSON이 속성당 제한에 맞지 않는 한 생략됩니다.

- `qwen-code.llm_request`: 단일 LLM API 호출을 래핑.
  - **GenAI 속성**: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.conversation.id`, 선택적 ARMS 확장 `gen_ai.user.id`, `gen_ai.request.model`, `gen_ai.request.stream`, `gen_ai.request.choice.count`, `gen_ai.request.max_tokens`, `gen_ai.request.temperature`, `gen_ai.request.top_p`, `gen_ai.request.frequency_penalty`, `gen_ai.request.presence_penalty`, `gen_ai.request.stop_sequences`, 선택적 `gen_ai.output.type`, `gen_ai.response.id`, `gen_ai.response.model`, `gen_ai.response.finish_reasons`, `gen_ai.response.time_to_first_chunk`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`
  - **호환성 속성**: `session.id`, `qwen-code.prompt_id`, `llm_request.context`("subagent"/"interaction"/"standalone"), `duration_ms`, `ttft_ms`, `request_setup_ms`, `attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`, `success`, `error`, `finish_reason`, `thoughts_token_count`, `subagent_name`, `error_type`, `error_status_code`
  - 표준 응답 필드는 프로바이더 응답에서 옵니다. 표준 토큰 필드는 프로바이더가 보고한 음이 아닌 안전 정수에 대해서만 배출됩니다. 프로바이더가 총 토큰 수만 보고하면 입력/출력 사용량은 추정 없이 생략됩니다.
  - 표준 요청 매개변수 필드는 어댑터 기본값, 재정의, 미지원 필드 제거 및 출력 창 클램프 후 첫 프로바이더 최종 SDK 요청 객체에서 옵니다. Qwen Code는 SDK 또는 서버 기본값을 추론하지 않습니다.
  - 스트리밍 요청은 `gen_ai.request.stream=true`를 배출합니다. `gen_ai.response.time_to_first_chunk`는 프로바이더 호출부터 프로바이더 어댑터가 산출한 첫 정규화된 응답까지의 초를 측정합니다. 이는 첫 원시 네트워크 프레임과 다를 수 있습니다. 비스트리밍 요청은 두 표준 스트리밍 속성을 모두 생략합니다. 표준 시맨틱 컨벤션에서 부재하는 `gen_ai.request.stream`은 비스트리밍을 의미하기 때문입니다.

- `qwen-code.tool`: 전체 도구 수명주기(승인 대기 + 실행)를 래핑.
  - **속성**: `session.id`, 선택적 ARMS 확장 `gen_ai.user.id`, `gen_ai.operation.name`(`execute_tool`), 선택적 상속 `gen_ai.agent.name`, `gen_ai.tool.name`, `gen_ai.tool.type`(`function`), `gen_ai.tool.call.id`, `tool.call_id`, `duration_ms`, `success`, `error`, 실패 시 `error.type`, `tool.failure_kind`(string, 선택 — 구체적인 실패 이유, 예: "cancelled", "tool_error", "tool_exception", "timeout", "permission_denied", "pre_hook_blocked")

- `qwen-code.tool.execution`: 도구 실행 단계(승인 후)를 래핑. 시도된 실행에 대해서만 배출됨.
  - **속성**: `session.id`, `gen_ai.tool.name`(선택), `tool.call_id`(선택), `duration_ms`, `success`, `error`, `execution_status`("success"/"error"/"cancelled"), `error_type`, 실패 시 `error.type`

- `qwen-code.tool.blocked_on_user`: 도구가 사용자 승인을 기다리는 시간.
  - **속성**: `session.id`, `tool.name`, `tool.call_id`, `duration_ms`, `decision`("proceed_once"/"proceed_always"/"cancel"/"aborted"/"auto_approved"/"error"), `source`("cli"/"ide"/"hook"/"auto"/"system")

- `qwen-code.hook`: 각 pre/post 도구 사용 hook 발생 사이트를 래핑.
  - **속성**: `session.id`, `hook_event`("PreToolUse"/"PostToolUse"/"PostToolUseFailure"/"PostToolBatch"), `tool.name`, `tool.use_id`(선택), `is_interrupt`(boolean, 선택), `duration_ms`, `success`, `should_proceed`(선택), `should_stop`(선택), `block_type`(선택), `error`(선택)

- `qwen-code.subagent`: 단일 서브에이전트 호출을 래핑.
  - **속성**: `gen_ai.operation.name`(`invoke_agent`), `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.conversation.id`, 선택적 ARMS 확장 `gen_ai.user.id`, 선택적 `gen_ai.request.model`, `qwen-code.subagent.id`, `qwen-code.subagent.name`, `qwen-code.subagent.invocation_kind`("foreground"/"fork"/"background"), `qwen-code.subagent.is_built_in`, `qwen-code.subagent.depth`, `qwen-code.subagent.status`, `qwen-code.subagent.terminate_reason`, `qwen-code.subagent.duration_ms`

성공 및 취소된 GenAI 스팬은 `SpanStatus`를 `UNSET`으로 유지합니다. 실패는 `ERROR`, 제한된 상태 설명 및 낮은 카디널리티의 `error.type`을 설정합니다.

#### GenAI 필드 마이그레이션 및 ARMS 인식

LLM 스팬은 이제 정확한 동일 등가 프라이빗 별칭 없이 표준 `gen_ai.request.*`, `gen_ai.response.*` 및 `gen_ai.usage.*` 필드를 사용합니다. 요청 샘플링 속성은 표준 이름으로만 기록됩니다. 베어 `temperature`, `top_p`, `max_tokens`, 페널티, choice-count 또는 stop-sequence 별칭은 배출되지 않습니다. 도구 스팬도 마찬가지로 `tool.name` 없이 `gen_ai.tool.name`을 사용합니다. blocked-on-user 및 hook 스팬은 GenAI Tool 스팬이 아니므로 `tool.name`을 유지합니다. 잘못된 별칭 `gen_ai.usage.cached_tokens`, `gen_ai.server.time_to_first_token` 및 `gen_ai.usage.reasoning_tokens`은 더 이상 배출되지 않습니다. 프로바이더가 보고한 캐시 읽기에는 `gen_ai.usage.cache_read.input_tokens`를 사용하고 표준 스트리밍 지연에는 `gen_ai.response.time_to_first_chunk`를 사용하세요. 프라이빗 `ttft_ms` Span 속성은 첫 사용자 가시 출력 지연에 대해 계속 사용 가능하며 `/stats`, `sampling_ms` 및 출력 토큰 처리량을 계속 구동합니다. `gen_ai.response.time_to_first_chunk`는 첫 정규화 청크 지연을 측정하는 독립적 표준 속성입니다. 전체 버전 고정 계약 및 연기된 필드는 [GenAI 및 ARMS 필드 정렬](../../design/gen-ai-arms-field-alignment.md)에 문서화되어 있습니다.

ARMS가 내보내진 스팬을 GenAI 애플리케이션으로 인식하도록 하려면 리소스 기능을 명시적으로 구성해야 합니다:

```json
{
  "telemetry": {
    "resourceAttributes": {
      "acs.arms.service.feature": "genai_app"
    }
  }
}
```

Qwen Code는 이 ARMS별 리소스 속성이나 `gen_ai.span.kind`를 주입하지 않습니다. ARMS는 `gen_ai.operation.name`에서 LLM, Tool 및 Agent 역할을 추론할 수 있습니다.

- `qwen-code.daemon.request`: 데몬 HTTP 요청을 래핑.
  - **속성**: `http.request.method`, `http.route`, `qwen-code.daemon.operation`, `session.id`, `http.response.status_code`

- `qwen-code.daemon.bridge`: 데몬 브리지 작업을 래핑.
  - **속성**: `qwen-code.daemon.operation`

#### 리소스 메트릭

- `qwen-code.memory.usage`(Histogram, bytes): 메모리 사용량. telemetry가 활성화된 경우 메모리 압력 모니터에 의해 기록됨.
  - **속성**: `memory_type`(string: "heap_used"/"rss")

- `qwen-code.cpu.usage`(Histogram, percent): CPU 사용률. telemetry가 활성화된 경우 메모리 압력 모니터에 의해 기록됨.
  - **속성**: (없음)

### 성능 모니터링 (예약됨)

다음 메트릭은 정의되었지만 **아직 프로덕션에서 활성화되지 않았습니다**. 전용 성능 모니터링 구성 플래그 뒤에서 활성화될 예정입니다.

- `qwen-code.startup.duration`(Histogram, ms): 단계별 CLI 시작 시간.
  - **속성**: `phase`(string)

- `qwen-code.tool.queue.depth`(Histogram, count): 실행 큐의 도구 수.

- `qwen-code.tool.execution.breakdown`(Histogram, ms): 단계별 도구 실행 시간.
  - **속성**: `function_name`, `phase`("validation"/"preparation"/"execution"/"result_processing")

- `qwen-code.token.efficiency`(Histogram, ratio): 토큰 효율 메트릭.
  - **속성**: `model`, `metric`, `context`(선택)

- `qwen-code.performance.score`(Histogram, score): 복합 성능 점수(0-100).
  - **속성**: `category`, `baseline`(선택)

- `qwen-code.performance.regression`(Counter, Int): 회귀 감지 이벤트.
  - **속성**: `metric`, `severity`("low"/"medium"/"high"), `current_value`, `baseline_value`

- `qwen-code.performance.regression.percentage_change`(Histogram, percent): 기준선 대비 백분율 변화.
  - **속성**: `metric`, `severity`, `current_value`, `baseline_value`

- `qwen-code.performance.baseline.comparison`(Histogram, percent): 기준선 대비 성능.
  - **속성**: `metric`, `category`, `current_value`, `baseline_value`
