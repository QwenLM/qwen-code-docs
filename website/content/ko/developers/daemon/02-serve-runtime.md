# Serve 런타임

## 개요

`packages/cli/src/serve/`는 `qwen serve`의 부트 레이어입니다. CLI 플래그를 `ServeOptions`로 변환하고, 시작 구성을 검증하고, Express 앱을 빌드하고, 미들웨어를 연결하고, 라우트를 등록하고, 데몬 호스트 프리플라이트/상태 제공자를 노출하고, 권한 감사 링을 유지하고, 2단계 우아한 종료 시퀀스를 소유합니다. HTTP 관련 작업은 이 레이어에 있고, ACP 관련 작업은 `@qwen-code/acp-bridge`의 한 단계 아래에 있습니다([`03-acp-bridge.md`](./03-acp-bridge.md) 참조).

## 책임

- `ServeOptions`를 파싱하고 검증합니다: 리슨 주소, 인증, 워크스페이스, 세션/연결 캡, MCP 예산/풀, CORS, 프롬프트/SSE/세션 유휴 타임아웃, 속도 제한 및 관련 토글.
- 기본 워크스페이스를 정확히 한 번 **정규화**하고, 세션 런타임을 등록하기 전에 반복되는 모든 `--workspace`를 정규화합니다. 기본 정규 형태는 `/capabilities.workspaceCwd`, `POST /session` 폴백, 기본 브리지가 공유합니다.
- 안전하지 않거나 잘못된 시작 구성을 거부합니다: 토큰 없는 루프백이 아닌 바인드, 토큰 없는 `--require-auth`, 토큰 없는 `--allow-origin '*'`, 양의 `mcpClientBudget` 없는 `mcpBudgetMode='enforce'`, 존재하지 않거나 디렉토리가 아닌 `--workspace`, 잘못된 타임아웃 또는 속도 제한 값.
- `WorkspaceFileSystem` 팩토리, 권한 감사 발행자, `DaemonStatusProvider`, `acp-bridge`를 생성합니다.
- Express 앱을 빌드하고, 미들웨어를 연결하고(`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> 접근 로그 -> `bearerAuth` -> 속도 제한 -> JSON 파서 -> 텔레메트리 -> 라우트별 `mutationGate`), 세션, 워크스페이스 CRUD, 파일, 디바이스 플로우 인증, 권한 투표, ACP HTTP 라우트를 마운트합니다.
- 리슨 포트를 바인딩하고 시그널 핸들러를 등록합니다.
- SIGINT/SIGTERM에서 2단계 종료를 실행합니다. 두 번째 시그널에서 강제 종료합니다.

## 아키텍처

**진입점**: `packages/cli/src/serve/run-qwen-serve.ts`의 `runQwenServe(opts, deps)`. `RunHandle`(`{ url, port, close, ... }`)을 반환합니다.

**앱 팩토리**: `packages/cli/src/serve/server.ts`의 `createServeApp(opts, getPort, deps)`. Express `Application`을 빌드합니다. 직접 임베더와 테스트는 부트스트랩 래퍼 없이 호출합니다.

**기능 레지스트리**: `packages/cli/src/serve/capabilities.ts`의 `SERVE_CAPABILITY_REGISTRY`. 각 태그는 `since` 버전과 선택적 `modes`를 가집니다. 조건부 태그는 배포 또는 런타임 술어가 false일 때 생략됩니다. 레지스트리와 술어 맵이 신뢰할 수 있는 출처입니다. [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) 참조.

**미들웨어** (`packages/cli/src/serve/auth.ts` 및 `server.ts`):

| 미들웨어 (등록 순서)                          | 목적                                                                                                                   | 참고                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors`   | 기본적으로 모든 `Origin` 헤더를 거부합니다. `--allow-origin <pattern>`이 설정되면 허용 목록 모드로 전환합니다.         | [`12-auth-security.md`](./12-auth-security.md) 참조.                                                                                                                                  |
| `hostAllowlist(bind, getPort)`                | 루프백에서 `Host`가 `localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal` 및 실제 포트에 속하는지 검증합니다.       | DNS 리바인딩에 대한 방어입니다. 비교는 대소문자를 구분하지 않으며 포트당 캐시됩니다.                                                                                                   |
| 접근 로그 미들웨어                            | 요청이 완료되면 메서드, 경로, 상태, durationMs, sessionId, clientId를 `DaemonLogger`에 기록합니다.                      | `bearerAuth` **이전에** 등록되므로 401 거부도 기록됩니다. `/health`와 하트비트는 건너뜁니다.                                                                                          |
| `bearerAuth(token)`                           | SHA-256 + `timingSafeEqual` 상수 시간 베어러 비교.                                                                     | 토큰이 구성되지 않으면 개방형 통과(루프백 개발 기본값). `Bearer` 스킴은 대소문자를 구분하지 않습니다.                                                                                 |
| 속도 제한 미들웨어                            | 프롬프트, 뮤테이션, 읽기 라우트를 위한 선택적 티어별 토큰 버킷.                                                        | `bearerAuth` 이후, JSON 파싱 이전에 등록됩니다. 버킷이 소진되면 파싱 전에 429를 반환합니다.                                                                                           |
| `express.json({ limit: '10mb' })`             | JSON 본문 파싱.                                                                                                                                                                      | 파싱 오류는 400을 반환합니다.                                                                                                                                                         |
| `daemonTelemetryMiddleware`                   | 이 지점에 도달하는 분류된 데몬 API 요청을 `withDaemonRequestSpan`을 통해 OpenTelemetry 스팬으로 래핑합니다.             | 속성에는 표준 라우트, 해석된 워크스페이스 해시, sessionId, clientId, 상태 코드가 포함됩니다. 이전 인증, 속도 제한, 본문 파서 거부는 이 스팬 경계 밖에 있습니다.                         |
| `createMutationGate` (라우트별)               | 루프백에서도 토큰이 필요한 뮤테이션 라우트를 위한 라우트 수준 옵트인 게이트.                                            | `401 { code: 'token_required' }`를 반환합니다. 전역 `app.use`가 아니며, 라우트가 필요에 따라 `mutate({ strict: true })`를 호출합니다.                                                  |

**서브시스템**:

| 경로                                                               | 역할                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve/fs/`                                                        | `WorkspaceFileSystem` 팩토리 + `policy.ts` (크기/신뢰/바이너리 검사), `paths.ts` (정규화, resolveWithin, 심볼릭 링크 거부), `audit.ts`, 타입화된 `FsError` 값.                                                                                                                                                                                                                              |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts`   | `GET /file`, `GET /file/bytes`, `POST /file/write`, `POST /file/edit`의 HTTP 핸들러.                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/workspace-memory.ts`                                        | `GET/POST /workspace/memory` (QWEN.md CRUD).                                                                                                                                                                                                                                                                                                                                                                                                             |
| `serve/workspace-agents.ts`                                        | `GET/POST/DELETE /workspace/agents` (서브에이전트 CRUD).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/daemon-status-provider.ts`                                  | 환경 스냅샷 + 데몬 호스트 프리플라이트 셀: Node 버전, CLI 엔트리, 워크스페이스 상태, ripgrep, git, npm.                                                                                                                                                                                                                                                                                     |
| `serve/permission-audit.ts`                                        | `PermissionAuditRing` (512 엔트리 FIFO) 및 `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                                              |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`        | 디바이스 플로우 OAuth 라우트. [`12-auth-security.md`](./12-auth-security.md) 참조.                                                                                                                                                                                                                                                                                                                                                                       |
| `serve/daemon-logger.ts`                                           | `DaemonLogger` 구조화된 파일 로그. [`19-observability.md`](./19-observability.md) 참조.                                                                                                                                                                                                                                                                                                                                                                   |
| `serve/debug-mode.ts`                                              | HTTP 응답에서 상세 오류 컨텍스트를 제어하는 공유 `isServeDebugMode()` 술어.                                                                                                                                                                                                                                                                                                                                                                               |
| `serve/acp-http/`                                                  | ACP Streamable HTTP 트랜스포트 (RFD #721), `/acp`에 마운트. 7개 파일이 JSON-RPC POST, SSE GET, DELETE 분해, REST 표면과 병행하는 공유 브리지 사용을 구현합니다.                                                                                                                                                                                                                             |
| `serve/web-shell-static.ts`, `serve/web-shell-resolver.ts`       | 빌드된 Web Shell 에셋(데몬의 브라우저 UI)을 `/`, `/assets`, `/session/:id`에 위치 및 마운트하고, 모든 API 라우트 이후에 등록되는 SPA 딥링크 폴백. 모든 시작 모드에서 `bearerAuth` **이전에** 마운트됩니다 — 브라우저는 탐색이나 하위 리소스에 `Authorization`을 첨부할 수 없기 때문이며, Web Shell이 호출하는 모든 API 라우트는 토큰 게이트를 유지합니다. 에셋이 없으면 API 전용으로 디그레이드됩니다. `--no-web`으로 옵트아웃합니다. |

**ACP 브리지 패키지 임포트**:

- 이벤트 버스 원시 요소는 `@qwen-code/acp-bridge/eventBus`에서 임포트됩니다.
- 상태 원시 요소는 `@qwen-code/acp-bridge/status`에서 임포트됩니다.
- `serve/acp-session-bridge.ts`는 더 넓은 브리지 표면에 대한 CLI 로컬 호환성 파사드로 남아 있습니다.

## 플로우

### 부트 시퀀스

1. `opts.token` 또는 `QWEN_SERVER_TOKEN`에서 토큰을 **해석하고 트림**합니다. `cat token.txt`의 후행 개행이 베어러 비교를 조용히 깨뜨리는 것을 방지합니다.
2. **호스트네임 오타 가드**: `--hostname localhost:4170`은 오류를 발생시키고 `--port`를 제안합니다.
3. **인증 프리플라이트**: 토큰 없는 루프백이 아닌 바인드는 거부합니다. 토큰 없는 `--require-auth`는 거부합니다.
4. **워크스페이스 검증**: 절대 경로, 존재 여부, 디렉토리 여부. `EACCES` / `EPERM`은 플래그를 가리키도록 래핑됩니다.
5. **워크스페이스 정규화**: `canonicalizeWorkspace(rawWorkspace)`는 `realpathSync.native`를 한 번 실행하고 `/capabilities`, `POST /session` 폴백, 브리지에 전달합니다.
6. **MCP 예산 검증**: 양의 정수. `enforce`는 예산이 필요합니다.
7. **MCP 풀 토글 추론**: 부모 환경 `QWEN_SERVE_NO_MCP_POOL=1`은 `mcpPoolActive=false`를 만들므로 기능이 정직하게 `mcp_workspace_pool`과 `mcp_pool_restart`를 생략합니다.
8. **CORS / 타임아웃 / 속도 제한 검증**: 토큰 없는 `--allow-origin '*'`는 필요합니다. 프롬프트, writer, 채널 유휴, 세션 유휴, 리퍼, 속도 제한 창 값은 잘못된 경우 빠르게 실패합니다.
9. **핸들별 `childEnvOverrides`**: `process.env`를 변경하는 대신 `BridgeOptions.childEnvOverrides`를 통해 `QWEN_SERVE_MCP_CLIENT_BUDGET`과 `QWEN_SERVE_MCP_BUDGET_MODE`를 ACP 자식에게 전달합니다.
10. **`settings.json`을 한 번 로드**: `context.fileName`, `policy.permissionStrategy`, `policy.consensusQuorum`을 읽습니다. 손상된 파일은 기본값으로 폴백합니다. `validatePolicyConfig()`는 `policy.*`를 `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`에 대해 검사합니다. 알 수 없는 전략이나 양수가 아닌 `consensusQuorum`은 `InvalidPolicyConfigError`를 throw합니다. `consensus`가 아닌 전략에서 설정된 쿼럼은 stderr 경고를 기록합니다.
11. **`PermissionAuditRing` 할당** (512 엔트리).
12. **`fsFactory` 빌드**: `runQwenServe`는 `trusted: true`를 기본값으로 사용합니다. 직접 `createServeApp` 호출자는 `trusted: false`를 기본값으로 사용하며 한 번 경고합니다.
13. **`createHttpAcpBridge`**, [`03-acp-bridge.md`](./03-acp-bridge.md) 참조.
14. **`createServeApp`**가 Express를 조합합니다.
15. **리스닝 전에 HTTP(S) 서버를 생성하고 수명주기를 바인딩**한 다음, `server.listen(port, hostname)`을 호출하고 호스트 허용 목록을 위한 실제 `getPort()`를 해석합니다. Conversations 소유권은 이 리스너와 나머지 호스트 시작 게이트가 준비될 때까지 시작할 수 없습니다.
16. **공유 앱 수명주기를 통한 우아한 종료를 위한 SIGINT / SIGTERM 핸들러를 등록**합니다.

### 우아한 종료

1. **첫 번째 시그널에서 수용을 차단하고 모든 드레인 시작**:
   - 디바이스 플로우 레지스트리를 해제하고 대기 중인 플로우를 취소합니다.
   - `bridge.shutdown()`은 각 채널을 `isDying = true`로 표시하고, 각 ACP 자식 stdin에 우아한 종료를 전송하고, 채널당 `KILL_HARD_DEADLINE_MS`(10초)를 기다린 다음 필요시 `channel.kill()`을 호출합니다.
2. **앱 및 호스트 드레인 실행 중 리스너 종료**:
   - `server.close()`는 새 연결 수락을 중지하고 인플라이트 요청이 완료되도록 합니다.
   - `SHUTDOWN_FORCE_CLOSE_MS`(5초)가 `server.closeAllConnections()`를 트리거합니다.
   - 필요시 두 번째 2초 데드라인이 다시 에스컬레이션합니다.
3. **Conversations 소유권 해제**는 리스너, 앱 로컬 작업, 호스트 소유 작업, Live 검색 정리 및 런타임 드레인으로부터 확인된 종료 증거를 받은 후에만 가능합니다. 완료되지 않은 증거는 안전하지 않은 핸드오프를 허용하는 대신 종료를 거부합니다.
4. **종료 중 두 번째 시그널**:
   - `bridge.killAllSync()` + `process.exit(1)`로 고아 자식이 데몬 종료를 차단하는 것을 방지합니다.

## 상태 및 수명주기

`RunHandle` 노출:

- `url`: 임시 포트 해석 후 해석된 리슨 URL.
- `port`: `0` 해석을 포함한 실제 포트.
- `close()`: 임베더 및 테스트용 프로그램적 종료.

`createServeApp`을 직접 호출해도 `Application`만 반환됩니다. Live/Conversations가 필요한 임베더는 실제 Node 서버를 생성하고, 첫 `listen()` 전에 `getServeAppLifecycle(app).bindServer(server)`를 호출하고, 종료 시 `lifecycle.close()`를 대기해야 합니다. 바인딩 없으면 일반 라우트는 사용 가능하지만 Live/Conversations는 닫힙니다. 원시 `server.close()`를 호출하면 이벤트 기반 정리가 트리거되지만, 임베더는 여전히 `lifecycle.close()`를 대기하여 드레인 또는 소유권 해제 실패를 관찰해야 합니다.

## 의존성

| `serve/`가 사용하는 업스트림                                                                       | `serve/`를 사용하는 다운스트림            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge`: 브리지, 이벤트 버스, 상태 타입                                            | `qwen` CLI `serve` 서브커맨드 핸들러      |
| `packages/core`: `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`         | 직접 임베더, 테스트                        |
| ACP SDK (`@agentclientprotocol/sdk`): `PROTOCOL_VERSION`, 브리지를 통한 `ClientSideConnection`      |                                           |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                       |                                           |

## 구성

| 출처            | 키                                                                                                         | 효과                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 환경 변수       | `QWEN_SERVER_TOKEN`                                                                                        | 트림 후 베어러 토큰.                                                                                  |
| 환경 변수       | `QWEN_SERVE_NO_MCP_POOL=1`                                                                                 | `mcpPoolActive=false`를 강제합니다.                                                                    |
| ACP 자식 환경   | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                              | `--mcp-client-budget` / `--mcp-budget-mode`에서 생성되어 `childEnvOverrides`를 통해 전달됩니다.        |
| 환경 변수       | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                                      | 기본 프롬프트 / SSE 유휴 타임아웃.                                                                     |
| 환경 변수       | `QWEN_SERVE_RATE_LIMIT*`                                                                                   | 속도 제한 스위치, 프롬프트 / 뮤테이션 / 읽기 캡, 창 기본값.                                           |
| 환경 변수       | `QWEN_SERVE_DEBUG=1`                                                                                       | 상세 stderr 로그. [`19-observability.md`](./19-observability.md) 참조.                                 |
| 플래그          | `--hostname`, `--port`                                                                                     | 리슨 바인딩.                                                                                          |
| 플래그          | `--token`, `--require-auth`, `--enable-session-shell`                                                      | 베어러 토큰, 루프백 인증 강화, 명시적 셸 실행 스위치.                                                |
| 플래그          | `--workspace`                                                                                              | `process.cwd()`를 재정의합니다. 추가 격리 워크스페이스 런타임을 등록하려면 반복합니다.                  |
| 플래그          | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`            | 브리지 / Express 캡.                                                                                  |
| 플래그          | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                            | ACP 자식에게 전달됩니다.                                                                              |
| 플래그          | `--allow-origin`, `--allow-private-auth-base-url`                                                          | 브라우저 CORS 허용 목록 및 로컬호스트/비공개 인증 제공자 설치 스위치.                                  |
| 플래그          | `--web` / `--no-web`                                                                                       | 데몬 루트에서 Web Shell UI를 제공하거나 건너뜁니다(기본값: 제공). `--no-web`은 데몬을 API 전용으로 남깁니다. |
| 플래그          | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`, `--initialize-timeout-ms` | 프롬프트, SSE writer, ACP 자식 유휴 수명주기, ACP 자식 요청 타임아웃 제어.                             |
| 플래그          | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                                  | 연결 끊긴 세션 정리 제어.                                                                             |
| 플래그          | `--rate-limit*`                                                                                            | 티어별 HTTP 속도 제한.                                                                                |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                                      | `MultiClientPermissionMediator` 정책 및 쿼럼.                                                         |
| `settings.json` | `context.fileName`                                                                                         | 브리지용 `getCurrentGeminiMdFilename` 재정의.                                                          |

병합된 레퍼런스는 [`17-configuration.md`](./17-configuration.md)를 참조하세요.

## 주의사항 및 알려진 제한

- `deps.fsFactory` 또는 `deps.bridge` 없는 직접 `createServeApp`은 `trusted: false`를 기본값으로 사용합니다. 에이전트 측 ACP `writeTextFile`은 `untrusted_workspace`로 거부합니다. 경고는 한 번만 출력됩니다.
- `denyBrowserOriginCors`는 `Origin`을 포함하는 **모든** 요청을 거부합니다. **루프백** Web Shell은 다른 미들웨어가 먼저 일치하는 루프백 동일 출처 값을 제거하기 때문에 작동합니다. 루프백이 아닌 바인드는 Web Shell의 XHR에 `--allow-origin`이 필요합니다.
- 본문 파서 순서: `mutate({ strict: true })`를 사용하는 라우트는 `express.json()` 이후에만 401을 반환합니다. 최악의 경우는 `--max-connections × express.json({limit: '10mb'})`로, 포화된 루프백 리스너에서 최대 약 2.5GB의 일시적 메모리입니다. 이 트레이드오프는 의도적입니다.
- 하나의 프로세스에서 여러 데몬은 핸들별 `childEnvOverrides`를 사용해야 합니다. `defaultSpawnChannelFactory`가 생성 시 환경의 스냅샷을 찍기 때문에 `process.env`를 변경하면 경합이 발생합니다.

## 레퍼런스

- `packages/cli/src/serve/run-qwen-serve.ts` (부트스트랩, 부트 검증, 우아한 종료)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, 미들웨어 및 라우트 조합)
- `packages/cli/src/serve/auth.ts` (CORS, Host 허용 목록, 베어러 인증, 뮤테이션 게이트)
- `packages/cli/src/serve/rate-limit.ts` (티어별 HTTP 속도 제한)
- `packages/cli/src/serve/capabilities.ts` (기능 레지스트리 및 조건부 광고)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- 이슈: [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)
