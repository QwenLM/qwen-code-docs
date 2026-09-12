# 데몬 REST API 레퍼런스

이 문서는 `qwen serve --no-web`을 실행하고 자체 UI를 제공하는 통합을 위한 공개 REST/SSE 인터페이스입니다. 먼저 [통합 가이드](./rest-api-integration.md)를 읽고, 이 페이지를 엔드포인트 검색에 사용하며, 자세한 라이프사이클 의미는 [HTTP 프로토콜 레퍼런스](./qwen-serve-protocol.md)를 참조하세요.

## OpenAPI

선별된 25개 오퍼레이션 계약은 [OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json)으로 제공됩니다. 해당 URL을 OpenAPI 호환 렌더러, 클라이언트 생성기 또는 유효성 검사 도구에 가져오세요. 체크인된 JSON은 아래에 인덱싱된 오퍼레이션에 대한 이식 가능한 인터페이스 계약이며, CI에서 가이드, 프로토콜 제목 및 등록된 라우트에 대해 유효성 검사가 수행됩니다.

이 인덱스는 데몬 REST 인터페이스의 선별된 핵심 하위 집합을 다루며, 전체를 포함하지는 않습니다. 여기에는 퍼스트파티 Web Shell 라우트, 조건부 내부 인터페이스 및 기타 공개이지만 핵심이 아닌 라우트(파일 변경, 워크스페이스 등록, 세션 구성 및 생성, 워크스페이스 MCP, skill, 제공자 등)가 제외되어 있습니다. 이러한 인터페이스는 자체 capability 태그로 표시되며, [HTTP 프로토콜 레퍼런스](./qwen-serve-protocol.md)에는 세션, 워크스페이스 상태 및 파일 인터페이스가 문서화되어 있고, MCP 서버 관리, 인증 제공자 및 디바이스 플로우 로그인은 [데몬 인증 및 보안 참고 사항](./daemon/12-auth-security.md)에서 다룹니다. 이들은 이 계약의 범위를 벗어나지만 지원 중단된 것은 아닙니다.

## 인덱스 읽기

- **Capability**는 `GET /capabilities`에서 확인할 수 있는 기능 태그입니다. 대시(—)는 해당 오퍼레이션에 전용 기능 태그가 없음을 의미합니다. 이전 데몬 빌드를 지원해야 하는 클라이언트는 `404`를 처리해야 합니다.
- **Scope**는 어떤 런타임이 오퍼레이션을 소유하는지 나타냅니다. `process-global`은 데몬 전체 상태를 읽고, `selected-runtime`은 요청의 워크스페이스 선택을 사용하며, `persisted-workspace`는 영구 세션 스토리지를 해석하고, `live-session-owner`는 라이브 세션별로 라우팅하며, `legacy-primary`는 항상 데몬의 기본 워크스페이스를 대상으로 합니다. `GET /session/:id/export`는 기본 워크스페이스에 고정됩니다. 관리되는 내부 런타임만 해석한 후 기본 워크스페이스로 폴백합니다.
- 이 인덱스의 모든 오퍼레이션은 v1 REST 계약에서 **안정적**입니다. 지원 중단된 `unstable_session_resume` capability 이름은 별칭일 뿐입니다. 안정적인 재개 라우트에는 `session_resume`을 사용하세요.

## 검색

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## 세션 라이프사이클

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## 프롬프트 및 이벤트

| Operation                                                                                   | Capability           | Scope                 | TypeScript SDK                          |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------- | --------------------------------------- |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus)                   | `session_status`     | `live-session-owner`  | `DaemonClient.sessionStatus`            |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)                 | `session_prompt`     | `live-session-owner`  | `DaemonClient.promptNonBlocking`        |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)                 | `session_cancel`     | `live-session-owner`  | `DaemonClient.cancel`                   |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)               | `session_events`     | `live-session-owner`  | `DaemonClient.subscribeEvents`          |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript)           | `session_transcript` | `persisted-workspace` | `DaemonClient.getSessionTranscriptPage` |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)                 | `session_context`    | `live-session-owner`  | `DaemonClient.sessionContext`           |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport)                   | `session_export`     | `legacy-primary`      | `DaemonClient.exportSession`            |
| [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | —                    | `live-session-owner`  | `DaemonClient.getPendingPrompts`        |

`POST /session/:id/prompt`는 에이전트가 완료되었을 때가 아니라 프롬프트가 큐에 들어갈 때 `202`를 반환합니다. 먼저 구독한 다음 `promptId`로 `turn_complete` 또는 `turn_error`를 연관시키세요.

## 권한

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

새로운 다중 워크스페이스 통합은 항상 세션 스코프 라우트를 사용해야 합니다. 레거시 라우트는 다른 런타임이 소유한 요청에 대해 이미 해결된 투표와 동일한 `404`를 반환할 수 있습니다.

## 읽기 전용 워크스페이스 컨텍스트

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

이러한 단일 라우트는 기본 워크스페이스를 대상으로 합니다. 여러 등록된 워크스페이스를 노출하는 통합은 전체 프로토콜에 문서화되고 `workspace_qualified_rest_core`를 프리플라이트하는 워크스페이스 한정 대응 항목을 사용해야 합니다.

## 공통 프로토콜 규칙

- 일반 라우트는 `Authorization: Bearer <token>`으로 인증합니다. 기본 루프백 `/health` 프로브는 면제될 수 있지만, 루프백이 아닌 바인딩은 면제되지 않습니다.
- create/load 응답에서 제공한 경우 `X-Qwen-Client-Id`를 전송합니다. 이는 첨부 및 속성 식별자이며, 최종 사용자 보안 주체가 아닙니다.
- 오류 본문을 추가적인 것으로 취급합니다. 주로 HTTP 상태와 존재하는 경우 안정적인 `code` 또는 `errorKind`를 기준으로 분기합니다.
- SSE 응답 헤더를 유지하고 프록시 버퍼링을 비활성화합니다. 데몬이 epoch를 제공한 경우 `Last-Event-ID`와 `X-Qwen-Event-Epoch` 모두를 사용하여 재개합니다.
- 워크스페이스 신뢰 경계는 테넌트 격리가 아닙니다. 보안 주체 또는 프로세스 수준 장애 경계가 독립적이어야 하는 경우 별도의 데몬을 실행하세요.