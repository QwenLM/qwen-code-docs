# `qwen serve` HTTP 프로토콜 레퍼런스

[qwen-code 데몬 디자인](https://github.com/QwenLM/qwen-code/issues/3803)의 Stage 1. 모든 라우트는 데몬의 기본 URL(기본값 `http://127.0.0.1:4170`) 아래에 존재합니다.

## 인증

데몬이 `--token` 또는 `QWEN_SERVER_TOKEN`과 함께 시작되었을 때, **루프백 바인드의 `/health`를 제외한 모든 라우트**는 다음 헤더를 포함해야 합니다:

```
Authorization: Bearer <token>
```

구성된 토큰이 없는 경우(루프백 개발 기본값)에는 헤더가 선택 사항입니다. 토큰 비교는 상수 시간 연산입니다. 401 응답은 `missing header` / `wrong scheme` / `wrong token` 모두 동일합니다.

**`--open-with-auth`.** 기본값으로 꺼져 있는 이 CLI 모드는 루프백 바인드와 사용 가능한 Web Shell을 요구합니다. 일반적인 `--token`-우선-`QWEN_SERVER_TOKEN` 선택을 재사용하거나, 해당 선택이 비어 있을 때 데몬 시작 전에 base64url로 인코딩된 32바이트 난수를 생성합니다. 브라우저는 선택된 bearer를 `#token=`을 통해 받아 탬별로 저장하며, 프로토콜과 미들웨어는 일반 구성된 토큰을 봅니다. 맨 `--open`, 직접 임베디드 호출자, 비루프백 바인드 및 다른 클라이언트는 자동 자격 증명을 받지 않습니다. 브라우저 비호환 환경은 비밀을 포함한 프래그먼트 URL을 출력하여 수동으로 열 수 있게 합니다. 루프백 `/health`와 정적 Web Shell 자산은 아래 설명된 면제를 유지합니다; `--require-auth`는 여전히 `/health`를 게이트합니다.

**`/health` 면제**(루프백): 루프백 바인드(`127.0.0.1` / `localhost` / `::1` / `[::1]`)에서 `/health`는 bearer 미들웨어보다 먼저 등록되므로, 파드 내부의 liveness probe는 데몬이 `--token`과 함께 시작되었더라도 토큰을 포함할 필요가 없습니다. 비루프백 바인드(`--hostname 0.0.0.0` 등)에서는 `/health`가 다른 모든 라우트와 동일하게 bearer 뒤에 게이트됩니다 — 근거는 [`GET /health`](#get-health) 섹션을 참조하세요.

**`--require-auth`(#4175 PR 15).** 부트 시 이 플래그를 전달하면 "토큰 필수" 규칙이 루프백에도 확장됩니다. 토큰 없이 부팅이 실패하며, `/health` 면제도 제거됩니다(즉, `/health`도 `Authorization: Bearer …`를 요구).

플래그가 켜져 있으면, 전역 `bearerAuth` 미들웨어가 **모든** 라우트(`/capabilities` 포함)를 게이트합니다. 따라서 **인증되지 않은** 클라이언트는 `caps.features`를 프리플라이트하여 인증이 필요하다는 것을 발견할 수 없습니다: 해당 경우의 발견 표면은 **401 응답 본문** 자체입니다([인증](#authentication) 섹션에 따라 모든 라우트에서 동일). `require_auth` 기능 태그는 **인증 후 확인**입니다 — 클라이언트가 성공적으로 인증하고 `/capabilities`를 읽으면, 태그의 존재는 데몬이 `--require-auth`와 함께 시작되었음을 확인합니다(감사/컴플라이언스 UI 및 SDK 클라이언트가 "이 배포는 강화됨"을 설정 패널에 표시하는 데 유용). 변형 라우트 중 라우트별 엄격 모드를 옵트인한 것(Wave 4 후속)은 토큰 없는 루프백 기본값에 도달했을 때 `401 { code: "token_required", error: "…" }`로 거부하지만, `--require-auth`가 활성화되어 있으면 전역 bearer 미들웨어가 라우트별 게이트 전에 요청을 차단하므로, 인증되지 않은 호출자가 실제로 보게 되는 것은 기존 `Unauthorized` 본문입니다.

**`--allow-origin <pattern>`(T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** 크로스 오리진에서 데몬에 접근하는 브라우저 WebUI는 기본적으로 차단됩니다 — `Origin` 헤더를 포함한 모든 요청은 `403 {"error":"Request denied by CORS policy"}`를 반환합니다. CLI/SDK 클라이언트는 `Origin`을 절대 보내지 않으며, 데몬은 이 헤더의 존재를 운영자가 옵트인하지 않은 브라우저 컨텍스트에서 온 요청의 신호로 간주합니다. 부트 시 `--allow-origin <pattern>`(반복 가능)을 전달하면 벽 대신 허용 목록을 설치합니다. 각 패턴은 다음 중 하나입니다:

- 리터럴 `*` — 모든 오리진을 허용합니다. **위험**: `*`가 구성되었지만 bearer 토큰이 설정되지 않은 경우 부팅이 거부됩니다(모든 소스: `--token`, `QWEN_SERVER_TOKEN`, 또는 부팅 시 토큰을 의무화하는 `--require-auth`). 부트 브레드크럼은 목록에 `*`가 있을 때 stderr 경고를 내보냅니다. **권장**: 루프백 바인드에서 `--require-auth`와 함께 사용해야 `/health`도 bearer로 게이트됩니다 — 기본적으로 루프백에서 bearer 미들웨어보다 먼저 등록되므로(k8s/Compose probe가 토큰 없이 도달 가능), `*` 허용 목록은 이를 모든 크로스 오리진 브라우저에서 접근 가능하게 만듭니다. `--require-auth`는 여전히 Web Shell 정적 자산(`/`, `/assets/*`, `/session/:id` 문서 내비게이션)을 루프백에서 인증 전 상태로 유지합니다 — 설계상 bearer 미들웨어 앞에 마운트되므로 — `*` 허용 목록 아래에서도 크로스 오리진 브라우저에서 읽기 가능합니다; `--no-web`은 해당 표면을 제거합니다. 비루프백 바인드에서는 bearer가 이미 부팅 시 필수이며 `/health`도 그 뒤에 등록되므로, `*`가 토큰 없이 노출하는 것은 Web Shell 정적 자산(`/`, `/assets/*`, `/session/:id` 문서 내비게이션 — JS는 여전히 토큰 게이트 라우트를 호출)뿐입니다. `--no-web`은 그것마저 제거합니다; 실제 API 표면은 어쨌든 게이트됩니다.
- 정규 URL 오리진 — `<scheme>://<host>[:<port>]`. **뒤쪽 슬래시 없음, 경로 없음, userinfo 없음, 쿼리 없음.** 항목이 라운드트립 `new URL(pattern).origin === pattern`을 통과하지 못하면 부팅이 `InvalidAllowOriginPatternError`와 함께 거부됩니다; 오류 메시지는 잘못된 패턴과 정규 형식을 명시합니다. 의도적 엄격성: 조용한 정규화(예: 뒤쪽 `/` 제거)는 오타가 통과되어 모호한 입력을 허용하게 됩니다.

매칭된 오리진은 모든 요청에 대해 표준 CORS 응답 헤더를 받습니다:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin`은 리터럴 `*`가 아닌 요청의 오리진을 그대로 에코합니다(브라우저가 보낸 대로 소문자/대문자). `*` 패턴 아래에서도 마찬가지입니다 — 브라우저 캐시는 `Vary: Origin`과 쌍으로 응답을 캐싱하며, 에코는 이후 릴리스에서 `Access-Control-Allow-Credentials`를 스키마 변경 없이 추가할 수 있는 여지를 남깁니다. 노출된 헤더는 브라우저 WebUI가 재시도 힌트를 준수하고, SSE 에포크를 유지하고, 수용된 물리적 스트림을 상관시킬 수 있게 합니다. `Access-Control-Allow-Credentials`는 현재 전송되지 **않습니다**: 데몬은 `Authorization` 헤더의 bearer로 인증하며, 이는 `credentials: 'include'` 없이 크로스 오리진에서 작동합니다.

OPTIONS 프리플라이트 요청(`Access-Control-Request-Method` 또는 `Access-Control-Request-Headers`가 포함된 OPTIONS)은 `204 No Content`와 위 헤더들로 단축됩니다. 이것은 관례적인 CORS 패턴이며 안전합니다 — 프리플라이트는 데몬이 어떤 메서드/헤더를 수용할지 확인할 뿐이며, 실제 후속 요청은 여전히 전체 체인(호스트 허용 목록 → bearer 인증 → 라우트)을 실행하므로 DNS 리바인딩 방지 및 bearer 강제 여전히 상태가 읽히거나 변경되기 전에 발동합니다. 매칭된 오리진에서의 일반 OPTIONS 요청은 CORS 헤더가 첨부된 채로 다운스트림으로 계속 흐릅니다.

허용 목록과 매칭되지 않는 오리진은 여전히 `403 {"error":"Request denied by CORS policy"}`를 받습니다 — 기본 벽과 동일한 인벨롭이므로, 벽의 응답을 이미 파싱한 클라이언트는 허용 목록이 배포된 데몬을 특별히 처리할 필요가 없습니다. 거부 경로는 어떤 `Access-Control-*` 헤더도 내보내지 **않습니다**(브라우저는 이를 무시할 것이며, 내보내는 것은 헤더 존재를 통해 허용 목록 크기를 간접적으로 광고하게 됩니다).

구성된 패턴 목록은 의도적으로 `/capabilities`에 에코되지 않습니다 — 브라우저 WebUI는 이미 자신의 오리진을 알고 있고(데몬을 호출했으므로), 목록을 노출하면 `/capabilities`의 인증되지 않은 읽기자가 신뢰되는 모든 오리진을 열거할 수 있습니다(잘못 구성된 배포에 유용한 정찰). SDK 클라이언트는 `caps.features.allow_origin` 태그를 기반으로 "이 데몬은 크로스 오리진 브라우저 히트를 존중함"을 게이트하며, 어떤 특정 오리진인지 알 필요는 없습니다.

루프백 자체 오리진 요청(예: Web Shell이 동일한 `127.0.0.1:port`의 데몬을 호출)는 CORS 미들웨어 **이전**에 실행되는 **별개의** Origin-스트립 심에 의해 처리되며, `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`에 대한 `Origin` 헤더를 제거합니다. 따라서 `--allow-origin` 구성과 관계없이 통과합니다 — 운영자는 Web Shell을 작동시키기 위해 데몬 자신의 포트를 목록에 추가할 필요가 없습니다.

## 공통 오류 형식

5xx 응답은 존재할 경우 원래 오류의 `code`와 `data`를 포함합니다(JSON-RPC 스타일 — ACP SDK는 에이전트로부터 `{code, message, data}`를 전달):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

요청 본문의 잘못된 JSON은 다음을 반환합니다:

```json
{ "error": "Invalid JSON in request body" }
```

상태는 `400`입니다.

알 수 없는 세션 ID에 대한 `SessionNotFoundError`는 다음을 반환합니다:

```json
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

상태는 `404`입니다. 동시 종료는 `code: "session_closing"`을 사용합니다.

`cwd`가 등록된 워크스페이스로 정규화되지 않는 `POST /session`에 대한 `WorkspaceMismatchError`는 `400`과 함께 다음을 반환합니다:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

이를 사용하여 사전에 불일치를 감지합니다: `/capabilities`에서 `workspaceCwd`를 읽고 `POST /session`에서 `cwd`를 생략하거나(기본 워크스페이스로 폴백), `multi_workspace_sessions`가 광고될 때 `workspaces[].cwd` 중 하나를 선택합니다.

데몬의 `--max-sessions` 상한을 초과하는 `POST /session`은 `Retry-After: 5` 헤더와 함께 `503`을 반환합니다:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

`--max-total-sessions`가 새 세션을 거부할 때, 동일한 응답 형식이 `"scope": "total"`과 함께 반환됩니다.

기존 세션에 대한 attach는 상한에 포함되지 않으므로, 유휴 데몬의 재연결은 상한에 도달해도 계속 작동합니다.

`RestoreInProgressError` — 이미 다른 등록이 해당 ID를 소유하고 있을 때 `POST /session/:id/load`, `POST /session/:id/resume`, 또는 호출자 제공 ID의 `POST /session`에서 발생 — `409`와 다음을 반환합니다:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "reason": "restore_in_progress",
  "retryable": true,
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

이미 `session/resume`이 진행 중인 ID에 대해 `session/load`가 발급되었을 때(또는 그 반대), 또는 호출자 제공 ID 생성이 두 복원 방향 중 하나와 경합할 때 발생합니다. 최소한 `Retry-After` 초만큼 대기한 후 재시도하세요. 동일 작업 경합(`load` 대 `load`, `resume` 대 `resume`)은 복원이 활성 상태인 동안 오류 대신 병합됩니다.

`reason`은 이 코드를 공유하는 두 가지 펜스를 구분하며, `Retry-After` 헤더도 이를 추적합니다:

| `reason`                     | 의미                                                                                                          | `Retry-After`                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `restore_in_progress`        | 일반 복원이 실행 중입니다.                                                                                  | `5` (`session_limit_exceeded`와 동일)                       |
| `awaiting_abandoned_cleanup` | 공개 호출자가 이미 `504`를 받았고, 취소 불가능한 ACP 요청과 정리가 아직 완료되지 않았습니다. | 유효 복원 예산(초), `5`–`120`으로 제한 |

공개 복원 요청은 `limits.sessionRestoreTimeoutMs`(기본값 60초)의 지배를 받습니다. `504` 이후에도 해당 ID는 늦은 ACP 요청과 정리가 완료될 때까지 펜스된 상태로 유지되므로, 일반 5초 간격으로 계속 재시도하는 클라이언트는 해소할 수 없는 409에 대해 반복하게 됩니다 — `awaiting_abandoned_cleanup`와 함께 제공되는 예산 기반 힌트를 따르세요.

`SessionWorkspaceConflictError` — 요청된 `cwd`가 등록된 워크스페이스 중 하나를 대상으로 하지만 동일한 세션 ID가 이미 다른 런타임에서 활성 상태이거나 복원 중일 때 `POST /session/:id/load` 및 `POST /session/:id/resume`에서 발생 — `409`와 함께 다음을 반환합니다:

```json
{
  "error": "Session \"<sid>\" is already live or restoring in another workspace runtime.",
  "code": "session_workspace_conflict",
  "sessionId": "<sid>",
  "workspaceCwd": "/requested/workspace",
  "workspaceId": "requested-workspace-id",
  "liveWorkspaceCwd": "/live/owner/workspace",
  "liveWorkspaceId": "live-owner-workspace-id"
}
```

클라이언트는 소유 워크스페이스로 재시도하거나, 진행 중인 복원이 완료될 때까지 기다린 후 해당 ID를 다른 워크스페이스로 복원해야 합니다. 동일 워크스페이스 복원 경합은 계속 브리지의 `restore_in_progress` / 병합 동작을 사용합니다.

`SessionArchivedError`는 호출자가 `chats/archive/` 아래에 JSONL이 있는 세션을 로드하거나 재개하려고 할 때 발생합니다:

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

상태는 `409`입니다.

`SessionArchivingError`는 동일한 ID에 대해 세션 아카이브 또는 아카이브 해제 전환이 이미 진행 중일 때 발생합니다:

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

상태는 `409`이고 `Retry-After: 5`입니다.

## 기능(Capabilities)

데몬은 serve 기능 레지스트리에서 지원하는 기능 태그를 광고합니다. 클라이언트는 `mode`가 아닌 `features`를 기반으로 UI를 게이트**해야 합니다**(디자인 §10에 따라).

```
['health', 'capabilities', 'session_create', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload',
 'session_approval_mode_control', 'workspace_tool_toggle', 'workspace_skill_toggle',
 'workspace_skill_batch_toggle',
 'extension_batch_activation_v2',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> 조건부 태그은 해당 배포 토글이 켜져 있을 때만 나타납니다(아래 표 참조). F3의 `permission_mediation` 태그는 항상 켜져 있으며 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`를 포함하므로 SDK 클라이언트가 빌드에서 지원하는 세트를 조사할 수 있습니다; 런타임 활성 전략은 `body.policy.permission`에 있습니다.

`session_scope_override`는 `POST /session`의 요청별 `sessionScope` 필드를 위한 협상 핸들입니다(아래 참조). 이전 데몬은 이 필드를 조용히 무시하므로, SDK 클라이언트는 전송 전에 이 태그에 대해 `caps.features`를 프리플라이트해야 합니다.

`session_id_override`는 `POST /session` 및 ACP `session/new` 메타데이터에서 선택적인 호출자 제공 `sessionId`를 위한 협상 핸들입니다. 클라이언트는 `caps.features`에 이 태그가 포함되어 있는지 확인해야 합니다. 이전 데몬은 이를 조용히 무시할 수 있기 때문입니다.

`persistent_workspace_registration`은 런타임에 추가된 워크스페이스의 영구 등록을 광고합니다. `POST /workspaces`는 `{ "cwd": "/absolute/path", "persist": true }`를 허용합니다; 성공 시 `persisted: true`가 포함됩니다. 등록은 사용자의 Qwen 홈 아래 데몬의 정규 기본 워크스페이스에 범위가 지정되며 다음 데몬 시작 시 복원됩니다. `persist`를 생략하면 프로세스 로컬 등록이 유지됩니다. `GET /workspace-registrations`는 저장된 desired 세트를 나열하고, `DELETE /workspace-registrations/:id`는 활성 런타임을 즉시 제거하지 않고 다음 재시작을 위해 항목을 잊습니다.

`workspace_display_name`은 `POST /workspaces`의 선택적 `displayName` 입력, `PATCH /workspaces/:workspace`를 통한 워크스페이스 메타데이터 업데이트, 그리고 워크스페이스 프로젝션의 선택적 display-name 필드를 광고합니다. 이름은 조회나 라우팅에 참여하지 않습니다: `id`와 정규 `cwd`가 유일한 선택자이며, 중복 이름이 허용됩니다.

`workspace_runtime_removal`은 `DELETE /workspaces/:workspace`를 통한 동기식 즉시 제거를 광고합니다. 기능 워크스페이스 항목에 선택적 `removable`이 추가됩니다; `removable: true`인 행만 제거할 수 있습니다. 제거는 런타임에 대한 모든 영구 등록 별칭도 잊지만, 파일, 설정, 트랜스크립트, 아카이브를 삭제하지는 않습니다.

`session_load`와 `session_resume`은 명시적 복원 라우트(`POST /session/:id/load` 및 `POST /session/:id/resume`)를 광고합니다. 이전 데몬은 이 경로에 대해 `404`를 반환하므로, SDK 클라이언트는 호출 전에 `caps.features`를 프리플라이트해야 합니다. `unstable_session_resume`는 기본 ACP 메서드가 `connection.unstable_resumeSession`으로 명명되었던 동안 출시된 SDK와의 호환성을 위해 여전히 지원 중단된 별칭으로 광고됩니다; 새 클라이언트는 `session_resume`을 게이트해야 합니다.

`limits.sessionRestoreTimeoutMs`가 존재할 때, 이는 기본 ACP `loadSession` / `unstable_resumeSession` 요청에 대한 데몬의 벽시계 예산입니다. 부가적인 v1 필드입니다. TypeScript SDK는 데몬에 10초의 클라이언트 여유를 제공하고, WebUI 워치독은 15초를 제공합니다; 이전 데몬과 통신하는 클라이언트는 각각 70초와 75초를 사용해야 합니다.

`session_transcript`는 `GET /session/:id/transcript`를 광고하며, 이는 지속된 활성 세션 JSONL에 대한 읽기 전용 페이징 리플레이 뷰입니다. `/load`와 별개입니다: 클라이언트를 attach하지 않고, 라이브 EventBus를 시딩하지 않으며, 라이브 세션을 생성하거나 라이브 리플레이 창을 변경하지 않습니다. 클라이언트는 긴 세션의 완전한 온디스크 트랜스크립트가 필요할 때 이를 사용해야 하며, 콜드 UI 복원 중 제한된 라이브 리플레이를 위해서만 `/load`를 계속 사용해야 합니다.

`workspace_persisted_transcript`는 `GET /workspaces/:workspace/session/:id/transcript`를 광고하며, ACP를 시작하지 않고, 라이브 브리지 상태를 조회하지 않으며, 설정을 로드하지 않고, 프로젝트 기능을 검색하지 않으며, 레거시 지속 커서 키를 생성하지 않는 데몬 로컬 지속 전용 페이저입니다. 이 태그는 무조건적입니다 — 신뢰되는 단일 워크스페이스 기본값이 복수 라우트를 사용할 수 있기 때문입니다; 워크스페이스별 신뢰 인증은 여전히 모든 요청에서 평가됩니다. 등록된 신뢰되지 않은 보조 워크스페이스는 읽기가 가능하지만, 신뢰되지 않은 기본값은 계속 거부됩니다.

`workspace_session_export`는 `GET /workspaces/:workspace/session/:id/export`를 광고하며, 선택된 워크스페이스의 활성 지속 세션에 대한 신뢰 전용 전체 내보내기입니다. `session_export` 및 `workspace_qualified_rest_core`와 독립적입니다; 출시된 데몬은 복수 라우트를 구현하지 않고도 이전 태그를 둘 다 광고할 수 있으므로, 클라이언트는 이 태그를 직접 프리플라이트해야 합니다. 이 태그는 무조건적입니다 — 신뢰되는 단일 워크스페이스 기본값이 ID 또는 cwd로 라우트를 사용할 수 있기 때문입니다. 내보내기는 라이브 소유자를 해결하지 않고, ACP를 시작하지 않고, 클라이언트를 attach하지 않고, 다른 워크스페이스로 폴백하지 않습니다.

`workspace_archived_session_export`는 `GET /workspaces/:workspace/session/:id/archive/export`를 광고하며, 선택된 워크스페이스의 아카이브된 지속 스토리지에서의 신뢰 전용 전체 내보내기입니다. `workspace_session_export` 및 `workspace_qualified_rest_core`와 독립적입니다; 클라이언트는 이 태그를 직접 프리플라이트해야 합니다. 별개 라우트는 이전 데몬이 아카이브 의도를 무시하고 동일한 ID의 활성 트랜스크립트를 반환하는 것을 방지합니다.

`workspace_session_live_state`는 `GET /workspaces/:workspace/sessions/live-state`를 광고하며, 선택된 워크스페이스 런타임의 라이브 세션에 대한 신뢰 전용 인메모리 스냅샷과 클라이언트에게 완전한 지속 카탈로그 리로드가 필요한 시기를 알리는 인메모리 카탈로그 버전을 포함합니다. `workspace_qualified_rest_core`와 독립적입니다; 출시된 데몬은 이 라우트를 구현하지 않고도 더 넓은 워크스페이스 REST 기능을 광고할 수 있으므로, 클라이언트는 이 태그를 직접 프리플라이트해야 합니다. 이 태그는 무조건적입니다 — 신뢰되는 단일 워크스페이스 기본값이 ID 또는 cwd로 라우트를 사용할 수 있기 때문입니다; 워크스페이스별 신뢰 검사는 여전히 모든 요청에 적용되며, 라우트는 관대한 신뢰되지 않은 보조 지속 카탈로그 읽기 정책을 라이브 브리지 상태로 확장하지 않습니다. 이 태그는 엔드포인트가 존재함을 의미합니다; 모든 라이브 항목이 선택적 `updatedAt` 활동 워터마크를 갖는다고 약속하지는 않으며, 이는 라이프사이클에 따라 다릅니다.

`slow_client_warning`는 SSE 백프레셔 동작을 다룹니다: (a) 데몬은 구독자의 라이브 프레임 백로그 또는 라이브 직렬화 바이트 백로그가 75%를 초과할 때 `slow_client_warning` 합성 이벤트 스트림 프레임을 내보냅니다(오버플로우 에피소드당 한 번, 두 측정값 모두 37.5% 미만으로 배출된 후 재설정); (b) `GET /session/:id/events`는 `?maxQueued=N` 쿼리 파라미터(범위 `[16, 2048]`)를 받아 큰 리플레이 링에 대한 콜드 재연결 시 구독자별 프레임 백로그를 사전 sizing합니다. 직렬화 바이트 상한은 데몬 소유(구독자당 기본 **2 MiB**)이며, 라이브 전용이고 의도적으로 쿼리 파라미터가 없습니다. 데몬 전체 링 크기는 `--event-ring-size`(기본 **8000**, #3803 §02 참조)로 제어됩니다. 이전 데몬은 경고/쿼리 동작이 없으므로 — 옵트인 전에 이 태그를 프리플라이트하세요.

`typed_event_schema`는 SDK의 `KnownDaemonEvent` 스키마와 일치하는 데몬 이벤트 페이로드를 광고합니다. 이전 데몬도 호환되는 프레임을 스트리밍할 수 있지만, SDK 클라이언트는 타입된 이벤트 커버리지를 가정하기 전에 이 태그를 프리플라이트해야 합니다.

---

`client_heartbeat`는 `POST /session/:id/heartbeat`를 광고합니다. 이전 데몬은 `404`를 반환합니다; 주기적 하트비트를 보내기 전에 이 태그를 프리플라이트하세요.

`session_close`와 `session_metadata`는 `DELETE /session/:id`와 `PATCH /session/:id/metadata`를 광고합니다. 이전 데몬은 `404`를 반환합니다; close나 rename 기능을 노출하기 전에 이 태그들을 프리플라이트하세요.

`session_organization`은 커스텀 세션 그룹과 핀을 광고합니다. `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization`, 그리고 옵트인 구성된 목록 뷰 `GET /workspace/:id/sessions?view=organized`를 추가합니다. `session_organization`과 `workspace_qualified_rest_core`가 모두 광고될 때, 워크스페이스 한정 구성 변이 `PATCH /workspaces/:workspace/session/:id/organization`도 사용할 수 있습니다. 레거시 변이는 기본 워크스페이스 전용으로 유지됩니다. 이전 데몬은 변이/그룹 라우트에 대해 `404`를 반환하고 구성된 뷰 계약을 무시하므로, WebShell/SDK 클라이언트는 해당 그룹화 또는 핀 UI를 표시하기 전에 이 태그들을 프리플라이트해야 합니다.

`session_archive`는 v1 디렉토리 상태 아카이브 API를 광고합니다: `POST /sessions/archive`, `POST /sessions/unarchive`, `GET /workspace/:id/sessions?archiveState=active|archived`. 아카이브된 세션은 아카이브 해제 전까지 로드하거나 재개할 수 없습니다. `session_storage_conflict_repair`는 아래에 설명된 부가적인 `resolveConflicts` 요청 옵션과 `resolvedConflicts` 응답 버킷을 광고합니다.

`workspace_qualified_rest_core`는 `/workspaces/:workspace/...` 아래의 복수 핵심 REST 라우트를 광고합니다. 선택자는 먼저 정확히 워크스페이스 ID로 해석되고, 그 다음 정규화 후 URL 인코딩된 절대 cwd로 해석됩니다. 최신 단일 워크스페이스 데몬은 `multi_workspace_sessions`가 없을 때도 `workspaces[]`에 기본 런타임을 포함하므로 클라이언트가 워크스페이스 한정 라우트에 필요한 ID를 발견할 수 있습니다; 클라이언트는 배열을 생략하는 이전 데몬에 대해 `capabilities.workspaceCwd`로 폴백해야 합니다. 신뢰 상태 및 신뢰 요청 라우트는 등록된 신뢰되지 않은 워크스페이스에서 사용할 수 있습니다; 파일 읽기 라우트는 기존 파일시스템 읽기 정책을 따릅니다. 등록된 신뢰되지 않은 보조 워크스페이스도 지속 전용 세션 및 세션 그룹 카탈로그를 노출합니다: 이러한 읽기는 세션에 attach하거나, ACP를 시작하거나, 라이브 브리지 상태를 병합하지 않습니다. 파일 쓰기, 카탈로그 변이 및 기타 복수 핵심 라우트는 별도의 기능이 명시적으로 더 좁은 읽기 전용 정책을 정의하지 않는 한 신뢰되는 워크스페이스가 필요합니다(예: `workspace_persisted_transcript`). 신뢰되지 않은 기본값은 여전히 복수 카탈로그 및 트랜스크립트 라우트에서 `403 { code: "untrusted_workspace" }`를 받습니다; 레거시 단일 기본 라우트는 기존 호환성 동작을 유지합니다. 이 태그는 핵심 파일, 상태, 설정, 권한, 신뢰, 라이프사이클, MCP 제어, 도구 및 skill 토글, 메모리, 워크스페이스 에이전트 CRUD, 세션 스토리지 표면을 다룹니다. 인증, 음성, 확장, ACP/WebSocket 전송, 채널 워커 라우팅, 또는 워크스페이스 한정 세션 내보내기는 다루지 않습니다; `workspace_session_export` 또는 `workspace_archived_session_export`를 별도로 프리플라이트하세요. 워크스페이스 신뢰는 ACL이 아닙니다: 데몬 토큰을 가진 클라이언트는 이 정책에서 허용하는 등록된 모든 워크스페이스 표면을 읽을 수 있습니다.

`workspace_qualified_voice`는 신뢰되는 워크스페이스 런타임에서 선택된 Voice 라우트를 광고합니다: `GET` 및 `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe`, `WS /workspaces/:workspace/voice/stream`. 멀티 워크스페이스 런타임과 공유 ACP/Voice WebSocket 리스너가 모두 활성화된 경우에만 광고됩니다. 선택자는 다른 복수 라우트와 동일한 ID 또는 인코딩된 절대 cwd 규칙을 따릅니다. REST의 경우, 알 수 없는 선택자는 `400 { code: "workspace_mismatch" }`를 반환하고 신뢰되지 않는 선택자는 `403 { code: "untrusted_workspace" }`를 반환합니다; WebSocket 업그레이드 거부는 해당 HTTP 400/403 상태를 구조화된 JSON 인벨롭 없이 노출합니다. 어떤 전송도 기본값으로 폴백하지 않습니다. 레거시 `/workspace/voice`, `/workspace/voice/transcribe`, `/voice/stream`은 기본 전용으로 유지됩니다. 클라이언트는 모든 한정 Voice 모달리티에 `workspace_qualified_voice`를 사용하고, 선택된 런타임이 구성별 오류를 보고하게 합니다. 레거시 `workspace_voice`, `workspace_voice_transcription`, `voice_transcribe` 태그는 기본 바인딩 라우트만 설명하며 한정된 보조 구성을 숨겨서는 안 됩니다.

`workspace_qualified_memory`는 워크스페이스 한정 관리 메모리 라우트를 광고합니다: `POST /workspaces/:workspace/memory/{remember,forget,dream}`은 작업을 대기열에 넣고, `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`는 이를 읽어옵니다. ACP HTTP와 멀티 워크스페이스 런타임이 모두 활성화된 경우에만 광고됩니다. 선택자는 다른 복수 라우트와 동일한 ID 또는 인코딩된 절대 cwd 규칙을 따릅니다. 각 등록된 워크스페이스는 자체 작업 레인을 갖습니다; 기본값의 한정 레인은 단일 `/workspace/memory` 표면과 동일한 인스턴스이므로, 한 쪽에서 대기열에 넣은 작업은 다른 쪽에서 읽을 수 있습니다. 해석은 선택된 런타임별로 엄격하며 기본 폴백이 없습니다: 알 수 없는 선택자는 `400 { code: "workspace_mismatch" }`를 반환하고, 신뢰되지 않는 선택자는 `403 { code: "untrusted_workspace" }`를 반환하며, 비활성 또는 배수 중 런타임은 `503 { code: "workspace_runtime_unavailable" }`를 반환합니다. 읽기는 절대 레인을 할당하지 않으므로 작업이 없는 워크스페이스를 폴링하면 `404 { code: "<kind>_task_not_found" }`를 반환합니다. 작업 ID는 레인에 범위가 지정되며 워크스페이스 재구성이나 런타임 교체에서 생존하지 않습니다; 오래된 ID는 `404`를 반환하며 데이터 손실 상태가 아닙니다. ACP HTTP가 비활성화되면 태그가 광고되지 않으며 비기본 한정 요청은 재시도 불가능한 `501 { code: "workspace_memory_unavailable" }`를 반환하는 반면, 기본 한정 라우트는 로컬 소유 레인을 통해 계속 작동합니다.

`session_lsp`는 `GET /session/:id/lsp`를 광고하며, 데몬 클라이언트를 위한 읽기 전용 구조화된 LSP 상태 스냅샷입니다. 이전 데몬은 `404`를 반환합니다; 원격 LSP 상태를 노출하기 전에 이 태그를 프리플라이트하세요.

`session_status`는 `GET /session/:id/status`를 광고하며, ID별 단일 세션의 라이브 브리지 요약입니다. `clientCount`와 `hasActivePrompt` 외에, 라이브 세션은 `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount`, 그리고 실패한 턴 이후 유지되는 `turnError`를 노출합니다. 오류는 다음 프롬프트가 실제로 시작될 때 정리됩니다. 현재 브리지에서 실행 중인 턴을 완료한 라이브 세션은 `updatedAt`도 포함합니다 — 라이브 상태 라우트에 문서화된 것과 동일한 활동 워터마크; 이 라우트는 브리지 요약을 직접 반환하므로, 값은 지속 트랜스크립트 mtime과 병합되지 않으며 세션 목록이 보고하는 것보다 이전일 수 있습니다. 단일 세션 상태 응답과 워크스페이스 세션 목록 모두 `turnError`와 `pendingInteractions`를 포함합니다: 렌더링 준비된 권한 작업 또는 `ask_user_question` 질문과 기존 권한 투표 라우트에 필요한 `requestId` 및 선택 가능한 옵션입니다. 각 사용자 질문에는 `answerKey`가 있습니다; 해당 값으로 키된 `answers`로 투표합니다(예: `{ "0": "Polling" }`). 지속 전용 세션은 런타임이 존재하지 않으므로 런타임 상태를 생략합니다. 이전 데몬은 `404`를 반환합니다; 전체 세션 목록을 스캔하는 대신 단일 세션의 상태를 폴링하기 전에 이 태그를 프리플라이트하세요.

`session_info`는 `GET /workspace/:id/session-info`와 그 `/workspaces/:workspace/session-info` 쌍을 광고합니다. 응답은 목록 메타데이터를 수화하지 않고 지속된 활성 및 아카이브된 세션 수를 집계합니다. 명시적인 O(n) 디스크 스캔이며 폴링해서는 안 됩니다; 클라이언트는 `truncated: true`를 하한 결과로 취급해야 합니다.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_toggle`, `workspace_skill_batch_toggle`, `extension_batch_activation_v2`, `workspace_init`, `workspace_mcp_restart`는 아래에 문서화된 변이 제어 라우트를 광고합니다. 이들은 변이 게이트에 의해 엄격하게 게이트됩니다(bearer 토큰 없이 구성된 데몬은 이들을 401 `token_required`로 거부). 이전 데몬은 `404`를 반환합니다; 해당 기능을 노출하기 전에 각 태그를 프리플라이트하세요.

`mcp_guardrails`(이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14)는 MCP 예산 표면을 다룹니다: `GET /workspace/mcp`의 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 필드, 서버별 셀의 `disabledReason` 필드, 그리고 `--mcp-client-budget` / `--mcp-budget-mode` CLI 플래그. 이전 데몬은 새 필드를 완전히 생략합니다; SDK 클라이언트는 `budgets[]` 의미에 의존하기 전에 이 태그를 프리플라이트합니다. 레지스트리 설명자는 향후 기능 모드 노출을 위해 `modes: ['warn', 'enforce']`도 포함합니다 — 현재는 클라이언트가 스냅샷의 `budgetMode` 필드에서 모드를 추론합니다. `enforce` 모드에서의 서버 거부는 `Object.entries(mcpServers)` 선언 순서에 따라 결정적입니다; 향후 범위 우선순위 레이어(qwen-code가 채택할 경우)는 claude-code의 `plugin < user < project < local` 규칙을 반영하여 "최저 우선순위 먼저"로 변경할 수 있습니다.

> **범위는 기능 기반입니다.** `mcp_workspace_pool`이 있으면, 하나의 워크스페이스 런타임 내 세션들이 전송 풀과 `WorkspaceMcpBudget`을 공유하며, 스냅샷은 `budgets[0].scope: 'workspace'`를 내보냅니다. 다른 워크스페이스 런타임은 독립적인 풀을 소유합니다. 이 태그가 없으면, 각 ACP 세션은 레거시 `McpClientManager`를 사용하고, 스냅샷은 `scope: 'session'`을 내보내며, N개의 세션이 각각 구성된 상한을 소비할 수 있습니다.

`workspace_file_read`는 텍스트/목록/stat/glob 워크스페이스 파일 라우트(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`)를 다룹니다. `workspace_file_bytes`는 나중에 추가된 `GET /file/bytes`를 다루므로 클라이언트가 PR19 시대 데몬에 대해 원시 바이트 윈도우 지원을 프리플라이트할 수 있습니다. `workspace_file_write`는 해시 인식 텍스트 변성 라우트(`POST /file/write`, `POST /file/edit`)를 다룹니다. 쓰기 태그는 라우트 계약이 존재함을 의미합니다; 현재 배포가 익명 변성에 열려 있다는 의미는 아닙니다. 쓰기/편집은 엄격한 변성 라우트이며 루프백에서도 구성된 bearer 토큰이 필요합니다. `workspace_file_upload`는 바이너리 수신 라우트 `POST /file/upload`를 다룹니다: `MAX_UPLOAD_BYTES`(50 MiB)로 제한된 `application/octet-stream` 본문이 워크스페이스에 기록되며 절대 덮어쓰지 않습니다 — 점유된 이름은 자동 번호가 매겨집니다(`name (1).ext`, `name (2).ext`, ...). 이 또한 엄격한 변성 라우트입니다.

`workspace_qualified_rest_core`가 광고될 때, 동일한 파일 표면은 `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write`, `/workspaces/:workspace/file/edit`, `/workspaces/:workspace/file/upload`에서도 사용할 수 있습니다.

동일한 태그는 `/workspaces/:workspace/agents` 및 `/workspaces/:workspace/agents/:agentType`에서 워크스페이스 한정 프로젝트 에이전트 CRUD도 노출합니다. 이 복수 라우트는 선택된 워크스페이스의 프로젝트 레벨 에이전트만 읽거나 변성합니다; `global` 및 `user` 범위 요청은 `400 { code: "global_scope_not_supported_for_workspace_route" }`를 반환합니다. 워크스페이스 없는 `/workspace/agents` 라우트는 기존 기본 워크스페이스 동작을 유지하며 사용자 레벨 에이전트 범위에 대한 유일한 REST 표면으로 남습니다.

`extension_management_v2`는 `/extensions/*`에서 사용자 레벨 확장 카탈로그 및 변성 표면과, `/workspaces/:workspace/extensions/*`에서 워크스페이스 활성화 프로젝션을 광고합니다. 아티팩트는 전역적입니다; 워크스페이스 라우트는 프로젝션 읽기, 정확한 활성화 재정의, 런타임 새로고침만 노출합니다. 읽기는 신뢰되지 않은 등록된 워크스페이스를 대상으로 할 수 있지만, 활성화, 새로고침, 워크스페이스 범위 설치는 신뢰되는 대상이 필요합니다. 느린 변성은 `/extensions/operations/:operationId`에서 데몬 로컬 작업을 사용합니다; 재시작과 데몬 간에 저장소 생성이 아닌 작업 역사가 권위적입니다. 게시된 `workspace_extensions` 기능과 `/workspace/extensions/*` 라우트는 기본 워크스페이스 호환성 어댑터로 남아 있습니다. 클라이언트는 `extension_management_v2`를 프리플라이트해야 하며 데몬 모드나 `workspace_qualified_rest_core`에서 이를 추론해서는 안 됩니다.

`extension_git_credentials`는 `POST /workspace/extensions/install`과 `POST /extensions/install` 모두에서 인증된 HTTPS Git 설치를 광고합니다. 클라이언트는 URL userinfo 또는 `credentialPersistence`를 보내기 전에 이 태그를 프리플라이트해야 합니다; 이전 데몬은 URL 자격 증명을 거부합니다. 이 태그는 키 체인 가용성이 아닌 백엔드 프로토콜 지원을 설명합니다: 저장 모드는 터미널 작업 결과에서 선택된 백엔드를 보고합니다.

`extension_batch_activation_v2`는 `PUT /extensions/activation`과 `PUT /workspaces/:workspace/extensions/activation`을 추가합니다. 둘 다 `extensionNames`에서 1–100개의 이름을 받아들이고, 대소문자를 구분하지 않고 중복을 제거하면서 처음 본 순서를 유지하며, 변경된 대상을 하나의 생성으로 지속하고, 하나의 `202` 작업 핸들을 반환합니다. 대상은 `enabled` 또는 `disabled`를 설정할 때 설치되어 있을 필요가 없습니다: 해당 이름은 해당 이름의 Extension이 설치될 때 보존되는 desired-state 선언을 생성합니다. 전역 라우트는 `state: "enabled" | "disabled"`를 받아들이고, V2 `defaultActivation`을 작성하며, 등록된 모든 런타임을 조정합니다. 워크스페이스 라우트도 `"inherit"`을 받아들이고, 선택된 신뢰되는 런타임에 대한 정확한 재정의를 적용 또는 제거하며, 해당 런타임만 조정합니다. `inherit`은 알 수 없는 이름을 선언하지 않습니다; 전체 알 수 없는 제거는 `updated: false`를 보고하고 조정을 건너뜁니다. 단일 활성화 라우트는 설치 전용 및 ID 주소 지정으로 남아 있습니다.

### Extension Management V2 와이어 계약

모든 라우트는 위의 데몬 bearer 인증 규칙을 사용합니다. `X-Qwen-Client-Id`는 V2 변성 라우트에서 선택 사항입니다; 제공될 때, 변성의 대상 워크스페이스 런타임 중 하나에 등록된 클라이언트를 식별해야 합니다. `:extensionId`는 소문자 64-hex 확장 ID입니다. `:workspace`는 먼저 정확히 워크스페이스 ID로 해석되고, 그렇지 않으면 정규화 후 URL 인코딩된 절대 cwd로 해석됩니다.

| 메서드 및 경로                                                    | 성공                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions`                                                  | `200` 전역 아티팩트 카탈로그                                               |
| `PUT /extensions/activation`                                       | `202` 전역 기본 활성화 배치 작업                             |
| `PUT /extensions/:extensionId/activation`                          | `202` 전역 기본 활성화 작업                                   |
| `POST /extensions/install`                                         | `202` 설치 작업                                                     |
| `POST /extensions/check-updates`                                   | `202` 업데이트 확인 작업                                                |
| `POST /extensions/:extensionId/update`                             | `202` 업데이트 작업                                                      |
| `DELETE /extensions/:extensionId`                                  | `202` 제거 작업, 또는 확장이 없을 때 멱등 `204` |
| `GET /extensions/operations/:operationId`                          | `200` 작업 스냅샷                                                    |
| `GET /workspaces/:workspace/extensions`                            | `200` 워크스페이스 활성화 프로젝션                                       |
| `PUT /workspaces/:workspace/extensions/activation`                 | `202` 정확한 워크스페이스 활성화 배치 작업                            |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation`    | `202` 정확한 워크스페이스 활성화 작업                                  |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` 재정의 제거 작업                                              |
| `POST /workspaces/:workspace/extensions/refresh`                   | `202` 런타임 새로고침 작업                                             |

전역 카탈로그 응답은 다음과 같습니다:

```json
{
  "v": 1,
  "generation": 12,
  "extensions": [
    {
      "id": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "installType": "npm",
      "defaultActivation": "enabled",
      "workspaceOverrideCount": 1
    }
  ]
}
```

설치 메타데이터가 없을 때 `installType`은 생략됩니다. `defaultActivation`은 `enabled` 또는 `disabled`입니다. `workspaceOverrideCount`는 저장된 `inherit` 항목을 제외합니다.

워크스페이스 프로젝션 응답은 다음과 같습니다:

```json
{
  "v": 1,
  "workspaceId": "workspace-id",
  "workspaceCwd": "/absolute/workspace",
  "trusted": true,
  "desiredGeneration": 12,
  "appliedGeneration": 11,
  "extensions": [
    {
      "extensionId": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "defaultActivation": "enabled",
      "workspaceActivation": "disabled",
      "effectiveActivation": "disabled",
      "activationSource": "workspace_override"
    }
  ]
}
```

`workspaceActivation`은 상속의 경우 `enabled`, `disabled`, 또는 `null`입니다. `activationSource`는 `default`, `workspace_override`, `legacy_path_rule`, 또는 `cli_override`입니다. `desiredGeneration`은 내구성 저장소 생성입니다; `appliedGeneration`은 컨트롤러가 해당 워크스페이스 런타임에 적용된 것으로 기록한 최신 생성이며 일시적으로 지연될 수 있습니다.

설치에는 명시적 동의와 초기 활성화가 필요합니다:

```json
{
  "source": "@scope/demo",
  "consent": true,
  "activation": { "scope": "user" },
  "ref": "optional-git-ref",
  "autoUpdate": true,
  "allowPreRelease": false,
  "registry": "https://registry.npmjs.org"
}
```

워크스페이스 전용 초기 활성화의 경우 `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`를 사용합니다; 대상은 존재하고 신뢰되어야 합니다. 데몬 설치는 GitHub, Git, npm 소스를 허용합니다. `ref`는 npm에 적용되지 않으며, `registry`는 npm에만 적용됩니다. `ref`, `autoUpdate`, `allowPreRelease`, `registry`는 선택 사항입니다.

`extension_git_credentials`가 광고될 때, HTTPS Git 소스에 userinfo가 포함될 수 있습니다(예: `https://username:token@git.example.com/org/repository.git`). `credentialPersistence`는 이러한 소스와 함께할 때만 유효합니다. `stored` 또는 `one_time`이며, 생략 시 `one_time`이 기본값입니다. 저장 모드는 데몬의 하이브리드 시크릿 저장소를 통해 자격 증명을 저장하고 설치 메타데이터에 정리된 저장소 URL만 유지하므로 확장이 업데이트 가능합니다. 일회성 모드는 저장소 URL이나 자격 증명 모두 저장하지 않고 업데이트 불가능한 `snapshot`을 생성합니다; `autoUpdate: true`는 이 모드에서 거부됩니다. URL 자격 증명 없이 필드를 제공하거나, 잘못된 자격 증명을 제공하거나, npm, 아카이브, 로컬, SSH, 비 Git 소스와 함께 자격 증명을 사용하면 `400`이 반환됩니다.

자격 증명 포함 설치 응답과 작업은 `credentialPersistence`를 노출하며 `credentialStorage`를 `keychain` 또는 `encrypted_file`로 노출할 수 있습니다. 일회성 작업은 `source`를 생략하고, 저장 작업은 정리된 소스를 반환할 수 있습니다. 스냅샷 카탈로그/상태 항목은 소스를 생략하고, `credentialPersistence`를 `one_time`으로 설정하며, `not updatable`을 보고합니다. 업데이트는 `extension_not_updatable`로 실패하고, 사용 불가능한 저장 시크릿은 네트워크 접근 전에 `extension_credential_unavailable`로 실패합니다.

전역 및 워크스페이스 활성화 `PUT` 요청은 동일한 본문을 사용합니다:

```json
{ "state": "enabled" }
```

`state`는 `enabled` 또는 `disabled`입니다. 업데이트, 제거, 업데이트 확인, 활성화 제거, 새로고침 요청에는 필수 본문이 없습니다.

배치 활성화 요청은 Extension 이름을 사용합니다:

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

워크스페이스 배치는 `"state": "inherit"`도 허용합니다. 터미널 전역 결과는 `name`과 `defaultActivation`을 포함합니다; 워크스페이스 결과는 `name`, `workspaceActivation`(상속의 경우 `null`), `effectiveActivation`을 포함합니다. 잘못된 이름은 요청을 거부하고, 기존 Store ID와의 충돌은 부분 커밋 없이 원자적으로 실패합니다. 알 수 없는 `inherit` 대상은 지속되지 않습니다. 재정의를 제거하는 것은 기본 활성화 선언을 만들거나 이후 설치 동의를 대체해서는 안 되기 때문입니다.

수락된 모든 비동기 변성은 다음을 반환합니다:

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

워크스페이스 한정 변성은 동일한 전역 `/extensions/operations/:operationId` 폴링 경로를 사용합니다. 작업 역사는 프로세스 로컬이며, 제한된 수의 터미널 항목만 유지하며, 데몬 재시작 시 손실됩니다; 클라이언트는 작업 ID가 사라질 때 카탈로그 또는 워크스페이스 프로젝션을 다시 읽고 생성을 비교해야 합니다.

작업 스냅샷은 다음과 같습니다:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "install",
  "status": "running",
  "phase": "preparing",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000100,
  "source": "owner/repository",
  "name": "demo"
}
```

`status`는 `queued`에서 `running`으로, 그 다음 `succeeded`, `succeeded_with_warnings`, 또는 `failed`로 전환됩니다. 실행 중 `phase`는 `preparing`, `committing`, 또는 `reconciling`입니다. 터미널 성공은 `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked`, 또는 `refreshed`와 동일한 `status`를 가진 `result`를 포함할 수 있습니다; 조정 결과는 추가로 `refreshed`, `failed`, `error`를 포함할 수 있으며, 배치 활성화 결과는 정렬된 `results`를 포함합니다. 업데이트 확인은 확장 이름으로 키화된 `result.states`를 반환하며, 값은 `checking for updates`, `update available`, `up to date`, `not updatable`, `error` 등입니다. 자격 증명과 인증 헤더는 절대 작업 필드가 아닙니다.

내구성 커밋에 이어 불완전한 정리 또는 런타임 조정이 실패한 변성으로 보고되지 않습니다. `succeeded_with_warnings`를 반환하고 커밋된 결과를 보존합니다:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "activation",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "disabled",
    "name": "demo",
    "refreshed": 1,
    "failed": 1
  },
  "warnings": [
    {
      "workspaceId": "workspace-id",
      "workspaceCwd": "/absolute/workspace",
      "code": "reconcile_slow",
      "error": "Runtime reconciliation took 31000ms."
    }
  ]
}
```

경고의 `workspaceId`와 `code`는 선택 사항입니다; `workspaceCwd`와 `error`는 항상 존재합니다. 클라이언트는 경고를 표시하고, 카탈로그/프로젝션을 새로고침해야 하며, 내구성 변성을 맹목적으로 재시도해서는 안 됩니다.

검증 및 인증 실패는 안정적인 코드가 존재할 때 `{ "error": "...", "code": "..." }`를 사용하는 동기 HTTP 오류입니다. 중요한 경우는 `400 invalid_extension_id`, `400 invalid_extension_names`, `400 invalid_extension_name`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found`, `429 extension_queue_full`입니다. 설치 검증은 잘못된 소스/ref/registry 옵션, 누락된 동의, 또는 누락/잘못된 초기 활성화에 대해서도 `400`을 반환합니다. `202` 이후 실패한 변성은 작업 역사에 유지되는 동안 `status: "failed"`, `error`, 선택적 안정적인 `code`로 표현됩니다; 일반적인 코드는 `extension_prepare_timeout`과 `extension_conflict`입니다. 작업에 대한 HTTP `404`는 작업 역사가 내구성이 아니므로 롤백을 의미하지 않습니다.

`daemon_status`는 아래에 문서화된 통합 읽기 전용 운영자 진단 스냅샷 `GET /daemon/status`를 광고합니다.

**조건부 태그.** 이 기능 태그는 배포 토글, 런타임 와이어링, 또는 가용성 조건이 활성일 때만 광고됩니다. 태그의 존재는 문서화된 동작이 사용 가능함을 의미합니다; 부재는 태그 이전의 이전 데몬이거나 해당 조건이 거짓인 현재 데몬을 의미합니다. 현재:

<!-- conditional-serve-features:start -->

| 태그                                | 광고 조건                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`                      | 데몬이 `--require-auth`(또는 임베디드 API를 통해 `requireAuth: true`)와 함께 시작되었습니다. 모든 라우트에서 Bearer 토큰이 필수이며, 루프백 바인드의 `/health`도 포함됩니다. |
| `mcp_workspace_pool`                | 공유 MCP 전송 풀이 활성입니다. `QWEN_SERVE_NO_MCP_POOL=1`이 풀을 비활성화하면 생략됩니다. |
| `mcp_pool_restart`                  | 공유 MCP 전송 풀이 활성입니다; 재시작 응답에 풀 인식 다중 항목 형식이 포함될 수 있습니다. |
| `external_tool_guard`               | `qwen serve`가 `--external-tool-guard-mode=required`의 시작 핸드셰이크를 완료했습니다; 모든 생성된 ACP 채널은 세션 생성 전에 설치된 콜백을 승인해야 하며, 최종 실행 경계에 도달하는 모든 지원되는 최상위 관리 ACP 도구 호출은 하나의 외부 실행 전 허가를 받아야 합니다. 이전 권한/hook 거부는 제공자 요청을 하지 않습니다. 중첩된 AgentCore 실행은 v1 범위를 벗어나며 이 외부 제공자 모드가 활성인 동안 거부됩니다. 이 태그는 외부 제공자만 반영합니다: 이와 독립적으로, 모든 데몬은 셸 명령줄을 가진 관리 도구(`run_shell_command` 및 `monitor`)에 내장 Git 위치 가드를 적용하므로, 이 태그가 없다고 해서 실행 전 거부가 없다는 의미는 아닙니다. |
| `allow_origin`                      | T2.4([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). 데몬이 하나 이상의 `--allow-origin <pattern>`(또는 임베디드 API를 통해 `allowOrigins: [...]`)와 함께 시작되었습니다. 매칭된 오리진의 크로스 오리진 요청은 적절한 CORS 응답 헤더를 받습니다; 매칭되지 않는 오리진은 여전히 기본 403을 받습니다. 구성된 패턴 목록은 신뢰 오리진 세트를 인증되지 않은 읽기자에게 유출하지 않기 위해 의도적으로 `/capabilities`에 에코되지 않습니다 — 브라우저 WebUI는 이미 자신의 오리진을 알고 있습니다. |
| `prompt_absolute_deadline`          | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs`가 양의 정수로 설정되어 있습니다. |
| `writer_idle_timeout`               | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs`가 양의 정수로 설정되어 있습니다. |
| `workspace_settings`                | 데몬이 설정 지속성과 함께 생성되었습니다. |
| `workspace_voice`                   | 설정 지속성이 가능하므로 레거시 기본 워크스페이스 Voice 설정 라우트가 활성입니다. |
| `workspace_voice_transcription`     | 기본 워크스페이스에 구성된 Voice 전사 모델이 있습니다. |
| `session_shell_command`             | 세션 셸 실행이 명시적으로 활성화되어 있습니다. |
| `session_artifacts_persistence`     | 세션 아티팩트 지속성이 런타임에 와이어링되어 있습니다. |
| `session_generation`                | 세션 생성 도우미를 사용할 수 있습니다. |
| `workspace_generation`              | 워크스페이스 범위 생성 도우미를 사용할 수 있습니다. |
| `rate_limit`                        | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit`이 활성화되어 있습니다. |
| `workspace_reload`                  | 임베디드 라우트 구성에서 워크스페이스 새로고침 지원을 사용할 수 있습니다. |
| `workspace_trust_hot_reload`        | 워크스페이스 신뢰 정책 모니터링 및 런타임 생성 조정이 와이어링되어 있어, 데몬을 재시작하지 않고도 신뢰 변경이 적용되며 v2 신뢰 상태 보고서가 수렴합니다. |
| `channel_reload`                    | 데몬 관리 채널 워커 매니저가 활성화되어 있으며 현재 선택을 다시 로드할 수 있습니다. |
| `channel_control`                   | 데몬 관리 채널 워커 런타임 제어가 와이어링되어 있습니다. |
| `channel_management`                | 워크스페이스 범위 Channel 설정, 라이프사이클, 페어링 관리가 와이어링되어 있습니다. |
| `multi_workspace_sessions`          | 둘 이상의 워크스페이스 런타임이 등록되어 있어 세션 생성이 cwd로 신뢰되는 런타임을 선택할 수 있습니다. |
| `multi_workspace_session_rewind`    | 둘 이상의 워크스페이스 런타임이 등록되어 있습니다; 단일 라이브 세션 되감기 라우트가 소유 런타임을 해석합니다. |
| `multi_workspace_session_shell`     | 둘 이상의 워크스페이스 런타임이 등록되어 있고 세션 셸 실행이 명시적으로 활성화되어 있습니다; 단일 REST 셸이 소유 런타임을 해석합니다. |
| `dynamic_workspace_registration`    | 워크스페이스 런타임 팩토리가 데몬에 와이어링되어 있어 기존 신뢰 디렉토리를 런타임에 보조 런타임으로 등록할 수 있습니다. |
| `persistent_workspace_registration` | 워크스페이스 등록 저장소가 데몬에 와이어링되어 있습니다. 프로덕션 `runQwenServe`는 사용자 레벨 저장소를 자동으로 제공합니다; 직접 `createServeApp` 임베드는 명시적으로 주입하고 워크스페이스 레지스트리의 시작 복원을 관리해야 합니다. |
| `scratch_workspace_registration`    | 관리되는 스크래치 워크스페이스 생성이 가능합니다 — 런타임 팩토리, 검증된 관리 스크래치 루트, 런타임 정리가 와이어링되어 있으며 모든 관리 런타임이 스크래치 루트 경계를 존중합니다. |
| `workspace_runtime_removal`         | 제거 가능한 동적 또는 지속성 복원 보조 런타임을 관리 라우트를 통해 배수하고 제거할 수 있습니다. |
| `workspace_qualified_acp`           | ACP HTTP와 멀티 워크스페이스 런타임이 활성이므로 복수 ACP 엔드포인트가 보조 런타임을 선택할 수 있습니다. |
| `workspace_qualified_voice`         | 멀티 워크스페이스 런타임과 공유 ACP/Voice WebSocket 리스너가 활성이므로 보조 런타임에 대한 모든 워크스페이스 한정 Voice 모달리티에 도달할 수 있습니다. |
| `workspace_qualified_memory`        | ACP HTTP와 멀티 워크스페이스 런타임이 활성이므로 워크스페이스 한정 관리 메모리 라우트가 remember, forget, dream 작업에 대한 워크스페이스별 작업 레인을 선택할 수 있습니다. |
| `client_mcp_over_ws`                | 데몬이 ACP WebSocket을 통해 클라이언트 호스팅 MCP 서버를 허용합니다. 이것은 명시적 옵트인이며 CDP 터널 경로에 필요하지 않습니다. |
| `cdp_tunnel_over_ws`                | 데몬이 역방향 `/cdp` WebSocket 터널을 노출합니다(명시적 옵트인에 의하거나 Chrome 확장 오리진이 허용되었기 때문에). 이것은 터널이 존재함만 의미하며 Chrome DevTools MCP 도구가 등록되었다는 의미는 아닙니다. |
| `browser_automation_mcp`            | ACP HTTP가 활성화되고, `cdp_tunnel_over_ws`가 활성이며, bearer 토큰이 `/cdp`를 차단하지 않으며, `QWEN_CDP_MCP_COMMAND`가 외부 stdio MCP 어댑터를 지정합니다. 메인 CLI 패키지는 브라우저 자동화 어댑터를 번들하지 않습니다; 이 태그 없이는 Chrome 확장 사이드 패널 채팅이 여전히 작동할 수 있지만, 콘솔/네트워크/스크린샷/클릭 도구는 기본적으로 등록되지 않습니다. |
| `voice_transcribe`                  | Voice WebSocket 엔드포인트가 마운트되어 있습니다; 성공적인 전사에는 구성된 Voice 모델이 여전히 필요합니다. |
| `realtime_voice`                    | macOS WebShell 데몬에서 Live Voice가 활성화되고 네이티브 Host 통합이 활성입니다. `/live/status`가 준비 상태를 보고하지만, 기능이 활성화될 때까지 기능은 철회됩니다. |

<!-- conditional-serve-features:end -->

`mcp_guardrails`는 이 조건부 표에 **없습니다** — 항상 켜져 있는 태그이며, 이진 파일이 새 `/workspace/mcp` 예산 필드를 지원할 때 광고됩니다(운영자가 예산을 구성했는지 여부 무관). `--mcp-client-budget`을 설정하지 않은 운영자도 새 필드를 받습니다(`budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events`(이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b)는 폴 루프 없이 MCP 예산 상태 교차를 표면화하는 타입화된 SSE 푸시 이벤트를 광고합니다. 두 가지 프레임 타입이 `GET /session/:id/events`로 전달됩니다:

- `mcp_budget_warning` — `reservedSlots.size / clientBudget`의 상승 75% 교차에서 한 번 발생합니다. 비율이 37.5%(`MCP_BUDGET_REARM_FRACTION`) 미만으로 떨어진 후에만 재설정됩니다. PR 10의 `slow_client_warning` 히스테리시스를 미러링하지만, 구독자별 백로그 레벨이 아닌 매니저 레벨에서 작동합니다. 페이로드: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. `warn`과 `enforce` 모드 모두에서 발생합니다; `off`에서는 발생하지 않습니다.
- `mcp_child_refused_batch` — 하나 이상의 서버가 거부되었을 때 각 `discoverAllMcpTools*` 패스의 마지막에 발생하며, `readResource` 지연 생성 거부 경로에서 길이 1 배치로도 발생합니다. 페이로드: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode`는 리터럴 `'enforce'`입니다. `warn` 모드는 절대 거부하지 않기 때문입니다.

두 이벤트 모두 세션별 SSE 리플레이 링에 존재합니다(`id`를 포함하므로), `Last-Event-ID`로 재연결하는 클라이언트는 이를 통해 재개합니다; `GET /workspace/mcp`의 스냅샷은 장기 연결 끊김 이후 상태의 진실 공급원입니다. 일단 광고되면 무조건적입니다 — 조건부 토글이 없습니다. SDK 리듀서 상태(`DaemonSessionViewState`)는 간단한 지체 스타일 UI를 원하는 어댑터를 위해 `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch`를 노출합니다.

## 라우트

클라이언트는 `session_turn_status`를 기능 감지하고 `GET /session/:id/turns/current` 또는 `GET /session/:id/turns/:promptId`를 폴링할 수 있습니다. 이 라우트는 라이브 소유 세션이 필요하며 다른 워크스페이스를 로드하거나 스캔하지 않습니다. 확정된 결과는 활성 분기에서 제한된 스캔으로 읽은 최선 노력의 트랜스크립트 레코드입니다; `prompt_not_found`는 라이브 큐, 64 항목 터미널 오버레이, 또는 제한된 활성 윈도우에서 결과를 찾지 못했음을 의미합니다. `resultText`는 마지막 도구 경계 이후 원시 최종 부모 모델 답변이며, 선택적 메시지 재작성 전이며 부재할 수 있습니다. 32,768 UTF-16 코드 단위를 초과하는 결과는 `resultTruncated: true`와 `resultCode: "RESULT_TEXT_TRUNCATED"`를 포함합니다.

### `GET /health`

Liveness probe. 기본 형식은 리스너가 올라와 있으면 `200 {"status":"ok"}`를 반환합니다 — 저렴하고, 브리지에 접근하지 않으며, 고빈도 k8s/Compose liveness probe에 적합합니다.

`?deep=1`을 전달하면(또한 `?deep=true` 또는 bare `?deep` 허용) 배수 중인 워크스페이스를 포함한 모든 관리 워크스페이스 런타임의 브리지 **카운터**를 집계하는 데몬 전체 probe를 수행합니다(정보 제공용이며 실제 liveness 검사가 아닙니다):

```json
{
  "status": "ok",
  "workspaceCount": 2,
  "sessions": 3,
  "pendingPermissions": 1,
  "activePrompts": 1,
  "activeWork": true,
  "activeWorkReporting": "full",
  "activeWorkStaleMs": 4200,
  "connectedClients": 2,
  "channelAlive": true,
  "lastActivityAt": "2026-07-15T08:30:00.000Z",
  "idleSinceMs": 120000
}
```

`sessions`, `pendingPermissions`, `activePrompts`는 합계입니다. `activeWork`는 어떤 런타임이든 수락되었지만 미확정 프롬프트(FIFO 대기 프롬프트 포함), 실행 중인 백그라운드 Agent, 대기열/진행 중인 Agent 터미널 알림, 또는 Session 관리 백그라운드 셸 작업이 있을 때 true입니다. 셸 작업은 셸 레지스트리가 실행 중인 항목을 보고하는 동안 그리고 터미널 알림이 대기열에 있거나 부모 계속을 구동하는 동안 활성으로 유지됩니다; 어떤 수의 셸도 하나의 제한된 집계 홀드에 기여합니다. 모니터, 워크플로, 크론 작업, 후속 제안, 셸 레지스트리가 더 이상 추적할 수 없는 외부 프로세스는 이 필드에서 제외됩니다. 세션 범위입니다: 아직 세션이 attach되지 않은 채널 레벨 작업 — 생성 중, 보류 중인 복원, MCP 검색 또는 인증 — 은 카운트되지 않으므로, 데몬이 아직 해당 채널을 회수하지 않으려 해도 `activeWork`가 false일 수 있습니다. 이 필드를 "데몬이 회수 가능함"으로 해석하지 마세요; 세션 소유 작업만 설명합니다. `activeWorkReporting`는 그 부울의 얼마나 많은 부분이 실제로 보증되는지를 말합니다: 모든 라이브 세션이 필수 범주를 모두 보고하는 자식의 최신 보고서로 커버될 때 `full`, 어떤 세션도 보고를 협상하지 않았을 때 `none`, 그 사이의 모든 것(오래된 스냅샷 또는 필수 범주를 생략하는 협상된 자식 포함)에 대해 `partial`입니다. 3개의 보고서 간격보다 오래된 스냅샷은 커버리지로 카운트되지 않습니다: 세션이 유휴하다는 보고서가 아니므로, 세션은 자식이 결코 보고하지 않은 것과 동일하게 유지로 읽힙니다. 협상되었지만 불완전한 자식에 대해 일반 자동 정리도 비활성화됩니다; `shell`을 이해하지 못하는 자식은 완전한 현재 술어에 따라 조건부 종료를 안전하게 승인할 수 없습니다. 완전히 지원되지 않는 역사적 자식은 레거시 정리 동작을 유지하며, 명시적 close, kill, shutdown, 채널 종료는 강제 작업으로 남아 있습니다. `activeWorkStaleMs`는 부울이 기반하는 가장 오래된 스냅샷의 나이이며 **커버된 세션 중**에서이며, 어떤 세션도 커버되지 않을 때 `0`입니다; 이것은 진단용입니다 — 신선도는 이미 데몬에 의해 `activeWorkReporting`에 등급이 매겨지기 때문입니다(오직 데몬만이 각 채널의 협상된 케이던스를 알고 있습니다). 등급은 런타임별이 아닌 모든 관리 런타임에 대해 한 번 계산된 후 결합됩니다 — 세션이 없는 런타임은 공허하게 완전하며, 이를 증거로 취급하면 빈 워크스페이스가 다른 워크스페이스의 미보고 세션을 보증할 수 있게 됩니다. `lastActivityAt`은 가장 최신의 null이 아닌 워크스페이스 활동 시간이며 `idleSinceMs`는 동일한 스냅샷에서 파생됩니다. `channelAlive`는 하나 이상의 관리 워크스페이스 채널이 라이브임을 의미합니다; 모든 워크스페이스가 정상이라는 의미는 아닙니다. `connectedClients`와 선택적 `rateLimitHits`는 워크스페이스별 합계가 아닌 데몬 전체 카운터로 남아 있습니다.

재시작 컨트롤러는 다음 경우 데몬이 바쁘다고 취급해야 합니다:

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

세 번째 항을 제거하면 `activeWork === false`가 "어떤 자식도 나에게 아무것도 말하지 않았다"와 구별할 수 없게 되며, 이것이 이에 따라 행동하는 것이 안전하지 않은 유일한 경우입니다. 알 수 없는 응답과 실패한 probe도 재시작을 방지해야 합니다. `activePrompts`는 독립적인 호환성 신호로 남아 있습니다.

이 필드는 관찰 캐시이며 재시작 리스가 아닙니다: 신선하고 완전히 등급이 매겨진 빈 응답조차 샘플링된 순간을 설명하며, 그 직후에 작업이 시작될 수 있습니다. 위의 규칙은 잘못된 재시작의 위험을 상당히 낮추지만 제거하지는 않습니다 — 엄격한 안전성은 새 작업 수용을 중지하고 배수를 확인한 후에만 종료하는 prepare-restart 펜스가 필요합니다.

> ⚠️ 딥 probe는 **정보 제공용**이며 실제 liveness 검증이나 원자적 회수 리스가 아닙니다. 협상된 ACP 자식은 협상된 케이던스로 채널 전체 활성 작업 스냅샷을 게시하며, 데몬은 그 신선도를 `activeWorkReporting`에 등급을 매깁니다 — 하지만 누락된 보고서 때문에 채널을 종료하지는 않습니다. 하나의 세션의 침묵이 프로세스가 죽었다는 증거가 아니기 때문입니다. 전송 liveness와 정지된 Agent 감지는 별개의 메커니즘입니다. `connectedClients`는 REST SSE 연결을 카운트하며 모든 ACP 전송을 카운트하지 않습니다. 유휴 회수에는 반복 샘플과 정상 종료를 사용하세요; 전송 및 워크스페이스별 진단에는 인증된 `/daemon/status`를 사용하세요. 관리 런타임 게터가 throw하면, 딥 헬스는 부분 합계를 반환하기보다 `503 {"status":"degraded","reason":"aggregation_failed"}`와 함께 닫히며, 데몬 로그가 실패한 워크스페이스 런타임을 식별합니다. 부트스트랩 중 런타임 레지스트리가 준비되기 전에는 `Retry-After: 1`과 함께 `503 {"status":"degraded","reason":"bootstrap"}`를 반환합니다. 리스너 liveness의 경우, `?deep` 없이 기본 `/health`를 사용하세요.

**인증:** **비루프백 바인드에서만** 필요합니다. 루프백(`127.0.0.1`, `::1`, `[::1]`)에서 `/health`는 bearer 미들웨어 전에 등록되므로 파드 내부의 k8s/Compose probe는 토큰을 포함할 필요가 없습니다. 비루프백(`--hostname 0.0.0.0` 등)에서 라우트는 bearer 미들웨어 후에 등록되며 유효한 토큰 없이는 401을 반환합니다 — 그렇지 않으면 인증되지 않은 호출자가 임의 주소를 probe하여 `qwen serve`가 존재하는지 확인할 수 있으며, 이는 포트 스캔과 결합되면 심각도가 낮은 정보 유출입니다. CORS 거부 + 호스트 허용 목록은 여전히 루프백 면제에 적용됩니다.

### `GET /daemon/status`

읽기 전용 운영자 진단. `/health`와 달리 이것은 일반 데몬 API입니다:
bearer 인증과 속도 제한 이후에 등록되며, 루프백 바인드에서도 마찬가지입니다. 쿼리 파라미터:

- `detail=summary`(기본값)는 인메모리 데몬 상태만 읽습니다.
- `detail=full`은 라이브 세션 진단, ACP 연결 진단, 인증 디바이스 플로우 카운트, 워크스페이스 상태 섹션도 포함합니다.
- 다른 `detail` 값은 `400 { "code": "invalid_detail" }`를 반환합니다.

`summary`는 의도적으로 워크스페이스 상태 메서드를 쿼리하지 않고, ACP 자식을 시작하거나, 세션을 생성하지 않습니다. `full`은 각 워크스페이스 섹션을 독립적으로 쿼리합니다; 타임아웃이나 예외는 해당 섹션만 `unavailable`로 표시하고 `workspace_status_unavailable` 이슈를 추가합니다.

응답 형식:

```json
{
  "v": 1,
  "detail": "summary",
  "generatedAt": "2026-06-16T00:00:00.000Z",
  "status": "ok",
  "issues": [],
  "daemon": {
    "pid": 12345,
    "uptimeMs": 3600000,
    "mode": "http-bridge",
    "workspaceCwd": "/repo",
    "qwenCodeVersion": "0.18.1",
    "daemonId": "serve-..."
  },
  "security": {
    "tokenConfigured": true,
    "requireAuth": false,
    "loopbackBind": true,
    "allowOriginConfigured": false,
    "allowOriginMode": "none",
    "sessionShellCommandEnabled": false
  },
  "limits": {
    "maxSessions": 32,
    "maxTotalSessions": null,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "compactedReplayMaxBytes": 4194304,
    "promptDeadlineMs": null,
    "writerIdleTimeoutMs": null,
    "channelIdleTimeoutMs": 0,
    "sessionIdleTimeoutMs": 1800000,
    "acpConnectionCap": 64
  },
  "runtime": {
    "sessions": { "active": 0 },
    "permissions": { "pending": 0, "policy": "first-responder" },
    "channel": { "live": false },
    "channelWorker": {
      "enabled": false,
      "state": "disabled",
      "channels": []
    },
    "transport": {
      "restSseActive": 0,
      "acp": {
        "enabled": true,
        "connections": 0,
        "connectionStreams": 0,
        "sessionStreams": 0,
        "sseStreams": 0,
        "wsStreams": 0,
        "pendingClientRequests": 0
      }
    },
    "perf": {
      "eventLoop": { "meanMs": 0, "p50Ms": 0, "p99Ms": 0, "maxMs": 0 },
      "promptQueueWait": {
        "count": 0,
        "meanMs": 0,
        "maxMs": 0,
        "lastMs": null
      },
      "pipe": {
        "inbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 },
        "outbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 }
      }
    },
    "activity": {
      "activePrompts": 0,
      "pendingPrompts": 0,
      "queuedPrompts": 0,
      "lastActivityAt": null,
      "idleSinceMs": null
    }
  }
}
```

멀티 워크스페이스 응답은 최상위 `workspaces[]` 행도 포함합니다:
`{ id, cwd, displayName?, primary, trusted }`. 선택적 display name은
설정되지 않았을 때 생략되며 프레젠테이션 전용입니다; 상태 소비자는
런타임을 상관시키기 위해 `id` 또는 `cwd`를 계속 사용해야 합니다.

`runtime.perf`는 선택 사항입니다. 존재할 때 데몬 프로세스 이벤트 루프
지연, 프롬프트 FIFO 큐 대기 샘플, 데몬-자식 파이프 바이트 카운터만 보고합니다;
ACP 자식 이벤트 루프 지연은 `/daemon/status`에 포함되지 않습니다.

`status`는 어떤 이슈라도 오류 심각도를 가지면 `error`, 어떤 이슈라도
경고 심각도를 가지면 `warning`, 그렇지 않으면 `ok`입니다. 이슈 코드는 안정적이며
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`,
`channel_worker_partial_connect`, `workspace_status_unavailable`를 포함합니다.
리스너가 준비된 후 전체 런타임이 마운트되기 전의 짧은 창에서, `/daemon/status`는
`daemon_runtime_starting`을 보고할 수 있습니다; 비동기 런타임 마운트가 실패하면,
비상태 런타임 라우트가 `503`을 반환하는 동안 `daemon_runtime_failed`를 보고합니다.

`runtime.activity`는 데몬 전체 프롬프트 활동을 보고합니다. `activePrompts`는 실행 중 프롬프트가 있는 세션을 카운트합니다. `pendingPrompts`는 실행 중인 프롬프트와 FIFO 대기 프롬프트를 포함하여 아직 확정되지 않은 모든 수락된 프롬프트를 카운트합니다. `queuedPrompts`는 수락되었지만 아직 디스패치되지 않은 FIFO 대기 프롬프트를 카운트합니다. `lastActivityAt`은 마지막 프롬프트 시작/종료 또는 세션 생성의 ISO 8601 타임스탬프입니다; 데몬이 부트 이후 어떤 활동도 처리하지 않았을 때 `null`입니다. `idleSinceMs`는 응답 생성 시점에 `lastActivityAt`에서 계산됩니다.

`limits.memory`는 부가적이며 데몬의 해석된 메모리 수치를 보고합니다: 필수 `enforced: false`, `childHeap` 객체(`mode`; `maxConcurrentChildren`과 `perChildCeilingMb`, 둘 다 `mode: 'off'`에서 `null`(아무것도 모델링하지 않음)이며, `perChildCeilingMb`는 `modeled.minChildHeapMb` 내에서 어떤 파티션도 모델링될 수 없을 때도 추가로 `null` — 풀이 해당 바닥에서 하나의 자식을 커버할 수 없거나, 상한이 `modeled.legacyChildCeilingMb`에서 제한되면 바닥 아래로 떨어지기 때문이며, 이는 `floor(available / 2)`이므로 1024 MB 미만의 호스트에서 바닥 아래로 떨어집니다. 절대 0이 아니며, `maxConcurrentChildren`은 그러한 경우에 `0`입니다. 파티션을 모델링하지 않는 호스트는 부재한 모델이 아닌 계산된 답변이기 때문입니다; 그리고 `refusals`, 모델링된 제한을 초과했을 생성), `configuredBudgetMb`, `effectiveBudgetMb`(해결된 cgroup/호스트 메모리에서 제한된 구성된 값), `budgetSource`(`flag` / `derived`), `availableMemoryMb`, `availableMemorySource`(`constrained` / `host`), `insufficientMemory`, 그리고 `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb`, `legacyChildCeilingMb`를 포함하는 `modeled` 객체(오늘날 ACP 자식이 받는 상한의 보수적 모델로, 실제 수치 아래에 있을 수 있음). `runtime.memory`는 추가로 `registeredWorkspaces`(등록 카운트 — 배수 중, 전환 중, 또는 차단된 항목을 포함한 제거되지 않은 워크스페이스 항목; 라이브 자식 카운트가 아님), `activeAcpChildren`(라이브, 비죽는 채널을 가진 데몬 관리 ACP 자식 — 전환 중 또는 차단된 항목을 포함하지만, 자식이 종료되지 않았더라도 kill이 시작된 워크스페이스는 제외; 채널 워커, MCP 하위 또는 미attach 생성 예약이 아님), `childRssCoverage`(`active_children` — 라이브 채널을 가진 모든 ACP 자식으로, `activeAcpChildren`이 카운트하는 집합; 이전 데몬은 `primary_only`를 전송), 아래에 설명된 `children` 객체, 그리고 `recommendedShareAtRegisteredMb`(등록된 워크스페이스가 없을 때 `null`)와 `recommendedShareAtActiveMb`(활성 자식이 없을 때 `null`)를 포함하는 `modeled` 객체를 보고합니다. 각 공유는 레거시 자식 상한에서 캡되고, 상한이 허용할 때만 최소 자식 힙에서 바닥값이 적용됩니다 — 작은 호스트에서는 상한이 바닥 아래에 위치하므로 공유 × 개수가 자식 풀을 초과할 수 있습니다. 공유를 풀의 분할이 아닌 조언으로 읽으세요. 이 모든 것은 관찰입니다: 이러한 값에서 파생되는 자식 생성 인수가 없으며, 이를 기반으로 거부되는 요청도 없습니다. `childHeap`은 `modeled.childPoolMb`의 고정 파티션을 모델링합니다 — 모든 자식이 동일한 `perChildCeilingMb`를 받으므로, 모델링된 총계는 생성별 공유가 누적되는 대신 풀 내부에 유지됩니다. `refusals`를 수용 압력으로만 읽으세요: 카운트 0이 파티션 적용이 안전하다는 것을 의미하지 **않습니다**. 자식은 훨씬 더 큰 호스트 파생 상한에서 실행되므로, `perChildCeilingMb`보다 많은.old space가 필요한 워크로드가 여기서는 건강하며 파티션이 적용되어야만 실패하기 때문입니다. 0이 아닌 카운트가 용량 압력을 의미하지 않는 두 가지 추가 이유가 있습니다: 수용 결정은 종료 중 자식이 종료될 때까지 카운트하므로, 이미 `maxConcurrentChildren`에 도달한 데몬에서는 모든 채널 교체 동안 중복 창에서 거부를 기록합니다; 그리고 파티션을 모델링하기엔 너무 작은 호스트에서는 `maxConcurrentChildren`이 `0`이므로 `refusals`는 총 ACP 생성 카운트와 같으며, `insufficientMemory`가 이를 설명하는 필드입니다. 일반 `runQwenServe` 경로에서는 부트스트랩 앱이 생성되기 전에 예산이 해결되므로, `limits.memory`는 부트스트랩 창 동안 이미 채워져 있습니다. 예산을 해결하지 않는 경로(예: `runQwenServeImpl`을 우회하는 direct-embed)에서만 `null`입니다. SDK 타입은 `null`을 허용하므로 올바른 클라이언트는 처리합니다.

`runtime.memory.children`은 해당 블록 내에서 부가적이며 `childRssCoverage`가 지목하는 자식들의 집계 RSS를 보고합니다: `rssBytes`(자체 보고 RSS의 합계), `sampled`(읽기를 생성한 수), 그리고 `oldestReadingAgeMs`(합계에서 가장 오래된 읽기의 경과 시간으로, 호출자가 부분들이 얼마나 떨어져 취해졌는지 알 수 있음). `sampled`의 분모는 형제 `activeAcpChildren`이며 블록 내에서 반복되지 않습니다; `sampled`가 더 낮을 때 `rssBytes`는 총계가 아닌 하한입니다. 샘플링은 활성 SSE/WS 워처에 따라 결정되므로, 아무도 스트리밍하지 않는 데몬에 대한 상태 요청은 라이브 자식이 있더라도 `sampled: 0`을 보고합니다 — 옆의 `activeAcpChildren`이 그 간격을 보이게 하며, `sampled: 0`일 때 `rssBytes: 0`은 측정된 0을 의미하지 않습니다. `oldestReadingAgeMs`는 아무것도 샘플링되지 않았을 때와 모든 기여자가 해당 필드 이전의 브리지일 때 모두 `null`이므로, "신선함"을 의미하지 않습니다. 합계를 과소 및 과대 카운드로 동시에 읽으세요: 프로세스별 RSS를 합산하면 자식들이 공유하는 페이지가 이중 카운트되고, 각 자식은 자체 프로세스만 보고하므로 MCP 하위와 모든 채널 워커가 누락됩니다. 데몬 트리의 메모리가 아닙니다. 이 필드는 SDK 미러에서 선택 사항입니다. `primary_only`를 보고하는 데몬은 절대 전송하지 않기 때문입니다.

`runtime.memory.children.heap`은 해당 블록 내에서 부가적이며 각 ACP 자식의 생애 V8 old-generation 고수위 마크를 보고하며, **합계가 아닌 최댓값**으로 집계됩니다: `peakOldGenerationBytes`, `peakLiveSetBytes`, `peakTotalHeapBytes`, `majorGcCount`, `majorGcMs`, `unclassifiedSpaceNames`, 그리고 `reported`. 힙 상한은 자식별로 적용되며 피크는 서로 다른 시점에 도달했으므로, 총계는 어떤 질문에도 답할 수 없습니다; 각 필드는 보고하는 자식들의 독립적인 최댓값이며, 한 자식의 초상화가 아니고, 자식별 상한은 각 축에 대해 단독으로 판단됩니다. `reported`는 `sampled` 중 몇 개가 기여했는지를 카운트하며, 일부 자식이 필드 이전일 때 더 낮습니다. 모든 바이트 수치는 **old generation**을 커버합니다 — `--max-old-space-size`가 실제로 제한하는 것 — `old_space`만이 아닙니다. 자식이 `old_space`가 수 메가바이트일 때도 `large_object_space`가 모든 것을 보유하면서 상한을 소진할 수 있기 때문입니다. `peakOldGenerationBytes`는 커밋된 바이트이며 자식에 주어진 상한에 따라 상승하므로, 워크로드가 필요로 하는 것의 상한으로 읽어야지 요구 사항으로 읽으면 안 됩니다; `peakLiveSetBytes`는 major GC에서 생존하는 것이며 상한과 함께 이동하지 않습니다. 이것이 자식이 하나에 맞지 않을 수 있다고 말할 수 있는 수치인 이유입니다. GC 항목이 비동기적으로 도착하고 컬렉션과 읽기 사이에 할당된 모든 것이 카운트되므로, 정확한 라이브 세트가 아닌 상한으로 읽으세요. `peakLiveSetBytes`는 major GC가 관찰될 때까지 `0`이며, 이는 부재이지 측정이 아닙니다. `unclassifiedSpaceNames`는 보고하는 어떤 자식도 분류할 수 없었던 힙 공간의 합집합입니다; V8은 버전 간에 공간을 이름 변경하고 추가하므로, 알 수 없는 공간은 합계에서 삭제되고 삭제하면 과소 카운트됩니다 — 따라서 비어 있지 않은 배열은 바이트 수치가 불완전하며 전체 측정으로 읽으면 안 된다는 것을 의미합니다. 전체 객체는 샘플링된 어떤 자식도 보고하지 않았을 때 `null`이며, 영 객체가 아닙니다; SSE/WS 워처가 attach되지 않으면 아무것도 샘플링되지 않으므로, 이는 엣지 케이스가 아닌 일상적인 상태입니다. 이 모든 것은 관찰입니다: 여기서 아무것도 자식의 크기를 결정하지 않고, 생성을 거부하지 않으며, `limits.memory.enforced`를 `false`에서 이동시키지 않습니다.

`runtime.memory.pressure`는 해당 블록 내에서 부가적이며 데몬 루트 프로세스 자체의 메모리 압력을 보고합니다: `mode`(`off` / `observe`), `level`(`normal` / `soft` / `hard` / `critical`), `source`(`rss` / `heap` / `unknown`), `ratio`, 그리고 비율이 파생되는 여섯 개의 원시 수치 — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio`는 `rssRatio`와 `heapRatio` 중 더 큰 값이며, `source`는 어느 쪽이었는지의 이름입니다; 동점은 `rss`로 보고됩니다. `availableBytes`는 바이트 단위의 `limits.memory.availableMemoryMb`입니다 — 의도적으로 `effectiveBudgetMb`가 아닌 감지된 cgroup/호스트 수치인데, 프로세스를 종료시키는 것은 운영자의 정책 수치가 아닌 실제 제한이기 때문입니다. `source: "unknown"`은 어떤 분모도 측정 가능하지 않았음을 의미하며 건강으로 읽으면 안 됩니다; `level`은 분류할 것이 없기 때문에 해당 경우에만 `normal`입니다. 수치는 데몬 **루트 프로세스만**을 커버합니다: 이 프로세스 자체의 `memoryUsage()`이므로 자식의 성장은 이 수치를 이동시키지 않습니다. `runtime.memory.children`이 이를 별도로 보고하며, 어떤 수치도 프로세스 트리 메모리가 아닙니다. 두 모드 모두 전체 블록을 보고합니다; `observe`만 추가로 경로 없는 `daemon_memory_pressure` 경고를 상태 롤업으로 올리므로, `off`는 최상위 `status`를 변경하지 않은 상태로 둡니다. 어떤 모드에서도 remediation이 없습니다. 이 필드는 SDK 미러에서 선택 사항입니다. 해당 필드 이전에 `runtime.memory`를 전송한 데몬이 해당 필드 없이 블록을 전송하기 때문입니다.

`limits.maxTotalSessions`은 부가적입니다. `null`은 효과적인 데몬 전체의 신규 세션 상한이 비활성화됨을 의미합니다. 여러 시작/복원된 워크스페이스가 존재할 때, `--max-total-sessions`가 생략되고 `maxSessionsPerWorkspace`가 유한하면, 데몬은 효과적인 총 상한을 `maxSessionsPerWorkspace * startupWorkspaceCount`로 한 번 도출합니다; 이후 동적 등록은 이를 재계산하지 않습니다. 설정되면, 데몬 전체의 신규 세션 생성을 제한하며 기존 `session_limit_exceeded` 오류 형태에 `scope: "total"`을 추가하여 보고합니다.

`runtime.channel.live`는 데몬 내부의 ACP 브리지 채널을 보고합니다.
채널 어댑터 워커가 아닙니다. 데몬 관리 채널은
`runtime.channelWorker`를 사용하며, `state`는 `disabled`, `starting`,
`running`, `exited`, `failed`, `stopped` 중 하나입니다. 워커가 `running`에
도달한 후 종료되면, `/daemon/status`는 데몬을 온라인 상태로 유지하고
경고 이슈 코드 `channel_worker_exited`를 보고합니다.

데몬 관리 채널 워커 시작은 여전히 실패 시 즉시 중단됩니다: `qwen serve
--channel ...`이 ready에 도달하는 워커를 시작할 수 없으면, serve 시작이
실패합니다. 워커가 ready에 도달한 후, 예기치 않은 종료는 serve
슈퍼바이저가 제한된 정책 내에서 재시작합니다: 5분 창 내에서 최대 3회의
재시작 시도, 1초, 5초, 15초 백오프. 워커는 15초마다 IPC 하트비트를
전송합니다; 45초 동안 하트비트가 관찰되지 않으면, 슈퍼바이저는 워커를
오래된 것으로 간주하고, kill하고, `staleHeartbeatAt`을 기록하며, 동일한
재시작 경로를 사용합니다.

`runtime.channelWorker`는 부가적인 운영 필드를 포함할 수 있습니다:
`requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`,
`restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`,
`lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures`, 그리고
`startupFailuresTruncated`. 각 시작 실패는 `channel`, `phase`
(현재 `connect`), 선택적 어댑터 제공 `code`, 그리고 자격 증명
편집된 `message`를 가집니다. 현재 워커 세대에 대해 최대 64개의 실패가
보관됩니다; truncation 플래그는 더 많은 실패가 관찰되었음을 의미합니다.
`code`는 진단용이며 안정적인 크로스 어댑터 분류가 아닙니다. `restartCount`는
이 serve 프로세스가 수행한 재시작 시도의 생애 수입니다; `restartCount > 0`인
실행 중인 워커는 다른 이슈가 적용되지 않는 한 건강합니다. `requestedChannels`에
`channels`에 없는 이름이 포함된 실행 중인 워커는
`channel_worker_partial_connect`를 보고합니다.

멀티 워크스페이스 데몬(`--workspace` 반복)에서, `runtime`은 추가로
`channelWorkers[]`를 포함합니다 — 소유 워크스페이스당 하나의 항목으로,
각각 `workspaceId`, `workspaceCwd`, `primary`로 주석이 달린
`channelWorker` 스냅샷입니다. `channelWorker`는 호환성을 위해
기본 워크스페이스의 스냅샷으로 계속 채워집니다. 단일 워크스페이스
데몬은 `channelWorkers[]`를 생략합니다.

### 데몬 관리 채널 제어

`channel_control` 기능은 런타임 선택 리소스를 광고합니다.
리소스는 데몬 전체이지만, 호환성 경로는 단수 `/workspace`
접두사를 사용합니다. 런타임 선택은 지속되지 않으며 데몬의 부트 시
`--channel` 옵션을 수정하지 않습니다.

`GET /workspace/channel`은 불변 매니저 스냅샷을 반환합니다:

```json
{
  "enabled": true,
  "selection": { "mode": "names", "names": ["telegram", "feishu"] },
  "pendingSelection": { "mode": "names", "names": ["telegram"] },
  "transition": "reconciling",
  "workers": [
    {
      "workspaceId": "primary-id",
      "workspaceCwd": "/work/primary",
      "primary": true,
      "enabled": true,
      "state": "running",
      "channels": ["telegram"],
      "pid": 1234
    }
  ]
}
```

`selection`은 비활성화 상태에서 `null`입니다. `pendingSelection`은
변경 중에만 존재합니다. `transition`은 `idle`, `starting`, `reconciling`,
`stopping`, `rolling_back` 중 하나입니다.

`PUT /workspace/channel`은 strict-gated이며 정확히 하나의 선택을 수용합니다:

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

이름은 정렬 없이 trim되고 중복 제거됩니다; 빈 이름 배열은
유효하지 않습니다. `all`은 여전히 기본 워크스페이스 전용입니다. 비활성에서
활성으로의 변경은 `201`을 반환합니다; 멱등 PUT 또는 교체는 `200`을
반환합니다. 응답은 `{ changed, replaced, partial, state }`입니다. 동일한
선택은 건강한 워커를 그대로 유지하지만, 워커가 중지되었거나 실패한
동일한 선택은 복구합니다.

`DELETE /workspace/channel`은 strict-gated이며 멱등입니다. `{ changed, state }`를
반환합니다; 성공적인 상태는 비활성입니다. `POST
/workspace/channel/reload` 또한 strict-gated이며 설정을 다시 읽고,
워크스페이스 그룹을 재해석하며, 커밋된 선택을 강제 조정합니다.

비활성화 상태에서 `409 channel_worker_not_enabled`를 반환합니다.
`channel_reload` 기능은 매니저가 커밋된 reloadable 선택을 가진 동안에만
동적으로 광고됩니다.

모든 enable, replace, reload, stop, 데몬 종료는 하나의 FIFO
라이프사이클 레인에 진입합니다. GET은 해당 레인을 기다리지 않습니다.
정렬된 선택이 변경되지 않은 워크스페이스 그룹은 온라인 상태를 유지합니다.
교체 실패는 새로 시작된 워커를 중지하고 이전 커밋된 선택을 복원하려고
시도합니다. 클라이언트는 `rolledBack`, `rollbackError`, `state`를
검사해야 합니다. 정리 또는 복원도 실패할 수 있기 때문입니다. 데몬은
트랜잭션 전체 동안 채널 서비스 PID 리스를 유지하며 모든 관련 자식
종료가 확인될 때까지 해제하지 않습니다.

안정적인 제어 오류:

- `400 invalid_channel_selection`, `channel_workspace_mismatch`, 또는 `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict` 또는 `channel_worker_not_enabled`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`, `rolledBack`과 선택적 자격증명 편집 `rollbackError` 포함
- `503 daemon_draining`

구성된 토큰 없는 데몬에 대한 strict write는 제어 코드 실행 전
`401 token_required`를 반환합니다. 요청이 시작되면, HTTP 클라이언트
연결 해제는 라이프사이클 트랜잭션을 취소하지 않습니다; 클라이언트는
동일한 PUT을 안전하게 재시도할 수 있습니다.

`502 channel_worker_start_failed`의 경우, 응답은 추가로
`startupFailures[]`와 `startupFailuresTruncated`를 포함할 수 있습니다.
각 실패는 시도된 워커의 신뢰된 `workspaceCwd`를 추가합니다. 이 필드는
실패한 트랜잭션을 설명하며, `state`는 롤백 후 현재 상태를 설명합니다;
이후 GET은 실패한 시도를 유지하지 않습니다. 부분적으로 연결된 워커는
대신 성공을 반환하고 워커 스냅샷에서 실패를 노출합니다. 부트 시
전체 실패는 여전히 쿼리 가능한 데몬이 존재하기 전에 `qwen serve`를
중단합니다.

`--daemon-url` 없는 `qwen channel status`는 계속 pidfile 메타데이터를
읽습니다; `--daemon-url`과 함께는 `GET /workspace/channel`을 읽습니다.
재시작 창 동안 serve 소유 pidfile은 예약된 상태로 유지되지만,
`workerPid`는 생략되어 클라이언트가 오래된 워커 프로세스를 표시하지
않습니다. 멀티 워크스페이스 데몬에서 pidfile은 추가로 부가적인
`workers[]` 배열(워크스페이스별 `workspaceId` / `workspaceCwd` /
`channels` / 라이브 `workerPid`)을 포함하며, 최상위 `channels`(합집합)과
`workerPid`(기본)는 이전 리더를 위해 계속 채워집니다; 단일 워크스페이스
데몬은 원래의 단일 워커 형태를 유지합니다. 워커 stdout/stderr은
bearer 토큰, 민감한 워커 환경 값, 프록시 URL 자격 증명이 편집되어
데몬 로그로 전달됩니다.

### 워크스페이스 채널 관리

`channel_management` 기능은 워크스페이스 범위의 Channel
구성 및 런타임 관리를 광고합니다. 단수 `/workspace` 라우트는
기본 런타임을 대상으로 합니다. `/workspaces/:workspace`는 정확히 등록된
신뢰된 런타임을 해석하며 기본 런타임으로 폴백하지 않습니다.

읽기 전용 발견은 다음을 사용합니다:

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`

카탈로그는 이 관리 API에서 지원하는 타입을
`manageable: true`로 표시합니다. 인스턴스 스냅샷은 리비전, 편집된 시크릿
존재 메타데이터, 시작 상태, 런타임 상태를 포함합니다; 리터럴 시크릿은
절대 반환되지 않습니다. Channel 스냅샷은 `Cache-Control: no-store`를
사용합니다.

필드 디스크립터는 `properties`를 통해 중첩된 객체 메타데이터를 노출할 수
있습니다. 숫자 디스크립터는 열린 하한에 `exclusiveMinimum`을 사용할 수
있습니다. 광고된 필드 kind를 렌더링하지 않는 클라이언트는 기존 구성
값을 강제 변환하거나 삭제하지 않고 보존해야 합니다. 객체 필드는 필수일
수 없으며, 중첩된 속성은 시크릿 또는 환경 해석 가능 필드일 수 없습니다;
해당 관리 프로토콜은 최상위 레벨만 유지됩니다. 중첩된 `required` 속성은
부모 객체가 write에 존재하는 동안에만 적용됩니다; 부모 객체를 생략하면
중첩된 요구사항이 검사되지 않습니다. Write는 각 필드의 저장된 값을
전체적으로 교체하므로, 객체를 보존하려면 저장된 객체를 다시 전송해야
합니다; 데몬은 부분 객체를 병합하지 않습니다.

구성 write는 낙관적 동시성 제어와 strict bearer-token 게이트를
사용합니다:

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- 동등한 `/workspaces/:workspace/...` 라우트

각 설정 변경은 `expectedRevision`을 포함합니다. Upsert 요청은
`config` 객체를 포함하며 명시적 시크릿 작업을 포함할 수 있습니다:
`preserve`, `replace`, 또는 `clear`. Channel 구성은 해석된 워크스페이스
외부의 작업 디렉토리를 선택할 수 없습니다.

런타임 액션은 `.../channels/:name/start`, `stop`, `restart`에 대한
strict-gated `POST` 요청입니다. 해석된 워크스페이스가 소유한
워커에서만 작동합니다.

페어링 관리는 `pairing` sender 정책 또는 그룹 정책으로 구성된
인스턴스에서만 사용 가능합니다:

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` with `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` with

  `{ "senderId": "..." }` 또는 `{ "groupId": "..." }`

모든 페어링 라우트는 bearer 토큰이 필요하며 `Cache-Control: no-store`를
사용합니다. 요청, 승인, 취소는 선택된 Channel 인스턴스와 워크스페이스로
범위 지정됩니다. 대기 중인 요청은 타입화된 사용자 또는 그룹 주체를
포함합니다; 그룹 요청은 또한 요청을 시작한 sender를 유지합니다. 승인
스냅샷은 `senderIds`와 `groupIds`를 포함합니다. 허용 목록은
표시 이름을 유지하지 않기 때문입니다. 알 수 없는 사용자 또는 그룹의
취소는 `404 channel_pairing_approval_not_found`를 반환합니다.

### Channel 전송 및 Notify

`channel_delivery`는 즉각적인 best-effort 전송 지원을 광고합니다.
프로토콜 기능이지, 워커 건강 신호가 아닙니다. 전송은 누락된 워커를
시작하지 않고, 다른 워크스페이스로 폴백하지 않으며, 재시도하지 않고,
outbox를 지속하거나, 과거 알림을 리플레이하지 않습니다.

Direct Notify는 Agent와 Session을 우회하고 한 번의 전송 시도를
기다립니다:

```http
POST /workspace/notify
POST /workspaces/:workspace/notify
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "service unavailable",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

두 라우트 모두 strict mutation 게이트를 사용합니다. 정규 라우트는
등록된 신뢰된 워크스페이스만 해석합니다. 성공은 `200 {delivered:true,deliveryId}`입니다.
`delivered:true`는 Channel send Promise가 resolve되었음을 의미합니다;
provider 수용, 사용자 수신, 또는 읽기 영수증을 증명하지 않습니다.
Provider별 응답 검증과 IM 어댑터 간 일관된 오류 이유 의미는
이 V1 계약의 범위를 벗어납니다.
오류는 `400 channel_delivery_invalid`, `503 channel_worker_unavailable` 또는
`channel_delivery_queue_full`, `504 channel_delivery_timeout`, 그리고 `502
channel_delivery_rejected` 또는 `channel_delivery_failed`입니다. 타임아웃은
알 수 없는 결과를 가지며 재시도되지 않습니다.
별도의 연결 테스트 엔드포인트가 의도적으로 없습니다: 일반
Notify 호출이 엔드투엔드 테스트입니다.

리플레이 가능한 결과 이벤트는 상관 관계와 정리된 상태만 포함합니다:

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "failed",
    "promptId": "prompt-1",
    "code": "channel_worker_unavailable",
    "error": "Channel worker is not running."
  }
}
```

빈 성공적인 Prompt final은 오류 필드를 생략합니다:

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "skipped",
    "promptId": "prompt-1"
  }
}
```

`source`는 `prompt` 또는 `scheduled`입니다; `status`는 `delivered`, `failed`,
`skipped`입니다. `skipped`는 eligible 턴이 성공적으로 완료되었지만
마지막 도구 없는 어시스턴트 응답 블록이 비어 있거나 공백만
포함되었음을 의미합니다. 데몬은 전송 인증을 소비하고 Channel Worker를
해결하지 않고 이벤트를 게시합니다. Scheduled 상관 관계는 `taskId`와
`firedAt`을 사용합니다. 이벤트는 절대 대상 ID, 메시지 텍스트, 자격 증명,
또는 webhook 시크릿을 포함하지 않습니다.

보안: 응답은 bearer 토큰, 클라이언트 ID, 전체 ACP 연결 ID,
device-flow 사용자 코드, 또는 검증 URL을 절대 포함하지 않습니다. 두
세부 수준 모두 부가적인 `daemon.runId`, `daemon.logMode`,
`daemon.logHealth`를 포함할 수 있습니다. `summary`는 데몬 로그 경로와
손실 세부 사항을 생략합니다; `full`은 인증된 운영자를 위해
`logPath`, `logIssues`, `logDroppedRecords`, `logDroppedBytes`를 포함할
수 있습니다. 저하된 파일 로깅은 경로 없는 `daemon_log_degraded`
경고를 일반 상태 롤업에 추가합니다.

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": [
    "health",
    "daemon_status",
    "capabilities",
    "multi_workspace_sessions",
    "..."
  ],
  "limits": {
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 64,
    "sessionRestoreTimeoutMs": 60000
  },
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/primary-workspace",
  "workspaces": [
    {
      "id": "stable-workspace-id",
      "cwd": "/canonical/path/to/primary-workspace",
      "primary": true,
      "trusted": true
    },
    {
      "id": "stable-secondary-workspace-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "primary": false,
      "trusted": true
    }
  ]
}
```

안정적 계약: `v`가 증가하면 프레임 레이아웃이 하위 호환성 깨짐 방식으로 변경된 것입니다.

> **`protocolVersions`** 는 데몬이 지원하는 serve 프로토콜 버전을 설명합니다. `current`는 데몬의 선호 프로토콜 버전이고 `supported`는 호환 가능한 집합입니다. 특정 프로토콜이 필요한 클라이언트는 `supported`를 확인해야 합니다; 기능별 UI는 여전히 `features`를 기준으로 게이트해야 합니다. v=1에 추가됨: 이전 v=1 데몬은 이 필드를 생략하므로, 이전 빌드를 대상으로 하는 SDK 클라이언트는 이를 선택 사항으로 취급해야 합니다.

> **`modelServices`는 Stage 1에서 항상 `[]`입니다.** 에이전트는 단일 기본 모델 서비스를 사용하며 이를 유선으로 열거하지 않습니다. Stage 2에서는 등록된 모델 어댑터에서 이를 채워 SDK 클라이언트가 서비스 선택기를 구축할 수 있게 합니다; 그전까지는 이 필드가 비어 있지 않다고 가정하지 **마세요**.

> **`workspaceCwd`** 는 데몬의 기본 워크스페이스에 대한 정규 절대 경로입니다. `POST /session`에서 `cwd`를 생략할 때 사용합니다(해당 라우트는 이 기본 경로로 폴백) 그리고 이전 단일 워크스페이스 클라이언트와의 호환성을 유지합니다. v=1에 추가됨: §02 이전 v=1 데몬은 이 필드를 생략합니다 — 이전 빌드를 대상으로 하는 클라이언트는 소비 전에 null 확인을 해야 합니다.

> **`workspaces[]`** 는 등록된 모든 런타임을 나열합니다. 최신 단일 워크스페이스 데몬은 `multi_workspace_sessions`가 없을 때도 기본 런타임을 포함하므로 클라이언트가 워크스페이스 한정 라우트에 필요한 안정적 id를 발견할 수 있습니다; 이전 데몬은 이 배열을 생략할 수 있습니다. 각 항목은 `{ id, cwd, displayName?, primary, trusted, removable? }`입니다. `displayName`은 프레젠테이션 전용이며 미설정 시 생략됩니다. 첫 번째/기본 워크스페이스는 여전히 `workspaceCwd`에 미러링됩니다; 새 클라이언트는 해당 항목의 `cwd`를 `POST /session`에 전달하여 기본이 아닌 런타임을 선택합니다. 신뢰되지 않는 워크스페이스는 진단용으로 광고되지만 신뢰가 변경될 때까지 새 세션 생성을 `403 untrusted_workspace`로 거부합니다. `removable`는 런타임 제거를 지원하는 데몬에 존재하며 프로세스 동적 또는 영구성 복구된 보조 런타임에 대해서만 true입니다.

워크스페이스 기능 태그와 `workspaces[]`는 동적입니다. 워크스페이스를 추가하는 클라이언트는 변경 완료 후 `/capabilities`를 다시 가져와야 합니다; 데몬은 이전 응답을 캐시한 클라이언트에게 기능 변경을 브로드캐스트하지 않습니다. 포겟팅 영구성은 활성 런타임을 언로드하지 않으므로 해당 런타임은 재시작까지 광고된 상태로 유지됩니다.

### `POST /workspaces`

추가 워크스페이스 런타임을 등록합니다. 경로는 기존에 접근 가능한 절대 디렉토리여야 하며 다른 등록된 워크스페이스와 중복되거나 중첩되면 안 됩니다. 클라이언트가 `persist: true`를 전송하지 않는 한 등록은 프로세스 로컬입니다; 클라이언트는 영구성을 요청하기 전에 `persistent_workspace_registration`을 프리플라이트해야 합니다. `workspace_display_name`이 광고될 때 요청은 선택 사항인 `displayName`도 포함할 수 있습니다.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

새로 생성된 런타임은 `201`을 반환합니다; 이미 활성인 보조 워크스페이스를 영구적으로 승격하면 `200`을 반환합니다. 영구성 성공은 `persisted: true`를 포함합니다:

```json
{
  "id": "stable-workspace-id",
  "cwd": "/canonical/path/to/secondary-workspace",
  "displayName": "Payments Production",
  "primary": false,
  "trusted": true,
  "persisted": true
}
```

`displayName`은 주변 공백이 트리밍된 후 256자를 초과할 수 없는 문자열입니다. 빈 결과는 이름 없음으로 취급되며, 내부 C0(`U+0000`–`U+001F`) 또는 DEL(`U+007F`) 제어 문자는 거부됩니다. JSON `null`은 생성 값이 아니며 `400 invalid_display_name`을 반환합니다; 초기 이름을 제공하지 않으려면 필드를 생략하세요. 중복 표시 이름은 허용됩니다. 프로세스 로컬 등록과 함께 제공된 이름은 해당 데몬 프로세스 동안만 지속됩니다; `persist: true`는 재시작 후 복구할 수 있도록 영구성 등록과 함께 저장합니다. 이미 영구적인 워크스페이스에 대해 요청을 반복하면 멱등적이며 이름을 변경하지 않습니다.

오류는 `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached`, `500 workspace_registration_store_error` / `runtime_creation_failed`, 그리고 `501 persistence_not_available` / `not_implemented`를 포함합니다.

### `PATCH /workspaces/:workspace`

워크스페이스 ID 또는 URL 인코딩된 절대 cwd로 선택된 활성 워크스페이스 리소스를 업데이트합니다. 이 엔드포인트는 현재 표시 이름 메타데이터만 지원합니다:

```json
{ "displayName": "Payments Production" }
```

이름을 지우려면 `{ "displayName": null }`을 전송하세요. 여기서 `null`은 업데이트 전용 삭제 센티널입니다; null이 아닌 값은 `POST /workspaces`와 동일한 문자열 정규화 규칙을 따릅니다. 응답은 업데이트된 `{ id, cwd, displayName?, primary, trusted, removable? }` 워크스페이스 프로젝션입니다. 런타임 메타데이터는 항상 업데이트됩니다. 런타임에 일치하는 영구성 등록 아이덴티티가 있는 경우 모든 별칭이 기존 스키마 v1 등록 저장소를 통해 원자적으로 업데이트됩니다; 이 엔드포인트는 영구성 등록을 생성하거나 승격하지 않습니다.

지원되지 않는 필드는 조용히 무시되지 않고 안전하게 실패합니다. 오류는 `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, 그리고 `503 daemon_shutting_down`을 포함합니다.

### `DELETE /workspaces/:workspace`

제거 가능한 보조 런타임 하나를 제거합니다. 선택자는 복수 워크스페이스 라우팅 규칙을 따르며 워크스페이스 ID 또는 URL 인코딩된 절대 cwd를 허용합니다. 선택적 JSON 본문은 `{ "force": boolean }`입니다; 생략하면 비강제 제거를 요청합니다.

비강제 제거는 고정된 런타임에 세션, 프롬프트, 대기 중인 시작, ACP 연결, 메모리 작업, 또는 워크스페이스 채널 워커가 있을 때 `409 workspace_busy`를 `activity` 스냅샷과 함께 반환합니다. `{ "force": true }`를 전송하면 해당 리소스의 종료를 요청합니다. 영구성 제거가 커밋 지점입니다: 후속 정리는 제한적이고 최선 노력이며, 정리 실패는 기록되고, 논리적 제거는 런타임을 복구하지 않고 수렴합니다. 성공적인 응답은:

```json
{
  "removed": true,
  "workspaceId": "stable-workspace-id",
  "workspaceCwd": "/canonical/path/to/secondary-workspace",
  "forced": true,
  "persistedRegistrationRemoved": true,
  "activity": {
    "sessions": 2,
    "activePrompts": 1,
    "pendingSessionStarts": 0,
    "acpConnections": 1,
    "memoryTasks": 0,
    "channelWorkers": 0,
    "voiceSessions": 0
  }
}
```

즉시 바쁜 비강제 요청은 빠른 사전 드레인 activity 스냅샷을 반환합니다. 드레인이 시작되면 busy 또는 success 응답은 어드미션 및 ACP 드레인 게이트가 닫힌 후, 정리가 시작되기 전에 찍은 최종 스냅샷을 포함합니다. 오류는 `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, 그리고 `503 daemon_shutting_down`을 포함합니다.

### `GET /workspace-registrations`

이 기본 워크스페이스에 대한 영구적 원하는 워크스페이스 집합을 나열합니다. 현재 시작 중에 저장된 디렉토리를 복구할 수 없었던 항목은 `active: false`로 표시됩니다.
런타임이 아직 활성 리소스를 소유하고 있으므로 제거가 완료될 때까지 항목은 `active: true`로 유지됩니다.
항목은 영구성 등록에 표시 이름이 있을 때 선택적인 `displayName`을 포함합니다.

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/canonical/path/to/primary-workspace",
  "entries": [
    {
      "id": "stable-registration-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "active": true,
      "persisted": true
    }
  ]
}
```

등록 저장소가 구성되지 않았을 때 `501 persistence_not_available`를 반환하고 저장소를 읽을 수 없을 때 `500 workspace_registration_store_error`를 반환합니다.

### `DELETE /workspace-registrations/:id`

영구성 등록 하나를 잊습니다. 활성 런타임을 언로드하거나 세션을 종료하지는 않습니다; `restartRequired: true`는 다음 데몬 재시작 시 활성 런타임이 사라짐을 의미합니다.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

`404 workspace_registration_not_found`, `500 workspace_registration_store_error`, 또는 `501 persistence_not_available`를 반환합니다. 다른 변형 라우트와 마찬가지로 이 엔드포인트는 데몬 인증이 활성화되어 있을 때 변형 인증을 요구합니다.

### 읽기 전용 런타임 상태 라우트

이 라우트들은 데몬 측 런타임 스냅샷을 보고합니다. 추가적 v1 라우트이며,
상태를 변경하지 않으며, serve 프로토콜 버전을 변경하지 않습니다. 워크스페이스
상태 라우트는 클라이언트가 GET 라우트를 폴링한다고 해서 ACP 자식 프로세스를
시작하지 **않습니다**: 데몬이 유휴 상태이면 `initialized: false`와 빈
스냅샷을 반환합니다. 세션 상태 라우트는 활성 세션을 요구하며 알 수 없는
id에 대해 `404 { code: "session_not_found", ... }`를 반환합니다.

기능 태그:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_monitor_tool_correlation` → `GET /session/:id/tasks`의 모니터 항목에
  트랜스크립트-작업 상관을 위한 `toolUseId` 포함
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` 및 `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` 및 `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status`는 기본 워크스페이스 ACP 채널의
시점 활성 상태를 `{ channelLive: boolean }`로 보고합니다. 핸들러는
채널을 생성하지 않지만 런타임 라우트에 도달하면 지연된 데몬
런타임이 먼저 시작될 수 있으며, 해당 구성된 시작 정책이 독립적으로 ACP를
예열할 수 있습니다. 스냅샷은 리스가 아닙니다: 클라이언트는 세션 생성이
재검증하거나 시작하도록 해야 합니다.

### ACP 예열

기능 태그: `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N`은 최선 노력으로 기본
워크스페이스 ACP 채널을 초기화합니다. `timeoutMs`는 기본값 5000이며
60000을 초과하지 않는 양의 정수여야 합니다. 동시 호출자와 세션 생성은
동일한 브리지 초기화를 공유합니다. 요청 타임아웃은 해당 HTTP 대기만
종료합니다; 공유 초기화를 취소하지는 않습니다.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready`는 항상 `channelLive`와 동일합니다. 활성 응답은 `reason`과
`error`를 생략합니다; 그렇지 않으면 `reason`은 `timeout` 또는 `error`입니다. `durationMs`는
현재 HTTP 호출을 측정하며, 호출이 합류한 초기화의 전체 수명이 아닙니다.
운영 타임아웃 또는 실패는 HTTP 200을 반환합니다. 잘못된 `timeoutMs`는
400을 반환하며, 인증, 속도 제한, 지연된 런타임 실패는
일반 응답을 유지합니다.

두 ACP 워크스페이스 라우트 모두 단수형이며 기본 워크스페이스 전용입니다. 클라이언트는
보조 워크스페이스에 대해 이를 사용하거나 두 응답 중 어느 것도
내구성 있는 준비 보장으로 해석해서는 안 됩니다.

공통 상태 셀:

```ts
type DaemonStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'not_started'
  | 'unknown';

type DaemonErrorKind =
  | 'missing_binary'
  | 'blocked_egress'
  | 'auth_env_error'
  | 'init_timeout'
  | 'restore_timeout'
  | 'protocol_error'
  | 'missing_file'
  | 'parse_error';

interface DaemonStatusCell {
  kind: string;
  status: DaemonStatus;
  error?: string;
  errorKind?: DaemonErrorKind;
  hint?: string;
}
```

`errorKind`는 `/workspace/preflight`,
`/workspace/env`, 그리고 (결국) MCP 가드레일이 공유하는 폐쇄형 열거형으로, SDK 클라이언트가
자유 형식 메시지를 파싱하는 대신 카테고리별 수정을 렌더링할 수 있습니다. 원래
7개의 상태 리터럴은 #4175에서 유래했습니다; `restore_timeout`은
세션 복원 요청을 위해 별도로 추가되었습니다. `blocked_egress`는
egress 프로브가 적용될 때까지 예약된 상태로 유지됩니다.

상태 페이로드는 MCP env 값, 헤더, OAuth/서비스 계정
세부 정보, 제공자 API 키, 제공자 `baseUrl` / `envKey`, skill 본문, skill
파일 시스템 경로, hook 정의, 또는 비밀 환경 변수의 값을
노출하지 않습니다. `/workspace/env`는 화이트리스트에 포함된 env
변수의 **존재**만 보고합니다; 프록시 URL은 자격 증명이 제거되고
유선에 도달하기 전에 `host:port`로 축소됩니다.

### `GET /workspace/mcp`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "docs",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
      "description": "Documentation server",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState`는 `not_started`, `in_progress`, 또는 `completed` 중 하나입니다.
`transport`는 `stdio`, `sse`, `http`, `websocket`, `sdk`, 또는
`unknown` 중 하나입니다. `errors`는 발견이 성공하면 생략됩니다.

**MCP 클라이언트 가드레일 (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** 현재 데몬은 페이로드에 4개의 추가 필드와 기능 범위 예산 셀을 확장합니다:

```jsonc
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "clientCount": 3,
  "clientBudget": 2,
  "budgetMode": "enforce",
  "budgets": [
    {
      "kind": "mcp_budget",
      "scope": "workspace",
      "status": "error",
      "errorKind": "budget_exhausted",
      "hint": "Raise --mcp-client-budget or remove servers from mcpServers config.",
      "liveCount": 2,
      "budget": 2,
      "mode": "enforce",
      "refusedCount": 1,
    },
  ],
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "a",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "b",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "error",
      "name": "c",
      "mcpStatus": "disconnected",
      "transport": "stdio",
      "disabled": false,
      "disabledReason": "budget",
      "errorKind": "budget_exhausted",
      "hint": "...",
    },
  ],
}
```

`budgetMode`는 `enforce`, `warn`, 또는 `off` 중 하나입니다. `clientBudget`은 예산이 설정되지 않았을 때 부재합니다. `budgets[]`는 `mcp_guardrails`를 광고하는 데몬에서 **항상 배열**입니다(`budgetMode === 'off'`일 때 비어 있을 수 있음); 이전 데몬은 필드 전체를 생략합니다. `mcp_workspace_pool`이 광고될 때 셀은 `scope: 'workspace'`를 가지며 선택된 워크스페이스 런타임의 공유 풀을 커버합니다. 해당 태그가 없을 때, `QWEN_SERVE_NO_MCP_POOL=1` 아래에서도 레거시 매니저는 `scope: 'session'`을 내보냅니다. 소비자는 인식되지 않는 추가 scope 값을 허용해야 합니다.

서버별 셀의 `disabledReason`은 운영자 비활성화(`'config'` — `disabledMcpServers` 구성 목록)와 예산 거부(`'budget'` — 발견되었지만 `enforce` 모드로 인해 연결되지 않음)를 구분합니다. 거부는 `Object.entries(mcpServers)` 선언 순서에 따라 결정적입니다. 서버별 `status: 'error', errorKind: 'budget_exhausted'`는 원시 `mcpStatus: 'disconnected'`(사실이지만 운영자 대면 심각도가 아님)를 섀도잉합니다.

예산 집행은 기능 기반입니다. `mcp_workspace_pool`이 있으면 하나의 워크스페이스 런타임 내 세션이 전송과 하나의 `WorkspaceMcpBudget`을 공유합니다; 다른 워크스페이스 런타임은 풀이나 예산을 공유하지 않습니다. 해당 태그가 없으면 각 ACP 세션의 `McpClientManager`가 자체 캡 사본을 집행하며 스냅샷은 해당 레거시 세션 뷰를 나타냅니다.

**예산 압박 감지.** 두 가지 표면, 둘 다 PR-14b 이후 채워집니다:

- **푸시 이벤트**(`mcp_guardrail_events`를 통해 광고): `GET /session/:id/events`를 구독하고 `KnownDaemonEvent`를 통해 `mcp_budget_warning` / `mcp_child_refused_batch` 프레임을 좁힙니다. 상태 머신은 위쪽 75% 교차마다 한 번 발화합니다(37.5% 아래에서 재장전); 거부는 `enforce` 모드에서 발견 패스당 한 번으로 병합됩니다.
- **스냅샷 폴**(`mcp_guardrails`를 통해 광고): `GET /workspace/mcp`를 호출하고 예산 셀(`budgets[0]`)과 `mcp_workspace_pool`을 함께 검사하여 범위를 확인합니다:

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget`(푸시 이벤트가 사용할 히스테리시스 임계값 PR 14b와 일치).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0`(이 발견 패스에서 하나 이상의 서버가 거부됨).
- `budgets[0].status === 'ok'` ⇔ 75% 임계값 미만 AND 거부 없음.

권장 폴 빈도: 이미 `/workspace/mcp`를 폴링하는 것과 동일하게 맞추세요; 스냅샷은 저렴하고 예산 셀은 추가 발견 비용을 발생시키지 않습니다. 푸시 이벤트를 구독하는 SDK 클라이언트도 스냅샷이 상태-장기-연결-끊김-후에 유용합니다(SSE 리플레이 링 깊이는 유한합니다 — `--event-ring-size`, 기본값 8000 — 따라서 링의 커버리지보다 오래 오프라인인 클라이언트는 스냅샷 재동기화로 폴백합니다).

### `GET /workspace/skills`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "skills": [
    {
      "kind": "skill",
      "status": "ok",
      "name": "review",
      "description": "Review code",
      "level": "project",
      "modelInvocable": true,
      "userInvocable": false,
      "installedPath": "/home/alice/project/.qwen/skills/review/SKILL.md",
      "argumentHint": "[path]"
    }
  ]
}
```

`level`은 `project`, `user`, `extension`, 또는 `bundled` 중 하나입니다.
`userInvocable`(boolean, 선택 사항)은 일반 skill에 대해 생략되며(이는
`true`를 의미) skill이 수동으로 호출될 수 없거나 skill API를 통해
토글될 수 없을 때만 `false`로 존재합니다. `modelInvocable`은 독립적입니다: `false`는
skill이 수동으로 사용 가능하지만 모델 호출에서는 숨겨짐을 의미합니다.
`installedPath`는 skill의 `SKILL.md`에 대한 기존 절대 경로입니다; 데몬은
심볼릭 링크를 별도로 해석하거나 정규화하지 않고 저장된 대로 반환합니다. 현재 데몬은
모든 skill에 대해 이를 내보내며, 클라이언트는 이전 v1 데몬에서의 부재를
허용해야 합니다. Skill 본문, hook, `skillRoot`, 및 기타 skill
구성은 제외됩니다. `errors`는 발견이 성공하면 생략됩니다.

반복 읽기는 마지막 커밋된 워크스페이스 스냅샷에서 제공되며,
자식의 인메모리 캐시에 대해 주기적으로 재검증됩니다. 읽기는 skill
디렉토리를 스캔하거나 `SKILL.md` 파일을 재파싱하지 않습니다. 자식은
확장 소스가 변경되지 않았는지 확인합니다 — 확장 디렉토리의 `readdir` 하나와
항목당 `stat`, 활성화 파일, 그리고 저장소의 활성화 상태 — 그리고 이동되었을 때만
새로고침하므로 데몬 외부에서 설치되거나 토글된 확장도 다음 읽기에서
감지됩니다. Safe 및 bare 모드는 확장의 제외와 일치하여 확인을 건너뜁니다.

### `GET /workspace/providers`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "current": { "authType": "qwen", "modelId": "qwen3(qwen)" },
  "providers": [
    {
      "kind": "model_provider",
      "status": "ok",
      "authType": "qwen",
      "current": true,
      "models": [
        {
          "modelId": "qwen3(qwen)",
          "baseModelId": "qwen3",
          "name": "Qwen 3",
          "description": null,
          "contextLimit": 4096,
          "isCurrent": true,
          "isRuntime": false
        }
      ]
    }
  ]
}
```

모델은 인증 유형별로 그룹화됩니다. 제공자 연결 진단은
`/workspace/preflight`의 `providers` 셀에 있습니다; 환경 프리플라이트는
`/workspace/preflight`과 `/workspace/env`(아래)에 있습니다. `errors`는
스냅샷 구성이 성공하면 생략됩니다.

### `GET /workspace/env`

데몬 프로세스의 런타임, 플랫폼, 샌드박스, 프록시, 그리고 화이트리스트에 포함된
비밀 환경 변수의 **존재**를 보고합니다. 항상 `process.*` 상태에서
응답합니다 — 데몬은 이 라우트를 제공하기 위해 ACP 자식을 생성하지 않으며,
ACP가 올라와 있거나 유휴 상태이거나 응답이 동일합니다.
`acpChannelLive` 필드는 정보 제공용입니다.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    { "kind": "runtime", "name": "node", "status": "ok", "value": "22.4.0" },
    { "kind": "platform", "name": "darwin", "status": "ok", "value": "arm64" },
    {
      "kind": "sandbox",
      "name": "SANDBOX",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "proxy",
      "name": "HTTPS_PROXY",
      "status": "ok",
      "present": true,
      "value": "proxy.internal:1080"
    },
    {
      "kind": "proxy",
      "name": "NO_PROXY",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "env_var",
      "name": "OPENAI_API_KEY",
      "status": "ok",
      "present": true
    },
    {
      "kind": "env_var",
      "name": "ANTHROPIC_BASE_URL",
      "status": "disabled",
      "present": false
    }
  ]
}
```

셀 형태:

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // presence-only; value field is ALWAYS omitted

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**수정 정책.** `kind: 'env_var'` 셀은 절대 `value`
필드를 포함하지 않습니다; 클라이언트는 `present: boolean`만 봅니다. `kind: 'proxy'` 셀은
원시 env 값을 자격 증명 수정(`redactProxyCredentials`)을 거쳐
그 다음 `URL` 파싱을 통과시켜 유선이 `host:port`만 전달합니다. `NO_PROXY`는
URL이 아닌 호스트 목록이므로 수정을 그대로 통과합니다. 열거된 비밀 env
변수의 화이트리스트는 현재 `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
`DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY`, `QWEN_SERVER_TOKEN`을 포함합니다. 다른
env 변수는 열거되지 않으므로 실수로 설정된 비밀은 보이지 않습니다.

