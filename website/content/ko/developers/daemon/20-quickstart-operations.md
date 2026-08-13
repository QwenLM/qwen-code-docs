# 퀵스타트 & 운영

이 페이지는 **`qwen serve`를 시작하는 방법, 작동 확인 방법, 그리고 `qwen serve`부터 리스닝 서버까지의 내부 호출 체인**에 중점을 둡니다. 아키텍처, 컴포넌트, 와이어 프로토콜 세부 정보는 다른 데몬 심층 페이지에서 다룹니다.

## 1. 최단 경로

```bash
qwen serve
```

출력:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

브라우저에서 `http://127.0.0.1:4170/`를 열면 Web Shell UI를 확인할 수 있습니다: 채팅, 세션 목록, 워크스페이스 검사. `createServeApp()`는 번들된 Web Shell 자산(`packages/cli/src/serve/web-shell-static.ts`)을 `bearerAuth` **이전에** 마운트하므로 토큰 없이 셸 자체가 로드됩니다; 셸의 API 호출은 bearer가 설정되어 있으면 이를 전달합니다 — 인증이 활성화되어 있으면 `--open`(토큰을 URL 프래그먼트에 넣어 서버로 전송되지 않음)으로 데몬을 시작하거나 `#token=…`을 수동으로 추가하세요. `--no-web`은 opt-out하여 데몬을 API 전용으로 남깁니다.

## 2. 실행 레시피

