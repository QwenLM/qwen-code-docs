# 데몬 개발자 문서

**qwen-code 데몬 모드**에 대한 개발자 대상 기술 문서입니다: `qwen serve` HTTP 데몬, `@qwen-code/acp-bridge` 패키지, 워크스페이스 범위 MCP 트랜스포트 풀, 멀티 클라이언트 권한 중재, 타입화된 데몬 이벤트 스키마 v1, TypeScript SDK 데몬 클라이언트, 그리고 데몬에 연결하는 어댑터를 다룹니다.

기존 문서를 대체하기보다 보완합니다:

| 기존 문서                                                                              | 대상               | 신뢰할 수 있는 출처                                    |
| -------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------ |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                               | 운영자             | 사용자 퀵스타트, 플래그, 위협 모델                     |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                               | 프로토콜 구현자   | HTTP 라우트 카탈로그, 요청/응답 형태, 오류 코드        |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)   | SDK 사용자         | 엔드투엔드 TypeScript 워크플로우                       |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                             | 어댑터 작성자      | 레거시 클라이언트 어댑터 설계 문서                     |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                    | 어댑터 작성자      | 클라이언트 어댑터 설계 노트                            |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)       | F2 유지관리자     | 워크스페이스 MCP 트랜스포트 풀 설계 v2.2               |

**데몬을 시작하고 사용**하려면 먼저 `qwen-serve.md`를 읽으세요. **와이어 포맷에 대해 클라이언트를 구축**하려면 `qwen-serve-protocol.md`를 읽으세요. **데몬 내부를 이해, 확장 또는 디버그**하려면 이 문서 세트를 읽으세요.

## 읽기 순서

목표에 맞는 경로를 선택하세요:

- **데몬을 먼저 시작하고 검증**: `20 -> 17 -> 19`.
- **새 기여자**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **새 클라이언트 어댑터 추가**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **MCP 풀 또는 예산 작업**: `01 -> 03 -> 05 -> 06`.
- **권한 작업**: `01 -> 03 -> 04 -> 12`.
- **프로덕션 데몬 디버깅**: `19 -> 18 -> 17 -> 20`.

## 문서 세트

### 기반

- [`01-architecture.md`](./01-architecture.md) - 시스템 아키텍처, 프로세스 토폴로지, 패키지 맵, 그리고 7개의 최상위 시퀀스 다이어그램.