### `GET /workspace/preflight`

데몬 준비 상태 검사를 보고합니다. **데몬 수준 셀**(`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`)은 항상
`process.*`와 `node:fs`에서 채워집니다. **ACP 수준 셀**(`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)은
ACP 자식이 활성 상태여야 합니다 — 데몬이 유휴 상태이면
`status: 'not_started'` 플레이스홀더를 내보냅니다. 이 라우트는 셀을 채우기 위해서만 ACP를
생성하지 않습니다; 해당 셀은 `not_started`로 폴백합니다.

유휴 응답(ACP 자식 없음):

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    {
      "kind": "node_version",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "22.4.0", "required": ">=22" }
    },
    {
      "kind": "cli_entry",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/usr/local/bin/qwen", "source": "process.argv[1]" }
    },
    {
      "kind": "workspace_dir",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/canonical/path" }
    },
    { "kind": "ripgrep", "status": "ok", "locality": "daemon" },
    {
      "kind": "git",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "2.45.0" }
    },
    {
      "kind": "npm",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "10.7.0" }
    },
    {
      "kind": "auth",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "egress probing lands in PR 14 (#4175)"
    }
  ]
}
```

셀 형태:

```ts
type DaemonPreflightKind =
  | 'node_version'
  | 'cli_entry'
  | 'workspace_dir'
  | 'ripgrep'
  | 'git'
  | 'npm'
  | 'auth'
  | 'mcp_discovery'
  | 'skills'
  | 'providers'
  | 'tool_registry'
  | 'egress';

interface DaemonPreflightCell extends DaemonStatusCell {
  kind: DaemonPreflightKind;
  locality: 'daemon' | 'acp';
  detail?: Record<string, unknown>;
}
```

`errorKind` 의미:

- `missing_binary` — Node 버전이 요구 사항 미만, `QWEN_CLI_ENTRY` 누락,
  ripgrep / git / npm이 PATH에 없음(선택적 바이너리에 대해서는
  오류가 아닌 경고).
- `missing_file` — `boundWorkspace`가 존재하지 않거나 디렉토리가 아님;
  누락되었거나 읽을 수 없는 파일을 가리키는 skill 파싱 오류.
- `parse_error` — `SKILL.md` 파싱 실패, 잘못된 형식의 구성 JSON.
- `auth_env_error` — `validateAuthMethod`가 null이 아닌 실패
  문자열을 반환했거나 제공자 해석에서 전파된 `ModelConfigError` 서브클래스.
- `init_timeout` — 브리지의 `withTimeout` reject(ACP 왕복 대기 중
  실제 타임아웃). `BridgeTimeoutError` 타입 클래스를 통해 인식됩니다. 참고: 일시적 `mcp_discovery`
  `warning` 셀의 `connecting > 0`은 이 kind를 가지지 **않습니다** — 이는
  일반 핸드셰이크 진행 중 상태이며 실제 타임아웃과 구별됩니다.
- `restore_timeout` — 세션 로드 또는 재개가 전용 복원
  예산을 초과했습니다. REST 응답은 `504`이며 재시도 가능합니다; 자식
  초기화 및 한정된 리플레이 창 한도와 구별됩니다.
- `protocol_error` — 채널이 요청 중에 닫혔거나 도구 레지스트리가
  예기치 않게 부재하여 ACP `extMethod`가 거부되었습니다.
- `blocked_egress` — PR 14 (#4175)를 위해 예약됨. PR 13은
  `egress` 셀을 `status: 'not_started'`로 둡니다.

프리플라이트 요청 제공 중 브리지가 ACP 자식에 도달하지 못하면(예: 요청 중 채널 종료), 인벨롭의 `errors` 배열은
실패를 설명하는 단일 `ServeStatusCell`을 carrying하며 셀은
`not_started` ACP 플레이스홀더로 폴백합니다. 데몬 수준 셀은 여전히
반환됩니다.

### 워크스페이스 파일 라우트

모든 파일 경로는 데몬의 기본 워크스페이스를 통해 해석됩니다. 응답은
워크스페이스 상대 경로를 사용하며 일반적인 성공 케이스에 대해 절대 파일 시스템 경로를
반환하지 않습니다. 성공적인 파일 응답은 다음을 포함합니다:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

파일 시스템 오류는 이 JSON 형태를 사용합니다:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` 값은 `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found`, `ambiguous_text_match`를 포함합니다.

#### `GET /file`

텍스트 파일을 읽습니다. 쿼리 매개변수: `path`(필수), `maxBytes`, `line`, `limit`,
그리고 `cursor`. 데몬은 바이너리 파일을 거부합니다. 256 KiB
전체 스냅샷 캡을 초과하는 파일은 최소 하나의 명시적 창 인자(`line`, `limit`, 또는
`maxBytes`)가 필요합니다; 이 중 어느 것도 없는 요청은 여전히 `file_too_large`입니다. 이러한
창은 스트리밍되며, 반환된 UTF-8 콘텐츠는 256 KiB로 capped됩니다.
`maxBytes`는 항상 디코딩 후 UTF-8 응답 바이트에 적용되며,
소스가 전체 스냅샷 캡 내에서 다른 지원 인코딩을 사용하는 경우도 포함됩니다.

행 오프셋은 파일 시작부터 스캔하여 해석되므로,
창에 도달하기 위해 8 MiB(`MAX_TEXT_SCAN_BYTES`) 이상을 읽어야 하면 `file_too_large`로 거부됩니다. 더 깊은 오프셋에 직접 도달하려면 `GET /file/bytes`를 사용하세요. 라우트가 디코딩할 수 없는 인코딩의 큰 텍스트는
`file_too_large`가 아닌 `binary_file`을 반환합니다 — 더 작은 창으로 재시도해도
도움이 되지 않으며, `readBytes`가 바이너리에 적용되는 것과 동일한 수정 방법입니다.

전체 스냅샷 캡 이내의 파일은 응답에 `hash`가 포함되며, 이는
`line`, `limit`, 또는 `maxBytes`가 슬라이스를 반환한 경우에도 전체 파일의 원시 온디스크 바이트에 대한 SHA-256
다이제스트입니다. 큰 부분 창은 `hash`를 생략하고,
완전한 `sizeBytes`를 유지하며, `truncated: true`를 설정하고, 스트림이 EOF 전에 중지되면
`originalLineCount: null`을 반환합니다.

##### `cursor`를 사용한 페이징

`workspace_file_read_cursor` 기능이 필요합니다. 더 제공할 내용이 있는 응답은
`hasMore: true`를 반환하며, 파일 바이트 오프셋을 유도할 수 있을 때
`nextCursor` 토큰을 반환합니다. 이를 `cursor`로 다시 전달하면 O(1)에 재개됩니다. 반면 깊은
`line` 오프셋은 바이트 0부터 스캔이 필요하며 8 MiB 초과 시 거부됩니다.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor`와 `line`은 상호 배타적입니다(`parse_error`) — 둘 다 시작 지점을
이름으로 지정합니다. 잘못된 형식 또는 너무 긴 커서는 `parse_error`입니다; 파일이 교체되거나 잘린 커서는
`hash_mismatch`(409)입니다. 추가는 미해결 커서를 무효화하지 **않습니다** — 이것이
이 기능이 존재하는 경우입니다.

`content`는 다른 모든 읽기와 마찬가지로 마지막 행의 종료 개행 문자를 생략하므로,
페이지를 재조립하는 클라이언트는 `\n`으로 연결합니다. `hasMore`는
`nextCursor`의 재진술이 아닙니다: `limit`과 함께 읽은 작은 비 UTF-8 파일은
더 많은 콘텐츠가 있지만 유도 가능한 바이트 오프셋이 없으므로 `hasMore: true`를 `nextCursor: null`과 함께 보고합니다. 바이트 캡이 현재 행을 자를 때도 커서는 null입니다 — 해당 오프셋에서 재개하면 부분 행이 반환되기 때문입니다. 짧은 행이 많은 경우, 페이지가 바이트 캡 전에 끝나고 커서를 반환할 때까지 `limit`을 낮추세요. 단일 초과 크기 행의 경우 다음 행을 명시적으로 요청하고(예: 1행에서 시작하면 `line=2`), 그 다음 커서로 계속하세요; 완전한 초과 크기 행이 필요하면 `GET /file/bytes`를 사용하세요.

```json
{
  "kind": "file",
  "path": "src/index.ts",
  "content": "export {};\n",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "sizeBytes": 11,
  "returnedBytes": 11,
  "truncated": false,
  "hash": "sha256:...",
  "matchedIgnore": null,
  "originalLineCount": null
}
```

#### `GET /file/bytes`

디코딩 없이 파일에서 원시 바이트를 읽습니다. 쿼리 매개변수: `path`(필수),
`offset`(기본값 `0`), 그리고 `maxBytes`(기본값 `65536`, 최대 `262144`). 이
라우트는 전체 파일을 읽지 않고도 큰 바이너리 파일에 대한 한정된 창을
지원합니다. 응답은 반환된 창이 전체 파일을 커버할 때만 `hash`를 포함합니다.

```json
{
  "kind": "file_bytes",
  "path": "assets/logo.png",
  "offset": 0,
  "sizeBytes": 3912,
  "returnedBytes": 3912,
  "truncated": false,
  "contentBase64": "...",
  "hash": "sha256:..."
}
```

#### `POST /file/write`

텍스트 파일을 생성하거나 교체합니다. 엄격한 변형 라우트입니다: 구성된 토큰 없는
루프백에서 `401 { "code": "token_required" }`를 반환합니다.
`--require-auth`가 있으면 전역 bearer 미들웨어가 라우트 실행 전에
인증되지 않은 요청을 거부합니다.

본문:

```json
{
  "path": "src/new.ts",
  "content": "export const value = 1;\n",
  "mode": "create"
}
```

```json
{
  "path": "src/existing.ts",
  "content": "export const value = 2;\n",
  "mode": "replace",
  "expectedHash": "sha256:..."
}
```

`mode`는 `create` 또는 `replace`여야 합니다. `create`는 기존 파일을 덮어쓰지
않습니다(`409 file_already_exists`). `replace`는 `expectedHash`가 필요합니다; 누락되거나
잘못된 형식의 해시는 `400 parse_error`, 오래된 해시는
`409 hash_mismatch`입니다. `expectedHash`는 `sha256:` 뒤에 64개의 소문자 16진
문자이며 원시 온디스크 바이트에 대해 계산됩니다.

`bom`, `encoding`, `lineEnding`을 제공할 수 있습니다. 교체는 기본적으로
기존 파일의 인코딩 프로필을 보존합니다; 명시적 필드가 이를 재정의합니다.
바이너리 쓰기는 범위 밖입니다.

데몬은 대상 디렉토리의 무작위 임시 파일에 쓰고, 지원되는 곳에서 fsync하고,
`rename()` 직전에 현재 해시를 재확인한 다음, 제자리로 rename합니다. 이는 부분 파일 관찰을 방지하고
같은 파일에 대한 데몬 발생 쓰기를 직렬화하지만, 교프로세스
커널 compare-and-swap은 아닙니다: 외부 편집기가 여전히 최종 해시 확인과 rename 사이의
작은 창에서 경쟁할 수 있습니다.

```json
{
  "kind": "file_write",
  "path": "src/existing.ts",
  "mode": "replace",
  "created": false,
  "sizeBytes": 24,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /file/edit`

기존 텍스트 파일에 하나의 정확한 텍스트 교체를 적용합니다. 이 또한
엄격한 변형 라우트이며 `expectedHash`가 필요합니다.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText`는 비어 있지 않고 정확히 한 번 발생해야 합니다. 일치 없음은
`422 text_not_found`를 반환합니다; 다중 일치는 `422 ambiguous_text_match`를 반환합니다.
라우트는 인코딩, BOM, 행 종료를 보존하며 원자적 rename 직전에
`expectedHash`를 재확인합니다.

무시된 경로에 대한 명시적 쓰기/편집은 인증된
호출자가 경로를 이름으로 지정했기 때문에 허용됩니다. 성공 응답과 감사 이벤트에
`matchedIgnore: "file" | "directory" | null`이 포함됩니다.

```json
{
  "kind": "file_edit",
  "path": "src/config.ts",
  "replacements": 1,
  "sizeBytes": 128,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

### `GET /session/:id/context`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "state": {
    "models": {},
    "modes": {},
    "configOptions": []
  }
}
```

`state`는 `POST /session`, `POST /session/:id/load`, 그리고 `POST /session/:id/resume`에서 사용되는 것과 동일한 ACP 모델/모드/구성 옵션 형태를 미러링합니다.

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialize the project",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands`는 `available_commands_update` SSE 알림에서 사용되는 것과 동일한 명령 스냅샷입니다. `availableSkills`는 skill 이름만 나열합니다; 클라이언트는 이 라우트에서 skill 본문이나 경로를 기대해서는 안 됩니다.

### `GET /session/:id/tasks`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "now": 1700000000000,
  "tasks": [
    {
      "kind": "agent",
      "id": "agent-1",
      "label": "reviewer: check failure",
      "description": "check failure",
      "status": "running",
      "startTime": 1699999999000,
      "runtimeMs": 1000,
      "outputFile": "/tmp/agent-1.jsonl",
      "isBackgrounded": true,
      "subagentType": "reviewer"
    },
    {
      "kind": "agent",
      "id": "agent-2",
      "label": "general-purpose: run the failing test",
      "description": "run the failing test",
      "status": "running",
      "startTime": 1699999999500,
      "runtimeMs": 500,
      "outputFile": "/tmp/agent-2.jsonl",
      "isBackgrounded": false,
      "subagentType": "general-purpose",
      "parentAgentId": "agent-1",
      "parentName": "reviewer",
      "depth": 1
    }
  ]
}
```

이 라우트는 읽기 전용 아웃오브밴드 스냅샷입니다. 의도적으로 프롬프트가 아니며 세션이 스트리밍 중일 때 쿼리할 수 있습니다. 응답은 에이전트, 셸, 모니터 작업 레지스트리의 화이트리스트 메타데이터만 포함합니다; 컨트롤러, 타이머, 오프셋, 대기 중인 메시지, 원시 레지스트리 객체는 절대 노출되지 않습니다.

다른 서브에이전트가 생성한 에이전트 작업(`maxSubagentDepth`로 제한된 중첩 서브에이전트)은 세 가지 선택적 계보 필드를 가집니다: `parentAgentId`(생성 에이전트 작업의 `id`), `parentName`(생성 에이전트의 `subagentType`, 등록 시 캡처되어 부모가 레지스트리에서 축출되어도 생존), 그리고 `depth`(0 기반 시작 깊이; 0 = 최상위 세션이 생성). 최상위 세션이 시작하는 에이전트는 `parentAgentId`와 `parentName`을 생략합니다; 클라이언트는 세 필드 모두를 선택 사항으로 취급하고 부재 시 평면 목록으로 폴백해야 합니다.

### `GET /session/:id/lsp`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "enabled": true,
  "configuredServers": 1,
  "readyServers": 1,
  "failedServers": 0,
  "inProgressServers": 0,
  "notStartedServers": 0,
  "servers": [
    {
      "name": "typescript",
      "status": "READY",
      "languages": ["typescript", "javascript"],
      "transport": "stdio",
      "command": "typescript-language-server"
    }
  ]
}
```