```bash
# 1. 로컬 개발 기본값 (루프백, 토큰 없음)
qwen serve

# 2. 명시적 워크스페이스 + 임시 포트
qwen serve --workspace /path/to/repo --port 0

# 3. 강화된 루프백 개발 (루프백에서도 bearer 강제)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. LAN에 노출 (비루프백은 토큰 필수)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. 다중 세션 및 더 큰 리플레이 링 튜닝
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. 다중 클라이언트 협업 + 엄격한 MCP 예산
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. settings.json에 합의 정책 설정 후 시작
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. 디버그 로깅
QWEN_SERVE_DEBUG=1 qwen serve

# 9. F2 풀 비활성화 (세션별 MCP 클라이언트로 폴백)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. 브라우저 웹 UI 교차 출처 접근 허용
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. 프롬프트 기한 + SSE 유휴 타임아웃
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. 마지막 세션 종료 후 ACP 자식을 웜 상태로 유지
qwen serve --channel-idle-timeout-ms 60000

# 13. HTTP 속도 제한 활성화
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

강화된 루프백 레시피(3)에서 `/health`는 `bearerAuth` 이후에 등록되므로, 다른 API 라우트와 마찬가지로 프로브도 토큰을 전달해야 합니다(Web Shell 정적 표면은 설계상 pre-auth를 유지; API 전용 데몬은 `--no-web`을 전달).

## 3. 전체 시작 플래그

CLI는 **`packages/cli/src/commands/serve.ts`**에 정의됨:

| 플래그                                    | 타입                           | 기본값                                           | 필수 조건                                | 효과                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                           | -                                        | TCP 포트; `0`은 OS 할당 임시 포트.                                                                                                                                                                                                                                                                                   |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                      | 비루프백은 토큰 필수                     | 바인드 주소. 루프백 값: `127.0.0.1`, `localhost`, `::1`, `[::1]`. `[::1]` 대괄호는 자동 제거; `host:port` 입력은 `--port`를 사용하라는 안내와 함께 거부.                                                                                                                                                              |
| `--token <s>`                           | string                         | env / none                                       | 비루프백 및 `--require-auth`             | Bearer 토큰; 한 번 trim됨. **`/proc/<pid>/cmdline`에 나타나므로 `QWEN_SERVER_TOKEN`을 선호**. 부트 stderr에서도 이에 대해 경고.                                                                                                                                                                                       |
| `--max-sessions <n>`                    | number                         | `32`                                             | -                                        | 워크스페이스별 활성 세션 상한. 초과 시 503 반환. `0`은 무제한. `NaN` / 음수 값은 throw.                                                                                                                                                                                                                                |
| `--max-total-sessions <n>`              | number                         | 다중 워크스페이스 시작/복원에 따라 파생          | -                                        | 데몬 전체 활성 세션 상한. 생략 시 워크스페이스별 상한과 시작/복원 워크스페이스 수에서 유한 기본값이 한 번 파생되며, 동적 등록은 재계산하지 않음. `0`은 무제한.                                                                                                                                                          |
| `--memory-budget-mb <n>`                | `[1024, 1048576]` 범위의 정수   | cgroup/호스트 메모리의 50%                        | -                                        | 데몬 프로세스 트리의 총 메모리 예산, 해석된 사용 가능 메모리로 상한. 어떤 자식도 이 값으로부터 크기가 정해지지 않으며, 유일한 소비자는 적응형 live-journal 성장 풀(`--max-journal-bytes` 참조). 모델링된 자식별 파티션을 포함하여 `limits.memory` 아래에 보고.                                                                                                                        |
| `--max-journal-events <n>`              | 양의 안전 정수                 | `10000`                                          | -                                        | 세션별 인-플라이트 `liveJournal` 리플레이 항목의 기본 상한. 적응형 성장이 이를 올릴 수 있음(`--max-journal-bytes` 참조); 어느 journal 플래그라도 고정하면 성장 비활성화.                                                                                                                                                                                                             |
| `--max-journal-bytes <n>`               | 양의 안전 정수                 | `8388608`                                        | -                                        | 인-플라이트 `liveJournal`의 세션별 기본 바이트 상한. 증가하는 turn이 요구에 따라 상한을 성장시킴(풀의 남은 여유 내에서 2배까지, 데몬 전체 풀의 유효 `--memory-budget-mb`의 5% 이내, `1024` MB 상한; 유효 예산이 1024 MB 최소값 미만이면 0 — 성장 비활성화), 세션당 256 MiB 하드 상한을 초과하지 않음; 어느 journal 플래그라도 고정하면 성장 비활성화. |
| `--memory-pressure-mode <mode>`         | `off` \| `observe`             | `observe`                                        | 관찰 전용                                | 두 모드 모두 `runtime.memory.pressure`를 보고; `observe`만 `daemon_memory_pressure` 이슈를 발생. 루트 프로세스만 해당.                                                                                                                                                                                                |
| `--child-heap-mode <mode>`              | `off` \| `observe`             | `observe`                                        | 관찰 전용                                | `observe`에서는 모델링된 파티션을 `limits.memory.childHeap` 아래에 보고; 아무것도 적용하거나 거부하지 않음. `off`에서는 해당 블록의 두 수치가 `null`.                                                                                                                                                                  |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                              | -                                        | 세션당 수락되었지만 대기/실행 중인 프롬프트 상한. 초과 시 503 반환. `0` / `Infinity`는 무제한. 음수 또는 비정수 값은 throw.                                                                                                                                                                                            |
| `--workspace <dir>`                     | string / 반복 가능              | `process.cwd()`                                  | -                                        | 시작 워크스페이스 런타임; 반복하여 추가 격리 런타임 등록. 첫 번째가 기본. 각 값은 **절대 경로여야 하며, 존재해야 하며, 디렉토리여야 함**. 부트는 `canonicalizeWorkspace`를 통해 모든 값을 표준화. `POST /session`에서 `cwd`가 불일치하면 `400 workspace_mismatch` 반환.                                                 |
| `--max-connections <n>`                 | number                         | `256`                                            | -                                        | 리스너 수준 `server.maxConnections`. `0` / `Infinity`는 무제한. `NaN` / 음수 값은 fail-open 동작을 방지하기 위해 부트 실패.                                                                                                                                                                                            |
| `--require-auth`                        | boolean                        | `false`                                          | 토큰 필수                                | 루프백 및 `/health`로 bearer 인증을 확장. 토큰 없으면 부트 거부.                                                                                                                                                                                                                                                     |
| `--enable-session-shell`                | boolean                        | `false`                                          | 토큰 필수                                | 직접 `POST /session/:id/shell` 실행을 활성화. 호출자는 세션에 바인딩된 `X-Qwen-Client-Id`도 전송해야 함.                                                                                                                                                                                                              |
| `--event-ring-size <n>`                 | number                         | `8000`                                           | -                                        | 세션별 SSE 리플레이 링 깊이. 소프트 상한은 `MAX_EVENT_RING_SIZE = 1_000_000`; 범위 초과 값은 브리지 생성 시 throw.                                                                                                                                                                                                     |
| `--http-bridge`                         | boolean                        | `true`                                           | -                                        | 브리지 모드: 프로덕션은 하나의 기본 `qwen --acp` 자식을 예열하려고 하며 실패 시 첫 사용 시 재시도; 신뢰된 보조는 필요 시 하나를 시작하고, 신뢰할 수 없는 보조는 ACP를 시작할 수 없음. Stage 2 인-프로세스 모드는 아직 구현되지 않음; `--no-http-bridge`는 폴백하여 stderr에 출력.                                       |
| `--mcp-client-budget <n>`               | number                         | none                                             | `mcp-budget-mode=enforce` 시 필수          | 워크스페이스 MCP 클라이언트 상한. 양의 정수여야 함.                                                                                                                                                                                                                                                                   |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | 예산 설정 시 `warn`, 아니면 `off`                  | `enforce`는 `--mcp-client-budget` 필수   | `enforce`는 거부, `warn`은 75%에서 경고만, `off`는 관찰 전용.                                                                                                                                                                                                                                                         |
| `--allow-origin <pattern>`              | 반복 가능 string               | none                                             | -                                        | 기본 Origin 거부를 대체하는 CORS 허용 목록. `*`는 토큰 필수.                                                                                                                                                                                                                                                          |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                          | -                                        | 로컬호스트 / 프라이빗 네트워크 인증 제공자 `baseUrl` 설치를 허용. 신뢰된 로컬 개발에만 사용.                                                                                                                                                                                                                           |
| `--prompt-deadline-ms <n>`              | number                         | none                                             | -                                        | 서버 측 프롬프트 벽시계 제한(ms); 타임아웃 시 프롬프트 중단.                                                                                                                                                                                                                                                           |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                             | -                                        | SSE 연결별 유휴 타임아웃(ms).                                                                                                                                                                                                                                                                                        |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                              | -                                        | 마지막 세션 종료 후 ACP 자식을 유지. `0`은 즉시 회수.                                                                                                                                                                                                                                                                 |
| `--initialize-timeout-ms <n>`           | number                         | `10000`                                          | -                                        | ACP 자식 요청 타임아웃, 초기화 핸드셰이크 포함(ms).                                                                                                                                                                                                                                                                    |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                          | -                                        | 세션 리퍼 스캔 간격. `0`은 비활성화.                                                                                                                                                                                                                                                                                  |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                        | -                                        | 연결 끊긴 세션 유휴 타임아웃. `0`은 비활성화.                                                                                                                                                                                                                                                                          |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                        | -                                        | 티어별 HTTP 속도 제한을 활성화 또는 비활성화.                                                                                                                                                                                                                                                                          |
| `--rate-limit-prompt <n>`               | number                         | `10`                                             | `--rate-limit`                           | 윈도우당 프롬프트 요청 수.                                                                                                                                                                                                                                                                                             |
| `--rate-limit-mutation <n>`             | number                         | `30`                                             | `--rate-limit`                           | 윈도우당 mutation 요청 수.                                                                                                                                                                                                                                                                                             |
| `--rate-limit-read <n>`                 | number                         | `120`                                            | `--rate-limit`                           | 윈도우당 읽기 요청 수.                                                                                                                                                                                                                                                                                                 |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                          | `--rate-limit`                           | 속도 제한 윈도우 길이; `>= 1000`이어야 함.                                                                                                                                                                                                                                                                             |

## 4. 환경 변수

| 환경 변수                               | 해당 플래그 / 효과                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | `--token`과 동일; `--token`이 우선. 부트 시 한 번 trim되어 `cat token.txt`의 개행문자를 제거.                                                                |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`(대소문자 무관)가 상세 stderr 로그를 활성화.                                                                                      |
| `QWEN_SERVE_NO_MCP_POOL`            | `1`은 워크스페이스 MCP 풀을 완전히 비활성화하고 세션별 `McpClientManager`로 폴백. capabilities에서 `mcp_workspace_pool` / `mcp_pool_restart` 광고가 중단.          |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP 자식 내부 예산 입력. CLI가 `childEnvOverrides`를 통해 `--mcp-client-budget`에서 생성; 부모 프로세스 환경 폴백이 아님.                                      |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP 자식 내부 예산 모드. CLI가 `childEnvOverrides`를 통해 `--mcp-budget-mode`에서 생성; 부모 프로세스 환경 폴백이 아님.                                         |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms`의 환경 폴백.                                                                                                                          |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms`의 환경 폴백.                                                                                                                      |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | ACP 자식이 읽음. 쉼표로 구분된 풀 전송 허용 목록; 기본값은 `stdio,websocket`.                                                                                  |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | ACP 자식이 읽음. 풀 항목 유휴 드레인 지연; 기본값은 `30000`, `1000..600000` ms로 제한.                                                                         |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true`가 속도 제한을 활성화; CLI 플래그가 우선.                                                                                                          |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt`의 환경 폴백.                                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation`의 환경 폴백.                                                                                                                         |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read`의 환경 폴백.                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms`의 환경 폴백.                                                                                                                        |

핸들별 환경 오버라이드는 의도적: 동일한 프로세스에서 실행되는 두 데몬이 `process.env`에서 레이스하지 않음. `defaultSpawnChannelFactory`는 spawn 시 환경을 스냅샷.

## 5. `settings.json`도 읽힘

부트는 `loadSettings(boundWorkspace)`를 한 번 호출:

| 키                          | 타입                                                               | 동작                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy`를 설정. **부트는 `validatePolicyConfig`로 검증**; 알 수 없는 값은 자동으로 폴백하지 않고 `InvalidPolicyConfigError`를 throw.               |
| `policy.consensusQuorum`    | 양의 정수                                                          | `consensus` 정책의 N. 기본값은 `floor(M/2)+1`. 비consensus 정책 아래에서 설정되면 무시되며 부트가 stderr 경고를 출력.                                                       |
| `context.fileName`          | string                                                             | `getCurrentGeminiMdFilename()`을 오버라이드하고 `POST /workspace/init`이 쓰는 파일을 제어.                                                                               |
| `tools.disabled`            | string[]                                                           | 다음 ACP 자식 spawn에 영향을 주기 전 `normalizeDisabledToolList()`를 통해 정규화(trim, 빈 항목 제거, 중복 제거).                                                          |
| `tools.approvalMode`        | string                                                             | 기본 세션 승인 모드.                                                                                                                                                     |
| `telemetry`                 | object                                                             | OTel 설정: `enabled`, `otlpEndpoint`, `otlpProtocol`, 시그널별 엔드포인트 등. [`17-configuration.md`](./17-configuration.md) 참조.                                        |