### 서버 코어

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe` 부트스트랩, Express 앱, 미들웨어 체인, 우아한 종료.
- [`03-acp-bridge.md`](./03-acp-bridge.md) - `@qwen-code/acp-bridge` 패키지 내부, 세션 멀티플렉싱, 채널 팩토리, ACP 자식 생성.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`, 4가지 정책, N1 타임아웃 불변식, 취소 센티널.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2), 풀 엔트리, 역 인덱스, 재시작, 드레인.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`, 모드 (`off`/`warn`/`enforce`), 히스테리시스, 거부 배치 병합.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem` 샌드박스, 경로 정책, 감사, `BridgeFileSystem` 계약.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - 생성 / 연결 / 로드 / 재개, `X-Qwen-Client-Id`, 하트비트, 축출, 메타데이터.
- [`09-event-schema.md`](./09-event-schema.md) - 타입화된 이벤트 스키마 v1: 페이로드, 리듀서, 전방 호환성을 갖춘 53개의 알려진 이벤트 타입.
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`, 단조 ID, 링 리플레이, `Last-Event-ID`, 느린 클라이언트 백프레셔, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - 기능 레지스트리, 프로토콜 버전, 스키마 버전, 조건부 광고.
- [`12-auth-security.md`](./12-auth-security.md) - 베어러 미들웨어, 호스트 허용 목록, CORS 거부, 뮤테이션 게이트, `--require-auth`, `/health` 면제, 디바이스 플로우.

### 클라이언트

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE 파서, 이벤트 리듀서, `ui/*` 트랜스크립트 레이어.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - 공유 UI 트랜스크립트 레이어와 레거시 CLI TUI 데몬 어댑터 관계.
- [`15-channel-adapters.md`](./15-channel-adapters.md) - `DaemonChannelBridge` 공유 기본 클래스 및 DingTalk, WeChat(Weixin), Telegram, Feishu 채널별 어댑터.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`, 루프백 전용 강제, 웹뷰 브리징.

### 레퍼런스 부록

- [`17-configuration.md`](./17-configuration.md) - 데몬에 영향을 미치는 환경 변수, CLI 플래그, `settings.json` 키.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - 레이어별 타입화된 오류와 복구 방법.
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`, 디버깅 레시피, 텔레메트리 갭.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - 최단 시작 경로, curl 검사, 라우트 맵, 임베디드 호출 레시피.

## 용어집

- **ACP** - Agent Client Protocol. 데몬 브리지와 ACP 자식 프로세스 간 stdio를 통한 JSON-RPC입니다. 클라이언트가 데몬에 사용하는 HTTP 프로토콜이 아닙니다.
- **ACP 자식** - 하나의 워크스페이스 에이전트 런타임을 호스팅하는 `qwen --acp` 자식입니다. 프로덕션에서는 기본 브리지를 예열하고 실패 시 첫 사용 시 재시도합니다. 신뢰된 보조는 온디맨드로 자식을 시작하고, 신뢰되지 않은 보조는 시작하지 않습니다. 소유 브리지가 해당 자식 위에 세션과 클라이언트를 멀티플렉스합니다.
- **acp-bridge** - `@qwen-code/acp-bridge` 패키지(`packages/acp-bridge/`). 세션 멀티플렉싱, 권한 중재자, 이벤트 버스, 채널 팩토리를 소유합니다.
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`. 하나의 ACP `ClientSideConnection`을 래핑하고 `requestPermission`, `sendPrompt`, `cancelSession`을 처리합니다.
- **채널 팩토리** - ACP 자식을 생성하거나 연결하는 플러그 가능한 전략입니다. 기본 `spawnChannel`은 `qwen --acp`를 서브프로세스로 실행합니다. `inMemoryChannel`은 테스트에서 인프로세스로 실행합니다.
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`. 데몬 위의 TypeScript SDK HTTP 수준 파사드입니다.
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. SSE 리플레이를 위해 `lastSeenEventId`를 추적하는 세션 범위 래퍼입니다.
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`. 단조 ID, 제한된 링, 구독자별 백프레셔를 갖춘 세션별 인메모리 pub/sub입니다.
- **F1 / F2 / F3 / F4** - [#4175](https://github.com/QwenLM/qwen-code/issues/4175)에서 추적되는 내부 마일스톤입니다. F1: 브리지 추출 및 `BridgeFileSystem`. F2: 워크스페이스 범위 MCP 트랜스포트 풀. F3: 멀티 클라이언트 권한 중재. F4: 프로토콜 완성 및 데몬 클라이언트 표면.
- **MCP** - Model Context Protocol. 서버가 도구, 리소스, 프롬프트를 노출하고, 데몬 ACP 자식이 연결합니다.
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`. F2 워크스페이스 범위 풀로, 서버 이름과 구성 핑거프린트당 하나의 MCP 트랜스포트를 공유합니다.
- **중재자 정책** - `first-responder`, `designated`, `consensus`, `local-only` 중 하나입니다. 멀티 클라이언트 권한 투표 해결 방식을 결정합니다.
- **Originator 클라이언트 ID** - 현재 권한을 요청하는 프롬프트를 시작한 클라이언트의 `X-Qwen-Client-Id`입니다. `designated` 정책은 이 ID의 투표만 수락합니다.
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`. `McpTransportPool`의 하나의 엔트리: 하나의 MCP 트랜스포트, 연결된 세션의 참조 카운트, 유휴 드레인 타이머.
- **세션 범위** - `single`(모든 클라이언트가 공유하는 하나의 ACP 세션) 또는 `thread`(대화 스레드당 하나의 세션). 기본값은 `single`입니다.
- **SSE** - Server-Sent Events. 데몬 아웃바운드 이벤트 채널(`GET /session/:id/events`).
- **워크스페이스** - 데몬 부트 시 등록된, 등록 저장소에서 복원된, 또는 동적으로 추가된 디렉토리입니다. `workspaceCwd`는 레거시 기본값이고, `workspaces[]`는 격리된 런타임과 해당 신뢰/제거 메타데이터의 카탈로그입니다.

## 구현 소스 앵커

문서에서 최신 `main` 코드로 이동할 때 다음 앵커를 사용하세요:

| 표면                               | 구현 앵커                                                                                                                                                                                                                                                          | 주요 문서                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 부트스트랩 및 HTTP 조합            | `packages/cli/src/serve/run-qwen-serve.ts`, `packages/cli/src/serve/server.ts`, `packages/cli/src/serve/routes/health-demo.ts`, `/demo`                                                                                                                              | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                  |
| ACP 브리지 및 세션 멀티플렉싱      | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                             | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                         |
| 권한 중재                          | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                               | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                   |
| MCP 트랜스포트 풀                  | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                         | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                             |
| MCP 예산 가드레일                  | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                   | [`06`](./06-mcp-budget-guardrails.md)                                                                                 |
| 워크스페이스 파일시스템            | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                     | [`07`](./07-workspace-filesystem.md)                                                                                  |
| 이벤트 스키마 및 SSE 작성기        | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/routes/sse-events.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/tool-call-emitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| 이벤트 재동기화                    | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                        | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                               |
| 기능                               | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                    | [`11`](./11-capabilities-versioning.md)                                                                               |
| 인증 및 디바이스 플로우            | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                      | [`12`](./12-auth-security.md)                                                                                         |
| TypeScript SDK 데몬 클라이언트     | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                        | [`13`](./13-sdk-daemon-client.md)                                                                                     |
| 공유 UI 트랜스크립트 레이어        | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                          | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| 채널 및 IDE 어댑터                 | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                           | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                  |

## 의도적으로 범위 밖인 항목

- **Java / Python SDK 데몬 클라이언트** - 현재 TypeScript SDK만 데몬 클라이언트를 제공합니다. 문서 13은 TypeScript 전용입니다.
- **Web UI 제품 세부정보** - 공유 트랜스크립트 레이어와 웹 UI 데몬 진입점은 여기서 다루지만, 제품 UI 레이아웃은 `docs/developers/daemon-ui/`와 어댑터 설계 노트에서 추적됩니다.
- **Zed extension (`packages/zed-extension/`)** - `qwen --acp`를 stdio를 통해 직접 실행하여 데몬을 우회합니다.
- **실험적 인프로세스 호스팅** - `--no-http-bridge`는 여전히 http-bridge로 폴백합니다. 안정적인 인프로세스 serve 모드는 도착 시 새 문서가 필요합니다.

## 현재 데몬 모드 커버리지

### 서버 코어 커버리지

| 영역                    | 현재 상태                                                                                                                                                                                                                                      | 주요 문서                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 부트스트랩 / 리슨 경로  | `qwen serve`는 `runQwenServe`를 지연 로드하고, 인증/워크스페이스/예산/설정을 검증하고, Express 앱을 빌드한 다음 `app.listen`을 호출하고 시그널까지 무기한 차단합니다.                                                                          | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)  |
| 인증 / 네트워크 가드레일 | 루프백은 기본적으로 베어러 없음. 루프백이 아닌 경우 베어러 필수. `--require-auth`는 베어러를 루프백과 `/health`까지 확장합니다. 호스트 허용 목록과 기본 CORS 거부가 활성입니다.                                                                | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)          |
| 세션 수명주기           | `POST /session`, `load`, `resume`, 메타데이터 패치, 하트비트, 축출, 유휴 정리, 프롬프트 보류 제한, 우아한 종료가 문서화되어 있습니다.                                                                                                          | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)          |
| ACP 브리지              | 기본적으로 단일 ACP 자식이 멀티플렉스됩니다. `sessionScope`는 `single`과 `thread`를 지원합니다. `BridgeFileSystem`, 컨텍스트 파일 이름, 환경 오버레이, 채널 유휴 타임아웃이 연결되어 있습니다.                                                  | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)      |
| MCP 풀 / 예산           | `QWEN_SERVE_NO_MCP_POOL=1`이 아닌 경우 워크스페이스 MCP 풀이 기본적으로 활성화됩니다. 가드레일 이벤트와 재시작 의미는 문서화되어 있습니다.                                                                                                     | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| 권한                    | F3 중재자는 `first-responder`, `designated`, `consensus`, `local-only`를 지원합니다. 잘못된 설정은 명시적으로 실패합니다.                                                                                                                      | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)   |

### 와이어 프로토콜

| 영역          | 현재 상태                                                                                                                                                                                                                                              | 주요 문서                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| HTTP 라우트    | 라우트 카탈로그는 `qwen-serve-protocol.md`에 있습니다. 이 데몬 세트는 참조만 하고 구현 소유권을 설명합니다.                                                                                                                                            | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)        |
| 이벤트 스키마  | `EVENT_SCHEMA_VERSION = 1`. 53개의 알려진 이벤트 타입. ID 없는 구독자 합성 프레임. `_meta.serverTimestamp`는 `EventBus.publish()`가 스탬프(합성 프레임의 경우 `formatSseFrame()` 폴백).                                                                  | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                |
| 기능           | `SERVE_PROTOCOL_VERSION = 'v1'`. 75개의 등록된 태그. 13개의 조건부 태그.                                                                                                                                                                               | [`11`](./11-capabilities-versioning.md)                                                                |
| 세션 셸        | `POST /session/:id/shell`은 `--enable-session-shell`, 베어러 인증, 세션 바운드 `X-Qwen-Client-Id` 뒤에 존재합니다. 기능 태그는 조건부입니다.                                                                                                            | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| 속도 제한      | 선택적 티어별 HTTP 속도 제한은 CLI 플래그/환경으로 노출되며 조건부 기능 태그입니다.                                                                                                                                                                     | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                 |

### 클라이언트 / SDK

| 영역                         | 현재 상태                                                                                                                                                | 주요 문서                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| TypeScript SDK 데몬 클라이언트 | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE 파서, 이벤트 리듀서, 기능 프리플라이트, UI 트랜스크립트 익스포트가 문서화되어 있습니다.        | [`13`](./13-sdk-daemon-client.md)      |
| 공유 UI 트랜스크립트 레이어   | SDK `daemon/ui/*`는 데몬 이벤트를 42개의 UI 의미 이벤트 타입으로 정규화하고, 트랜스크립트 블록으로 축소하며, 렌더러/적합성 헬퍼를 제공합니다.              | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Web UI 데몬 소비자            | `packages/webui/src/daemon/`는 React 제공자와 어댑터를 통해 SDK 트랜스크립트 저장소를 소비합니다.                                                        | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md) |
| CLI TUI / 채널 / VS Code      | 레거시 경로가 여전히 존재합니다. 공유 트랜스크립트 원시 요소로의 마이그레이션은 완료된 동작이 아닌 후속 작업으로 문서화되어 있습니다.                     | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md) |

### 레퍼런스 및 운영

| 영역                | 현재 상태                                                                                                                                         | 주요 문서                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 구성                | 전체 `qwen serve` 플래그, 환경 변수, `settings.json`, `ServeOptions`, `BridgeOptions`, 주요 상수가 한 페이지에 수집되어 있습니다.                   | [`17`](./17-configuration.md)      |
| 퀵스타트 / 운영     | 최단 시작 경로, 시작 레시피, curl 검사, 데모 페이지 인증 동작, 라우트 분할, 종료 동작, 임베디드 호출 레시피가 포함되어 있습니다.                     | [`20`](./20-quickstart-operations.md) |
| 오류                | 부트 시 명시적 실패, 라우트 오류, 브리지 오류, EventBus 오류, 파일시스템 오류, 중재자 오류가 복구 방법과 함께 요약되어 있습니다.                     | [`18`](./18-error-taxonomy.md)     |
| 관측성              | `QWEN_SERVE_DEBUG`, curl 레시피, 유용한 이벤트, 텔레메트리 갭, 조사 체크리스트가 문서화되어 있습니다.                                               | [`19`](./19-observability.md)      |

### 과거 또는 지원 중단된 표면

| 표면                                               | 상태                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | 이전 `DaemonTuiAdapter` 스파이크의 초안입니다. 현재 공유 UI 트랜스크립트 아키텍처는 문서 14에 있습니다.         |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | 레거시 실험적 어댑터가 아직 트리에 남아 있습니다. 새 공유 UI 작업은 SDK `daemon/ui/*`를 선호해야 합니다.        |
| `--no-http-bridge`                                 | 호환성을 위해 허용되지만 http-bridge로 폴백하며 stderr에 출력합니다.                                           |

### 전방 호환성

- 이벤트 스키마 v1은 추가적입니다. 새 알려진 이벤트 타입은 `DAEMON_KNOWN_EVENT_TYPE_VALUES`에 추가되어야 합니다. 이전 SDK는 알 수 없는 타입을 전방 호환적으로 처리해야 합니다.
- 기능 태그는 동작 계약입니다. 새 동작은 새 태그가 필요합니다. 특히 클라이언트가 라우트 호출 전 프리플라이트할 수 있는 경우.
- `sessionScope: 'thread'`는 현재 대화 스레드별 분할입니다. 이전 클라이언트 범위 문구를 다시 도입하지 마세요.
- 엔벨로프 `_meta`와 ACP 페이로드 `data._meta`는 구별됩니다. 도구 호출 출처는 ACP 페이로드 아래에 있고, 서버 발행 타임스탬프는 SSE 엔벨로프에 있습니다.

## 버전 출처

이 문서 세트는 [#4412](https://github.com/QwenLM/qwen-code/pull/4412)의 후속 작업을 포함하여 현재 `main`에 병합된 데몬 모드 표면을 반영합니다. 이전 F-series 계획 스냅샷이 아닌 현재 동작을 의도적으로 설명합니다.