`status`는 `NOT_STARTED`, `IN_PROGRESS`, `READY`, 또는 `FAILED` 중 하나입니다. 선택적 `error`는 실패한 서버에서 사용 가능할 때 존재합니다. 비활성화된 LSP(bare 모드 포함)는 HTTP 200을 `enabled: false`, 0 카운트, `servers: []`로 반환합니다. 구성된 서버 없이 LSP가 활성화되면 `enabled: true`, `configuredServers: 0`, `servers: []`를 반환합니다. 클라이언트 존재 전에 초기화가 실패하면 응답에 `initializationError`가 포함될 수 있습니다; 활성 클라이언트가 스냅샷을 제공할 수 없으면 응답에 `statusUnavailable: true`가 포함됩니다.

이 라우트는 안정적 클라이언트 대면 필드만 노출합니다. 프로세스 ID, spawn 인자, stderr 테일, root URI, 워크스페이스 폴더 경로와 같은 디버그 내부를 의도적으로 생략합니다.

### `POST /session`

새 에이전트를 생성하거나 기존 에이전트에 연결합니다(`sessionScope: 'single'`, 기본값).

요청:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread"
}
```

| 필드             | 필수 | 참고                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`            | 아니오 | 등록된 워크스페이스 하나와 일치하는 절대 경로. 생략 시 라우트는 기본 워크스페이스로 폴백합니다(`/capabilities.workspaceCwd`에서 확인). 일치하지 않는 비어 있지 않은 `cwd`는 `400 workspace_mismatch`를 반환합니다. `features`에 `multi_workspace_sessions`가 있으면 클라이언트는 신뢰되는 `workspaces[].cwd`를 전달할 수 있습니다; 그렇지 않으면 기본 워크스페이스만 허용됩니다. 워크스페이스 경로는 `realpathSync.native`를 통해 정규화되며(존재하지 않는 경로에 대해 resolve-only 폴백) 대소문자 구분 없는 파일 시스템에서 철자별로 세션을 거부하지 않습니다. |
| `modelServiceId` | 아니오 | 에이전트가 라우팅할 구성된 _모델 서비스_(백엔드 제공자 — Alibaba ModelStudio, OpenRouter 등)를 선택합니다. 생략 시 에이전트는 기본값을 사용합니다. 워크스페이스에 이미 세션이 있으면 기존 세션에서 `setSessionModel`을 호출하고 `model_switched`를 브로드캐스트합니다. `POST /session/:id/model`의 `modelId`와 구별됩니다 — 이는 이미 바인딩된 서비스 **내부**의 모델을 선택합니다. `/capabilities`의 `modelServices` 배열은 구성된 서비스를 광고하기 위해 예약되어 있습니다; Stage 1에서는 항상 `[]`입니다(에이전트의 기본 서비스가 사용되며 HTTP로 열거되지 않음). |
| `sessionId`      | 아니오 | 호출자가 선택한 RFC 변형 UUID v1-v5. 데몬은 소문자로 정규화하고 항상 새 스레드 세션을 생성합니다; 이 필드를 멱등적 연결로 취급하지 않습니다. 전송 전 `caps.features`에 `session_id_override`가 있는지 확인하세요 — 이전 데몬은 알 수 없는 필드를 무시할 수 있습니다. `null`은 생략과 동일합니다.                                                                                                                                                                                                                                                                                                                        |
| `sessionScope`   | 아니오 | 세션 공유에 대한 요청별 재정의. `'single'`(데몬 전체 기본값)은 두 번째 동일 워크스페이스 `POST /session`이 기존 세션을 재사용하게 합니다(`attached: true`); `'thread'`는 모든 호출에 새 고유 세션을 강제합니다. 생략 시 데몬 전체 기본값을 상속합니다. 열거형 밖의 값은 `400 { code: 'invalid_session_scope' }`를 반환합니다. 이전 데몬(#4175 PR 5 이전)은 필드를 조용히 무시합니다 — 전송 전 `caps.features.session_scope_override`를 프리플라이트하세요. 데몬 전체 기본값은 현재 프로덕션에서 `'single'`로 하드코딩되어 있습니다; #4175는 후속에서 `--sessionScope` CLI 플래그를 추가할 수 있습니다. |

응답:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true`는 해당 워크스페이스의 세션이 이미 존재하며 이제 공유하고 있음을 의미합니다.

호출자 제공 ID는 현재 등록된 모든 워크스페이스 런타임과 여전히 활성인 모든 브리지 세대에 걸쳐 고유합니다(드레닝 중인 교체 포함). 활성, 대기 중, 활성, 아카이브된, 또는 worktree 기반 중복은 `409 session_id_conflict`를 반환합니다. 잘못된 값은 `400 invalid_session_id`를 반환합니다; 사용 불가능한 활성 소유자 또는 영구성 상태 확인은 재시도 가능한 `503 session_id_admission_unavailable`를 반환합니다. 브리지 또는 저장소 상태 변경 후 한정된 백오프로 재시도하세요; `retryable`은 다른 시도가 안전함을 의미하며 즉시 재시도가 성공할 것임을 의미하지는 않습니다. 다운스트림 에이전트가 다른 ID를 반환하면 데몬은 해당 고아를 제거하고 `500 session_id_not_honored`를 반환합니다. 모호한 응답 후 생성 재시도 대신 알려진 ID를 로드하거나 재개하세요.

독립적인 대화를 원하는 다중 클라이언트 통합은 각 `POST /session`에서 `sessionScope: "thread"`를 전송해야 합니다. 기본 `single` 범위는 클라이언트가 의도적으로 하나의 협업 세션을 공유할 때만 사용하세요; 공유 세션은 프롬프트를 하나의 FIFO를 통해 직렬화하며, `/daemon/status`에서 `runtime.activity.pendingPrompts` 및 `runtime.activity.queuedPrompts`로 보입니다.

같은 워크스페이스에 대한 동시 `POST /session` 호출은 하나의 생성으로 **합쳐집니다** — 두 호출자 모두 같은 `sessionId`를 받으며, 정확히 하나만 `attached: false`를 보고합니다. 기본 생성이 실패하면(초기화 타임아웃, 잘못된 에이전트 출력, OOM) **합쳐진 모든 호출자가 같은 오류를 받습니다** — 진행 중 슬롯이 해제되어 후속 호출이 처음부터 재시도할 수 있습니다.

> ⚠️ **새 세션에서 `modelServiceId` 거부는 HTTP 응답에서 조용합니다.** 잘못된 `modelServiceId`(오타, 구성되지 않은 서비스)는 생성을 500으로 만들지 **않습니다** — 세션은 에이전트의 기본 모델에서 작동 상태를 유지하므로 호출자는 여전히 `sessionId`를 받아 모델 전환을 재시도할 수 있습니다(`POST /session/:id/model`을 통해). 가시적인 실패 신호는 세션의 SSE 스트림에서 `model_switch_failed` 이벤트이며, 생성 핸드셰이크와 첫 구독 사이에 발화됩니다. **이 이벤트를 관찰해야 하는 구독자는 첫 `GET /session/:id/events`에서 `Last-Event-ID: 0`을 전달하여** 링의 가장 오래된 사용 가능한 이벤트부터 리플레이하세요(구독이 생성 응답보다 몇 ms 후에 도착해도 생성 시점 `model_switch_failed`를 커버합니다).

### ACP `session/new` 호출자 제공 ID

ACP 클라이언트는 확장 메타데이터 필드를 통해 동일한 동작을 요청합니다:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "_meta": {
      "qwen-code/sessionId": "550E8400-E29B-41D4-A716-446655440000"
    }
  }
}
```

응답은 정규화된 소문자 ID를 포함합니다. 기본 및 워크스페이스 한정 ACP 마운트는 `session/load` 및 `session/resume`을 포함하여 REST와 어드미션을 공유합니다. 잘못된 ID는 ACP `INVALID_PARAMS`를 `data.httpStatus=400` 및 `data.errorKind="invalid_session_id"`와 함께 사용합니다; 충돌은 `data.httpStatus=409`; 사용 불가능한 활성 소유자 또는 영구성 상태 확인은 `data.httpStatus=503` 및 `data.retryable=true`를 사용합니다.

프롬프트를 받지 않은 ACP 생성 세션은 영구성 흔적을 남기지 않으며, 데몬은 소유 연결이 첨부된 세션 0개로 닫힐 때 이를 회수합니다. 해당 회수 후 같은 ID를 다시 생성할 수 있습니다 — 이는 연결 수명주기이지 ID 재사용이 아닙니다: 연결(또는 어떤 첨부)이 활성인 동안 어드미션은 중복을 거부합니다.

### `POST /session/:id/load`

영구적 ACP 세션을 id로 복원하고 SSE를 통해 히스토리를 리플레이합니다. 경로 id가 우선합니다; 본문의 어떤 `sessionId` 필드도 무시됩니다. `caps.features.session_load`를 프리플라이트하세요 — 이전 데몬은 이 라우트에 대해 `404`를 반환합니다.

요청:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| 필드 | 필수 | 참고                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | 아니오 | `POST /session`과 동일한 정규화 + `workspace_mismatch` 규칙. 생략 시 `/capabilities.workspaceCwd`를 상속합니다. `features`에 `multi_workspace_sessions`가 있으면 호출자는 신뢰되는 등록된 `workspaces[].cwd`를 전달할 수 있습니다; 신뢰되지 않는 비기본 워크스페이스는 `403 untrusted_workspace`를 반환합니다. `mcpServers`는 의도적으로 여기서 허용되지 **않습니다** — 데몬 전체 MCP는 설정 기반입니다(`POST /session`과 일치). |

응답:

```json
{
  "sessionId": "persisted-1",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "state": {
    "models": { ... },
    "modes": { ... },
    "configOptions": [ ... ]
  }
}
```

`state`는 ACP의 `LoadSessionResponse`를 미러링합니다 — `models`는 `SessionModelState`, `modes`는 `SessionModeState`, `configOptions`는 `SessionConfigOption`의 배열입니다. 누락된 필드는 에이전트가 결정합니다. 후기 첨부자(아래의 `attached: true` 경로)는 원래 로드 호출자가 본 것과 **동일한** `state` 스냅샷을 받습니다 — 데몬이 엔트리에 캐시합니다; 런타임 변경(예: `model_switched`)은 SSE 스트림에서 전달되며 후속 첨부 응답에서는 전달되지 않습니다.

`attached: true`는 세션이 이미 활성이었음을 의미합니다(이전 `session/load`/`session/resume`에서, 또는 합쳐진 동시 호출자가 바로 앞에 경쟁했을 때).

**SSE를 통한 히스토리 리플레이.** 에이전트 측에서 `loadSession`이 진행 중일 때 에이전트는 영구적 턴에 대해 `session_update` 알림을 내보내거나 응답 메타데이터에서 벌크 리플레이 업데이트를 반환할 수 있습니다. 데몬은 라우트 응답이 반환되기 전에 해당 이벤트를 세션의 한정된 리플레이 스냅샷 창에 시딩합니다. 활성 세션에 대해 `POST /session/:id/load`는 해당 한정 창(`compactedReplay`, `liveJournal`, `lastEventId`)만 약속하며 전체 트랜스크립트는 아닙니다. 창은 `--compacted-replay-max-bytes`(기본값 4 MiB, 최대 256 MiB)로 바이트 제한됩니다; 오래된 리플레이 항목이 삭제되면 `compactedReplay[0]`은 id 없는 `history_truncated` 마커입니다. 진행 중 `liveJournal`은 `--max-journal-events`(기본값 10,000 리플레이 항목)와 `--max-journal-bytes`(기본값 8 MiB의 직렬화된 소스 이벤트)로 별도로 제한됩니다. 이들은 세션별 **기본** 캡입니다. 진행 중 턴이 이를 초과하면 데몬은 먼저 적응적 성장을 시도합니다: 해당 세션의 캡을 2배까지 올립니다(세션당 하드 캡 256 MiB, 항목은 비례적으로 확장, 남은 풀 헤드룸으로 제한) — 모든 활성 세션에 걸쳐 부여된 성장이 데몬 전체 성장 풀(데몬의 유효 메모리 예산의 5%로 크기 지정 — 전달 시 `--memory-budget-mb` 값, 해결된 사용 가능 메모리로 캡, 그렇지 않으면 자동 감지 메모리의 50%) — `1024` MB로 캡. 회계는 데몬 전체입니다 — 다중 워크스페이스 데몬은 워크스페이스당 하나의 브리지를 실행하며 모두 단일 풀을 공유합니다. 성장은 수요에 따라 풀이 허용하는 범위에서만; 운영자가 고정한 `--max-journal-events` 또는 `--max-journal-bytes`는 이를 비활성화하며, 유효 예산이 1024 MB 최소 미만인 호스트도 마찬가지입니다(`insufficientMemory`): 풀이 0이고 적응적 성장이 전면 비활성화됩니다. 연속적인 호환되는 `agent_message_chunk` 또는 `agent_thought_chunk` 소스 이벤트는 항목당 최대 256개 소스 이벤트까지 리플레이 항목을 공유하며, 도구, 귀속, 출처, 그리고 개별 메시지 경계는 유지됩니다. 저널이 성장이 허용하는 (성장했을 수 있는) 캡을 초과하면 — 헤드룸이 부여되지 않거나 부여가 초과분의 일부만 커버하는 경우 포함 — 가장 오래된 항목이 통째로 삭제되며(보유된 테일이 바이트 캡보다 훨씬 작을 수 있음) `scope: 'live_journal'`을 가진 `history_truncated` 마커가 앞에 추가됩니다; `truncatedEvents`와 `retainedEvents` 필드는 리플레이 항목이 아닌 소스 이벤트를 카운트하며, `maxBytes` / `maxEvents`는 적용 중인 캡을 반영합니다(이미 성장했을 수 있음). 클라이언트는 해당 마커를 상태로 렌더링하고 보유된 이벤트를 계속 적용해야 합니다. 전체 영구적 트랜스크립트 접근은 `GET /session/:id/transcript`를 통해 별도로 노출됩니다.

리플레이 창 바이트 캡은 자식이 영구적 트랜스크립트를 재구성한 후에 적용됩니다; 온디스크 JSONL 읽기를 제한하지 않습니다. 데몬 예산을 초과하는 복원은 복원 예산에서 유도된 `Retry-After`(5-120초로 클램프)와 `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}`와 함께 `504`를 반환합니다. 데몬은 여전히 실행 중인 ACP 요청을 펜싱하고 늦은 세션을 정리합니다. 같은 id에 대한 재시도는 해당 정리가 정착될 때까지 복원 예산의 `Retry-After`(5-120초로 클램프)와 함께 `409 restore_in_progress`를 `reason: "awaiting_abandoned_cleanup"`와 함께 반환합니다. 늦은 정리가 불확실하거나 포기된 복원이 마감 후에도 여전히 한 전체 복원 예산 동안 정착되지 않으면 해당 워크스페이스의 새 세션은 `503 acp_channel_unavailable`를 `reason: "restore_cleanup_failed"` 또는 `"restore_settlement_overdue"`와 함께 반환합니다; 이미 활성인 세션은 채널이 드레인되는 동안 사용 가능합니다.

**오류:**

- `404` — 영구적 세션 id가 존재하지 않음(`SessionNotFoundError`).
- `400` — `workspace_mismatch`(`POST /session`과 동일한 형태).
- `403` — `cwd`가 신뢰되지 않는 비기본 워크스페이스를 대상으로 할 때 `untrusted_workspace`.
- `503` — `session_limit_exceeded`(`--max-sessions`에 대해 카운트; 진행 중 복원도 계산됨).
- `504` — `session_restore_timeout`; 재시도 가능, 복원 예산에서 유도된 `Retry-After`(5-120초로 클램프)와 함께 — 같은 세션 id는 늦은 정리가 정착될 때까지 펜싱된 상태로 유지되기 때문.
- `503` — 워크스페이스 채널이 새 세션 작업에 닫혀 있을 때 `acp_channel_unavailable`. `reason`이 이유를 설명합니다: 포기된 복원을 결정적으로 정리할 수 없을 때 `restore_cleanup_failed`, 또는 포기된 복원이 마감 후 한 전체 복원 예산 동안 여전히 정착되지 않았을 때 `restore_settlement_overdue`. 두 경우 모두 기존 세션은 사용 가능하며 새 세션 작업은 워크스페이스 채널 드레인 후 재시도 가능합니다 — 본문은 `retryAfterSeconds`를 carrying하며 헤더는 일치하는 예산 유도 `Retry-After`를 가집니다 — 격리가 펜스를 초과하여 생존하며 새 id는 힌트를 carrying할 409를 절대 보지 못하기 때문.
- `409` — `restore_in_progress`(같은 id에 대한 `session/resume`이 이미 진행 중이거나 새 생성이 복원이 소유한 id를 제공). 복원이 활성 동안 `Retry-After: 5`; `awaiting_abandoned_cleanup`로 펜싱되면 예산 유도 힌트. 동일 작업 경쟁(같은 id에 대한 두 동시 `session/load`)은 합쳐집니다 — 정확히 하나만 `attached: false`를 반환하고 나머지는 같은 `state`와 함께 `attached: true`를 반환.
- `409` — 같은 세션 id가 다른 워크스페이스 런타임에서 이미 활성이거나 복원 중일 때 `session_workspace_conflict`.
- `409` — id가 `chats/archive/` 아래에만 존재할 때 `session_archived`; `load` 또는 `resume` 전에 `POST /sessions/unarchive`를 호출.
- `409` — 같은 id에 대한 아카이브 또는 아카이브 해제가 진행 중일 때 `session_archiving`. `Retry-After: 5`.
- `409` — id가 `chats/`와 `chats/archive/` 모두에 존재할 때 `session_conflict`; 로드 전 `POST /sessions/delete`로 세션을 삭제.

### `GET /session/:id/transcript`

활성 영구적 JSONL 트랜스크립트에서 재구성된 id 없는 `session_update` 리플레이 프레임의 한 페이지를 반환합니다. `caps.features.session_transcript`를 프리플라이트합니다 — 이전 데몬은 이 라우트에 대해 `404`를 반환합니다.

쿼리 파라미터:

| 필드     | 필수 | 참고                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | 아니오 | 이전 페이지에서 반환된 불투명 base64url 커서. 첫 페이지에서는 생략합니다. 커서는 데몬 발급 및 변조 검사됩니다; 수정하면 `400 invalid_transcript_cursor`를 반환합니다. 트랜스크립트 파일 정체성과 동결된 첫 페이지 바이트 크기에 바인딩됩니다; 파일을 삭제, 잘라내기, 교체, 또는 아카이브하면 무효화되어 `409`를 반환합니다. |
| `limit`  | 아니오 | 페이지에 포함할 활성 `ChatRecord` 수. 기본값 `100`, 최대 `500`. 하나의 레코드에서 여러 리플레이 프레임이 생성될 수 있으므로 `events.length`가 `limit`보다 클 수 있습니다. 잘못된 값은 `400 invalid_transcript_limit`을 반환합니다.                                                                                                              |

응답:

```json
{
  "v": 1,
  "sessionId": "persisted-1",
  "events": [
    {
      "v": 1,
      "type": "session_update",
      "data": {
        "sessionUpdate": "user_message_chunk",
        "content": { "type": "text", "text": "..." }
      }
    }
  ],
  "nextCursor": "opaque",
  "hasMore": true,
  "startTime": "2026-07-08T00:00:00.000Z",
  "lastUpdated": "2026-07-08T00:01:00.000Z"
}
```

`events`는 리플레이 프레임만 포함합니다: `{ v: 1, type: "session_update", data: SessionUpdate }`. EventBus id를 carry하지 않으며 응답에 `lastEventId`가 절대 포함되지 않습니다. 이 라우트를 호출해도 `/load`를 호출하거나, 클라이언트를 첨부하거나, 활성 EventBus를 시딩하거나, 활성 세션을 생성하거나, 현재 활성 리플레이 창을 변경하지 않습니다. 활성 및 비활성 세션 모두 자식 측 읽기 전용 상태 메서드로 재구성되므로 리플레이는 동일한 워크스페이스 설정, 런타임 출력 디렉토리, 이미터, 그리고 `/load` 히스토리 의미를 사용하면서 데몬 세션 상태를 변경하지 않습니다.

첫 페이지는 현재 JSONL 스냅샷 크기를 동결합니다. 이후 페이지는 해당 바이트 접두사만 읽으므로 페이지 1 이후의 추가는 결과 집합을 변경하지 않습니다. 파일이 사라지거나, 동결된 크기 이하로 잘리거나, 다른 inode로 교체되거나, 아카이브로 이동되면 다음 페이지는 `409`를 반환하며 클라이언트는 페이지 1부터 다시 시작하거나 사용자에게 트랜스크립트를 다시 열도록 요청해야 합니다.

데몬 메모리 및 레이턴시 보호를 위해 트랜스크립트 인덱싱 캡을 초과하는 스냅샷은 데몬이 JSONL을 스캔하기 전에 실패합니다. 클라이언트는 `413 transcript_too_large`를 받으며 export/오프라인 처리로 폴백하거나 사용자에게 이전 히스토리를 단축/아카이브하도록 요청해야 합니다.

`partial: true`와 `replayError`는 일부 프레임을 생성한 후 리플레이 변환이 실패할 때 나타날 수 있습니다. 부분 응답에는 `nextCursor`가 절대 포함되지 않으므로 클라이언트는 변환되지 않은 레코드를 조용히 페이지네이션으로 넘어가지 않습니다.

**오류:**

- `400` — 잘못된 `limit`, `cursor`, 또는 세션 id 형태.
- `404` — 첫 페이지 요청 시 활성 영구적 세션 id가 존재하지 않음.
- `409` — `/load`와 동일한 로드 가능성 검사에서의 `session_archived`, `session_archiving`, 또는 `session_conflict`.
- `409` — 커서 발급 후 파일이 삭제, 잘라내기, 교체, 또는 아카이브되어 트랜스크립트 스냅샷을 사용할 수 없음; 프리플라이트가 커서 요청에 대한 활성 파일을 더 이상 찾을 수 없을 때도 적용됩니다.
- `413` — 동결된 트랜스크립트 스냅샷이 데몬 인덱싱 캡을 초과할 때 `transcript_too_large`.
- `413` — 하나의 집합 레코드가 워크스페이스 한정 페이지 예산을 초과하거나 직렬화된 페이지가 응답 예산을 초과할 때 `transcript_page_too_large`.

### `GET /workspaces/:workspace/session/:id/transcript`

선택된 등록된 워크스페이스의 활성 영구적 JSONL에서 단수 라우트와 동일한 `DaemonSessionTranscriptPage` 프로젝션을 반환합니다. `workspace_persisted_transcript`를 프리플라이트합니다; 이 기능은 `multi_workspace_sessions`와 독립적이며 id 또는 cwd로 선택된 신뢰되는 단일 워크스페이스 기본에도 작동합니다.

선택자와 쿼리 파라미터는 기존 다중 워크스페이스 및 트랜스크립트 규칙을 따릅니다. 신뢰되는 기본 및 보조 런타임과 신뢰되지 않는 보조 런타임이 읽을 수 있습니다. 신뢰되지 않는 기본은 `403 untrusted_workspace`를 반환합니다. 아카이브된 콘텐츠는 반환되지 않습니다.

이 워크스페이스 한정 라우트에서 `limit`은 최대 레코드 수입니다. 페이지는 4 MiB 영구적 소스 예산에서 더 일찍 중단되고 계속 커서를 반환할 수 있습니다. 직렬화된 응답은 32 MiB로, 커서는 64 KiB로 제한됩니다. 리플레이 상태가 커서 캡을 초과하면 페이지는 성공적으로 변환된 이벤트를 `partial: true`, `hasMore: false`, `nextCursor` 없이 반환합니다.

레거시 단수 라우트와 달리 이 경로는 데몬 프로세스 내에서 완전히 구현됩니다. 워크스페이스 브리지를 호출하거나, ACP를 시작하거나, 설정을 로드하거나, 프로젝트 정의 에이전트나 skill을 파싱하거나, `session-transcript-cursor-key`를 생성/수리하지 않습니다. 도구 프레임은 런타임 도구 레지스트리를 참조하지 않고 영구적 도구 이름과 설명을 사용합니다. HMAC 커서 키는 데몬 메모리에만 존재하며 워크스페이스별로 격리되고 재시작 시 회전합니다; 이전 데몬 프로세스의 커서는 `400 invalid_transcript_cursor`를 반환합니다.

### `GET /workspaces/:workspace/session/:id/export`

선택된 등록된 워크스페이스의 활성 영구적 세션을 첨부 파일로 내보냅니다. `workspace_session_export`를 프리플라이트합니다; `session_export` 또는 `workspace_qualified_rest_core`에서 지원을 추론하지 마십시오. 선택자는 정확한 워크스페이스 id로 먼저 해결되고, 정규화 후 URL 인코딩된 절대 cwd로 해결됩니다. 기본 및 보조 런타임 모두 신뢰되어야 합니다. 신뢰되지 않는 런타임은 세션 또는 형식 검증 전에 `403 untrusted_workspace`를 반환합니다.

선택적 `format` 쿼리는 `html`(기본값), `md`, `json`, 또는 `jsonl`입니다. 본문, MIME 타입, 파일 이름 정리, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, 그리고 첨부 처분은 `GET /session/:id/export`와 일치합니다. 레거시 라우트는 기본 스토리지에 바인딩됩니다.

다중 라우트는 기존 공유 아카이브 코디네이터 하에서 선택된 워크스페이스의 활성 영구적 JSONL만 읽습니다. 다른 워크스페이스 스토어를 스캔하거나, 기본으로 폴백하거나, 활성 소유자를 해결하거나, 워크스페이스 브리지를 호출하거나, ACP를 시작하거나, 클라이언트를 첨부하거나, 설정을 로드하지 않습니다. 다른 워크스페이스에만 존재하는 세션 id는 `404 { code: "session_not_found" }`를 반환하고, 아카이브된 세션은 `409 session_archived`를 반환합니다. 잘못된 형식은 `400 invalid_export_format`을 반환하며, 스토리지 경쟁은 기존 `session_archiving` 및 `session_conflict` 오류를 유지합니다.

### `GET /workspaces/:workspace/session/:id/archive/export`

선택된 등록된 워크스페이스의 아카이브된 영구적 세션을 첨부 파일로 내보냅니다. `workspace_archived_session_export`를 프리플라이트합니다; 활성 내보내기 또는 다중 핵심 기능에서 지원을 추론할 수 없습니다. 워크스페이스 선택자 해결 및 신뢰 검사는 세션 id 및 형식 검증 전에 실행됩니다.

TypeScript SDK 호출자는 `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`를 사용합니다. 이 메서드는 항상 네이티브 REST를 사용하며 기존 `DaemonSessionExportResult` 첨부 프로젝션을 반환합니다.

선택적 `format` 쿼리, 응답 본문, MIME 타입, 정리된 파일 이름, 캐시 정책, 보안 헤더, 그리고 첨부 처분은 활성 워크스페이스 내보내기와 동일합니다. 아카이브 소스 JSONL은 재구성 전 256 MiB로 제한됩니다; 더 큰 파일은 `sessionId`, `snapshotSize`, 그리고 `maxBytes`와 함께 `413 transcript_too_large`를 반환합니다. 활성 내보내기는 기존 크기 동작을 유지합니다.

이 라우트는 공유 아카이브 코디네이터 리스 하에서 선택된 신뢰 워크스페이스의 `chats/archive/<id>.jsonl`만 읽습니다. 활성 콘텐츠에서 폴백을 검사하거나, 다른 워크스페이스를 스캔하거나, 활성 소유자를 해결하거나, 브리지를 호출하거나, ACP를 시작하거나, 클라이언트를 첨부하거나, 설정을 로드하지 않습니다. 활성 전용 id는 `409 { code: "session_not_archived" }`를 반환하고, 누락된 id는 `404 { code: "session_not_found" }`를 반환하며, 동시 활성 및 아카이브 파일은 `409 session_conflict`를 반환하고, 아카이브 전환은 `Retry-After: 5`와 함께 `409 session_archiving`를 반환합니다.

### `POST /session/:id/resume`

영구적 ACP 세션을 id로 복원하지만 히스토리를 SSE로 리플레이하지 **않습니다**. 모델 컨텍스트는 에이전트 측에서 내부적으로 복원됩니다(`geminiClient.initialize`가 `config.getResumedSessionData`를 읽는 방식); SSE 스트림은 이미 히스토리가 렌더링된 클라이언트를 위해 깨끗하게 유지됩니다. `caps.features.session_resume`를 프리플라이트합니다; `unstable_session_resume`는 이전 클라이언트를 위한 지원 중단된 호환성 별칭으로 남아 있습니다.

`/load`와 동일한 요청 형태입니다. 동일한 응답 형태 — `state`는 ACP의 `ResumeSessionResponse`를 미러링합니다. 동일한 오류 인벨롭, `409 restore_in_progress` 포함(이는 `session/load`가 진행 중일 때 발생합니다; 다른 `session/resume` 뒤에서 경쟁하는 `session/resume`은 합쳐집니다).

클라이언트에 히스토리가 렌더링되지 않았을 때(콜드 리커넥트, 피커 → 열기) `/load`를 사용합니다. 클라이언트에 이미 턴이 화면에 표시되고 데몬 측 핸들만 필요할 때 `/resume`을 사용합니다.

> ⚠️ **`unstable_session_resume`가 여전히 광고되는 이유는?** 데몬의 HTTP 라우트와 `session_resume` 기능은 v1에서 안정적이지만, 브리지는 여전히 ACP의 `connection.unstable_resumeSession`을 호출합니다. 이전 태그는 `session_resume` 이전에 출시된 SDK가 계속 작동할 수 있도록 유지됩니다.

### `GET /workspace/:id/session-info` 및 `GET /workspaces/:workspace/session-info`

페이지네이션된 세션 목록 경로를 변경하지 않고 선택된 워크스페이스에 대한 영구적 세션 집계 카운트를 반환합니다:

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`active`, `archived`, `total`은 로컬 JSONL 세션을 카운트합니다. `live`는 일치하는 인메모리 브리지 카운트이며 등록된 신뢰되지 않는 보조 워크스페이스에서는 생략됩니다 — 해당 영구적 전용 읽기는 활성 상태를 조회하면 안 되기 때문입니다. `expensive`는 항상 `true`이고 `cost`는 항상 `"disk_scan"`입니다; 클라이언트는 이 엔드포인트를 자주 호출하지 말고 폴링하지 않아야 합니다. 스캔이 안전 제한에 도달하거나 모든 후보 파일을 분류할 수 없으면 응답에 `"truncated": true`가 추가되고 영구적 카운트는 하한이 됩니다. 누락된 스토리지는 0의 영구적 카운트를 반환합니다. 다중 라우트는 다중 세션 카탈로그와 동일한 워크스페이스 선택자 및 신뢰 정책을 사용합니다; 신뢰되지 않는 기본은 여전히 `403 untrusted_workspace`를 반환합니다.

TypeScript 데몬 SDK는 `workspaceById(...)` 또는 `workspaceByCwd(...)`를 통해 다중 라우트를 노출하며, 이어서 `getWorkspaceSessionInfo()`를 호출합니다.

### `GET /workspace/:id/sessions` 및 `GET /workspaces/:workspace/sessions`

정규화된 워크스페이스가 `:id` 또는 `:workspace`와 일치하는 세션을 나열합니다. 경로 파라미터는 먼저 정확한 워크스페이스 id로 해결되고 그 다음 URL 인코딩된 절대 cwd로 해결됩니다. 기본 워크스페이스는 기존 영구적/ 활성 병합을 포함합니다: 기본 목록은 `chats/`의 활성 세션입니다; `archiveState=archived`를 전달하면 `chats/archive/`에서 아카이브된 세션을 나열합니다. 신뢰되는 비기본 워크스페이스는 자체 `chats/` 스토어에서 활성 영구적 세션을 포함하고 중복 없이 일치하는 활성 요약과 병합합니다; 활성 영구적 세션이 없으면 라우트는 이전 활성 전용 커서 동작을 유지합니다. 신뢰되는 비기본 워크스페이스는 `archiveState=archived`, 정리된 `view=organized` 목록, 그리고 `group` 필터도 지원하며 자체 `chats/`, `chats/archive/`, 그리고 세션 조직 스토어에서 읽습니다; `view=organized&archiveState=archived` 조합 쿼리는 활성 병합 없이 아카이브된 세션만 반환합니다. 등록된 신뢰되지 않는 비기본 워크스페이스는 동일한 목록, 필터, 페이지네이션 형태를 지원하지만 영구적 항목만 반환합니다: 데몬은 활성 브리지를 조회하거나 펜딩 상호작용, 턴 오류, 또는 클라이언트 상태를 런타임에서 채우지 않습니다. `clientCount: 0` 및 `hasActivePrompt: false`와 같은 영구적 기본값은 와이어 호환성을 위해 유지됩니다. 누락된 스토리지는 빈 목록을 반환합니다. 다중 라우트는 신뢰되지 않는 기본에 대해 여전히 `403 { code: "untrusted_workspace" }`를 반환합니다; 레거시 기본 라우트는 기존 호환성 동작을 유지합니다. `archiveState=all`은 v1에서 지원되지 않습니다. 기본 및 영구적 지원 목록은 기존 숫자 `cursor` 의미를 유지합니다; 영구적 없는 신뢰 비기본 활성 폴백은 기존 불투명 활성 커서를 유지합니다.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

`workspace_qualified_rest_core`가 광고되면 워크스페이스 범위 세션 일괄 작업, 그룹 CRUD, 그리고 세션 조직 변경이 `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups`, 그리고 `/workspaces/:workspace/session/:id/organization` 아래에서 사용 가능합니다. 신뢰되지 않는 보조의 경우 그룹 GET이 여전히 사용 가능합니다; 모든 그룹, 세션, 그리고 조직 변경은 신뢰 게이트됩니다. 워크스페이스 없는 일괄 및 조직 변경 라우트는 호환성을 위해 기본 워크스페이스 전용으로 유지됩니다.

쿼리 파라미터:

| 필드           | 필수 | 참고                                                                                                                                                                                            |
| -------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | 아니오 | `active`(기본값) 또는 `archived`. 다른 값은 `400 { code: "invalid_archive_state" }`를 반환합니다.                                                                                              |
| `cursor`       | 아니오 | 이전 응답의 페이지네이션 커서.                                                                                                                                                                |
| `size`         | 아니오 | 페이지 크기. 잘못된 값은 `400 { code: "invalid_cursor" }` 또는 기존 페이지 크기 검증을 반환합니다.                                                                                              |
| `view`         | 아니오 | 레거시 최근 목록은 생략. `organized`는 서버 측 핀/그룹 순서를 옵트인하고 선택적 조직 필드를 추가합니다. 다른 값은 `400 { code: "invalid_session_view" }`를 반환합니다.                          |
| `group`        | 아니오 | `view=organized`와 함께만 의미 있음. `all`(기본값), `pinned`, `ungrouped`, 또는 커스텀 그룹 id. 알 수 없는 그룹 id는 `404 { code: "group_not_found" }`를 반환합니다.                            |

응답:

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

`view=organized`에서 데몬은 `<Storage.getProjectDir(cwd)>/session-organization.v1.json`을 읽고, 핀된 세션을 먼저 반환한 다음 활동 시간 내림차순, 그리고 안정적인 동점 처리를 위해 `sessionId`를 반환합니다. 정리된 커서는 불투명 base64url JSON이며 레거시 최근 목록과 재사용하면 안 됩니다. `pinned`는 그룹이 아닌 가상 필터입니다. `groupId: null`은 그룹 없음을 의미합니다. 아카이브된 세션은 조직 메타데이터를 유지하지만 `archiveState=archived&view=organized`는 여전히 아카이브된 세션만 반환합니다.

활동 순 커서 — 정리된 뷰 및 `parentSessionId` / `sourceType` 필터링 목록 — 는 스냅샷 격리되지 않으며, 신뢰되는 활성 목록은 행을 트랜스크립트 mtime과 활성 활동 워터마크 중 더 나중 값으로 정렬합니다. 활성 워터마크는 인메모리 전용이므로, 활성 항목이 두 페이지 가져오기 사이에 은퇴하면 세션의 키가 mtime으로 회귀할 수 있습니다. 커서는 이를 보상합니다: 활성 유도 키에서 이미 발행된 ID를 운반하며 — 행이 페이지 컬렉션에서 absent인 동안과 핀 뒤집기가 이를 다시 허용할 수 있는 동안 유지하고 — 패스의 나머지 동안 제외하므로, 활성 유도 키 이동은 패스당 세션을 최대 한 번 반환합니다. 보장은 운반 범위로 제한됩니다: 64개 ID로 제한되며(한 패스에서 초과 ID는 오류가 아닌 최대 1회 중복으로 저하되며), 핀 상태 변경 전에 발행된 영구적 전용 행은 운반되지 않으므로, 가져오기 사이의 핀 해제는 해당 행을 이 필드가 존재하기 전과 동일하게 두 번째로 반환할 수 있습니다. 페이지를 누적하는 호출자는 따라서 64 초과 경우뿐만 아니라 항상 `sessionId`로 행을 키해야 합니다. 동시 활동 아래에서 행은 이전과 동일하게 이동하거나 건너뛸 수 있습니다; 일관된 뷰가 필요한 호출자는 활동 변경 후 첫 페이지에서 다시 로드합니다.

`view=organized`에서 각 세션에 추가 필드가 나타날 수 있습니다:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

신뢰되는 활성 목록은 `clientCount` 및 `hasActivePrompt`와 같은 활성 데몬 오버레이 필드를 포함합니다. 신뢰되지 않는 보조 및 아카이브 목록은 스토리지만: 활성 오버레이 필드는 없거나 false로 유지되며, 아카이브 항목은 `isArchived`를 `true`로 설정합니다. 세션이 없으면 빈 배열(404 아님) — 세션 피커 UI가 워크스페이스가 유휴 상태라고 해서 오류를 내면 안 됩니다.

### `GET /workspaces/:workspace/sessions/live-state`

선택된 워크스페이스 런타임의 메모리 전용 활성 세션 스냅샷과 인메모리 카탈로그 버전을 반환합니다. 클라이언트가 `hasActivePrompt`, 대기 플래그, `clientCount`와 같은 휘발성 상태를 위해 `GET /workspaces/:workspace/sessions`에서 영구적 카탈로그를 폴링하는 것을 중단할 수 있습니다. `workspace_session_live_state`를 프리플라이트합니다; 이 태그는 `workspace_qualified_rest_core`와 독립적이므로 더 넓은 워크스페이스 REST 기능을 광고하는 이전 데몬은 이 라우트를 구현하지 않습니다. 선택자는 다른 다중 세션 라우트와 동일하게 정확한 워크스페이스 id로 먼저 해결되고, 정규화 후 URL 인코딩된 절대 cwd로 해결됩니다. 이 라우트는 기본 및 보조 런타임 모두 신뢰 전용입니다: 기본 런타임으로 폴백하지 않으며, 신뢰되지 않는 보조에게 한정된 카탈로그 읽기를 허용하는 Permissive-catalog 정책을 사용하지 않습니다. 엔드포인트는 쿼리 파라미터가 없고 세션 스토리지, 설정, 외부 명령, 또는 ACP 라운드트립을 수행하지 않으므로 비용이 영구적 세션 수와 JSONL 크기와 무관합니다; 기본 활성 세션 캡이 응답을 제한하며, 캡이 비활성화되면 비용은 활성 세션 수에만 비례합니다.

응답:

```json
{
  "v": 1,
  "catalogVersion": {
    "generation": "7eca3164-bce1-4f50-94d8-c842c480f213",
    "revision": 17
  },
  "sessions": [
    {
      "sessionId": "session-123",
      "clientCount": 1,
      "hasActivePrompt": true,
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v`는 응답 스키마 버전입니다. 모든 성공적인 응답에는 `Cache-Control: no-store`가 포함됩니다. `sessions`는 선택된 런타임에서 현재 활성인 세션의 전체, 페이지네이션되지 않은, 정렬되지 않은 집합입니다; 빈 활성 런타임은 `sessions: []`와 함께 `200`을 반환합니다. `clientCount`, `hasActivePrompt`, `isWaitingForPermission`, `isWaitingForUserQuestion`는 필수 와이어 필드이며, 누락된 선택적 브리지 값은 `0` 또는 `false`로 프로젝션됩니다. 표시 이름, 생성 시간, 조직, 그리고 소스 메타데이터와 같은 정적 카탈로그 필드는 의도적으로 제외되며 전체 카탈로그가 소유합니다. 활성 상태 행이 없으면 알려진 카탈로그 행의 휘발성 필드만 정리되며 영구적 카탈로그 행을 삭제하지는 않습니다.

`updatedAt`은 선택적 데몬 관측 활동 워터마크이며, 실행 상태에 도달한 프롬프트가 현재 브리지에서 형식적 터미널을 발행했을 때 존재합니다. 이러한 터미널당 정확히 한 번 진행됩니다 — 성공, 오류, 취소, 마감 모두 — 터미널 이벤트가 발행되기 전에 기록되며, 두 터미널이 하나의 벽 시계 밀리초에 도착하거나 벽 시계가 뒤로 가더라도 활성 세션당 엄격하게 증가합니다; 따라서 앞으로의 시계 점프는 벽 시간이 따라잡을 때까지 유지됩니다. 세션의 `createdAt`보다 이전이 절대 아닙니다: 첫 진행은 생성 시간에서 바닥값을 가지므로, 생성과 첫 터미널 사이의 벽 시계 롤백은 행이 이미 나열된 `createdAt` 뒤로 키를 설정할 수 없습니다. 프롬프트 승인, 큐 대기, 스트리밍 업데이트, 큐 전용 취소, 하트비트, 그리고 상호작용 대기는 이를 진행시키지 않습니다. 클라이언트는 완전한 카탈로그를 다시 로드하는 대신 이미 보유한 카탈로그 행의 최근성을 새로 고치기 위해 사용합니다. 영구적 확인이 아닙니다: 레코더는 턴 결과를 비동기로 기록하므로 이 값은 데몬이 실행 시도가 정착된 것을 관측했다는 것만 증명합니다. 브리지 세대 내 첫 실행 터미널 이전에는 없습니다 — 디스크에서 복원된 세션도 포함 — 따라서 부재는 지원 탐지가 아니며, 데몬 재시작이나 워크스페이스 런타임 교체가 새 브리지를 설치하면 사라집니다. 하나의 세션에 활성 요약과 영구적 요약이 모두 존재할 때 전체 카탈로그 응답은 더 나중의 유효한 타임스탬프를 보고하므로, 브리지 요약을 직접 반환하고 해당 병합이 없는 `GET /session/:id/status`는 목록 응답보다 이전 값을 보고할 수 있습니다.

`catalogVersion`은 데몬 관측 카탈로그 변경에 대한 동등성 토큰입니다. `generation`은 각 브리지 인스턴스와 함께 생성되는 무작위 UUID이며 데몬 재시작이나 워크스페이스 런타임 교체 시 변경됩니다; `revision`은 0에서 시작하여 세대 내에서 단조롭게 증가합니다. 지원되는 유일한 연산은 전체 쌍에 대한 동등성입니다: 같은 generation과 revision은 데몬 관측 카탈로그 변경이 없음을 의미하고, 어떤 차이든 전체 카탈로그를 다시 로드해야 함을 의미합니다. 클라이언트는 revision 산술을 수행하거나 세대를 걸쳐 revision을 비교하면 안 되며, 보수적인 추가 증분이 허용됩니다. 버전은 데몬이 관측한 카탈로그 멤버십 및 정적 메타데이터 변경을 커버합니다; 일반 턴 활동, 프롬프트 라이프사이클, 첨부/분리, 그리고 대기 상태 전환은 활성 스냅샷이 이미 해당 휘발성 필드를 taşı하므로 버전을 진행시키지 않습니다. 따라서 변경되지 않은 버전 아래에서 `updatedAt`이 변경되는 것은 유효하고 예상되며 데몬의 영구적 목록 캐시를 무효화하지 않습니다. 두 휘발성 오버레이 값은 의도적으로 두 신호 모두의 외부에 있습니다: 턴 오류 상태(`hasTurnError`/`turnError`)와 펜딩 상호작용 카운트/콘텐츠(`pendingInteractionCount`/`pendingInteractions`)는 버전을 진행시키지도 스냅샷에 나타나지도 않으므로, 이들이 필요한 클라이언트는 이 라우트에 의존하지 않고 세션별 이벤트 스트림이나 전체 카탈로그를 계속 읽어야 합니다; 두 필드 모두 구체적인 소비자가 필요할 때 와이어에 추가적으로 추가될 수 있습니다. 다른 데몬, TUI, 또는 외부 프로세스가 직접 기록한 변경은 관측되지 않으므로 클라이언트가 주기적 전체 카탈로그 폴링을 중단하면 해당 변경은 경계가 없는 발견 시간을 가지며 명시적 전체 다시 로드, 다른 관측된 카탈로그 변경, 리커넥트, 또는 데몬/런타임 교체 후에만 나타납니다.

클라이언트는 2-리드 악수로 카탈로그 번들을 조정합니다: 활성 상태 A를 읽고, 전체 세션 목록을 로드하고(클라이언트가 `session_organization`을 소비할 때 `GET /workspaces/:workspace/session-groups` 포함), 그 다음 활성 상태 B를 읽습니다. 동일한 A와 B 버전은 번들을 수락하고, 다른 버전은 카탈로그를 오래된 것으로 표시하고 빡빡한 재시도 루프에 들어가지 않고 최대 하나의 후행 다시 로드를 합칩니다. 모든 수락된 카탈로그 요청은 A 이후에 시작되어야 합니다 — A 이전에 시작된 요청이나 중복 제거된 프미스는 조정을 충족할 수 없습니다. 버전 기반 다시 로드는 워크스페이스당 단일 비행이며 0이 아닌 배경 최소 간격을 준수하므로 지속적인 카탈로그 변경이 활성 상태 폴링당 한 번의 전체 카탈로그 스캔을 유발하지 않습니다; 명시적 로컬 변경은 동일한 단일 비행 작업을 통해 즉시 새로 고침을 요청할 수 있습니다.

**오류:**

- `400` — 알 수 없거나, 잘못된 형태이거나, 중첩되었거나, 등록되지 않은 선택자에 대한 기존 선택자 검증 또는 `workspace_mismatch` 동작; 라우트는 알 수 없는 선택자를 기본 런타임으로 해결하지 않습니다.
- `403` — 신뢰되지 않는 기본을 포함한 모든 신뢰되지 않는 런타임에 대한 `untrusted_workspace`.
- `503` — 부트스트래핑, 전환, 드레이닝, 차단, 또는 제거된 런타임, 또는 요청 중에 종료되는 런타임 세대에 대한 `Retry-After`가 있는 `workspace_runtime_unavailable`.
- `500` — 예기치 않은 로컬 오류는 기존 브리지 오류 매핑을 사용합니다.

### `GET /workspace/:id/session-groups`

워크스페이스에 대한 사용자 정의 세션 그룹을 나열합니다. 단수 GET 선택자는 등록된 모든 워크스페이스 id 또는 URL 인코딩된 정규 cwd를 허용합니다. 다중 GET 별칭은 신뢰되지 않는 보조도 사용 가능하며 조직 사이드카만 읽습니다. 다중 그룹 변경은 계속 신뢰 게이트를 거치며, 단수 그룹 변경은 기본 전용 호환성 동작을 유지합니다. `caps.features.includes('session_organization')`를 프리플라이트합니다.

응답:

```json
{
  "groups": [
    {
      "id": "018f...",
      "name": "Frontend",
      "color": "blue",
      "order": 0,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:00:00.000Z"
    }
  ],
  "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
}
```

색상은 프로토콜 토큰일 뿐입니다; 클라이언트가 표시 이름을 현지화합니다. 기본 색상 이름 그룹은 생성되지 않습니다.

### `POST /workspace/:id/session-groups`

커스텀 세션 그룹을 생성합니다. 엄격한 변경 게이트. `caps.features.includes('session_organization')`를 프리플라이트합니다.

요청:

```json
{ "name": "Frontend", "color": "blue" }
```

`name`은 정리되며, 1-64자여야 하고, 제어 문자를 포함할 수 없으며, 워크스페이스 내에서 대소문자 무시 정리 비교로 고유해야 합니다. 중복 이름은 `409 { code: "group_name_conflict" }`를 반환합니다. `color`는 반환된 `colorOptions` 중 하나여야 합니다.

응답:

```json
{
  "group": {
    "id": "018f...",
    "name": "Frontend",
    "color": "blue",
    "order": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `PATCH /workspace/:id/session-groups/:groupId`

커스텀 세션 그룹을 업데이트합니다. 엄격한 변경 게이트. `caps.features.includes('session_organization')`를 프리플라이트합니다. 본문 필드는 선택적입니다: `{ "name"?: string, "color"?: string, "order"?: number }`. 알 수 없는 그룹 id는 `404 { code: "group_not_found" }`를 반환합니다; 중복/잘못된 이름과 색상은 생성과 동일한 오류를 사용합니다.

### `DELETE /workspace/:id/session-groups/:groupId`

커스텀 세션 그룹을 삭제합니다. 엄격한 변경 게이트. `caps.features.includes('session_organization')`를 프리플라이트합니다. 그룹을 참조하는 세션은 `groupId: null`로 정리되며 핀 상태는 유지됩니다. 그룹이 제거되면 `{ "deleted": true }`를, id가 존재하지 않으면 `{ "deleted": false }`를 응답합니다.

### `POST /sessions/delete`

하나 이상의 영구적 세션 JSONL 파일을 하드 삭제합니다. 데몬은 먼저 활성 세션을 최선 노력으로 닫은 다음 활성 또는 아카이브 JSONL을 제거합니다. 같은 id에 대한 활성 및 아카이브 사본이 모두 존재하면 둘 다 제거됩니다. 양측의 worktree 사이드카가 정리되며, 파일 히스토리, 서브에이전트 트랜스크립트, 그리고 런타임 사이드카는 의도적으로 유지됩니다.

요청:

```json
{ "sessionIds": ["<uuid>"] }
```

응답:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

하나 이상의 세션을 아카이브합니다. 아카이브는 삭제가 아닌 상태 전환입니다: JSONL이 `chats/<id>.jsonl`에서 `chats/archive/<id>.jsonl`로 이동합니다. 파일 히스토리, 서브에이전트 트랜스크립트, 그리고 런타임 사이드카는 그대로 유지됩니다. 세션이 활성이면 데몬은 엄격한 종료를 수행하고 ACP 에이전트의 close 핸들러가 채팅 기록을 플러시하도록 요구합니다; 종료나 플러시가 실패하면 JSONL은 이동되지 않습니다. `caps.features.session_archive`를 프리플라이트합니다.

요청:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

`sessionIds`는 최대 100개 id를 가진 비어 있지 않은 문자열 배열이어야 합니다. 중복은 축약됩니다.

응답:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts`는 선택 사항이며 기본값은 `false`입니다. 기본적으로 같은 id의 활성 및 아카이브 파일은 `errors`에 보고되며, 어느 복사본도 이동, 제거 또는 덮어쓰기되지 않습니다. 활성 세션을 아카이브하면 여전히 충돌을 분류하기 전에 위에서 설명한 엄격한 종료를 수행하므로, 해당 종료가 활성 트랜스크립트에 큐에 있는 레코드를 플러시할 수 있습니다. `resolveConflicts: true`이면, 아카이브는 아카이브된 복사본을 유지하고 활성 복사본을 제거하며, id를 `archived`와 `resolvedConflicts` 모두에 보고합니다. `errors` 항목은 `{ "sessionId": "<uuid>", "error": "message" }` 형태입니다.

라이프사이클 충돌은 일괄 항목 결과입니다: 워크스페이스 없는 및 워크스페이스 한정 라우트는 HTTP `200`과 `errors`의 충돌을 반환합니다. 이는 이전의 워크스페이스 한정 HTTP `409 session_conflict` 인벨롭을 대체합니다; 해당 라우트를 호출한 클라이언트는 일괄 응답을 검사해야 합니다. 내부 런타임 REST 일괄은 안전한 충돌 메시지를 보존하면서 다른 세션별 실패 세부사항의 보고를 계속 생략합니다.

### `POST /sessions/unarchive`

아카이브된 세션을 활성 디렉토리로 복원합니다. 이것만으로 세션이 재개되지는 않습니다; `chats/archive/<id>.jsonl`을 `chats/<id>.jsonl`로 다시 이동할 뿐입니다. 아카이브 해제 성공 후 클라이언트는 `POST /session/:id/load` 또는 `POST /session/:id/resume`을 호출할 수 있습니다.

요청:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

응답:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts`는 선택 사항이며 기본값은 `false`입니다. 기본적으로 동시에 존재하는 활성 및 아카이브 JSONL 파일은 `errors`에 충돌을 생성하며, 어느 복사본도 이동, 제거 또는 덮어쓰기되지 않습니다; 활성 전용 세션은 `alreadyActive`에 반환됩니다. `resolveConflicts: true`이면, 아카이브 해제는 활성 복사본을 유지하고 아카이브된 복사본을 제거하며, id를 `unarchived`와 `resolvedConflicts` 모두에 보고합니다. 같은 id에 대한 아카이브 또는 아카이브 해제가 진행 중이면 일괄 처리 시작 전 `409 session_archiving`를 반환합니다.

ACP-over-HTTP는 벤더 메서드 `_qwen/sessions/archive` 및 `_qwen/sessions/unarchive`를 통해 동일한 요청 및 응답 본문을 사용합니다. REST 라우트 테이블은 ACP 전송을 위해 `POST /sessions/archive` 및 `POST /sessions/unarchive`를 해당 메서드에 매핑합니다.

### 다중 워크스페이스 활성 세션 라우팅

`multi_workspace_sessions`가 광고되면 활성 세션 작업은 `sessionId`에서 워크스페이스를 식별합니다; 클라이언트는 URL에 워크스페이스 선택자를 추가하지 않습니다. 기존 소유자 라우팅된 라이프사이클 작업에 더해, 이는 `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, 그리고 `DELETE /session/:id/artifacts/:artifactId`에도 적용됩니다. 데몬은 각 요청을 활성 세션을 소유한 신뢰 런타임으로 라우팅합니다. 신뢰되지 않는 비기본 소유자는 `403 untrusted_workspace`를 반환하고, 누락된 활성 소유자는 `404 session_not_found`를 반환하며, 모호한 소유자는 `500 ambiguous_session_owner`로 실패합니다.

이 규칙은 활성 세션 전용이며 모든 워크스페이스 없는 세션 라우트를 다중 워크스페이스 인식으로 만들지는 않습니다. 영구적 또는 아카이브 작업은 문서화된 워크스페이스 한정 라우트를 사용합니다. `POST /session/:id/branch`, `POST /session/:id/fork`, 그리고 `POST /session/:id/cd`는 의도적으로 기본 전용으로 유지되며 비기본 소유자에 대해 `non_primary_session_route_not_supported`를 반환합니다.

### 턴 중간 메시지

`POST /session/:id/mid-turn-message`는 `{ "message": "...", "messageId": "<optional-message-id>" }`를 허용합니다. 성공적인 수락은 `{ "accepted": true, "messageId": "<id>" }`를 반환하고 소유권을 데몬으로 이전합니다: 메시지는 활성 턴으로 드레인되거나 세션이 유휴 상태가 되면 일반 프롬프트 FIFO로 승격됩니다. `session_mid_turn_message_query`를 사용하는 클라이언트는 안정적인 `messageId`를 전송합니다; 이를 반복하면 큐에 있거나 펜딩 상태이거나 한정된 조정 링에 있는 동안 멱등적입니다. 가득 찬 큐는 소유권을 가져가지 않고 새 요청을 거부합니다. 이전 데몬에 연결된 새 클라이언트는 누락된 기능을 감지하고 레거시 로컬 폴백을 유지합니다.

`GET /session/:id/mid-turn-messages`는 세션 전체 데몬 소유 큐와 한정된 `settledMessageIds` 및 `promotedMessageIds` 링을 반환합니다. 정산된 id는 주입되거나 명시적으로 삭제되었습니다; 승격된 id는 일반 프롬프트 FIFO에 진입했습니다. 어느 링에 있는 id도 재전송하면 안 됩니다.

큐에 있는 메시지가 활성 턴으로 드레인될 때 데몬은 정렬된 `messages` 및 `messageIds` 배열(그리고 알려진 경우 실행 중 턴의 `promptId`)을 taşı는 `mid_turn_message_injected`를 발행합니다. 이는 영구적 트랜스크립트 항목이 아닌 일시적 중복 제거 신호입니다: 클라이언트는 해당 메시지 id로 등록된 완료 콜백을 정산하고 로컬 펜딩 행을 삭제합니다. 이전 데몬은 페이로드에 `originatorClientId`도 포함합니다. 놓친 에코는 위의 쿼리를 통해 정산 링에서 복구됩니다.

`session_mid_turn_message_mutation`이 광고되면 첨부된 세션 클라이언트는 `DELETE /session/:id/mid-turn-messages/:messageId`를 호출할 수 있습니다. 턴 중간 큐나 승격된 펜딩 프롬프트 상태에서 메시지를 제거합니다; 이미 실행 중인 승격된 메시지를 제거하면 해당 턴이 중단되어 일반 펜딩 프롬프트 제거와 일치합니다. 데몬 소유 큐 추가 및 제거는 기존 `pending_prompt_added` 및 `pending_prompt_completed` 세션 이벤트를 발행하여 첨부된 클라이언트가 두 권위 있는 큐 스냅샷을 새로 고칩니다. `{ "removed": false }`는 메시지가 이미 주입되었거나, 완료되었거나, 찾을 수 없었음을 의미합니다.

### `POST /session/:id/prompt`

에이전트에 프롬프트를 전달합니다. 다중 프롬프트 호출자는 세션별로 FIFO 대기열에 들어갑니다(ACP는 세션당 하나의 활성 프롬프트를 보장).

요청:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }],
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