설정 I/O 실패(잘못된 JSON 등)는 기본값으로 폴백. `InvalidPolicyConfigError`는 예외: 정책 설정 오류는 부트를 명시적으로 실패시킴.

## 6. 부트 거부 시나리오 (명시적 실패)

`run-qwen-serve.ts`는 다음 상황에서 폴백 대신 의도적으로 throw:

| 시나리오                                                                      | 오류 접두사                                                                                         |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 토큰 없는 비루프백 바인드                                                      | `Refusing to bind ... without a bearer token`                                                       |
| 토큰 없는 `--require-auth`                                                    | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace`가 존재하지 않거나, 디렉토리가 아니거나, 절대 경로가 아님           | `Invalid --workspace ...`                                                                           |
| `--workspace` stat 권한 거부                                                   | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget`이 양의 정수가 아님                                      | `Must be a positive integer`                                                                        |
| 예산 없는 `--mcp-budget-mode=enforce`                                         | `requires a positive mcpClientBudget`                                                               |
| `--hostname`이 `localhost:4170` 형식으로 작성됨                                | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections`가 `NaN` 또는 음수                                         | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | 브리지 생성 시 throw                                                                                 |
| 토큰 없는 `--allow-origin '*'`                                                | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms`가 양의 정수가 아님         | `Must be a positive integer`                                                                        |
| `--initialize-timeout-ms`가 양의 정수가 아니거나 `2^31-1`을 초과               | `Must be a positive integer` / `Exceeds maximum JS timer delay`                                     |
| 알 수 없는 `policy.permissionStrategy` 또는 양수가 아닌 `policy.consensusQuorum` | `InvalidPolicyConfigError`                                                                          |