`delivery`는 선택적이며 `channel_delivery` 기능이 필요합니다. 데몬은 프롬프트가 수락될 때 여전히 `202 {promptId,lastEventId}`를 반환합니다. 성공적인 `end_turn` 후 세션은 보이는 최종 텍스트를 정확히 해당 워크스페이스의 이미 실행 중인 Channel Worker에 제출합니다. 페이로드는 도구 없는 마지막 어시스턴트 응답 블록만입니다; 도구 호출 서문, 도구 간 내레이션, 대체된 재시도, 그리고 이전 자동 계속 블록은 제외됩니다. 비거나 공백만의 최종 텍스트도 인증이 소비된 후 `status: "skipped"`를 가진 상관된 `channel_delivery_result`를 생성하지만 워커에 연락하지 않습니다. 전달 성공 또는 실패는 나중에 동일한 리플레이 가능 이벤트를 통해 도착하며 `turn_complete`를 `turn_error`로 변경하지는 않습니다. 취소, 에이전트 실패, 그리고 토큰 제한 종료는 전달 결과를 보내거나 발행하지 않습니다.

검증: `prompt`는 객체의 비어 있지 않은 배열이어야 합니다. 다른 실패는 브리지에 도달하기 전에 `400`을 반환합니다.

응답:

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