## 7. Curl 검증 체크리스트

```bash
# 1. 활성 상태
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep 헬스
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight 준비 상태
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. 환경 스냅샷 (비밀은 존재 여부만 보고)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP 풀 / 예산 스냅샷
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. 세션 생성
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. SSE 테일 (<sid> 교체)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Web Shell UI
open http://127.0.0.1:4170/
```

Bearer 인증이 활성화되면 모든 요청에 `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"`을 추가.

## 8. 브라우저 UI가 있는가?

**예 — Web Shell.** `resolveWebShellDir()`가 빌드된 자산을 찾고(릴리스에서는 CLI 번들 옆에 번들됨, 체크아웃에서는 `packages/web-shell/dist`), `mountWebShellAssets()`가 `/`, `/assets`, `/session/:id` 문서 탐색(브라우저 딥 링크 — 일반 `curl /session/<id>`는 셸이 아닌 API의 401/404를 받음)에서 이를 제공합니다. 자산이 없으면 데몬은 크래시 대신 API 전용으로 저하됩니다; `--no-web`은 명시적으로 opt-out합니다.

정적 셸은 모든 실행 모드에서 `bearerAuth` **이전에** 마운트됩니다 — 브라우저는 주소창 탐색이나 `<script src>` 하위 리소스에 `Authorization` 헤더를 첨부할 수 없으므로, 게이팅하면 UI가 깨집니다. 셸이 호출하는 모든 API 라우트는 토큰 게이팅을 유지하며, 프론트엔드가 bearer를 직접 첨부합니다. 비루프백 바인드에서 셸은 `--allow-origin <origin>`이 전달되지 않으면 읽기 전용입니다 — 동일 출처 POST는 `Origin` 헤더를 전달하며 CORS 벽이 거부(403)합니다 — 루프백 외 바인드에는 `--allow-origin`을 전달하세요.

CSP는 `buildWebShellCsp()`가 빌드하며 정적 페이지보다 의도적으로 관대합니다(인라인 `performance.measure` 패치를 위한 `'unsafe-inline'`, shiki와 mermaid를 위한 `eval`/wasm/blob 워커, katex 폰트를 위한 `data:`, SSE를 위한 `connect-src 'self'`). `frame-ancestors 'none'`과 `X-Frame-Options: DENY`는 클릭재킹을 차단합니다. 단, `--allow-origin`으로 확장 출처가 명시적으로 허용되는 경우 UI를 Chrome 사이드 패널에 호스팅할 수 있습니다(#5626).

원시 프로토콜 검사를 위해서는 SSE 스트림을 직접 구독하세요(`routes/sse-events.ts`) — 섹션 7의 curl 레시피를 참조.

## 9. `qwen serve`부터 리스닝 서버까지의 호출 체인

```text
qwen serve
   |
   v (process)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - 부트 사전 검사
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # 지연 로드
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- 토큰 trim
   |  |- hostname 불일치 폴백
   |  |- auth 사전 검사
   |  |- 워크스페이스 검증 + 표준화
   |  |- MCP 예산 검증 + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - Express 앱 빌드 (**리스닝하지 않음**)
   |  |- 미들웨어 체인 (Host 허용 목록 / CORS / bearerAuth / mutation gate / 속도 제한)
   |  |- 라우트 마운팅 (health / web-shell 정적 / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- "qwen serve listening on ..." 출력
   |  |- SIGINT / SIGTERM 등록 (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // 시그널까지 무한 차단
```

핵심 사실:

- **`createServeApp`은 빌드만 수행; 리스닝하지 않음.** 미들웨어와 라우트가 마운트된 `express()` 인스턴스를 반환. 호출자가 `app.listen()`을 소유. `server.test.ts`는 약 25개 케이스에서 이 방식으로 팩토리를 사용하므로, 팩토리는 의도적으로 수명 주기를 소유하지 않음.
- **`() => actualPort`는 지연 클로저.** `actualPort`는 `app.listen` 콜백에서 할당됨. `hostAllowlist` 미들웨어는 필요 시 이를 읽으므로 임시 포트(`--port 0`)도 `Host` 헤더를 올바르게 게이트.
- **`await blockForever()`는 의도적.** `yargs.parse()`가 resolve되면 CLI 최상위 레벨이 대화형 TUI 진입점(`gemini.tsx`)으로 전달됨. SIGINT / SIGTERM은 `runQwenServe`의 `onSignal` 경로를 통해 종료.

## 10. HTTP 라우트 파일 분할

주요 어셈블리는 `server.ts`의 `createServeApp()`에서 이루어지며, 미들웨어를 연결하고 집중화된 라우트 모듈을 마운트:

| 라우트                                                                                         | 파일                                                    | 마운팅 진입점                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/health`                                                                                    | `packages/cli/src/serve/routes/health.ts`               | `healthRoutes.register()`                                                        |
| `/daemon/status`                                                                             | `packages/cli/src/serve/routes/daemon-status.ts`        | `registerDaemonStatusRoutes()`                                                   |
| `/capabilities`, 워크스페이스 초기화/도구/MCP 변경 라우트, ACP HTTP 브리지                      | `packages/cli/src/serve/server.ts`                      | `createServeApp()` 내부에서 직접 등록                                              |
| 워크스페이스 상태, env, preflight, MCP/도구/제공자/skill 요약                                  | `packages/cli/src/serve/routes/workspace-status.ts`     | `registerWorkspaceStatusRoutes()`, `registerWorkspaceDiagnosticStatusRoutes()`   |
| 워크스페이스 확장 및 확장 작업                                                                  | `packages/cli/src/serve/routes/workspace-extensions.ts` | `registerWorkspaceExtensionRoutes()`                                             |
| `/workspace/memory` (GET/POST)                                                               | `packages/cli/src/serve/workspace-memory.ts`            | `mountWorkspaceMemoryRoutes()`                                                   |
| 모든 `/workspace/agents` CRUD 라우트                                                          | `packages/cli/src/serve/workspace-agents.ts`            | `mountWorkspaceAgentsRoutes()`                                                   |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                        | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`                                              |
| `POST /file/write`, `/file/edit`                                                             | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`                                             |
| 워크스페이스 설정, trust, settings, 권한, 음성 라우트                                           | `packages/cli/src/serve/routes/workspace-*.ts`          | `registerWorkspaceSetupGithubRoutes()`, `registerWorkspaceTrustRoutes()` 등       |
| 워크스페이스 인증 제공자 및 device-flow 라우트                                                  | `packages/cli/src/serve/routes/workspace-auth.ts`       | `registerWorkspaceAuthRoutes()`                                                  |
| 세션 수명 주기, 프롬프트, 메타데이터, 언어, shell, recap, rewind, branch, 목록 라우트            | `packages/cli/src/serve/routes/session.ts`              | `registerSessionRoutes()`                                                        |
| `GET /session/:id/events` SSE 스트림                                                          | `packages/cli/src/serve/routes/sse-events.ts`           | `registerSseEventsRoutes()`                                                      |
| 권한 응답 라우트                                                                              | `packages/cli/src/serve/routes/permission.ts`           | `registerPermissionRoutes()`                                                     |

전체 라우트 및 와이어 프로토콜 참조는 [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)를 참조. 아키텍처는 [`01-architecture.md`](./01-architecture.md)를 참조.

## 11. Graceful vs 하드 종료

- **첫 SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> 2단계 graceful shutdown:
  1. `bridge.shutdown()`: 각 채널에 `KILL_HARD_DEADLINE_MS`(10초), 이후 `channel.kill()`.
  2. `server.close()`: 진행 중 요청 드레인, `SHUTDOWN_FORCE_CLOSE_MS`(5초) 후 `closeAllConnections()`, 이어 2초 추가 기한 적용.
- **종료 중 두 번째 SIGINT / SIGTERM** -> `bridge.killAllSync()`가 모든 ACP 자식을 동기적으로 SIGKILL하고 `process.exit(1)`을 호출하여 고아 프로세스를 방지.

`runQwenServe`가 반환하는 `RunHandle.close()`는 임베더와 테스트를 위한 프로그래밍적 종료.

## 12. 임베딩 호출 (CLI 우회)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // 임시 포트
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... handle.bridge를 직접 호출하거나 handle.server에 접근
await handle.close(); // 프로그래밍적 종료
```

또는 Express 앱을 직접 가져와 직접 리스닝:

```ts
import { createServeApp } from '@qwen-code/qwen-code/serve';

const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => 0,
  {
    /* deps: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

참고: `createServeApp`을 직접 호출할 때 기본 `fsFactory.trusted = false`. 에이전트 측 ACP `writeTextFile`이 `untrusted_workspace`로 거부되며 stderr 경고가 한 번 출력됨. 명시적 trust와 함께 `deps.fsFactory`를 주입하거나, `deps.bridge`를 주입하거나, trust-gate 기본 동작을 수용.

## 13. 디버깅 레시피

[`19-observability.md`](./19-observability.md)의 디버깅 섹션을 참조. 일반적인 명령어:

```bash
# 데몬이 살아 있는가?
curl http://127.0.0.1:4170/health

# 어떤 capabilities가 광고되는가?
curl -s http://127.0.0.1:4170/capabilities | jq

# 데몬-호스트 준비 상태
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 라이브 SSE 테일
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# 상세 로그
QWEN_SERVE_DEBUG=1 qwen serve
```

## 참고 문헌

- CLI 진입: `packages/cli/src/commands/serve.ts`
- 부트스트랩: `packages/cli/src/serve/run-qwen-serve.ts`
- Express 팩토리: `packages/cli/src/serve/server.ts`
- 미들웨어: `packages/cli/src/serve/auth.ts`
- 브리지 팩토리: `packages/acp-bridge/src/bridge.ts`
- Web Shell 정적 마운트: `packages/cli/src/serve/web-shell-static.ts`
- 사용자 문서: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- 와이어 프로토콜: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