`202` 응답은 수락을 확인하며 에이전트 완료가 아닙니다. `lastEventId` 이후 세션 SSE 스트림을 관측하고 `promptId`로 `turn_complete` 또는 `turn_error`를 상관시킵니다. `turn_complete.data.stopReason`은 `end_turn`, `cancelled`, `max_tokens`, `error`, 또는 `length`일 수 있습니다.

HTTP 클라이언트가 프롬프트 중간에 연결을 끊으면 데몬은 에이전트에 ACP `cancel` 알림을 보내며 프롬프트는 `stopReason: "cancelled"`로 정리됩니다.

`prompt_absolute_deadline`이 광고되면 `deadlineMs`가 구성된 서버 마감 시간을 단축할 수 있습니다. 만료 시 `errorKind: "prompt_deadline_exceeded"`를 가진 상관된 `turn_error`가 발행됩니다. 마감은 에이전트를 죽이지 않고 호출자를 해제합니다; 에이전트가 나중에 정착하면 해당 `promptId`에 대한 턴 상태 폴링은 마감 오류 대신 정착된 트랜스크립트 결과를 반환합니다.

### `POST /session/:id/cancel`

세션에서 **현재 활성** 프롬프트를 취소합니다. ACP 측에서 이것은 요청이 아닌 알림입니다 — 에이전트는 활성 `prompt()`를 `cancelled`로 해결하여 응답합니다.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **다중 프롬프트 계약:** 취소는 활성 프롬프트에만 영향을 미칩니다. 같은 클라이언트가 이전에 POST했고 활성 프롬프트 뒤에서 큐에 있는 프롬프트는 계속 실행됩니다. 다중 프롬프트 큐잉은 데몬이 도입한 동작입니다(ACP 사양에 없음); 큐에 있는 프롬프트에 대한 계약은 "각각 취소하거나 채널 종료를 통해 세션을 종료하지 않는 한 계속 실행됩니다"입니다.

다중 클라이언트 배포에서 큐에 있는 프롬프트가 예상되지 않으면 먼저 호출자가 기본 `sessionScope: "single"` 세션을 공유하고 있는지 확인합니다. 스레드별 독립 대화를 위해 `sessionScope: "thread"`로 세션을 생성하면 해당 스레드 내에서만 프롬프트가 직렬화됩니다.

### `DELETE /session/:id`

활성 세션을 명시적으로 종료합니다. 다른 클라이언트가 첨부되어 있어도 강제 종료합니다 — 활성 프롬프트를 취소하고, 펜딩 권한을 취소로 해결하고, `session_closed` 이벤트를 발행하고, EventBus를 닫고, 데몬 맵에서 세션을 제거합니다. 온디스크 영구적 세션은 삭제되지 **않습니다** — `POST /session/:id/load`를 통해 다시 로드할 수 있습니다. `caps.features.session_close`를 프리플라이트합니다.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

멱등적입니다: 알 수 없는 세션에 대해 `404`를 반환합니다. 오류 인벨롭은 `code: "session_not_found"`를 사용합니다; 동시 종료가 `code: "session_closing"`를 반환할 수 있으며 클라이언트는 이를 이 라우트에 대해 동일한 성공적 종료 상태로 처리할 수 있습니다.

> **`session_closed` 이벤트.** SSE 구독자는 스트림이 끝나기 전에 `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`를 가진 종단 `session_closed` 이벤트를 받습니다. SDK 리듀서는 이를 `session_died`와 동일하게 처리합니다(`alive: false` 설정, `pendingPermissions` 정리).

### `PATCH /session/:id/metadata`

변경 가능한 세션 메타데이터를 업데이트합니다. 현재 `displayName`만 지원합니다. `caps.features.session_metadata`를 프리플라이트합니다. 그룹핑 및 핀 고정은 의도적으로 이 라우트의 일부가 아닙니다; `session_organization` 아래에서 `PATCH /session/:id/organization`을 사용하십시오.

요청:

```json
{ "displayName": "My Investigation Session" }
```

| 필드          | 필수 | 참고                                                     |
| ------------- | ---- | -------------------------------------------------------- |
| `displayName` | 아니오 | 문자열, 최대 256자. 빈 문자열은 이름을 정리합니다. 변경하지 않으려면 생략합니다. |

응답:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

세션의 SSE 스트림에 `{ sessionId, displayName }`와 함께 `session_metadata_updated` 이벤트를 발행합니다.

### `PATCH /session/:id/organization` 및 `PATCH /workspaces/:workspace/session/:id/organization`

기존 변경 게이트를 통해 로컬 세션 조직 상태를 업데이트합니다. `caps.features.includes('session_organization')`를 프리플라이트합니다; 다중 라우트는 추가로 `workspace_qualified_rest_core`가 필요합니다. 다중 라우트에서 `:workspace`는 먼저 정확한 등록된 워크스페이스 id로 해결되고 그 다음 URL 인코딩된 정규 절대 cwd로 해결됩니다. 선택된 런타임은 신뢰되어야 합니다. 세션 존재 및 null이 아닌 `groupId` 검증은 해당 런타임의 활성 영구적, 아카이브된 영구적, 그리고 활성 세션 상태 및 그룹 스토어로 범위가 지정되며 기본이나 다른 워크스페이스로 폴백하지 않습니다. 레거시 라우트는 기본 워크스페이스 전용으로 유지됩니다.

요청:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| 필드       | 필수 | 참고                                                                                                   |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------ |
| `isPinned` | 아니오 | 불리언. `true`는 아직 핀되지 않았으면 `pinnedAt`을 설정합니다; `false`는 `pinnedAt`을 정리합니다.      |
| `groupId`  | 아니오 | 커스텀 그룹 id 또는 그룹 해제의 `null`. 알 수 없는 그룹 id는 `404 { code: "group_not_found" }`를 반환합니다. |
| `color`    | 아니오 | 지원되는 세션 색상 토큰, 또는 세션 색상을 정리하는 `null`.                                            |

응답:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "color": "blue",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

이 상태는 데몬 런타임 스토리지 디렉토리 하위의 프로젝트 레벨 세션 조직 사이드카에 저장됩니다. 트랜스크립트 콘텐츠가 아니며, 트랜스크립트 `mtime`을 업데이트하지 않고, 트랜스크립트와 함께 export되지 않으며, 아카이브/아카이브 해제 간에도 유지됩니다.

### `POST /session/:id/heartbeat`

이 세션에 대한 데몬의 마지막 확인 기록을 갱신합니다. 장수 어댑터(TUI/IDE/웹)는 간격별로 이것을 핑하여 향후 폐지 정책(Wave 5 PR 24)이 죽은 클라이언트와 조용한 클라이언트를 구별할 수 있도록 합니다.

헤더:

| 헤더               | 필수 | 참고                                                                                                                                                                                                                                   |
| ------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | 아니오 | `POST /session`에서 데몬이 발급한 id를 에코합니다. 식별된 클라이언트는 클라이언트별 타임스탬프도 갱신합니다; 익명 하트비트는 세션별 워터마크만 갱신합니다. 다른 곳과 동일한 `[A-Za-z0-9._:-]{1,128}` 형태를 만족해야 합니다. |

요청 본문은 비어 있습니다(`{}`도 괜찮습니다 — 현재 읽히는 필드가 없습니다).

응답:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId`는 신뢰된 `X-Qwen-Client-Id`가 제공되었을 때만 에코됩니다. `lastSeenAt`은 브리지가 저장한 데몬 측 `Date.now()` 에포크(ms)입니다.

오류:

- `400` — 헤더가 잘못된 형태일 때(헤더 형태 규칙) 또는 이 세션에 등록되지 않은 `clientId`를 taşı할 때(브리지가 타임스탬프를 갱신하기 전에 `InvalidClientIdError`를 throw) `{ code: 'invalid_client_id' }`.
- `404` — 알 수 없는 세션.

기능 게이트: `caps.features.client_heartbeat`를 프리플라이트합니다. 이전 데몬은 이 경로에 대해 `404`를 반환합니다.

### `POST /session/:id/model`

세션의 현재 바인딩된 모델 서비스 **내부에서** 활성 모델을 전환합니다. 세션별 모델 변경 큐를 통해 직렬화됩니다.

(_서비스 자체_를 전환하려면 — Alibaba ModelStudio vs OpenRouter 등 — 새 세션에 대해 `POST /session`에서 `modelServiceId`를 전달합니다. Stage 1에는 활성 서비스 전환 라우트가 없습니다.)

요청:

```json
{ "modelId": "qwen-staging" }
```

응답:

```json
{ "modelId": "qwen-staging" }
```

성공 시 SSE 스트림에 `model_switched`를 발행합니다. 실패 시 `model_switch_failed`를 발행합니다(수동적 구독자도 호출자뿐만 아니라 실패를 볼 수 있도록). 에이전트 채널 종료와 경쟁하여 끼인 자식이 HTTP 핸들러를 차단하지 못합니다.

### `POST /session/:id/recap`

기능 태그: `session_recap`. 브리지 → ACP extMethod `qwen/control/session/recap`.

세션에 대한 "어디서 멈췄는지" 한 문장 요약을 생성합니다. 코어의 `generateSessionRecap`(`packages/core/src/services/sessionRecap.ts`)을 래핑하며, 이는 도구가 비활성화된 빠른 모델에 대해 사이드 쿼리를 실행합니다: `maxOutputTokens: 300`, 엄격한 `<recap>...</recap>` 출력 형식. 사이드 쿼리는 세션의 기존 GeminiClient 채팅 히스토리를 읽으며 이에 추가하지 **않습니다**.

요청 본문은 무시됩니다(`{}` 또는 빈 값을 전송). 비엄격 변경 게이트 — 자세는 `/session/:id/prompt`를 미러링합니다(호출은 토큰이 들지만 상태를 변경하지 않음). SSE 이벤트가 발행되지 않습니다.

응답 (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap`은 다음과 같은 경우 `null`입니다(정상 200, 오류 아님):

- 세션에 아직 두 개 미만의 대화 턴이 있는 경우,
- 사이드 쿼리에서 추출 가능한 `<recap>...</recap>` 페이로드가 반환되지 않은 경우,
- 또는 기본 모델 오류가 발생한 경우(코어 헬퍼는 최선 노력이며 절대 throw하지 않음).

오류:

- `400 {code: 'invalid_client_id'}` — 잘못된 `X-Qwen-Client-Id` 헤더.
- `404` — 세션을 알 수 없음.

취소: **v1에서는 없음**. 이 라우트는 HTTP 클라이언트 연결 끊기를 수신하지 않으며, `AbortSignal`이 브리지로 배관되지 않고, ACP 자식이 호출자가 연결을 끊었는지와 관계없이 사이드 쿼리를 완료까지 실행합니다. 유일한 상한은 브리지의 60초 백스톱 타임아웃(`SESSION_RECAP_TIMEOUT_MS`)과 ACP 채널 사망에 대한 전송 닫힘 경쟁입니다. 이것은 recap이 짧기 때문에 허용됩니다(단일 시도, `maxOutputTokens: 300`, ~1–5초 일반적); 대역폭 비용이 정당화되면 향후 릴리스에서 요청 id 기반 취소 ext-method가 완전한 종단 간 취소를 배관할 수 있습니다.

### `POST /session/:id/generate`

기능 태그: `session_generation`.

호출자가 제공한 프롬프트에서 요청 범위 텍스트 생성을 실행합니다. 요청은 대화 히스토리를 읽거나 변경하지 않으며 도구를 노출하지 않습니다. 구성된 빠른 모델을 선호하며, 빠른 모델이 없거나 해결할 수 없으면 세션의 기본 모델로 폴백합니다. 엔드포인트는 작업에 무관합니다; 번역은 호출자가 정의한 가능한 프롬프트 중 하나일 뿐입니다.

요청:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

응답은 `text/event-stream`입니다. 서버는 즉시 초기 SSE 주석을 쓰고, 그 뒤에 `started`, 선택적 `thinking` 진행 이벤트, 0개 이상의 `delta` 이벤트, 그리고 `done`을 씁니다. `thinking` 이벤트는 추론 콘텐츠를 taşı하지 않습니다. 스트리밍 시작 후 모델 실패는 `error` 이벤트를 생성합니다; 다른 모델로 재시도하지 않습니다. 프롬프트는 32 KiB의 UTF-8 텍스트로 제한됩니다. HTTP 클라이언트 연결을 끊으면 생성 요청이 취소됩니다.

### 변경: approval, tools, skills, init, MCP 재시작

데몬은 원격 클라이언트가 데몬 호스트의 CLI를 건드리지 않고 런타임 자세를 변경할 수 있는 다섯 가지 변경 제어 라우트를 노출합니다. 다섯 라우트 모두:

- PR 15의 **엄격한** 변경 게이트로 게이트됩니다. 베어러 토큰 없이 구성된 데몬은 `401 {code: 'token_required'}`로 거부합니다. 옵트인 전에 `--token`(또는 `QWEN_SERVER_TOKEN`)을 구성하십시오.
- `X-Qwen-Client-Id` 헤더를 수락하고 스탬프합니다(PR 7 감사 체인). 헤더가 신뢰된 id를 taşı면 데몬은 해당 SSE 이벤트에 `originatorClientId`를 발행하여 크로스 클라이언트 UI가 자체 변경의 에코를 억제할 수 있도록 합니다.
- 기능을 노출하기 전에 태그별 기능을 프리플라이트합니다. 이전 데몬은 라우트에 대해 `404`를 반환합니다.

도구 토글, skill 토글, init, 그리고 MCP 재시작 라우트는 **워크스페이스 범위** 이벤트를 발행합니다: 어떤 세션이 첨부되었든 모든 활성 세션 SSE 버스가 이벤트를 받습니다. `approval-mode`는 **세션 범위** 이벤트를 발행합니다 — 변경이 하나의 세션 `Config`에 로컬이기 때문입니다.

#### `POST /session/:id/approval-mode`

기능 태그: `session_approval_mode_control`. 브리지 → ACP extMethod `qwen/control/session/approval_mode`.

활성 세션의 승인 모드를 변경합니다. 새 모드는 ACP 자식의 세션별 `Config`에 즉시 반영됩니다. 설정은 기본적으로 디스크에 기록되지 **않습니다** — `persist: true`를 전달하면 `tools.approvalMode`를 워크스페이스 설정에도 기록합니다.

요청:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode`는 `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` 중 하나여야 합니다(코어의 `ApprovalMode` 열거형 미러; SDK는 런타임 검증을 위해 `DAEMON_APPROVAL_MODES`를 내보냅니다). `persist`의 기본값은 `false`입니다.

응답 (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

오류:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 알 수 없는 모드 리터럴.
- `400 {code: 'invalid_persist_flag'}` — `persist`가 비불리언.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 요청된 모드가 신뢰 폴더를 필요로 함(신뢰되지 않는 워크스페이스의 특권 모드는 코어의 `Config.setApprovalMode`에 의해 거부됨).
- `404` — 세션을 알 수 없음.

SSE 이벤트(세션 범위): `{sessionId, previous, next, persisted, originatorClientId?}`와 함께 `approval_mode_changed`.

#### `POST /workspace/tools/:name/enable`

기능 태그: `workspace_tool_toggle`. 순수 파일 IO — ACP 라운드트립 없음.

워크스페이스의 `tools.disabled` 설정 목록에서 도구 이름을 토글합니다. 여기에 나열된 도구는 **등록되지 않습니다**(`permissions.deny`와 구별 — 이는 도구를 등록 상태로 유지하고 호출을 거부함). 내장 도구와 MCP 발견 도구 모두 `ToolRegistry.registerTool`을 통과하며, 이는 비활성 집합을 참조합니다.

> ⚠️ **이름은 레지스트리의 노출된 식별자와 정확히 일치해야 합니다.** 별칭 해결이 발생하지 않습니다 — 라우트는 경로 파라미터의 문자열을 `tools.disabled`에 저장하고, 다음 ACP 자식이 등록 시 `tool.name`와 비교합니다. 내장 도구는 정식 레지스트리 이름(snake_case 동사 형태)을 사용합니다: `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` 등 — CLI가 표시하는 레이블(`Shell`, `Read`, `Write`)이 **아닙니다**. MCP 발견 도구는 한정된 `mcp__<server>__<name>` 형태를 사용합니다(이는 `tool_toggled` 이벤트가 브로드캐스트하는 형태이며 `GET /workspace/mcp`가 나열하는 형태이기도 합니다). `Bash`를 비활성화해도 다음 세션에서 `run_shell_command`가 등록되는 것을 방지하지 **못합니다**.

활성 ACP 자식은 이미 등록된 도구를 유지합니다 — 토글은 **다음** ACP 자식 생성 시 적용됩니다. (MCP 소스 도구의 경우) `POST /workspace/mcp/:server/restart` 또는 새 세션 생성과 결합하여 현재 데몬에서 변경을 적용하십시오.

알 수 없는 도구 이름도 허용됩니다: 아직 설치되지 않은 MCP 도구를 미리 비활성화하는 것은 합법적인 사용 사례입니다.

요청:

```json
{ "enabled": false }
```

응답 (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

오류:

- `400 {code: 'invalid_tool_name'}` — 빈 경로 파라미터, 또는 경로 파라미터가 256자 캡을 초과.
- `400 {code: 'invalid_enabled_flag'}` — `enabled`가 없거나 비불리언.

SSE 이벤트(워크스페이스 범위): `{toolName, enabled, originatorClientId?}`와 함께 `tool_toggled`.

#### `POST /workspace/skills/:name/enable`

기능 태그: `workspace_skill_toggle`. 워크스페이스 한정 형태는 `POST /workspaces/:workspace/skills/:name/enable`입니다.

워크스페이스 skill 설정을 통해 로드된 사용자 호출 가능 skill을 토글하며, CLI `/skills` 패널의 Space 키 동작과 일치합니다. 조회는 대소문자를 무시하며, 영구화 및 응답은 skill의 정식 이름을 사용합니다. `skills.defaultDisabled` skill을 활성화하면 워크스페이스 `skills.enabled` 옵트인이 추가되고, 비활성화하면 해당 옵트인이 제거되고 워크스페이스 `skills.disabled` 항목이 추가됩니다. 더 이상 로드되지 않는 skill에 대한 기존 항목은 유지되며, 대상에 대한 중복/대소문자 변형 항목은 축약됩니다. 시스템 기본값, 사용자, 또는 시스템 범위에서 상속된 하드 비활성 항목은 skill을 잠급니다: 워크스페이스 범위는 이를 재정의할 수 없습니다.

이것은 ACP `qwen/skills/setEnabled` 관리 skill 작업 및 `disable-model-invocation` 프론트matter 필드와 다릅니다. 유효한 skill 가용성은 `skills.disabled` > `skills.enabled` > `skills.defaultDisabled`를 따릅니다. 하드 및 기본 비활성화 모두 슬래시 명령어/모델 가용성에서 skill을 제거하고 이후 skill 실행을 거부합니다. `disable-model-invocation: true`는 직접 사용자 호출을 가능하게 유지하고 모델 호출에서만 skill을 숨깁니다.

요청:

```json
{ "enabled": false }
```

응답 (200):

```json
{
  "skillName": "review",
  "enabled": false,
  "changed": true,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0
}
```

`activation`은 모든 활성 세션이 새로 고침되면 `applied`, ACP 자식이 없으면 `deferred`(하나가 시작될 때 영구적 설정이 사용됨), 하나 이상의 활성 세션이 새로 고침에 실패하면 `partial`입니다. 바쁜 세션도 포함됩니다. 데몬은 ACP 자식과 모든 활성 세션에 대해 워크스페이스 설정을 다시 로드하고, SkillManager 소비자에게 알리고, `available_commands_update`를 푸시합니다. 이미 모델로 전송된 요청은 다시 작성되지 않습니다; 후속 검증, 명령 스냅샷, 그리고 모델 컨텍스트는 새 상태를 사용합니다. 영구화에 실패하면 새로 고침이나 이벤트가 발행되지 않습니다. 세션 새로 고침에 실패하면 커밋된 설정이 유지됩니다. 자식이 세션별 결과를 반환하면 세션 카운트가 정확합니다. 새로 고침 제어 자체가 결과를 반환하기 전에 실패하면 `sessionsFailed: 1`은 새로 고침 요청이 실패했음을 나타내는 보수적 하한입니다.

오류:

- `400 {code: 'invalid_skill_name'}` — 빈 경로 파라미터, 또는 256자 초과.
- `400 {code: 'invalid_enabled_flag'}` — `enabled`가 없거나 비불리언.
- `403 {code: 'untrusted_workspace'}` — 선택된 워크스페이스가 신뢰되지 않음.
- `404 {code: 'skill_not_found'}` — 이름과 일치하는 로드된 skill이 없음.
- `409 {code: 'skill_not_toggleable', reason: 'not_user_invocable' | 'inactive_extension' | 'locked', lockedScope?: 'system' | 'user' | 'systemDefaults'}` — CLI 패널에서 대상을 토글할 수 없음. `lockedScope`는 `reason`이 `locked`일 때만 존재합니다.

이 변경은 변경된 키마다(`skills.disabled` 및/또는 `skills.enabled`) 워크스페이스 범위 `settings_changed` 이벤트를 재사용합니다; 새 이벤트 타입을 추가하지 않습니다. 각 이벤트는 동일한 `mutation` 객체를 포함합니다: `{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`. `id`는 하나의 토글 요청에서 생성된 모든 설정 이벤트를 상관시킵니다. `skills`는 실제로 변경된 Skill의 정식 이름과 결과 활성화 상태를 나열합니다. 워크스페이스 skill 상태 셀에는 선택적 `disabledReason: 'hard' | 'default' | 'inactive_extension'` 및 `lockedScope: 'system' | 'user' | 'systemDefaults'` 필드가 포함됩니다.

#### `POST /workspace/skills/enable`

기능 태그: `workspace_skill_batch_toggle`. 워크스페이스 한정 형태는 `POST /workspaces/:workspace/skills/enable`입니다.

하나의 요청에서 최대 100개의 로드된 Skill을 토글합니다; 캡은 중복 제거 전 원시 `skillNames` 항목을 카운트합니다. 이름은 정리되고 첫 발견 순서를 유지하면서 대소문자 무시로 중복 제거됩니다. 데몬은 하나의 Skill 상태 스냅샷에 대해 검증하고, 모든 유효한 변경을 하나의 잠긴 설정 쓰기로 영구화하며, 활성 세션을 한 번 새로 고칩니다. 처리는 예상 대상 오류에 대해 최선 노력입니다: 알 수 없거나, 숨겨지거나, 비활성 확장이거나, 잠긴 대상은 `errors`에 기록되며 다른 유효한 대상이 적용되는 것을 방지하지 않습니다. 예기치 않은 영속성 또는 런타임 생성 실패는 여전히 전체 요청을 실패시킵니다.

요청:

```json
{
  "skillNames": ["review", "deploy", "missing"],
  "enabled": false
}
```

응답 (200):

```json
{
  "enabled": false,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "results": [
    {
      "skillName": "review",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "deploy",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": [
    {
      "skillName": "missing",
      "code": "skill_not_found",
      "error": "Skill not found: missing"
    }
  ]
}
```

대상 오류는 `skill_not_found`, `skill_not_toggleable`, 또는 `skill_inactive_extension`을 사용합니다. 잘못된 요청은 `invalid_skill_names`, `invalid_skill_name`, 또는 `invalid_enabled_flag`와 함께 HTTP 400을 반환합니다. 인증, 워크스페이스 신뢰, 클라이언트 정체성, 예기치 않은 영속성 실패, 그리고 런타임 생성 실패는 표준 라우트 게이트를 통해 전체 요청을 실패시킵니다. 일괄 수준의 `activation`, `sessionsRefreshed`, 그리고 `sessionsFailed`는 모든 변경된 결과가 공유하는 단일 활성 세션 새로 고침을 설명합니다. `activation`은 결과가 아닌 새로 고침 시도를 보고합니다: 대상이 변경되지 않은 일괄(예: 모든 대상에 오류)도 세션이 활성이면 `applied`로 응답하며, 단일 Skill no-op 응답과 일치하므로 실제로 변경된 내용은 각 결과의 `changed` 플래그와 `errors` 배열에서 파생합니다. 하나 이상의 대상이 변경되면 데몬은 단일 Skill 라우트와 동일한 `settings_changed` 변경 메타데이터를 발행합니다; 해당 요청의 모든 `skills.disabled` / `skills.enabled` 이벤트는 하나의 `mutation.id`를 공유합니다.

#### `POST /workspace/init`

기능 태그: `workspace_init`. 순수 파일 IO — ACP 라운드트립 없음, **LLM 호출 없음**.

데몬의 기본 워크스페이스 루트에 빈 `QWEN.md`(또는 `--memory-file-name` 재정의 아래에서 `getCurrentGeminiMdFilename()`이 반환하는 것)를 스캐폴딩합니다. 기계적 작업뿐입니다 — AI 기반 콘텐츠 채우려면 `POST /session/:id/prompt`를 후속 호출하십시오.

기본값은 대상 파일이 비공백 콘텐츠로 존재할 때 덮어쓰기를 거부합니다. 공백만의 파일은 없는 것으로 처리됩니다(로컬 `/init` 슬래시 명령어와 일치).

요청:

```json
{ "force": false }
```

응답 (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action`은 새로 생성하면 `'created'`, 기존 공백만의 파일을 건드리지 않으면 `'noop'`(쓰기 수행 안 함), `force: true`가 비어 있지 않은 콘텐츠를 대체하면 `'overwrote'`입니다. `workspace_initialized` SSE 이벤트는 응답 작업을 미러링합니다 — 관찰자는 실제 온디스크 변경에만 반응하려면 `action !== 'noop'`로 필터링할 수 있습니다.

오류:

- `400 {code: 'invalid_force_flag'}` — `force`가 비불리언.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 파일이 비공백 콘텐츠로 존재하고 `force`가 생략/false. 본문은 SDK 클라이언트가 다시 stat하지 않고 "N 바이트를 덮어쓰시겠습니까?" 프롬프트를 렌더링할 수 있도록 절대 경로와 크기(바이트)를 taşı합니다.

SSE 이벤트(워크스페이스 범위): `{path, action, originatorClientId?}`와 함께 `workspace_initialized`.

#### `POST /workspace/mcp/reload`

영구적 MCP 설정을 워크스페이스 검색 구성과 모든 활성 세션으로 다시 로드합니다. 워크스페이스 한정 형태는 `POST /workspaces/:workspace/mcp/reload`입니다.

요청 본문:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll`은 선택적이며 기본값은 `false`로, 증분 조정을 유지합니다. true이면 데몬은 설정 조정 후 자격이 되는 모든 구성된 MCP 서버에 재연결합니다. 대안으로 `forceReconnectWhich: ["server-a", "server-b"]`를 전달하면 이름 지정된 서버만 재연결합니다. 옵션은 상호 배타적입니다. 강제 재연결은 각 전송이 다른 로컬 Qwen Code 프로세스가 토큰 스토리지에 썼을 수 있는 자격 증명을 읽게 합니다; OAuth 인증 흐름을 시작하지는 않습니다.

라우트는 `202 { "accepted": true }`를 반환합니다; 최종 연결 상태는 `GET /workspace/mcp`를 폴링하십시오. 잘못된 옵션 값은 400을 반환합니다.

#### `POST /workspace/mcp/:server/restart`

기능 태그: `workspace_mcp_restart`. 브리지 → ACP extMethod `qwen/control/workspace/mcp/restart`.

ACP 자식의 `McpClientManager.discoverMcpToolsForServer`(연결 끊기 + 재연결 + 재발견)를 통해 구성된 MCP 서버를 재시작합니다. PR 14 v1의 회계에서 활성 예산 스냅샷을 사전 확인하므로 예산 포화 워크스페이스에서의 재시작은 `BudgetExhaustedError` 캐스케이드를 촉발하지 않고 소프트 거부를 반환합니다.

요청 본문은 비어 있습니다(`{}`). 경로 파라미터는 `mcpServers` 구성에 나타나는 URL 인코딩된 서버 이름입니다.

응답 (200) — `restarted`에 대한 판별 유니언:

```json
{ "serverName": "docs", "restarted": true, "durationMs": 1234 }
```

```json
{
  "serverName": "docs",
  "restarted": false,
  "skipped": true,
  "reason": "budget_would_exceed"
}
```

소프트 스킵 이유(모두 200 반환):

| `reason`                | 의미                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | 이 서버에 대한 다른 발견/재시작이 이미 진행 중입니다. 라우트는 원본 프미스를 대기하지 않고 즉시 반환합니다. 호출자는 짧은 지연 후 재시도해야 합니다.                                  |
| `'disabled'`            | 서버가 구성되어 있지만 `excludedMcpServers`에 나열되어 있습니다. 재시작 전에 다시 활성화하십시오.                                                                                     |
| `'budget_would_exceed'` | 데몬이 `--mcp-budget-mode=enforce`이고, 대상 서버가 현재 `reservedSlots`에 없으며, 활성 합계가 `clientBudget`에 도달했습니다. 호출자는 먼저 슬롯을 해제해야 합니다.                   |

오류(비 2xx):

- `400 {code: 'invalid_server_name'}` — 빈 경로 파라미터.
- `404` — `mcpServers` 구성에 서버 이름이 없거나, 활성 ACP 채널이 없음(재시작은 본질적으로 활성 `McpClientManager` 인스턴스를 필요로 함).
- `500` — 내부 오류(예: `ToolRegistry`가 초기화되지 않음).

SSE 이벤트(워크스페이스 범위): 성공 시 `{serverName, durationMs, originatorClientId?}`와 함께 `mcp_server_restarted`; 소프트 스킵 시 `{serverName, reason, originatorClientId?}`와 함께 `mcp_server_restart_refused`.

### `GET /session/:id/events` (SSE)

세션의 이벤트 스트림을 구독합니다.

헤더:

```
Accept: text/event-stream
Last-Event-ID: 42        ← 선택적, id 42 이후부터 리플레이
X-Qwen-Event-Epoch: ...  ← 선택적, 커서를 버스 에포크와 쌍으로 묶음
X-Qwen-Client-Id: ...    ← 선택적 클라이언트 정체성 및 진단 상관
```

쿼리 파라미터:

| 파라미터           | 필수 | 참고                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued`        | 아니오 | 구독자별 **활성 프레임 백로그** 캡. 범위 `[16, 2048]`, 기본값 256. 구독 시 강제 푸시되는 리플레이 프레임은 프레임 및 바이트 캡에서 면제됩니다; 실제로 이를 소비하는 것은 구독자가 여전히 큰 `Last-Event-ID: 0` 리플레이를 드레인하는 동안 도착하는 활성 이벤트입니다. 콜드 리커넥트에서 증가시키면 소비자가 따라잡기 전에 느린 클라이언트 경고/축출이 트리거되지 않습니다. 활성 직렬화 바이트 캡은 데몬 측에서 고정되어 있으며(기본값 2 MiB) 쿼리 파라미터가 없습니다. 범위 이탈/비 10진수/있지만 빈 값은 SSE 핸드셰이크가 열리기 전에 `400 invalid_max_queued`를 반환합니다. `caps.features.slow_client_warning`를 프리플라이트합니다 — 이전 데몬은 파라미터를 조용히 무시합니다. |
| `connectReason`    | 아니오 | 클라이언트 보고 진단 힌트: `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync`, 또는 `unknown`. 잘못된 값은 `unknown`으로 정규화되며 핸드셰이크를 거부하지 않습니다. 데몬은 이 필드를 인증, 리플레이, 축출, 중복 제거, 또는 스트림 교체에 사용하지 않습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `previousStreamId` | 아니오 | 클라이언트가 보고한 이전 수락된 REST/SSE 스트림의 UUID. 잘못된 값은 무시됩니다. 이것은 최선 노력 계보일 뿐이며 스트림 동작을 변경하지 않습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

성공적인 핸드셰이크에는 `X-Qwen-SSE-Stream-Id: <uuid>`가 포함됩니다. 브라우저 게이트웨이는 해당 응답 헤더를 유지하고 `Access-Control-Expose-Headers`를 통해 노출해야 합니다. 이전 데몬이나 중개자가 생략할 수 있습니다; 클라이언트는 정상적으로 계속하고 계보를 사용할 수 없는 것으로 처리해야 합니다. id는 이 물리적 REST/SSE 연결을 식별하고 데몬 라이프사이클, 큐 진단, 그리고 요청 추적을 상관시킵니다.

프레임 형식. `data:` 줄은 **전체 이벤트 인벨롭**이며 한 줄로 JSON 문자열화됩니다 — `{id?, v, type, data, originatorClientId?}`. ACP별 페이로드(`sessionUpdate`, `requestPermission` 인수 등)는 인벨롭의 `data` 필드 아래에 위치합니다; 인벨롭 자체의 `type`은 SSE `event:` 줄과 일치합니다.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← 15초마다, 페이로드 없음

event: client_evicted    ← 종단 프레임, id 없음(합성)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← 바이트 오버플로우에 대한 종단 프레임, id 없음(합성)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

SSE 수준의 `id:` / `event:` 줄은 EventSource 호환성을 위해 `envelope.id` / `envelope.type`을 중복합니다. Raw-`fetch` 소비자(SDK의 `parseSseStream`)는 JSON 인벨롭에서 모든 것을 읽고 SSE 프리앰블 줄을 무시합니다.

| 이벤트 타입               | 트리거                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | 모든 ACP `sessionUpdate` 알림(LLM 청크, 도구 호출, 사용량)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `permission_request`      | 에이전트가 도구 승인을 요청                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `permission_resolved`     | 일부 클라이언트가 `POST /permission/:requestId`를 통해 권한에 투표                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `permission_partial_vote` | (consensus만) 투표가 기록되었지만 정족수에 미달. `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`를 taşı합니다. `caps.features.permission_mediation`를 프리플라이트합니다.                                                                                                                                                                                                                                                                                       |
| `permission_forbidden`    | 활성 정책에 의해 투표가 거부됨(`designated` 불일치, `local-only` 비루프백, 또는 `consensus` 투표자가 스냅샷에 없음). `{requestId, sessionId, clientId?, reason}`을 taşı합니다. `caps.features.permission_mediation`를 프리플라이트합니다.                                                                                                                                                                                                                                                 |
| `model_switched`          | `POST /session/:id/model` 성공                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `model_switch_failed`     | `POST /session/:id/model` 거부                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `session_died`            | 에이전트 자식이 예기치 않게 충돌. **종단: SSE 스트림은 이 프레임 후에 닫힙니다; 세션은 `byId`에서 제거됩니다.** 구독자는 `POST /session`을 통해 재연결하여 새 세션을 생성해야 합니다.                                                                                                                                                                                                                                                                                                     |
| `slow_client_warning`     | 구독자 로컬: 활성 프레임 백로그 또는 활성 직렬화 바이트 백로그가 75% 이상 참. **비종단** — 스트림이 계속됩니다; 경고는 축출 전 미리 알림입니다. `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}`를 taşı하며 `threshold`는 `frames`, `bytes`, 또는 `frames_and_bytes`입니다. 오버플로우 에피소드당 한 번 발생; 두 측정값 모두 37.5% 이하로 드레인된 후 재무장됩니다. `id` 없음(합성). `caps.features.slow_client_warning`를 프리플라이트합니다. |
| `client_evicted`          | 구독자 로컬: 큐 오버플로우. `reason`은 활성 프레임 캡에 대해 `queue_overflow`이고 활성 직렬화 바이트 캡에 대해 `queue_bytes_overflow`입니다. **종단: SSE 스트림은 이 프레임 후에 닫힙니다**(`id` 없음 — 합성). 같은 세션의 다른 구독자는 계속됩니다.                                                                                                                                                                                                                                     |
| `stream_error`            | 팬아웃 중 데몬 측 오류. **종단: SSE 스트림은 이 프레임 후에 닫힙니다**(`id` 없음 — 합성).                                                                                                                                                                                                                                                                                                                                                                                                   |

재연결 의미:

- `Last-Event-ID: <n>`을 전송하여 세션별 링에서 `id > n`인 이벤트를 리플레이합니다(기본 깊이 **8000**, `qwen serve --event-ring-size <n>`으로 조정 가능).
- **갭 감지:** `<n>`이 링에 여전히 있는 가장 오래된 이벤트보다 이전이면, 데몬은 id 없는 `state_resync_required` 프레임을 발행한 후 생존한 접미사를 리플레이합니다. SDK는 `awaitingResync`를 래치하며; 클라이언트는 `POST /session/:id/load`를 호출하고 현재 한정된 리플레이 스냅샷 창에서 다시 구축해야 합니다. 해당 스냅샷 자체도 이전 인메모리 리플레이 항목이 삭제되었을 때 `history_truncated`로 시작할 수 있습니다; 이 마커는 정보용이며 다른 재동기화 루프를 시작하면 안 됩니다.
- ID는 세션당 단조적이며 1부터 시작합니다
- 합성 프레임(`client_evicted`, `slow_client_warning`, `stream_error`)은 의도적으로 `id`를 생략하여 다른 구독자의 시퀀스 슬롯을 소모하지 않습니다

백프레셔:

- 구독자별 큐는 기본값 `maxQueued: 256` 활성 항목과 데몬 소유 2 MiB 활성 직렬화 바이트 캡입니다. 재연결 중 리플레이 프레임, `slow_client_warning`, 그리고 `client_evicted`는 두 캡을 모두 우회합니다.
- SSE 요청에서 `?maxQueued=N`(범위 `[16, 2048]`)으로 프레임 캡만 재정의합니다. `?maxQueuedBytes`는 의도적으로 없습니다; 클라이언트가 데몬 메모리 예산을 올릴 수 없습니다.
- 구독자의 활성 프레임 백로그나 활성 바이트 백로그가 75%를 초과하면 버스는 해당 구독자에게 `slow_client_warning` 합성 프레임을 강제 푸시합니다(오버플로우 에피소드당 한 번; 두 측정값 모두 37.5% 이하로 드레인된 후 재무장). 스트림은 열린 상태로 유지됩니다 — 경고는 클라이언트가 더 빨리 드레인하거나 깔끔하게 분리 + 재연결할 수 있도록 하는 미리 알림입니다.
- 활성 프레임 캡이 오버플로우하면 버스는 `reason: "queue_overflow"`와 함께 `client_evicted`를 발행합니다. 활성 바이트 캡이 오버플로우하면 `reason: "queue_bytes_overflow"`를 발행합니다. 두 경우 모두 종단 프레임이 강제 푸시되고 구독이 닫힙니다.

### `POST /permission/:requestId`

펜딩 `permission_request`에 투표를 행사합니다. 활성 **중재 정책**이 누가 이기는지 결정합니다:

| 정책                        | 동작                                                                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder`(기본값)   | 모든 검증된 투표자가 승리; 이후 투표자는 `404`를 받음. F3 이전 기본.                                                                                                                     |
| `designated`                | 프롬프트 시작자(`originatorClientId`)만 결정; 비시작자는 `403 permission_forbidden / designated_mismatch`를 받음. 익명 프롬프트에 대해 first-responder로 폴백.                            |
| `consensus`                 | M명 중 N명의 투표자가 동의해야 함(기본 `N = floor(M/2) + 1`, `policy.consensusQuorum`로 재정의). `N`에 먼저 도달한 옵션이 승리. 미해결 투표는 `200` + `permission_partial_vote` SSE 프레임을 받음. |
| `local-only`                | 루프백 투표자만 결정; 원격 호출자는 `403 permission_forbidden / remote_not_allowed`를 받음.                                                                                               |

활성 정책은 `settings.json`의 `policy.permissionStrategy` 아래에서 구성되며 `/capabilities`에서 `body.policy.permission`으로 노출됩니다. 빌드 지원 집합에 대해 `caps.features.permission_mediation`(`modes: [...]` 포함)을 프리플라이트합니다.

> **F3 (#4175): 다중 클라이언트 권한 조정.** F3는 위의 네 가지 정책을 추가했습니다. F3 이전 데몬은 first-responder를 하드코딩했습니다; 구성된 정책이 `first-responder`이면 와이어 형태는 비트 단위 동일하게 유지됩니다. 새 이벤트(`permission_partial_vote`, `permission_forbidden`)는 추가적입니다 — 이전 SDK는 이를 `unrecognized_known_event`로 보고 정상적으로 무시합니다.

> **권한 타임아웃(기본 5분).** `permission_request`는 다음 중 하나가 발생할 때까지 펜딩 상태로 유지됩니다: (a) 일부 클라이언트가 여기서 투표, (b) `POST /session/:id/cancel` 발생, (c) 프롬프트를 구동하는 HTTP 클라이언트 연결 끊기(중간 프롬프트 취소는 미해결 권한을 `cancelled`로 해결), (d) 세션 종료, (e) 데몬 종료, **또는 (f) 세션별 권한 타임아웃 발생**(`DEFAULT_PERMISSION_TIMEOUT_MS`, 5분). 타임아웃 발생 시 에이전트의 `requestPermission`이 `{outcome: 'cancelled'}`로 해결되고, 감사 링이 `permission.timeout` 항목을 기록하며, 데몬 표준 오류에 한 줄의 브레드크럼이 출력되고, SSE 버스가 표준 `permission_resolved` 취소 프레임을 팬아웃하여 구독자가 정리합니다. 타임아웃은 `BridgeOptions.permissionResponseTimeoutMs`를 통해 구성 가능합니다; 장기간 프롬프트를 실행하는 헤드리스 호출자는 이를 연장할 수 있습니다.

요청:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

결과:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — 에이전트가 제공한 선택지에 따라 수락/거부/한 번 진행 등
- `{ "outcome": "cancelled" }` — 요청을 삭제(`cancelSession` / `shutdown`이 내부적으로 수행하는 것과 일치)

응답:

- `200 {}` — 투표가 수락됨(해결됨 또는 consensus 정족수 아래 기록됨)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: 활성 정책이 투표를 거부
- `404 { "error": "..." }` — requestId를 알 수 없음(이미 해결됨, 존재한 적 없음, 또는 세션이 철수됨)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: 에이전트의 `allowedOptionIds`에 예약된 센티널 `'__cancelled__'`가 포함됨; 에이전트/데몬 계약 위반
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 정방향 호환: 정책 리터럴이 스키마에 반영되었지만 중재자 분기가 아직 구축되지 않음(현재 도달 불가능; 향후 정책을 위해 예약)

성공적인 투표 후 연결된 모든 클라이언트는 같은 `requestId`와 선택된 `outcome`을 가진 `permission_resolved`를 봅니다. `consensus` 아래에서 중간 투표는 정족수까지 추가로 `permission_partial_vote`를 팬아웃합니다.

### Auth 디바이스 플로우 라우트 (issue #4175 PR 21)

데몬은 원격 SDK 클라이언트가 **데몬** 파일시스템에 토큰이 저장되는 로그인을 트리거할 수 있도록 OAuth 2.0 Device Authorization Grant(RFC 8628)를 중개합니다 — 클라이언트가 아닙니다. 데몬 자체가 IdP를 폴링합니다; 클라이언트의 유일한 역할은 검증 URL + 사용자 코드를 표시하고 (선택적으로) 완료 이벤트에 대한 SSE를 구독하는 것입니다.

기능 태그: `auth_device_flow`(항상 광고됨). v1의 지원 제공자: `qwen-oauth`.

> [!note]
>
> Qwen OAuth 무료 티어는 2026-04-15에 지원 중단되었습니다. 이 프로토콜에서 `qwen-oauth`를 레거시 v1 제공자 식별자로 취급하십시오; 새 클라이언트는 현재 지원되는 auth 제공자가 사용 가능하면 선호해야 합니다.

**런타임 근접성.** 데몬은 브라우저를 절대 생성하지 않습니다 — 생성할 수 있더라도. 클라이언트가 로컬에서 `open(verificationUri)`를 호출할지 결정합니다; 헤드리스 파드(규범적 Mode B 배포)에서 사용자는 브라우저가 있는 어떤 기기에서든 URL을 엽니다. 권장 UX는 `docs/users/qwen-serve.md`를 참조하십시오.

**이벤트에서 토큰 유출 없음.** `auth_device_flow_started`는 `{deviceFlowId, providerId, expiresAt}`만 taşı합니다. 사용자 코드와 검증 URL은 POST 201 본문과 `GET /workspace/auth/device-flow/:id`를 통해 점대점으로 반환되며 SSE에서 브로드캐스트되지 않습니다.

**제공자별 싱글턴.** 플로우가 펜딩 중인 동안 같은 제공자에 대한 두 번째 `POST`는 멱등적인 인계입니다 — 새 IdP 요청을 시작하지 않고 기존 항목을 `attached: true`로 반환합니다.

#### `POST /workspace/auth/device-flow`

엄격한 변경 게이트: 토큰 없는 루프백 기본값에서도 베어러 토큰 필요(`401 token_required`).

요청:

```json
{ "providerId": "qwen-oauth" }
```

응답(`201` 새 시작, `200` 멱등적 인계):

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

오류:

- `400 unsupported_provider` — 알 수 없는 `providerId`(응답에 `supportedProviders` 포함)
- `409 too_many_active_flows` — 워크스페이스 캡(4) 도달; `DELETE`로 하나 취소
- `401 token_required` — 엄격한 게이트가 토큰 없는 요청을 거부
- `502 upstream_error` — IdP가 예기치 않은 오류를 반환

#### `GET /workspace/auth/device-flow/:id`

현재 상태를 읽습니다. 펜딩 항목은 `userCode/verificationUri/expiresAt/intervalMs`를 에코합니다; 종단 항목(5분 유예)은 이를 삭제하고 `status` + 선택적 `errorKind/hint`를 노출합니다.

알 수 없는 id와 유예 후 축출된 항목에 대해 `404 device_flow_not_found`를 반환합니다.

#### `DELETE /workspace/auth/device-flow/:id`

멱등적 취소:

- 펜딩 항목 → `204` + `auth_device_flow_cancelled` 발행
- 종단 항목 → `204` no-op(이벤트 재발행 없음)
- 알 수 없는 id → `404`

#### `GET /workspace/auth/status`

펜딩 플로우 + 지원 제공자의 스냅샷:

```json
{
  "v": 1,
  "workspaceCwd": "/work/bound",
  "providers": [],
  "pendingDeviceFlows": [
    {
      "deviceFlowId": "fa07c61b-…",
      "providerId": "qwen-oauth",
      "expiresAt": 1700000600000
    }
  ],
  "supportedDeviceFlowProviders": ["qwen-oauth"]
}
```

#### 디바이스 플로우 SSE 이벤트

5개의 타입 지정 이벤트(워크스페이스 범위, 모든 활성 세션 버스에 팬아웃):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 성공; SDK가 구독해야 함(여기에 userCode 없음, 필요 시 GET으로 가져옴)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — 데몬이 업스트림 `slow_down`을 준수; GET을 폴링하는 클라이언트는 간격을 이에 맞게 올려야 함
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 자격 증명 영구화됨; `accountAlias`는 비 PII 레이블(이메일/전화번호 절대 아님)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 종단; `errorKind`는 `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` 중 하나. `persist_failed`는 데몬 내부: IdP 교환은 성공했지만 데몬이 자격 증명을 내구성 있게 저장하지 못함(EACCES / EROFS / ENOSPC). 사용자는 기본 디스크 상태가 수정된 후 한 번 재시도해야 합니다.
- `auth_device_flow_cancelled` `{deviceFlowId}` — 펜딩 항목에 대한 DELETE 성공

> **MCP 호환 아님.** MCP 인증 사양(2025-06-18)은 리디렉션 콜백이 있는 OAuth 2.1 + PKCE 인증 코드를 요구하며, 이는 헤드리스 파드 데몬에 작동하지 않습니다. Mode B의 디바이스 플로우 표면은 데몬 전용입니다 — MCP 준수 서버를 대상으로 하는 클라이언트는 다른 auth 경로를 사용해야 합니다.

## 스트리밍 와이어 형식

이벤트는 표준 EventSource 프레임으로 발행됩니다. 데몬은 프레임당 하나의 `data:` 줄을 씁니다(JSON은 `JSON.stringify` 후 임베디드 개행이 없음); `packages/sdk-typescript/src/daemon/sse.ts`의 SDK 파서는 수신 측에서 이것과 사양 허용 다중 `data:` 형태를 모두 처리합니다.

## 스트리밍 중 오류 프레임

브리지 이터레이터가 SSE 구독자를 서빙하는 동안 throw하면 데몬은 종단 `stream_error` 프레임(`id` 없음)을 발행합니다. `data:` 줄은 전체 인벨롭입니다(이 문서의 다른 모든 SSE 프레임과 동일한 형태); 실제 오류 메시지는 `envelope.data.error` 아래에 위치합니다:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

그런 다음 연결이 닫힙니다.

## 환경 변수

| 변수                | 목적                                                          |
| ------------------- | ------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | 베어러 토큰. 부트 시 선행/후행 공백이 제거됩니다.              |

## 소스 레이아웃

| 경로                                                     | 목적                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                     | yargs 명령어 + 플래그 스키마                                                                            |
| `packages/cli/src/serve/run-qwen-serve.ts`               | 리스너 라이프사이클 + 시그널 처리                                                                       |
| `packages/cli/src/serve/server.ts`                       | Express 앱 어셈블리, 미들웨어 순서, 그리고 나머지 직접 라우트                                            |
| `packages/cli/src/serve/routes/*.ts`                     | 세션, SSE, 워크스페이스 auth, 워크스페이스 상태, 그리고 파일 라우트를 포함한 포커스된 Express 라우트 그룹 |
| `packages/cli/src/serve/auth.ts`                         | 베어러 + Host 허용목록 + CORS 거부                                                                      |
| `packages/cli/src/serve/acp-session-bridge.ts`           | 생성-또는-첨부, 세션별 FIFO, 그리고 권한 레지스트리를 위한 CLI-로컬 브리지 호환성 파사드                  |
| `packages/acp-bridge/src/status.ts`                      | 읽기 전용 데몬 상태 와이어 타입 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind`  |
| `packages/cli/src/serve/env-snapshot.ts`                 | 자격 증명 수정 포함 `process.*` 상태에서 `/workspace/env` 페이로드를 구축하는 순수 헬퍼                   |
| `packages/acp-bridge/src/eventBus.ts`                    | 한정된 비동기 큐 + 리플레이 링                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`     | TS 클라이언트                                                                                           |
| `packages/sdk-typescript/src/daemon/sse.ts`              | EventSource 프레임 파서                                                                                 |
| `integration-tests/cli/qwen-serve-routes.test.ts`        | 18 케이스, LLM 없음                                                                                     |
| `integration-tests/cli/qwen-serve-streaming.test.ts`     | 3 케이스, 로컬 fake OpenAI 서버 기반의 실제 `qwen --acp` 자식(POSIX 전용; Windows에서 건너뜀)             |
