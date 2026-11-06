# `qwen serve` HTTP 프로토콜 레퍼런스

[qwen-code 데몬 설계](https://github.com/QwenLM/qwen-code/issues/3803)의 1단계입니다. 모든 라우트는 데몬의 기본 URL(기본값 `http://127.0.0.1:4170`) 하위에 있습니다.

이 참조 문서에서는 HTTP 라우트와 SSE 프레이밍을 설명합니다. 페이로드 계약, 재동기화(reason) 이유 및 기록 앵커에 대해서는 [타입 지정된 이벤트 스키마](./daemon/09-event-schema.md), 전달 및 백프레셔(backpressure)에 대해서는 [이벤트 버스 및 리플레이 가이드](./daemon/10-event-bus.md), 기존 `v1` 프로토콜과 호환성 규칙에 대해서는 [기능(capabilities) 및 버전 관리](./daemon/11-capabilities-versioning.md)를 함께 읽으십시오. 전체 계약 세트는 [데몬 문서 인덱스](./daemon/00-index.md)에서 확인할 수 있습니다.

## 인증 [#authentication]

데몬이 `--token` 또는 `QWEN_SERVER_TOKEN`로 시작되었거나 — 또는 둘 다 없이 비 루프백(non-loopback)으로 바인딩되어 일회용 베어러 토큰을 생성하고 시작 시 한 번 출력하는 경우 — **일반 API 라우트 중 `/health`를 제외한 모든 라우트**에는 일반 루프백 바인딩에서도 다음이 포함되어야 합니다:

```
Authorization: Bearer <token>
```

루프백 기본값에 구성된 토큰이 없는 경우 헤더는 선택 사항이며 주요 리스너를 통해 도착한 요청은 전체 운영자 API 권한을 가집니다. 워크스페이스 신뢰, 세션 소유권, `X-Qwen-Client-Id`, 권한, 기능, 검증 및 리소스 체크는 여전히 적용됩니다. 토큰 비교는 상수 시간(constant-time)으로 수행됩니다. 401 응답은 `missing header` / `wrong scheme` / `wrong token` 전반에 걸쳐 균일합니다.

**`--open-with-auth`.** 이 기본 오프(off) CLI 모드는 루프백 바인딩과 사용 가능한 Web Shell을 요구합니다. 이는 일반적인 `--token`-over-`QWEN_SERVER_TOKEN` 선택을 재사용하거나, 해당 선택이 비어 있을 때 데몬 시작 전에 base64url로 인코딩된 32바이트 랜덤 데이터를 생성합니다. 브라우저는 `#token=`을 통해 선택된 베어러 토큰을 수신하며 탭별로 저장합니다. 프로토콜과 미들웨어는 일반적으로 구성된 토큰으로 간주합니다. 조각(fragment) 전달은 플래그가 아닌 해결된(resolved) 토큰을 기준으로 합니다. 즉, `--open` 실행 시 구성된 토큰이나 생성된 토큰 등 해결된 베어러 토큰을 실행된 URL의 `#token=` 조각에 첨부합니다(런처 경고에 따라 로컬 사용자가 `ps` / `/proc`을 통해 볼 수 있음). 따라서 맨 `--open` 플래그와 함께 비 루프백 바인딩을 하면 생성된 베어러 토큰을 동일한 방식으로 브라우저에 전달합니다. 이 플래그의 고유한 기여도는 루프백에서의 토큰 _생성_ 과 브라우저 부적격 환경에서의 수동 URL 대체(fallback)입니다. `RunHandle.resolvedToken`을 무시하는 직접 임베디드 호출자와 브라우저를 실행하지 않는 클라이언트만 자동 자격 증명을 받지 못합니다. 브라우저 부적격 환경에서는 비밀을 포함하는 조각 URL을 수동 열기를 위해 출력합니다. 루프백 `/health` 및 정적 Web Shell 자산은 아래 설명된 면제를 유지하며, `--require-auth`은 여전히 `/health`를 제한합니다.

채널 웹훅 ingress(`POST /channels/:channelName/webhooks/:source`)는 모든 모드에서 이 베어러 계약과 별개입니다. 마운트될 경우 `bearerAuth`보다 먼저 등록되며 구성된 `x-qwen-webhook-secret`로 인증합니다. 데몬 베어러 토큰을 회전해도 웹훅 소스 비밀은 회전되지 않습니다.

**`/health` 면제**(Bctum): 루프백 바인딩(`127.0.0.0/8` / `localhost` / `::1` / `[::1]`)에서는 `/health`이 베어러 미들웨어 BEFORE에 등록되므로, 데몬이 `--token`으로 시작되었더라도 파드(pod) 내부의 라이브니스(liveness) 프로브는 토큰을 포함할 필요가 없습니다. 비 루프백 바인딩(`--hostname 0.0.0.0` 등)은 다른 일반 API 라우트와 마찬가지로 `/health`를 제한합니다. 근거는 [`GET /health`](#get-health) 섹션을 참조하십시오.

**`--require-auth` (#4175 PR 15).** 부팅 시 이 플래그를 전달하여 "토큰 필수" 규칙을 루프백에도 확장합니다. 토큰 소스가 해결되지 않으면 부팅이 실패합니다. 루프백에서는 `--token`, `QWEN_SERVER_TOKEN` 또는 `--open-with-auth`(부팅 전 자체 생성 토큰을 설치하므로 `--require-auth --open-with-auth`이 시작됨)을 의미합니다. fail-fast는 루프백 전용입니다. 비 루프백 바인딩은 구성된 소스가 모두 없을 때 생성하는 일회용 베어러 토큰을 해결하며, 이것이 플래그를 충족시킵니다. `/health` 면제는 어느 쪽이든 제거되므로 `/health`도 `Authorization: Bearer …`을 요구합니다.

플래그가 켜져 있으면 전역 `bearerAuth` 미들웨어가 **모든 일반 API 라우트** — `/health` 및 `/capabilities` 포함 — 를 제한합니다. 채널 웹훅 ingress는 독립적인 공유 비밀(shared-secret) 인증을 유지하며, Web Shell 문서 및 자산 라우트는 사전 인증(pre-auth) 상태로 유지됩니다. 따라서 **인증되지 않은** 클라이언트는 인증 필요 여부를 발견하기 위해 `caps.features`을 사전 비행(preflight)할 수 없습니다. 이 경우의 발견(discovery) 표면은 **401 응답 본문** 자체입니다([인증](#authentication) 섹션에 따라 베어러 제한 라우트 전반에 걸쳐 균일함). `require_auth` 기능 태그는 **인증 후 확인(post-authentication confirmation)** 입니다. 클라이언트가 성공적으로 인증하고 `/capabilities`을 읽으면 태그 존재 여부가 데몬이 `--require-auth`로 시작되었음을 확인해 줍니다(감사/컴플라이언스 UI 및 SDK 클라이언트가 설정 패널에서 "이 배포는 강화됨"을 표시하는 데 유용). 엄격한 변경(mutating) 라우트는 신뢰된 루프백 주요 리스너 요청, 베어러 인증된 요청 또는 페어링된 Local Control 요청을 허용합니다. 신뢰되지 않은 토큰 없는 임베디드는 여전히 `401 { code: "token_required", error: "…" }`을 받습니다. `--require-auth`가 있으면 전역 베어러 미들웨어가 먼저 레거시 `Unauthorized` 본문을 거부합니다.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** 데몬에 교차 출처(cross-origin)로 접속하는 브라우저 클라이언트는 기본적으로 차단됩니다. `Origin` 헤더를 포함하는 요청은 CLI/SDK 클라이언트가 `Origin`를 보내지 않으며 데몬이 그 존재를 운영자가 옵트인(opt-in)하지 않은 브라우저 컨텍스트에서 온 신호로 취급하기 때문에 `403 {"error":"Request denied by CORS policy"}`을 반환합니다. 토큰이 있는 비 루프백 바인딩에서 벽(wall)보다 먼저 발생하는 예외가 하나 있습니다. 동일 출처(same-origin) 요청(`Origin`이 직접 소켓 스킴과 정규화된 `Host` 권한(authority)의 합과 일치)은 베어러 인증되며 `Origin`이 **주요 리스너(primary listener)** 에서 제거됩니다. 유효한 베어러가 있으면 라우트의 자체 상태(status)가 따르고, 베어러가 없거나 잘못된 경우 `401`이 됩니다. 단, **다른 모든 모드와 마찬가지로 자격 증명 없이 제공되는 사전 인증된 Web Shell 문서, `/assets/*`, `/manifest.webmanifest`, `/sw.js` 및 `/mcp-app-sandbox` 라우트는 제외** 되며, 교차 출처이거나 일치하지 않는 `Origin` 값만 `403` 엔벨롭(envelope)을 유지합니다. 벽 대신 허용 목록(allowlist)을 설치하려면 부팅 시 `--allow-origin <pattern>`(반복 가능)를 전달하십시오. 각 패턴은 다음 중 하나입니다:

- 리터럴 `*` — 모든 출처 허용. **위험**: `*`이 구성되었지만 베어러 토큰이 해석되지 않으면 부팅이 거부됩니다. 가드는 _해석된_ 토큰을 읽습니다 — `--token`, `QWEN_SERVER_TOKEN`, `--open-with-auth`의 생성된 루프백 토큰 또는 비루프백 바인딩 시 구성된 소스가 없을 때 생성되는 일시적 베어러 토큰 — 따라서 이 거부는 루프백 전용입니다. 부팅 브레드크럼은 `*`가 목록에 있을 때 stderr 경고를 출력합니다. **권장 사항**: 루프백 바인딩에서 `--require-auth`과 함께 페어링하여 `/health`도 베어러로 게이트되도록 하십시오. 기본값으로 루프백에서는 베어러 미들웨어보다 먼저 등록되므로(따라서 k8s/Compose 프로브는 토큰 없이 접근 가능), `*` 허용 목록을 사용하면 임의의 교차 출처 브라우저에서 접근할 수 있습니다. `--require-auth`는 여전히 설계상 루프백에서 Web Shell 정적 자산(`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` 및 `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` 그리고 `/settings` 문서 탐색)을 사전 인증 상태로 남겨두며, 이들은 베어러 미들웨어보다 먼저 마운트됩니다. 따라서 `*` 허용 목록 하에서는 임의의 교차 출처 브라우저에서 읽을 수 있으며, `--no-web`는 해당 표면을 제거합니다. 비루프백 바인딩에서는 부팅 시 이미 베어러가 필수이며 `/health`는 그 뒤에 등록됩니다. 일반 API 경로는 베어러로 게이트되고, 채널 웹훅 유입은 자체 공유 비밀 키 게이트를 유지하며, Web Shell 정적 자산(`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` 및 `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` 그리고 `/settings` 문서 탐색)은 `--no-web`가 이를 제거하지 않는 한 사전 인증 상태로 남습니다.
- 정규화된 URL 출처 — `<scheme>://<host>[:<port>]`. **후행 슬래시, 경로, 사용자 정보, 쿼리가 없습니다.** 항목이 왕복 `new URL(pattern).origin === pattern`를 실패하면 부팅이 `InvalidAllowOriginPatternError`로 거부되며, 오류 메시지는 잘못된 패턴과 정규화 형태를 명시합니다. 의도적으로 엄격함: 조용한 정규화(예: 후행 `/` 제거)는 오타를 허용하고 모호한 입력을 받아들일 수 있습니다. 해석된 토큰이 없으면(생성 후 루프백 바인딩을 의미) HTTP(S) 항목은 루프백 호스트로 제한됩니다. 비루프백 브라우저 출처에는 토큰이 필요하는데, 이는 데몬 사용자로서 코드 실행을 포함한 전체 운영자 API를 구동할 수 있기 때문입니다. 명시적인 브라우저 확장 프로그램 출처는 기존 토큰 없는 로컬 자동화 경로를 유지합니다. 시작 시 토큰 없는 허용된 브라우저 출처에 부여된 권한을 로그에 기록합니다.

매칭된 출처는 모든 요청에 대해 표준 CORS 응답 헤더를 수신합니다:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin`는 리터럴 `*` 대신 요청의 출처를 그대로(브라우저가 보낸 대로 대소문자 포함) 에코합니다. `*` 패턴 하에서도 마찬가지입니다. 브라우저 캐시는 `Vary: Origin`와 짝지어 응답을 저장하므로, 에코하는 방식은 추후 릴리스에서 스키마 변경 없이 `Access-Control-Allow-Credentials`를 추가할 여지를 남깁니다. 노출된 헤더는 브라우저 클라이언트가 재시도 힌트를 준수하고, SSE 에포크를 유지하며, 승인된 물리적 스트림을 상관관계 짓도록 합니다. `Access-Control-Allow-Credentials`는 현재 전송되지 **않습니다**. 구성된 데몬 자격 증명은 `Authorization` 내 베어러를 사용하며, 이는 `credentials: 'include'` 없이도 교차 출처에서 작동합니다. 신뢰된 루프백 권한에는 브라우저 자격 증명이 필요하지 않습니다.

OPTIONS 사전 검사 요청(OPTIONS with `Access-Control-Request-Method` or `Access-Control-Request-Headers`)은 위 헤더들과 함께 `204 No Content`로 단락 처리(short-circuit)됩니다. 이는 관례적인 CORS 패턴이며 안전합니다. 사전 검사는 데몬이 어떤 메서드/헤더를 허용할지 확인만 하며, 실제 후속 요청은 Host 게이트를 실행한 다음 상태가 읽히거나 변경되기 전에 베어러/리스너 권한 또는 채널 웹훅 공유 비밀 키 게이트를 통과합니다. 매칭된 출처의 일반 OPTIONS 요청은 CORS 헤더가 첨부된 채로 다운스트림으로 계속 흐릅니다.

허용 목록과 일치하지 않는 출처에도 여전히 `403 {"error":"Request denied by CORS policy"}`가 반환됩니다. 기본 차단벽과 동일한 엔벨로프로, 이미 차단벽 응답을 파싱한 클라이언트는 허용 목록이 배포된 데몬을 위해 특수 케이스 처리를 할 필요가 없습니다. 거부 경로는 `Access-Control-*` 헤더를 출력하지 **않습니다**(브라우저는 이를 무시하며, 출력이 헤더 존재 여부를 통해 간접적으로 허용 목록 크기를 광고할 수 있습니다).

구성된 패턴 목록은 의도적으로 `/capabilities`에 에코되지 않습니다. 브라우저 클라이언트는 자신의 출처를 이미 알고 있으며(결국 데몬을 호출했으므로), 목록을 노출하면 인증되지 않은 `/capabilities`의 독자가 모든 신뢰된 출처를 나열할 수 있게 됩니다(잘못 구성된 배포에 대한 유용한 정찰). SDK 클라이언트는 특정 출처를 알 필요 없이 "이 데몬이 교차 출처 브라우저 히트를 존중한다"는 것을 나타내기 위해 `caps.features.allow_origin` 태그로 게이트합니다.

루프백 자기 출처 요청(예: Web Shell이 동일한 `127.0.0.1:port`에서 데몬을 호출하는 경우)은 CORS 미들웨어보다 먼저 실행되는 **별도의** Origin-스트립 심(shim)에 의해 처리되며, `Origin` 헤더를 `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` 또는 정확히 바인딩된 루프백 주소 및 포트에 대해 제거합니다. 또한 브라우저가 기본 포트에 대해 보내는 스키마 일치 포트 없는 형식도 허용합니다: 포트 80에서의 `http://host` 및 포트 443에서의 `https://host`. 이러한 요청은 `--allow-origin` 구성과 관계없이 통과합니다. 운영자는 Web Shell을 작동시키기 위해 데몬의 자체 포트를 나열할 필요가 없습니다.

## 일반적인 오류 형식

5xx 응답에는 원본 오류의 `code` 및 `data`가 있는 경우 포함됩니다(JSON-RPC 스타일 — ACP SDK는 에이전트로부터 `{code, message, data}`를 전달합니다):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

요청 본문에 잘못된 JSON이 있으면 다음을 반환합니다:

```json
{ "error": "Invalid JSON in request body" }
```

상태 `400`와 함께.

알 수 없는 세션 ID에 대한 `SessionNotFoundError`는 다음을 반환합니다:

```json
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

상태 `404`와 함께. 동시 닫기는 `code: "session_closing"`를 사용합니다.

`cwd`가 등록된 워크스페이스로 정규화되지 않는 `POST /session`에 대한 `WorkspaceMismatchError`는 `400`와 함께 다음을 반환합니다:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

미리 감지하기 위해 이것을 사용하십시오: `/capabilities`에서 `workspaceCwd`를 읽고 `POST /session`에서 `cwd`를 생략하십시오(주 워크스페이스로 폴백됨). 또는 `multi_workspace_sessions`가 광고될 경우 `workspaces[].cwd` 중 하나를 선택하십시오.

데몬의 `--max-sessions` 상한을 초과하는 `POST /session`는 `Retry-After: 5` 헤더와 함께 `503`를 반환합니다:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

효과적인 데몬 전역 총 상한이 새 세션을 거부할 때 — `--max-total-sessions` 또는 `limits.maxTotalSessions` 아래 설명된 기본값 — 동일한 응답 형식이 `"scope": "total"`와 함께 반환됩니다.

기존 세션에 대한 부착은 상한에 계산되지 않으므로, 유휴 상태의 데몬은 용량 한계에 도달했을 때도 재연결이 계속 작동합니다.

ACP 채널 초기화 예산이 `newSession`가 디스패치되기 전에 만료되면, `POST /session`는 `Retry-After: 5`와 함께 `504`를 반환합니다:

```json
{
  "error": "AcpSessionBridge initialize timed out after 10000ms",
  "code": "init_timeout",
  "errorKind": "init_timeout",
  "retryable": true,
  "sideEffectPossible": false,
  "phase": "channel.initialize",
  "timeoutMs": 10000
}
```

`timeoutMs` — 및 `error`의 숫자 접미사 — 는 데몬의 구성된 `--initialize-timeout-ms` 예산을 반영합니다(위의 값들은 기본값입니다). 위의 완전한 안전한 재시도 형식은 채널 초기화가 모든 영구 변경에 선행되는 순수 세션 생성에만 방출됩니다. 그 경로에서는 초기화가 ACP `newSession` 요청보다 먼저 발생하므로 `sideEffectPossible: false` 필드가 권위를 가지며, 이 구조화된 계약을 이해하는 클라이언트는 중복 세션 위험 없이 광고된 지연 후 재시도할 수 있습니다.

`branch` 또는 `worktree`을 포함하는 요청, 그리고 단순 생성이 아닌 변경(mutate) 연산을 수행하는 라우트에서 발생하는 초기화 타임아웃(예: `POST /session/:id/branch` 및 `POST /session/:id/side-task`, 실패한 핸드셰이크 이후에도 커밋된 포크가 남을 수 있는 경우)은 `code: "init_timeout"`, `phase`, `timeoutMs`과 함께 동일한 `504`를 반환하지만 — `Retry-After`, `retryable`, `sideEffectPossible`은 포함하지 않습니다. 이러한 경우 변경 작업의 결과는 불명확합니다: 브랜치 및 워크트리 준비는 채널이 초기화되기 전에 git을 변경하며, 실패 시 시도되는 롤백은 최선(best-effort)입니다(체크아웃 롤백이 실패하면 워크스페이스가 새 브랜치에 남아 있을 수 있고, 재시도 시 브랜치가 이미 존재한다는 충돌이 발생할 수 있습니다). 모든 5xx 변경 응답을 모호한 것으로 분류하는 클라이언트는 보수적으로 실패-클로즈(fail-closed) 상태를 유지해야 하며, 축소된 형식에도 동일한 정책을 적용해야 합니다. `POST /session/:id/load` 및 `POST /session/:id/resume`는 복원 요청이 디스패치되기 전에 채널 초기화가 타임아웃될 때(`ensureChannel` 단계) 동일한 축소된 `init_timeout` `504`를 노출합니다; 해당 Errors 목록에 문서화된 `session_restore_timeout` `504`과 달리, 이 형식은 복원이 디스패치되지 않았으므로 `Retry-After`, `retryable`이 없고 펜스(fence)를 설치하지 않습니다. `POST /session`에서의 `newSession` 디스패치 타임아웃은 예외입니다: 생성 결과가 모호하므로 `phase` 또는 `sideEffectPossible` 없이, `code: "init_timeout"`, `retryable: true`, 예산(budget) 기반의 `Retry-After`와 함께 `504`를 반환합니다. 다른 모든 타임아웃 레이블은 일반적인 매핑을 따릅니다.

`RestoreInProgressError` — 다른 등록이 이미 해당 id를 소유하고 있을 때 `POST /session/:id/load`, `POST /session/:id/resume` 또는 호출자가 제공한 id `POST /session`에 의해 발생함 — `409`를 반환하고:

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

이미 `session/resume`이 진행 중인 id에 대해 `session/load`이 발행되거나(또는 그 반대), 호출자가 제공한 id 스폰(spawn)이 어느 방향의 복원과 경쟁(race)할 때 발생합니다. 최소 `Retry-After`초를 기다린 후 재시도하세요. 같은 동작의 경쟁(`load` vs `load`, `resume` vs `resume`)은 복원이 활성 상태인 동안 오류 대신 병합(coalesce)됩니다.

`reason`은 이 코드를 공유하는 두 가지 펜스를 구분하며, `Retry-After` 헤더가 이를 추적합니다:

| `reason` | 의미 | `Retry-After` |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `restore_in_progress` | 일반 복원이 실행 중입니다. | `5` (`session_limit_exceeded`와 일치) |
| `awaiting_abandoned_cleanup` | 공개 호출자가 이미 타임아웃을 받았고(복원의 경우 `504`, 세션 초기화의 경우 `init_timeout`), 취소 불가능한 ACP 요청과 그 정리가 아직 완료되지 않았습니다. | 타임아웃된 작업의 예산(초 단위) — 복원, 또는 호출자 제공 id 스폰의 경우 초기화 — `5`–`120`로 클램프됨 |

공개 복원 요청은 `limits.sessionRestoreTimeoutMs`(기본값 60초)의 영향을 받습니다. `504` 이후에는 늦게 도착한 ACP 요청과 정리가 완료될 때까지 id가 계속 펜싱되므로, 일반적인 5초 주기로 계속 재시도하는 클라이언트는 해제할 수 없는 409 오류에 대해 무한 루프에 빠질 수 있습니다 — `awaiting_abandoned_cleanup`와 함께 제공되는 예산 기반 힌트를 준수하세요.

`SessionWorkspaceConflictError` — 요청된 `cwd`이 하나의 등록된 워크스페이스를 타겟으로 하지만 동일한 세션 id가 이미 다른 런타임에 의해 라이브 상태이거나 복원 중일 때 `POST /session/:id/load` 및 `POST /session/:id/resume`에 의해 발생함 — 다음 내용과 함께 `409`를 반환:

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

클라이언트는 소유 워크스페이스로 재시도하거나, 다른 워크스페이스에 id를 복원하기 전에 진행 중인 복원이 완료될 때까지 대기해야 합니다. 동일 워크스페이스 내의 복원 경쟁은 여전히 브리지의 `restore_in_progress` / 병합 동작을 사용합니다.

JSONL이 `chats/archive/` 아래에 있는 세션을 로드하거나 재개(resume)하려고 할 때 `SessionArchivedError`이 발생합니다:

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

상태 `409`와 함께.

동일한 id에 대한 세션 아카이브 또는 언아카이브 전환이 이미 진행 중인 경우 `SessionArchivingError`이 발생합니다:

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

상태 `409` 및 `Retry-After: 5`와 함께.

## 기능(Capabilities) [#capabilities]

데몬은 serve 기능 레지스트리에서 지원되는 기능 태그를 광고합니다. 클라이언트는 `mode`이 아닌 `features`을 기준으로 UI를 제한 **해야** 합니다(설계 §10 참조).

```
['health', 'capabilities', 'session_create', 'session_startup_config', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_catalog_batch', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_mid_turn_send_now',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_skills_config_runtime',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'scheduled_task_gate', 'autofix_pr_watches', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_resources', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload', 'workspace_file_delete', 'workspace_directory_create', 'workspace_directory_delete',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_skill_settings_toggle', 'workspace_skill_settings_batch_toggle',
 'workspace_session_refresh',
 'extension_batch_activation_v2', 'extension_activation_explicit_refresh',
 'extension_state',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_btw_stream', 'session_shell_command',
 'standalone_sessions_v1', 'standalone_session_options_v1',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'user_language_sync', 'session_message_deletion', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'workspace_model_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name', 'workspace_runtime_removal', 'workspace_runtime',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'extension_local_path_install',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state', 'workspace_session_live_state_batch',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> 조건부 태그는 배포 또는 런타임 가용성 조건이 충족될 때만 나타납니다(아래 표 참조). F3의 `permission_mediation` 태그는 항상 활성화되어 있으며 SDK 클라이언트가 빌드 지원 집합을 인트로스펙트(introspect)할 수 있도록 `modes: ['first-responder', 'designated', 'consensus', 'local-only']`을 포함합니다; 런타임 활성 전략은 `body.policy.permission`에 있습니다.

`session_startup_config`은 일반 및 독립형 생성에서 선택적 `startupConfig: { modelServiceId, reasoningEffort? }`을 광고합니다. 이 태그는 반드시 프리플라이트(preflight)하세요: 구버전의 일반 생성 라우트는 이 객체를 조용히 무시할 수 있습니다. `modelServiceId`는 필수이며(1–256자); `reasoningEffort`은 선택된 모델이 지원할 경우 `none`, `default`, `low`, `medium`, `high`, `xhigh` 또는 `max`을 허용합니다. 생략 시 reasoning setter나 암시적 `default` 없이 모델만 적용됩니다. 이 객체는 레거시 최상위 `modelServiceId` 또는 명시적 단일 스코프와 결합할 수 없으며 새로운 스레드를 의미합니다. 시작 시 공유 기본값을 저장하지 않으며, 이후 세션 동작은 변경되지 않습니다.

성공 응답에는 `modelApplied: true`과 `startupConfigApplied: { modelServiceId, reasoningEffort?, effectiveReasoning? }`이 포함됩니다. 모델 선택기는 정규화(canonical)됩니다. 명시적인 reasoning 요청에만 두 개의 reasoning 필드가 포함되며, 유효한 상태는 `{ state: 'disabled' }`, `{ state: 'provider-default' }` 또는 `{ state: 'enabled', effort? }`입니다(토글 전용 reasoning에는 effort가 없음). 잘못된 구조는 `400 invalid_startup_config`; 거부되거나 확인되지 않은 선택은 `422 startup_config_rejected`입니다. 확실한 독립형 거부는 소유한 기록을 롤백하고 반환 전에 빈 출력 디렉터리를 폐기하려고 시도합니다; 제거가 확인되지 않는 기록 롤백과 일시적인 시작 실패는 `standalone_creation_outcome_unknown`을 유지하는 반면, 디렉터리 폐기 실패는 로그에만 남기고 확실한 거부는 여전히 반환됩니다. SDK에서의 성공 본문 확인 실패는 프로토콜 오류이며, 복구된 세션을 채택하라는 지시가 아닙니다.

`session_scope_override`은 `POST /session`의 요청별 `sessionScope` 필드에 대한 협상 핸들입니다(아래 참조). 구버전 데몬은 이 필드를 조용히 무시하므로, SDK 클라이언트는 이 필드를 보내기 전에 이 태그에 대해 `caps.features`을 프리플라이트해야 합니다.

`session_id_override`은 `POST /session` 및 ACP `session/new` 메타데이터의 선택적 호출자 제공 `sessionId`에 대한 협상 핸들입니다. 구버전 데몬은 이를 조용히 무시할 수 있으므로, 클라이언트는 이 필드를 보내기 전에 `caps.features`에 이 태그가 포함되어 있는지 확인해야 합니다.

`persistent_workspace_registration`은 런타임에 추가된 워크스페이스에 대한 영구 등록을 광고합니다. `POST /workspaces`은 `{ "cwd": "/absolute/path", "persist": true }`를 허용하며; 성공 시 `persisted: true`을 포함합니다. 등록은 사용자의 Qwen 홈 아래 데몬의 정규화된(primary) 워크스페이스 범위로 한정되며 다음 데몬 시작 시 복원됩니다. `persist`를 생략하면 프로세스 로컬 등록이 유지됩니다. `GET /workspace-registrations`는 저장된 원하는 집합을 나열하며, `DELETE /workspace-registrations/:id`은 활성 런타임을 핫 리무브(hot-remove)하지 않고 다음 재시작을 위해 항목을 잊어버립니다(forget).

`workspace_display_name`은 `POST /workspaces`의 선택적 `displayName` 입력, `PATCH /workspaces/:workspace`을 통한 워크스페이스 메타데이터 업데이트, 워크스페이스 투영(projection)의 선택적 표시 이름(display-name) 필드를 광고합니다. 이름은 조회나 라우팅에 참여하지 않습니다: `id`와 정규화된 `cwd`만이 유일한 셀렉터이며, 중복 이름이 허용됩니다.

`workspace_runtime_removal`은 `DELETE /workspaces/:workspace`을 통해 동기식 핫 제거를 지원합니다. Capability workspace 항목에는 선택적 `removable`가 추가되며, `removable: true`이 있는 행만 제거할 수 있습니다. 제거 시 런타임의 모든 영구 등록 별칭도 잊혀지지만, 파일, 설정, 트랜스크립트 또는 아카이브는 절대 삭제되지 않습니다.

`workspace_runtime`은 `GET /workspace/runtime/status`, `POST /workspace/runtime/ensure` 및 해당 `/workspaces/:workspace/runtime/...`에 해당하는 기능을 지원합니다. `ensure`는 capability 선택을 허용하지 않으며, 선택된 신뢰된 workspace의 ACP 런타임을 시작하거나 재사용하고 그 lifecycle 상태와 단조 증가하는 runtime epoch를 반환합니다. 기본 경로는 기본 런타임만 소유하며, 자격을 갖춘 경로는 선택된 등록된 런타임만 해석하고 절대 폴백하지 않습니다. 성공적인 ensure는 런타임의 10분 keepalive 윈도우를 갱신합니다. Status는 읽기 전용이며 자식 프로세스를 절대 시작하지 않습니다. 동시 ensure는 하나의 물리적 시작을 공유합니다. 시작 중이거나 실패한 경우 재시도 가능한 `503 runtime_still_starting` 또는 `503 runtime_initialization_failed`을 반환합니다. Capability 준비는 ensure 관찰 예산이 만료된 후에도 계속될 수 있으며, 이 경우 ensure는 status 폴링을 위해 준비되지 않은 capability 상태를 가진 라이브 런타임을 여전히 반환합니다. Capability는 모든 활성 런타임 브리지가 권위 있는 lifecycle 스냅샷을 제공할 때만 지원되며, 선택된 레거시 주입 브리지는 추측된 상태나 epoch 대신 `501 workspace_runtime_not_supported`을 반환합니다.

`workspace_runtime_stop`은 사용자 확인된 런타임 중지를 독립적으로 지원합니다. `GET /workspaces/runtime-stop-options`은 읽기 전용인 프로세스 전역 미리보기로, 커밋된 자식 수, 모델링된 자식 상한, 각 표시되는 workspace의 세션, 차단된 이유, 채널 ID, epoch, 현재 중지 토큰 및 최신 영수증을 포함합니다. 일반 로드된 세션은 명시적으로 중지할 수 있지만, 독립적인 ACP 클라이언트, 활성화된 스케줄, 대기 중인 스케줄러/관리/시작 작업, 메모리 작업, 워커, 음성 및 특수 목적 런타임은 차단됩니다. `POST /workspaces/:workspace/runtime/stop`는 엄격한 변경 게이트와 선택된 신뢰된 런타임만 사용합니다. 미리보기에서 `confirmInterruptions: true`, `expectedChannelId`, `expectedRuntimeEpoch`, `expectedStopToken` 및 정확한 `expectedSessionIds`을 보내십시오. 절대 기본 런타임으로 폴백하지 마십시오. 미리보기와 모든 영수증은 런타임의 라이브 ACP 채널을 `channels` (`channelId`, `runtimeEpoch`, 선택적 `executionEngine`)로 나열하며, 런타임은 실행 엔진당 하나의 채널을 가질 수 있고, 중지는 모두를 커버합니다. `channelId`는 처음 나열된 채널을 지정하고 `runtimeEpoch`은 가장 최근 나열된 epoch이므로, 미리보기 이후 시작된 채널은 확인을 만료시킵니다.

성공적인 응답에는 승인된 세션 종료와 나열된 모든 자식의 프로세스 레지스트리 해제 후 `state: "stopped"`, `stopped: true` 및 `released: true`가 포함됩니다. 등록, 파일 및 저장된 기록은 유지됩니다. 응답에는 영향받은, 중단된, 닫힌 및 남은 세션 ID가 포함됩니다. 만료되거나 차단된 확인은 HTTP 409 (`workspace_runtime_stop_stale` / `workspace_runtime_stop_blocked`)입니다. 부분적 종료는 409 `workspace_runtime_stop_incomplete`입니다. 진행 중인 철거나 해제가 증명되지 않은 채 실패한 철거는 503 `workspace_runtime_stop_in_progress` / `workspace_runtime_stop_failed`입니다. 지원되지 않는 관리는 501 `workspace_runtime_stop_not_supported`입니다. 나중에 레지스트리 해제를 증명하는 불완전한 철거는 오류 경고와 함께 200을 반환할 수 있으며, 확인되지 않은 세션 플러시는 여전히 부분/오류 결과를 반환합니다. 총 관찰/종료 예산은 60초입니다. 세션 종료가 아직 진행 중일 때 예산이 만료되면, 응답은 `state: "failed"` 및 `503 workspace_runtime_stop_failed`으로 확정되며 정리는 별도로 계속됩니다. 호출자가 실패를 받았더라도 선택된 workspace는 격리된 상태로 유지되며 실제 정리 완료까지 자식이 계속 계산됩니다. 읽기 전용 옵션은 나중에 승인된 종료와 증명된 해제 후 `stopped`을 보고하거나, 지속성이 확인되지 않은 경우 `incomplete`을 보고할 수 있으며, 이미 반환된 실패 스냅샷은 변경되지 않습니다. 만약 예산이 세션 종료 사이에 소진되면, 응답은 `state: "incomplete"` 및 `409 workspace_runtime_stop_incomplete`으로 확정됩니다: 더 이상의 종료나 강제 킬이 시작되지 않고, 중지의 수용 가드가 해제되며(생존한 자식은 평소대로 계속 계산됨), 남은 세션을 중지하려면 새로운 미리보기와 확인이 필요합니다. 플러시 거부는 남은 세션을 강제 킬하여 우회되지 않습니다. 루트 종료나 전역 프로세스 수 감소만으로 선택된 자식의 해제가 입증되지 않습니다. Windows에서는 레지스트리가 하위 프로세스 그룹을 추적하지 않으므로, 루트의 확정된 종료가 해제 증거가 되며, 따라서 `released: true`은 그곳에서 프로세스 트리가 사라졌음을 증명하지 않습니다.

최신 소비된 토큰의 반복적인 확인은 동일한 작업을 관찰합니다. 새로운 확인은 불완전한 중지를 토큰 회전으로 재시도할 수 있으며, 이전의 소비된 토큰들은 만료됩니다. 응답이 유실된 경우, 다른 대상을 중지하는 대신 workspace와 중지 토큰으로 최신 영수증을 매칭하여 옵션을 읽으십시오. 제거, 신뢰 변경 또는 데몬/브리드 재생성 후 영수증을 사용할 수 없을 수 있으며, 부재는 결과를 알 수 없게 만들고 절대 계속 진행을 승인하지 않습니다. SDK `runtimeStopOptions()` 및 `workspaceById(id).stopRuntime(confirmation)`은 ACP 전송을 사용하더라도 REST를 사용하며 POST를 자동으로 반복하지 않습니다. 세션 구독자는 `session_closed`를 `reason: "client_close"` 및 `cause: "workspace_runtime_stop"`와 함께 수신하며, 치명적인 중지 관련 종료는 추가로 `persistenceUnconfirmed: true`을 표시합니다. 업데이트된 Web Shell 클라이언트는 저장된 선택/트랜스크립트를 유지하고 명시적인 Resume를 기다립니다. 이는 일시적인 중지가 아닌 일회성 중지이며, 이벤트를 놓친 클라이언트는 다시 용량을 경쟁할 수 있습니다.

런타임 status 및 ensure 응답은 이 형식을 사용합니다:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "state": "active",
  "runtimeLive": true,
  "runtimeEpoch": 4,
  "capabilities": {
    "skills": {
      "state": "ready",
      "revision": 2,
      "runtimeEpoch": 4
    }
  }
}
```

workspace 런타임에 둘 이상의 실행 엔진이 있는 경우, `runtimeLive` 및 `runtimeEpoch`은 workspace 제어(MCP 및 Skills)를 담당하는 채널을 설명합니다: 해당 채널이 살아있는 동안 다른 엔진이 시작되거나 종료되어도 이들은 변경되지 않습니다. `state`는 해당 채널이 살아있지 않을 때 `cold`, `starting` 또는 `stopping`로 보고하며; `active` 및 `idle`은 모든 엔진에서의 작업을 계산합니다.

`capabilities.skills.state`은 `not_started`, `starting`, `ready`, `stale` 또는 `error`입니다; 실패에는 `capabilities.skills.error` 내의 `{code, message}`이 포함됩니다. Skills 카탈로그는 최상위 및 capability `runtimeEpoch` 값이 일치할 때만 최신 상태입니다. `revision`는 하나의 런타임 epoch 내에서 Skills 준비 순서를 지정하며, epoch 간 비교해서는 안 됩니다.

`workspace_skills_config_runtime`은 `/workspace/{config,runtime}/skills` 및 `/workspaces/:workspace/{config,runtime}/skills` 아래에서 분리된 Skills 읽기 및 구성 변경을 지원합니다. Web Shell은 Skills 관리에 이러한 경로를 사용하며, 새 세션을 작성하는 동안 매칭-epoch 런타임 카탈로그로 대체하기 직전에 구성에서 슬래시 명령어를 채우는 데 사용합니다. 기능이 없는 경우, 클라이언트는 레거시 Skills 경로를 계속 사용해야 하며 solely Skills를 위해 런타임 ensure를 호출해서는 안 됩니다.

`session_load` 및 `session_resume`은 명시적 복원 경로(`POST /session/:id/load` 및 `POST /session/:id/resume`)를 지원합니다. 이전 데몬은 이러한 경로에 대해 `404`을 반환하므로, SDK 클라이언트는 호출 전에 `caps.features`를 사전 점검해야 합니다. `unstable_session_resume`은 기초 ACP 메서드가 `connection.unstable_resumeSession`로 명명되었던 당시 출시된 SDK와의 호환성을 위해 지원 중단된 별칭으로 여전히 지원되며, 새로운 클라이언트는 `session_resume`로 게이트해야 합니다.

`limits.sessionRestoreTimeoutMs`이 존재하는 경우, 이는 기본 ACP `loadSession` / `unstable_resumeSession` 요청에 대한 데몬의 월클럭(wall-clock) 예산입니다. 이는 v1에서 추가된 필드입니다. TypeScript SDK는 데몬에 10초의 클라이언트 여유 시간을 제공하고, Web Shell 워치독은 15초를 제공합니다. 이전 버전의 데몬과 통신하는 클라이언트는 각각 70초와 75초를 사용해야 합니다.

`session_transcript`은 지속된 활성 세션 JSONL에 대한 읽기 전용 페이지네이션 재생 뷰인 `GET /session/:id/transcript`을 광고합니다. 이는 `/load`과 별개입니다: 클라이언트를 연결하지 않고, 라이브 EventBus를 시딩하지 않으며, 라이브 세션을 생성하지 않고, 라이브 재생 창을 변경하지 않습니다. 클라이언트는 긴 세션의 완전한 디스크 트랜스크립트가 필요한 경우 이를 사용하고, 콜드 UI 복원 중 제한된 라이브 재생에만 `/load`을 계속 사용해야 합니다.

`workspace_persisted_transcript`은 ACP를 시작하지 않고, 라이브 브리지 상태를 쿼리하지 않으며, 설정을 로드하지 않고, 프로젝트 기능을 발견하지 않고, 레거시 지속 커서 키를 생성하지 않는 데몬 로컬의 지속 전용 페이저인 `GET /workspaces/:workspace/session/:id/transcript`을 광고합니다. 신뢰할 수 있는 단일 워크스페이스 주(primary)가 복수형 라우트를 사용할 수 있으므로 이 태그는 조건부 없이 적용됩니다. 워크스페이스별 신뢰 권한 부여는 모든 요청에서 여전히 평가됩니다. 등록된 신뢰할 수 없는 보조(secondary) 워크스페이스는 읽기가 허용되지만, 신뢰할 수 없는 주 워크스페이스는 거부됩니다.

`workspace_session_export`은 선택된 워크스페이스의 활성 지속 세션에 대한 신뢰 전용 전체 내보내기인 `GET /workspaces/:workspace/session/:id/export`을 광고합니다. 이는 `session_export` 및 `workspace_qualified_rest_core`과 독립적입니다: 릴리스된 데몬은 복수형 라우트를 구현하지 않고도 이전 태그들을 모두 광고할 수 있으므로, 클라이언트는 이 태그를 직접 사전 확인(pre-flight)해야 합니다. 신뢰할 수 있는 단일 워크스페이스 주가 ID 또는 cwd로 라우트를 사용할 수 있으므로 이 태그는 조건부 없이 적용됩니다. 내보내기는 라이브 소유자를 해석하지 않고, ACP를 시작하지 않으며, 클라이언트를 연결하지 않고, 다른 워크스페이스로 폴백하지 않습니다.

`workspace_archived_session_export`은 선택된 워크스페이스의 아카이브된 지속 스토리지로부터의 신뢰 전용 전체 내보내기인 `GET /workspaces/:workspace/session/:id/archive/export`을 광고합니다. 이는 `workspace_session_export` 및 `workspace_qualified_rest_core`과 독립적이며, 클라이언트는 이 태그를 직접 사전 확인해야 합니다. 별도의 라우트는 이전 데몬이 아카이브 의도를 무시하고 동일한 ID의 활성 트랜스크립트를 반환하는 것을 방지합니다.

`workspace_session_live_state`은 선택된 워크스페이스 런타임의 라이브 세션 스냅샷과 전체 지속 카탈로그 재로드가 언제 필요한지 클라이언트에 알려주는 인메모리 카탈로그 버전을 포함하는 신뢰 전용, 메모리 전용 스냅샷인 `GET /workspaces/:workspace/sessions/live-state`을 광고합니다. 이는 `workspace_qualified_rest_core`와 독립적입니다: 릴리스된 데몬은 이 라우트를 구현하지 않고도 더 넓은 워크스페이스 REST 기능을 광고할 수 있으므로, 클라이언트는 이 태그를 직접 사전 확인해야 합니다. 신뢰할 수 있는 단일 워크스페이스 주가 ID 또는 cwd로 라우트를 사용할 수 있으므로 이 태그는 조건부 없이 적용됩니다. 워크스페이스별 신뢰 검사는 모든 요청에서 여전히 적용되며, 이 라우트는 관대한 비신뢰 보조 지속 카탈로그 읽기 정책을 라이브 브리지 상태로 확장하지 않습니다. 이 태그는 엔드포인트가 존재함을 의미하며, 모든 라이브 항목이 생명주기에 의존적인 선택적 `updatedAt` 활동 워터마크를 포함한다는 보장은 하지 않습니다.

`workspace_session_live_state_batch`은 `POST /sessions/live-state`을 광고합니다. 클라이언트는 배칭 폴링 전에 이를 한 번 사전 확인하고, 이전 데몬을 위해 단일 워크스페이스 라우트를 유지합니다. 배치는 단일 워크스페이스 라우트와 동일한 신뢰, 메모리 전용 스냅샷 및 카탈로그 버전 의미를 사용합니다.

선택적 최상위 `/capabilities` 필드 `sessionLiveStatePollIntervalMs`은 밀리초 단위의 데몬 전역 라이브 상태 폴링 간격을 광고합니다. 이는 워크스페이스 환경 오버레이와 독립적으로 시작 환경 변수 `QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS`에서 한 번 해석됩니다. `1000`부터 `2147483647`까지의 정수 값이 허용되며, 누락되거나 잘못된 값은 `5000`을 사용합니다. Web Shell은 모든 워크스페이스 라이브 상태 폴링에 이 힌트를 소비하며, 이전 호환되지 않는 데몬에서 필드가 없거나 잘못된 경우 `5000`으로 폴백합니다. 이 필드는 라우트의 스냅샷 의미, 즉각적인 로컬/가시성 새로고침 또는 전체 카탈로그 폴링을 변경하지 않습니다. SDK 클라이언트는 자체 타이머에 대한 책임을 유지합니다.

`slow_client_warning`은 SSE 백프레셔(backpressure) 동작을 다룹니다: (a) 구독자의 라이브 프레임 백로그나 라이브 직렬화 바이트 백로그가 75% 이상 차면 데몬은 `slow_client_warning` 합성 이벤트 스트림 프레임을 방출하며, 각 오버플로 에피소드마다 한 번 발생하고(두 측정값 모두 37.5% 미만으로 배출되면 재장전됨); (b) `GET /session/:id/events`는 큰 재생 링에 대해 콜드 재연결 시 구독자별 프레임 백로그를 사전 크기 조정하기 위해 `?maxQueued=N` 쿼리 매개변수(범위 `[16, 2048]`)를 허용합니다. 직렬화 바이트 상한은 데몬이 소유하며(기본값 **2 MiB** per subscriber), 라이브 전용이고, 의도적으로 쿼리 매개변수가 없습니다. 데몬 전역 링 크기는 `--event-ring-size`로 제어됩니다(기본값 **8000**, #3803 §02 참조). 이전 데몬은 경고/쿼리 동작이 조용히 결여되어 있습니다 — 옵트인(opt-in) 전에 이 태그를 사전 확인하세요.

`typed_event_schema`은 SDK의 `KnownDaemonEvent` 스키마와 일치하는 데몬 이벤트 페이로드를 광고합니다. 이전 데몬은 여전히 호환되는 프레임을 스트리밍할 수 있지만, SDK 클라이언트는 타입 지정된 이벤트 커버리지를 가정하기 전에 이 태그를 사전 확인해야 합니다.

`client_heartbeat`은 `POST /session/:id/heartbeat`을 광고합니다. 이전 데몬은 `404`을 반환하므로, 주기적 하트비트를 발행하기 전에 이 태그를 사전 확인하세요.

`session_close`과 `session_metadata`은 `DELETE /session/:id`과 `PATCH /session/:id/metadata`을 광고합니다. 이전 데몬은 `404`을 반환하므로, 닫기(close) 또는 이름 바꾸기(rename) 기능 노출 전에 이 태그들을 사전 확인하세요.

`session_organization`은 사용자 정의 세션 그룹과 고정(pinning)을 광고합니다. 이는 `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization` 및 옵트인 조직화된 목록 뷰 `GET /workspace/:id/sessions?view=organized`을 추가합니다. `session_organization`와 `workspace_qualified_rest_core` 모두 광고될 때, 워크스페이스 한정 조직화 변형(mutations) `PATCH /workspaces/:workspace/session/:id/organization`도 사용할 수 있게 됩니다. 레거시 변형은 여전히 주 워크스페이스 전용입니다. 이전 데몬은 변형/그룹 라우트에 대해 `404`을 반환하고 조직화된 뷰 계약을 무시하므로, WebShell/SDK 클라이언트는 해당 그룹화 또는 고정 UI를 표시하기 전에 이 태그들을 사전 확인해야 합니다.

`session_archive`은 v1 디렉터리 상태 아카이브 API를 광고합니다: `POST /sessions/archive`, `POST /sessions/unarchive` 및 `GET /workspace/:id/sessions?archiveState=active|archived`. 아카이브된 세션은 아카이브 해제(unarchived)될 때까지 로드하거나 재개할 수 없습니다. `session_archive_idle_guard`는 추가적인 `requireIdle` 아카이브 옵션을 광고합니다: 소유 런타임은 종료를 시작하기 직전에 활성 작업이 유휴(idle) 상태인지 확인하며, 그렇지 않은 경우 활성 트랜스크립트를 그대로 둡니다. `session_storage_conflict_repair`은 아래 설명된 추가적인 `resolveConflicts` 요청 옵션과 `resolvedConflicts` 응답 버킷을 광고합니다.

`workspace_qualified_rest_core`은 `/workspaces/:workspace/...` 아래에 복수형 핵심 REST 경로를 제공합니다. 셀렉터는 먼저 정확한 워크스페이스 ID로 해석되며, 그 다음 정규화된 절대 cwd의 URL 인코딩된 값으로 해석됩니다. 최신 단일 워크스페이스 데몬은 `multi_workspace_sessions`이 없더라도 기본 런타임을 `workspaces[]`에 포함하여 클라이언트가 워크스페이스 한정 경로에 필요한 ID를 찾을 수 있도록 합니다; 클라이언트는 배열을 생략하는 이전 데몬의 경우 `capabilities.workspaceCwd`로 폴백해야 합니다. 신뢰 상태 및 신뢰 요청 경로는 등록된 비신뢰 워크스페이스에서 사용할 수 있습니다; 자격 있는 훅 상태 읽기(`GET /workspaces/:workspace/hooks`)도 대기 중인 프로젝트 훅 신뢰 결정을 보고하므로 등록된 비신뢰 워크스페이스에서 제공되며, 이는 자격 있는 승인 변경과 일치합니다. 파일 읽기 경로는 기존 파일 시스템 읽기 정책을 따릅니다. 등록된 비신뢰 보조 워크스페이스는 또한 영구 저장 전용 세션 및 세션 그룹 카탈로그를 노출합니다: 이러한 읽기는 세션에 연결하지 않고, ACP를 시작하지 않으며, 라이브 브리지 상태를 병합하지 않습니다. 파일 쓰기, 카탈로그 변경 및 기타 복수형 핵심 경로는 별도의 기능이 더 좁은 정책을 문서화하지 않는 한 신뢰된 워크스페이스가 필요합니다: `workspace_persisted_transcript`(읽기 전용), 또는 신뢰 부여 변경은 `workspace_trust_grant`이 광고되는지 여부와 관계없이 등록된 비신뢰 워크스페이스에서 허용됩니다 — 해당 태그는 신뢰 핫 리로드가 연결되어 있는지 여부만 보고하므로 기록된 결정이 데몬 재시작 없이 실행 중인 런타임에 도달할 수 있습니다; 이 태그는 경로가 제공되는지 여부를 보고하지 않습니다. 비신뢰 기본 항목은 복수형 카탈로그 및 트랜스크립트 경로에서 `403 { code: "untrusted_workspace" }`을 계속 수신합니다; 레거시 단수형 기본 경로는 기존 호환성 동작을 유지합니다. 이 태그는 핵심 파일, 상태, 설정, 권한, 신뢰, 생명주기, MCP 제어, 도구 및 스킬 토글, 메모리, 워크스페이스 에이전트 CRUD 및 세션 저장소 표면을 다룹니다. 인증, 음성, 확장 기능, ACP/WebSocket 전송, 채널 워커 라우팅 또는 워크스페이스 한정 세션 내보내기는 다루지 않습니다; 사전 확인으로 `workspace_session_export` 또는 `workspace_archived_session_export`을 별도로 수행하십시오. 워크스페이스 신뢰는 ACL이 아닙니다: 데몬 토큰을 보유한 클라이언트는 이 정책에서 허용하는 모든 등록된 워크스페이스 표면을 읽을 수 있습니다.

`workspace_qualified_voice`은 신뢰된 워크스페이스 런타임에 의해 선택된 음성 경로를 광고합니다: `GET` 및 `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe`, 그리고 `WS /workspaces/:workspace/voice/stream`. 멀티 워크스페이스 런타임과 공유 ACP/음성 WebSocket 리스너가 모두 활성화된 경우에만 광고됩니다. 셀렉터는 다른 복수형 경로와 동일한 ID 또는 인코딩된 절대 cwd 규칙을 따릅니다. REST의 경우, 알 수 없는 셀렉터는 `400 { code: "workspace_mismatch" }`을 반환하고 비신뢰 셀렉터는 `403 { code: "untrusted_workspace" }`을 반환합니다; WebSocket 업그레이드 거부는 구조화된 JSON 엔벨로프 없이 해당하는 HTTP 400/403 상태를 노출합니다. 두 전송 방식 모두 기본 항목으로 폴백하지 않습니다. 레거시 `/workspace/voice`, `/workspace/voice/transcribe` 및 `/voice/stream`은 여전히 기본 항목 전용입니다. 클라이언트는 모든 자격 있는 음성 모드에 대해 `workspace_qualified_voice`을 사용하며 선택된 런타임이 구성별 오류를 보고하도록 합니다. 레거시 `workspace_voice`, `workspace_voice_transcription` 및 `voice_transcribe` 태그는 기본 항목에 바인딩된 경로만 설명하며 자격 있는 보조 구성을 숨겨서는 안 됩니다.

`workspace_qualified_memory`은 워크스페이스 한정 관리형 메모리 경로를 광고합니다: `POST /workspaces/:workspace/memory/{remember,forget,dream}`은 작업을 큐잉하고 `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`는 이를 다시 읽습니다. ACP HTTP와 멀티 워크스페이스 런타임이 모두 활성화된 경우에만 광고됩니다. 셀렉터는 다른 복수형 경로와 동일한 ID 또는 인코딩된 절대 cwd 규칙을 따릅니다. 각 등록된 워크스페이스는 자체 작업 레인을 가지며; 기본 항목의 자격 있는 레인은 단수형 `/workspace/memory` 표면과 동일한 인스턴스이므로, 하나에 큐잉된 작업은 다른 쪽에서 읽을 수 있습니다. 해석은 엄격하게 선택된 런타임별로 이루어지며 기본 항목 폴백이 없습니다: 알 수 없는 셀렉터는 `400 { code: "workspace_mismatch" }`을 반환하고, 비신뢰 셀렉터는 `403 { code: "untrusted_workspace" }`을 반환하며, 비활성이거나 드레이닝 중인 런타임은 `503 { code: "workspace_runtime_unavailable" }`을 반환합니다. 읽기는 레인을 할당하지 않으므로, 작업이 없는 워크스페이스를 폴링하면 `404 { code: "<kind>_task_not_found" }`이 반환됩니다. 작업 ID는 해당 레인에 범위가 지정되며 워크스페이스 재구성이나 런타임 교체 후에도 지속되지 않습니다; 오래된 ID는 데이터 손실 조건이 아닌 `404`을 반환합니다. ACP HTTP가 비활성화된 경우 태그가 광고되지 않으며 비기본 항목의 자격 있는 요청은 재시도 불가능한 `501 { code: "workspace_memory_unavailable" }`을 반환하지만, 기본 항목의 자격 있는 경로는 로컬 소유 레인을 통해 계속 작동합니다.

`session_lsp`은 데몬 클라이언트를 위한 읽기 전용 구조화된 LSP 상태 스냅샷인 `GET /session/:id/lsp`을 광고합니다. 이전 데몬은 `404`을 반환합니다; 원격 LSP 상태를 노출하기 전에 이 태그를 사전 확인하십시오.

`session_resources`은 선택된 라이브 세션의 Config에서 생성된 살균된 스킬 및 MCP 스냅샷의 읽기 전용 쌍인 `GET /session/:id/resources`을 광고합니다. 이 경로는 라이브 세션 소유자 범위이며: 기본 런타임으로 폴백하지 않고 워크스페이스 상태에서 세션의 리소스를 추론하지 않습니다. 중첩된 `skills` 및 `mcp` 객체는 해당하는 워크스페이스 상태 페이로드를 재사용하지만, MCP 인증, 풀, 워크스페이스 예산 및 워크스페이스 검색 오류 강화 정보를 생략합니다. 선택된 세션의 MCP 관리자에서 보고한 상태, 검색 및 회계 정보는 그대로 남아 있습니다. 이전 데몬은 `404`을 반환합니다; 세션 리소스 카탈로그를 표시하기 전에 이 태그를 사전 확인하십시오.

`session_status`은 ID별 단일 세션의 라이브 브리지 요약인 `GET /session/:id/status`을 광고합니다. `clientCount` 및 `hasActivePrompt` 외에도 라이브 세션은 `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount`을 노출하며 실패한 턴 이후 보존된 `turnError`을 포함합니다. 오류는 다음 프롬프트가 실제로 시작될 때 지워집니다. 현재 브리지에서 실행 중인 턴을 정산한 라이브 세션에는 라이브 상태 경로에 문서된 것과 동일한 활동 워터마크인 `updatedAt`도 포함됩니다; 이 경로는 브리지 요약을 직접 반환하므로 값이 영구 저장된 트랜스크립트 mtime과 병합되지 않으며 세션 목록이 보고하는 값보다 빠를 수 있습니다. 단일 세션 상태 응답과 워크스페이스 세션 목록 모두 `turnError` 및 `pendingInteractions`을 포함합니다: 렌더링 준비된 권한 작업 또는 `ask_user_question` 질문과 기존 권한 투표 경로에 필요한 `requestId` 및 선택 가능한 옵션. 각 사용자 질문에는 `answerKey`이 있으며; 해당 값을 키로 사용하여 `answers`로 투표합니다. 예: `{ "0": "Polling" }`. 영구 저장 전용 세션은 런타임이 존재하지 않으므로 런타임 상태를 생략합니다. 이전 데몬은 `404`을 반환합니다; 전체 세션 목록을 스캔하는 대신 단일 세션의 상태를 폴링하기 전에 이 태그를 사전 확인하십시오.

`session_info`은 `GET /workspace/:id/session-info` 및 그 `/workspaces/:workspace/session-info` 쌍둥이를 광고합니다. 응답은 목록 메타데이터를 하이드레이션하지 않고 영구 저장된 활성 및 아카이브된 세션 수를 집계합니다. 이는 명시적인 O(n) 디스크 스캔이며 폴링해서는 안 됩니다; 클라이언트는 `truncated: true`을 하한 결과로 취급해야 합니다.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_settings_toggle`, `workspace_skill_settings_batch_toggle`, `extension_batch_activation_v2`, `workspace_init` 및 `workspace_mcp_restart`은 아래에 문서화된 변경 제어 라우트를 광고합니다. 승인 모드 제어는 비엄격(non-strict) 호환성 게이트를 유지합니다. 다른 제어들은 운영자 권한에 의해 엄격하게 게이트됩니다: 신뢰할 수 있는 루프백 주(primary), 베어러 인증된 요청 또는 페어링된 로컬 제어(Local Control) 요청이 통과됩니다. 신뢰할 수 있는 루프백 권한 없이 엄격 게이트에 도달한 토큰 없는 주 요청은 401 `token_required`을 반환하며, 누락되거나 잘못된 구성된 자격 증명 및 페어링되지 않은 로컬 제어 자격 증명은 베어러 미들웨어에 의해 더 일찍 순수한 `401 Unauthorized`로 거부됩니다. 이러한 라우트 중 하나가 없는 데몬(daemon)은 `404`을 반환합니다. 설정별 Skill 태그는 다릅니다: 은퇴된(retired-tag) 세대의 데몬은 `workspace_skill_toggle` 및 `workspace_skill_batch_toggle`을 광고하고 카탈로그 검증된 계약을 동일한 경로에서 제공합니다. 은퇴된 단일 대상 라우트는 HTTP `404 skill_not_found` 또는 `409 skill_not_toggleable`을 반환할 수 있으며; 은퇴된 배치(batch) 라우트는 HTTP 200을 반환하고 카탈로그 파생 실패를 `errors[]`에 배치합니다. 기능(affordance)을 노출하기 전에 각 태그를 사전 확인(preflight)하고, 라우트 도달 가능성을 탐색하여 설정별 Skill 계약을 추론하지 마십시오. 라우트 경로와 요청 본문은 변경되지 않았습니다.

`mcp_guardrails` (이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14)은 MCP 예산 표면을 다룹니다: `GET /workspace/mcp`의 `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` 필드, 서버별 셀(cell)의 `disabledReason` 필드, 그리고 `--mcp-client-budget` / `--mcp-budget-mode` CLI 플래그. 이전 버전의 데몬은 새 필드를 완전히 생략합니다; SDK 클라이언트는 `budgets[]` 의미론(semantics)에 의존하기 전에 이 태그를 사전 확인합니다. 레지스트리 설명자(descriptor)는 향후 기능 모드(feature-modes) 노출을 위해 `modes: ['warn', 'enforce']`도 포함하지만, 현재로서는 클라이언트가 스냅샷의 `budgetMode` 필드에서 모드를 추론합니다. `enforce` 모드에서의 서버 거부는 `Object.entries(mcpServers)` 선언 순서에 따라 결정적입니다. 미래의 범위 우선순위 계층(qwen-code가 채택하는 경우)은 claude-code의 `plugin < user < project < local` 관례를 반영하기 위해 이를 "최저 우선순위 먼저"로 변경할 것입니다.

> **범위는 기능(capability) 기반입니다.** `mcp_workspace_pool`을 사용하면 하나의 워크스페이스 런타임 내의 세션들이 전송 풀(transport pool)과 `WorkspaceMcpBudget`을 공유하며, 스냅샷은 `budgets[0].scope: 'workspace'`을 출력합니다. 다른 워크스페이스 런타임은 독립적인 풀을 소유합니다. 태그가 없으면 각 ACP 세션은 레거시 `McpClientManager`을 사용하며, 스냅샷은 `scope: 'session'`을 출력하고, N개의 세션이 각각 구성된 상한(cap)을 소비할 수 있습니다.

`workspace_file_read`은 텍스트/목록/통계/glob 워크스페이스 파일 라우트(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`)를 다룹니다. `workspace_file_bytes`은 `GET /file/bytes`을 다루며, 이는 나중에 추가되어 클라이언트가 PR19-era 데몬에 대해 원시 바이트 윈도우(raw byte-window) 지원을 사전 점검할 수 있도록 합니다. `workspace_file_write`은 해시 인식 텍스트 변경(mutate) 라우트(`POST /file/write`, `POST /file/edit`)를 다룹니다. write 태그는 라우트 계약이 존재함을 의미하며, 현재 배포가 익명(anonymous) 변경을 허용한다는 뜻은 아닙니다. write/edit은 엄격한 변경(mutate) 라우트이며 운영자 권한이 필요하지만, 토큰 없는 신뢰된 루프백(loopback)은 자격을 충족합니다. `workspace_file_upload`은 `POST /file/upload`, 즉 바이너리 수신(inbound) 라우트를 다룹니다: `MAX_UPLOAD_BYTES` (50 MiB)로 제한된 `application/octet-stream` 본문은 덮어쓰지 않고 워크스페이스에 기록되며 — 이름이 이미 사용 중이면 자동 번호가 매겨집니다(`name (1).ext`, `name (2).ext`, ...). 이 또한 엄격한 변경(mutate) 라우트입니다.

`workspace_file_delete`은 `POST /workspaces/:workspace/file/delete`만 다룹니다; 레거시 주(legacy-primary) `/file/delete` 라우트는 존재하지 않습니다. JSON 본문은 `{ "path": "relative/file.txt" }`이며, 성공 시 `{ "kind": "file_delete", "path": "relative/file.txt" }`을 반환합니다. 이 엄격한 변경 라우트는 선택된 신뢰할 수 있는 로컬 워크스페이스에서 하나의 일반 파일을 영구적으로 제거합니다. 디렉터리와 심볼릭 링크는 거부되며; 지원되지 않는 팩토리(SSH 포함)는 422를 반환합니다. 이 기능은 프로토콜 지원을 설명하며 모든 워크스페이스에서 삭제할 수 있는 권한을 설명하지는 않습니다. 클라이언트는 `workspace_qualified_rest_core`도 사전 확인해야 합니다.

`workspace_qualified_rest_core`이 광고될 때, 동일한 파일 표면(surface)은 `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write`, `/workspaces/:workspace/file/edit`, `/workspaces/:workspace/file/upload` 및 `/workspaces/:workspace/file/delete`에서도 사용할 수 있습니다(마지막 라우트는 추가로 `workspace_file_delete`이 필요합니다).

`workspace_directory_create`과 `workspace_directory_delete`은 독립적으로 `POST /workspaces/:workspace/directory/create` 및 `POST /workspaces/:workspace/directory/delete`을 광고합니다. `workspace_qualified_rest_core`와 함께 작업(operation)의 태그를 사전 확인하십시오; 이전 버전의 자격 있는 데몬은 이러한 라우트가 없을 수 있습니다. 둘 다 신뢰할 수 있는 활성 선택된 로컬 런타임이 소유하는 엄격한 변경 사항이며, 주(fallback) 대체나 레거시 주 대조물이 없습니다. 생성은 기존 부모 하에서 배타적(exclusive)이며; 삭제는 영구적이고 재귀적입니다.

동일한 태그는 `/workspaces/:workspace/agents` 및 `/workspaces/:workspace/agents/:agentType`에서 워크스페이스 한정 프로젝트 에이전트 CRUD도 노출합니다. 이러한 복수형 라우트는 선택된 워크스페이스의 프로젝트 수준 에이전트만 읽거나 변경합니다; `global` 및 `user` 범위 요청은 `400 { code: "global_scope_not_supported_for_workspace_route" }`을 반환합니다. 워크스페이스 없는 `/workspace/agents` 라우트는 기존 주 워크스페이스 동작을 유지하며 사용자 수준 에이전트 범위에 대한 유일한 REST 표면으로 남아 있습니다.

`extension_management_v2`은 `/extensions/*`에서 사용자 수준 확장(extension) 카탈로그 및 변경 표면을, `/workspaces/:workspace/extensions/*`에서 워크스페이스 활성화 투영(projection)을 광고합니다. 아티팩트는 전역(global)입니다; 워크스페이스 라우트는 투영 읽기, 정확한 활성화 오버라이드 및 런타임 새로 고침만 노출합니다. 읽기는 신뢰할 수 없는 등록된 워크스페이스를 대상으로 할 수 있지만, 활성화, 새로 고침 및 워크스페이스 범위 설치는 신뢰할 수 있는 대상을 요구합니다. 느린 변경은 `/extensions/operations/:operationId`의 데몬 로컬 작업을 사용합니다; 저장소 생성(generation)이 운영 기록(operation history)이 아닌 재시작 간 및 데몬 간에 권위(authoritative)입니다. 게시된 `workspace_extensions` 기능과 `/workspace/extensions/*` 라우트는 주 워크스페이스 호환성 어댑터로 남아 있습니다. 클라이언트는 `extension_management_v2`을 사전 확인해야 하며 데몬 모드나 `workspace_qualified_rest_core`로부터 이를 추론해서는 안 됩니다.

`extension_git_credentials`은 `POST /workspace/extensions/install`과 `POST /extensions/install` 모두에서 인증된 HTTPS Git 설치를 광고합니다. 클라이언트는 URL 사용자 정보(userinfo)나 `credentialPersistence`을 보내기 전에 이 태그를 사전 확인해야 합니다; 이전 버전의 데몬은 URL 자격 증명을 거부합니다. 이 태그는 백엔드 프로토콜 지원을 설명하며 키체인(keychain) 가용성을 설명하지는 않습니다: 저장 모드(stored mode)는 터미널 작업 결과에서 선택된 백엔드를 보고합니다.

`extension_local_path_install`은 `POST /workspace/extensions/install`과 `POST /extensions/install` 모두에서 데몬 로컬 확장 소스를 광고합니다. `source`은 데몬 호스트에 존재하는 절대 경로여야 합니다. 상대 경로는 여전히 지원되지 않아 데몬 프로세스 cwd가 소스 신원을 변경하거나 GitHub `owner/repo` 축약형을 가릴(shadow) 수 없습니다. 기존 설치 작업은 확장을 관리형 스토리지로 복사하며; 소스를 링크하지는 않습니다. 클라이언트는 이전 버전의 데몬이 로컬 소스를 거부하므로 이 태그를 사전 확인해야 합니다.

`extension_batch_activation_v2`은 `PUT /extensions/activation`과 `PUT /workspaces/:workspace/extensions/activation`을 추가합니다. 둘 다 `extensionNames`에서 1~100개의 이름을 허용하며, 처음 발견된 순서를 유지하면서 대소문자를 구분하지 않고 중복을 제거하고, 변경된 대상들을 한 번의 생성(generation)으로 영속화하며, 하나의 `202` 작업 핸들(operation handle)을 반환합니다. `enabled` 또는 `disabled`을 설정할 때 대상이 설치되어 있을 필요는 없습니다: 해당 이름의 Extension이 설치되면 그 이름으로 원하는 상태(desired-state) 선언이 보존됩니다. 전역(global) 경로는 `state: "enabled" | "disabled"`을 허용하고 V2 `defaultActivation`에 기록합니다; 워크스페이스 경로는 또한 `"inherit"`을 허용하고 선택된 신뢰된(trusted) 런타임에 대해 정확한(exact) 재설정(override)을 적용하거나 해제합니다. `inherit`은 알 수 없는 이름을 선언하지 않으며, 모두 알 수 없는 항목을 해제(clear)하면 `updated: false`을 보고합니다.

`extension_activation_explicit_refresh`은 단일(singular) 및 배치(batch) 활성화(activation) 작업들이 활성 세션(active sessions)을 직접 새로고침(refresh)하지 않고 내구성 있는 정책(durable policy) 커밋(commit) 후 완료됨을 의미합니다. 즉각적인 적용이 필요한 호출자는 활성화 성공을 기다린 후, 새로고침 횟수를 직접 반환하는 동기적(synchronous) 기본(primary) 워크스페이스 `POST /workspace/extensions/refresh` 또는 별도의 작업 핸들을 반환하는 선택된 워크스페이스의 비동기(asynchronous) `POST /workspaces/:workspace/extensions/refresh` 중 하나를 제출해야 합니다. 두 형태는 상호 대체 불가능합니다: 비동기 작업은 전체 런타임 조정(reconciliation)이 완료될 때 적용된 생성(applied generation)을 기록하지만, 동기 경로는 아무것도 기록하지 않으므로, 생성 조정자(reconciler)는 해당 워크스페이스를 여전히 보류(pending) 상태로 간주하고 다음 패스(pass)에서 세션을 다시 새로고침합니다. 특정 워크스페이스를 지정할 수 있는 호출자는 비동기 형태를 선호해야 합니다. 새로고침 실패는 활성화 결과를 롤백(rollback)하거나 격하(downgrade)하지 않습니다. 이 기능이 없는 데몬(daemon)들은 이미 활성화 시 런타임 새로고침을 포함하므로, 호환성 클라이언트는 두 번째 새로고침을 제출해서는 안 됩니다. 독립적인 30초 생성 조정자는 계속 활성화되며 일반적으로 다음 패스에서 커밋된 정책을 적용합니다; 실패한 조정은 이후 패스에서 재시도됩니다.

### Extension 관리 V2 와이어(wire) 계약(contract) [#extension-management-v2-wire-contract]

모든 경로는 위의 데몬 베어러(bearer) 인증 규칙을 사용합니다. `X-Qwen-Client-Id`은 V2 변형(mutation) 경로에 대해 선택적이며, 제공될 경우 변형의 대상(target) 워크스페이스 런타임 중 하나에 등록된 클라이언트를 식별해야 합니다. `:extensionId`은 소문자 64진(hex) 확장(extension) ID입니다. `:workspace`는 정규화(canonicalization) 후 먼저 정확한 워크스페이스 ID로 해석되고, 그렇지 않으면 URL 인코딩된 절대 cwd로 해석됩니다.

| 메서드 및 경로 | 성공 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions` | `200` 전역 아티팩트 카탈로그 |
| `PUT /extensions/activation` | `202` 전역 기본 활성화 배치 작업 |
| `PUT /extensions/:extensionId/activation` | `202` 전역 기본 활성화 작업 |
| `POST /extensions/install` | `202` 설치(install) 작업 |
| `POST /extensions/check-updates` | `202` 업데이트 확인(update-check) 작업 |
| `POST /extensions/:extensionId/update` | `202` 업데이트(update) 작업 |
| `DELETE /extensions/:extensionId` | `202` 제거(uninstall) 작업, 또는 확장이 부재(absent)할 경우 멱등(idempotent) `204` |
| `GET /extensions/operations/:operationId` | `200` 작업 스냅샷(snapshot) |
| `GET /workspaces/:workspace/extensions` | `200` 워크스페이스 활성화 투영(projection) |
| `GET /workspaces/:workspace/extensions/:extensionId/state` | `200` 워크스페이스 리소스 상태 (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/:extensionId/state` | `202` 워크스페이스 리소스 상태 작업 (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/activation` | `202` 정확한 워크스페이스 활성화 배치 작업 |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation` | `202` 정확한 워크스페이스 활성화 작업 |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` 재설정 해제(clear-override) 작업 |
| `POST /workspaces/:workspace/extensions/refresh` | `202` 런타임 새로고침(runtime-refresh) 작업 |

#### 명시적(Explicit) Extension 새로고침

기능 태그(Capability tag): 선택적 세션 선택을 위해 `workspace_session_refresh`. `POST /workspace/extensions/refresh` (기본 런타임)과 `POST /workspaces/:workspace/extensions/refresh` (선택된 런타임) 모두 다음을 허용합니다:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

`sessionIds`을 생략하면 전체 런타임 새로고침이 유지됩니다. 제공된 배열은 요청 순서에 따라 중복 제거되며, `[]`은 세션이나 부트스트랩 캐시를 새로고침하지 않습니다. ID는 비어 있지 않은 문자열이어야 합니다. 잘못된 요청 형식은 HTTP 400을 반환합니다; 다른 워크스페이스가 소유한 세션을 포함한 알 수 없는 ID는 작업 시작 전에 HTTP 404를 반환합니다. 세션 소유권은 해결된(resolved) 런타임 내부에서만 확인되며, 기본 런타임 폴백(fallback)은 없습니다. 기존 인증, 엄격한(strict) 변형, 워크스페이스 신뢰 및 클라이언트 ID 게이트(gates)가 적용됩니다.

기본 경로는 여전히 `{ refreshed, failed }`와 함께 HTTP 200을 반환합니다; 자격을 갖춘(qualified) 경로는 여전히 작업 핸들과 함께 HTTP 202를 반환합니다. 횟수는 선택된 세션을 설명합니다. `sessionIds`을 사용한 새로고침은 현재 모든 세션을 선택했더라도 워크스페이스 전체 적용 생성(applied generation)을 진행시키지 않습니다. 자동 전체 조정은 변경되지 않으며 나중에 다른 세션을 새로고침할 수 있습니다. 선택은 세션 범위(session-scoped) 활성화 정책을 생성하지 않습니다: 공유 런타임 캐시가 변경될 수 있으며, 워크스페이스 이벤트는 여전히 워크스페이스 전체적입니다.

클라이언트는 빈 배열을 포함하여 필드를 제공하기 전에 `workspace_session_refresh`을 사전 검사(preflight)해야 합니다; 이전 버전의 데몬은 이를 조용히 무시할 수 있습니다. 필드가 없는 기존 호출에는 새로운 기능 검사가 필요하지 않습니다.

#### 워크스페이스 리소스 상태

`extension_state`을 독립적으로 사전 검사하십시오. 이는 Skills만 지원하며 MCP 리소스 관리를 암시하지 않습니다. 두 경로 모두 등록된 워크스페이스 런타임을 선택하며 기본(primary)으로 폴백하지 않습니다. GET은 기존 읽기 전용(read-only) 신뢰 규칙을 따릅니다; PUT은 신뢰된(trusted) 워크스페이스가 필요합니다.

```json
{
  "skills": [
    { "name": "review", "state": "enabled" },
    { "name": "deploy", "state": "disabled" }
  ]
}
```

PUT은 단일 요소 배치를 포함하여 1~100개의 항목을 허용합니다. 큐잉(queuing) 전에 잘못된 항목, 대소문자를 구분하지 않는 중복 이름 및 지원되지 않는 그룹을 거부합니다. 모든 이름은 현재 비활성화된(disabled) Skills를 포함하여 설치된 대상 Extension에 속해야 합니다; 잘못된 대상은 부분 쓰기(partial writes) 없이 작업을 실패시킵니다. 하나의 잠긴(lock) 스토어(store) 커밋이 정확한 정규 워크스페이스에 대해 나열된 재설정을 병합합니다. 나열되지 않은 Skills와 다른 워크스페이스는 보존됩니다. 설정(settings) 쓰기, 미래 이름 선언 또는 부모(parent) Extension의 암시적 활성화는 없습니다.

GET은 `v: 1`, `workspaceId`, `workspaceCwd`, `extensionId`, `name` 및 `skills`을 반환합니다. 각 Skill은 `name`, `defaultEnabled`, nullable `workspaceEnabled`, `effectiveEnabled` 및 선택적 `disabledReason`/`lockedScope`을 가집니다. 매니ifest(manifest)의 선택적 `skillStates`은 기본값(defaults)을 제공합니다; 누락된 값은 활성화(enabled)로 기본 설정됩니다. 활성 부모의 경우 우선순위는 settings 하드 비활성화, settings 명시적 활성화, settings 기본 비활성화, 워크스페이스 내부 재설정, manifest 기본값입니다. 내부 비활성화는 `disabledReason: "default"`을 사용하며 settings를 잠그지 않습니다. 비활성화되거나 제거된 부모는 Skill 재설정으로 부활시킬 수 없습니다.

`set_extension_state` 작업은 정렬된 `result.resourceStates.skills`를 포함하는 `status: "updated"`을 반환하며; `result.states`는 업데이트 확인 의미를 유지합니다. 영구 저장된 상태가 모든 세션이 새로고침되었음을 증명하지는 않습니다. 데몬은 부트스트랩 및 라이브 세션을 포함하여 대상 런타임에 대한 스킬과 해당 명령/모델 컨텍스트만 재시작 없이(관련 없는 MCP/LSP/훅 제외) 새로고침합니다. 커밋 후 새로고침 실패는 상태를 롤백하지 않고 경고만 생성합니다. 오버라이드는 재시작 및 확장 프로그램 업데이트를 통해 유지되며, 제거 시 삭제됩니다. 클라이언트는 더 높은 우선순위의 설정을 쓰는 스킬 설정 API로 폴백해서는 안 됩니다.

#### 전역 카탈로그

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

설치 메타데이터가 없을 경우 `installType`은 생략됩니다. `defaultActivation`은 `enabled` 또는 `disabled`입니다. `workspaceOverrideCount`는 저장된 `inherit` 항목을 제외합니다.

워크스페이스 투영 응답은 다음과 같습니다:

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

상속의 경우 `workspaceActivation`은 `enabled`, `disabled` 또는 `null`입니다. `activationSource`는 `default`, `workspace_override`, `legacy_path_rule` 또는 `cli_override`입니다. `desiredGeneration`는 내구성 있는 스토어 생성 번호이며; `appliedGeneration`은 컨트롤러가 해당 워크스페이스 런타임에 적용된 것으로 기록한 최신 생성 번호로, 일시적으로 지연될 수 있습니다.

설치는 명시적 동의와 초기 활성화를 요구합니다:

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

워크스페이스 전용 초기 활성화에는 `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`을 사용하십시오; 대상은 존재하고 신뢰되어야 합니다. 데몬 설치는 GitHub, Git 및 npm 소스를 허용합니다. `extension_local_path_install`이 광고되는 경우, 데몬 호스트에 존재하는 절대 경로도 허용합니다. `ref`는 npm에 적용되지 않으며, `ref` 및 `autoUpdate`는 로컬 소스에 적용되지 않고, `registry`는 npm에만 적용됩니다. `ref`, `autoUpdate`, `allowPreRelease` 및 `registry`는 선택 사항입니다.

`extension_git_credentials`이 광고되는 경우, HTTPS Git 소스는 사용자 정보를 포함할 수 있으며, 예를 들어 `https://username:token@git.example.com/org/repository.git`과 같습니다. `credentialPersistence`는 이러한 소스와 함께 사용할 때만 유효합니다. 이는 `stored` 또는 `one_time`이며 생략 시 기본값은 `one_time`입니다. 저장 모드는 데몬의 하이브리드 비밀 저장소를 통해 자격 증명을 저장하고 설치 메타데이터에는 깨끗한 리포지토리 URL만 유지하므로 확장 프로그램이 계속 업데이트 가능합니다. 일회용 모드는 리포지토리 URL이나 자격 증명을 저장하지 않으며 업데이트 불가능한 `snapshot`을 생성합니다; 이 모드에서는 `autoUpdate: true`이 거부됩니다. URL 자격 증명 없이 필드를 제공하거나, 잘못된 자격 증명을 제공하거나, npm, 아카이브, 로컬, SSH 또는 비-Git 소스에 자격 증명을 사용하는 경우 `400`을 반환합니다.

자격 증명이 포함된 설치 응답 및 작업은 `credentialPersistence`을 노출하며 `credentialStorage`을 `keychain` 또는 `encrypted_file`으로 노출할 수 있습니다. 일회용 작업은 `source`을 생략합니다; 저장된 작업은 깨끗한 소스를 반환할 수 있습니다. 스냅샷 카탈로그/상태 항목은 소스를 생략하고, `credentialPersistence`을 `one_time`으로 설정하며, `not updatable`을 보고합니다. 업데이트는 `extension_not_updatable`로 실패합니다; 사용할 수 없는 저장된 비밀은 네트워크 접근 전에 `extension_credential_unavailable`로 실패합니다.

전역 및 워크스페이스 활성화 `PUT` 요청은 동일한 본문을 사용합니다:

```json
{ "state": "enabled" }
```

`state`은 `enabled` 또는 `disabled`입니다. 업데이트, 제거, 업데이트 확인, 활성화 해제 및 새로고침 요청에는 필수 본문이 없습니다.

배치 활성화 요청은 확장 프로그램 이름을 사용합니다:

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

워크스페이스 배치는 또한 `"state": "inherit"`을 허용합니다. 최종 전역 결과는 `name`과 `defaultActivation`를 포함하며; 워크스페이스 결과는 `name`, `workspaceActivation` (상속의 경우 `null`), 및 `effectiveActivation`을 포함합니다. 잘못된 형식의 이름은 요청을 거부합니다; 기존 스토어 신원과 충돌하면 부분 커밋 없이 원자적으로 실패합니다. 알 수 없는 `inherit` 대상은 지속되지 않습니다. 오버라이드 해제는 기본 활성화 선언을 조작하거나 이후 설치 동의를 대체해서는 안 되기 때문입니다.

수락된 모든 비동기 변경은 다음을 반환합니다:

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

워크스페이스 한정 변경은 동일한 전역 `/extensions/operations/:operationId` 폴링 경로를 사용합니다. 작업 이력은 프로세스 로컬이며, 유한한 수의 최종 항목만 보관하고 데몬 재시작 시 손실됩니다; 클라이언트는 작업 ID가 사라지면 카탈로그나 워크스페이스 투영을 다시 읽고 생성 번호를 비교해야 합니다.

작업 스냅샷은 다음과 같은 형태를 가집니다:

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

`status`은 `queued`에서 `running`로, 그 다음 `succeeded`, `succeeded_with_warnings` 또는 `failed`로 전환됩니다. 실행 중일 때 `phase`은 `preparing`, `committing` 또는 `reconciling`입니다. 최종 성공 시 `result`을 포함할 수 있으며 `status`은 `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked` 또는 `refreshed`과 동일합니다; 조정 결과는 추가로 `refreshed`, `failed` 및 `error`을 포함할 수 있으며, 배치 활성화 결과는 정렬된 `results`을 포함합니다. 업데이트 확인은 확장 프로그램 이름을 키로 하는 `result.states`을 반환하며, 값으로는 `checking for updates`, `update available`, `up to date`, `not updatable` 또는 `error` 등이 있습니다. 자격 증명 및 인증 헤더는 절대 작업 필드가 아닙니다.

내구성 있는 커밋 후 불완전한 정리 또는 런타임 조정은 실패한 변경으로 보고되지 않습니다. 이는 `succeeded_with_warnings`을 반환하고 커밋된 결과를 보존합니다:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "uninstall",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "uninstalled",
    "name": "demo",
    "refreshed": 2,
    "failed": 0
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

경고 `workspaceId` 및 `code`은 선택 사항입니다; `workspaceCwd` 및 `error`은 항상 존재합니다. 클라이언트는 경고를 표시하고 카탈로그/투영을 새로고침해야 하며, 내구성 있는 변경을 무조건 재시도해서는 안 됩니다.

검증 및 권한 부여 실패는 안정적인 코드가 존재할 경우 `{ "error": "...", "code": "..." }`을 사용하는 동기 HTTP 오류입니다. 중요한 경우는 `400 invalid_extension_id`, `400 invalid_extension_names`, `400 invalid_extension_name`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found` 및 `429 extension_queue_full`입니다. 설치 검증은 또한 잘못된 소스/참조/레지스트리 옵션, 누락된 동의, 또는 누락/잘못된 초기 활성화에 대해 `400`을 반환합니다. `202` 이후 실패하는 변경은 작업 이력에 유지되면서 `status: "failed"`, `error` 및 선택적인 안정적인 `code`으로 표현됩니다; 일반적인 코드에는 `extension_prepare_timeout` 및 `extension_conflict`가 포함됩니다. 작업에 대한 HTTP `404`은 작업 이력이 내구성 있지 않으므로 롤백을 의미하지 않습니다.

`daemon_status`은 아래에 문서화된 통합 읽기 전용 운영자 진단 스냅샷인 `GET /daemon/status`을 광고합니다.

`daemon_update`은 프로세스 전역(global) `GET /daemon/update`, `POST /daemon/update/prepare` 및 `POST /daemon/update/restart` 표면을 광고합니다.

`scheduled_task_gate`은 `POST` 및 `PATCH /scheduled-tasks`에서의 선택적 `gate`과 작업(task) 뷰에서의 `gate` 및 `gateStatus`을 광고합니다. 게이트(gate)는 모델 외부에서 각 트리거 시 소유 세션이 실행하는 셸 명령어입니다: 출력과 함께 exit 0이면 해당 출력이 첨부된 상태로 트리거가 전달되고, stdout에 아무것도 없이 exit 0이면 건너뛰며, 비영(non-zero) 종료 코드는 모든 트리거 시점이 아니라 게이트가 실패하기 시작할 때 보고됩니다. `gateStatus.lastOutcome`은 `quiet`, `delivered`, `failed` 또는 `blocked`입니다.

- 게이트에는 반복적인 작업이 필요합니다: `recurring: false`을 사용한 `POST`이나, 일회성(one-shot) 작업에 게이트를 설정하거나 게이트가 있는 작업을 일회성으로 전환하는 `PATCH`는 400 `gate_requires_recurring`을 응답합니다; 이미 해당 상태인 작업은 다른 편집 내용을 유지합니다. 잘못된 형식의 게이트(`POST`에서 비어 있음, 주석만 포함, 2048자 초과, NUL 문자 또는 짝이 맞지 않는 UTF-16 서rogate, `bash -c '…'` 같은 셸 래퍼(wrapper), 또는 `&`로 백그라운드 처리된 부분)은 400 `invalid_gate`을 응답합니다. `&` 검사는 어휘적(lexical)이며 최선의 노력(best-effort) 방식으로 수행되므로, 불확실한 경우 거부합니다(주석, 헤레독(heredoc) 본문 또는 `(( … ))` 내의 `&` 등). 이를 통과한 게이트가 백그라운드 부분이 여전히 stdout을 보유하는 동안 stdout에 아무것도 없이 종료되면 `failed`로 보고됩니다(bwrap 셸 샌드박스 외부에서는 PID 네임스페이스가 명령어로 해당 부분을 종료시킴). `PATCH`, `gate: null` 또는 `gate: ""`은 게이트와 그 `condition`을 지웁니다.
- `condition`으로 보호되는 레거시 작업은 `PATCH` 내의 모든 `gate` 키를 409 `task_legacy_unsupported`으로 거부하므로, 클라이언트는 변경할 때만 `gate`을 전송합니다.
- 이러한 라우트를 통해 작성된 게이트는 세션으로부터 확인(confirm)을 받지 않습니다. 동일한 명령어에 대한 `monitor` 호출이 묻지 않고 실행될 수 있는 곳에서만 무인(unattended)으로 실행됩니다: 저장된 `Monitor(...)` 또는 `Bash(...)` 허용(allow) 규칙 하에서, 읽기 전용 명령어로서, 또는 auto 또는 yolo 세션에서. deny 규칙은 모든 모드에서 차단하며 plan mode도 차단합니다; 차단된 트리거는 `blocked`으로 정리(settle)됩니다.
- 클라이언트는 이 태그가 없는 데몬에 `gate`을 보내서는 안 됩니다: 이러한 데몬은 `POST`에서 이를 드롭(drop)하며, 게이트 전용 `PATCH`에 대해 400 `empty_patch`을 응답합니다.

`autofix_pr_watches`은 `GET /autofix-pr/watches` (주(primary) 워크스페이스)과 `GET /workspaces/:workspace/autofix-pr/watches` (등록된 신뢰된 워크스페이스)를 광고합니다. 각각은 워크스페이스의 clone에 대한 `/autofix-pr` 감시(watches)를 `qwen autofix-pr status` 목록으로 응답하며, clone의 메인 워크트리(main worktree) 아래에 있는 감시 파일들(`.qwen/tmp`)에서 읽습니다. 각 파일은 링크를 따르지 않고 블로킹(blocking)하지 않은 채 열립니다. 락(lock)을 획득하지 않으며, GitHub에 요청하지 않고, clone을 찾는 `git worktree list`을 제외한 git 명령어를 실행하지 않습니다. 응답은 `{ v: 1, available, root?, now?, watches, unreadable? }`입니다: 워크스페이스에 대해 git 저장소를 찾을 수 없거나(또는 git이 그곳에서 실행할 수 없는 경우) `available`은 false이며 감시가 없습니다. `root`는 clone의 메인 워크트리이며, 하나의 clone에 속한 두 워크스페이스 모두 동일합니다. 감시는 `status`의 필드를 포함하지만(`/autofix-pr` 설계의 Section 6.10), `thisSession`, `worktreePath`, `pushTarget`, `gitTrusted` 및 `worktreeWork`은 제외합니다. 그 `session`은 이를 소유한 세션이며, 이 데몬의 세션이 아닐 수도 있습니다. 감시를 중지하는 것은 스킬(skill)의 역할입니다(소유 세션에서 `/autofix-pr stop <n>`); 이러한 라우트는 아무것도 변경하지 않습니다.

**조건부 태그.** 이러한 기능 태그는 배포 토글, 런타임 연결 또는 가용성 조건이 활성화된 경우에만 광고됩니다. 태그 존재는 문서화된 동작이 사용 가능함을 의미합니다. 부재는 태그보다 오래된 데몬이거나 해당 조건이 거짓인 현재 데몬임을 의미합니다. 현재:

<!-- conditional-serve-features:start -->

| 태그 | 광고 조건 … |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_collaboration_v1` | 등록된 워크스페이스 중 하나 이상이 `experimental.agentCollaboration`(모든 범위, 워크스페이스 포함) 또는 `QWEN_CODE_ENABLE_AGENT_COLLABORATION=1`을 통해 영구 워크스페이스 Agent 협업에 옵트인한 경우. 존재함은 `/workspaces/:workspace/agent/*` 및 Agent Host 트랜스포트 라우트가 마운트됨을 의미합니다. `workspaces[].agentCollaborationEnabled`는 각 워크스페이스의 옵트인 상태를 식별하며, 클라이언트는 활성화된 항목에 대해서만 협업 인터페이스를 표시하거나 호출해야 합니다. 이전 버전의 데몬은 해당 워크스페이스 필드를 생략하므로 클라이언트는 호환성을 위해 이 최상위 태그로 폴백할 수 있습니다. 부재함은 이 응답에서 협업을 제공하지 않음을 의미합니다 — 태그는 부팅 시 스냅샷이 아니라 요청별로 재계산되므로 — 따라서 클라이언트는 진입점을 렌더링하여 호출이 404를 반환하도록 방치하는 대신 진입점을 제거해야 합니다. 처음 활성화하려면 재시작이 필요하며, 다른 워크스페이스가 이미 켜져 있는 상태에서 특정 워크스페이스에 대해 토글하면 다음 요청부터 적용됩니다. 하위 에이전트 정의 CRUD인 무조건적인 `workspace_agents` 태그와는 구별됩니다. |
| `session_message_deletion` | 비공개 Hosted Harness 프로필이 활성화되어 있지 않은 경우. 라이브 세션 소유자 라우트를 통해 메시지 그룹을 나열하고 삭제합니다. 일반 로컬 데몬 세션은 물리적 삭제를 지원하지만, Managed 권위 있는 저장소 및 SSH 워크스페이스는 이를 거부합니다. |
| `hosted_harness_private_v1` | 비공개 Hosted Harness 프로필이 활성화된 경우; 인증된 세션 API만 사용할 수 있습니다. |
| `managed_session_journal_delta_v1` | 비공개 Hosted Harness 프로필이 활성화된 경우(`hosted_harness_private_v1`과 동일한 조건)이며, 이 빌드는 `message.delta` 레코드가 포함된 Managed Session 저널을 열 수 있습니다. 제어 평면은 능력 협상 시 이 태그를 요구하므로, 해당 레코드보다 이전으로 롤백된 Harness는 모든 Session 열기가 실패하는 대신 한 번 거절됩니다(`managed_session_open_failed`). |
| `require_auth` | 데몬이 `--require-auth`(또는 임베디드 API를 통한 `requireAuth: true`)로 시작된 경우. 루프백 바인드의 `/health`을 포함하여 모든 일반 API 라우트에서 Bearer 토큰이 필수입니다. 채널 웹훅 인그레스는 독립적인 공유 비밀 인증을 유지하며, Web Shell 문서 및 자산 라우트는 사전 인증(pre-auth) 상태로 남아 있습니다. |
| `mcp_workspace_pool` | 공유 MCP 트랜스포트 풀이 활성화된 경우. `QWEN_SERVE_NO_MCP_POOL=1`이 풀을 비활성화할 때는 생략됩니다. |
| `mcp_pool_restart` | 공유 MCP 트랜스포트 풀이 활성화된 경우; 재시작 응답에는 풀 인식 다중 항목 형식이 포함될 수 있습니다. |
| `external_tool_guard` | `qwen serve`이 `--external-tool-guard-mode=required`에 대한 시작 핸드셰이크를 완료했습니다. 생성된 모든 ACP 채널은 세션 생성 전에 설치된 콜백을 승인해야 하며, 최종 실행 경계에 도달하는 모든 지원되는 최상위 관리형 ACP 도구 호출은 하나의 외부 사전 실행 허용을 수신해야 합니다. 이전 권한/후크 거부는 프로바이더 요청을 발생시키지 않습니다. 중첩된 AgentCore 실행은 v1 범위를 벗어나며, 이 외부 프로바이더 모드가 활성화된 동안 거절됩니다. 이 태그는 외부 프로바이더만 반영합니다: 그것과 독립적으로, 모든 데몬은 셸 명령 줄을 포함하는 관리형 도구에 내장된 Git 위치 이동 가드(`run_shell_command` 및 `monitor`)를 적용하므로, 이 태그의 부재는 사전 실행 거부가 없음을 의미하지 않습니다. |
| `allow_origin` | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). 데몬이 최소 하나의 `--allow-origin <pattern>` (또는 내장 API를 통한 `allowOrigins: [...]`)과 함께 시작되었습니다. 일치하는 출처에서의 교차 출처 요청은 적절한 CORS 응답 헤더를 받으며, 일치하지 않는 출처는 여전히 기본값인 403을 받습니다. 설정된 패턴 목록은 인증되지 않은 독자에게 신뢰할 수 있는 출처 집합이 노출되는 것을 방지하기 위해 의도적으로 `/capabilities`에 표시되지 않습니다. 브라우저 클라이언트는 이미 자신의 출처를 알고 있습니다. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs`이 양의 정수로 설정되어 있습니다. |
| `writer_idle_timeout` | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs`이 양의 정수로 설정되어 있습니다. |
| `workspace_settings` | 데몬이 설정 지속성 기능을 사용하여 생성되었습니다. |
| `user_language_sync` | 데몬이 설정 지속성 기능을 사용하여 생성되었으며(`workspace_settings`과 동일한 조건), 따라서 세션 없는 `POST /language` 라우트가 등록됩니다. |
| `workspace_voice` | 설정 지속성이 가능하므로 레거시 주요 작업 공간 Voice 설정 라우트가 활성화됩니다. |
| `workspace_voice_transcription` | 주요 작업 공간에 구성된 Voice 전사 모델이 있습니다. |
| `session_shell_command` | 세션 셸 실행이 명시적으로 활성화되었으며 베어러 인증 또는 신뢰할 수 있는 루프백 권한 하에서 유효합니다. 호출에는 여전히 세션에 바인딩된 클라이언트 ID가 필요합니다. |
| `standalone_sessions_v1` | 데몬이 완전한 독립 세션 런타임, 라이프사이클 조정기, 영구 삭제 저널, 관리 디렉터리 구현 및 `/standalone/sessions` 라우트 패밀리를 설치했습니다. 완전한 의존성 그래프가 없는 직접 임베드는 라우트와 이 태그 모두 생략합니다. |
| `standalone_session_options_v1` | 완전한 독립 세션 런타임을 설치했습니다(`standalone_sessions_v1`과 동일한 조건). 따라서 읽기 전용이며 세션 없는 `GET /standalone/session-options` 라우트가 내부 Conversations 런타임에 등록됩니다. |
| `session_artifacts_persistence` | 세션 아티팩트 지속성이 런타임에 연결되었습니다. |
| `session_artifact_library` | 세션 아티팩트 지속성이 연결되어 있으며, `/workspaces/:workspace/session/:id/artifact-library`을 통해 라이브, 콜드 및 보관된 등록 항목에 대한 신뢰할 수 있는 작업 공간 소유자의 읽기/제거를 지원합니다. |
| `workspace_artifact_library` | `/workspaces/:workspace/artifact-library`을 통해 지속된 작업 공간 전체 아티팩트 쿼리, 배치 세션 쿼리 및 명시적 페어 제거를 수행합니다. |
| `workspace_artifact_library_stream` | 모든 아티팩트 라이브러리 읽기 시의 세션 메타데이터 및 전체 및 선택된 세션 쿼리에 대한 옵트인 유한 SSE 지원. 아티팩트 지속성이 필요합니다. |
| `session_sources` | 세션 소스 지속성이 런타임에 연결되었습니다. 라이브 세션 소유자를 통해 메타데이터 전용 작업 공간 파일, 업로드된 첨부 파일 및 HTTP(S) 링크를 등록합니다. |
| `session_generation` | 세션 생성 도우미가 사용할 수 있습니다. |
| `session_btw_stream` | 등록된 모든 런타임 브리지가 재개 가능한 BTW 스트리밍을 지원합니다. 클라이언트는 `/session/:id/btw/stream`을 호출하기 전에 이 플래그를 확인해야 합니다. 그렇지 않으면 기존 JSON BTW 인터페이스를 사용하십시오. |
| `scheduled_task_session_reuse` | 영구 예약된 작업 세션 관리가 활성화되었으며, 모든 관리되는 데몬 런타임은 작업이 현재 기존 세션에 명시적으로 바인딩할 수 있도록 하는 콜백을 설치했습니다. |
| `workspace_generation` | 작업 공간 범위 생성 도우미가 사용할 수 있습니다. |
| `rate_limit` | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit`이 활성화되었습니다. |
| `workspace_reload` | 내장 라우트 구성에서 작업 공간 다시 로딩 지원이 가능합니다. |
| `workspace_trust_grant` | 신뢰 핫 리로딩이 연결되었습니다(`workspace_trust_hot_reload`과 동일한 조건). 두 부여 라우트 모두 바인딩된 폴더만 신뢰하며, 기존 `TRUST_FOLDER` 또는 `TRUST_PARENT` 규칙을 유지합니다. 지속 후, 호스트 정책과 보고된 상태가 모두 신뢰되는 경우에만 `200`이 v1 상태를 반환합니다. 그렇지 않으면 `409 { error, code: "trust_grant_ineffective" }`는 정책 로드 또는 IDE/파일 거부를 포함하여 `error`에서 확인된 상태/소스를 지정합니다. 신뢰 파일 지속성 실패는 `FatalConfigError`에 대해 `500 trusted_folders_invalid`을 반환하고, 그 외에는 `500 internal_error`을 반환합니다. 신뢰 파일 읽기는 JSONC 작성자의 주석 및 후행 쉼표를 허용합니다. 라우트는 핫 리로딩 없이도 제공됩니다: 데몬 자체의 API 부서는 캐시된 v1 상태를 즉시 업데이트하지만, 시작 시점 바인딩 게이트는 재시작이 필요합니다(`requiresDaemonRestartForChanges: true`). 외부 터미널/파일 편집은 캐시된 상태를 업데이트하기 위해 데몬 재시작이 필요합니다. |
| `workspace_trust_hot_reload` | 작업 공간 신뢰 정책 모니터링 및 런타임 생성 조정이 연결되어 있어, 데몬을 재시작하지 않고도 신뢰 변경 사항이 적용되며 v2 신뢰 상태가 수렴을 보고합니다. |
| `channel_reload` | 데몬 관리 채널 워커 관리자 활성화되어 현재 선택 항목을 다시 로딩할 수 있습니다. |
| `channel_control` | 데몬 관리 채널 워커 런타임 제어가 연결되었습니다. |
| `channel_management` | 작업 공간 범위 채널 설정, 라이프사이클 및 페어링 관리가 연결되었습니다. |
| `channel_delete_config_loss_convergence` | 작업 공간 채널 관리가 연결되었습니다(`channel_management`과 동일한 조건). `DELETE /workspaces/:workspace/channels/:name`는 워커가 해석하는 병합된 설정 뷰(시스템 + 사용자 + 작업 공간 범위)에서 구성이 사라진 채널을 수렴시킵니다. 런타임은 해당 채널에 대해 침묵하거나 해당 작업 공간에서 정확히 하나의 커밋된 워커 소유자를 확인해야 하며, 이는 해당 범위에 유지되는 지속된 시작 선택 항목이 제거되기 전에 중지됩니다. 대신 `channel_instance_not_found`을 보고하지 않습니다. 병합된 뷰에는 여전히 구성이 포함되어 있지만 작업 공간의 해석된 채널 설정 범위가 이를 소유하지 않는 채널—사용자 또는 시스템 범위에서만 구성되고 작업 공간이 프로젝트 디렉터리인 경우—는 런타임이 건드리지 않은 상태로 `channel_instance_not_found`을 보고합니다. 해석된 범위가 구성하는 채널은 정상적으로 삭제되며, 디렉터리가 사용자의 홈 디렉터리인 작업 공간은 해당 범위를 공유 사용자 파일로 해석하므로, 사용자 범위 채널은 거기서 구성되고 삭제됩니다. |
| `multi_workspace_sessions` | 둘 이상의 작업 공간 런타임이 등록되어 있으므로, 세션 생성 시 cwd별로 신뢰할 수 있는 런타임을 선택할 수 있습니다. |
| `multi_workspace_session_rewind` | 둘 이상의 작업 공간 런타임이 등록되어 있습니다. 단수형 라이브 세션 되감기 라우트는 소유 런타임을 해석합니다. |
| `multi_workspace_session_shell` | 둘 이상의 작업 공간 런타임이 등록되어 있으며, 베어러 인증 또는 신뢰할 수 있는 루프백 권한 하에서 세션 셸 실행이 명시적으로 활성화되었습니다. 단수형 REST 셸은 소유 런타임을 해석합니다. |
| `dynamic_workspace_registration` | 작업 공간 런타임 팩토리가 데몬에 연결되어 있어, 기존 신뢰할 수 있는 디렉터리를 런타임 시 보조 런타임으로 등록할 수 있습니다. |
| `persistent_workspace_registration` | 작업 공간 등록 스토어가 데몬에 연결되었습니다. 프로덕션 `runQwenServe`은 사용자 수준 스토어를 자동으로 공급합니다. 직접 `createServeApp` 임베드는 하나를 명시적으로 주입하고 자체 작업 공간 레지스트리의 시작 복원을 관리해야 합니다. |
| `scratch_workspace_registration` | 관리형 임시 작업 공간 생성이 가능합니다. 런타임 팩토리, 검증된 관리형 임시 루트 및 런타임 폐기가 연결되어 있으며, 모든 관리형 런타임은 임시 루트 경계를 준수합니다. |
| `git_workspace_clone` | 데몬 호스트에 `git` 바이너리가 있습니다. `POST /workspaces`을(를) `{ kind: "git", url, target }`과 함께 실행하면 비동기 클론 작업을 시작하며, 해당 라우트는 진행 상황, 취소 및 표준 cwd를 보고합니다. `git`이 없는 호스트는 태그를 생략합니다. |
| `workspace_runtime_removal` | 제거 가능한 동적 또는 복원된 영속성 보조 런타임은 관리 라우트를 통해 드레인(drain) 및 제거할 수 있습니다. |
| `workspace_directories` | 데몬은 작업 공간 설정을 영속화하며, 모든 신뢰할 수 있는 로컬 런타임은 라이브 세션에 추가 디렉터리를 적용할 수 있습니다: `/workspaces/:workspace/directories`은 작업 공간 범위(`context.includeDirectories`)에 영속화된 항목을 나열하고, 추가하며, 제거합니다. SSH, 관리형 및 독립형 작업 공간은 태그가 존재하더라도 거부되며, 실험적인 페어링된 엔진 데몬은 작업 공간 범위의 변경 사항이 관리형 자식 프로세스에 도달할 수 없으므로 태그와 라우트를 생략합니다. |
| `native_directory_picker` | 데몬 호스트는 네이티브 OS 디렉터리 선택기를 열 수 있습니다(macOS에서는 `osascript`, Windows에서는 PowerShell, 디스플레이가 있는 Linux 호스트에서는 `zenity`). 헤드리스 호스트는 태그를 생략하여 클라이언트가 확실한 실패를 표시하는 대신 데몬 네이티브 선택기를 숨깁니다. Web Shell은 선택기를 사용할 수 없을 때 '찾아보기(Browse)'를 숨깁니다. [임베딩 호스트 디렉터리 선택기](../design/web-shell-host-directory-picker.md#public-api-and-precedence)는 이 태그 없이도 이를 제공할 수 있습니다. |
| `workspace_runtime_stop` | 데몬은 ACP 프로세스 회계 처리, 완전한 독립 활동 및 예약된 작업 관찰, 그리고 확인된 중지 및 수신 확인 스냅샷을 지원하는 런타임 브리지를 소유합니다. 지원되지 않는 개별 런타임은 미리보기에서 비활성화됩니다. |
| `workspace_runtime` | 모든 활성 작업 공간 브리지는 권위 있는(authoritative) 런타임 생명주기 스냅샷을 제공합니다. 혼합되거나 레거시 주입된 브리지는 태그를 생략합니다. |
| `workspace_skills_config_runtime` | 모든 활성 작업 공간은 권위 있는 런타임 생명주기와 Skills 관리 및 새 세션 작성기에 사용되는 분리된 config/runtime Skills 라우트를 지원합니다. |
| `skill_archive_install` | 권위 있는 작업 공간 생명주기, 원본 Skill 아카이브 설치 및 소유자 범위 시도 수신 확인(receipts)을 사용할 수 있습니다. |
| `skill_zip_file_source` | 권위 있는 작업 공간 생명주기, 데몬 로컬 ZIP 복사 및 소유자 범위 시도 수신 확인(receipts)을 사용할 수 있습니다. |
| `workspace_local_open` | 데몬 호스트는 호스트의 OS 파일 관리자에서 작업 공간 디렉터리를 열 수 있습니다(macOS에서는 `open`, Windows에서는 `explorer.exe`, 디스플레이가 있는 Linux 호스트에서는 `xdg-open`). 헤드리스 호스트는 태그를 생략하여 클라이언트가 확실한 실행 실패를 표시하는 대신 '로컬에서 열기' 기능을 숨깁니다. 열린 경로는 항상 `POST /workspaces/:workspace/open`을 통해 해석된 등록된 작업 공간 cwd입니다. 라우트는 선택적 JSON 본문 `{ "target": "terminal" }`(부재/기타 = 폴더)를 허용하며, `{ kind: 'workspace-local-open', opened: true, target }`에 `target`을 `folder` 또는 `terminal`으로 설정하여 응답합니다. |
| `workspace_local_terminal` | 데몬 호스트는 작업 공간 디렉터리에서 터미널 창을 열 수 있습니다(macOS에서는 `open -a Terminal`, Windows에서는 `wt.exe` 및 `cmd.exe` 대체(fallback), 디스플레이가 있는 Linux 호스트에서는 `gnome-terminal`/`konsole`/`xterm`). 헤드리스 호스트는 태그를 생략하여 클라이언트가 확실한 실행 실패를 표시하는 대신 '터미널에서 열기' 기능을 숨깁니다. `POST /workspaces/:workspace/open`에 의해 제공되며 본문은 `{ "target": "terminal" }`입니다. |
| `workspace_qualified_acp` | ACP HTTP 및 다중 작업 공간 런타임이 활성화되어 있으므로, 복수형 ACP 엔드포인트는 보조 런타임을 선택할 수 있습니다. |
| `workspace_qualified_voice` | 다중 작업 공간 런타임과 공유 ACP/Voice WebSocket 리스너가 활성화되어 있으므로, 모든 작업 공간 한정 Voice 모달리티는 보조 런타임에 대해 도달 가능합니다. |
| `workspace_qualified_memory` | ACP HTTP 및 다중 작업 공간 런타임이 활성화되어 있으므로, 작업 공간 한정 관리형 메모리 라우트는 remember, forget 및 dream 작업을 위해 작업 공간별 태스크 레인을 선택할 수 있습니다. |
| `client_mcp_over_ws` | 데몬은 ACP WebSocket을 통해 클라이언트 호스팅 MCP 서버를 허용합니다. 이는 명시적인 옵트인(opt-in)이며 CDP 터널 경로에는 필요하지 않습니다. |
| `cdp_tunnel_over_ws` | 데몬은 명시적인 옵트인 또는 Chrome 확장 프로그램 출처(origin) 허용을 통해 역방향 `/cdp` WebSocket 터널을 노출합니다. 이는 터널이 존재한다는 의미일 뿐, Chrome DevTools MCP 도구가 등록되었음을 의미하지는 않습니다. |
| `browser_automation_mcp` | ACP HTTP가 활성화되고, `cdp_tunnel_over_ws`이 작동 중이며, 베어러 토큰이 `/cdp`을 차단하지 않고, `QWEN_CDP_MCP_COMMAND`이 외부 stdio MCP 어댑터를 지정합니다. 메인 CLI 패키지는 브라우저 자동화 어댑터를 번들링하지 않습니다. 이 태그가 없으면 Chrome 확장 프로그램 사이드 패널 채팅은 여전히 작동할 수 있지만, console/network/screenshot/click 도구는 기본적으로 등록되지 않습니다. |
| `voice_transcribe` | Voice WebSocket 엔드포인트가 마운트되었습니다. 성공적인 전사를 위해서는 구성된 Voice 모델이 여전히 필요합니다. |
| `realtime_voice` | macOS WebShell 데몬은 Live Voice를 활성화했으며 네이티브 Host는 `QWEN_SERVE_LIVE_NATIVE_HOST=1`로 옵트인했습니다(기본값은 off; 아래 참조). `/live/status`는 준비 상태를 보고하지만, 기능이 활성화될 때까지 기능은 철회됩니다. |
| `realtime_voice_web` | Live Voice가 활성화되었으며 Web Shell 페이지 자체가 WS `/live/web`을 통해 오디오 엔드포인트가 될 수 있습니다(모든 플랫폼에서 기본 엔드포인트이며, 네이티브 Host는 macOS 전용이고 옵트인입니다). 이 라우트는 `/voice/stream`처럼 인증(bearer 하위 프로토콜)하고, 신뢰할 수 있는 주요 작업 공간을 요구하며, 줄여진 hello(마이크 권한 및 오디오 입력/출력 자체 점검 포함)로 Live Host 프로토콜을 사용합니다. 단일 Host 리스는 유지됩니다: 네이티브 Host는 브라우저를 대체하며(`4010`), 브라우저는 절대 네이티브 Host를 밀어내지 않습니다(`4009`). 두 번째 탭은 `?takeover=1`가 있을 때만 인수를 합니다. `/live/status`는 `host.kind: "browser"`을 보고합니다. 화면 캡처에는 공유된 화면이 필요하며(아래 참조), 단축키 변경 사항은 다음 네이티브 Host용으로 저장되지만 등록되지는 않습니다. |
| `web_terminal` | ACP HTTP가 활성화되어 있으므로, 인증된 Web Terminal 엔드포인트를 사용할 수 있습니다. |
| `user_skill_activation` | 사용자 설정 영속화가 가능합니다. `PUT /skills/activation`은 정확한 이름의 User 환경 설정을 저장하고 비동기 전파를 큐에 넣습니다. |

<!-- conditional-serve-features:end -->

Live Voice는 모든 플랫폼에서 기본적으로 Web Shell 엔드포인트(`realtime_voice_web`, WS `/live/web`)를 사용합니다. 네이티브 macOS Host는 옵트인입니다: `QWEN_SERVE_LIVE_NATIVE_HOST=1`로 시작된 macOS 데몬만이 `realtime_voice`을 광고하고, Live가 활성화되면 WS `/live/host`를 등록하고 Host를 설치합니다. 이것이 없으면 `/live/setup`는 재시도 불가능한 `install` 오류와 함께 `nativeHost: false`을 보고하며, `POST /live/setup/install`과 `POST /live/setup/launch`는 `409 live_native_host_unavailable`에 응답합니다.

브라우저 Host는 사용자가 페이지와 화면을 공유하는 동안에만 `host.capture_visual`에 응답하며, 페이지는 hello에서 `selfChecks.screenShare`로 이를 보고합니다. 공유는 별도의 명시적인 행위이므로 — 모델이 턴(turn) 중에 요청하고, `getDisplayMedia`에는 사용자 제스처가 필요함 — 페이지는 스트림을 유지하며 요청당 한 프레임(frame)을 가져옵니다. 공유 중인 것이 없으면 요청이 타임아웃되지 않도록 즉시 `success: false`에 응답합니다.

페이지는 데몬의 파일 시스템에 쓸 수 없으므로 JPEG만 전송합니다. 데몬은 브라우저 리스(lease)가 보고하는 `screenshotPath`을 무시하고, 네이티브 Host가 쓰는 것과 동일한 프라이빗 캡처 디렉터리에 자체적으로 이미지를 저장하며 이름을 선택합니다. 네이티브 Host는 여전히 자체 PNG를 영구 저장(persist)하고 경로를 전달하며, 이전과 같습니다.

`mcp_guardrails`은 이 조건부 표에 **포함되지 않습니다** — 이는 항상 활성화되는 태그이며, 바이너리가 새로운 `/workspace/mcp` 예산 필드를 지원할 때마다 연산자가 예산을 구성했는지 여부와 관계없이 광고됩니다. `--mcp-client-budget`을 설정하지 않은 연산자도 새로운 필드를 받습니다(`budgetMode: 'off'`, `budgets: []` 포함).

`mcp_guardrail_events` (이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b)는 폴링 루프 없이 MCP 예산 상태 임계값 초과를 표시하는 타입 지정된 SSE 푸시 이벤트를 광고합니다. 두 가지 프레임 유형이 `GET /session/:id/events`에 도착합니다:

- `mcp_budget_warning` — `reservedSlots.size / clientBudget`의 상향 75% 임계값 초과 시 한 번 발생합니다. 비율이 37.5% 미만(`MCP_BUDGET_REARM_FRACTION`)으로 떨어질 때만 다시 무장됩니다. PR 10의 `slow_client_warning` 히스테리시스를 반영하지만, 구독자별 백로그 수준이 아닌 관리자 수준에서 적용됩니다. 페이로드: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. `warn` 및 `enforce` 모드 모두에서 발생하며, `off`에서는 절대 발생하지 않습니다.
- `mcp_child_refused_batch` — 하나 이상의 서버가 거부될 때 각 `discoverAllMcpTools*` 패스의 끝에서 AND `readResource` 지연 스폰 거부 경로에서 길이 1 배치로 발생합니다. 페이로드: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode`은 `warn` 모드가 절대 거부하지 않으므로 문자 그대로 `'enforce'`입니다.

두 이벤트 모두 세션별 SSE 재생 링에 있습니다(`id`을 포함하므로). `Last-Event-ID`로 재연결하는 클라이언트는 이를 통해 재개됩니다. `GET /workspace/mcp`의 스냅샷은 여전히 확장된 연결 끊김 후 상태의 진실 출처(source-of-truth)입니다. 광고되면 항상 활성화되며 조건부 토글이 없습니다. SDK 리듀서 상태(`DaemonSessionViewState`)는 간단한 지연 스타일 UI를 원하는 어댑터를 위해 `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch`을 노출합니다.

## 라우트

클라이언트는 `session_turn_status`을 기능 감지하고 `GET /session/:id/turns/current` 또는 `GET /session/:id/turns/:promptId`을 폴링할 수 있습니다. 이러한 라우트는 라이브 소유 세션이 필요하며 다른 워크스페이스를 로드하거나 스캔하지 않습니다. 확정된 결과는 활성 분기에서 제한된 스캔으로 읽는 최선의 노력(best-effort) 대화 기록입니다. `prompt_not_found`은 라이브 큐, 64개 항목의 최종 오버레이 또는 제한된 활성 창에서 결과를 찾지 못했음을 의미합니다. `resultText`은 마지막 도구 경계 이후, 선택적 메시지 재작성 이전의 원본 최종 부모 모델 답변이며 부재할 수 있습니다. 32,768 UTF-16 코드 단위보다 큰 결과에는 `resultTruncated: true`와 `resultCode: "RESULT_TEXT_TRUNCATED"`이 포함됩니다.

### `GET /health`

라이브니스 프로브. 기본 형식은 리스너가 실행 중이면 `200 {"status":"ok"}`을 반환합니다 — 저렴하고 브리지 접근이 없으며 고빈도 k8s/Compose 라이브니스 프로브에 적합합니다.

`?deep=1`을 전달하세요(`?deep=true` 또는 맨 `?deep`도 허용됨). 관리되는 모든 워크스페이스 런타임의 브리지 **카운터**를 집계하는 데몬 전체 프로브를 수행합니다. 여기에는 아직 드레인 중인 워크스페이스도 포함됩니다(정보 제공용이며 실제 라이브니스 체크는 아님):

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

`sessions`, `pendingPermissions`, `activePrompts`은 합계입니다. `activeWork`은 어떤 런타임이 승인되었으나 확정되지 않은 프롬프트(FIFO 대기 중인 프롬프트 포함), 실행 중인 백그라운드 Agent, 대기 중/진행 중인 Agent 터미널 알림, 세션 관리 백그라운드 셸 또는 워크플로우 작업, 또는 자식 소유 세션 턴을 가진 경우 true입니다. 집계된 `session` 홀드는 목표 및 크론 처리, 기록 변경, 대기 중이거나 실행 중인 Monitor 연속성을 포함합니다. 포그라운드 프롬프트는 계속 데몬 소유입니다. 실행 중인 Monitor, 후속 제안, 셸 레지스트리가 더 이상 추적할 수 없는 외부 프로세스는 필드 밖에 남습니다. 이는 세션 범위입니다. 아직 세션이 연결되지 않은 채널 수준 작업 — 진행 중인 스폰, 대기 중인 복원, MCP 발견 또는 인증 — 은 계산되지 않으므로 데몬이 해당 채널을 회수하기를 거부하는 동안에도 `activeWork`은 false로 읽힐 수 있습니다. 이 필드를 "데몬이 회수 가능함"으로 해석하지 마세요. 이는 세션 소유 작업만 설명합니다. `activeWorkReporting`은 그 부울 값이 실제로 보증되는 정도를 나타냅니다: 모든 필수 카테고리를 보고하는 자식의 최신 보고서로 모든 라이브 세션이 커버되는 경우 `full`, 어떤 세션도 보고를 협상하지 않은 경우 `none`, 그 사이의 모든 경우(오래된 스냅샷 또는 필수 카테고리를 생략하는 협상된 자식 포함) `partial`. 세 개의 보고서 간격보다 오래된 스냅샷은 커버리지로 계산되지 않습니다. 이는 세션이 유휴 상태라는 보고서가 아니므로, 세션은 마치 자식이 결코 보고하지 않은 것처럼 정확히 보유 상태로 다시 읽힙니다. 협상되었지만 불완전한 자식에 대해 일반 자동 정리도 비활성화됩니다. `shell` 또는 `session`을 이해하지 못하는 자식은 완전한 현재 술어(predicate)에 따라 조건부 종료를 안전하게 승인할 수 없습니다. 완전히 지원되지 않는 과거의 자식은 레거시 정리 동작을 유지하며 명시적 종료, 킬, 셧다운 및 채널 종료는 강제 작업으로 남습니다. `activeWorkStaleMs`은 **커버된 세션 중에서** 부울 값이 의존하는 가장 오래된 스냅샷의 나이이며, 어떤 세션도 커버되지 않으면 `0`입니다. 진단용입니다. 왜냐하면 신선도는 이미 데몬에 의해 `activeWorkReporting`로 등급 매겨졌기 때문입니다(각 채널의 협상된 주기(cadence)는 데몬만 알고 있습니다). 등급은 각 런타임별로 계산한 후 결합하는 대신 모든 관리되는 런타임을 대상으로 한 번 계산됩니다. 세션이 없는 런타임은 공허하게(vacuously) 완전하며, 이를 증거로 취급하면 빈 워크스페이스가 다른 워크스페이스의 미보고 세션을 보증할 수 있게 됩니다. `lastActivityAt`은 최신 비-null 워크스페이스 활동 시간이며 `idleSinceMs`은 동일한 스냅샷에서 파생됩니다. `channelAlive`은 적어도 하나의 관리되는 워크스페이스 채널이 라이브임을 의미합니다. 모든 워크스페이스가 건강하다는 의미는 아닙니다. `connectedClients`과 선택적 `rateLimitHits`은 워크스페이스별 합계가 아닌 데몬 전체 카운터로 남습니다.

재시작 컨트롤러는 다음 경우 데몬을 바쁨(busy)으로 취급해야 합니다:

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

세 번째 항을 제거하면 `activeWork === false`이 "자식이 아무것도 알려주지 않음"과 구별할 수 없게 되는데, 이는 조치 취하기가 안전하지 않은 유일한 경우입니다. 알 수 없는 응답과 실패한 프로브도 재시작을 방지해야 합니다. `activePrompts`은 독립적인 호환성 신호로 남습니다.

이러한 필드는 관찰 캐시이지 재시작 리스가 아닙니다. 신선하고 완전히 등급이 매겨진 빈 답변조차도 샘플링된 순간을 설명하며, 직후에 작업이 시작될 수 있습니다. 위의 규칙은 잘못된 재시작 위험을 크게 낮추지만 제거하지는 않습니다. 엄격한 안전성은 새 작업 수락을 중단하고 드레인을 확인한 후에만 셧다운하는 준비-재시작 펜스(fence)가 필요합니다.

> ⚠️ 심층 프로브는 **정보 제공용**이며, 실제 라이브니스 검증이나 원자적 재할당 리스가 아닙니다. 협상된 ACP 하위 항목은 협상된 주기로 채널 전체의 활성 작업 스냅샷을 게시하며, 데몬은 해당 신선도를 `activeWorkReporting`으로 평가하지만 누락된 보고로 인해 채널을 종료하지는 않습니다. 한 세션의 침묵이 프로세스가 죽었다는 증거가 아니기 때문입니다. 전송 계층 라이브니스와 스톨된 Agent 감지는 별개의 메커니즘입니다. `connectedClients`은 REST SSE 연결만 계산하며 모든 ACP 전송 계층을 계산하지는 않습니다. 유휴 상태 회수를 위해 반복 샘플링과 우아한 종료를 사용하고, 전송 계층 및 워크스페이스별 진단을 위해 인증된 `/daemon/status`를 사용하세요. 관리되는 런타임 getter 중 하나가 예외를 발생시키면, 심층 헬스는 부분 합계를 반환하는 대신 `503 {"status":"degraded","reason":"aggregation_failed"}`으로 실패 상태로 닫히며, 데몬 로그에서 실패한 워크스페이스 런타임을 식별합니다. 부팅 중 런타임 레지스트리가 준비되기 전에는 `503 {"status":"degraded","reason":"bootstrap"}`을 `Retry-After: 1`와 함께 반환합니다. 리스너 라이브니스의 경우 `?deep` 없이 기본 `/health`을 사용하세요.

**인증:** 비 루프백 바인딩 시 및 루프백이 `--require-auth`으로 강화된 경우 필요합니다. 일반적인 루프백 바인딩(`127.0.0.0/8`, `localhost`, `::1`, `[::1]`)에서는 k8s/Compose 프로브가 토큰을 포함하지 않아도 되므로 베어러 미들웨어 전에 `/health`이 등록됩니다. 비 루프백(`--hostname 0.0.0.0` 등) 또는 강화된 루프백에서는 라우트가 베어러 미들웨어 후에 등록되며 유효한 토큰 없이는 401을 반환합니다. 그렇지 않으면 인증되지 않은 호출자가 임의의 주소를 프로브하여 `qwen serve`의 존재 여부를 확인할 수 있으며, 이는 포트 스캐닝과 결합될 경우 심각한 저위험 정보 유출입니다. 일반적인 루프백 면제에서도 CORS 거부 + Host 허용 목록은 여전히 적용됩니다.

### `GET /daemon/update`, `POST /daemon/update/prepare`, and `POST /daemon/update/restart`

이 인증된 경로는 선택된 워크스페이스와 독립적으로 데몬의 Qwen Code 설치를 관리합니다. ACP 세션 전송을 사용하는 SDK 클라이언트를 포함하여 항상 REST를 사용합니다. `daemon_update` 기능은 프로토콜을 광고하며, 가용성은 반환된 상태로 결정됩니다.

GET은 릴리스를 다운로드하거나 활성화하지 않고 확인만 수행합니다. 성공적인 확인은 15분 동안 캐시되고 오류는 1분 동안 캐시되며, `?refresh=true`은 새로운 확인을 요청합니다. 동시 확인은 하나의 조회를 공유합니다. 응답에는 `state` (`available`, `up-to-date`, `installing`, `ready`, `restarting`, `unavailable` 또는 `error`), `canInstall`, 선택적 `currentVersion` 및 `latestVersion`, 그리고 선택적 `instructions` 및 `message`이 포함됩니다. `currentVersion`는 업데이트가 준비된 후를 포함하여 실행 중인 데몬을 식별합니다. 지원되지 않는 설치 방법은 `available`과 `canInstall: false` 및 수동 지침을 보고할 수 있습니다.

자동 업데이트에는 실제 CLI 수명 주기가 필요하며, POSIX `process.execve`, 스탠드어론 설치 또는 게시된 런처를 실행하는 전역 npm/pnpm/yarn/bun 설치(스테이징이 전역 접두사에 쓰지 않으므로 루트 소유의 npm 접두사 포함)가 있어야 하고, `general.enableAutoUpdate`을 허용하는 운영자 설정이 필요합니다. 임베디드 서버, Windows, 지원되지 않는 Node 런타임 및 개발 모드는 `unavailable`을 보고합니다. 전역/시스템 설정만 적용되며, 워크스페이스 설정으로는 설치를 활성화할 수 없습니다. 연결은 기본 리스너와 해당 데몬 런타임 토큰을 사용하거나, 토큰 없이 명시적으로 신뢰된 루프백 배포를 사용해야 합니다. 페어링된 브라우저 및 로컬 제어 연결은 자격 증명이나 리스너가 재시작 후에도 유지되지 않으므로 `unavailable`을 보고하며, 이러한 업데이트 변경은 `403 update_connection_unsupported`을 반환합니다.

두 POST 경로 모두 엄격한 변경 게이트의 데몬 운영자 권한을 요구하며 매개변수를 받지 않습니다. 서버가 릴리스, 대상 및 런처를 선택하며, 클라이언트는 버전이나 명령을 제공할 수 없습니다.

- `POST /daemon/update/prepare`은 백그라운드 다운로드를 시작하고 `state: "installing"`와 함께 `202`을 반환합니다. 이는 활성 설치를 변경하지 않습니다. 상태가 `ready`일 때까지 GET을 폴링하세요. 반복적인 준비는 동일한 작업을 공유하며, 준비된 업데이트는 `200`을 반환합니다. 자동 업데이트가 사용할 수 없는 경우 `409 update_unavailable`을 반환합니다.
- `POST /daemon/update/restart`은 준비된 업데이트가 필요하며, 그렇지 않으면 `409 update_not_ready`을 반환합니다. 업데이트를 활성화하기 전에 `202`와 `state: "restarting"`으로 응답한 후 데몬을 우아하게 종료하고 프로세스를 업데이트된 런처로 교체합니다. 반복적인 클릭은 하나의 재시작을 공유합니다. 응답 후 데몬은 현재 릴리스를 한 번 다시 해석합니다: 만약 준비된 것보다 최신이고 원클릭 업데이트가 이를 커버한다면, 최신 릴리스가 스테이징되고 준비된 페이로드가 폐기되므로, 장수 명(deamon)을 가진 데몬은 처음 준비했을 때의 최신 버전 대신 현재 최신 버전에 도달하게 됩니다. 대체된 페이로드가 폐기되기 전에 최신 페이로드가 커밋되며, 이 폐기는 최선의 노력(best-effort)입니다: 폐기 실패는 디스크 공간을 누출시키지만, 최신 페이로드를 고아로 만들거나 반쯤 제거되었을 수 있는 페이로드로 폴백하지는 않습니다. 이후 `latestVersion`는 더 최신 대상을 보고하지만 `state`은 `restarting` 상태를 유지합니다. 재해석 또는 스테이징 실패 시 준비된 릴리스가 대신 적용되며, 레지스트리 장애로 인해 클릭이 실행 중인 버전에 갇히는 일은 결코 없습니다. 교체 작업은 PID, 작업 디렉터리, CLI 옵션, 바인딩된 포트 및 유효한 데몬 토큰을 보존하고, 이전 버전 고정(pins)을 지우며, 브라우저를 다시 열지 않습니다. 클라이언트는 `currentVersion`이 변경될 때까지 GET을 폴링한 후, 업데이트가 요청될 때 캡처한 URL에서 문서를 다시 로드합니다. 스테이징은 `202` 이후에 실행되며 몇 분이 걸릴 수 있으므로, 클라이언트는 클릭 시점이 아닌 연속적인 도달 불가능 기간부터 재시작 기한을 측정합니다: 계속 응답하는 데몬은 여전히 작동 중입니다. 관대한 절대 상한(20분)은 도달 가능하지만 `restarting`을 떠나지 않는 데몬을 최종적으로 처리합니다. 이는 단일 타임아웃 상수가 아니라 전체 스테이징 체인 위에 위치합니다: 스탠드어론 아카이브 다운로드는 각각 5분의 예산으로 OSS와 GitHub를 순차적으로 시도하며, 체크섬 및 서명 가져오기에 최대 2분이 추가되어, 활성화 전에 하나의 재스테이징이 다운로드 및 검증에 약 12분을 소비할 수 있습니다; 관리되는 npm 하위 프로세스는 10분으로 제한됩니다. 모든 포기 경로는 화면에 재시도 가능한 항목을 유지하는데, 멈춘(wedged) 데몬은 컨트롤이 일반적으로 표시하지 않는 `restarting`을 계속 보고하기 때문입니다. 재시작이 확인되면, 프로세스가 교체될 때까지 `restarting`이 고정(sticky)되므로, 변경되지 않은 `currentVersion`와 함께 다른 상태를 보고하는 도달 가능한 데몬은 교체가 새 빌드에 착지하지 않았음을 의미합니다; 클라이언트는 대기 중지, 확정된 상태 게시 및 실패 보고를 수행하며, 버전 변경을 영원히 기다리지 않습니다. 이 검사는 확인 이후 _시작된_ 폴링에만 적용됩니다: 상태 요청과 재시작 요청은 독립적이므로, 이전에 시작된 폴링이 나중에 재시작 전 스냅샷을 전달할 수 있으며, 이를 확정된 데몬으로 읽으면 잘못된 실패를 보고하고 성공적인 업데이트가 사용자에게 아직 제공해야 하는 새로 고침을 억제하게 됩니다. 스탠드어론 런처 검증은 서비스 종료 전에 실행됩니다; 검사 실패 시 데몬은 실행 상태를 유지합니다. 종료 시작 후 또는 프로세스 교체 중 발생하는 실패는 복구가 보장되지 않습니다.

Web Shell은 지원 가능한 업데이트를 백그라운드에서 자동으로 확인하고 준비하며, 준비된 업데이트가 완료되었거나 수동 지침이 포함된 사용 가능한 업데이트가 있을 때 버전 옆의 업데이트 버튼을 표시합니다. 수동 지침 상태에서는 버튼이 확인 시 얻은 지침을 포함하는 팝오버를 열며, 절대 준비하거나 재시작하지 않습니다. 준비 및 준비 완료 상태는 워크스페이스 런타임 재로드 후에도 유지됩니다. 준비된 업데이트는 대상 버전을 고정합니다: `?refresh=true`을 포함한 폴링 GET 요청은 준비된 `latestVersion`을 계속 보고하며 다시 다운로드하지 않으므로, 여러 릴리스 동안 실행 중인 데몬은 백그라운드에서 불필요한 다운로드를 반복하지 않습니다. 오직 재시작만이 대상을 다시 해석합니다. 일반적인 데몬 종료는 준비된 다운로드를 폐기합니다. 활성화 실패 시 데몬은 계속 실행되며 `error`을 보고합니다; 1분 오류 캐시 이후의 다음 확인에서 재시도를 위해 새 다운로드를 준비할 수 있습니다. 자동 업데이트 비활성화 시 준비 완료 상태를 제거하고 재시작 시작 전에 다운로드를 정리합니다. 재시작이 진행 중이면 방해받지 않습니다: 상태가 `restarting`인 동안 status, prepare 및 restart 라우트는 모두 운영자 설정을 참조하지 않고 응답하며, 종료 정리는 아무 작업도 하지 않으므로 몇 분 걸리는 재스테이징(re-stage) 중에 페이로드가 제거될 수 없습니다. 준비 완료 상태에서 버튼을 클릭하면 전체 데몬을 명시적으로 재시작하며 활성 세션을 중단시킵니다.

### `GET /daemon/status`

읽기 전용 운영자 진단. `/health`과 달리, 이는 일반 데몬 API입니다: 루프백 바인딩에서도 베어러 인증 및 속도 제한 후에 등록됩니다. 쿼리 매개변수:

- `detail=summary`은 의도적으로 워크스페이스 상태 메서드를 쿼리하지 않으며, ACP 자식을 시작하거나
- `detail=full`에는 라이브 세션 진단, ACP 연결 진단, 인증 디바이스 플로우 카운트 및 워크스페이스 상태 섹션도 포함됩니다.
- 다른 `detail`은 `400 { "code": "invalid_detail" }`을 반환합니다.

`summary`은 의도적으로 워크스페이스 상태 메서드를 쿼리하지 않으며, ACP 자식을 시작하거나 세션을 생성하지 않습니다. `full`은 각 워크스페이스 섹션을 독립적으로 쿼리합니다; 타임아웃 또는 예외 발생 시 해당 섹션만 `unavailable`로 표시되고 `workspace_status_unavailable` 문제가 추가됩니다.

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxSessions": 32,
    "maxTotalSessions": 800,
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

다중 워크스페이스 응답에는 또한 `{ id, cwd, displayName?, primary, trusted }`을 포함하는 최상위 `workspaces[]` 행이 포함됩니다. 선택적 표시 이름이 설정되지 않은 경우 생략되며, 이는 표현 전용으로 유지됩니다; 상태 소비자는 런타임을 상관관계 짓기 위해 `id` 또는 `cwd`을 계속 사용해야 합니다.

`runtime.perf`은 선택 사항입니다. 존재할 경우 데몬 프로세스 이벤트 루프 지연, 프롬프트 FIFO 큐 대기 샘플 및 데몬-자식 파이프 바이트 카운터만 보고합니다; ACP 자식 이벤트 루프 지연은 `/daemon/status`에 포함되지 않습니다.

`status`은 오류 심각도의 문제가 있으면 `error`, 경고 심각도의 문제가 있으면 `warning`, 그 외에는 `ok`입니다. 문제 코드는 안정적이며 `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`, `channel_worker_partial_connect`, `channel_restore_failed` 및 `workspace_status_unavailable`을 포함합니다. 리스너가 준비되었지만 전체 런타임이 마운트되기 전의 짧은 윈도우 동안 `/daemon/status`은 `daemon_runtime_starting`을 보고할 수 있습니다; 비동기 런타임 마운트가 실패하면 non-status 런타임 라우트가 `503`을 반환하는 동안 `daemon_runtime_failed`을 보고합니다.

`runtime.activity`은 데몬 전체의 프롬프트 활동을 보고합니다. `activePrompts`은 진행 중인(in-flight) 프롬프트가 있는 세션 수를 집계합니다. `pendingPrompts`은 아직 완료되지 않은 모든 허용된(accepted) 프롬프트 수를 집계하며, 여기에는 실행 중인 프롬프트와 FIFO 대기열에 있는 프롬프트가 포함됩니다. `queuedPrompts`은 허용되었지만 아직 디스패치(dispatch)되지 않은 FIFO 대기열 프롬프트 수를 집계합니다. `lastActivityAt`는 마지막 프롬프트 시작/종료 또는 세션 생성(spawn) 시점의 ISO 8601 타임스탬프이며, 부팅 이후 데몬이 아무런 활동도 처리하지 않은 경우 `null`입니다. `idleSinceMs`은 응답 생성 시점에 `lastActivityAt`로부터 계산됩니다.

`limits.memory`은 가산적이며 데몬의 해석된 메모리 수치를 보고합니다: 필수 `enforced: false`, `childHeap` 객체(`mode`: `off`, `observe` 또는 `admit`; `admissionEnforced`, 관리되는 `admit`에만 true; `maxConcurrentChildren` 및 `perChildCeilingMb`, 둘 다 아무것도 모델링하지 않는 `mode: 'off'` 하의 `null` — 그리고 `perChildCeilingMb`은 `modeled.minChildHeapMb` 내에서 파티션을 모델링할 수 없는 모든 곳에서 추가로 `null`을 포함합니다 — 풀이 해당 하한에서 한 개의 자식을 커버할 수 없거나, 상한이 `modeled.legacyChildCeilingMb`으로 제한되면 그 아래로 떨어지는 경우인데, 이는 `floor(available / 2)`이므로 1024 MB 미만의 호스트에서는 하한 아래로 떨어집니다. 절대 0이 아니며, 이러한 경우 `maxConcurrentChildren`은 `0`입니다. 왜냐하면 파티션을 모델링하지 않는 호스트는 부재한 모델이 아니라 계산된 답변이기 때문입니다; 그리고 `refusals`(모델링된 한도를 초과했을 스폰), `configuredBudgetMb`, `effectiveBudgetMb`(해석된 cgroup/호스트 메모리로 제한된 설정 값), `budgetSource`(`flag` / `derived`), `availableMemoryMb`, `availableMemorySource`(`constrained` / `host`), `insufficientMemory`, 그리고 `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb` 및 `legacyChildCeilingMb`(오늘날 ACP 자식이 받는 상한의 보수적 모델로, 실제 수치보다 낮을 수 있음)을 포함하는 `modeled` 객체가 있습니다. `runtime.memory`은 추가로 `registeredWorkspaces`(등록 수 — 제거되지 않은 워크스페이스 항목으로, 배수 중, 전환 중 또는 차단된 항목 포함; 라이브 자식 수가 아님), `activeAcpChildren`(라이브이고 죽지 않는 채널을 가진 데몬 관리 ACP 자식 — 전환 중이거나 차단된 항목을 포함하지만, 자식이 종료되지 않았더라도 킬이 시작된 워크스페이스는 제외; 채널 워커, MCP 후손 또는 분리된 스폰 예약은 아님), `childRssCoverage`(`active_children` — 라이브 채널을 가진 모든 ACP 자식으로, `activeAcpChildren`가 세는 집합임; 이전 버전의 데몬은 `primary_only`을 전송함), 아래에 설명된 `children` 객체, 그리고 `recommendedShareAtRegisteredMb`(워크스페이스가 등록되지 않은 경우 `null`)과 `recommendedShareAtActiveMb`(활성 자식이 없는 경우 `null`)을 포함하는 `modeled` 객체를 보고합니다. 각 공유량은 레거시 자식 상한으로 제한되며, 상한이 허용할 때만 최소 자식 힙으로 하한이 적용됩니다 — 작은 호스트에서는 상한이 하한보다 낮으므로, 공유량 × 개수가 자식 풀을 초과할 수 있습니다. 공유량을 풀의 분배가 아닌 권고 사항으로 읽으십시오. 자식 힙 크기는 여전히 권고 사항입니다: 어떤 자식 스폰 인수도 이 값들에서 파생되지 않습니다. 옵트인 `admit`은 모델링된 동시 자식 수를 강제하는 반면, 기본값 `observe`은 거절될 만한 사항을 기록하기만 합니다. `runtime.memory.committedAcpChildren`는 관리되는 ACP 예약과 연결된 자식을 세며, 레지스트리 해제까지 종료 중인 자식을 포함합니다; 관리 레지스트리를 사용할 수 없는 경우 `null`입니다. `childHeap`는 `modeled.childPoolMb`의 고정 분할을 모델링합니다 — 모든 자식이 동일한 `perChildCeilingMb`을 받으므로, 모델링된 총량이 스폰별 공유량처럼 누적되지 않고 풀 내에 유지됩니다. `refusals`을 수용 압력으로만 읽으십시오: 개수가 0이라고 해서 파티션 적용이 안전하다는 의미는 **아닙니다**. 왜냐하면 자식은 훨씬 더 큰 호스트 파생 상한에서 실행되므로, `perChildCeilingMb`보다 많은 구 공간(old space)이 필요한 워크로드가 여기서는 정상일 수 있지만, 파티션이 적용되면 실패할 것이기 때문입니다. 비영(nonzero) 개수가 용량 압박을 의미하지 않을 수 있는 두 가지 추가 이유는 다음과 같습니다: 수용 결정은 종료 중인 자식이 종료될 때까지 이를 세므로, 이미 `maxConcurrentChildren`인 데몬에서는 모든 채널 교체 시 겹치는 윈도우 동안 거절을 예약하게 됩니다; 또한 파티션을 모델링하기에 너무 작은 호스트에서는 `maxConcurrentChildren`이 `0`이 되므로, `refusals`는 전체 ACP 스폰 수와 같으며, `insufficientMemory`이 이를 설명하는 필드입니다. `admit`에서는 슬롯이 0인 모델이 시작 시 실패합니다. 용량 고갈에 직면한 완전히 관리되는 데몬은 라이브 세션이나 대기 중인 작업이 없는 가장 오래된 사용(LRU) 빈 ACP 하나를 회수하고, 추적된 해제를 기다린 다음, 스폰하기 전에 수용을 한 번 재시도할 수 있습니다. 로드된 세션은 보호되며, 워크스페이스 등록과 저장된 히스토리는 유지됩니다. `refusals` 카운터는 성공적인 회수에 이어진 초기 거절을 포함한 거부된 수용 시도 횟수를 세며, 최종적으로 사용자가 볼 수 있는 실패 횟수는 아닙니다. 용량 고갈 시 REST HTTP 503을 반환하며, `code: "acp_child_capacity_exhausted"`, `maxConcurrentChildren`, `committedAcpChildren`(거부된 예약 제외)을 포함하고 `Retry-After`는 포함하지 않습니다. ACP JSON-RPC는 `-32603`을 사용하며, 해당 코드를 담고 있는 `data.errorKind`, `data.httpStatus: 503` 및 동일한 카운터를 사용합니다. 검증된 디스패치 전 독립형 생성 롤백은 `standalone_creation_rolled_back`, 세션 ID 및 재시도 가능성을 유지하고, 용량 코드와 카운터를 `capacity` 아래에 중첩합니다; 불확실한 생성 결과는 기존 복구 의미를 유지합니다. 클라이언트는 자동 용량 재시도를 중지하고 수동 재시도를 위해 초안 또는 선택된 세션을 보존해야 합니다. 일반적인 `runQwenServe` 경로에서는 부트스트랩 앱이 생성되기 전에 예산이 해석되므로, 부트스트랩 윈도우 동안 `limits.memory`이 이미 채워져 있습니다. 예산을 해석하지 않는 경로(예: `runQwenServeImpl`을 우회하는 직접 임베드)에서만 `null`입니다. SDK 타입은 `null`을 허용하므로, 올바른 클라이언트는 이에 대처합니다.

`runtime.memory.children`은 해당 블록 내에서 추가적(additive)으로 `childRssCoverage`이 지정한 자식들의 집계 RSS를 보고합니다: `rssBytes`(자식들이 자체 보고한 RSS 합계), `sampled`(측정값을 생성한 자식 수), `oldestReadingAgeMs`(합계에 포함된 가장 오래된 측정값의 경과 시간으로, 호출자는 부분 측정값들이 얼마나 떨어져 있었는지 알 수 있음). `sampled`의 분모는 형제 필드인 `activeAcpChildren`이며 블록 내에 반복되지 않습니다. `sampled`이 더 낮은 경우 `rssBytes`은 총계가 아닌 하한(floor)입니다. 샘플링은 활성 SSE/WS 워처에 의해 게이트(gate)되므로, 아무도 스트리밍하지 않는 데몬에 대한 상태 요청은 라이브 자식이 있더라도 `sampled: 0`을 보고합니다 — 옆에 있는 `activeAcpChildren`이 그 공백을 보이게 하며, `rssBytes: 0`과 `sampled: 0`는 결코 측정된 0을 의미하지 않습니다. `oldestReadingAgeMs`은 아무것도 샘플링되지 않았을 때와 모든 기여자가 해당 필드 도입 이전의 브리지(bridge)일 때 `null`이 되며, 따라서 결코 "fresh"를 의미하지 않습니다. 합계를 과대 추정과 과소 추정의 조합으로 읽으십시오: 프로세스별 RSS를 합치면 자식들이 공유하는 페이지가 이중 계산되는 반면, 각 자식은 자신의 프로세스만 보고하므로 MCP 후손과 모든 채널 워커가 누락됩니다. 이는 데몬 트리의 메모리가 아닙니다. `primary_only`을 보고하는 데몬은 이 필드를 전송하지 않으므로, SDK 미러(mirror)에서는 이 필드가 선택적입니다.

`runtime.memory.children.heap`은 해당 블록 내에서 가산적이며, 각 ACP 자식의 수명 동안 V8 구세대(old-generation) 최고 기록(high-water marks)을 보고하되, **합계가 아닌 최대값**으로 집계합니다: `peakOldGenerationBytes`, `peakLiveSetBytes`, `peakTotalHeapBytes`, `majorGcCount`, `majorGcMs`, `unclassifiedSpaceNames` 및 `reported`. 힙 상한은 자식별로 적용되며 피크는 서로 다른 시점에 도달하므로 합계는 의미가 없습니다. 각 필드는 하나의 자식을 나타내는 것이 아니라 보고된 자식들 전반에 걸친 독립적인 최대값이며, 자식별 상한은 각 축별로 개별적으로 판단됩니다. `reported`은 `sampled` 중 몇 개가 기여했는지 세며, 일부 자식이 해당 필드보다 먼저 생성된 경우 값이 낮아집니다. 모든 바이트 수치는 **구세대**를 포함하며 — `--max-old-space-size`이 실제로 제한하는 대상 — `old_space`만 포함하지는 않습니다. 왜냐하면 자식은 `old_space`이 몇 MB일 때 `large_object_space`이 모든 것을 보유하면서 상한을 소진할 수 있기 때문입니다. `peakOldGenerationBytes`은 커밋된 바이트로, 자식에 할당된 상한과 함께 증가하므로 워크로드의 요구 사항이라기보다는 필요량의 상한으로 해석해야 합니다. `peakLiveSetBytes`은 주요 GC 후에도 남아 있으며 상한과 함께 변하지 않는 수치로, 자식이 하나도 맞지 않음을 말할 수 있게 하는 지표입니다. 이는 정확한 라이브 세트(live set)라기보다는 상한으로 해석해야 하는데, GC 항목이 비동기적으로 도착하고 컬렉션과 읽기 사이에 할당된 모든 것이 계산되기 때문입니다. `peakLiveSetBytes`은 주요 GC가 관찰될 때까지 `0`이며, 이는 측정치가 아닌 부재를 의미합니다. `unclassifiedSpaceNames`은 보고된 자식이 분류할 수 없는 힙 공간들의 합집합입니다. V8은 버전 간에 공간을 이름 변경하고 추가하므로, 알 수 없는 공간은 합계에서 제외되며, 제외되면 과소 계산됩니다. 따라서 배열이 비어 있지 않으면 바이트 수치가 불완전하며 전체 측정치로 해석되어서는 안 됩니다. 샘플링된 자식이 하나도 보고하지 않은 경우 전체 객체는 영으로 초기화된 객체가 아닌 `null`입니다. SSE/WS 워처가 연결되지 않으면 아무것도 샘플링되지 않으므로 이는 엣지 케이스가 아니라 일반적인 상태입니다. 이 모든 것은 관찰적입니다. 여기서는 자식의 크기를 결정하거나, 스폰을 거부하거나, `limits.memory.enforced`을 `false`에서 이동시키지 않습니다.

`runtime.memory.pressure`은 해당 블록 내에서 가산적이며 데몬 루트 자체의 메모리 압력을 보고합니다: `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio`, 그리고 비율이 도출되는 여섯 개의 원시 수치 — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio`은 `rssRatio`과 `heapRatio` 중 더 큰 값이며, `source`은 어느 쪽인지 지정합니다. 동률은 `rss`로 보고됩니다. `availableBytes`은 바이트 단위의 `limits.memory.availableMemoryMb`입니다. 의도적으로 감지된 cgroup/호스트 수치이며 `effectiveBudgetMb`이 아닙니다. 프로세스를 종료시키는 것은 실제 한계이지 운영자의 정책 숫자가 아니기 때문입니다. `source: "unknown"`은 두 분모 모두 측정 불가능함을 의미하며 정상 상태로 해석되어서는 안 됩니다. `level`은 그런 경우에만 `normal`인데, 분류할 것이 없기 때문입니다. 수치들은 **데몬 루트 프로세스만** 포함합니다. 즉, 이 프로세스 자체의 `memoryUsage()`이므로 자식이 증가해도 변동되지 않습니다. `runtime.memory.children`는 이를 별도로 보고하며, 두 수치 모두 프로세스 트리 메모리가 아닙니다. 두 모드 모두 전체 블록을 보고합니다. 다만 `observe`에서만 경로가 없는(path-free) `daemon_memory_pressure` 경고를 상태 롤업(status rollup)으로 격상시키므로, `off`는 최상위 `status`을 변경하지 않습니다. 어떤 모드에서도 자동 교정(remediation)이 이루어지지 않습니다. SDK 미러에서 이 필드가 선택적인 이유는 `runtime.memory` 이전 버전을 출시한 데몬들이 이 필드 없이 블록을 보내기 때문입니다.

`limits.maxRegisteredWorkspaces`은 가산적이며, 해결된 사용자 등록 상한(기본값 256, 1~256 사이 설정 가능)을 보고합니다. `limits.maxChannelControlWorkspaces`은 채널이 비활성화된 상태에서도 표준 데몬에서 25개의 독립적인 제어/복구 소유자 상한을 보고합니다. 맞춤형 컨트롤러는 이를 강제할 때만 해당 필드를 광고합니다. 이러한 필드는 부트스트랩 및 준비 완료 응답 모두에 존재하지만, 이전 버전의 데몬에서는 생략될 수 있습니다. 채널 컨트롤러는 후보 워커를 구성하기 전에 상한을 초과하는 과도기적 소유자 연합(union)을 `409 channel_control_workspace_limit_reached`로 거부합니다. 부팅 시 초기 연합이 상한을 초과하면 리스너가 게시되기 전에 시작이 실패하므로 HTTP 인터페이스가 없습니다. 등록 용량은 SDK 채널 타임아웃을 결정하지 않습니다.

`limits.maxTotalSessions`은 가산적입니다. `null`은 유효한 데몬 전역 신규 세션 상한이 비활성화되었음을 의미합니다. 해결된 등록 용량(기본값 256, `QWEN_SERVE_MAX_WORKSPACES` 또는 내장된 `maxRegisteredWorkspaces`을 통해 설정 가능)이 25를 초과하고 `--max-total-sessions`가 생략된 경우, 표준 데몬은 하나의 시작 작업 공간(startup workspace)만 있더라도 고정 총량 800을 사용합니다. 등록 용량이 25 이하인 경우, 유한한 `maxSessionsPerWorkspace`를 가진 여러 개의 시작/복원 작업 공간은 동일한 시작+복원 개수에 대해 `maxSessionsPerWorkspace * workspaceCount`로 유효 총량을 한 번만 파생시킵니다. 하나의 시작 또는 복원 작업 공간은 무제한 기본값을 유지합니다. 명시적인 총량 제한(비활성화 값 포함)이 우선합니다. 이후의 동적 등록은 총량을 재계산하지 않습니다. 직접 `createServeApp` 내장은 자체 공유 승인(admission) 정책을 제공해야 합니다. 설정되면 데몬 전역에서 신규 세션 생성을 제한하며, 기존 `session_limit_exceeded` 오류 형식과 `scope: "total"`를 사용하여 총량 제한 실패를 보고합니다.

`runtime.channel.live`은 데몬 내부의 ACP 브리지 채널을 보고합니다. 이는 채널 어댑터 워커가 아닙니다. 데몬 관리 채널은 `runtime.channelWorker`을 사용하며, 여기서 `state`은 `disabled`, `starting`, `running`, `exited`, `failed` 또는 `stopped` 중 하나입니다. 워커가 `running`에 도달한 후 종료하면 `/daemon/status`은 데몬을 온라인 상태로 유지하고 경고 문제 코드 `channel_worker_exited`을 보고합니다.

명시적인 `qwen serve --channel ...`에서의 데몬 관리 채널 워커 시작은 fail-fast(빠른 실패) 방식을 유지하며 영구화된 시작 설정보다 우선합니다. 플래그 없는 부팅은 모든 신뢰할 수 있는 등록된 워크스페이스에서 `serve.channels`을 복원하며, 각 워크스페이스는 자체 범위 설정에서 목록을 제공합니다. 복원된 이름들은 소유자가 일반적으로 해석되는 하나의 선택 항목을 형성하며, 이름을 나열한 워크스페이스가 모호한 소유권 관계를 해결합니다. 이 부팅 귀속은 데몬이 실행되는 동안 지속됩니다: 중간에 선택 항목이 중지된 후라도 `PUT /workspace/channel`가 이러한 이름을 다시 활성화하면 부팅 당시와 동일하게 해석됩니다. 주(primary)가 아닌 워크스페이스가 제공한 이름이 해석되지 않으면 식별 로그와 함께 삭제되므로, 한 워크스페이스의 오래된 항목이 다른 워크스페이스를 고립시키지 않습니다; 주 워크스페이스가 나열한 이름은 다른 워크스페이스에서도 나열되는지 여부와 관계없이 복원 전체를 실패시킵니다. `all`은 여전히 주 워크스페이스 전용입니다: 다른 곳에서는 무시되며 보고됩니다.

부팅 후 등록된 신뢰할 수 있는 비주(non-primary) 워크스페이스는 자체 `serve.channels`도 복원하며, 채널 런타임을 로드하고 다른 곳에서 채널 서비스 리스를 보유하지 않았다면 이를 예약합니다. 이 복원은:

- **데몬 실행당 한 번** 발생합니다 — 워크스페이스가 무언가를 요청하자마자 기록되므로, 이후 제거 및 재등록이나 신뢰 재물화(re-materialization)가 중간에 해당 채널 중 하나를 중지한 운영자의 조치를 되돌리지 않습니다;
- 나중에 등록된 워크스페이스가 확장하지 않는 명시적인 `--channel` 선택 하에서는 발생하지 않습니다;
- `DELETE /workspace/channel`이 호스팅을 중지한 후에는 `PUT /workspace/channel`이 선택 항목을 다시 커밋하거나 데몬이 재시작될 때까지 발생하지 않습니다;
- 커밋된 `all` 선택을 그대로 유지합니다;
- 작업 공간의 이름을 하나의 변경 사항으로 커밋된 선택 항목에 추가하며, 한 번에 하나씩 늦은 복원을 수행합니다. 부팅 시 호스팅할 수 없는 이름을 삭제하고 나머지를 유지하는 것과 달리, 귀속할 수 없는 이름은 해당 작업 공간의 전체 목록을 복원하지 않은 상태로 남기며, 오류는 아래 설명된 대로 기록되고 보고됩니다.

등록은 채널 제어에 전혀 대기하지 않습니다. 복원은 채널 제어 레인에 큐잉되며 응답은 이를 기다리지 않고 작성되고, 데몬이 이미 호스팅 중인 채널에 대해 등록 또는 신뢰도 변경이 트리거하는 조정(reconcile)도 마찬가지입니다. 따라서 준비가 완료되지 않는 워커는 그 뒤에 큐잉된 채널 작업만 지연시킬 뿐, 다른 등록이나 신뢰도 조정을 지연시키지 않습니다. 반면 `POST /workspaces`에서 반환되는 `201`은 해당 작업 공간의 채널이 가동되었거나, 소유한 이미 호스팅 중인 채널의 재시작이 완료되었음을 의미하지 않으며, 이 정보는 `GET /workspace/channel`에서 확인해야 합니다.

명시적인 선택 항목, 부팅 시 `serve.channels` 복원, 또는 위와 같은 등록이 없으면 채널 런타임 로딩은 지연(lazy) 상태로 유지됩니다.

저장된 시작 이름은 비어 있지 않아야 하며, 앞뒤 공백이 없어야 하고, 안전하지 않은 제어 문자나 보이지 않는 문자를 포함하지 않아야 합니다. 잘못된 항목은 개별적으로 건너뛰고 배열 인덱스로 기록되며, 시작 프로세스는 이를 다른 인스턴스 이름으로 정리(trim)하거나 설정을 다시 작성하지 않습니다. 워커 인수는 `--channel=<value>`을 사용하며, 이름의 일부로 앞쪽 대시를 유지합니다.

워커 시작 전의 잘못된 시작 필드나 검증 또는 리스(lease) 오류는 자동 복원을 건너뛰며 `serve.channels`을 식별하는 로그를 남기고, 관련 없는 설정은 계속 유효합니다. 워커 시작 실패는 정리가 성공하면 데몬이 계속 실행되도록 허용합니다. 전역 런타임 시작 시간 초과 및 미확인 워커 중지는 기존 시작 실패 경로를 따르며, 워커 종료 확인이 안 된 동안 리스는 보유 상태를 유지합니다. 채널 관리는 지속화된 시작 설정과 실제 런타임 상태를 보고합니다.

데몬이 기동하지 않은 일부 `serve.channels` 이름은 단순히 기록되는 것이 아니라 보고됩니다. 이러한 이름은 커밋된 선택 항목에 합류하지 않으므로 어떤 워커 스냅샷에도 포함되지 않습니다. 세 가지 경우가 보고됩니다:

- 채널 없이 데몬이 서비스를 유지하는 부팅 경로에서 워커 시작에 실패한 구성된 시작 선택 항목,
- 작업 공간에 귀속하는 동안 부팅 소유권 해석기가 삭제한 이름으로, 이를 나열한 모든 작업 공간에 대해 보고됨;
- 나중 등록의 복원이 실패한 후에도 여전히 호스팅되지 않은 모든 이름.

이들은 두 곳에서 표시됩니다:

- `/daemon/status`은 각 채널과 오류를 명시하여 작업 공간당 하나의 `channel_restore_failed` 경고를 보고합니다. 이는 완전한 표면(surface)이며, 부팅 기록이 작성되는 동안 존재하는 유일한 부트스트랩 응답에도 포함됩니다. 작업 공간당 최대 64개의 채널이 명시되며, 각 이름은 128자로 제한되고, 목록이 더 길 경우 `and <n> more`이 표시됩니다;
- 해당 작업 공간의 `GET /workspaces/:workspace/channels`은 `stopped` 대신 `runtime: { state: "error", lastError }`을 사용하여 채널을 나열하는데, 여기서 `lastError`은 워커가 해당 채널에 대해 오류를 보고한 경우 어댑터 자체의 시작 오류이며, 그렇지 않으면 시도(attempt)의 오류입니다. 이 표면은 작업 공간 자체의 채널 설정 범위로 구축되므로 해당 범위가 정의한 이름만 포함할 수 있습니다. 등록된 어떤 작업 공간도 구성하지 않거나 설정이 다른 작업 공간에 있는 이름은 여기에 행이 없으며 `/daemon/status`에서만 보고됩니다.

`serve.channels` 이름을 호스팅되지 않은 상태로 남겨두는 기타 모든 사항은 데몬 로그에서만 진단됩니다: 전체 목록이 읽을 수 없거나 유효하지 않아 손실된 이름, 기본(primary)이 `all`을 선택했기 때문에 폐기된 비기본 작업 공간의 목록, 커밋된 선택 항목이 `all`이기 때문에 건너뛴 늦은 복원, 그리고 원격(SSH) 작업 공간의 목록입니다. 이에 대해서는 데몬 로그를 검사하십시오.

보고는 채널이 호스팅될 때까지(해당 작업 공간에 의해서든 다른 작업 공간의 후속 복원에 의해서든), 해당 작업 공간이 더 이상 등록되지 않을 때까지, 또는 운영자가 조치할 때까지 지속됩니다: 채널에 대한 `POST` 시작, 중지 또는 재시작, `PUT`/`DELETE /workspace/channels/:name`, 또는 선택 항목을 변경하는 `PUT`/`DELETE /workspace/channel`. `PUT /workspace/channels/:name/startup`는 이를 지우지 않습니다: 실패한 시도에 대해 아무것도 언급하지 않고 `serve.channels`만 다시 작성하기 때문입니다. 보고는 메모리에 보관됩니다: 재시작된 데몬은 다시 복원하며 해당 시도의 결과를 보고합니다. 오류 텍스트는 자격 증명이 마스킹(redacted)되어 있으며 데몬 로그가 렌더링하는 방식과 동일하게 제한됩니다.

워커가 준비 상태에 도달한 후, 예상치 못한 종료는 제한된 정책 내에서 serve 슈퍼바이저에 의해 재시작됩니다: 5분 윈도우 내에서 최대 3번의 재시작 시도, 백오프(backoff)는 1초, 5초, 그 다음 15초 순서입니다. 워커는 15초마다 IPC 하트비트를 전송합니다; 45초 동안 하트비트가 관찰되지 않으면 슈퍼바이저는 워커를 스테일(stale)로 간주하고 강제 종료하며 `staleHeartbeatAt`을 기록하고 동일한 재시작 경로를 사용합니다.

`runtime.channelWorker`에는 추가적인 운영 필드가 포함될 수 있습니다: `requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`, `restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`, `lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures` 및 `startupFailuresTruncated`. 각 시작 실패에는 `channel`, `phase`(현재 `connect`), 선택적 어댑터 제공 `code` 및 자격 증명이 삭제된 `message`가 포함됩니다. 현재 워커 생성에 대해 최대 64개의 실패가 유지되며, 잘림 플래그는 더 많은 실패가 관찰되었음을 의미합니다. `code`은 진단용이며 안정적인 어댑터 간 분류가 아닙니다. `restartCount`은 이 serve 프로세스가 시도한 재시도의 총 횟수입니다. `restartCount > 0`이 있는 실행 중인 워커는 다른 문제가 없는 한 정상입니다. `requestedChannels`에 `channels`에서 누락된 이름이 포함된 실행 중인 워커는 `channel_worker_partial_connect`을 보고합니다.

다중 워크스페이스 데몬(`--workspace` 반복)에서는 `runtime`에 추가로 `channelWorkers[]`가 포함됩니다 — 소유 워크스페이스당 하나의 항목으로, 각각 `workspaceId`, `workspaceCwd` 및 `primary`로 주석 달린 `channelWorker` 스냅샷입니다. 호환성을 위해 `channelWorker`은 기본 워크스페이스의 스냅샷으로 계속 채워집니다. 단일 워크스페이스 데몬은 `channelWorkers[]`를 생략합니다.

### 데몬 관리 채널 제어

`channel_control` 기능은 런타임 선택 리소스를 광고합니다. 이 리소스는 호환성 경로가 단수형 `/workspace` 접두사를 사용하더라도 데몬 전체 범위입니다. 런타임 선택은 지속되지 않으며 데몬의 부팅 시 `--channel` 옵션을 수정하지 않습니다.

`GET /workspace/channel`은 변경할 수 없는 관리자 스냅샷을 반환합니다:

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

비활성화 상태일 때 `selection`은 `null`입니다. `pendingSelection`는 변경 중에만 존재합니다. `transition`은 `idle`, `starting`, `reconciling`, `stopping` 또는 `rolling_back` 중 하나입니다.

`PUT /workspace/channel`은 strict-gated이며 정확히 하나의 선택만 허용합니다:

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

이름은 정렬 없이 공백이 제거되고 중복이 제거되며, 빈 이름 배열은 유효하지 않습니다. `all`은 여전히 기본 워크스페이스 전용입니다. 비활성화에서 활성화로의 변경은 `201`을 반환하며, 멱등적인 PUT 또는 교체는 `200`을 반환합니다. 응답은 `{ changed, replaced, partial, state }`입니다. 동일한 선택은 정상인 워커를 그대로 유지하지만, 워커가 중지되거나 실패한 경우 동일한 선택을 복구합니다.

`DELETE /workspace/channel`은 엄격하게 제어되며 멱등적입니다. `{ changed, state }`을 반환하며 성공적인 상태는 비활성화입니다. `POST /workspace/channel/reload`도 엄격하게 제어되며 설정을 다시 읽고, 워크스페이스 그룹을 다시 해석하며, 커밋된 선택을 강제로 조정합니다. 비활성화 상태일 때 `409 channel_worker_not_enabled`을 반환합니다. `channel_reload` 기능은 관리자가 커밋되고 다시 로드 가능한 선택을 가진 동안에만 동적으로 광고됩니다.

모든 활성화, 교체, 다시 로드, 중지 및 데몬 종료는 하나의 FIFO 생명주기 레인에 들어갑니다. GET은 해당 레인을 기다리지 않습니다. 순서가 지정된 선택이 변경되지 않은 워크스페이스 그룹은 온라인 상태로 유지됩니다. 교체 실패 시 새로 시작된 워커를 중지하고 이전 커밋된 선택을 복원하려고 시도합니다. 클라이언트는 정리 또는 복원도 실패할 수 있으므로 `rolledBack`, `rollbackError` 및 `state`를 확인해야 합니다. 데몬은 트랜잭션 동안 채널 서비스 PID 리스를 유지하며 모든 관련 자식 프로세스 종료가 확인될 때까지 이를 해제하지 않습니다.

안정적인 제어 오류는 다음과 같습니다:

- `400 invalid_channel_selection`, `channel_workspace_mismatch` 또는 `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict`, `channel_worker_not_enabled` 또는 `channel_control_workspace_limit_reached`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`, `rolledBack` 및 선택적 자격 증명 마스킹된 `rollbackError`와 함께
- `503 daemon_draining`

신뢰할 수 있는 루프백 권한 없이 게이트에 도달한 토큰 없는 기본 요청에서의 엄격한 쓰기는 제어 코드가 실행되기 전에 `401 token_required`을 반환합니다. 누락되거나 잘못된 구성된 자격 증명 및 페어링되지 않은 로컬 제어 자격 증명은 더 일찍 단순 `401 Unauthorized`로 거부됩니다. 신뢰할 수 있는 루프백 기본 요청은 정상적으로 실행됩니다. 요청이 시작되면 HTTP 클라이언트 연결을 끊어도 생명주기 트랜잭션이 취소되지 않습니다. 클라이언트는 동일한 PUT을 안전하게 재시도할 수 있습니다.

`502 channel_worker_start_failed`의 경우 응답에 추가로 `startupFailures[]`과 `startupFailuresTruncated`가 포함될 수 있습니다. 각 실패는 시도된 워커의 신뢰할 수 있는 `workspaceCwd`을 추가합니다. 이러한 필드는 실패한 트랜잭션을 설명하는 반면, `state`는 롤백 후 현재 상태를 설명합니다. 이후 GET은 실패한 시도를 유지하지 않습니다. 부분적으로 연결된 워커는 대신 성공을 반환하고 워커 스냅샷에 실패를 노출합니다. 연결된 어댑터가 없는 명시적인 `--channel` 부팅은 시작이 실패합니다. 설정에서 파생된 시작 실패는 기록되며 전역 런타임 시작 시간 제한에 따라 정리가 성공하면 데몬이 계속 진행하도록 허용합니다. 정리 확인 실패는 일반적인 시작 실패 동작 및 서비스 리스를 유지합니다.

`--daemon-url` 없이 `qwen channel status`는 pidfile 메타데이터를 계속 읽으며, `--daemon-url`와 함께 `GET /workspace/channel`을 읽습니다. 재시작 기간 동안 serve 소유 pidfile은 예약 상태로 유지되지만 `workerPid`는 생략되어 클라이언트가 오래된 워커 프로세스를 표시하지 않도록 합니다. 다중 워크스페이스 데몬에서는 pidfile에 추가로 `workers[]` 배열(워크스페이스별 `workspaceId` / `workspaceCwd` / `channels` / 라이브 `workerPid`)이 포함되는 반면, 상위 수준 `channels`(연합) 및 `workerPid`(기본)은 이전 판독기를 위해 계속 채워집니다. 단일 워크스페이스 데몬은 원래의 단일 워커 형태를 유지합니다. 워커 stdout/stderr은 베어러 토큰, 민감한 워커 환경 값 및 프록시 URL 자격 증명이 삭제된 상태로 데몬 로그로 전달됩니다.

### 워크스페이스 채널 관리

`channel_management` 기능은 워크스페이스 범위의 채널 구성 및 런타임 관리를 광고합니다. 단수형 `/workspace` 경로는 기본 런타임을 대상으로 합니다. `/workspaces/:workspace`는 정확히 등록된 신뢰할 수 있는 런타임을 해석하며 절대 기본 런타임으로 대체되지 않습니다.

읽기 전용 검색에는 다음이 사용됩니다:

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspace/channels/events`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`
- `GET /workspaces/:workspace/channels/events`

`GET .../channels/events`은 해석된 작업 공간의 채널 이벤트 저널을 `{ "events": [...], "truncated": boolean }`로 반환하며, `Cache-Control: no-store`와 함께 선택적 `channelLinkMeta` 멤버를 포함합니다. 이 멤버는 채널 인스턴스 이름에서 비기밀 링크 메타데이터(`type` 및 `baseUrl`, 각각 문자열로 설정된 경우에만 존재하며, GitHub 채널의 경우 웹 UI 클라이언트가 API 루트에서 다시 유도하는 대신 직접 연결해야 하는 해석된 `webOrigin`)로 매핑됩니다. 메타데이터는 채널 워커가 사용하는 통합 시스템 + 사용자 + 작업 공간 설정에서 해석되며, 범위 로컬 관리 목록에는 다른 범위에 구성된 채널이 포함되지 않습니다. 또한 해석된 `cwd`이 쿼리된 작업 공간에 속하는 채널로 필터링되므로, 한 작업 공간이 다른 작업 공간의 채널 메타데이터를 수신하지 않습니다. 이를 통해 클라이언트는 사용자 또는 시스템 설정에서 상속된 채널에 대해서도 저널 행(예: GitHub PR 또는 이슈 참조)을 연결할 수 있습니다. 아무 채널도 해석되지 않으면 멤버가 완전히 생략되며, 이전 데몬은 이를 보내지 않습니다. 설정 읽기 실패는 저널 읽기를 실패시키는 대신 멤버 부재로 격하됩니다. 각 이벤트는 채널이 수행한 내용을 기록합니다. 허용하거나 건너뛴 수신 메시지(기계적 이유 포함: `reason_filter`, `mention_required`, `duplicate`, 발신자 게이트 거부, `github_api_error`), 처리가 실패하여 다시 읽을 GitHub 스레드(`failed` 및 `github_api_error`: GitHub 오류 또는 채널이 자체 상태를 읽거나 쓰지 못하거나 스레드의 작업 중 하나가 미완료인 동안 발생한 로컬 오류), 게시 결과, 수신 작업 전환 또는 폴링 결과를 기록하며, 메시지 텍스트는 절대 포함하지 않습니다. 20개 이상의 알림을 필터링하는 GitHub 폴링은 처음 20개를 개별적으로 기록하고, 나머지를 카운트하는 `detail.filtered`을 가진 추가 `reason_filter` 행을 기록하므로 고정된 폴링 커서가 동일한 배치를 반복하여 저널을 넘치지 않도록 합니다. 커서가 유지되는 동안 폴링이 다시 읽는 댓글은 창당 한 번 `duplicate` 또는 `mention_required`로 기록되고, 실패하는 스레드는 창 내 첫 번째 실패 폴링과 이후 모든 열 번째 실패 폴링(속도 제한 또는 자격 증명 오류의 경우: 첫 번째 및 모든 열 번째 폴링)에서 `github_api_error`로 기록되며, 건너뛰는 경우 한 번 기록됩니다. 창당 한 번 기록되는 행은 최대 8,192개의 키 아래에서 추적되며, 더 이상 키가 맞지 않는 행은 모든 폴링에서 기록됩니다. 쿼리 매개변수: `limit` (1-500, 기본값 100), `type` (쉼표로 구분된 `inbound`, `outbound`, `task`, `poll`), `channel` (인스턴스 이름마다 매개변수를 한 번씩 반복), `since` (ISO 8601). 이 라우트에는 운영자 권한이 필요하지 않습니다. 저널 읽기는 비동기적이고 제한적입니다. 현재 저널과 채널당 하나의 회전 파일, 파일당 256 KiB, 요청당 4 MiB, 요청당 32개 파일을 읽으며 최신 항목부터 처리합니다. 링크 메타데이터는 추가로 부작용 없는 통합 설정 스냅샷(몇 개의 작은 JSON 파일, 런타임의 유효 환경에 대해 해석됨)을 동기적으로 읽습니다. 이는 최선의 노력으로 이루어지는 장식 요소이므로, 실패 시 저널 읽기를 실패시키는 대신 멤버를 생략합니다. 레코드 제한이나 읽기 바운드가 결과를 잘라낸 경우(파일별 꼬리 윈도우보다 긴 저널 포함) `truncated`은 true입니다. 아직 저널이 없는 작업 공간은 빈 목록을 반환하며, 읽을 수 없는 범위 디렉터리는 빈 목록 대신 5xx 응답을 반환합니다.

카탈로그는 이 관리 API가 지원하는 유형을 `manageable: true`으로 표시합니다. 인스턴스 스냅샷에는 리비전, 기밀 마스킹된 존재 메타데이터, 시작 상태 및 런타임 상태가 포함됩니다. 리터럴 기밀은 절대 반환되지 않습니다. 채널 스냅샷은 `Cache-Control: no-store`을 사용합니다.

필드 설명자는 `properties`을 통해 중첩된 개체 메타데이터를 노출할 수 있습니다. 숫자 설명자는 열린 하한을 위해 `exclusiveMinimum`을, 포함 상한을 위해 `maximum`을 사용할 수 있습니다. 새로 선언된 바운드 밖에 있는 저장된 숫자는 클라이언트가 변경 없이 재전송할 때 여전히 허용되므로, 바운드를 선언해도 기존 채널에 대한 관련 없는 편집을 차단하지 않습니다. 클라이언트가 실제로 변경한 값은 두 바운드를 모두 충족해야 합니다. 문자열 및 기밀 설명자는 클라이언트에게 다중 줄 텍스트 영역을 요청하기 위해 `multiline`을 사용할 수 있으며, 설명자 유형은 최상위 필드에서만 이를 허용합니다. 광고된 필드 종류를 렌더링하지 않는 클라이언트는 해당 구성 값을 강제로 변환하거나 삭제하는 대신 기존 구성 값을 보존해야 하며, `multiline` 필드를 단일 줄 컨트롤에서 렌더링하는 클라이언트는 줄바꿈이 제거된 입력 값을 다시 쓰는 대신 저장된 값을 그대로 보존해야 합니다. 개체 필드는 필수일 수 없으며, 중첩된 속성은 기밀이거나 환경 해석 가능한 필드일 수 없습니다. 이러한 관리 프로토콜은 최상위 전용으로 유지됩니다. 중첩된 `required` 속성은 쓰기 시 부모 개체가 존재하는 동안에만 강제 적용되며, 부모 개체를 생략하면 중첩된 요구 사항이 확인되지 않습니다. 쓰기는 각 필드의 저장된 값을 통째로 교체하므로, 개체를 보존하려면 저장된 개체를 재전송해야 합니다. 데몬은 부분 개체를 병합하지 않습니다.

구성 쓰기는 낙관적 동시성 제어와 엄격한 운영자 권한 게이트를 사용합니다:

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- 동등한 `/workspaces/:workspace/...` 라우트

각 설정 변경에는 `expectedRevision`이 포함됩니다. 업서트 요청에는 `config` 개체가 포함되며 명시적인 기밀 작업: `preserve`, `replace` 또는 `clear`를 포함할 수 있습니다. 채널 구성은 해석된 작업 공간 외부의 작업 디렉터리를 선택할 수 없습니다.

런타임 작업은 `POST` 요청을 `.../channels/:name/start`, `stop` 또는 `restart`으로 엄격하게 제한합니다. 이는 해석된 워크스페이스가 소유한 워커에서만 작동합니다.

페어링 관리는 `pairing` 발신자 정책 또는 그룹 정책으로 구성된 인스턴스에서만 사용할 수 있습니다:

- `GET .../channels/:name/pairing-requests`
- `{ "code": "..." }`가 포함된 `POST .../channels/:name/pairing-requests/approve`
- `GET .../channels/:name/pairing-approvals`
- `{ "senderId": "..." }` 또는 `{ "groupId": "..." }` 중 하나와 함께 `DELETE .../channels/:name/pairing-approvals`

모든 페어링 경로는 엄격한 운영자 권한을 필요로 하며 `Cache-Control: no-store`을 사용합니다. 요청, 승인 및 취소는 선택된 채널 인스턴스와 워크스페이스 범위로 한정됩니다. 대기 중인 요청에는 유형화된 사용자 또는 그룹 주체가 포함되며, 그룹 요청은 요청을 시작한 발신자도 유지합니다. 승인 스냅샷에는 허용 목록이 표시 이름을 저장하지 않으므로 `senderIds`과 `groupIds`이 포함됩니다. 알 수 없는 사용자 또는 그룹을 취소하면 `404 channel_pairing_approval_not_found`이 반환됩니다.

### 채널 전달 및 Notify

`channel_delivery`은 즉시적이고 최선의(best-effort) 전달 지원을 제공합니다. 이는 프로토콜 기능이며 워커 상태 신호가 아닙니다. 전달은 누락된 워커를 시작하지 않으며, 다른 워크스페이스로 폴백하지 않고, 재시도하지 않으며, 아웃박스를 영속화하지 않고, 과거 알림을 재생하지 않습니다.

직접 Notify는 Agent와 Session을 우회하고 한 번의 전송 시도만 기다립니다:

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

두 경로 모두 엄격한 변경 게이트를 사용합니다. 자격 있는 경로는 등록된 신뢰할 수 있는 워크스페이스만 해석합니다. 성공은 `200 {delivered:true,deliveryId}`입니다. `delivered:true`은 채널 전송 Promise가 해결되었음을 의미하며, 제공자의 수락, 사용자의 수신 또는 읽음 확인을 증명하지는 않습니다. IM 어댑터 간 제공자별 응답 검증 및 일관된 오류 이유 의미는 이 V1 계약의 범위 밖입니다. 오류는 `400 channel_delivery_invalid`, `503 channel_worker_unavailable` 또는 `channel_delivery_queue_full`, `504 channel_delivery_timeout`, 그리고 `502 channel_delivery_rejected` 또는 `channel_delivery_failed`입니다. 타임아웃은 결과가 불명확하며 재시도되지 않습니다. 의도적으로 별도의 연결 테스트 엔드포인트는 없습니다: 일반적인 Notify 호출이 종단 간(end-to-end) 테스트입니다.

재생 가능한 결과 이벤트에는 상관 관계(correlation)와 정화된 상태(sanitized status)만 포함됩니다:

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

성공한 빈 Prompt 최종 응답에서는 오류 필드가 생략됩니다:

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

`source`은 `prompt` 또는 `scheduled`이며; `status`은 `delivered`, `failed` 또는 `skipped`입니다. `skipped`은 대상 턴이 성공적으로 완료되었으나 마지막 도구 미사용(tool-free) 어시스턴트 응답 블록이 비어 있거나 공백뿐임을 의미합니다. 데몬은 전달 권한을 소비하고 채널 워커를 해석하지 않은 채 이벤트를 게시합니다. 예약된 상관관계(correlation)는 `taskId`과 `firedAt`을 사용합니다. 이벤트에는 대상 ID, 메시지 텍스트, 자격 증명 또는 웹훅 시크릿이 절대 포함되지 않습니다.

보안: 응답에는 베어러 토큰, 클라이언트 ID, 전체 ACP 연결 ID, 디바이스 플로우 사용자 코드 또는 검증 URL이 절대 포함되지 않습니다. 두 상세 수준 모두 추가적인 `daemon.runId`, `daemon.logMode` 및 `daemon.logHealth`을 포함할 수 있습니다. `summary`은 데몬 로그 경로 및 손실 세부 정보를 생략하며; `full`는 인증된 운영자를 위해 `logPath`, `logIssues`, `logDroppedRecords` 및 `logDroppedBytes`을 포함할 수 있습니다. 저하된 파일 로깅은 정상 상태 롤업에 경로가 없는 `daemon_log_degraded` 경고를 추가합니다.

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 800,
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

안정적 계약: `v`이 증가하면 프레임 레이아웃이 하위 호환되지 않는 방식으로 변경되었습니다.

> **`protocolVersions`**은 데몬이 구사할 수 있는 서브 프로토콜 버전을 설명합니다. `current`은 데몬의 선호 프로토콜 버전이며 `supported`는 호환되는 세트입니다. 특정 프로토콜을 요구하는 클라이언트는 `supported`을 확인해야 하며, 기능별 UI는 여전히 `features`에서 게이트해야 합니다. v=1에 대한 추가 항목: 이전 v=1 데몬은 이 필드를 생략하므로, 이전 빌드를 대상으로 하는 SDK 클라이언트는 이를 선택적 필드로 취급해야 합니다.

> **Stage 1에서는 `modelServices`이 항상 `[]`입니다.** 에이전트는 단일 기본 모델 서비스를 사용하며 이를 네트워크를 통해 열거하지 않습니다. Stage 2에서는 등록된 모델 어댑터에서 이 필드를 채워 SDK 클라이언트가 서비스 선택기를 구축할 수 있도록 할 것입니다; 그때까지는 이 필드가 비어 있지 않다고 의존하지 마십시오.

> **`workspaceCwd`**은 데몬의 주요 워크스페이스에 대한 정규화된 절대 경로입니다. `POST /session`에서 `cwd`을 생략하기 위해(라우팅은 이 주요 경로로 폴백됨) 그리고 이전 단일 워크스페이스 클라이언트와의 호환성을 유지하기 위해 이를 사용하십시오. v=1에 대한 추가 항목: §02 이전의 v=1 데몬은 이 필드를 생략합니다 — 이전 빌드를 대상으로 하는 클라이언트는 이를 소비하기 전에 null 체크를 수행해야 합니다.

> **`workspaces[]`**은 모든 등록된 런타임을 나열합니다. 새로운 단일 워크스페이스 데몬은 `multi_workspace_sessions`이 부재한 경우에도 주요 런타임을 포함하여 클라이언트가 워크스페이스 한정 라우팅에 필요한 안정적 ID를 발견할 수 있도록 합니다; 이전 데몬은 배열을 생략할 수 있습니다. 각 항목은 `{ id, cwd, displayName?, primary, trusted, removable? }`입니다. `displayName`은 표시 전용이며 설정되지 않은 경우 생략됩니다. 첫 번째/주요 워크스페이스는 `workspaceCwd`에 의해 미러링되며; 새로운 클라이언트는 해당 항목의 `cwd`을 `POST /session`에 전달하여 비주요 런타임을 선택합니다. 신뢰할 수 없는 워크스페이스는 진단용으로 광고되지만 신뢰 변경 전까지 `403 untrusted_workspace`로 새로운 세션 생성을 거부합니다. `removable`은 런타임 제거를 지원하는 데몬에 존재하며 프로세스 동적 또는 복원된 지속성 보조 런타임에만 true입니다.

> **`session_worktree_persistence_v1`**은 데몬이 Part 4A 작업 트리 소유권을 영속화하고 검증할 수 있음을 의미합니다. 성공적인 작업 트리 생성 응답과, 유휴 상태에서 재배치되었거나 이미 검증된 작업 트리 cwd를 보고하는 자식을 가진 복원 응답은 `worktree` 메타데이터와 `worktreeState: "persisted-v1"`를 포함합니다. 레거시 최선 노력 복원이나, 복원 프롬프트가 대기(parked)되지 않고 실행된(fired) 콜드 복원(`suppressWorktreeContextRestore` 꺼짐, 따라서 라우팅은 브리지에게 지연을 요청하지 않음)으로 현재 cwd 없이 활성 프롬프트를 보고하는 경우는 해당 인증 없이도 `worktree`를 반환할 수 있습니다. 격리를 요청하는 클라이언트는 이 태그를 사전 점검하고 각 응답을 검증해야 합니다; `worktree` 객체 자체는 내구성 있는 소유권 증명이 아닙니다.

> **`session_worktree_reset_v1`**은 데몬이 작업 트리 소유권 이전을 지원함을 의미합니다: `POST /session/:id/worktree-reset`은 영속화된 작업 트리 세션의 체크아웃 소유권을 새로운 대체 세션으로 이동시킵니다. 복원 응답은 이와 함께 세 가지 유형화된 409 분류를 얻습니다: `worktree_session_superseded` (세션의 사이드카에 `supersededBy` 링크가 있음 — 분류는 마커 읽기 전에 해당 링크만으로 결정되며, 링크는 마커가 전환되기 전에 기록되므로, 본문의 `replacementSessionId`는 소유권 증명이라기보다 확인을 위한 리디렉션임: 커밋 전 중단된 상태에서는 마커 소유자가 아닌 세션을 지칭하며, 이는 자체적으로 복원될 수 없고 재시도된 리셋에 의해 회수됨), `worktree_marker_missing` (체크아웃 마커가 없음; 이를 재생성하려면 작업을 리셋하십시오 — 복원 재시도는 마커를 쓰는 복원 경로가 없으므로 불가능함), `worktree_reset_interrupted` (이전 이전이 비행 중 크래시되어 사이드카 링크들이 일치함; 리셋을 재시도하십시오). 중단된 분류가 먼저 확인됩니다: `supersedes`/`supersededBy` 링크가 일치하는 누락된 마커는 `worktree_reset_interrupted`로 나타나며, 결코 `worktree_marker_missing`로는 나타나지 않습니다. 이전 프로토콜과 실패 분류 체계는 아래 라우팅 섹션을 참조하십시오.

워크스페이스 기능 태그와 `workspaces[]`은 동적입니다. 워크스페이스를 추가하는 클라이언트는 변형 완료 후 `/capabilities`을 다시 가져와야 합니다; 데몬은 이전 응답을 캐싱한 클라이언트로 기능 변경 사항을 브로드캐스트하지 않습니다. 지속성을 잊는 것은 활성 런타임을 언로드하지 않으므로, 해당 런타임은 재시작할 때까지 광고됩니다.

### `GET /brand`

셸을 화이트 라벨링하려는 호스트를 위한 Web Shell의 제품 브랜딩입니다. 운영자 설정 범위에서 `ui.brand`에서 해석됩니다. `web_shell_brand` 기능 태그에 의해 게이트됩니다; 해당 라우팅이 없는 데몬은 404로 응답합니다.

```json
{
  "name": "QiuQiu Code",
  "logoDataUri": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
}
```

> **두 필드 모두 선택 사항이며, `{}`은 정상적인 응답입니다.** 필드가 부재하다는 것은 "클라이언트의 내장 브랜드를 사용"한다는 의미입니다 — Web Shell은 자체 이름과 인라인 로고를 렌더링합니다. 클라이언트는 빈 본문을 오류로 취급해서는 안 됩니다.

> **핸들러는 설정된 로고가 거부된 경우에도 항상 200으로 응답합니다.** 파일이 없거나, 심볼릭 링크이거나, 하드 링크된 파일이거나, 디렉터리이거나, SVG가 아닌 문서이거나, 내용이 32 KiB를 초과하는 경우 `logoDataUri`이 없는 본문이 반환되며, 그 이유는 데몬의 stderr에 `qwen serve: GET /brand: ui.brand.logoPath …`로 기록됩니다. 따라서 클라이언트는 "브랜드가 설정되지 않음"과 "운영자의 로고가 거부됨"을 구별할 수 없습니다; 운영자 대상 채널은 데몬 로그입니다. 하나의 권고는 거부보다 완화되어 있으며, 두 가지가 있습니다: 사용 가능한 `viewBox`이 없고 양수이며 백분율이 아닌 `width`/`height`(잘못되거나 면적이 0인 viewBox는 사용할 수 없는 것으로 간주)가 없는 루트 `<svg>`로, 브라우저에서 사이드바의 고정 크기에 따라 빈 화면으로 렌더링될 수 있습니다. 그리고 접두사 바인딩된 루트로, 접두사가 없는 요소에 기본 네임스페이스 바인딩이 없어 보이지 않게 렌더링되는 경우입니다. 핸들러 앞의 미들웨어는 핸들러가 실행되기 전에 응답합니다 — 베어러 인증이 필요하지만 누락된 경우 `401`, 선택적 속도 제한기가 작동 중인 경우 `429`. 드레인 중인 데몬은 이 라우트를 거부하지 않습니다: 드레인 중에는 속도 제한기가 허용적이므로, 리스너가 닫히고 클라이언트가 연결 실패를 볼 때까지 핸들러는 계속 200으로 응답합니다. 이 라우트에서 시작 시 503이 발생하지 않습니다: 기본 지연 런타임 경로에서는 요청이 런타임 준비될 때까지 _보류_되었다가 200으로 응답되므로, 짧은 클라이언트 타임아웃이 조기에 발생할 수 있습니다. `code: "daemon_runtime_starting"`을 포함한 503은 런타임 준비 전에 응답하는 구성(예: `--open`)에서만 이 라우트에 도달하며 재시도 가능합니다. `code: "daemon_runtime_failed"`을 포함한 503은 데몬이 재시작될 때까지 종단 상태이며 `Retry-After`을 포함하지 않으므로 재시도하지 마십시오.

> **작업 공간 설정은 절대 기여하지 않습니다.** 이 라우트는 `skipWorkspaceSettings`을 사용하여 설정을 로드하므로, 저장소의 `.qwen/settings.json`이 제품 이름을 변경하거나 데몬이 읽어 모든 연결된 브라우저에 인라인할 파일을 지정할 수 없습니다. 시스템 기본값, 사용자 및 시스템 설정만 해당 우선순위로 읽힙니다. 같은 이유로, 플레이스홀더 치환이 브랜드 값을 변경할 경우 데몬의 stderr에 경고와 함께 거부됩니다: 치환은 프로세스 전역 환경 변수에서 가져오며, 작업 공간의 `.qwen/.env` 또는 `env` 블록이 부팅 시 이를 먼저 채웁니다. 해석할 수 없는 플레이스홀더(변수가 설정되지 않은 경우)는 원본 그대로 유지되므로, 오타가 있는 변수는 조용히 대체되지 않고 리터럴 텍스트로 표시됩니다.

> **`logoDataUri`은 반드시 이미지로 렌더링되어야 하며, 절대 마크업으로 주입되어서는 안 됩니다.** 데몬은 읽은 SVG를 정화(sanitize)하지 않습니다. `img` src 또는 favicon href를 통해 로드된 SVG는 스크립트를 실행할 수 없지만, 문서에 주입된 SVG는 실행할 수 있습니다. Web Shell은 이를 이미지 컨텍스트에만 할당하며, 이 불변 조건이 정화기 없이도 안전하게 만드는 이유입니다.

> **프로세스 전역.** 이 라우트는 작업 공간 선택자나 세션 ID를 받지 않습니다: 값은 사용자 전역 설정에서 파생되므로 데몬이 제공하는 모든 작업 공간에서 동일합니다. 이는 `bearerAuth` 및 속도 제한기 이후, Web Shell SPA 폴백 이전에 등록되므로, 모든 `Accept` 헤더에 대해 JSON으로 응답합니다.

### `POST /workspaces`

추가 작업 공간 런타임을 등록합니다. 경로는 기존이고 접근 가능한 절대 디렉터리여야 하며, 다른 등록된 작업 공간과 중복되거나 중첩되어서는 안 됩니다. 클라이언트가 `persist: true`을 보내지 않는 한 등록은 프로세스 로컬입니다. 클라이언트는 지속성을 요청하기 전에 `persistent_workspace_registration`을 사전 확인해야 합니다. `workspace_display_name`이 광고되면 요청에 선택적 `displayName`을 포함할 수 있습니다.

`git_workspace_clone`이 광고되면 동일한 라우트가 `{ "kind": "git", "url": "...", "target": "/absolute/new/path" }`도 허용합니다. 이 형식은 아직 존재하지 않는 절대 `target`을 요구하며, 비동기 복제를 시작하고 아무것도 등록하지 않으며 `202 { "kind": "git-workspace-clone", "jobId": "..." }`을 반환합니다. 아래 `201` 및 `200` 응답은 동기 `cwd` 및 `scratch` 형식을 설명합니다. git 형식은 아무것도 등록하지 않으며, 복제 진행률 및 취소는 `GET`/`DELETE /workspace-git-clone-jobs/:jobId`을 사용합니다.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

새로 생성된 런타임은 `201`을 반환합니다. 이미 활성인 보조 작업 공간을 지속성 상태로 승격하면 `200`을 반환합니다. 지속성 성공에는 `persisted: true`이 포함됩니다:

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

`displayName`은 주변 공백을 제거한 후 256자를 넘지 않는 문자열이어야 합니다. 빈 결과는 이름 없음으로 처리되며, 내부 C0(`U+0000`–`U+001F`) 또는 DEL(`U+007F`) 제어 문자는 거부됩니다. JSON `null`은 생성 값이 아니며 `400 invalid_display_name`을 반환합니다. 초기 이름을 제공하지 않으려면 필드를 생략하십시오. 중복된 표시 이름은 허용됩니다. 프로세스 로컬 등록과 함께 제공된 이름은 해당 데몬 프로세스 동안만 지속됩니다. `persist: true`은 재시작 후 복원할 수 있도록 지속성 등록과 함께 이를 저장합니다. 이미 지속성인 작업 공간에 대한 요청 반복은 멱등적이며 이름을 변경하지 않습니다.

오류에는 `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached` / `workspace_registration_store_too_large`, `500 workspace_registration_store_error` / `runtime_creation_failed`, 그리고 `501 persistence_not_available` / `not_implemented`이 포함됩니다.

### `PATCH /workspaces/:workspace`

작업 공간 ID 또는 URL 인코딩된 절대 cwd로 선택된 활성 작업 공간 리소스를 업데이트합니다. 이 엔드포인트는 현재 표시 이름 메타데이터만 지원합니다:

```json
{ "displayName": "Payments Production" }
```

이름을 지우려면 `{ "displayName": null }`을 보내십시오. 여기서 `null`은 업데이트 전용 삭제 센티널이며, null이 아닌 값은 `POST /workspaces`과 동일한 문자열 정규화 규칙을 따릅니다. 응답은 업데이트된 `{ id, cwd, displayName?, primary, trusted, removable? }` 작업 공간 투영입니다. 런타임 메타데이터는 항상 업데이트됩니다. 런타임이 일치하는 지속성 등록 식별자를 가진 경우, 모든 별칭은 기존 schema-v1 등록 저장소를 통해 원자적으로 업데이트됩니다. 이 엔드포인트는 절대 지속성 등록을 생성하거나 승격하지 않습니다.

지원되지 않는 필드는 조용히 무시되는 대신 폐쇄(fail closed) 방식으로 실패합니다. 오류에는 `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, 그리고 `503 daemon_shutting_down`이 포함됩니다.

### `DELETE /workspaces/:workspace`

제거 가능한 보조 런타임 하나를 제거합니다. 선택자는 복수형 작업 공간 라우팅 규칙을 따르며 작업 공간 ID 또는 URL 인코딩된 절대 cwd를 허용합니다. 선택적 JSON 본문은 `{ "force": boolean }`이며, 이를 생략하면 강제 제거가 아닌(non-force) 제거를 요청합니다.

강제 제거가 아닌 요청은 동결된 런타임에 세션, 프롬프트, 대기 중인 시작, ACP 연결, 메모리 작업 또는 작업 공간 채널 워커가 있는 경우 `activity` 스냅샷과 함께 `409 workspace_busy`을 반환합니다. `{ "force": true }`을 보내면 이러한 리소스의 종료를 요청합니다. 지속성 제거는 커밋 지점입니다: 이후 정리 작업은 범위가 한정되고 최선의 노력(best-effort)으로 수행되며, 정리 실패는 기록되고 논리적 제거는 런타임을 복원하는 대신 여전히 수렴합니다. 성공적인 응답은 다음과 같습니다:

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

즉시 바쁜 상태에서의 강제 제거가 아닌 요청은 빠른 드레인 전 활동 스냅샷을 반환합니다. 드레인이 시작되면 바쁨 또는 성공 응답에는 수용(admission) 및 ACP 드레인 게이트가 닫힌 후 정리가 시작되기 전에 촬영된 최종 스냅샷이 포함됩니다. 오류에는 `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, 그리고 `503 daemon_shutting_down`이 포함됩니다.

### `GET /workspace-registrations`

이 기본(primary) 워크스페이스에 대해 영속화된 원하는 워크스페이스 집합을 나열합니다. 현재 시작 중에 저장된 디렉터리를 복원할 수 없었던 항목은 `active: false` 상태로 계속 표시됩니다. 런타임이 제거가 완료될 때까지 라이브 리소스를 여전히 소유하므로, 런타임이 드레인(drain)되는 동안 항목은 `active: true` 상태를 유지합니다. 영속 등록에 해당 정보가 있을 경우 항목에는 선택적 `displayName`이 포함됩니다.

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

등록 스토어가 구성되지 않은 경우 `501 persistence_not_available`을 반환하고, 스토어를 읽을 수 없는 경우 `500 workspace_registration_store_error`을 반환합니다.

### `DELETE /workspace-registrations/:id`

하나의 영구 등록을 삭제합니다. 이는 활성 런타임을 언로드하거나 세션을 종료하지 않으며, `restartRequired: true`은 다음 데몬 재시작 시 활성 런타임이 사라짐을 의미합니다.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

`404 workspace_registration_not_found`, `500 workspace_registration_store_error` 또는 `501 persistence_not_available`을 반환합니다. 다른 변경(mutate) 라우트와 마찬가지로, 데몬 인증이 활성화된 경우 이 엔드포인트는 변경 인증을 요구합니다.

### 읽기 전용 런타임 상태 라우트

이 라우트들은 데몬 측의 런타임 스냅샷을 보고합니다. 이들은 추가적인 v1 라우트이며, 상태를 변경하지 않고 서브 프로토콜 버전을 변경하지 않습니다. 워크스페이스 상태 라우트는 클라이언트가 GET 라우트를 폴링한다고 해서 의도적으로 ACP 자식 프로세스를 시작하지 **않습니다**. `GET /workspace/mcp`은 데몬이 유휴 상태이고 유지된 MCP 관찰 결과가 없을 때 빈 스냅샷과 함께 `initialized: false`을 반환합니다; 이전에 활성 자식 프로세스가 응답했다면, 유휴 읽기는 해당 관찰 결과를 `source: "cache"` 및 원래의 `initialized` 값으로 재생합니다. `GET /workspace/skills`는 대신 유지된 데몬 관찰 결과나 데몬 로컬 열거를 제공하며, 유지된 관찰 결과가 존재하지 않고 두 소스 모두 사용 불가능할 경우(또는 콜드 리드가 제한될 경우)에만 `initialized: false`을 **`errors` 항목과 함께** 보고합니다(재시도 가능한 가용성 문제이며, 빈 카탈로그가 아님) — [`GET /workspace/skills`](#get-workspaceskills) 참조. `GET /workspace/providers`은 워크스페이스 설정과 환경으로부터 데몬 로컬로 응답되므로 활성 ACP 자식 프로세스에 의존하지 않으며, `acpChannelLive`은 생존성을 보고합니다. 성공 경로에서 그 `initialized`은 `true`이며, 워크스페이스 설정이나 모델 구성을 해결할 수 없을 때는 `errors` 항목과 함께 `false`입니다; 데몬 로컬 프로바이더 빌더 없이 생성된 데몬은 활성 ACP 스냅샷으로 대체되며, 데몬 로컬 응답에는 런타임에 등록된 모델이 포함되지 않습니다. 세션 상태 라우트는 활성 세션을 필요로 하며, 알 수 없는 ID에 대해서는 `404 { code: "session_not_found", ... }`을 반환합니다.

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
- `session_resources` → `GET /session/:id/resources`
- `session_monitor_tool_correlation` → `GET /session/:id/tasks`의 모니터 항목에는 전사(transcript)-태스크 상관관계를 위한 `toolUseId`이 포함됩니다
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` 및 `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` 및 `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status`은 기본 워크스페이스 ACP 채널의 특정 시점(point-in-time) 생존성을 `{ channelLive: boolean }`로 보고합니다. 핸들러는 채널을 생성하지 않지만, 런타임 경로에 도달하면 지연된(deferred) 데몬 런타임을 먼저 시작할 수 있으며, 이때 구성된 시작 정책은 독립적으로 ACP를 예열(preheat)할 수 있습니다. 스냅샷은 리스가 아닙니다: 클라이언트는 세션 생성 시 채널을 재검증하거나 시작하도록 해야 합니다.

### ACP 예열

기능 태그: `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N`은 기본 워크스페이스 ACP 채널을 최선의(best-effort) 방식으로 초기화합니다. `timeoutMs`의 기본값은 5000이며, 60000 이하의 양의 정수여야 합니다. 동시 호출자와 세션 생성은 동일한 브리지 초기화를 공유합니다. 요청 타임아웃은 해당 HTTP 대기만 종료하며, 공유된 초기화를 취소하지는 않습니다.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready`은 항상 `channelLive`과 같습니다. 실시간 응답에서는 `reason`와 `error`이 생략되며, 그렇지 않은 경우 `reason`는 `timeout` 또는 `error`입니다. `durationMs`은 호출이 합류한 초기화의 전체 수명이 아닌 현재 HTTP 호출을 측정합니다. 운영상의 시간 초과나 실패 시 HTTP 200을 반환합니다. 잘못된 `timeoutMs`은 400을 반환하지만, 인증, 속도 제한 및 지연된 런타임 실패는 일반적인 응답을 유지합니다.

두 ACP 워크스페이스 경로는 모두 단수형이며 기본 워크스페이스 전용입니다. 클라이언트는 보조 워크스페이스에 대해 이를 사용하거나, 어떤 응답도 영구적인 준비 상태 보장으로 해석해서는 안 됩니다.

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

`errorKind`은 `/workspace/preflight`, `/workspace/env` 및 (향후) MCP 가드레일에서 공유되는 닫힌 열거형(closed enum)으로, SDK 클라이언트가 자유 형식 메시지를 파싱하는 대신 카테고리별로 복구 조치를 렌더링할 수 있도록 합니다. 원래의 7개 상태 리터럴은 #4175에서 나왔으며, `restore_timeout`은 세션 복원 요청을 위해 별도로 추가되었습니다. `blocked_egress`는 이그레스(egress) 프로브가 도입될 때까지 예약 상태로 남아 있습니다.

상태 페이로드에는 MCP 환경 변수 값, 헤더, OAuth/서비스 계정 세부 정보, 제공자 API 키, 제공자 `baseUrl` / `envKey`, 스킬 본문, 스킬 파일 시스템 경로, 훅 정의 또는 비밀 환경 변수 값이 노출되지 않습니다. `/workspace/env`는 허용 목록(whitelist)에 포함된 환경 변수의 **존재 여부**만 보고하며, 프록시 URL은 자격 증명을 제거하고 네트워크로 전송되기 전에 `host:port`으로 축소됩니다.

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

`discoveryState`은 `not_started`, `in_progress` 또는 `completed` 중 하나입니다. `transport`는 `stdio`, `sse`, `http`, `websocket`, `sdk` 또는 `unknown` 중 하나입니다. 발견(discovery)이 성공하면 `errors`은 생략됩니다.

관측 결과를 생성한 자식 프로세스가 살아 있는 동안 `source`은 `"live"`입니다. 데몬이 유휴 상태이고 살아 있는 자식이 이전에 응답한 경우, 응답은 `source: "cache"`와 자식의 원본 값(`initialized: true` 및 서버 목록 포함)으로 해당 관측 결과를 재생합니다. 캐시된 관측 결과는 새로운 MCP 발견이 시작될 때만 삭제되며, 자식을 회수(reaping)해도 삭제되지 않으므로 유휴 상태의 `GET /workspace/mcp`는 현재 살아 있는 자식이 제공하지 않는 카탈로그를 보고할 수 있습니다.

**MCP 클라이언트 가드레일(이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** 현재 데몬은 페이로드에 네 개의 추가 필드와 기능 범위로 제한된 예산 셀을 확장합니다:

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

`budgetMode`은 `enforce`, `warn` 또는 `off` 중 하나입니다. `clientBudget`는 예산이 설정되지 않은 경우 누락됩니다. `budgets[]`는 `mcp_guardrails`을 광고하는 데몬에서 **항상 배열**입니다(`budgetMode === 'off'`인 경우 비어 있을 수 있음); 이전 버전의 데몬은 이 필드를 완전히 생략합니다. `mcp_workspace_pool`이 광고되면 셀에는 `scope: 'workspace'`이 있으며 선택된 작업 공간 런타임의 공유 풀을 포함합니다. 해당 태그가 없는 경우, `QWEN_SERVE_NO_MCP_POOL=1` 하에서도 레거시 관리자는 `scope: 'session'`을 출력합니다. 소비자는 인식되지 않는 추가 범위 값을 허용해야 합니다(MUST).

서버별 셀의 `disabledReason`은 운영자 비활성화(`'config'` — `disabledMcpServers` 구성 목록)와 예산 거부(`'budget'` — 발견되었으나 `enforce` 모드로 인해 연결되지 않음)를 구분합니다. 거부는 `Object.entries(mcpServers)` 선언 순서에 따라 결정적입니다. 서버별 `status: 'error', errorKind: 'budget_exhausted'`은 원본 `mcpStatus: 'disconnected'`(참이지만 운영자 대상 심각도가 아님)을 가립니다.

예산 적용은 기능 기반으로 이루어집니다. `mcp_workspace_pool`이 있으면 하나의 작업 공간 런타임 내 세션이 전송 계층과 하나의 `WorkspaceMcpBudget`을 공유하며; 다른 작업 공간 런타임은 풀이나 예산을 절대 공유하지 않습니다. 태그가 없으면 각 ACP 세션의 `McpClientManager`이 상한의 자체 사본을 적용하고 스냅샷은 해당 레거시 세션 뷰를 나타냅니다.

**예산 압박 감지.** 두 가지 표면 모두 PR-14b 이후에 채워집니다:

- **푸시 이벤트**(`mcp_guardrail_events`을 통해 광고됨): `GET /session/:id/events`을 구독하고 `KnownDaemonEvent`을 통해 `mcp_budget_warning` / `mcp_child_refused_batch` 프레임을 좁힙니다. 상태 머신은 상승 75% 교차 시 한 번 발생하며(37.5% 미만에서 재장전); 거부는 `enforce` 모드에서 검색 패스당 한 번 병합됩니다.
- **스냅샷 폴링**(`mcp_guardrails`을 통해 광고됨): `GET /workspace/mcp`을 실행하고 예산 셀(`budgets[0]`)을 `mcp_workspace_pool`과 함께 검사하여 범위를 결정합니다:

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (PR 14b의 푸시 이벤트가 사용하는 히스테리시스 임계값과 일치함).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (하나 이상의 서버가 이 검색 패스에서 거부됨).
- `budgets[0].status === 'ok'` ⇔ 75% 임계값 미만이고 거부가 없음.

권장 폴링 주기: 이미 `/workspace/mcp`을 폴링하는 것과 정렬됨; 스냅샷은 저렴하며 예산 셀은 추가 검색 비용을 초래하지 않습니다. 푸시 이벤트를 구독하는 SDK 클라이언트는 여전히 긴 연결 끊김 후 상태를 위해 스냅샷의 혜택을 받습니다(SSE 재생 링 깊이는 유한함 — `--event-ring-size`, 기본값 8000 — 따라서 링의 커버리지보다 오래 오프라인인 클라이언트는 스냅샷 재동기로 폴백합니다).

### `GET /workspace/skills`

기본 및 워크스페이스 한정 인벤토리 경로는 백그라운드에서 재검증하면서 보존된 스냅샷을 즉시 반환합니다. 시작은 작업 시작부터 초당 한 번으로 제한되며, 동시 읽기 작업은 하나의 작업을 공유합니다. 따뜻한(warm) 백그라운드 재검증은 5초 후 슬롯을 해제합니다. 시간 초과는 재시도를 허용하지만 관측 결과나 ACP 작업을 취소하지는 않습니다. 차가운(cold) 읽기는 ACP의 설정된 요청 시간 초과(기본값 10초)를 준수하며, ACP를 사용할 수 없는 경우 데몬 로컬 열거로 진행합니다. 두 소스에 모두 백그라운드 마감 시간을 적용하지는 않습니다. 시작 후 1초 이내에 실패한 차가운 읽기는 해당 창구의 나머지 기간 동안 즉시 사용 불가 상태를 반환하도록 하며, 더 느린 실패는 제한 창구를 남기지 않으므로 클라이언트 자체적으로 재시도 백오프(backoff)가 필요합니다. 늦게 성공한 백그라운드 관측 결과는 재시도가 대기 중인 동안 게시될 수 있지만, 이미 게시된 더 나중에 시작된 관측 결과를 대체할 수는 없습니다. 무효화된 작업은 게시할 수 없으며, 성공했지만 무효화된 관측 결과는 여전히 원래 호출자에게 응답할 수 있습니다. 명시적 무효화는 알려진 무효 인벤토리를 폐기하고 제한(throttle)을 해제합니다. 시간 초과 전에 완료된 성공적인 ACP 예열(preheat)은 자식이 이미 살아 있는 경우에도 보존된 인벤토리를 무효화하므로, 이후 읽기에서 자식을 확인할 수 있습니다. 시간 초과 후 채널이 살아 있음을 확인한 예열도 `ready: true`을 보고합니다 — 준비 상태는 항상 `channelLive`과 같음 — 하지만 시작이 아직 불완전할 수 있으므로 보존된 인벤토리를 유지합니다. 다음 읽기는 해당 보존 데이터를 반환하며, 백그라운드 재검증은 1초 시작 제한이 허용되면 이를 대체합니다. 스킬 삭제는 스냅샷과 제한을 우회하지만 새로 열거된 카탈로그가 필요하며, 로컬 폴백을 사용하고 보존된 스냅샷으로는 절대 응답하지 않습니다. 활성화 식별 읽기는 스냅샷과 제한을 우회하며, 로컬 폴백으로 새 관측 결과를 기다리고 두 소스 모두 실패할 경우 보존된 스냅샷을 사용합니다.

보존된 데몬 관측 결과를 포함하는 인벤토리 응답에는 선택적 스냅샷 메타데이터가 추가로 포함됩니다. 직접적인 구성/런타임 상태 읽기, 세션 리소스 인벤토리 및 이전 버전의 데몬은 이를 생략합니다. 대체된 성공적인 차가운 읽기는 가능한 경우 더 최신의 보존된 스냅샷을 반환하며, 그렇지 않으면 이 메타데이터 없이 자체 캐시되지 않은 관측 결과를 반환합니다. 오류가 없는 초기화된 관측 결과만 보존된 스냅샷을 대체할 수 있습니다:

```json
{
  "snapshot": {
    "observedAt": 1792486800000,
    "ageMs": 1500,
    "stale": true,
    "refreshing": true
  }
}
```

`observedAt`은 성공적인 관찰의 Unix 밀리초 시작 시간이며, `ageMs`은 응답마다 수집 시간을 보수적으로 포함하여 재계산됩니다. `stale`는 해당 관찰이 최소 1초 이상 경과했음을 의미합니다. `refreshing`은 재검증이 공유 슬롯을 점유하는지 여부를 보고하며, 타임아웃된 관찰은 슬롯이 해제된 후에도 완료될 수 있습니다. 읽기 실패, 슬롯 타임아웃, 런타임 중지 후 재생은 타임스탬프를 갱신하지 않으며, 이후 성공적인 게시는 자체 관찰 시작 시간을 기록합니다. 클라이언트는 이 경과 시간을 표시할 수 있지만, 이는 파일 시스템 개정 번호가 아니며 모든 세션이 최신 상태임을 증명하는 것도 아닙니다. 초기화된 스냅샷이 없고 두 소스 모두 사용할 수 없는 경우(또는 콜드 읽기가 제한되는 경우), 응답에는 `initialized: false`, `errors` 항목이 포함되며 `snapshot` 메타데이터는 없습니다. 이는 재시도 가능한 가용성 부족 상태이며 빈 카탈로그가 아닙니다. 유효한 빈 카탈로그는 `initialized: true`을 가집니다. 상태 읽기는 세션에 영향을 미치는 Skill 새로고침 명령을 호출하지 않습니다. 닫히거나 드레인 중인 워크스페이스 런타임은 읽기를 거부합니다. 보존된 데이터는 자식 채널 제거에는 생존하지만 런타임 은퇴에는 생존하지 않습니다.

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
    },
    {
      "kind": "skill",
      "status": "ok",
      "name": "database-review",
      "description": "Review database changes",
      "level": "extension",
      "modelInvocable": true,
      "installedPath": "/home/alice/.qwen/extensions/alibabacloud-database-suite/skills/database-review/SKILL.md",
      "extensionName": "alibabacloud-database-suite",
      "extensionDisplayName": "Alibaba Cloud Database Suite"
    }
  ]
}
```

`level`은 `project`, `user`, `extension` 또는 `bundled` 중 하나입니다. `userInvocable`(부울, 선택 사항)은 일반 스킬의 경우 생략되며(`true`을 의미함), 수동으로 호출할 수 없는 스킬인 경우에만 `false`로 존재합니다. 이는 아래 설명된 설정 전용 Skill 토글 라우트를 제한하지 않습니다. `modelInvocable`은 독립적입니다: `false`는 스킬이 수동으로는 계속 사용 가능하지만 모델 호출에서는 숨겨짐을 의미합니다. `installedPath`은 스킬의 `SKILL.md`에 대한 기존 절대 경로입니다. 데몬은 심볼릭 링크를 별도로 해석하거나 정규화하지 않고 저장된 대로 반환합니다. 현재 데몬은 모든 스킬에 대해 이를 출력하지만, 클라이언트는 이전 v1 데몬에서 누락될 수 있음을 허용해야 합니다. 스킬 본문, 훅, `skillRoot` 및 기타 스킬 구성은 제외 상태로 유지됩니다. 발견이 성공하면 `errors`은 생략됩니다.

확장 프로그램 소유 스킬의 경우, `extensionName`은 정규화된 매니페스트 이름이며 소유자 식별자로 안전하게 사용할 수 있습니다. `extensionDisplayName`은 선택적 현지화된 표시 값이며 고유하지 않을 수 있습니다. 새로운 클라이언트는 `extensionDisplayName ?? extensionName`를 표시해야 하며, 이전 데몬은 표시 필드를 생략합니다.

반복 읽기는 마지막으로 커밋된 워크스페이스 스냅샷에서 제공되며, 주기적으로 자식의 인메모리 캐시에 대해 재검증됩니다. 정상 상태 읽기는 스킬 디렉터리를 스캔하거나 `SKILL.md` 파일을 다시 파싱하지 않지만, 콜드 데몬 로컬 폴백은 디스크에서 열거할 수 있습니다. 자식은 확장 프로그램 소스가 변경되지 않았는지 확인합니다 — 확장 프로그램 디렉터리의 `readdir`과 각 항목의 `stat`, 활성화 파일, 스토어의 활성화 상태 — 그리고 변경된 경우에만 새로고침하므로, 데몬 외부에서 설치되거나 토글된 확장 프로그램은 재검증을 통해 감지되어 해당 재검증이 게시된 후 다음 읽기에 나타납니다. 웜 읽기는 백그라운드 작업을 시작하더라도 항상 보존된 관찰 결과를 반환합니다. 안전 모드와 베어 모드는 확장을 제외하는 것과 일치하도록 이 검사를 건너뜁니다.

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

모델은 인증 유형별로 그룹화됩니다. 공급자 연결 진단은 `/workspace/preflight`의 `providers` 셀에 있으며, 환경 사전 점검은 `/workspace/preflight`와 `/workspace/env`(아래 참조)에 있습니다. 스냅샷 생성이 성공하면 `errors`는 생략됩니다.

### `GET /workspace/env`

데몬 프로세스의 런타임, 플랫폼, 샌드박스, 프록시 및 화이트리스트된 비밀 환경 변수의 **존재 여부**를 보고합니다. 항상 `process.*` 상태에서 답변합니다 — 데몬은 이 라우트를 처리하기 위해 ACP 자식을 생성하지 않으며, ACP가 실행 중이거나 유휴 상태인지 여부에 관계없이 응답은 동일합니다. `acpChannelLive` 필드는 정보 제공용으로만 사용됩니다.

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

셀 형식:

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

**마스킹 정책.** `kind: 'env_var'` 셀에는 `value` 필드가 포함되지 않으며, 클라이언트는 `present: boolean`만 볼 수 있습니다. `kind: 'proxy'` 셀은 원시 환경 변수 값을 자격 증명 마스킹(`redactProxyCredentials`)을 거친 후 `URL` 파싱을 거치므로, 전송 데이터에는 `host:port`만 포함됩니다. `NO_PROXY`은 URL이 아닌 호스트 목록이므로 마스킹을 그대로 통과합니다. 현재 나열된 비밀 환경 변수의 화이트리스트에는 `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` 및 `QWEN_SERVER_TOKEN`가 포함됩니다. 다른 환경 변수는 나열되지 않으므로, 실수로 설정된 비밀은 보이지 않게 됩니다.

### `GET /workspace/preflight`

데몬 준비 상태 검사를 보고합니다. **데몬 수준 셀**(`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`)은 항상 `process.*` 및 `node:fs`에서 채워집니다. **ACP 수준 셀**(`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)은 라이브 ACP 자식이 필요합니다 — 데몬이 유휴 상태일 때는 `status: 'not_started'` 자리표시자를 출력합니다. 이 라우트는 셀을 채우기 위해 ACP를 단독으로 생성하지 않으며, 해당 셀은 `not_started`로 폴백됩니다.

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

셀 형식:

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

`errorKind` 시맨틱스:

- `missing_binary` — 요구 사항보다 낮은 Node 버전, `QWEN_CLI_ENTRY` 누락, PATH에 ripgrep / git / npm 없음(선택적 바이너리에 대해서는 오류가 아닌 경고).
- `missing_file` — `boundWorkspace`이 존재하지 않거나 디렉터리가 아님; 누락되었거나 읽을 수 없는 파일을 가리키는 스킬 파싱 오류.
- `parse_error` — `SKILL.md` 파싱 실패, 잘못된 형식의 구성 JSON.
- `auth_env_error` — `validateAuthMethod`이 비-null 실패 문자열을 반환했거나, 공급자 해석에서 전파된 `ModelConfigError` 하위 클래스.
- `init_timeout` — 브리지에서의 `withTimeout` 거부(ACP 왕복 대기 중 실제 타임아웃). `BridgeTimeoutError` 타입 클래스로 인식됩니다. 참고: `connecting > 0`을 가진 일시적인 `mcp_discovery` `warning` 셀은 이러한 종류를 포함하지 않습니다 — 이는 일반적인 진행 중인 핸드셰이크 상태로, 실제 타임아웃과 구별됩니다.
- `restore_timeout` — 세션 로드 또는 재개가 전용 복원 예산을 초과했습니다. REST 응답은 `504`이며 재시도할 수 있습니다. 이는 자식 초기화 및 제한된 재생 윈도우 한도와 구별됩니다.
- `protocol_error` — 요청 중 채널이 닫혔거나 툴 레지스트리가 예상치 못하게 부재하여 ACP `extMethod`이 거부되었습니다.
- `blocked_egress` — PR 14 (#4175)를 위해 예약됨. PR 13에서는 `egress` 셀을 `status: 'not_started'`로 남겨둡니다.

프리플라이트 요청 처리 중 브리지가 ACP 자식에 도달하지 못하는 경우(예: 요청 중 채널 닫힘), 엔벨로프의 `errors` 배열에는 실패를 설명하는 단일 `ServeStatusCell`이 포함되며, 셀은 `not_started` ACP 자리표시자로 대체됩니다. 데몬 수준의 셀은 여전히 반환됩니다.

### `GET /workspace/tools`

주(primary) 워크스페이스의 ACP 자식이 보고한 툴 카탈로그를 반환합니다. 이는 레거시 주 워크스페이스 라우트이며, 워크스페이스 선택자가 없고 비주(non-primary) 런타임의 툴을 추론하는 데 사용해서는 안 됩니다.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": true,
  "tools": [
    {
      "name": "ReadFile",
      "displayName": "Read",
      "description": "Read a file",
      "enabled": true
    }
  ]
}
```

활성화된 ACP 자식이 없을 때, 라우트는 `200`과 `acpChannelLive: false`, 빈 `tools` 배열, 그리고 선택적 `errors` 배열에 `not_started` 항목을 포함하여 반환합니다. 예상치 못한 브리지 오류는 표준 `500` 브리지 오류 응답을 사용합니다. TypeScript SDK 메서드는 `workspaceTools()`이며, 전용 기능 태그가 없으므로 이전 데몬을 지원하는 클라이언트는 `404`을 미지원으로 취급해야 합니다.

### 워크스페이스 파일 라우트

레거시 파일 라우트는 주 워크스페이스를 통해 경로를 해석하며, `/workspaces/:workspace/...` 라우트는 선택된 런타임의 워크스페이스를 통해 경로를 해석합니다. 응답은 워크스페이스 상대 경로를 사용하며, 정상적인 성공 사례에서는 절대 파일 시스템 경로를 반환하지 않습니다. 성공적인 파일 응답에는 다음이 포함됩니다:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

파일 시스템 오류는 이 JSON 형식을 사용합니다:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

`errorKind` 값에는 `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found`, `ambiguous_text_match`이 포함됩니다.

#### `GET /file`

텍스트 파일을 읽습니다. 쿼리 매개변수: `path`(필수), `maxBytes`, `line`, `limit`, `cursor`. 데몬은 바이너리 파일을 거부합니다. 전체 스냅샷 상한인 256 KiB를 초과하는 파일은 최소 하나의 명시적 윈도우 인자(`line`, `limit` 또는 `maxBytes`)가 필요합니다. 이러한 인자가 없는 요청은 `file_too_large` 상태로 유지됩니다. 해당 윈도우는 스트리밍되며, 반환되는 UTF-8 콘텐츠는 256 KiB 상한을 유지합니다. `maxBytes`는 디코딩 후 UTF-8 응답 바이트에 항상 적용되며, 소스가 전체 스냅샷 상한 내에서 다른 지원 인코딩을 사용하는 경우에도 마찬가지입니다.

줄 오프셋은 파일 시작부터 스캔하여 해결되므로, 윈도우에 도달하기 위해 8 MiB(`MAX_TEXT_SCAN_BYTES`) 이상을 읽어야 할 경우 `file_too_large`로 거부됩니다. 더 깊은 오프셋에 직접 도달하려면 `GET /file/bytes`을 사용하십시오. 라우트가 디코딩할 수 없는 인코딩의 대용량 텍스트는 `file_too_large`가 아닌 `binary_file`을 반환합니다. 작은 윈도우로 재시도해도 도움이 되지 않으며, `readBytes`는 바이너리에 이미 적용되는 동일한 해결책입니다.

전체 스냅샷 상한 내의 파일의 경우, 응답에는 `hash`이 포함되며, 이는 `line`, `limit` 또는 `maxBytes`이 슬라이스를 반환했더라도 전체 파일의 원본 디스크 바이트에 대한 SHA-256 다이제스트입니다. 큰 부분 윈도우는 `hash`를 생략하고, 완전한 `sizeBytes`를 유지하며, `truncated: true`을 설정하고, EOF 전에 스트림이 중단되면 `originalLineCount: null`을 반환합니다.

##### `cursor` 오프셋 비용은 바이트 0부터 스캔하는 것이며 8 MiB 이상에서는 거부됩니다.

`workspace_file_read_cursor` 기능이 필요합니다. 아직 제공할 데이터가 더 있는 응답은 `hasMore: true`을 반환하며, 파일 바이트 오프셋을 도출할 수 있는 경우 `nextCursor` 토큰을 반환합니다. 이를 `cursor`으로 다시 전달하면 O(1)로 재개되며, 깊은 `line` 오프셋은 바이트 0부터 스캔하는 비용이 들고 8 MiB를 초과하면 거부됩니다.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor`과 `line`은 상호 배타적입니다(`parse_error`). 둘 다 시작점을 지정합니다. 잘못된 형식의 커서나 너무 긴 커서는 `parse_error`입니다. 파일이 교체되거나 잘린 커서는 `hash_mismatch`(409)입니다. 추가 작업은 **미완료** 커서를 무효화하지 않으며, 이것이 이 기능이 존재하는 이유입니다.

`content`은 다른 모든 읽기 작업과 마찬가지로 마지막 줄의 종료 개행 문자를 생략하므로, 페이지를 재조립하는 클라이언트는 `\n`로 연결합니다. `hasMore`는 `nextCursor`의 단순 반복이 아닙니다. `limit`로 읽은 작은 비UTF-8 파일은 더 많은 콘텐츠를 가지고 있지만 도출 가능한 바이트 오프셋이 없으므로 `nextCursor: null`와 함께 `hasMore: true`을 보고합니다. 바이트 상한이 현재 줄을 잘라내어 해당 오프셋에서 재개하면 부분 줄이 반환될 경우에도 커서는 null입니다. 짧은 줄이 많은 경우, 페이지가 바이트 상한 전에 끝나고 커서를 반환할 때까지 `limit`을 낮추십시오. 단일 거대 줄의 경우, 다음 줄을 명시적으로 요청한 후(예: 줄 1에서 시작할 때 `line=2`), 커서를 사용하여 계속하십시오. 완전한 거대 줄이 필요한 경우 `GET /file/bytes`을 사용하십시오.

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

디코딩 없이 파일에서 원시 바이트를 읽습니다. 쿼리 매개변수: `path`(필수), `offset`(기본값 `0`), `maxBytes`(기본값 `65536`, 최대 `262144`). 이 라우트는 전체 파일을 읽어들이지 않고도 대용량 바이너리 파일에 대해 제한된 윈도우를 지원합니다. 응답에는 반환된 윈도우가 전체 파일을 커버하는 경우에만 `hash`이 포함됩니다.

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

#### `GET /stat`

주 워크스페이스 경로 하나에 대한 메타데이터를 반환합니다. 쿼리 매개변수 `path`은 필수입니다.

```json
{
  "kind": "stat",
  "path": "src/index.ts",
  "type": "file",
  "sizeBytes": 128,
  "modifiedMs": 1700000000123
}
```

`type`은 `file`, `directory`, `symlink` 또는 `other`입니다. 이 라우트는 워크스페이스 파일 경계와 위에서 설명한 일반적인 파일 시스템 오류 엔벨로프를 사용합니다. TypeScript SDK 메서드는 `fileStat()`입니다.

#### `GET /list`

주 작업 공간 디렉터리를 나열합니다. 쿼리 매개변수 `path`은 필수이며, `includeIgnored=1`(또는 `true`)을 설정하면 무시 규칙과 일치하는 항목이 포함됩니다. 응답은 최대 2,000개 항목으로 제한되며, 더 많은 항목이 존재할 경우 `truncated: true`이 설정됩니다.

```json
{
  "kind": "list",
  "path": ".",
  "entries": [{ "name": "src", "kind": "directory", "ignored": false }],
  "truncated": false,
  "matchedIgnore": null
}
```

각 항목의 `kind`은 `file`, `directory`, `symlink` 또는 `other`입니다. TypeScript SDK 메서드는 `dirList()`입니다.

#### `GET /glob`

주 작업 공간 내부의 경로를 검색합니다. 쿼리 매개변수 `pattern`은 필수입니다. 선택적 `cwd`로 검색 범위를 좁힐 수 있으며, `includeIgnored=1`(또는 `true`)을 설정하면 무시된 경로가 포함되고, `maxResults`은 1에서 50,000 사이의 정수(기본값 5,000)입니다.

```json
{
  "kind": "glob",
  "pattern": "**/*.ts",
  "cwd": "",
  "matches": ["src/index.ts"],
  "count": 1,
  "truncated": false,
  "durationMs": 4
}
```

일치 결과는 작업 공간 상대 경로입니다. 잘못된 쿼리 값은 `400`을 반환하며, 작업 공간 신뢰성, 포함 관계, 경로 누락 및 예상치 못한 오류에는 일반적인 파일 시스템 오류 엔벨로프가 사용됩니다. TypeScript SDK 메서드는 `glob()`입니다.

#### `POST /file/write`

텍스트 파일을 생성하거나 대체합니다. 이는 엄격한 변경(mutate) 라우트이며, 토큰이 없는 신뢰 가능한 루프백(loopback) 주 요청은 인증됩니다. 토큰이 없으면서 신뢰 가능한 루프백 권한 없이 게이트에 도달한 주 요청은 `401 { "code": "token_required" }`을 반환합니다. 구성된 토큰 및 로컬 제어 자격 증명 실패는 이전 단계에서 단순 `401 Unauthorized`로 거부되며, `--require-auth`인 경우 전역 Bearer 미들웨어가 라우트 실행 전에 인증되지 않은 요청을 거부합니다.

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

`mode`은 `create` 또는 `replace`이어야 합니다. `create`은 기존 파일을 절대 덮어쓰지 않습니다(`409 file_already_exists`). `replace`에는 `expectedHash`이 필요하며, 해시가 없거나 형식이 잘못되면 `400 parse_error`이고, 오래된(stale) 해시이면 `409 hash_mismatch`입니다. `expectedHash`은 `sha256:`과 64자의 소문자 16진수 문자로 구성되며, 디스크상의 원시(raw) 바이트를 기준으로 계산됩니다.

`bom`, `encoding` 및 `lineEnding`를 제공할 수 있습니다. 대체 시 기본적으로 기존 파일의 인코딩 프로필이 유지되지만, 명시적 필드가 이를 재정의합니다. 바이너리 쓰기는 범위 밖입니다.

데몬은 대상 디렉터리의 랜덤 임시 파일에 쓰고, 지원되는 경우 fsync를 수행하며, `rename()` 직전에 현재 해시를 다시 확인한 후 제자리(rename)로 이동합니다. 이는 부분 파일 관찰을 방지하고 동일한 파일에 대한 데몬 기원 쓰기를 직렬화하지만, 프로세스 간 커널 비교-스왑(compare-and-swap)은 아닙니다: 최종 해시 확인과 rename 사이의 매우 짧은 시간 창(window)에서 외부 편집자가 여전히 경쟁(race)할 수 있습니다.

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

기존 텍스트 파일에 하나의 정확한 텍스트 교체를 적용합니다. 이 또한 엄격한 변경 라우트이며 `expectedHash`이 필요합니다.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText`은 비어 있지 않아야 하며 정확히 한 번만 발생해야 합니다. 일치하지 않으면 `422 text_not_found`을 반환하고, 여러 개 일치하면 `422 ambiguous_text_match`을 반환합니다. 라우트는 인코딩, BOM 및 줄 끝(line endings)을 보존하며, 원자적 rename 직전에 `expectedHash`을 다시 확인합니다.

인증된 호출자가 경로를 명시했으므로 무시된 경로에 대한 명시적 쓰기/편집이 허용됩니다. 성공 응답 및 감사(audit) 이벤트에는 `matchedIgnore: "file" | "directory" | null`이 포함됩니다.

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

#### `POST /workspaces/:workspace/directory/create`

`workspace_qualified_rest_core`과 `workspace_directory_create`, 엄격한 변경 권한 및 신뢰 가능한 활성 로컬 작업 공간이 필요합니다. 본문:

```json
{ "path": "src/new-folder" }
```

부모(parent)가 존재해야 합니다. 생성은 배타적입니다(exclusive): 기존 파일이나 디렉터리는 `409 file_already_exists`을 반환하고, 최종 심볼릭 링크는 `400 symlink_escape`을 반환합니다. 성공 시 `201 { "kind": "directory_create", "path": "src/new-folder" }`입니다. SDK 메서드는 `WorkspaceDaemonClient.createWorkspaceDirectory(path, clientId?)`입니다.

#### `POST /workspaces/:workspace/directory/delete`

동일한 엄격한 변경 및 신뢰 가능한 로컬 런타임 정책 하에서 `workspace_qualified_rest_core`과 `workspace_directory_delete`이 필요합니다. 본문:

```json
{ "path": "src/old-folder" }
```

비어 있거나 내용이 있는 디렉터리를 재귀적으로 삭제합니다. 작업 공간 루트, 일반 파일 및 최종 심볼릭 링크는 거부되며, 중첩된 심볼릭 링크 항목은 대상을 따르지 않고 제거됩니다. 대상이 없으면 `404 path_not_found`을 반환합니다. 성공 시 `200 { "kind": "directory_delete", "path": "src/old-folder" }`입니다. SDK 메서드는 `WorkspaceDaemonClient.deleteWorkspaceDirectory(path, clientId?)`입니다.

두 디렉터리 라우트 모두 선택된 작업 공간 내에서 부모를 해석하면서 어휘상 최종 이름(lexical final name)을 보존합니다. 경로는 구분자로 끝나서는 안 되며, 의심스러운 경로 패턴은 `400 path_outside_workspace`을 반환하고, 잘못된 리프(leaF) 형태는 `400 parse_error`을 반환합니다. 지원되지 않는 사용자 정의 팩토리는 `422`을 반환하며, SSH 작업 공간은 SSH 경계(boundary)에 의해 `501`으로 거부됩니다. 알 수 없거나, 사용할 수 없거나, 제거되었거나, 신뢰할 수 없는 소유자는 절대로 주(primary)로 폴백(fallback)하지 않습니다.

삭제는 영구적이며 실패 시 부분적인 삭제가 남을 수 있습니다. 동시 작성자(concurrent writer)로 인해 `ENOTEMPTY`이 발생할 수 있으며, 이는 `503 io_error`로 반환됩니다; 작성이 중단된 후 동일한 작업을 재시도하십시오. 경로별 잠금은 디렉터리를 모든 자식(child) 쓰기로부터 직렬화하지 않으며, 외부 디렉터리 교체는 휴대용(portable) 경로 기반 검사로 원자적으로 만들 수 없습니다. 명시적 무시된 디렉터리 변경은 허용되며, 해당되는 경우 감사 이벤트에 `matchedIgnore`를 주석 달고, 생성 시 `sizeBytes: 0`을 기록합니다.

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

최상위 세션의 경우 `state`은 `POST /session`, `POST /session/:id/load` 및 `POST /session/:id/resume`에서 사용되는 것과 동일한 ACP 모델/모드/구성 옵션 형태를 반영합니다. `subagent.` 접두사가 붙은 가상 세션 ID는 부모 런타임을 기준으로 해석되며 빈 `state` 객체를 반환합니다.

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

`availableCommands`은 `available_commands_update` SSE 알림에서 사용되는 것과 동일한 명령 스냅샷입니다. `availableSkills`는 스킬 이름만 나열하며, 클라이언트는 이 라우트를 통해 스킬 본문이나 경로를 기대해서는 안 됩니다.

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

이 라우트는 읽기 전용(out-of-band) 스냅샷입니다. 의도적으로 프롬프트가 아니며 세션이 스트리밍 중일 때 쿼리할 수 있습니다. 응답에는 에이전트, 셸 및 모니터 태스크 레지스트리의 화이트리스트된 메타데이터만 포함되며, 컨트롤러, 타이머, 오프셋, 대기 중인 메시지 및 원시 레지스트리 객체는 절대 노출되지 않습니다.

다른 하위 에이전트에 의해 생성된 에이전트 작업(중첩 하위 에이전트, `maxSubagentDepth`로 제한됨)에는 세 개의 선택적 계보 필드가 포함됩니다: `parentAgentId`(생성자 에이전트 작업의 `id`), `parentName`(등록 시점에 캡처되어 레지스트리에서 부모가 제거된 후에도 유지되는 생성자 에이전트의 `subagentType`), 그리고 `depth`(0부터 시작하는 실행 깊이; 0 = 최상위 세션에 의해 생성됨). 최상위 세션이 시작한 에이전트는 `parentAgentId` 및 `parentName`을 생략합니다. 클라이언트는 이 세 필드를 모두 선택 사항으로 간주하고 누락된 경우 평면 목록으로 대체해야 합니다.

### `GET /session/:id/tasks/:taskId/runtime`

하나의 셸 작업에 대한 요청 시 상세 정보입니다. `GET /session/:id/tasks`은 수명 주기 사실만 전달하며, 이 경로는 캡처된 출력 파일을 읽고 프로세스 트리를 조사하므로 열린 상세 패널은 이를 별도로 요청합니다.

ACP 메서드는 `_qwen/session/task_runtime`이며, `sessionId` 및 `taskId` 매개변수를 사용합니다. 두 전송 방식 모두 활성 세션 소유자를 확인하며, ACP는 연결이 세션을 소유해야 한다는 추가 요구 사항이 있습니다.

경로의 `taskId`은 세션 자체의 셸 레지스트리에 대해 해석되며, 호출자는 파일 경로를 전달하지 않습니다.

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "taskId": "bg_0123abcd",
  "runtime": {
    "memoryBytes": 104857600,
    "outputBytes": 65536,
    "outputModifiedAt": 1700000000000,
    "outputTail": "ready in 120ms\n",
    "outputTailTruncated": true
  }
}
```

작업을 알 수 없거나, 제거되었거나, 셸 작업이 아닌 경우 `runtime`은 `null`입니다. `memoryBytes`는 셸 프로세스 트리의 상주 세트(resident set)로, 작업이 실행 중일 때만 샘플링되며 공유 페이지는 프로세스당 한 번만 계산되고 컨테이너 샌드박스는 래퍼 프로세스만 노출할 수 있습니다. `outputTail`은 완료 알림에 사용되는 동일한 8 KiB 제한으로 상한이 정해지며, `outputTailTruncated`는 파일 중간에서 시작하는 꼬리 부분을 나타냅니다. 파일을 읽을 수 없는 경우 `outputError`이 설정되며, 성공한 부분의 필드는 여전히 존재할 수 있습니다.

### `POST /session/:id/tasks/:taskId/workflow-action`

워크플로우 실행을 제어하거나 새 실행을 시작합니다. ACP 메서드는 `_qwen/session/tasks/workflow_action`입니다.

```json
{
  "action": "run-script",
  "script": "export const meta = { name: 'daily-audit', description: 'Audits yesterday' }\nreturn await agent(args.question)",
  "args": { "question": "which tables grew?" },
  "sourceRef": { "id": "definition-7", "revision": "rev-3" }
}
```

`taskId`이 가리키는 대상은 작업에 따라 다릅니다:

| `action` | `taskId` | 실행 시작 |
| ----------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `pause`, `resume`, `retry`, `rerun` | 실행 ID | `retry` 및 `rerun` 수행 |
| `delete-history` | 실행 ID | 아니요 |
| `run-saved` | 저장된 워크플로우의 이름, 확장 프로그램의 경우 `<extension>:<name>` | 예 |
| `run-script` | 호출자가 선택한 시작 키 | 예 |

`args`, `sourceRef` 및 `script`은 `run-saved` 및 `run-script`에서만 읽힙니다. `args`은 스크립트의 `args` 전역 변수에 바인딩되며 임의의 JSON 값일 수 있습니다. `sourceRef`은 호출자의 고유 `{id, revision}`로, 실행, 저널 및 스냅샷에 기록됩니다. `script`은 소스 `run-script`이 실행하는 항목이며 필수입니다. 재시도나 재실행은 원래 실행의 고유 `args` 및 `sourceRef`을 재생하는데, 이것이 동일 실행임을 보장하는 요소이므로 이러한 필드는 제어 동작과 함께 무시됩니다.

시작된 실행은 세션 소유권 하에 있으며, 승인 프롬프트 없이 백그라운드에서 실행되고 완료 시 세션의 완료 채널로 도달합니다. 이후 다른 모든 실행과 마찬가지로 `retry`/`rerun` 대상이 됩니다.

`retry` 및 `rerun`은 데몬 재시작으로 중단된 것과 같이 `GET /session/:id/tasks`의 `isHistorical`로 복원된 실행도 허용합니다. 이 경우 실행은 스냅샷의 스크립트, `args` 및 `sourceRef`에서 다시 시작되며, 작업을 보낸 세션에 등록하고 완료 보고를 합니다. `retry`은 동일한 실행 ID 아래에서 실행 저널을 재개하며 아직 프로세스가 실행 중이지 않은 `failed` 실행에 적용됩니다. `rerun`은 종료된 실행에서 새로운 실행 ID를 시작합니다. `argsOmitted`를 포함하는 기록 항목은 보존하기에 너무 큰 `args`로 시작되었으므로 두 동작 모두 적용되지 않습니다. `args`이 보존되기 전에 작성된 스냅샷도 `argsOmitted` 또는 `argsRecorded`을 포함하지 않으므로 적용되지 않습니다. 실행의 저널은 `args` 해시로 키가 지정되므로, `args`을 기록에서 식별할 수 없는 실행을 재시작하면 아무것도 재생되지 않고 모든 에이전트가 재디스패치됩니다. 두 거절 모두 `workflow_args_unavailable`이며, `GET /session/:id/tasks`은 항목에서 이를 `argsUnavailable`로 보고하므로 클라이언트는 호출을 통해 거절을 발견하는 대신 두 동작을 숨길 수 있습니다. `argsOmitted`은 이유로서 옆에 남으며, 어떤 것인지 말하려는 클라이언트를 위한 것입니다. `args` 자체는 절대 네트워크로 전송되지 않습니다.

`run-script`은 정의 이름을 전달하지 않으므로, 실행은 스크립트 자체의 `export const meta`로 라벨링됩니다. 컴파일된 스크립트는 하나를 선언해야 하며, 그렇지 않으면 실행은 ID만 표시합니다.

응답은 시작된 실행에 대해 `{"changed": true, "status": "running", "taskId": "<runId>"}`, 효과가 있는 제어 동작에 대해 `{"changed": true, "status": "<status>"}`, 아무 일도 일어나지 않은 경우 `{"changed": false}`입니다. 워크플로우가 세션에서 사용할 수 없는 경우(비활성화, 기본 모드, 신뢰할 수 없는 폴더), 작업 공간이 신뢰할 수 없는 경우, 저장된 워크플로우 이름을 알 수 없는 경우, 실행 ID를 알 수 없는 경우, 또는 동일한 `taskId` 아래에서 다른 시작이 이미 진행 중인 경우가 해당됩니다. 중복된 시작만 제거됩니다: 하나의 `taskId` 아래에서 두 개의 동시 `run-script` 호출은 하나의 실행을 시작합니다. 그 시작이 반환되면 키가 해제되며, 첫 번째 실행이 여전히 활성 상태라도 다시 제출하면 다른 실행을 시작할 수 있습니다. 이 키는 응답 손실 후 재시도 멱등성을 제공하지 않습니다.

거부된 매개변수는 `400`(ACP에서는 `-32602`)이며, 시작된 실행이 아닙니다. `action`을 알 수 없는 경우, `script`이 없는 `run-script`, 비어 있지 않은 문자열의 `{id, revision}`이 아닌 `sourceRef`, 또는 잘못된 구문이나 결정론 위반으로 인해 시작 전에 거부된 스크립트가 해당됩니다. 워크플로우 시작 입력 오류는 `workflow_invalid_params`을 포함하고 거부 메시지를 유지합니다.

네 가지 거절은 요청이 아니라 실행의 저장된 상태에서 발생합니다. 각 거절은 ACP에서 `-32602`이며, `errorKind` 및 `data.httpStatus`를 포함합니다. 세 가지는 `409`이고, 네 번째인 `workflow_not_recorded`는 `503`입니다. 아무것도 시작되지 않았고 동일한 호출을 단순히 다시 할 수 있기 때문입니다: `retry`은 시작하기 전에 실행이 다시 실행 중임을 기록하는데, 이 기록이 다른 프로세스가 두 번째로 시작하는 것을 방지하지만 기록을 쓸 수 없는 경우입니다.

| `code` / `errorKind` | HTTP | 시기 | 수행 방법 |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `workflow_journal_unavailable` | `409` | 디스크에 저널이 없거나 읽을 수 없는 `retry` | `rerun`하여 처음부터 시작합니다 |
| `workflow_args_unavailable` | `409` | `argsUnavailable`로 표시된 기록 항목의 `retry` 또는 `rerun`: `args`이 너무 커서 유지할 수 없었거나, 스냅샷이 유지 이전 시점임 | `run-saved` 또는 `run-script`과 함께 `args`으로 다시 시작합니다 |
| `workflow_run_live_elsewhere` | `409` | 체크포인트가 종료된 것으로 확인되지 않은 프로세스(여전히 실행 중, 다른 머신에 있음, 또는 pid가 재사용됨)를 기록한 실행의 `retry` | `rerun`하여 새로운 실행 ID를 획득합니다 |
| `workflow_not_recorded` | `503` | 실행이 다시 실행 중이라는 기록을 작성할 수 없어 시작되지 않은 `retry` | 동일한 호출을 다시 수행합니다; 실행은 변경되지 않습니다 |

`workflowToolFeatures`은 `GET /session/:id/supported-commands`에서 `runSavedArgs` 및 `runScript`을 지원하며, 해당 기능이 없는 데몬은 시작 입력이나 `run-script` 작업을 허용하지 않습니다. 또한 세션의 모델이 명명된 워크플로우만 실행할 수 있는 경우(`tools.workflowNameOnly`) true인 `nameOnly`를 포함합니다: 모델 자체의 `script` 및 `scriptPath` 호출은 거부되지만, 위의 모든 작업과 `run-script`는 여전히 실행을 시작합니다. `retryHistorical`은 `retry` 및 `rerun`가 기록에서 복원된 실행을 허용할 때 true입니다; 이전 버전의 데몬은 이에 대해 `{"changed": false}`로 응답하므로, 클라이언트는 해당 항목이 보고될 때만 기록 항목에 대한 이러한 컨트롤을 제공해야 합니다.

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

`status`은 `NOT_STARTED`, `IN_PROGRESS`, `READY` 또는 `FAILED` 중 하나입니다. 선택적 `error`은 사용 가능한 경우 실패한 서버에 존재합니다. 비활성화된 LSP(베어 모드 포함)는 `enabled: false`, 0개의 카운트 및 `servers: []`와 함께 HTTP 200을 반환합니다. 설정된 서버 없이 활성화된 LSP는 `enabled: true`, `configuredServers: 0` 및 `servers: []`을 반환합니다. 클라이언트가 생성되기 전에 초기화가 실패하면 응답에 `initializationError`이 포함될 수 있으며; 활성 클라이언트가 스냅샷을 제공할 수 없으면 응답에 `statusUnavailable: true`가 포함됩니다.

이 경로는 안정적인 클라이언트 대향 필드만 노출합니다. 프로세스 ID, 스폰 인자, stderr 꼬리, 루트 URI 및 작업 공간 폴더 경로와 같은 디버그 내부 구조를 의도적으로 생략합니다.

### `GET /session/:id/resources`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/session/path",
  "skills": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "skills": []
  },
  "mcp": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "discoveryState": "completed",
    "servers": []
  }
}
```

이 라이브 세션 소유자 경로는 자체 ACP 연결을 통해 선택된 세션의 Config를 읽습니다. 프로세스 전역 또는 작업 공간 수준 상태 경로를 결합하지 않으며, 차가운 런타임을 초기화하거나, 클라이언트를 첨부하거나, 기본 작업 공간으로 폴백하지 않습니다. 알 수 없고 영구 저장된 전용 세션은 기존 `session_not_found` 응답을 반환합니다.

중첩된 객체는 정확한 `GET /workspace/skills` 및 `GET /workspace/mcp` 상태 계약을 사용합니다. 이들의 `workspaceCwd` 필드는 스냅샷을 생성한 Config를 식별하며 최상위 값과 일치합니다. 기존 마스킹 규칙은 여전히 적용됩니다: MCP 자격 증명 및 헤더, 환경 변수 값, Skill 본문 및 원시 설정은 응답에 나타나지 않습니다. MCP 인증, 풀, 작업 공간 예산 및 작업 공간 검색 오류 보강은 백업 상태가 작업 공간 소유이거나 서버 이름만으로 키가 지정되어 세션별로 키가 지정되지 않으므로 존재하지 않습니다. 선택된 세션의 자체 MCP 관리자로부터의 상태, 검색 및 회계 정보는 계속 사용할 수 있습니다.

### 독립형 세션 생명주기 (`standalone_sessions_v1`)

`/capabilities.features`에 `standalone_sessions_v1`이 포함된 경우 데몬은 전용 Conversations 런타임이 소유하는 최상위 독립형 세션을 위한 프로세스 전역 라우트 패밀리를 노출합니다. 이러한 라우트는 워크스페이스 선택자를 허용하지 않으며 절대 기본 워크스페이스로 폴백하지 않습니다. 완전한 Conversations 소유권, 런타임, 디렉터리, 생명주기 및 삭제 저널 의존성 그래프를 구성할 수 없는 직접 임베드의 경우 기능과 아래 모든 라우트가 생략됩니다.

| 라우트 | 요청 | 성공 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /standalone/sessions` | `{ "sessionId": "<UUID>", "modelServiceId"?: string, "startupConfig"?: { "modelServiceId": string, "reasoningEffort"?: ReasoningSelection }, "approvalMode"?: ApprovalMode }` | 독립형 세션, `context: { "kind": "standalone" }` 및 관리되는 프로젝트리스 출력 디렉터리를 포함한 `200`. 생성 시 프롬프트가 없습니다. |
| `GET /standalone/session-options` | 없음; 쿼리 필드가 있으면 400으로 거부됨 | `{ v, initialized, current?, approvalMode?, providers, errors? }`를 포함한 `200`; 내부 워크스페이스 경로 및 ACP 채널 상태는 생략됨 |
| `GET /standalone/sessions` | 쿼리: `cursor?`, `size?` (1-100), `archiveState?` (`active` 또는 `archived`) | `200 { sessions, nextCursor?, liveMergeFailed?, truncated? }` |
| `GET /standalone/sessions/:id` | 없음 | 로컬 생성이 진행 중일 때는 `202 { sessionId, state: "creating" }`, 그 외에는 정확한 요약을 포함한 `200`. |
| `POST /standalone/sessions/:id/load` | 기존 복원 옵션만: `historyPageSize?`, `liveReplayMode?`, `compactedReplayMode?`, `hideInheritedHistory?`, `approvalMode?`; 클라이언트 식별자는 `X-Qwen-Client-Id`에 유지됨. | `200` 복원된 독립형 세션. |
| `POST /standalone/sessions/:id/resume` | `load`과 동일한 복원 옵션. | 기록 재생 없이 `200` 복원된 독립형 세션. |
| `POST /standalone/sessions/:id/repair-directory` | 빈 본문 또는 `{}` | 검증되거나 재생성된 관리 디렉터리를 포함한 `200`. |
| `PATCH /standalone/sessions/:id/metadata`        | `{ "displayName": string }`                                                                                                                                                          | `200 { sessionId, displayName }`                                                                                                               |
| `GET /standalone/sessions/:id/export` | 쿼리: `format=html`, `format=md`, `format=json` 또는 `format=jsonl` (기본값 `html`). | 기존 내보내기 콘텐츠 유형, 파일 이름 및 본문. |
| `POST /standalone/sessions/archive`              | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { archived, alreadyArchived, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/unarchive`            | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { unarchived, alreadyActive, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/delete`               | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { removed, notFound, errors, fileCleanupPending }`                                                                                        |

`POST /standalone/sessions`이 레거시 `modelServiceId`을 포함하는 경우 응답에 `modelApplied`가 포함됩니다: `false`은 스폰 시 모델 전환 실패(`model_switch_failed` 세션 이벤트를 통해서도 표시됨)를 의미하며 세션이 에이전트 기본 모델에서 실행 중임을 나타냅니다 — 생성 자체는 여전히 성공하므로 호출자가 경고, 릴리스 또는 명시적 재시도를 할 수 있습니다.

본문은 알 수 없는 필드가 없는 JSON 객체여야 합니다. ID는 RFC UUID v1-v5 값이며 데몬은 이를 소문자로 정규화합니다. 배치 요청에는 1-100개의 문자열이 포함되며 변경 전에 검증되고 중복 제거됩니다. 배치 실패는 `{ sessionId, code, message }`로 보고되며 다른 ID에 대한 성공적인 작업은 롤백되지 않습니다. `fileCleanupPending`은 트랜스크립트 삭제가 커밋되었지만 저널 권한이 부여된 사이드카 또는 관리 디렉터리 정리는 조정을 통해 재시도해야 함을 의미합니다; 세션은 이미 논리적으로 제거되었습니다.

명시적인 독립형 트랜스크립트와 문서화된 최상위 레거시 호환성 형태만 표시됩니다. 하위 항목, Live, 프로젝트, worktree, 모호함, 읽을 수 없음 또는 삭제 저널이 기록된 레코드는 안전하게 실패합니다(fail closed). HTTP 응답이 끊어지더라도 생성은 계속됩니다; 커밋된 세션은 삭제되지 않으며 응답 클라이언트는 분리됩니다. attach로 생성을 재시도하는 대신 정확한 GET 후 load/resume로 복구하십시오.

아카이브, 아카이브 해제, 복구, 이름 변경 및 삭제는 load/resume 및 프롬프트와 동일한 세션별 생명주기 진입 허가를 공유합니다. 삭제는 트랜스크립트 unlink를 내구성 커밋 지점으로 사용하며 충돌 복구를 위해 비공개 저널과 원자적 관리 디렉터리 스테이징을 사용합니다. 복구는 트랜스크립트가 온전한 경우 디렉터리를 복원하고 트랜스크립트가 없는 경우 정리를 완료합니다; 불일치하는 식별자, 충돌하는 경로, 외부 소유자 또는 모호한 트랜스크립트는 구조화된 fail-closed 오류를 반환합니다.

### `POST /session`

선택적 `startupConfig` 계약은 [Capabilities](#capabilities)에 설명되어 있습니다. 레거시 최선 노력(best-effort) 모델 선택과 달리 시작 시 선택이 거부되면 생성이 실패합니다.

새로운 에이전트를 스폰하거나 기존 에이전트에 연결 (`sessionScope: 'single'` 하에서, 기본값).

요청:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread",
  "worktree": { "slug": "feature-a" }
}
```

| 필드 | 필수 여부 | 참고 사항 |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | 아니오 | 등록된 하나의 워크스페이스와 일치하는 절대 경로. 생략된 경우 라우트는 기본 워크스페이스로 폴백합니다 (`/capabilities.workspaceCwd`에서 확인). 일치하지 않는 비어 있지 않은 `cwd`는 `400 workspace_mismatch`을 반환합니다. `features`에 `multi_workspace_sessions`이 포함된 경우 클라이언트는 신뢰할 수 있는 `workspaces[].cwd`을 전달할 수 있습니다; 그렇지 않으면 기본 워크스페이스만 허용됩니다. 워크스페이스 경로는 `realpathSync.native`을 통해 정규화되므로 (존재하지 않는 경로에 대한 resolve-only 폴백 포함) 대소문자를 구분하지 않는 파일 시스템에서 철자에 따라 세션을 거부하지 않습니다. |
| `modelServiceId` | 아니오 | 에이전트가 라우팅할 구성된 _모델 서비스_ (백엔드 제공자 - Alibaba ModelStudio, OpenRouter 등)를 선택합니다. 생략된 경우 에이전트는 기본값을 사용합니다. 워크스페이스에 이미 세션이 있는 경우 기존 세션에서 `setSessionModel`을 호출하고 `model_switched`를 브로드캐스트합니다. 이미 바인딩된 서비스 **내에서** 모델을 선택하는 `POST /session/:id/model`의 `modelId`과는 다릅니다. `/capabilities`의 `modelServices` 배열은 구성된 서비스를 광고하기 위해 예약되어 있습니다; Stage 1에서는 항상 `[]`입니다 (에이전트의 기본 서비스가 사용되며 HTTP를 통해 열거되지 않음). |
| `startupConfig` | 아니오 | `{ modelServiceId: string, reasoningEffort?: ReasoningSelection }`; `session_startup_config`가 필요하며 새 스레드를 생성하고 요청된 선택을 확인하지만 공유 기본값을 작성하지 않습니다. 최상위 `modelServiceId` 또는 명시적 단일 범위와 혼합할 수 없습니다. |
| `sessionId` | no | 호출자가 선택한 RFC 변형 UUID v1-v5. 데몬은 이를 소문자로 정규화하며 항상 새로운 스레드 세션을 생성합니다. 이 필드를 멱등적인 attach로 간주하지 않습니다. `caps.features`에 `session_id_override`이 포함되어 있는지 확인한 후 전송하세요. 이전 버전의 데몬은 알 수 없는 필드를 무시할 수 있습니다. `null`은 생략과 동일합니다. |
| `sessionScope` | 아니요 | 세션 공유에 대한 요청별 재정의입니다. `'single'`(데몬 전체 기본값)은 동일한 워크스페이스의 두 번째 `POST /session`가 기존 세션(`attached: true`)을 재사용하도록 합니다. `'thread'`는 호출마다 새로운 별도 세션을 강제합니다. 생략하면 데몬 전체 기본값을 상속합니다. 열거형 범위를 벗어난 값은 `400 { code: 'invalid_session_scope' }`를 반환합니다. 이전 데몬(PR #4175 5 이전)은 이 필드를 묵시적으로 무시하므로, 전송 전에 `caps.features.session_scope_override`를 수행하십시오. 현재 프로덕션 환경에서 데몬 전체 기본값은 `'single'`로 하드코딩되어 있으며, #4175는 추후 `--sessionScope` CLI 플래그를 추가할 수 있습니다. |
| `worktree` | 아니요 | 사용자가 지정한 Git 작업 트리(worktree)에 새로운 스레드 세션을 생성합니다. 선택적 `slug`은 데몬의 작업 트리 이름 유효성 검사를 사용합니다. 사전 검사 `session_worktree_persistence_v1`를 수행하십시오. 클라이언트는 이전 작업 트리 형태의 응답으로부터 영구적인 격리를 추론해서는 안 됩니다. 작업 트리 생성은 연결(attach) 작업이 아니며 브랜치 생성과 결합할 수 없습니다. 이 경로는 재배치, 배타적 소유권 마커 생성, 사이드카 지속성 및 최종 런타임 생성 확인 후에만 성공을 반환합니다. |

응답:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "worktree": {
    "slug": "feature-a",
    "path": "/canonical/path/.qwen/worktrees/feature-a",
    "branch": "worktree-feature-a"
  },
  "worktreeState": "persisted-v1"
}
```

`attached: true`은 해당 워크스페이스에 이미 세션이 존재했으며 이제 이를 공유하고 있음을 의미합니다.

`worktreeState`은 인증된 작업 트리 세션에만 존재합니다. 레거시 최선 노력 복원은 `worktreeState` 없이 `worktree`을 반환할 수 있습니다. 프롬프트가 대기(parked)되지 않고 실행된(cold Part 4A restore, `suppressWorktreeContextRestore` off 상태이므로 라우트가 브리지에 지연을 요청하지 않음) 경우에도 프롬프트가 정해질 때까지 검증되지 않은 `worktree` 메타데이터를 반환합니다: 자식 프로세스는 cwd 보고 없이 활성 상태로 읽히고, 활성 프롬프트 하에서는 위치 이동이 불가능하며, 라우트는 호출자가 방금 복구한 세션을 종료하는 대신 유지합니다. 어느 응답도 영구적인 실행 루트 증명이 아닙니다. 작업 트리 격리를 요청한 클라이언트는 프롬프트 라우팅 전에 `worktreeState: "persisted-v1"`와 예상 정규화 경로를 요구해야 하며; 초기 로드는 활성 프롬프트가 정해진 후 재시도될 수 있습니다. SDK 재연결 시 응답에 여전히 `worktree` 메타데이터가 포함되는지에 따라 결과가 나뉩니다: 인증 누락 또는 경로 변경으로 인해 이를 포함하는 응답은 해당 클라이언트에 대해 종결적입니다 — 새 연결이 분리되고 프롬프트가 재시도되지 않습니다 — 반면 `worktree` 객체가 전혀 없는 응답은 치유됩니다: 클라이언트는 캐시된 작업 트리 주장을 삭제하고, 새 연결을 유지하며, 같은 호출 내에서 프롬프트를 재시도합니다. 치유는 해당 재시도를 게이트하지 않으므로, 한 턴이 더 이상 클라이언트가 인증할 수 없는 디렉터리에서 실행될 수 있습니다(클라이언트가 본 적 없는 `exit_worktree`이 일반적인 원인이며, 클라이언트는 이를 지워진 메모리 내 연관성과 구별할 수 없습니다). 따라서 격리를 인식하는 호출자는 프롬프트를 디스패치하기 전에 작업 트리 인증 자체를 다시 검증해야 합니다; 삭제된 주장은 다음 로드 또는 선택 시 해당 호출자가 자신의 신원 게이트에서 페일 클로즈(fail closed)되게 할 뿐입니다.

호출자 제공 ID는 현재 등록된 모든 워크스페이스 런타임과 아직 살아있는 모든 브리지 세대(배수 중인 대체 항목 포함) 전반에 걸쳐 고유합니다. 살아있는, 대기 중, 활성, 아카이브된 또는 작업 트리 기반 중복은 `409 session_id_conflict`을 반환합니다. 잘못된 값은 `400 invalid_session_id`을 반환하며; 사용할 수 없는 라이브 소유자 또는 지속된 상태 확인은 재시도 가능한 `503 session_id_admission_unavailable`를 반환합니다. 브리지 또는 스토리지 상태 변화 후 제한된 백오프로 재시도하십시오; `retryable`은 다른 시도가 안전함을 의미하며, 즉각적인 재시도가 성공할 것임을 의미하지는 않습니다. 다운스트림 에이전트가 다른 ID를 반환하면, 데몬은 그 고아(orphan)를 제거하고 `500 session_id_not_honored`를 반환합니다. 모호한 응답 후에는 어태치로 생성을 재시도하는 대신 알려진 ID를 로드하거나 재개하십시오.

독립적인 대화를 원하는 다중 클라이언트 통합은 각 `POST /session`에서 `sessionScope: "thread"`을 보내야 합니다. 클라이언트가 의도적으로 하나의 협업 세션을 공유하는 경우에만 기본 `single` 범위를 사용하십시오; 공유 세션은 `/daemon/status`을 통해 `runtime.activity.pendingPrompts` 및 `runtime.activity.queuedPrompts`로 볼 수 있는 하나의 FIFO를 통해 프롬프트를 직렬화합니다.

동일한 워크스페이스에 대한 동시 `POST /session` 호출은 하나의 스폰으로 **병합(coalesced)**됩니다 — 두 호출자 모두 동일한 `sessionId`을 받으며, 정확히 하나만 `attached: false`을 보고합니다. 기초 스폰이 실패하면(초기화 시간 초과, 잘못된 에이전트 출력, OOM), **병합된 모든 호출자가 동일한 오류를 수신합니다** — 인플라이트 슬롯이 해제되어 후속 호출이 처음부터 재시도할 수 있습니다.

> ⚠️ **새로운 세션에서의 `modelServiceId` 거부는 HTTP 응답에서는 조용히 처리됩니다.** 잘못된 `modelServiceId`(오타, 미구성 서비스)은 생성을 500으로 만들지 않습니다 — 세션은 에이전트의 기본 모델에서 운영 상태로 유지되므로 호출자는 모델 전환을 재시도할 수 있는 `sessionId`를 계속 받습니다(`POST /session/:id/model`을 통해). 눈에 보이는 실패 신호는 스폰 핸드셰이크와 첫 구독 사이에 발생하는 세션의 SSE 스트림의 `model_switch_failed` 이벤트입니다. **이 이벤트를 관찰해야 하는 구독자는 첫 번째 `GET /session/:id/events`에서 `Last-Event-ID: 0`를 전달**하여 링의 가장 오래된 사용 가능한 이벤트부터 재생해야 합니다(생성 응답 후 몇 ms 뒤에 구독이 도착하더라도 스폰 시점의 `model_switch_failed`을 커버합니다).

### `GET /session/:id/status`

세션을 소유한 런타임으로부터 라이브 요약을 반환합니다. 이 경로는 영구 저장된 전용 세션을 로드하지 않으며 절대 기본 런타임으로 폴백하지 않습니다. 사전 확인 `caps.features.session_status`.

```json
{
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "createdAt": "2026-09-10T08:00:00.000Z",
  "clientCount": 1,
  "hasActivePrompt": true,
  "isWaitingForPermission": false,
  "isWaitingForUserQuestion": false,
  "pendingInteractionCount": 0,
  "pendingInteractions": []
}
```

응답은 `DaemonSessionSummary` 와이어 형식입니다. 선택적 필드에는 표시 및 소스 메타데이터, `activeWorkState`, `updatedAt`, `turnError`, worktree 또는 브랜치 메타데이터 및 PR 바인딩이 포함됩니다. `404`는 라이브 소유자가 존재하지 않음을 의미합니다; 부팅 중, 드레이닝 중 또는 사용 불가능한 소유자는 폴백 대신 `503`를 반환합니다. 신뢰할 수 없는 비기본 소유자는 `403 untrusted_workspace`을 반환하며, 여러 작업 공간에 걸쳐 라이브인 ID는 `500 ambiguous_session_owner`을 반환합니다. TypeScript SDK 메서드는 `sessionStatus()`입니다.

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

응답에는 정규화된 소문자 ID가 포함됩니다. 기본 및 워크스페이스 한정 ACP 마운트는 `session/load` 및 `session/resume`을 포함하여 REST와 승인을 공유합니다. 잘못된 ID는 `data.httpStatus=400` 및 `data.errorKind="invalid_session_id"`을 사용하여 ACP `INVALID_PARAMS`를 사용하며; 충돌은 `data.httpStatus=409`을 사용하고; 사용할 수 없는 라이브 소유자 또는 지속된 상태 확인은 `data.httpStatus=503` 및 `data.retryable=true`을 사용합니다.

프롬프트를 한 번도 받지 않은 ACP 생성 세션은 영구 저장된 흔적을 남기지 않으며, 데몬은 소유 연결이 첨부된 세션이 0개일 때 이를 회수합니다. 해당 회수 이후 동일한 ID를 다시 생성할 수 있는데, 이는 연결 생명주기의 문제이지 ID 재사용이 아닙니다: 연결(또는 첨부)이 살아 있는 동안 중복 요청은 거부됩니다.

### `POST /session/:id/load`

`liveReplayMode` 및 `compactedReplayMode`은 `full`(기본값) 또는 `summary`을 허용합니다. 이들은 각각 `liveJournal` 및 `compactedReplay`을 투영하지만 저장된 기록을 변경하지는 않습니다. 페이지 선택이 필터링보다 먼저 발생하므로, 표시되는 항목 수가 `historyPageSize`보다 적을 수 있습니다. 잘못된 값은 `400 invalid_live_replay_mode` 또는 `400 invalid_compacted_replay_mode`을 반환합니다. 독립형 로드는 두 옵션 모두 허용하지만 잘못된 값을 `400 invalid_request`로 보고합니다.

ID로 영구 저장된 ACP 세션을 복원하고 SSE를 통해 이력을 재생합니다. 경로 id가 권위적이며, 본문의 모든 `sessionId` 필드는 무시됩니다. 사전 점검 `caps.features.session_load` — 이전 버전의 데몬은 이 라우트에 대해 `404`을 반환합니다.

요청:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| 필드 | 필수 여부 | 비고 |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | 아니오 | `POST /session`과 동일한 정규화 규칙을 따르며, 복원 시 더 엄격한 부재 계약이 적용됩니다: 레지스트리 항목이 없는 명시적인 `cwd`(삭제되었거나 등록되지 않음)은 호출자가 '사라진 상태'로 분류할 수 있는 영구적 부재를 나타내는 `404 workspace_not_found`을 반환하는 반면, 되돌릴 수 있는 상태(배수 처리 중, 전환 중, 차단됨)에서 항목이 존재하는 작업 공간은 여전히 `400 workspace_mismatch`을 반환합니다. 생략하면 `/capabilities.workspaceCwd`을 상속합니다. `features`에 `multi_workspace_sessions`이 포함된 경우, 호출자는 신뢰할 수 있는 등록된 `workspaces[].cwd`을 전달할 수 있으며, 신뢰할 수 없는 비주 작업 공간은 `403 untrusted_workspace`을 반환합니다. `mcpServers`은 의도적으로 여기서 허용되지 않습니다 — 데몬 전체 MCP는 설정 기반입니다(`POST /session`과 일치). |

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

`state`은 ACP의 `LoadSessionResponse`을 미러링합니다 — `models`는 `SessionModelState`이고, `modes`는 `SessionModeState`이며, `configOptions`은 `SessionConfigOption` 배열입니다. 누락된 필드는 에이전트가 결정합니다. 늦게 첨부하는 클라이언트(아래 `attached: true` 경로)는 원래 로드 호출자가 본 것과 동일한 `state` 스냅샷을 받습니다 — 데몬은 항목에 이를 캐시합니다. 런타임 변경 사항(예: `model_switched`)은 후속 첨부 응답이 아닌 SSE 스트림을 통해 전달됩니다.

`attached: true`은 세션이 이미 활성 상태였음을 의미합니다(이전 `session/load`/`session/resume` 때문이거나, 병합된 동시 호출자가 바로 앞섰기 때문).

영구 저장된 세션이 Part 4A 작업 트리를 소유한 경우, 로드/재개 시 사이드카, 정품 포함 관계 및 정확한 체크아웃 마커를 검증합니다. 유휴 상태의 하위 프로세스는 응답 전에 재배치되며, 활성 상태의 하위 프로세스는 보고된 cwd가 이미 작업 트리와 일치할 때만 인증되고, 보고된 cwd가 없거나 다른 곳에 있는 활성 상태의 하위 프로세스는 프롬프트 아래로 이동되는 대신 안전하게 실패합니다 — 단, 복원 프롬프트를 지연시킬 수 없었던 콜드 복원(`suppressWorktreeContextRestore` 꺼짐 — Channel 소유가 아닌 복원 소스인 모든 복원 — 또는 지연 API가 없는 브리지)의 경우 해당 형태는 `worktreeState` 없이 `worktree`을 반환하고 재배치되지 않으며 세션은 유지됩니다. 재배치 및 인증된 응답은 `worktree`과 `worktreeState: "persisted-v1"`를 반환합니다. 복원 측 유형화된 409 분류(`session_worktree_reset_v1`에서 광고): 세션의 사이드카에 `supersededBy` 링크가 포함된 경우 `worktree_session_superseded` — 분류는 마커 읽기 전에 각 체크아웃 소유권 잠금 하에서 해당 링크만 읽으므로, 로드 대기 중에 롤백되는 전송이 동일 데몬이 삭제 중인 세션으로 호출자를 리디렉션할 수 없습니다. 그러나 링크는 마커가 전환되기 전에 작성되므로 본문의 `replacementSessionId`은 소유권이 이동했음을 증명하는 것이 아니라 확인해야 할 리디렉션입니다: 커밋된 전송 이후 호출자는 해당 id를 로드하고 기록을 업데이트해야 하지만, 커밋 전 중단된 상태에서는 마커 소유자가 아닌 대체 항목을 지칭하며, 그 자체의 복원은 `worktree_reset_interrupted`을 반환하고 재시도된 리셋이 이를 회수하므로 — `replacementSessionId`은 해당 항목의 로드가 성공할 때까지 작업의 세션 id로 영구 저장되어서는 안 됩니다; 복원된 세션의 `supersedes` 링크와 지정된 세션의 `supersededBy` 링크가 일치하지만 마커가 이동되지 않았거나 없는 경우 `worktree_reset_interrupted` — 이전 리셋이 전송 중 충돌했으며 재시도된 리셋이 복구 수단입니다; 그리고 동의하는 링크 쌍 없이 체크아웃 마커가 없는 경우 `worktree_marker_missing` — 작업을 리셋하는 것이 복구 수단입니다. 어떤 복원 경로도 마커를 재생성하지 않으며 복원 재시도는 동일한 409를 반환하기 때문입니다. 중단된 분류가 먼저 확인되므로 동의하는 링크 쌍은 결코 `worktree_marker_missing`로 나타나지 않습니다. 유효한 복원 소스가 Channel 소유인 경우, 라우트는 Part 4A 또는 분류 불가능한 사이드카 상태에 대한 에이전트의 최선 노력 청소를 억제하여, 오래되거나 외부의 모호하거나 소유권 불일치가 있는 영구 저장 상태를 보존하고 요청을 실패시킵니다. 영구 저장된 소스 메타데이터가 우선하며, 이것이 없는 경우 로드/재개 요청이 유효한 소스를 제공합니다. 구조적으로 유효하지만 Part 4A `workspaceCwd` 필드가 없는 레거시 사이드카는 기존 최선 노력 에이전트 복원을 유지하며, 해당 경로에 의해 정리될 수 있고 `worktreeState` 없이 `worktree`을 반환할 수 있습니다. 클라이언트는 이러한 호환성 메타데이터로부터 격리를 추론해서는 안 됩니다. 이 명시적인 레거시 호환성 경우를 제외하고, 유효한 복원 소스가 Channel 소유가 아닌 세션만 라우트 검증 전에 기존 최선 노력 청소를 유지합니다. 사이드카가 없는 경우 작업 트리 인증이 제공되지 않으며, 격리를 인식하는 클라이언트는 세션을 공유 작업 공간에 재바인딩하는 대신 해당 응답을 거부해야 합니다.

**SSE를 통한 히스토리 재생.** 에이전트 측에서 `loadSession`이 처리 중일 때, 에이전트는 저장된 턴에 대해 `session_update` 알림을 발행하거나 응답 메타데이터에 대량 재생 업데이트를 반환할 수 있습니다. 데몬은 라우트 응답이 반환되기 전에 해당 이벤트들을 세션의 제한된 재생 스냅샷 윈도우에 시딩합니다. 라이브 세션의 경우 `POST /session/:id/load`는 전체 대화 기록이 아닌 제한된 윈도우(`compactedReplay`, `liveJournal`, 선택적 `lifecycleReplay`, `lastEventId`)만 보장합니다. 유휴 상태의 라이브 세션을 제한된 영구 페이지에서 새로고침할 때, `lifecycleReplay`은 메모리 내 윈도우의 `_meta.executionLifecycle` 또는 `_meta.toolLifecycle`을 포함하는 최대 1024개의 메타데이터 전용 `session_update` 프레임으로 해당 페이지를 보완합니다. 이 보완 데이터는 영구적인 생명주기 레코드와 중복될 수 있으며, 클라이언트는 이를 멱등적으로 처리해야 하고 재생된 시작이 아직 실행 중이라고 추정해서는 안 됩니다. `lifecycleReplayIncomplete: true`은 사용 불가, 저하됨 또는 잘린 메모리 내 커버리지를 보고하며, `false`는 완전한 대화 기록을 보장하지 않습니다. 이러한 선택적 필드는 별도로 저장되는 스토어가 아니며, 이전 버전의 데몬에서는 누락될 수 있습니다. 윈도우는 `--compacted-replay-max-bytes`에 의해 바이트 단위로 제한됩니다(기본값 4 MiB, 최대 256 MiB). 오래된 재생 항목이 드롭된 경우 `compactedReplay[0]`는 ID가 없는 `history_truncated` 마커입니다. 처리 중인 `liveJournal`은 `--max-journal-events`(기본값 10,000개 재생 항목) 및 `--max-journal-bytes`(직렬화된 소스 이벤트 기본값 8 MiB)에 의해 별도로 제한됩니다. 이들은 세션별 **기준** 상한선입니다. 처리 중인 턴이 이 상한선을 초과하면 데몬은 먼저 적응형 확장을 시도합니다: 모든 라이브 세션에 걸쳐 허용된 확장량이 데몬의 유효 메모리 예산의 5% 크기의 단일 데몬 전역 확장 풀에 맞을 동안, 해당 세션의 상한선을 두 배로 올립니다(세션별 하드 캡 256 MiB까지, 항목 수는 비례적으로 조정되며 남은 풀 여유 공간에 의해 제한됨). 이때 `--memory-budget-mb` 값이 전달된 경우 그 값을 사용하되 해석된 가용 메모리를 상한으로 하며, 그렇지 않으면 자동 감지된 메모리의 50%를 사용하되 `1024` MB를 상한으로 합니다. 회계는 데몬 전역으로 이루어지며, 다중 워크스페이스 데몬은 워크스페이스당 하나의 브리지를 실행하고 모두 단일 풀을 공유합니다. 성장은 필요 시에만 풀이 허용하는 범위 내에서 발생하며, 운영자가 고정시킨 `--max-journal-events` 또는 `--max-journal-bytes`는 이를 비활성화하고, 호스트의 유효 예산이 최소값인 1024 MB 미만으로 떨어지는 경우에도 비활성화됩니다(`insufficientMemory`): 이 경우 풀은 0이며 적응형 성장이 완전히 비활성화됩니다. 연속된 호환 가능한 `agent_message_chunk` 또는 `agent_thought_chunk` 소스 이벤트는 항목당 최대 256개의 소스 이벤트까지 하나의 재생 항목을 공유하지만, 도구, 속성 부여, 출처 및 개별 메시지 경계는 그대로 유지됩니다. 풀이 허용하는 확장 후에도 저널이 (확장되었을 수 있는) 상한선을 여전히 초과하는 경우 — 확장 여력이 전혀 없거나 부분적으로만 허용되는 경우 포함 — 가장 오래된 항목들이 통째로 드롭되므로(보존된 꼬리가 바이트 상한선보다 훨씬 작을 수 있음), `scope: 'live_journal'`을 포함한 `history_truncated` 마커가 앞에 추가됩니다. 이 마커의 `truncatedEvents` 및 `retainedEvents` 필드는 재생 항목 수가 아닌 소스 이벤트 수를 세며, `maxBytes` / `maxEvents` 필드는 현재 적용 중인 상한선(이미 확장되었을 수 있음)을 반영합니다. 클라이언트는 해당 마커를 상태로 렌더링하고 보존된 이벤트를 계속 적용해야 합니다. 완전한 영구 대화 기록 접근은 `GET /session/:id/transcript`를 통해 별도로 제공됩니다.

재생 윈도우 바이트 상한선은 자식 프로세스가 영구 대화 기록을 재구성한 후에 적용되며, 디스크의 JSONL 읽기를 제한하지 않습니다. 데몬 예산을 초과하는 복원은 복원 예산에서 파생된 `Retry-After`(5-120초로 클램프됨)과 `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}`를 포함하여 `504`을 반환합니다. 데몬은 아직 실행 중인 ACP 요청을 격리(fence)하고 등록 대신 늦게 도착한 세션을 정리합니다. 같은 ID에 대한 재시도는 해당 정리가 완료될 때까지 복원 예산에서 파생된 `Retry-After`(5-120초로 클램프됨)과 `reason: "awaiting_abandoned_cleanup"`를 포함하여 `409 restore_in_progress`을 반환합니다. 늦은 복원 정리가 불확실하거나, 기각된 복원이 마감일 이후에도 한 번의 완전한 복원 예산 동안 해결되지 않은 경우, 해당 워크스페이스의 새 세션은 `reason: "restore_cleanup_failed"` 또는 `"restore_settlement_overdue"`을 포함하여 `503 acp_channel_unavailable`을 반환합니다. 시간 초과된 세션 초기화는 늦게 해결되는 이전 버전의 ACP 자식에 대해 동일한 실패 시 차단(fail-closed) 승인 정책을 따릅니다: 불확실한 정리는 `reason: "new_session_cleanup_failed"`을 반환하며, 한 번의 추가 초기화 예산 동안 해결되지 않은 요청은 `reason: "new_session_settlement_overdue"`을 반환합니다. 해결 지연 상태는 늦은 실패가 해결된 직후 또는 늦은 성공이 정확한 ID 정리를 완료한 직후 즉시 해제되며, 불확실한 정리는 대신 해당 정리 실패 상태로 전환됩니다. 정리 실패 상태는 워크스페이스 채널이 소진되고 재활용될 때까지 지속됩니다. 이미 활성 상태인 세션은 어느 쪽이든 계속 사용할 수 있습니다.

**오류:**

- `404` — 영구 세션 ID가 존재하지 않음(`SessionNotFoundError`).
- `404` — 명시적인 `cwd`에 레지스트리 항목이 전혀 없는 경우(제거됨 또는 등록되지 않음) `workspace_not_found`: 이는 아래 설명된 되돌릴 수 있는 상태들과 구별되는 영구적인 부재입니다. 본문: `{ error, code: "workspace_not_found", boundWorkspace, requestedWorkspace }` — `workspaceCount` 없음. "404는 세션이 사라졌음을 의미한다"는 이전 계약을 읽은 클라이언트는 이 코드를 세션이 삭제되었다는 증거가 아니라 우회할 수 있는 라우팅 실패(예: 워크스페이스 재등록)로 취급해야 합니다.
- `400` — `workspace_mismatch` (`POST /session`와 동일한 형태), 되돌릴 수 있는 생명주기 상태 포함: 레지스트리 항목이 존재하지만 소진 중, 전환 중이거나 차단된 워크스페이스. 워크스페이스가 안정되면 재시도하십시오; 사라진 것으로 분류하지 마십시오.
- `403` — `cwd`가 신뢰할 수 없는 비주요(non-primary) 워크스페이스를 대상으로 할 때 `untrusted_workspace`.
- `503` — `session_limit_exceeded` (`--max-sessions`에 카운트됨; 처리 중인 복원도 계산에 포함됨).
- `504` — `session_restore_timeout`; 재시도 가능, 복원 예산에서 파생된 `Retry-After`(5-120초로 클램프됨) 포함, 왜냐하면 늦은 정리가 해결될 때까지 동일한 세션 ID가 격리(fenced) 상태를 유지하기 때문입니다.
- `504` — `init_timeout`; 재시도 불가능, `Retry-After` 없음, `sideEffectPossible` 없음, 격리(fence) 설치되지 않음. 채널 초기화가 복원 요청이 디스패치되기 전에(`ensureChannel` 단계) 시간 초과될 때 발생합니다. 복원이 시도되지 않았으므로 어떤 세션 ID도 격리되지 않고 대기 중인 정리가 없습니다.
- `503` — 워크스페이스 채널이 새 세션 작업을 위해 닫혀 있을 때 `acp_channel_unavailable`. `reason`는 그 이유를 설명합니다: 버려진 복원이 최종적으로 정리되지 못했을 때 `restore_cleanup_failed`; 기한 이후에도 버려진 복원이 한 번의 전체 복원 예산 동안 여전히 해결되지 않았을 때 `restore_settlement_overdue`; 공개 초기화 시간 초과 후 생성된 세션을 최종적으로 닫지 못했을 때 `new_session_cleanup_failed`; 또는 시간 초과된 초기화가 기한 이후에도 추가적인 초기화 예산 동안 여전히 해결되지 않았을 때 `new_session_settlement_overdue`. 기존 세션은 계속 사용할 수 있습니다. 둘 이상의 실행 엔진이 있는 워크스페이스 런타임에서는 이러한 격리 중 하나가 해당 엔진의 채널을 대신 격리합니다: 해당 엔진의 세션도 새 작업을 받지 않으며(프롬프트, 연속 작업, 사이드 요청, 셸 명령어, 턴 중 메시지 및 Goal 또는 워크플로 시작이 동일한 `503`를 반환함), 확정된 세션은 닫히고, 채널의 프로세스 트리가 사라질 때까지 해당 엔진의 새 세션은 계속 거부되며, 이를 확인할 수 없는 동안 `channel_exit_unverified`가 발생합니다. 여기서 `workspace_change_unacknowledged`는 채널이 세션에 영향을 미치는 워크스페이스 변경 사항(권한 규칙, 설정 재로드, Session Workflow 게이트, 모델 제공자 또는 Skills)을 확인하지 않았음을 의미합니다; 누락된 모든 변경 사항에 대한 지연된 확인이 완료되면 해당 격리는 조기에 종료됩니다. 정산 지연 상태는 지연된 실패가 정산되거나 지연된 성공이 정확한 ID 정리를 완료하면 해제됩니다. 불확실한 정리는 정리 실패 상태로 전환되며, 이 경우 워크스페이스 채널의 드레인 및 재활용이 필요합니다. 본문에는 `retryAfterSeconds`이 포함되고 헤더에는 이에 대응하는 예산 기반 `Retry-After`이 포함되어 있어 클라이언트는 일반적인 5초 주기 폴링 대신 운영 예산 규모의 백오프를 사용합니다.
- `409` — `restore_in_progress` (동일한 id에 대한 `session/resume`가 이미 진행 중이거나, 새로운 스폰이 복원이 소유한 id를 제공한 경우). 복원이 활성화되어 있는 동안 `Retry-After: 5`; `awaiting_abandoned_cleanup`로 격리된 후에는 예산 기반 힌트가 제공됩니다. 동일 작업 경쟁(동일한 id에 대한 두 개의 동시 `session/load`)은 병합됩니다 — 정확히 하나만 `attached: false`를 반환하고, 나머지는 동일한 `state`와 함께 `attached: true`를 반환합니다.
- `409` — `session_workspace_conflict` 다른 워크스페이스 런타임에 의해 동일한 세션 id가 이미 활성 상태이거나 복원 중인 경우.
- `409` — `session_archived` id가 `chats/archive/` 아래에만 존재하는 경우; `load` 또는 `resume` 전에 `POST /sessions/unarchive`을 호출하십시오.
- `409` — `session_archiving` 동일한 id에 대해 아카이브 또는 아카이브 취소가 진행 중인 경우. `Retry-After: 5`.
- `409` — `session_conflict` id가 `chats/`와 `chats/archive/` 모두에 존재하는 경우; 로드하기 전에 `POST /sessions/delete`로 세션을 삭제하십시오.

### `GET /session/:id/transcript`

활성화된 영속화된 JSONL 대화 기록에서 재구성된 id 없는 `session_update` 재생 프레임 한 페이지를 반환합니다. 사전 점검 `caps.features.session_transcript` — 이전 데몬은 이 경로에 대해 `404`를 반환합니다.

쿼리 매개변수:

| 필드 | 필수 여부 | 비고 |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | 아니요 | 이전 페이지에서 반환된 불투명한 base64url 커서입니다. 첫 페이지에서는 생략하십시오. 커서는 데몬이 발급하며 변조 여부가 검사되므로 수정 시 `400 invalid_transcript_cursor`가 반환됩니다. 이는 대화 기록 파일 식별자와 고정된 첫 페이지 바이트 크기에 바인딩됩니다. 파일을 삭제, 잘라내기, 교체하거나 아카이브하면 커서가 무효화되어 `409`가 반환됩니다. |
| `limit` | 아니요 | 페이지 내 활성 `ChatRecord`의 목표 개수입니다. 기본값은 `100`이며 최대 `500`입니다. 후방 페이지는 턴 및 도구 호출/결과 경계를 유지하기 위해 최대 `3 * limit`개의 레코드로 확장될 수 있습니다. 하나의 레코드가 여러 재생 프레임을 생성할 수 있으므로 `events.length`가 더 클 수도 있습니다. 잘못된 값은 `400 invalid_transcript_limit`를 반환합니다. |
| `direction` | 아니요 | 허용되는 유일한 값은 `backward`이며, 최신 레코드부터 페이지를 시작합니다. 첫 페이지에서 전방으로 페이징하거나 `cursor`에 고정된 방향을 계속하려면 이 매개변수를 생략하십시오. `cursor`, `beforeRecordId`, `atRecordId` 또는 `snapshot`과 함께 사용할 수 없습니다. |
| `beforeRecordId` | 아니요 | 이 레코드 id 이전에 후방 페이지를 시작합니다. 후방을 의미하므로 `direction`도 함께 보내지 마십시오. `cursor` 또는 `atRecordId`과 함께 사용할 수 없으며 `snapshot`와 짝을 이룰 수 있습니다. |
| `compactedReplayMode` | 아니요 | `full` (기본값) 또는 `summary`. 페이지 선택 후 `events`을 투영하므로 표시되는 개수가 `limit`보다 적을 수 있습니다. 저장된 기록이나 커서 선택을 변경하지 않습니다. 워크스페이스 한정 대화 기록 경로에서도 허용됩니다. 잘못된 값은 `400 invalid_compacted_replay_mode`를 반환합니다. |

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

`events`는 재생 전용 프레임입니다: `{ v: 1, type: "session_update", data: SessionUpdate }`. 이들은 EventBus id를 포함하지 않으며 응답에는 `lastEventId`가 절대 포함되지 않습니다. 이 경로를 호출해도 `/load`을 호출하지 않고, 클라이언트를 연결하지 않으며, 라이브 EventBus를 시드하지 않고, 라이브 세션을 생성하지 않으며, 현재 라이브 재생 창을 변경하지 않습니다. 활성 및 비활성화된 활성 세션 모두 자식 측 읽기 전용 상태 메서드에 의해 재구성되므로, 데몬 세션 상태를 변경하지 않으면서 동일한 워크스페이스 설정, 런타임 출력 디렉터리, 방출자(emitters) 및 `/load` 기록 의미를 사용하여 재생이 수행됩니다.

첫 페이지는 현재 JSONL 스냅샷 크기를 고정합니다. 이후 페이지는 해당 바이트 접두사만 읽으므로 페이지 1 이후의 추가 내용은 결과 집합을 변경하지 않습니다. 파일이 사라지거나, 고정된 크기 미만으로 잘리거나, 다른 inode로 교체되거나, 아카이브로 이동되면 다음 페이지는 `409`를 반환하며 클라이언트는 페이지 1부터 다시 시작하거나 사용자에게 대화 기록을 다시 열도록 요청해야 합니다.

데몬 메모리와 지연 시간을 보호하기 위해 대화 기록 인덱싱 상한을 초과하는 스냅샷은 데몬이 JSONL을 스캔하기 전에 실패합니다. 클라이언트는 `413 transcript_too_large`를 수신하며 내보내기/오프라인 처리로 대체하거나 사용자에게 오래된 기록을 줄이거나 아카이브하도록 요청해야 합니다.

재생 변환이 일부 프레임을 생성한 후 실패하면 `partial: true`와 `replayError`가 나타날 수 있습니다. 부분 응답에는 `nextCursor`가 절대 포함되지 않으므로 클라이언트는 변환되지 않은 레코드를 조용히 넘어가는 페이징을 할 수 없습니다.

**오류:**

- `400` — 잘못된 `limit`, `cursor`, `direction`, `beforeRecordId` 또는 세션 id 형식입니다. 페이징 매개변수는 상호 배타적입니다: `cursor`는 `beforeRecordId`, `atRecordId` 또는 `snapshot`과 함께 사용할 수 없으며; `snapshot`에는 `atRecordId` 또는 `beforeRecordId`이 필요하고; `atRecordId`에는 `snapshot`이 필요하며; `backward`는 커서나 어떤 레코드 앵커와도 함께 사용할 수 없습니다.
- `404` — 첫 페이지 요청 시 활성화된 영속화된 세션 id가 존재하지 않습니다.
- `409` — `/load`와 동일한 로드 가능성 검사에서 발생한 `session_archived`, `session_archiving` 또는 `session_conflict`.
- `409` — 커서가 발급된 후 파일이 삭제, 잘라내기, 교체 또는 아카이브되어 대화 기록 스냅샷을 사용할 수 없는 경우; 또한 사전 점검이 커서 요청에 대해 활성 파일을 더 이상 찾을 수 없는 경우에도 적용됩니다.
- `413` — 고정된 대화 기록 스냅샷이 데몬 인덱싱 상한을 초과할 때 `transcript_too_large`.
- `413` — 하나의 집계 레코드가 워크스페이스 한정 페이지 예산을 초과하거나 직렬화된 페이지가 응답 예산을 초과할 때 `transcript_page_too_large`.

### `GET /session/:id/export`

기본 작업 공간의 활성 영구 저장 세션 트랜스크립트를 다운로드합니다. 선택적 `format` 쿼리는 `html`(기본값), `md`, `json` 또는 `jsonl`입니다. 사전 확인 `caps.features.session_export`.

성공적인 응답은 정제된 파일 이름, `Cache-Control: no-store` 및 `X-Content-Type-Options: nosniff`을 가진 첨부 파일입니다. 콘텐츠 유형은 선택된 형식에 따라 `text/html`, `text/markdown`, `application/json` 또는 `application/jsonl`입니다. 이 경로는 영구 저장소만 읽습니다: 라이브 소유자를 해석하지 않고, ACP를 시작하지 않으며, 클라이언트를 첨부하지 않습니다. 대상이 비기본 작업 공간에 있을 수 있는 경우 아래 작업 공간 한정 경로를 사용하십시오. 잘못된 형식은 `400 invalid_export_format`을 반환합니다; 누락된 활성 세션은 `404`을 반환합니다; 아카이브된, 전환 중이거나 충돌하는 저장소는 `409`을 반환합니다. TypeScript SDK 메서드는 `exportSession()`입니다.

### `GET /workspaces/:workspace/session/:id/transcript`

선택된 등록 워크스페이스의 활성 영속 JSONL에서 단일 경로와 동일한 `DaemonSessionTranscriptPage` 프로젝션을 반환합니다. 사전 확인 `workspace_persisted_transcript`; 이 기능은 `multi_workspace_sessions`과 독립적이며 id 또는 cwd로 선택된 신뢰할 수 있는 단일 워크스페이스 기본 실행 환경에서도 작동합니다.

선택기 및 쿼리 매개변수는 기존 복수형 워크스페이스 및 트랜스크립트 규칙을 따릅니다. 신뢰할 수 있는 기본 및 보조 실행 환경과 신뢰할 수 없는 보조 실행 환경은 읽을 수 있습니다. 신뢰할 수 없는 기본 실행 환경은 `403 untrusted_workspace`을 반환합니다. 아카이브된 콘텐츠는 반환되지 않습니다.

이 워크스페이스 지정 경로의 경우 `limit`은 순방향 페이지의 최대 레코드 수입니다. 후퇴 페이지는 턴 및 도구 호출/결과 쌍이 유지되도록 최대 `3 * limit`개의 레코드까지 확장될 수 있습니다. 페이지는 4 MiB 영속 소스 예산에서 더 일찍 중단되고 연속 커서를 반환할 수 있습니다. 직렬화된 응답은 32 MiB로 제한되며 커서는 64 KiB로 제한됩니다. 재생 상태가 커서 제한을 초과하는 경우 페이지는 성공적으로 변환된 이벤트와 함께 `partial: true`, `hasMore: false`을 반환하고 `nextCursor`는 포함하지 않습니다.

순방향 페이지와 커서 페이지는 데몬 프로세스 내에서 완전히 구현됩니다. 라이브 세션의 후퇴 첫 번째 페이지는 영속 꼬리가 최신 상태인지 확인하기 위해 먼저 한 레코드 워크스페이스 브리지 플러시 장벽을 통과합니다. 이 장벽은 ACP를 시작하고 워크스페이스 설정을 로드할 수 있습니다. 영속 페이지 읽기 자체는 프로젝트 정의 에이전트나 스킬을 파싱하거나 `session-transcript-cursor-key`을 생성/복구하지 않습니다. 도구 프레임은 런타임 도구 레지스트리를 참조하지 않고 영속된 도구 이름과 설명을 사용합니다. HMAC 커서 키는 데몬 메모리에만 존재하며 워크스페이스별로 격리되고 재시작 시 회전합니다. 이전 데몬 프로세스의 커서는 `400 invalid_transcript_cursor`을 반환합니다.

### `GET /workspaces/:workspace/session/:id/export`

선택된 등록 워크스페이스의 활성 영속 세션을 첨부 파일로 내보냅니다. 사전 확인 `workspace_session_export`; `session_export` 또는 `workspace_qualified_rest_core`에서 지원을 추론하지 마세요. 선택기는 정확한 워크스페이스 id를 먼저 해석한 후 정규화 후 URL 인코딩된 절대 cwd로 해석합니다. 기본 및 보조 실행 환경 모두 신뢰할 수 있어야 합니다. 신뢰할 수 없는 실행 환경은 세션 또는 형식 검증 전에 `403 untrusted_workspace`을 반환합니다.

옵션인 `format` 쿼리는 `html`(기본값), `md`, `json` 또는 `jsonl`입니다. 본문, MIME 유형, 파일명 정리, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` 및 첨부 처리 방식은 `GET /session/:id/export`과 일치합니다. 레거시 경로는 기본 저장소에 바인딩된 상태로 유지됩니다.

복수형 경로는 기존 공유 아카이브 조정자 아래에서 선택된 워크스페이스의 활성 영속 JSONL만 읽습니다. 다른 워크스페이스 저장소를 스캔하거나, 기본으로 폴백하거나, 라이브 소유자를 해석하거나, 워크스페이스 브리지를 호출하거나, ACP를 시작하거나, 클라이언트를 연결하거나, 설정을 로드하지 않습니다. 다른 워크스페이스에만 존재하는 세션 id는 `404 { code: "session_not_found" }`을 반환하고, 아카이브된 세션은 `409 session_archived`을 반환합니다. 잘못된 형식은 `400 invalid_export_format`을 반환하며, 저장소 경쟁 조건은 기존 `session_archiving` 및 `session_conflict` 오류를 유지합니다.

### `GET /workspaces/:workspace/session/:id/archive/export`

선택된 등록 워크스페이스의 아카이브된 영속 세션을 첨부 파일로 내보냅니다. 사전 확인 `workspace_archived_session_export`; 지원 여부는 활성 내보내기 또는 복수형 핵심 기능에서 추론할 수 없습니다. 워크스페이스 선택기 해석 및 신뢰 검사는 세션 id 및 형식 검증보다 먼저 실행됩니다.

TypeScript SDK 호출자는 `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`을 사용합니다. 이 메서드는 항상 네이티브 REST를 사용하며 기존 `DaemonSessionExportResult` 첨부 프로젝션을 반환합니다.

옵션인 `format` 쿼리, 응답 본문, MIME 유형, 정리된 파일명, 캐시 정책, 보안 헤더 및 첨부 처리 방식은 활성 워크스페이스 내보내기와 동일합니다. 아카이브된 소스 JSONL은 재구성 전 256 MiB로 제한되며, 더 큰 파일은 `413 transcript_too_large`을 반환하고 `sessionId`, `snapshotSize`, `maxBytes`를 포함합니다. 활성 내보내기는 기존 크기 동작을 유지합니다.

경로는 공유 아카이브 조정자 리스 아래에서 선택된 신뢰할 수 있는 워크스페이스의 `chats/archive/<id>.jsonl`만 읽습니다. 폴백을 위해 활성 콘텐츠를 검사하거나, 다른 워크스페이스를 스캔하거나, 라이브 소유자를 해석하거나, 브리지를 호출하거나, ACP를 시작하거나, 클라이언트를 연결하거나, 설정을 로드하지 않습니다. 활성 전용 id는 `409 { code: "session_not_archived" }`을 반환하고, 누락된 id는 `404 { code: "session_not_found" }`을 반환하며, 동시에 활성 및 아카이브된 파일이 있으면 `409 session_conflict`을 반환하고, 아카이브 전환은 `409 session_archiving`와 `Retry-After: 5`를 반환합니다.

### `POST /session/:id/resume`

`geminiClient.initialize`과 동일한 `config.getResumedSessionData`, `caps.features.session_resume` 및 `unstable_session_resume` 필드를 허용합니다.

`/load`와 동일한 `cwd`, `approvalMode`, `sourceType`, `sourceId` 필드를 허용합니다. 로드 전용 재생 필드인 `historyPageSize`, `liveReplayMode`, `compactedReplayMode`은 여기서 구문 분석, 검증 또는 전달되지 않으며 조용히 무시되어 공개된 재개 요청 스키마와 일치합니다. 응답 형식도 동일하며 `state`은 ACP의 `ResumeSessionResponse`을 반영합니다. `session/load`이 진행 중일 때 발생하는 `409 restore_in_progress`(다른 `session/resume` 뒤에 있는 `session/resume`이 경쟁하면 병합됨)을 포함하여 동일한 오류 봉투를 사용합니다.

클라이언트에 렌더링된 기록이 없는 경우(콜드 재연결, 선택기 → 열기) `/load`을 사용하세요. 클라이언트가 이미 화면에 턴을 가지고 있고 데몬 측 핸들만 다시 필요한 경우 `/resume`을 사용하세요.

> ⚠️ **왜 `unstable_session_resume`이 여전히 광고됩니까?** 데몬의 HTTP 라우트와 `session_resume` 기능은 v1에서 안정적이지만, 브리지는 여전히 ACP의 `connection.unstable_resumeSession`을 호출합니다. 이전 태그는 `session_resume` 이전에 출시된 SDK가 계속 작동할 수 있도록 하기 위해만 남아 있습니다.

### `POST /session/:id/worktree-reset`

영속화된 Part 4A worktree 세션의 체크아웃 소유권을 새로운 대체 세션으로 이전합니다. 사전 점검 `session_worktree_reset_v1` — 이전 버전 데몬은 이 라우트에 대해 `404`을 반환합니다. 이 라우트는 Channel 명명된 작업 `/clear`이 파일을 폐기하지 않고 worktree 작업을 재설정하는 방법입니다: 대체 세션은 완전히 새로운 대화를 얻고, 대체된 세션은 카탈로그에 트랜스크립트를 유지하지만 다시 복원할 수 없습니다.

요청 본문(모든 필드 선택 사항):

```json
{
  "cwd": "/canonical/path",
  "modelServiceId": "service-id",
  "approvalMode": "plan",
  "sourceType": "channel",
  "sourceId": "dingtalk-main"
}
```

`cwd`은 `POST /session/:id/load`과 동일한 해석 규칙을 따르며 데몬의 기본 워크스페이스인 경우 생략할 수 있습니다. 메타데이터 필드는 worktree 생성 시와 동일한 스레드 범위 및 소스 관례로 대체 세션을 스탬핑합니다.

성공 시 이 라우트는 `200`을 반환하며, 여기에는 대체 세션의 생성 형태 응답이 포함됩니다 — 새 `sessionId`, `workspaceCwd`, `currentCwd`은 검증된 정규 worktree 경로와 동일하고, `worktree` 메타데이터 및 `worktreeState: "persisted-v1"`가 포함됩니다. 호출자는 이전 id에 대한 핸들을 버리고 이후부터 대체 id를 사용합니다; 이전 id의 후속 복원은 `worktree_session_superseded`을 `replacementSessionId`과 함께 반환하며, 클라이언트는 이를 사용하여 오래된 기록을 자가 치유할 수도 있습니다 — 단, 해당 id의 로드가 한 번 성공한 후에만 가능합니다. 분류는 사이드카 링크만으로 결정되며, 그 링크는 마커가 전환되기 전에 쓰이므로, 중단된 커밋 전 이전은 마커 소유자가 아닌 대체 세션을 반환하며, 그 자체의 복원은 `worktree_reset_interrupted`을 반환하고, 재시도된 리셋이 이를 수거합니다.

이 라우트는 `X-Qwen-Client-Id`을 읽지 않으므로, 대체 세션은 연결되지 않은 상태로 실행되지만 — 성공 응답은 등록이 없는 상태가 아닙니다. 새로운 이전은 해당 실행에 대해 소유자 스타일 `clientId`을 발행하여 대체 세션에 등록하고 본문에 보고합니다; 커밋된 이전의 멱등적 재개는 아무것도 보고하지 않습니다. 발행된 id는 연결(attachment)이 아닙니다(대체 세션의 연결 수가 변하지 않으므로, `killSession`는 `requireZeroAttaches`과 함께 여전히 연결되지 않은 것으로 인식합니다). 그러나 활성 클라이언트 등록은 정확히 데몬의 유휴 정리를 방지하는 요소입니다: 계속 사용하지 않는 id는 연결 해제하세요. 그렇지 않으면 대체 세션이 무기한 활성 상태로 남습니다 — 그리고 마커 없이 여전히 활성 상태인 대체 세션은 후속 리셋이 해체하기를 거부하는 형태입니다. 응답을 대체 세션의 식별자로 취급하고, 등록된 클라이언트가 필요한 경우 일반적인 `POST /session/:id/load` 또는 `/resume` 인터페이스를 통해 연결하세요.

이전은 worktree 복원 및 기타 리셋에 대해 체크아웃별로 직렬화되며, 두 세션 중 하나가 바쁜 상태(프롬프트 처리 중이거나 대기 중인 상호작용 있음)일 때 실행을 거부하고, 대체된 세션에 승인 장벽(admission barrier)을 설정합니다: 장벽이 활성화되어 있는 동안, 9개의 쓰기 작업이 승인 단계에서 `worktree_reset_active`으로 거부됩니다 — `POST /session/:id/prompt`, `/rewind`, `/cd`, `/branch`, `/fork`, `/shell`, `/goal`, `/tasks/:taskId/workflow-action`, `/messages/delete`. 나머지 8개는 각각 세션 cwd를 이동하거나 프롬프트 승인을 거치지 않고 그 안에서 작업을 시작하기 때문에 차단됩니다: 셸 명령어는 세션의 유효 cwd에서 실행되는데, 재배치된 worktree 세션의 경우 이는 체크아웃 자체입니다; 포크 에이전트는 그 cwd에서 도구를 실행합니다; 되감기는 그것을 기준으로 파일을 복원합니다; cd는 그것을 이동시키며, 체크아웃의 하위 디렉터리로의 이동도 포함됩니다; 브랜치는 소유권이 변동 중일 때 대체된 세션의 영속화된 히스토리를 변경하고 파생 세션을 생성합니다; 목표 `resume`은 대기열에 있는 턴을 승격시키고 연속 작업을 큐잉합니다; 메시지 삭제는 영속화된 히스토리를 재작성합니다; 그리고 워크플로우 액션은 저장된 워크플로우나 호출자가 제공한 스크립트를 실행하거나, 세션 자체의 도구 레지스트리를 통해 라이브 실행을 재시작합니다. `POST /session/:id/continue`은 열 번째 게이트가 아닙니다: 이는 승인된 연속 작업을 차단된 프롬프트 승인을 통해 진행하며, 거기서 거부됩니다. 그 목록이 전체 차단(fence)이며, 차단은 자식에게 도달하는 모든 것을 막는 것은 아닙니다 — 릴리스 및 중지 경로는 설계상 이전 중에도 사용 가능하도록 유지됩니다(작업 취소, 목표 지우기, 클라이언트 연결 해제, 세션 종료). 또한 데몬 내부의 백그라운드 알림 큐잉 — 하위 세션이 부모에게 보내는 완료 확인 신호로, 어떤 HTTP 라우트도 호출하지 않음 — 역시 차단되지 않습니다. 이는 턴을 시작하는 대신 알림을 큐잉하기 때문입니다. 이전의 마지막 단계는 대체된 세션의 클라이언트 등록을 끊고, 메모리 내 worktree 연관성을 지우며, 대체된 세션이 실제로 사라졌는지 여부를 보고합니다. 생존자 — 백그라운드 작업을 여전히 보유하여 마지막 연결 해제로 트리거되는 유휴 종료가 거부되고 연기되는 자식 — 은 덮어쓰지 않고 표면화됩니다: 데몬이 이를 로그하고, 장벽은 남은 유일한 차단으로서 해당 항목에 활성화된 채로 유지되며, `200` 본문은 `supersededSessionLive: true`을 포함하므로 호출자는 대체된 id가 여전히 활성 상태이고 방금 소유권이 이동된 체크아웃 내에서 재연결 가능하다는 것을 알 수 있습니다. 충돌 안전성은 윈도우별로 적용되며, 쓰기 순서가 윈도우를 정의합니다: 먼저 이전 사이드카의 `supersededBy` 링크가 쓰이고, 그 다음 `supersedes`를 포함하는 대체 세션의 사이드카가 쓰이며, 마지막으로 마커가 전환됩니다. 따라서 전환 전 충돌은 재시도가 구별할 수 있는 세 가지 형태 중 하나로 이전 세션을 권위 있게 남깁니다 — 링크가 전혀 없는 경우(대체 세션은 일반 고아이며 재시도는 단순히 새로운 이전을 시작함), 뒤쪽 링크만 있고 대체 세션의 사이드카가 누락된 경우(재시도는 `worktree_reset_invalid_state`으로 안전하게 실패하고 운영자 복구를 위해 중단된 상태를 그대로 둠), 또는 두 링크 모두 존재하는 경우(재시도는 부분적인 이전을 롤백하고 새로운 이전을 완료합니다 — 단, 클라이언트가 아직 연결되어 있어 중단된 대체 세션을 제거할 수 없는 경우, 롤백은 `worktree_reset_invalid_state`로 안전하게 실패하고 두 링크를 유지하므로, 해당 클라이언트가 사라진 후 후속 재시도가 수렴합니다). 전환 후 충돌은 대체 세션을 권위 있게 남기고 재시도는 노오퍼레이션(no-op)으로 재개됩니다. 이전 세션은 절대 삭제되지 않으며, worktree 체크아웃은 리셋에 의해 절대 제거되지 않습니다.

**오류:**

- `404` — 세션 레코드가 존재하지 않을 때 `session_not_found`.
- `409` — 세션에 유효한 Part 4A 사이드카가 없을 때(worktree 세션이 아님) `worktree_reset_unsupported`.
- `409` — 이전에 관련된 세션이 바쁠 때 `worktree_reset_active`; 안정화된 후 재시도하세요. 장벽이 커버하는 모든 쓰기 작업 — 프롬프트, 되감기, cwd 변경, 브랜치, 포크, 셸 명령어, 목표 제어, 또는 워크플로우-태스크 액션 — 의 승인은 이전 중인 세션에서 동일한 코드로 실패합니다.
- `409` — `worktree_reset_invalid_state`은 손상된 사이드카, 잘못된 마커, 포함 관계 실패 또는 일관성 없는 대체 링크 쌍에 대해 반환됩니다. 이 요청이 시작한 작업에는 비파괴적입니다: 이 요청이 시작한 부분적 전송은 호출자가 보기 전에 롤백되지만, 페일 클로즈(fail-closed) 재개 분기들—잘못된 마커, 일치하지 않는 대체 링크 쌍(대체 사이드카가 없는 후방 링크 포함), 모호한 마커 소유자, 그리고 마커가 부재한 상태에서 이 데몬에서 아직 활성 상태인 대체 항목—은 운영자 복구를 위해 기존 중단 상태를 그대로 유지하므로 해당 형태가 이후 리셋 또는 복원 시에도 계속 표시됩니다. 이러한 상태 중 하나에 대한 재시도는 해당 상태를 다시 읽고 동일한 409를 반환합니다: 수렴하지 않으므로 재시도 루프 대신 운영자 복구가 필요합니다. 구체적인 이유는 와이어 대신 데몬 로그에 기록됩니다.
- `500` — 페일 클로즈(fail-closed) 내부 오류(예: 리셋 지원이 없는 브리지 또는 롤백 후 재배치 거부); 그대로 재시도할 수 없습니다. 한 가지 `500`은 종류가 다릅니다: 자체 커밋 후 꼬리(tail)가 플립(flip)이 영구적으로 커밋된 _후에_ 실패한 마커 전송은 소유권이 이동되었음을 보고하며, 파괴적인 롤백을 실행하지 않고, 리셋을 재시도하여 복구하는데 이는 커밋된 전송을 멱등적으로(idempotently) 재개합니다.

### `GET /workspace/:id/session-info` and `GET /workspaces/:workspace/session-info`

페이지네이션된 세션 목록 경로를 변경하지 않고 선택된 워크스페이스의 집계된 영속화된 세션 수를 반환합니다:

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

`active`, `archived`, `total`는 사용자가 볼 수 있는 로컬 JSONL 세션을 계산합니다; 내부 데몬 호스트 세션과 워크스페이스 에이전트 태스크 세션(`sourceType` `agent-host` 및 `agent`)은 이러한 계산과 모든 세션 목록에서 제외됩니다; 사용자는 여전히 ID로 에이전트 세션을 열 수 있습니다. `live`은 일치하는 사용자가 볼 수 있는 메모리 내 브리지 수이며, 등록된 신뢰할 수 없는 보조 워크스페이스의 경우 생략됩니다. 왜냐하면 해당 영속화 전용 읽기는 라이브 상태를 쿼리해서는 안 되기 때문입니다. `expensive`은 항상 `true`이고 `cost`은 항상 `"disk_scan"`입니다; 클라이언트는 이 엔드포인트를 폴링(poll)하기보다 드물게 호출해야 합니다. 스캔이 안전 한도에 도달하거나 모든 후보 파일을 분류할 수 없는 경우, 응답에 `"truncated": true`이 추가되고 영속화된 수는 하한(lower bounds)이 됩니다. 저장소가 없으면 영속화된 수는 0으로 반환됩니다. 복수형 경로는 복수형 세션 카탈로그와 동일한 워크스페이스 선택기와 신뢰 정책을 사용합니다; 신뢰할 수 없는 주(primary)는 여전히 `403 untrusted_workspace`를 반환합니다.

TypeScript 데몬 SDK는 `workspaceById(...)` 또는 `workspaceByCwd(...)`을 통해 복수형 경로를 노출하며, 그 뒤에 `getWorkspaceSessionInfo()`가 따릅니다.

### 워크스페이스 세션 아티팩트 라이브러리

`workspace_artifact_library`은 추가로 워크스페이스 전체 쿼리 및 일괄 작업을 지원합니다:

| 메서드 | 경로 | 입력 |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/artifact-library` | 워크스페이스 내의 모든 활성, 언로드된(unloaded) 및 아카이브된 세션 |
| POST | `/workspaces/:workspace/artifact-library/query` | `{ "sessionIds": ["session-id"] }` |
| POST | `/workspaces/:workspace/artifact-library/delete` | `{ "artifacts": [{ "sessionId": "session-id", "artifactId": "artifact-id" }] }` |

두 POST 본문 모두 1~100개의 항목을 포함하는 엄격한 객체입니다. 중복 ID나 쌍은 한 번만 처리됩니다. 쿼리 응답은 `{ "v": 1, "sessions": [<session artifact envelope>], "errors": [<member error>] }`입니다. 각 구성원 오류에는 `sessionId`, `status`, `code`, `message`가 포함됩니다. 전체 검색에서는 부재하거나 외부 세션을 생략하지만 명시적 쿼리는 이를 보고합니다. 다른 구성원 실패는 명확하게 유지되며 성공한 세션은 반환됩니다.

`workspace_artifact_library_stream`을 사용하면 모든 아티팩트 라이브러리 세션 봉투(기존 단일 세션 GET 포함)에 다음이 추가로 포함됩니다:

```json
{
  "session": {
    "displayName": "Task title",
    "createdAt": "2026-10-26T00:00:00.000Z",
    "archiveState": "archived",
    "sourceType": "scheduled_task",
    "sourceId": "task-id"
  }
}
```

`displayName`과 `sourceId`은 선택 사항입니다. `createdAt`는 재개 후에도 원래 세션 생성 시간이며 아티팩트 타임스탬프가 아닙니다. `archiveState`은 `active` 또는 `archived`입니다. 소스 유형은 열린 문자열이며 누락된 귀속 정보는 `default`이 됩니다. `resource_inspection`과 같은 소스는 클라이언트가 이를 명시적으로 제외할 수 있도록 보존됩니다. 소스 ID는 원래 소스 유형과 짝을 이룹니다. 이름은 현재 라이브 제목이나 영구 저장된 사용자 지정 제목/첫 프롬프트를 따릅니다. 일반적인 `/session/:id/artifacts` 응답은 변경되지 않습니다.

전체 GET 및 선택된 세션 POST도 `Accept: text/event-stream`을 허용합니다. 해당 협상이 없으면 위의 JSON 응답을 반환합니다. POST에는 fetch 기반 스트리밍을 사용하십시오. 이전 데몬에서는 기능 및 응답 콘텐츠 유형을 확인하십시오. 유한 SSE 시퀀스는 다음과 같습니다:

| 이벤트 | 데이터 |
| --------------- | -------------------------------------------------------------------------------- |
| `start`         | `{ "v": 1, "total": <candidate sessions> }`                                      |
| `session` | `session`을 포함한 하나의 완전한 아티팩트 라이브러리 엔벨로프 |
| `session_error` | `{ "v": 1, "sessionId": "...", "status": 404, "code": "...", "message": "..." }` |
| `complete`      | `{ "v": 1, "total": 10, "succeeded": 8, "failed": 1, "skipped": 1 }`             |
| `error` | 치명적인(fatal) `{ "v": 1, "status": 503, "code": "...", "message": "..." }` |

결과는 완료 순서대로 도착하며 최대 4개의 동시 세션 읽기가 가능합니다. 느린 세션이 다른 워커를 차단하지 않습니다. JSON은 선택 순서를 유지합니다. 전체 쿼리의 부재/외부 세션은 `skipped`으로 계산되며 명시적 쿼리 실패는 `session_error`을 발생시킵니다. `total`는 후보 수를 계산하며 아티팩트를 계산하지 않습니다. `complete`만 스캔 완료를 표시합니다. `complete` 없이 치명적인 `error` 또는 연결 끊김은 부분 결과를 의미하며 재생 커서, 자동 재연결 또는 구독이 없습니다. 대기 중에 하트비트 주석이 발생할 수 있습니다. 초기 실패는 일반 HTTP 상태 코드를 사용하며 SSE 헤더 이후 치명적 오류는 스트림 이벤트입니다. 연결이 끊긴 요청은 새 읽기 디스패치를 중단하며 이미 실행 중인 공유 캐시 로드는 완료될 수 있습니다. 백프레셔는 대기 중인 결과 프레임을 제한하고 클라이언트를 기다리는 동안 아카이브 장벽을 유지하지 않습니다.

일괄 제거는 `{ "v": 1, "results": [...] }`을 반환합니다. 각 결과에는 `sessionId`과 `artifactId`가 포함되며 기존 변형 봉투(`v`, `changes`, 선택적 `warnings`/`warningDetails`) 또는 `error: { status, code, message }` 중 하나가 포함됩니다. 누락된 아티팩트는 멱등성 빈 변경 사항입니다. 클라이언트는 모든 결과와 영구 저장 경고를 확인해야 하며 200 일괄 응답이 모든 구성원이 성공했음을 의미하지는 않습니다. 제거는 세션별로 그룹화되며 세션 간 트랜잭셔널하지 않고 실제 파일을 보존하며 단일 아티팩트 제거와 동일한 엄격한 운영자 권한이 필요합니다. 잘못된 입력은 400 `invalid_artifact_library_request`을 반환하며 워크스페이스 수준 오류는 일반 HTTP 상태 코드를 유지합니다.

라이브 아티팩트와 제목은 브리지에서 가져오며 제한된 영구 저장된 신원 메타데이터는 원래 생성 시간과 소스 귀속 정보를 보존합니다. 빈 결과를 포함한 언로드된 메타데이터는 직렬화된 크기 예산 32 MiB로 런타임별 캐시에 저장됩니다. 변경되지 않은 파일은 반복 쿼리나 TTL 이후에 재생되지 않습니다. 전사본 및 소유권 메타데이터 신원은 매 읽기 시 확인되며 변경된 항목은 재구축됩니다. 후보 검색은 디렉터리 신원으로 캐시되며 디렉터리 타임스탬프가 변경되지 않더라도 완료된 스캔 후 최소 2초가 지난 첫 쿼리에서 갱신됩니다. 이 파일 이름 전용 갱신은 변경되지 않은 아티팩트 캐시를 보존합니다. 동시 콜드 읽기는 로드를 공유하며 각 요청은 한 번에 최대 4개의 세션을 처리합니다. 승인된 변경되지 않은 항목은 유지되지만 예산을 초과하는 새 결과는 캐시되지 않은 상태로 반환되어 반복적인 전체 스캔이 전체 캐시를 축출하지 않도록 합니다. 이러한 캐시되지 않은 세션이나 데몬 재시작은 재구축이 필요합니다. 이는 캐시된 항목에 대한 반복적인 JSONL 파싱을 피하지만 파일 시스템 검사와 응답 크기는 여전히 워크스페이스에 따라 확장됩니다. 콜드 파일 가용성은 기존 메타데이터 전용 의미를 유지합니다.

기존 단일 세션 아티팩트 라이브러리 GET은 전체 및 일괄 쿼리와 이 동일한 캐시를 공유하며 응답에 `session` 요약만 추가하고 기존 오류 형식을 유지합니다. 한 라우트를 예열하면 다른 라우트에 도움이 되며 단일 및 일괄 제거는 공유 항목을 무효화합니다. 제목 전용 전사본 추가 및 아카이브 이동도 메타데이터를 갱신하며 라이브 제목은 디스크 영구 저장을 기다리지 않고 매 요청 시 읽습니다. 라이브 영구 저장 메타데이터와 콜드 봉투는 동일한 32 MiB 예산을 공유하며 라이브/콜드 전환은 항목을 재구축합니다. 캐시된 봉투의 `generatedAt`은 투영 생성 시간입니다.

`session_artifact_library`은 다음 영구화 워크스페이스 범위 엔드포인트를 제공합니다:

| 메서드 | 경로 | 결과 |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/session/:id/artifact-library` | 로드되지 않은 세션과 아카이브된 세션의 영구화된 등록 정보를 포함하는 세션 아티팩트 엔벨로프. |
| DELETE | `/workspaces/:workspace/session/:id/artifact-library/:artifactId` | 아티팩트 변경 결과. 이미 존재하지 않는 등록 정보는 `changes: []`를 반환합니다. |

워크스페이스 선택자는 신뢰할 수 있는 런타임으로 해석됩니다. 두 경로 모두 아티팩트에 접근하기 전에 모호한 라이브 소유자와 다른 런타임의 라이브 소유자를 거부합니다. 이들은 내부 런타임 활동 장벽에 참여하며, 읽기는 공유 세션 아카이브 장벽을, 제거는 이를 독점적으로 보유합니다. 어느 경로도 에이전트를 로드하거나 세션을 아카이브 해제하지 않습니다. 삭제는 엄격한 변경 게이트를 통해 데몬 연산자 권한이 필요하지만 `X-Qwen-Client-Id`는 필요하지 않습니다. 기존 클라이언트 소유 아티팩트 엔드포인트는 자신의 권한 부여 규칙을 유지합니다.

콜드 읽기는 영구화된 아티팩트 레코드를 재생하고 워크스페이스 상대 `workspacePath`, `managedId` 또는 `url` 같은 메타데이터와 로케이터를 반환합니다. 기록된 타임스탬프를 보존하고 성공적인 영구화를 사용할 수 없음을 표시하지 않고 아티팩트별 호환성 경고를 보고합니다. `limits.maxArtifacts`은 라이브 스토어의 등록 제한을 설명하며; 콜드 투영은 해당 제한을 강제하기 위해 역사적 등록 정보를 비우지 않습니다.

콜드 삭제는 내구성이 있는 명시적 툼스톤을 추가합니다. 워크스페이스 파일을 보존하고 기존 최선 노력 정리 기능을 사용하여 참조되지 않는 데몬 관리 웹 미리보기 스냅샷 참조를 해제합니다. 라이브 삭제는 영구화가 실패할 경우 HTTP 200과 `changes: []`, `warnings` 및 `warningDetails`를 반환할 수 있습니다. 호출자는 결과를 검사하고 등록 정보를 유지해야 합니다. 콜드 쓰기 실패는 오류로 반환됩니다.

두 경로 모두 아티팩트 영구화가 비활성화된 경우 `409 artifact_library_unavailable`를 반환합니다. 알 수 없는 세션은 `404 session_not_found`를 반환하며; 외부 프로젝트 저장소는 찾을 수 없음으로 처리되고, 모호하거나 일반적이지 않은 저장소는 `409 session_storage_conflict`를 반환합니다. 불완전한 대화 레코드나 권위 없는 변경 저널은 동시 작성자의 `session_transcript_changed`와 구별되는 `409 session_transcript_corrupt`를 반환합니다. 64 MiB를 초과하는 읽기는 413을 반환합니다. 콜드 관리 실행 변경은 `409 artifact_mutation_requires_managed_authority`를 반환합니다. 기존 워크스페이스 소유권 및 생명주기 오류 응답도 적용됩니다.

### `GET /workspace/:id/sessions` and `GET /workspaces/:workspace/sessions`

정규화된 워크스페이스가 `:id` 또는 `:workspace`과 일치하는 세션 목록을 반환합니다. 경로 매개변수는 먼저 정확한 워크스페이스 ID로 해석되며, 그 다음 URL 인코딩된 절대 cwd로 해석됩니다. 기본(primary) 워크스페이스는 기존에 영속화된(persisted)/라이브(live) 병합을 포함합니다: 기본 목록은 `chats/`의 활성 세션입니다; `archiveState=archived`을 전달하면 `chats/archive/`에서 아카이브된 세션을 나열합니다. 신뢰할 수 있는(trusted) 비기본(non-primary) 워크스페이스는 자체 `chats/` 저장소의 활성 영속화 세션을 포함하며 중복 없이 일치하는 라이브 요약을 병합합니다; 활성 영속화 세션이 없는 경우 라우트는 이전의 라이브 전용 커서 동작을 유지합니다. 신뢰할 수 있는 비기본 워크스페이스는 또한 `archiveState=archived`, 정리된(organized) `view=organized` 목록 및 `group` 필터를 지원하며, 자체 `chats/`, `chats/archive/` 및 세션 조직화(session-organization) 저장소에서 읽습니다; 결합된(combined) `view=organized&archiveState=archived` 쿼리는 라이브 병합 없이 아카이브된 세션만 반환합니다. 등록된(unregistered) 신뢰할 수 없는(untrusted) 비기본 워크스페이스는 동일한 목록, 필터 및 페이지네이션 형식을 지원하지만 영속화된 항목만 반환합니다: 데몬(daemon)은 라이브 브리지를 조회하지 않으며 런타임에서 대기 중인 상호작용(pending interactions), 턴 오류(turn errors) 또는 클라이언트 상태를 채우지 않습니다. `clientCount: 0` 및 `hasActivePrompt: false`과 같은 영속화된 기본값은 와이어 호환성(wire compatibility)을 위해 계속 존재합니다. 저장소가 없는 경우 빈 목록을 반환합니다. 복수형(plural) 라우트는 여전히 신뢰할 수 없는 기본 워크스페이스에 대해 `403 { code: "untrusted_workspace" }`을 반환합니다; 레거시 기본 라우트는 기존 호환성 동작을 유지합니다. `archiveState=all`은 v1에서 지원되지 않습니다. 기본 및 영속화 기반 목록은 기존 숫자 `cursor` 시맨틱(semantics)을 유지합니다; 영속화가 없는 신뢰할 수 있는 비기본 라이브 폴백(fallback)은 기존 불투명(opaque) 라이브 커서를 유지합니다.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

`workspace_qualified_rest_core`이 광고(advertised)되면, 워크스페이스 범위의 세션 배치(batch) 작업, 그룹 CRUD 및 세션 조직화 변경(mutation)이 `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups` 및 `/workspaces/:workspace/session/:id/organization` 하에서 사용 가능합니다. 신뢰할 수 없는 보조(secondary) 워크스페이스의 경우 그룹 GET은 계속 사용 가능하지만; 모든 그룹, 세션 및 조직화 변경은 신뢰도(trust) 게이트(gated)가 적용됩니다. 워크스페이스가 없는 배치 및 조직화 변경 라우트는 호환성을 위해 기본 워크스페이스 전용으로 유지됩니다.

쿼리 매개변수:

| 필드 | 필수 여부 | 참고 사항 |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | 아니오 | `active` (기본값) 또는 `archived`. 다른 값은 `400 { code: "invalid_archive_state" }`을 반환합니다. |
| `cursor` | 아니오 | 이전 응답의 페이지네이션 커서. |
| `size` | 아니오 | 페이지 크기. 잘못된 값은 `400 { code: "invalid_cursor" }` 또는 기존 페이지 크기 유효성 검사를 반환합니다. |
| `view` | 아니오 | 레거시 최근(recent) 목록의 경우 생략하십시오. `organized`은 서버 측 고정(pinned)/그룹 정렬을 선택하고 선택적 조직화 필드를 추가합니다. 다른 값은 `400 { code: "invalid_session_view" }`을 반환합니다. |
| `group` | 아니오 | `view=organized`과 함께 사용할 때만 의미가 있습니다. `all` (기본값), `pinned`, `ungrouped` 또는 사용자 정의 그룹 ID. 알 수 없는 그룹 ID는 `404 { code: "group_not_found" }`을 반환합니다. |

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

`view=organized`이 있으면 데몬은 `<Storage.getProjectDir(cwd)>/session-organization.v1.json`을 읽고, 고정된(pinned) 세션을 먼저 반환한 다음 활동 시간(activity time) 내림차순으로 정렬하고, 안정적인 동률(ties)의 경우 `sessionId`을 사용합니다. 정리된(organized) 커서는 불투명한 base64url JSON이며 레거시 최근 목록과 재사용되어서는 안 됩니다. `pinned`은 가상(virtual) 필터이며 그룹이 아닙니다. `groupId: null`은 그룹화되지 않음(ungrouped)을 의미합니다. 아카이브된 세션은 조직화 메타데이터를 유지하지만 `archiveState=archived&view=organized`은 여전히 아카이브된 세션만 반환합니다.

활동 순서(cursor) 기반 커서 — 정리된 뷰와 `parentSessionId` / `sourceType` 필터링된 목록 — 는 스냅샷 격리(snapshot-isolated)되지 않으며, 신뢰할 수 있는 활성 목록은 트랜스크립트 mtime과 라이브 활동 워터마크(watermark) 중 더 늦은 시간으로 행(row)을 정렬합니다. 라이브 워터마크는 메모리에만 존재하므로, 두 페이지 가져오기(fetches) 사이에 라이브 항목이 종료(retires)되면 세션의 키(key)가 mtime으로 후퇴(regress)할 수 있습니다. 커서는 이를 보상합니다: 이미 라이브 파생 키(live-derived key)에서 방출(emitted)된 식별자(identities)를 보유하며 — 행이 페이지 컬렉션에 없을 동안 및 고정 상태 전환(pin flip)으로 인해 다시 허용될 수 있는 동안에도 — 패스(pass)의 나머지 부분에서는 이를 제외합니다. 따라서 라이브 파생 키 이동은 패스당 세션을 최대 한 번만 반환합니다. 이 보장은 보유(carry) 범위로 한정됩니다: 64개의 식별자로 제한되며(하나의 패스에서 초과되는 식별자는 오류 대신 최대 한 번의 중복(at-most-once duplicate)으로 저하됨), 고정 상태가 변경되기 전에 방출된 영속화 전용 행은 결코 보유되지 않으므로, 가져오기 사이의 고정 해제(unpin)는 이 필드가 존재하기 전과 정확히 동일하게 해당 행을 두 번째로 반환할 수 있습니다. 페이지를 누적하는 호출자(callers)는 따라서 항상 `sessionId`로 행을 키(key)해야 하며, 이는 64개를 초과하는 경우에만 해당하는 것이 아닙니다. 행은 동시 활동(concurrent activity) 하에서도 여전히 이동하거나 건너뛸 수 있으며, 이는 이전과 정확히 같습니다. 일관된(coherent) 뷰가 필요한 호출자는 활동 변경 후 첫 페이지에서 다시 로드해야 합니다.

`view=organized`일 경우 각 세션에 추가 필드가 나타날 수 있습니다:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

신뢰할 수 있는 활성 목록에는 `clientCount`, `hasActivePrompt` 및 `activeWorkState`과 같은 라이브 데몬 오버레이(overlay) 필드가 포함됩니다. 신뢰할 수 없는 보조 및 아카이브 목록은 저장소 전용(storage-only)입니다: 라이브 오버레이 필드는 부재(absent)하거나 false로 남아 있으며, 아카이브된 항목은 `isArchived`을 `true`로 설정합니다. 세션이 없는 경우 빈 배열(404 아님)을 반환합니다 — 워크스페이스가 유휴(idle) 상태라는 이유만으로 세션 선택기(picker) UI가 오류를 발생시켜서는 안 됩니다.

### `POST /sessions/catalog`

하나의 요청으로 여러 등록된 워크스페이스의 독립적으로 페이지네이션된 세션 카탈로그를 읽습니다. 사전 점검(pre-flight)으로 `session_catalog_batch`을 한 번 실행하십시오; 이전 버전의 데몬은 워크스페이스 한정(workspace-qualified) 세션 목록 및 그룹 엔드포인트를 유지합니다. 각 배치 멤버는 영속화된 워크스페이스 소유권을 가집니다: 인증 및 요청 수용(admission)은 프로세스 전역(process-global)이지만, 각 항목은 소유한 워크스페이스만 해석하고 읽습니다. 워크스페이스를 등록하거나, 세션을 생성하거나, ACP를 시작하거나, 기본 런타임으로 폴백하지 않습니다.

```json
{
  "workspaces": [
    { "workspace": "workspace-a", "cursor": "previous-a-cursor" },
    { "workspace": "/canonical/workspace-b" }
  ],
  "options": {
    "size": 20,
    "archiveState": "active",
    "view": "organized",
    "group": "all"
  },
  "includeGroups": true
}
```

`workspaces`은 1–20개의 `{ workspace, cursor? }` 항목의 순서 있는 배열이거나, 모든 공개 등록된 워크스페이스를 선택하기 위한 `"all"`입니다. 셀렉터(selectors)는 정규화된 절대 경로보다 정확한 ID로 먼저 해석됩니다. `all`은 내부 대화(Conversations) 및 제거된 항목을 제외하고, 일시적으로 사용할 수 없는 항목을 포함하며, 20개 이상의 항목이 선택되면 실패합니다; 호출자는 명시적 선택을 분할(split)해야 합니다. 빈 공개 레지스트리는 빈 결과를 반환합니다. 명시적인 내부 셀렉터는 내부 런타임을 부팅(booting)하지 않고 항목 오류(entry error)를 반환합니다.

공유 `options`은 `size` (정수 1–100, 기본값 20), `archiveState`, `view`, `group`, `parentSessionId`, `sourceType` 및 `sourceId`을 기존 목록 필터 및 조합과 함께 허용합니다. `group` 및 `parentSessionId`은 256자로 제한됩니다. `includeGroups`의 기본값은 false입니다. 각 워크스페이스는 자체 커서를 가집니다. 배치 기본 페이지는 라이브 전용 세션을 포함하여 활동 정렬 및 불투명 커서를 사용합니다; 이러한 커서는 레거시 숫자 목록 커서와 호환되지 않습니다(interchangeable). 필터를 보존하면서 해당 항목이 반환한 `cwd` 및 `nextCursor`로 계속 진행하십시오. 전역 정렬(global sort)이나 전역 페이지네이션 커서는 없습니다.

```json
{
  "workspaces": [
    {
      "workspace": "workspace-a",
      "workspaceId": "workspace-a",
      "cwd": "/canonical/workspace-a",
      "sessions": [],
      "groups": {
        "groups": [],
        "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
      }
    },
    {
      "workspace": "/canonical/workspace-b",
      "error": {
        "code": "workspace_not_found",
        "message": "Workspace is not registered with this daemon.",
        "status": 404
      }
    }
  ]
}
```

결과는 선택 순서와 원본 선택자(`workspace`)를 보존합니다. 성공한 항목에는 정규화된 `cwd`, `workspaceId` 및 기존 페이지 필드(`sessions`, 선택적 `nextCursor`, `truncated`, `liveMergeFailed`)가 포함됩니다. 반환된 모든 세션의 `workspaceCwd`은 해당 항목의 정규화된 `cwd`로 정규화됩니다. 요청 시 `groups`에는 전체 그룹 카탈로그가 포함되며, 그룹 식별자는 해당 워크스페이스 범위로 한정됩니다. 그룹 읽기는 기존 정규화를 유지하며, 형식이 잘못된 경우 또는 읽을 수 없는 조직 저장소에 대해 경고 후 빈 결과를 반환하는 폴백을 사용합니다. 실패한 항목에는 사용 가능한 경우 `error: { code, message, status }`과 해석된 식별자가 포함되지만, 성공적인 빈 `sessions` 목록은 포함되지 않습니다. 일부 항목이 실패하더라도 유효한 배치는 HTTP 200을 반환합니다. 형식이 잘못된 요청 엔벨로프는 스토리지 읽기 전에 HTTP 400을 반환합니다.

알 수 없거나, 내부적이거나, 제거된 워크스페이스는 `404 workspace_not_found`을 생성하고, 사용할 수 없거나 변경된 런타임 세대(generation)는 `503 workspace_runtime_unavailable`을 생성하며, 신뢰할 수 없는 주(primary)는 `403 untrusted_workspace`를 생성합니다. 신뢰할 수 없는 부(secondary)는 라이브 브리지 읽기, 복구 쓰기 또는 디버그 세션 로깅 없이 기존 영구 저장 전용 카탈로그 정책을 유지합니다. 발생한 커서 및 그룹 오류는 기존 코드를 유지하며, 기타 발생한 읽기 오류는 `500 session_catalog_failed`이 됩니다. 신뢰할 수 있는 활성 항목은 기존 라이브 브리지 상태를 병합할 수 있으며, 아카이브된 항목은 스토리지 전용으로 남습니다.

데몬은 배치당 최대 4개의 워크스페이스 읽기를 동시에 실행하며, 선택자를 4096자로, 커서를 16384자로 제한하고 각 직렬화된 성공 항목을 512 KiB로 상한 설정합니다. 크기가 초과된 항목은 `413 catalog_response_too_large`을 반환하므로 재시도 전에 `size`을 줄이거나 그룹을 생략하십시오. 이는 배치 응답을 약 10 MiB에 엔벨로프/오버헤드를 더한 크기로 제한합니다. 클라이언트 연결 끊김은 대기 중인 읽기를 취소하고 추가 워크스페이스 읽기 시작을 방지합니다. 기존 데몬 JSON 본문 제한 및 영구 스캔 제한도 적용됩니다. 카탈로그 요청은 읽기 속도 제한 계층을 사용합니다.

### `POST /sessions/live-state`

하나의 요청에서 명시적으로 선택된 등록 워크스페이스 1~20개에 대한 라이브 상태 스냅샷을 읽습니다. 엄격한 본문은 `{ "workspaces": ["workspace-id", "/absolute/workspace/path"] }`이며, 선택자는 정규화된 절대 경로 이전에 정확한 워크스페이스 ID로 해석됩니다. 응답은 요청 순서에 따라 `{ "workspaces": [...] }`입니다. 각 성공 항목에는 원본 `workspace` 선택자, 정규화된 `workspaceId` 및 `cwd`, 그리고 아래 단일 워크스페이스 라우트와 동일한 `v: 1`, `catalogVersion` 및 완전한 `sessions` 스냅샷이 포함됩니다. 스냅샷은 독립적이며, 워크스페이스 간 원자성이나 병합된 세션 피드가 없습니다. 두 라우트는 카탈로그 버전 노출 및 캐시 무효화를 공유하므로, 번갈아 사용해도 단일 워크스페이스 카탈로그 조정 계약이 유지됩니다. 일부 항목이 실패하더라도 유효한 배치는 HTTP 200과 `Cache-Control: no-store`을 반환합니다.

각 실패 항목에는 `workspace`, 선택적 해석된 `workspaceId` 및 `cwd`, 그리고 성공적인 빈 `sessions` 목록 없이 `error: { code, message, status }`이 포함됩니다. 알 수 없거나, 내부적이거나, 제거된 선택자는 `404 workspace_not_found`을 반환하고, 사용할 수 없거나 교체된 런타임 세대는 `503 workspace_runtime_unavailable`을 반환하며, 신뢰할 수 없는 주 또는 부 워크스페이스는 `403 untrusted_workspace`을 반환하고, 예상치 못한 브리지 오류는 `500 session_live_state_failed`을 반환합니다. 512 KiB를 초과하는 성공 항목은 `413 live_state_response_too_large`을 반환합니다. 잘못된 엔벨로프, 추가 키, 빈 배열, 20개 이상의 선택자, 4096자를 초과하는 선택자는 어떤 브리지 읽기도 전에 HTTP 400 `invalid_session_live_state_batch_request`을 반환합니다. 이 라우트는 선택된 각 활성 런타임의 메모리 내 브리지만 읽으며, 영구 카탈로그나 ACP 자식 프로세스는 읽지 않습니다. 멤버 읽기는 순차적으로 실행되며, POST 요청은 데몬 읽기 속도 제한 계층에 부과됩니다.

### `GET /workspaces/:workspace/sessions/live-state`

선택된 워크스페이스 런타임의 메모리 전용 라이브 세션 스냅샷과 메모리 내 카탈로그 버전을 반환하여, 클라이언트가 `hasActivePrompt`, 대기 플래그, `clientCount`와 같은 휘발성 상태에 대해 `GET /workspaces/:workspace/sessions`의 영구 카탈로그 폴링을 중단할 수 있도록 합니다. 사전 확인 `workspace_session_live_state`; 태그는 `workspace_qualified_rest_core`와 독립적이므로, 더 넓은 워크스페이스 REST 기능을 광고하는 이전 데몬은 이 라우트를 구현하지 않습니다. 선택자는 먼저 정확한 워크스페이스 ID로, 그 다음 정규화 후 URL 인코딩된 절대 cwd로 해석되며, 다른 복수 세션 라우트와 일치합니다. 이 라우트는 주 및 부 런타임 모두에 대해 신뢰된 것만 허용합니다: 주 런타임으로 폴백하지 않으며, 신뢰할 수 없는 부에 제한된 카탈로그 읽기를 허용하는 관대한 영구 카탈로그 정책을 사용하지 않습니다. 이 엔드포인트에는 쿼리 매개변수가 없으며 세션 스토리지, 설정, 외부 명령 또는 ACP 왕복 통신을 수행하지 않으므로 비용이 영구 세션 수 및 JSONL 크기와 무관합니다. 기본 라이브 세션 상한이 응답을 제한하며, 상한을 비활성화하면 비용은 라이브 세션 수에만 비례합니다.

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
      "activeWorkState": "active",
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v`은 응답 스키마 버전입니다. 모든 성공적인 응답에는 `Cache-Control: no-store`이 포함됩니다. `sessions`는 선택된 런타임에서 현재 라이브인 세션의 전체적이고, 페이지네이션되지 않은, 순서 없는 집합입니다. 빈 라이브 런타임은 `sessions: []`와 함께 `200`을 반환합니다. `clientCount`, `hasActivePrompt`, `isWaitingForPermission`, `isWaitingForUserQuestion`은 필수 와이어 필드이며, 누락된 선택적 브리지 값은 `0` 또는 `false`으로 투영됩니다. `activeWorkState`은 와이어에 추가되는 필드로 이전 데몬에는 존재하지 않습니다: `active`는 데몬이 미해결 작업을 소유하거나 자식 프로세스가 새로운 비어 있지 않은 홀드 스냅샷을 보냈음을 의미합니다; `idle`은 모든 필수 카테고리를 커버하는 새로운 빈 스냅샷에만 출력됩니다; `unknown`는 협상된 보고가 오래되었거나 불완전함을 의미하며; `unsupported`는 자식 프로세스가 보고를 협상하지 않았음을 의미합니다. 이는 `hasActivePrompt`을 변경하지 않습니다: 백그라운드 셸, cron 턴 또는 대기 중인 터미널 알림은 포그라운드 프롬프트가 되지 않는 활성 작업입니다. 표시 이름, 생성 시간, 조직, 소스 메타데이터와 같은 정적 카탈로그 필드는 의도적으로 제외되며 전체 카탈로그가 소유합니다. 라이브 상태 행이 부재한 경우 알려진 카탈로그 행의 휘발성 필드만 지우며, 영구 카탈로그 행을 삭제하지는 않습니다.

`updatedAt`은 현재 브리지에서 실행 상태에 도달한 프롬프트가 공식적인 종료를 게시했을 때 존재하는 선택적 데몬 관찰 활동 워터마크입니다. 성공, 오류, 취소 및 기한 초과와 같은 종료 이벤트가 게시되기 전에 기록되며, 라이브 세션별로 엄격하게 증가합니다. 이는 두 종료가 동일한 벽시계 밀리초 내에 발생하거나 벽시계가 뒤로 돌아가는 경우에도 적용됩니다. 따라서 시계의 앞으로 점프는 벽시계가 이를 따라잡을 때까지 지속됩니다. 이 값은 세션의 `createdAt`보다 빠를 수 없습니다. 첫 번째 증가는 생성 시간으로 하한이 설정되므로, 생성과 첫 번째 종료 사이의 벽시계 롤백으로 인해 이미 `createdAt`에 나열된 행이 그 뒤에 키로 저장될 수 없습니다. 프롬프트 허용, 대기열 대기, 스트리밍 업데이트, 대기열 전용 취소, 하트비트 및 상호작용 대기는 이 값을 증가시키지 않습니다. 클라이언트는 완료된 턴 후 전체 카탈로그를 다시 로드하는 대신 이미 보유한 카탈로그 행의 최신성을 갱신하기 위해 이 값을 사용합니다. 이는 영속성 확인 응답이 아닙니다. 레코더는 턴 결과를 비동기적으로 쓰기 때문에, 이 값은 데몬이 실행 중인 시도가 종료되었음을 관찰했는지 여부만 증명합니다. 디스크에서 복원된 세션을 포함하여 브리지 생성 내의 첫 번째 실행 종료 전에는 이 값이 부재하며, 부재는 지원 여부를 확인하는 프로브가 아닙니다. 데몬 재시작이나 워크스페이스 런타임 교체로 새 브리지가 설치되면 이 값은 사라집니다. 하나의 세션에 대해 라이브 요약과 영속화된 요약이 모두 존재할 경우, 전체 카탈로그 응답은 더 늦은 유효한 타임스탬프를 보고하므로, 해당 병합 없이 브리지 요약을 직접 반환하는 `GET /session/:id/status`은 목록 응답보다 더 이른 값을 보고할 수 있습니다.

`catalogVersion`은 데몬이 관찰한 카탈로그 변경에 대한 동등성 토큰입니다. `generation`은 각 브리지 인스턴스와 함께 생성되는 무작위 UUID이며, 데몬 재시작이나 워크스페이스 런타임 교체 시 변경됩니다. `revision`은 0에서 시작하여 한 세대 내에서 단조롭게 증가합니다. 지원되는 유일한 작업은 쌍 전체에 대한 동등성 비교입니다. 세대와 리비전이 동일하면 데몬이 관찰한 카탈로그 변경이 없음을 의미하며, 차이가 있으면 전체 카탈로그를 다시 로드해야 합니다. 클라이언트는 리비전 연산을 수행하거나 서로 다른 세대 간 리비전을 비교해서는 안 되며, 보수적인 추가 증가는 허용됩니다. 버전은 데몬이 관찰한 카탈로그 구성원 및 정적 메타데이터 변경을 포함합니다. 일반적인 턴 활동, 프롬프트 생명주기, 연결/분리 및 대기 상태 전환은 라이브 스냅샷이 이미 해당하는 휘발성 필드를 포함하고 있으므로 버전을 증가시키지 않습니다. 따라서 버전이 변하지 않은 상태에서 `updatedAt`이 변경되는 것은 유효하며 예상되는 동작이며, 데몬의 영속화된 목록 캐시를 무효화하지 않습니다. 두 개의 휘발성 오버레이 값은 의도적으로 두 신호 모두에서 제외됩니다: 턴 오류 상태(`hasTurnError`/`turnError`)와 대기 중인 상호작용 수/내용(`pendingInteractionCount`/`pendingInteractions`)은 버전을 증가시키지 않고 스냅샷에도 나타나지 않으므로, 이러한 값이 필요한 클라이언트는 이 경로에 의존하는 대신 세션별 이벤트 스트림이나 전체 카탈로그를 계속 읽어야 합니다. 구체적인 소비자가 필요로 할 경우 두 필드 중 하나를 와이어에 추가적으로 도입할 수 있습니다. 다른 데몬, TUI 또는 외부 프로세스가 직접 작성한 변경 사항은 관찰되지 않으므로, 클라이언트가 주기적인 전체 카탈로그 폴링을 중단하면 이러한 쓰기는 제한된 발견 시간을 가지지 않으며 명시적인 전체 다시 로드, 다른 관찰된 카탈로그 변경, 재연결 또는 데몬/런타임 교체 후에만 표시됩니다.

클라이언트는 두 번의 읽기 핸드셰이크로 카탈로그 번들을 조정합니다: 라이브 상태 A를 읽고, 전체 세션 목록(클라이언트가 `session_organization`을 소비하는 경우 `GET /workspaces/:workspace/session-groups` 포함)을 로드한 다음, 라이브 상태 B를 읽습니다. A와 B의 버전이 같으면 번들을 수락합니다. 버전이 다르면 카탈로그를 만료된 것으로 표시하고, 타이트한 재시도 루프에 진입하는 대신 최대 하나의 후행 다시 로드를 결합합니다. 수락된 모든 카탈로그 요청은 A 이후에 시작되어야 하며, A 이전에 시작된 요청이나 중복 제거된 프로미스는 조정을 충족할 수 없습니다. 버전 기반 다시 로드는 워크스페이스당 단일 비행(single-flight)로 수행되며, 0이 아닌 백그라운드 최소 간격을 준수하므로, 지속적인 카탈로그 변동이 라이브 상태 폴링마다 전체 카탈로그 스캔을 유발할 수 없습니다. 명시적인 로컬 변경 사항은 여전히 동일한 단일 비행 작업을 통해 즉각적인 새로 고침을 요청할 수 있습니다.

**오류:**

- `400` — 알 수 없거나, 형식이 잘못되거나, 중첩되거나, 등록되지 않은 셀렉터에 대한 기존 셀렉터 검증 또는 `workspace_mismatch` 동작; 이 경로는 알 수 없는 셀렉터를 기본 런타임으로 절대 해석하지 않습니다.
- `403` — 신뢰할 수 없는 기본 런타임을 포함하여 모든 신뢰할 수 없는 런타임에 대한 `untrusted_workspace`.
- `503` — 부팅 중, 전환 중, 드레인 중, 차단됨 또는 제거된 런타임 또는 요청 중에 닫히는 런타임 세대에 대해 `Retry-After`을 포함한 `workspace_runtime_unavailable`.
- `500` — 예상치 못한 로컬 오류는 기존 브리지 오류 매핑을 사용합니다.

### `GET /workspace/:id/session-groups`

워크스페이스에 대한 사용자 정의 세션 그룹을 나열합니다. 단수 GET 셀렉터는 등록된 워크스페이스 ID 또는 URL 인코딩된 정규화된 cwd를 허용합니다. 복수 GET 별칭은 신뢰할 수 없는 보조 클라이언트에게도 사용 가능하며 조직 사이드카만 읽습니다. 복수 그룹 변경은 신뢰 게이트가 유지되지만, 단수 그룹 변경은 기본 전용 호환성 동작을 유지합니다. 사전 체크 `caps.features.includes('session_organization')`.

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

색상은 프로토콜 토큰일 뿐이며, 클라이언트는 표시 이름을 현지화합니다. 기본 색상 이름이 지정된 그룹은 생성되지 않습니다.

### `POST /workspace/:id/session-groups`

사용자 정의 세션 그룹을 생성합니다. 엄격한 변경 게이트. 사전 체크 `caps.features.includes('session_organization')`.

요청:

```json
{ "name": "Frontend", "color": "blue" }
```

`name`은 공백이 제거되며, 1-64자여야 하고, 제어 문자를 포함할 수 없으며, 대소문자를 구분하지 않는 공백 제거 비교를 통해 워크스페이스 내에서 고유해야 합니다. 중복된 이름은 `409 { code: "group_name_conflict" }`을 반환합니다. `color`는 반환된 `colorOptions` 중 하나여야 합니다.

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

사용자 정의 세션 그룹을 업데이트합니다. 엄격한 변경 게이트. 사전 체크 `caps.features.includes('session_organization')`. 본문 필드는 선택 사항입니다: `{ "name"?: string, "color"?: string, "order"?: number }`. 알 수 없는 그룹 ID는 `404 { code: "group_not_found" }`를 반환하며, 중복/잘못된 이름 및 색상은 생성과 동일한 오류를 사용합니다.

### `DELETE /workspace/:id/session-groups/:groupId`

사용자 정의 세션 그룹을 삭제합니다. 엄격한 변경 게이트. 사전 체크 `caps.features.includes('session_organization')`. 그룹을 참조하는 세션은 `groupId: null`로 초기화되며, 고정(pinned) 상태는 보존됩니다. 그룹이 제거된 경우 응답은 `{ "deleted": true }`이고, ID가 존재하지 않은 경우 `{ "deleted": false }`입니다.

### `POST /sessions/delete`

하나 이상의 영속화된 세션 JSONL 파일을 하드 삭제합니다. 데몬은 먼저 최선의 노력으로 라이브 세션을 닫은 다음, 활성 또는 아카이브된 JSONL을 제거합니다. 동일한 ID에 대해 활성 및 아카이브 사본이 모두 존재하는 경우, 둘 다 제거됩니다. 양쪽의 워크트리 사이드카가 정리되며, 파일 히스토리, 서브 에이전트 트랜스크립트 및 런타임 사이드카는 의도적으로 보존됩니다.

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

하나 이상의 세션을 아카이브합니다. 아카이빙은 삭제 상태 전이가 아닙니다: JSONL 파일이 `chats/<id>.jsonl`에서 `chats/archive/<id>.jsonl`로 이동합니다. 파일 기록, 하위 에이전트 트랜스크립트 및 런타임 사이드카는 그대로 유지됩니다. 세션이 활성 상태인 경우 데몬은 먼저 엄격한 종료를 수행하고 ACP 에이전트의 종료 핸들러가 채팅 기록을 플러시하도록 요구합니다. 종료 또는 플러시가 실패하면 JSONL 파일은 이동되지 않습니다. 사전 확인 `caps.features.session_archive`.

요청:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true, "requireIdle": true }
```

`sessionIds`은 최대 100개의 ID를 포함하는 비어 있지 않은 문자열 배열이어야 합니다. 중복 항목은 제거됩니다.

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

`resolveConflicts`은 선택 사항이며 기본값은 `false`입니다. 기본적으로 동일한 ID의 활성 및 아카이브된 파일은 `errors`에 보고되며, 두 사본 모두 이동, 삭제 또는 덮어쓰기되지 않습니다. 활성 세션을 아카이브할 때 여전히 위에서 설명한 엄격한 종료가 충돌 분류 전에 수행되므로, 종료가 대기 중인 레코드를 활성 트랜스크립트로 플러시할 수 있습니다. `resolveConflicts: true` 옵션을 사용하면 선택한 워크스페이스가 유지 관리할 수 있는 소유된 빈 트랜스크립트 또는 손상된 트랜스크립트를 포함하여 두 사본 모두 정규 트랜스크립트 파일일 때만 아카이브가 충돌을 복구합니다. 아카이브된 사본을 유지하고, 활성 사본을 제거하며, 해당 ID를 `archived`와 `resolvedConflicts` 모두에 보고합니다. 이 옵션은 소유권 검사를 우회하지 않으며, 혼합된 로컬/외부 또는 기타 모호한 소유권은 `errors`에 보고되고 두 사본 모두 이동되지 않습니다. `errors` 항목에는 `{ "sessionId": "<uuid>", "error": "message" }`이 포함됩니다.

`requireIdle`은 선택 사항이며 기본값은 `false`입니다. 클라이언트는 이를 전송하기 전에 `session_archive_idle_guard`를 사전 확인해야 합니다. `requireIdle: true` 옵션을 사용하면 활성 작업 상태가 active, unknown 또는 unsupported인 활성 소유자는 해당 세션을 `errors`에 반환합니다. 데몬은 이를 종료하거나 트랜스크립트를 이동하지 않습니다. 검사 및 종료로의 전이는 하나의 소유 런타임 제어 평면 턴에서 발생하므로 그 사이에 새로운 작업이 진입할 수 없습니다. 활성 자식이 이미 회수된 영속화된 세션은 여전히 아카이브 대상이 됩니다.

아카이브 전용 세션은 데몬이 대기 중인 사이드카 정리를 조정하기 위해 작성자 또는 유지 관리 리스를 획득한 후 `alreadyArchived`에 반환됩니다. 다른 프로세스가 여전히 작성자 리스를 보유하고 있는 경우, 리스가 사용 가능해질 때까지 아카이브 전용 ID가 `errors`에 보고됩니다.

나중에 정리 소유권 검사가 실패하더라도 트랜스크립트 이동 또는 충돌 복구는 롤백되지 않습니다. 이 경우 아카이브 상태가 이미 변경되었음에도 불구하고 ID가 `errors`에만 나타날 수 있으며 `archived`과 `resolvedConflicts`에서 생략될 수 있습니다. 오류를 활성 사본 또는 충돌이 남아 있다는 증거로 간주하기 전에 동일한 워크스페이스에 대해 동일한 생명주기 요청을 재시도하십시오. 서비스가 저장된 트랜스크립트 ID를 확인하고 필요한 작성자 또는 유지 관리 리스를 획득할 수 있을 때, 재시도는 세션 목록에서 생략되는 빈 트랜스크립트 또는 손상된 트랜스크립트에 대해서도 권위 있는 `alreadyArchived` 상태를 보고하고 대기 중인 사이드카 정리를 재개합니다. 저장된 ID를 확인할 수 없는 트랜스크립트는 재시도 시 `errors`를 계속 보고하며 수동 검사가 필요합니다. 필요한 리스를 획득할 수 없는 재시도는 `errors`에 리스가 사용 가능해질 때까지 남습니다.

생명주기 충돌은 배치 항목 결과입니다: 워크스페이스 미지정 및 워크스페이스 지정 라우트는 `errors`에 충돌을 포함하여 HTTP `200`을 반환합니다. 이는 이전의 워크스페이스 지정 HTTP `409 session_conflict` 엔벨롭을 대체합니다. 해당 라우트를 호출한 클라이언트는 배치 응답을 확인해야 합니다. 내부 런타임 REST 배치는 안전한 충돌 메시지를 보존하면서 다른 세션별 실패 세부 정보를 계속 마스킹합니다.

### `POST /sessions/unarchive`

아카이브된 세션을 활성 디렉토리로 복원합니다. 이는 자체적으로 세션을 재개하지 않으며, `chats/archive/<id>.jsonl`을 `chats/<id>.jsonl`로 되돌리는 것뿐입니다. 언아카이브가 성공한 후 클라이언트는 `POST /session/:id/load` 또는 `POST /session/:id/resume`을 호출할 수 있습니다.

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

`resolveConflicts`은 선택 사항이며 기본값은 `false`입니다. 기본적으로 동시에 존재하는 활성 및 아카이브된 JSONL 파일은 `errors`에 충돌을 생성하며, 두 사본 모두 이동, 삭제 또는 덮어쓰기되지 않습니다. 데몬이 대기 중인 사이드카 정리를 조정하기 위해 작성자 또는 유지 관리 리스를 획득한 후 활성 전용 세션은 `alreadyActive`에 반환됩니다. 활성 세션이 여전히 작성자 리스를 보유하고 있는 경우, 해당 세션이 종료될 때까지 활성 전용 ID가 `errors`에 보고됩니다. `resolveConflicts: true` 옵션을 사용하면 선택한 워크스페이스가 유지 관리할 수 있는 소유된 빈 트랜스크립트 또는 손상된 트랜스크립트를 포함하여 두 사본 모두 정규 트랜스크립트 파일일 때만 언아카이브가 충돌을 복구합니다. 활성 사본을 유지하고, 아카이브된 사본을 제거하며, 해당 ID를 `unarchived`과 `resolvedConflicts` 모두에 보고합니다. 이 옵션은 소유권 검사를 우회하지 않으며, 혼합된 로컬/외부 또는 기타 모호한 소유권은 `errors`에 보고되고 두 사본 모두 이동되지 않습니다. 동일한 ID에 대한 아카이브 또는 언아카이브 처리 중이면 배치 시작 전에 `409 session_archiving`을 반환합니다.

나중에 정리 소유권 검사가 실패하더라도 트랜스크립트 이동 또는 충돌 복구는 롤백되지 않습니다. 이 경우 아카이브 상태가 이미 변경되었음에도 불구하고 ID가 `errors`에만 나타날 수 있으며 `unarchived`과 `resolvedConflicts`에서 생략될 수 있습니다. 오류를 아카이브된 사본 또는 충돌이 남아 있다는 증거로 간주하기 전에 동일한 워크스페이스에 대해 동일한 생명주기 요청을 재시도하십시오. 서비스가 저장된 트랜스크립트 ID를 확인하고 필요한 작성자 또는 유지 관리 리스를 획득할 수 있을 때, 재시도는 세션 목록에서 생략되는 빈 트랜스크립트 또는 손상된 트랜스크립트에 대해서도 권위 있는 `alreadyActive` 상태를 보고하고 대기 중인 사이드카 정리를 재개합니다. 저장된 ID를 확인할 수 없는 트랜스크립트는 재시도 시 `errors`를 계속 보고하며 수동 검사가 필요합니다. 활성 세션이 여전히 리스를 보유하고 있어 필요한 리스를 획득할 수 없는 재시도를 포함하여, 리스가 사용 가능해질 때까지 `errors`에 남습니다.

ACP-over-HTTP는 벤더 메서드 `_qwen/sessions/archive` 및 `_qwen/sessions/unarchive`을 통해 동일한 요청 및 응답 본문을 사용합니다. REST 라우트 테이블은 ACP 전송용 `POST /sessions/archive` 및 `POST /sessions/unarchive`을 해당 메서드에 매핑합니다.

### 다중 워크스페이스 활성 세션 라우팅

`multi_workspace_sessions`이 광고되면 활성 세션 작업은 `sessionId`에서 자신의 워크스페이스를 식별합니다. 클라이언트는 URL에 워크스페이스 선택자를 추가하지 않습니다. 기존 소유자 라우팅 생명주기 작업 외에도 이는 `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/btw/stream`, `DELETE /session/:id/btw/stream/:requestId`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `POST /session/:id/mid-turn-messages/send-now`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, `DELETE /session/:id/artifacts/:artifactId`, `GET /session/:id/sources`, `POST /session/:id/sources` 및 `DELETE /session/:id/sources/:sourceId`에 적용됩니다. 데몬은 각 요청을 활성 세션을 소유한 신뢰할 수 있는 런타임으로 라우팅합니다. 신뢰할 수 없는 비주요 소유자는 `403 untrusted_workspace`을 반환하고, 누락된 활성 소유자는 `404 session_not_found`을 반환하며, 모호한 소유자는 `500 ambiguous_session_owner`으로 안전하게 실패합니다.

이 규칙은 라이브 세션에만 적용되며, 워크스페이스가 없는 모든 세션 라우트를 멀티 워크스페이스 인식 상태로 만들지 않습니다. 영구 저장되거나 아카이브된 작업은 문서화된 워크스페이스 한정 라우트를 사용합니다. `POST /session/:id/branch`, `POST /session/:id/fork` 및 `POST /session/:id/cd`는 의도적으로 기본(primary) 전용으로 유지되며, 기본 소유자가 아닌 경우 `non_primary_session_route_not_supported`을 반환합니다.

### 턴 중간 메시지(Mid-turn messages)

`POST /session/:id/mid-turn-message`은 `{ "message": "...", "messageId": "<optional-message-id>" }`을 허용합니다. 성공적인 수락은 `{ "accepted": true, "messageId": "<id>" }`를 반환하고 소유권을 데몬으로 이전합니다: 메시지는 활성 턴으로 배수(drain)되거나 세션이 유휴 상태가 되면 일반 프롬프트 FIFO로 승격됩니다. `session_mid_turn_message_query`을 사용하는 클라이언트는 안정적인 `messageId`를 전송합니다; 이 ID가 큐잉, 대기 중 또는 제한된 조정 링(reconciliation rings)에 남아 있는 동안 반복 전송은 멱등적입니다. 데몬이 검증한 요청의 거절은 `{ "accepted": false }`를 반환하며 소유권을 절대 이전하지 않습니다: 프롬프트 FIFO에 수락된 프롬프트가 없고 활성 Goal 턴이 없는 열린 세션은 실패를 표시하는 대신 클라이언트가 메시지를 일반 프롬프트로 재제출할 수 있도록 `{ "accepted": false, "reason": "session_idle" }`을 보고합니다. 진정으로 새로운 수락의 경우, 세션이 더 이상 보유하지 않는 첨부 파일을 참조하거나 잘못된 참조인 `content` 블록은 유휴 및 큐 판정 전에 거부됩니다: 요청은 `410 session_attachment_gone`(또는 `400 invalid_session_attachment_reference`)로 응답되며, 세션이 유휴 상태일지라도 `reason`을 포함하지 않는 `{ "error", "code" }` 본문을 반환합니다. 두 개의 이전 게이트가 이를 우선시합니다: 페이로드가 여전히 일치하는 반복된 `messageId`은 첨부 파일이 이후 제거되었더라도 `{ "accepted": true, "messageId" }`으로 멱등하게 해결되며, 닫히는 중이거나 닫기를 승인 중인 세션은 이유 없는 `{ "accepted": false }`로 거부됩니다. 판정은 턴 중간 메시지를 배수할 수 있는 것만 설명하며, 세션이 보유할 수 있는 모든 것을 설명하지는 않습니다 — 예를 들어 지연된 복원 프롬프트가 대기 중일 때 세션 스냅샷은 여전히 `hasActivePrompt: true`을 보고할 수 있습니다. 이유 없는 거절에는 다른 원인이 있습니다 — 큐가 가득 찼거나, 세션이 닫히는 중이거나 닫기를 승인 중이거나, 큐잉된 인라인 첨부 파일 예산이 소진되었거나, 반복된 `messageId`이 데몬이 보유한 페이로드와 더 이상 일치하지 않는 경우입니다. 데몬은 이미 수락한 페이로드를 교체하지 않고 유지하지만, 이는 전달 약속이 아닙니다: 클라이언트가 제거한 승격된 메시지는 대기 프롬프트 스냅샷에서 즉시 사라집니다 — 시작되지 않은 것은 그 자리에서 드롭되고, 이미 실행 중인 것은 중단된 턴이 해결될 때까지 숨겨집니다. 따라서 제거 응답은 클라이언트가 관찰하는 유일한 `removed = true`입니다. 닫히는 세션은 큐에 남은 것을 결코 승격시키지 않으며, 닫기가 아직 승인되는 중에 해결되는 턴은 큐를 수락 게이트에 넘기며, 게이트는 이를 거부하므로 이러한 메시지는 승격되지 않고 드롭되어 어떤 링에도 들어가지 않습니다. 자식이 이후 닫기를 거부하면 세션은 라이브 상태로 남고, 큐에 남은 것은 목록에 표시되지만 이후 턴이 끝날 때까지 승격할 것이 예약되지 않습니다. 이러한 메시지는 여전히 데몬의 것이므로 기본 복구 방법은 대기하는 것입니다: 다음 턴의 해결이 백로그를 승격시키며, 손실되거나 중복 전달되는 것은 없습니다. 대기할 수 없는 클라이언트 — 추가 턴이 오지 않고 사용자가 배수되지 않는 큐를 지켜보고 있는 경우 — 는 강제로 배수를 시도할 수 있으며, 지원되는 유일한 방법은 다시 보내기 전에 각 페이로드를 해제하는 것입니다. 두 경로 모두 동일한 집합에서 시작합니다: 해당 창에서 큐잉했다고 클라이언트가 기록한 것에서 긍정적 전달 증거가 있는 것을 뺀 값으로 구성하되, 목록의 침묵으로부터 구성하지 마십시오. 쿼리는 데몬이 보유한 것에 대한 재고 목록이 아닙니다 — 이미 제거됨으로 표시된 프롬프트를 생략하고, 두 링 모두 제한되어 있으며, 클라이언트 ID 없이 전송된 큐잉은 이 표면에서 전혀 추적되지 않으므로 — 어디에도 보고되지 않은 ID는 전달 후 만료되었거나, 전달되지 않은 채 드롭되었거나, 처음부터 목록에 표시되지 않았을 수 있습니다. 긍정적 전달 증거는 `mid_turn_message_injected` 에코, 해당 ID에 대한 `pending_prompt_started` 또는 두 링 중 하나의 멤버십입니다.

턴 중 POST 요청은 선택적 `eventDetailMode`도 허용합니다: `full`(기본값) 또는 `summary`; 잘못된 값은 `400 invalid_event_detail_mode`을 반환합니다. 데몬은 이 모드를 메시지와 함께 유지하며, 드레인되지 않은 메시지가 새 프롬프트가 될 경우 이를 사용합니다. 기존 턴으로 드레인하는 것은 해당 턴의 모드를 변경하지 않습니다. 대기 중이거나 승격되어 보류 중인 동안, 동일한 `messageId`로 재시도할 때는 텍스트, 미디어 및 유효 모드(생략 시 full)가 일치해야 합니다. Web Shell은 현재 Provider 모드를 전송합니다. REST 경로는 여전히 `reason: "session_idle"`로 새로운 유휴 상태 수락을 거부하므로, 호출자는 일반 프롬프트를 제출해야 합니다.

배수를 강제하려면, 쿼리가 여전히 큐잉됨으로 보고하는 해당 집합의 모든 ID에 대해 `DELETE /session/:id/mid-turn-messages/:messageId`을 수행하고, 그 후에만 새 `messageId` 하에 텍스트를 다시 게시하십시오. 반복된 ID는 멱등하게 확인 처리되며 아무것도 재장전하지 않기 때문입니다. 순서가 중요하며 한 번에 하나의 ID가 아니라 전체 집합에 적용됩니다: 데몬이 소유한 아직 큐잉된 페이로드는 다음 해결 시 승격되므로, 페이로드가 결코 해제되지 않은 ID를 다시 게시하면 해당 메시지가 두 번 전달됩니다 — 한 번은 해당 승격에서, 한 번은 재전송에서. `session_mid_turn_message_mutation`이 광고되지 않은 곳에서는 페이로드를 해제할 방법이 없으므로, 대기가 유일한 안전한 옵션입니다. 어떤 DELETE 판정도 자체적으로 전달을 확립하지 않습니다. `{ "removed": false }`은 이미 주입되거나 완료된 ID — 전달되었으므로 다시 게시해서는 안 됨 — 그리고 아래 DELETE 라우트에 따라 두 가지 추가 경우를 포함합니다. 하나는 배수가 여전히 보유 중인 ID이며, 이 역시 다시 게시해서는 안 됩니다. 이후 쿼리는 `settledMessageIds`에 이를 나열하지만, 이것이 최종적이지는 않습니다: 배수가 실패하면 ID는 링을 떠나 이벤트 없이 큐로 돌아갑니다. 아래 '지금 보내기' 단락은 시간 초과된 배수의 메시지가 손실되는 시점을 설명합니다. 다른 하나는 찾을 수 없는 ID이며, 쿼리가 방금 큐잉됨으로 나열한 ID의 경우 두 호출 사이에 큐를 떠났으며 위의 닫기 승인 경로에 의해 전달되지 않은 채 드롭되었을 수 있음을 의미합니다; 이 경우는 클라이언트의 자체 증거로 판단하십시오. `{ "removed": true }`은 페이로드를 해제하지만, 해당 창에서 해결이 승격한 ID의 경우 디스패치되기 전에 잘려나간 FIFO 항목(재게시해도 안전함)과 이미 시작된 승격된 프롬프트의 중단(재게시 시 두 번째로 전송됨)을 모두 포함합니다. 승격된 ID는 목록이 더 이상 큐잉됨으로 보고하지 않더라도 동일한 라우트를 통해 해결될 때까지 삭제 가능 상태로 유지됩니다. 재게시 자체는 턴 중간 수락이며 `{ "accepted": false, "reason": "session_idle" }`로 거부될 수 있습니다; 이는 실패가 아니라 위에서 설명한 대로 세션이 이제 일반 프롬프트를 취한다는 신호이며, 일반 경로를 통해 제출하면 여전히 큐에 남아 있는 것을 승격시키는 해결을 가진 턴이 시작됩니다 — 이것이 집합 내의 모든 ID를 먼저 해제해야 하는 동일한 이유입니다.

따라서 `reason`이 누락된 것은 세션이 바쁘다는 증거가 아닙니다. `reason` 이전 버전의 데몬은 모든 경우에서 이를 생략하므로, 클라이언트는 자체 유휴 감지 기능을 유지합니다. 이전 버전의 데몬에 연결된 새 클라이언트는 누락된 기능을 감지하고 레거시 로컬 폴백을 유지합니다.

`GET /session/:id/mid-turn-messages`은 세션 전체의 데몬 소유 큐와 제한된 크기의 `settledMessageIds` 및 `promotedMessageIds` 링을 반환합니다. 확정된 ID는 주입되었거나 명시적으로 삭제되었으며, 승격된 ID는 일반 프롬프트 FIFO에 들어갔습니다. 두 링 중 하나에 있는 ID는 재전송되어서는 안 됩니다.

대기 중인 메시지가 활성 턴으로 소진될 때, 데몬은 정렬된 `messages` 및 `messageIds` 배열(알려진 경우 실행 중인 턴의 `promptId` 포함)을 담은 `mid_turn_message_injected`을 게시합니다. 이는 일시적인 중복 제거 신호이며 대화 기록 항목이 아닙니다: 클라이언트는 해당 메시지 ID로 등록된 완료 콜백을 확정하고 관련 로컬 대기 행을 삭제합니다. 이전 버전의 데몬은 페이로드에 추가로 `originatorClientId`를 포함합니다. 놓친 에코는 위의 쿼리를 통해 확정된 링에서 복구됩니다.

에이전트는 도구 배치가 끝날 때마다 큐를 소진하므로, 모델 응답이 스트리밍되는 동안 허용된 메시지는 해당 응답과 그 도구 배치를 기다립니다. `session_mid_turn_send_now`이 광고되면 연결된 세션 클라이언트는 `POST /session/:id/mid-turn-messages/send-now`을 호출하여 대기 중인 메시지를 즉시 전달할 수 있습니다: 목표 지속을 포함한 포그라운드 턴이 모델 응답을 스트리밍하는 경우, 에이전트는 즉시 큐를 소진하고 해당 응답을 중단하며, 이미 스트리밍된 부분을 대화에 유지하고 같은 턴 내에서 메시지로 계속 진행합니다. 제공자가 발표한 도구 호출을 시작한 응답(인수가 아직 스트리밍 중이라도)은 중단되지 않으며, 실행 중인 도구는 절대 중단되지 않습니다: 메시지는 큐에 남아 도구 결과와 함께 전달되거나, 도구가 턴을 종료할 때 다음 프롬프트로 승격됩니다. 일부 제공자는 인수가 완전히 채워진 후에만 도구 호출을 발표하며, 이러한 호출은 여전히 중단될 수 있습니다. 몇 가지 경우 메시지는 이미 큐를 떠났지만 해당 턴에서 답변을 받지 못합니다. send-now 소진이 이미 진행 중인데 제공자가 이후 턴을 종료하는 도구 호출을 발표하거나, 턴이 중지될 때, 메시지는 대화와 대화 기록에 유지되지만 승격되지 않습니다. send-now 소진 자체가 시간 초과되는 경우(에이전트는 2초를 기다리며, 데몬은 여전히 첨부 파일을 읽는 중일 수 있음), 데몬이 이후에 넘기는 메시지는 도구 호출 없이 여전히 스트리밍 중이라면 응답을 중단하고, 그렇지 않으면 이후 소진 시(아마도 더 늦은 턴에서) 전달됩니다; 일반적인 시간 초과 소진과 마찬가지로, 데몬이 시간 초과 후 30초 이상 지나서 응답하거나, 이후 소진이 첨부 파일을 처리하는 동안 턴이 중지되면 메시지는 손실됩니다. 모든 경우에서 해당 ID는 다른 소진된 메시지와 동일하게 확정됩니다: 재전송하면 다시 큐잉하지 않고 확인되며, 대화에 유지된 메시지에 대한 답변을 원하는 클라이언트는 새 프롬프트를 보내야 합니다. 큐 전용 내부 스티어링은 절대로 중단을 트리거하지 않으며 send-now 소진에 의해 가져가지 않습니다; 모델에 대한 다음 요청과 함께 나가거나, 턴이 먼저 종료될 때 호출자가 주도하는 확정 경로를 통해 나갑니다. 채널, 크론 및 백그라운드 턴은 도구 경계 전달을 유지합니다. 사용자 메시지가 대기 중이고 에이전트에게 전달하도록 요청받은 경우 응답은 `{ "requested": true }`이며, 대기 중인 메시지가 없는 경우(이미 전달, 삭제 또는 승격됨) `{ "requested": false }`입니다. 이 요청 이전 버전의 에이전트는 `-32601`로 응답하고 도구 경계 전달을 유지합니다.

`session_mid_turn_message_mutation`이 광고되면 연결된 세션 클라이언트는 `DELETE /session/:id/mid-turn-messages/:messageId`을 호출할 수 있습니다. 이는 중간 턴 큐 또는 승격된 대기 프롬프트 상태에서 메시지를 제거합니다. 이미 실행 중인 승격된 메시지를 제거하면 해당 턴이 중단되며, 이는 일반적인 대기 프롬프트 제거와 일치합니다. 데몬 소유 큐 추가 및 제거는 기존 `pending_prompt_added` 및 `pending_prompt_completed` 세션 이벤트를 게시하므로 연결된 클라이언트가 두 권위 있는 큐 스냅샷을 모두 새로 고칩니다. `{ "removed": false }`는 메시지가 이미 주입되었거나, 완료되었거나, 찾을 수 없음을 의미합니다. 소진에 의해 가져갔지만 아직 에이전트에 넘기지 않은 메시지도 `{ "removed": false }`로 응답합니다. 해당 소진이 실패하면 메시지는 큐 이벤트 없이 큐로 돌아가고 ID는 확정된 링에서 벗어납니다. 이후 소진이나 턴 확정이 이를 가져가지만, 소진이 해당 턴이 확정된 후에 실패하면 메시지는 다음 턴까지 큐에 남아 있습니다.

### `GET /session/:id/pending-prompts`

현재 실행 중인 프롬프트와 라이브 세션의 FIFO에서 대기 중인 프롬프트를 반환합니다. 요청에는 `X-Qwen-Client-Id`이 포함될 수 있으며, 존재할 경우 연결된 클라이언트를 식별해야 합니다.

```json
{
  "pendingPrompts": [
    {
      "promptId": "<prompt-id>",
      "text": "Explain the failure",
      "queuedAt": 1700000000123,
      "state": "running",
      "originatorClientId": "<client-id>"
    }
  ]
}
```

`state`은 디스패치 중인 프롬프트에 대해 `running`이고, 대기 중인 프롬프트에 대해 `queued`입니다. 프롬프트에 이미지와 같은 구조화된 콘텐츠가 포함된 경우 `content`이 나타납니다. 이는 라이브 세션 소유자 경로입니다: `404`는 라이브 소유자가 없음을 의미하고, `503`는 소유자가 일시적으로 사용할 수 없음을 의미합니다. 신뢰할 수 없는 비주요(primary) 소유자는 `403 untrusted_workspace`을 반환하며, 여러 워크스페이스에 걸쳐 있는 ID는 `500 ambiguous_session_owner`을 반환합니다. 전용 기능 태그는 없으며, 이전 버전의 데몬은 `404`을 반환합니다. TypeScript SDK 메서드는 `getPendingPrompts()`입니다.

### `POST /session/:id/prompt`

`eventDetailMode`은 `full`(기본값) 또는 `summary`을 허용하며, 잘못된 값은 `400 invalid_event_detail_mode`을 반환합니다. Summary 모드는 링 보존 및 SSE 전달 전에 중첩된 서브 에이전트 세부 정보를 필터링하며, 루트 콘텐츠와 메인 모델 사용량을 보존하면서 Agent 프롬프트, 내장 도구 및 진행 중인 토큰 카운터를 제거합니다. 확정된(Settled) Agent 결과는 턴 메트릭을 위해 `tokenCount` 및 `executionSummary` 토큰 총계(실패/취소 포함)를 유지하지만, 중첩된 사용량 프레임은 계속 필터링됩니다. 요약 로드/트랜스크립트 응답에도 동일한 규칙이 적용됩니다. 모드는 수락(admission) 시점에 캡처되며, 디스패치 시에만 적용되고, 확정(settlement) 시 full로 리셋됩니다. 늦게 도착한 서브 에이전트 이벤트는 게시(publication) 시점의 모드를 사용합니다: 유휴 상태에서는 full, 후속 프롬프트가 실행 중일 때는 활성 프롬프트의 모드. 이들은 원래 서브 에이전트를 시작했던 프롬프트의 모드를 상속받지 않습니다. 이는 세션의 모든 구독자에게 적용되며, 필터링된 세부 정보는 나중에 링에서 검색할 수 없습니다. 데몬의 `/acp` `session/prompt`은 동일한 범위로 동일한 선택적 최상위 확장을 허용합니다(잘못된 값은 JSON-RPC `-32602`); 이는 표준 ACP 필드가 아니며 자식 프로세스로 전달되지 않습니다.

프롬프트를 에이전트로 전달합니다. 다중 프롬프트 호출자는 세션별로 FIFO 큐에 추가합니다(ACP는 세션당 하나의 활성 프롬프트만 허용하도록 보장합니다).

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

`delivery`은 선택 사항이며 `channel_delivery` 기능이 필요합니다. 데몬은 프롬프트가 수락되면 여전히 `202 {promptId,lastEventId}`을 반환합니다. 성공적인 `end_turn` 이후, 세션은 표시 가능한 최종 텍스트를 정확한 워크스페이스의 이미 실행 중인 Channel Worker에게 제출합니다. 페이로드에는 마지막 도구 없는(tool-free) 어시스턴트 응답 블록만 포함되며, 도구 호출 도입부, 도구 간 내러레이션, 대체된 재시도 및 이전 자동 연속 블록은 제외됩니다. 빈 문자열이나 공백만 포함된 최종 응답이라도 권한 확인이 소비된 후 `status: "skipped"`과 함께 상관된(correlated) `channel_delivery_result`을 생성하지만 워커와는 통신하지 않습니다. 전달 성공 또는 실패는 나중에 동일한 재생 가능한(replayable) 이벤트를 통해 도착하며, `turn_complete`을 `turn_error`로 변경하지 않습니다. 취소, Agent 실패 및 토큰 한도로 인한 종료는 전달 결과를 보내거나 게시하지 않습니다.

검증: `prompt`은 객체의 비어 있지 않은 배열이어야 합니다. 다른 실패는 브리지에 도달하기 전에 `400`을 반환합니다.

`idempotencyKey`은 최대 200자 이하의 선택적 비어 있지 않은 문자열입니다(잘못된 값은 `400 invalid_idempotency_key`을 반환). 이는 HTTP 요청이 아니라 호출자의 EVENT를 식별합니다: 첫 번째 수락은 세션별로 키를 기억하며, 동일한 키로 반복 POST하면 두 번째 턴을 큐에 넣지 않고 `202 { promptId, lastEventId, eventEpoch, deduplicated: true }`(첫 번째 프롬프트의 `promptId` 및 새로운 커서/에포크 포함)를 반환하여 원래 수락을 반환합니다. 이를 통해 `202` 이후 수락을 영구적으로 표시하거나 응답을 잃어버린 릴레이가 안전하게 재시도할 수 있습니다. 중복 제거(dedupe)는 데몬 생명주기 내에서 최선(best-effort)으로 수행됩니다: 링은 메모리에 상주하며 제한되어 있습니다(세션당 128개 키, 1024개 세션, 두 수준 모두에서 FIFO 퇴출). 두 한도 중 어느 하나라도 이벤트의 큐 항목이 아직 살아 있는 동안 키를 퇴출시킬 수 있습니다 — 일반적인 경우 하나의 장기 세션이 128개 이상의 다른 이벤트를 수락할 때 세션별 한도가, 1024개 이상의 세션이 키를 보유할 때 세션 한도가 적용됩니다. 이러한 퇴출 후 재시도는 다시 주입(re-inject)됩니다. 링은 보호하는 메모리 기반 프롬프트 큐와 함께 사라지므로, 데몬 재시작 시 둘 다 손실되며 재주입이 올바른 복구가 됩니다. 키는 세션별로 범위가 지정되며, 이 필드는 수락 메타데이터로서 에이전트로 전달되지 않습니다.

채널 릴레이는 라우트가 전달하기 전에 제거하는 세 개의 `_meta` 키를 사용합니다: `qwen.channel.prompt`(채널 턴 분류), `qwen.daemon.channelBoundRelay: true`(크로스 워크스페이스 바운드 전달 의도) 및 `qwen.daemon.channelPromptAuthorization`(채널 워커 인증 토큰; 참조 워커는 자격 증명을 보유할 때만 이를 전송합니다). `qwen.channel.prompt`은 등록된 채널 워커 인증 토큰을 요구합니다. 즉, 대상 워크스페이스에 대한 워크스페이스별 등록이거나, 크로스 워크스페이스 바운드 전달의 경우 명시적인 `qwen.daemon.channelBoundRelay: true` 마커와 기본/신뢰할 수 있는 대상을 포함한 임의의 등록된 워커 토큰입니다. 자격 증명 없이 두 마커만 전송하는 릴레이는 채널 분류를 받지 못하며, 일반 대화형 프롬프트로 허용됩니다(루프 감지 거부, 릴레이된 텍스트에 대한 실시간 PR 바인딩 백필). 외부 워커 토큰을 포함하는 일반 프롬프트 역시 채널 분류나 호출자가 제공한 표시 프로젝션을 받지 못합니다.

예약된 독립 작업 디렉터리 가드 포함 — 는 동기적으로 예외를 던지므로,

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

`202` 응답은 Agent 완료가 아닌 허용(admission)을 확인합니다. `lastEventId` 이후 세션 SSE 스트림을 관찰하고 `turn_complete` 또는 `turn_error`을 `promptId`과 상관관계 지으세요. 예약된 독립 실행 작업 디렉터리 가드를 포함하여 도달 가능한 모든 사전 큐잉 허용 검사는 동기적으로 예외를 발생시키므로, 라우트는 수락 전에 비-202 오류로 응답합니다. 가드는 세션의 관리되는 대화 바인딩이 아직 해제되지 않은 동안 `409 working_directory_missing`(`retryable: true`, `Retry-After: 5`)로 응답하며, 채널 릴레이는 유령 수락을 소비하는 대신 이벤트를 지연(defer)시킵니다. 브리지가 허용 전에 지연된 상태로 계속 거부하는 경우, 라우트는 요청의 `idempotencyKey`을 삭제하여 후속 재시도가 유령 허용으로 중복 처리되는 대신 새로 허용되도록 합니다. 이는 해당 케이스에 대한 방어적 심층 조치(depth-in-depth)이며, 현재 전달은 이미 호출자에 의해 소비되었습니다.

`turn_complete.data.stopReason`에는 에이전트가 반환한 ACP `StopReason`이 포함됩니다. 즉, `end_turn`, `max_tokens`, `max_turn_requests`, `refusal` 또는 `cancelled`입니다. 데몬은 또한 에이전트가 실행하지 않고 중단된 프롬프트에 대해 `cancelled`을 내보낼 수 있습니다. 여기에는 대기 중인 프롬프트 제거, 호출자 연결 끊김 또는 드레인/철거(teardown)가 포함되며, 이 값은 에이전트가 프롬프트를 실행했음을 증명하지 않습니다. **이 필드를 열린 문자열로 취급하세요**: 와이어(wire)에서 `string` 타입으로 지정되어 있으며, ACP 세트는 확장될 수 있고 이에 대해 포괄적으로 스위칭(switching)하는 클라이언트는 다음 추가 항목에서 깨질 것입니다.

데몬 측의 두 가지 결과는 이 필드에 도착하지 **않습니다**. 데몬 내부에서 실패한 턴(마감 시간 만료, 철거 플러시, 자식 프로세스 충돌)은 `turn_complete` stopReason이 아니라 `turn_error` 이벤트로 게시됩니다. 해당 `data`에는 항상 `message`이 포함되며, `code`는 데몬이 실패를 분류한 경우에만 존재합니다(마감 시간 만료 → `prompt_deadline_exceeded`, 철거 플러시 → `channel_closed`, `session_closed`, `session_killed` 또는 `daemon_shutdown`). 그리고 ACP 자식이 요청 중 사망하여 거부된 프롬프트에 대한 프레임에는 `code`이나 `errorKind`이 없습니다. 둘 다 선택 사항으로 취급하고 `message` 기준으로 분기하세요.

재시작 후 지속된 기록에서 복구된 턴은 스트림에 다시 게시되지 않습니다. 이는 `POST /session/:id/load` 응답 본문 내 `promptTerminals[]`에 나타나며, 지속된 꼬리 부분이 해당 턴이 완료되었음을 보여줄 경우 `{ terminal: "completed", stopReason: "reconstructed_from_transcript" }`로, 데몬이 턴 도중에 중단된 경우에는 **`stopReason` 없음** 상태로 `{ terminal: "interrupted", code: "daemon_lost" }`로 표시됩니다. `promptId`로 항목을 일치시키고 `terminal`에 따라 분기 처리하세요. 원장에 세션에 대한 증거가 없을 경우 `promptTerminals`는 응답에서 완전히 제외됩니다.

HTTP 클라이언트가 프롬프트 중 연결을 끊으면, 데몬은 에이전트에 ACP `cancel` 알림을 보내며, 이는 `stopReason: "cancelled"`로 프롬프트를 정리합니다.

`prompt_absolute_deadline`이 광고되면 `deadlineMs`이 구성된 서버 마감 시간을 단축할 수 있습니다. 만료 시 `code: "prompt_deadline_exceeded"`을 포함하는 상관관계가 있는 `turn_error`이 발생합니다. 마감 시간은 에이전트를 종료하지 않고 호출자를 해제합니다. 나중에 에이전트가 정산(settle)되면 해당 `promptId`에 대한 턴 상태 폴링(turn-status polls)은 마감 시간 오류 대신 정산된 트랜스크립트 결과를 반환합니다.

### `POST /session/:id/cancel`

세션에서 **현재 활성**인 프롬프트를 취소합니다. ACP 측에서는 이것이 요청이 아닌 알림이며, 에이전트는 활성 `prompt()`을 `cancelled`로 해결(resolving)하여 확인합니다.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **멀티 프롬프트 계약:** 취소는 활성 프롬프트에만 영향을 미칩니다. 동일한 클라이언트가 이전에 POST했고 아직 활성 프롬프트 뒤에 큐잉된 모든 프롬프트는 계속 실행됩니다. 멀티 프롬프트 큐잉은 데몬이 도입한 동작(ACP 사양에 없음)이며, 큐잉된 프롬프트의 계약은 "각각 취소하거나 채널 종료를 통해 세션을 종료하지 않는 한 계속 실행됨"입니다.

다중 클라이언트 배포 환경에서 대기 중인 프롬프트가 예상치 못한 경우, 먼저 호출자들이 기본 `sessionScope: "single"` 세션을 공유하고 있는지 확인하세요. 독립적인 스레드별 대화를 위해 `sessionScope: "thread"`로 세션을 생성하면 프롬프트가 해당 스레드 내에서만 직렬화됩니다.

### `DELETE /session/:id`

라이브 세션을 명시적으로 닫습니다. 다른 클라이언트가 연결되어 있더라도 강제 종료합니다 — 활성 프롬프트를 취소하고, 대기 중인 권한 요청을 취소로 해결하며, `session_closed` 이벤트를 게시하고, EventBus를 닫고, 데몬 맵에서 세션을 제거합니다. 디스크에 영속화된 세션은 삭제되지 않으며 — `POST /session/:id/load`을 통해 다시 로드할 수 있습니다. 사전 검사(preflight): `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

멱등성: 알 수 없는 세션에 대해 `404`을 반환합니다. 오류 인벨로프는 `code: "session_not_found"`을 사용하며; 동시 종료(close)는 `code: "session_closing"`를 반환할 수 있으며, 클라이언트는 이를 이 라우트의 동일한 성공적인 최종 상태로 간주할 수 있습니다.

> **`session_closed` 이벤트.** SSE 구독자는 스트림이 끝나기 전에 `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }`을 포함한 최종 `session_closed` 이벤트를 받습니다. SDK 리듀서는 이를 `session_died`과 동일하게 처리합니다(`alive: false` 설정, `pendingPermissions` 지움).

### `PATCH /session/:id/metadata`

변경 가능한 세션 메타데이터를 업데이트합니다. 사전 검사(preflight) `caps.features.session_metadata`을 수행하세요. 그룹화와 고정(pinning)은 의도적으로 이 라우트의 일부가 아닙니다. `session_organization` 아래에서 `PATCH /session/:id/organization`을 사용하세요.

요청:

```json
{
  "displayName": "My Investigation Session",
  "pr": {
    "number": 123,
    "url": "https://github.com/QwenLM/qwen-code/pull/123",
    "state": "open"
  }
}
```

| 필드 | 필수 | 비고 |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName` | 아니오 | 문자열. 256개 UTF-16 코드 단위보다 긴 값은 잘리며, 절단 위치가 서rogate 쌍을 고려하지 않으므로 BMP 밖의 문자로 끝나는 이름은 외톨이 surrogate 절반을 잃을 수 있습니다. 빈 값이나 공백 전용 값은 `400 invalid_metadata`로 거부되며; 이름을 변경하지 않으려면 필드를 생략하세요. |
| `pr` | 아니오 | 하나의 풀 리퀘스트를 바인딩합니다. 양의 정수 `number`, 제어 문자가 없는 최대 2,048자 길이의 HTTP(S) `url`, 그리고 선택적 `state`: `open`, `merged` 또는 `closed`이 필요합니다. |

응답:

```json
{
  "sessionId": "<uuid>",
  "displayName": "My Investigation Session",
  "prs": [
    {
      "number": 123,
      "url": "https://github.com/QwenLM/qwen-code/pull/123",
      "state": "open"
    }
  ]
}
```

`prs`은 유효한 제한된 바인딩 기록이며 갱신된 이슈 링크를 포함할 수 있습니다. 변경된 필드 그룹만 포함하는 `session_metadata_updated` 이벤트를 세션의 SSE 스트림에 게시합니다. 이름 변경은 `displayName`(이름이 설정된 경우 `titleSource` 포함)를 발생시키고 `prs`는 부재 상태로 남겨두며, PR 바인딩 변경은 `prs`를 발생시키고 설정된 경우 현재 `displayName`을 에코합니다. 이벤트에서 필드가 부재한 경우 변경되지 않은 것으로 간주하되 클리어된 것은 아니며, 전체 메타데이터가 필요할 때 `200` 본문이나 세션 목록을 다시 읽으세요.

### `PATCH /session/:id/organization` and `PATCH /workspaces/:workspace/session/:id/organization`

기존 변형 게이트(mutation gate)를 통해 로컬 세션 조직 상태를 업데이트합니다. 사전 검사: `caps.features.includes('session_organization')`; 복수형 라우트는 추가로 `workspace_qualified_rest_core`을 요구합니다. 복수형 라우트에서 `:workspace`는 먼저 정확한 등록된 워크스페이스 ID로 해석된 다음 URL 인코딩된 정규화된 절대 cwd로 해석됩니다. 선택된 런타임은 신뢰(trusted)되어야 합니다. 세션 존재 여부 및 null이 아닌 `groupId` 검증은 해당 런타임의 활성 영속화, 아카이브된 영속화, 라이브 세션 상태 및 그룹 스토어 범위로 한정되며, 기본(primary) 워크스페이스나 다른 워크스페이스로의 폴백은 없습니다. 레거시 라우트는 여전히 기본 워크스페이스 전용입니다.

요청:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| 필드 | 필수 | 비고 |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | 아니오 | 부울(Boolean). `true`은 이미 고정되지 않았다면 `pinnedAt`를 설정합니다; `false`은 `pinnedAt`를 지웁니다. |
| `groupId` | 아니오 | 사용자 정의 그룹 ID 또는 그룹화 해제를 위한 `null`. 알 수 없는 그룹 ID는 `404 { code: "group_not_found" }`를 반환합니다. |
| `color` | 아니오 | 지원되는 세션 색상 토큰 또는 세션 색상을 지우기 위한 `null`. |

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

이 상태는 데몬 런타임 저장소 디렉터리의 프로젝트 수준 세션 구성 사이드카에 저장됩니다. 이는 트랜스크립트 내용이 아니며, 트랜스크립트 `mtime`를 업데이트하지 않고, 트랜스크립트와 함께 내보내지지 않으며, 아카이브/아카이브 해제 시에도 유지됩니다.

### `POST /session/:id/heartbeat`

이 세션에 대한 데몬의 최종 확인(last-seen) 기록을 갱신합니다. 장기 실행 어댑터(TUI/IDE/web)는 주기적으로 이 항목에 ping을 보내므로, 향후 취소 정책(Wave 5 PR 24)에서 죽은 클라이언트와 조용한 클라이언트를 구별할 수 있습니다.

헤더:

| 헤더 | 필수 여부 | 비고 |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | 아니요 | `POST /session`에서 데몬이 발급한 ID를 에코합니다. 식별된 클라이언트는 클라이언트별 타임스탬프도 갱신하며, 익명 하트비트는 세션별 워터마크만 갱신합니다. 다른 곳과 동일한 `[A-Za-z0-9._:-]{1,128}` 형식을 충족해야 합니다. |

요청 본문은 비어 있습니다(`{}`로 충분함 — 현재 필드는 읽지 않음).

응답:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId`는 신뢰할 수 있는 `X-Qwen-Client-Id`가 제공된 경우에만 에코됩니다. `lastSeenAt`는 브리지가 저장한 데몬 측 `Date.now()` 에포크(ms)입니다.

오류:

- `400` — 헤더가 잘못된 경우(헤더 형식 규칙 위반) 또는 이 세션에 등록되지 않은 `clientId`가 포함된 경우 발생 `{ code: 'invalid_client_id' }` (브리지는 타임스탬프를 갱신하기 전에 `InvalidClientIdError`를 throw합니다).
- `404` — 알 수 없는 세션.

기능 게이트: 사전 체크 `caps.features.client_heartbeat`. 이전 버전의 데몬은 이 경로에 대해 `404`를 반환합니다.

### `POST /session/:id/model`

세션에 현재 바인딩된 모델 서비스 **내부**에서 활성 모델을 전환합니다. 세션별 모델 변경 큐를 통해 직렬화됩니다.

(서비스 자체를 전환하려면 — Alibaba ModelStudio vs OpenRouter 등 — 새 세션을 위해 `POST /session`에 `modelServiceId`를 전달하십시오. Stage 1에는 라이브 서비스 전환 라우트가 없습니다.)

요청:

```json
{ "modelId": "qwen-staging" }
```

응답: ACP 에이전트의 모델 전환 결과로, 그대로 전달됩니다. 데몬이 이를 재구성하지 않으므로 최상위 수준에는 `modelId`이 없습니다. `_meta.qwenModelSwitch`에서 전환 세부 정보를 읽으세요.

성공 시 SSE 스트림에 `model_switched`를 게시합니다. 실패 시 `model_switch_failed`를 게시합니다(수동적 구독자도 호출자뿐만 아니라 실패를 볼 수 있도록). 에이전트 채널 종료와 경쟁하므로 막힌 자식 프로세스가 HTTP 핸들러를 차단할 수 없습니다. 성공적인 전환은 또한 최선의 노력(best-effort)으로 세션 JSONL에 세션 모델을 기록합니다. 기록이 작성되면 데몬 로드/재개 시 인증 전에 이 세션의 모델을 복원하려고 시도합니다. 기록된 모델을 더 이상 적용할 수 없는 경우(모델 제거, 자격 증명 사용 불가), 복원은 존재하는 경우 동일 ID 레지스트리 경로를 사용합니다 — 런타임 스냅샷 기록의 경우 기록된 바인딩과 다른 엔드포인트일 수 있음 — 경로가 해결되지 않는 경우에만 `settings.model.name` 기본값으로 계속 진행합니다. `settings.model.name`는 여전히 **새로운** 세션의 기본값으로 업데이트됩니다.

### `GET /session/:id/message-groups`

기능 태그: `session_message_deletion`. 브리지 → ACP extMethod `qwen/status/session/message_groups`. 이는 라이브 세션 소유자 읽기 작업입니다: 세션의 소유 런타임을 해석하며 기본 워크스페이스로 폴백하지 않습니다. 데몬 전체 기능은 모든 세션에 대한 지원을 의미하지 않습니다. SSH 워크스페이스 및 Managed 권한 있는 저장은 삭제를 거부합니다.

활성 히스토리 순서로 안전하게 속성을 지정할 수 있는 프롬프트/응답 또는 명령 표시 그룹을 나열합니다. 일반적인 레거시 레코더에 대해 쓰기 리스를 획득하지 않습니다. 읽기는 이전 히스토리 변경 사항을 기다립니다; 반환된 스냅샷은 세션이 변경됨에 따라 스탈(stale)될 수 있습니다. 삭제 자체는 유휴(idle) 세션이 필요합니다.

응답 (200):

```json
{
  "snapshot": "<opaque selection token>",
  "groups": [
    {
      "id": "<group-id>",
      "promptId": "<prompt-id>",
      "recordIds": ["<user-record-id>", "<reply-record-id>"]
    }
  ]
}
```

`promptId` 및 `promptIds`는 선택적 프롬프트 식별자이며; `recordIds`는 그룹의 저장된 레코드를 식별합니다. 빈 히스토리는 `groups: []`를 반환합니다. 그룹 ID와 스냅샷을 불투명한(opaque) 값으로 취급하십시오; 삭제 시 반환된 스냅샷을 변경하지 않고 전달하십시오.

오류에는 알 수 없는 세션에 대한 `404`, SSH 워크스페이스에 대한 `400 unsupported_operation`, 지원되지 않는 저장소 또는 사용할 수 없는 녹화에 대한 `422 session_message_deletion_unsupported`가 포함됩니다. 기존 쓰기 무결성 오류는 `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed` 또는 `503 session_writer_unavailable`를 반환할 수도 있습니다.

### `POST /session/:id/messages/delete`

기능 태그: `session_message_deletion`. 브리지 → ACP extMethod `qwen/control/session/messages_delete`. 엄격한 변경 게이트; 기본 워크스페이스로 폴백 없이 라이브 세션 소유자 범위로 제한됩니다. 이벤트 속성을 위한 선택적 `X-Qwen-Client-Id`를 허용합니다.

요청:

```json
{ "snapshot": "<token from message-groups>", "groupIds": ["<group-id>"] }
```

두 필드 모두 필수입니다. `snapshot`는 비어 있지 않아야 하며; `groupIds`는 서로 다른 비어 있지 않은 문자열을 포함해야 합니다. 선택된 그룹은 해당 스냅샷에 여전히 존재해야 합니다. 서버는 모델 턴 뒤에 삭제를 대기열에 넣는 대신 바쁜 세션을 거부합니다.

응답 (200):

```json
{
  "deletedGroupIds": ["<group-id>"],
  "deletedPromptIds": ["<daemon-prompt-id>"]
}
```

선택된 원본 레코드와 이들이 소유한 원시 압축 컨텍스트가 JSONL에서 물리적으로 제거됩니다. 기존 요약 텍스트, 명령 효과 및 프로젝트 파일은 보존됩니다. 모든 그룹을 삭제하면 세션은 이후 프롬프트에 사용할 수 있는 상태로 남습니다.

오류:

- `400 invalid_message_groups` — 잘못된, 알 수 없거나 중복된 그룹 선택.
- `400 invalid_client_id` — 잘못된 속성 헤더.
- `404` — 세션을 알 수 없음.
- `409 session_busy` — 프롬프트 또는 히스토리 변경이 활성 상태임; 완료 후 재시도하십시오.
- `409 worktree_reset_active` — 이 세션은 worktree 재설정(replacement session)으로 대체 중임; 대체 세션에 다시 연결하십시오.
- `409 message_groups_conflict` — 선택 스냅샷이 스탈(stale)임; 그룹을 다시 가져오고 재시도하기 전에 새로운 선택을 요구하십시오.
- `409 message_history_invalid` — 히스토리를 안전하게 속성 지정할 수 없음; 선택 토큰만 변경해서는 이를 복구할 수 없음.
- `400 unsupported_operation` / `422 session_message_deletion_unsupported` — 세션/워크스페이스 저장소가 이 작업을 지원하지 않음; 요청을 새로 고치고 반복해도 활성화되지 않음.
- `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed` 또는 `503 session_writer_unavailable` — 배타적 트랜스크립트 소유권을 확립하거나 유지할 수 없음.
- `503 message_deletion_context_unavailable` — 삭제는 **영속화되었지만**, 라이브 컨텍스트를 설치할 수 없었습니다. JSON 본문에는 `persisted: true`, `deletedGroupIds` 및 `deletedPromptIds`가 포함됩니다. 권한 있는 히스토리에서 UI를 조정하고 다른 프롬프트를 보내기 전에 세션을 다시 여십시오. 아무것도 제거되지 않은 것처럼 삭제를 재시도하지 마십시오; 컨텍스트 복원이 성공할 때까지 이후 프롬프트는 계속 거부됩니다.

컨텍스트 복원이 보류 중일 때 후속 이력 의존적 변경 및 모델 요청은 `persisted` 또는 삭제 식별자 없이 503 `session_history_context_unavailable`을 반환합니다. 세션을 로드하거나 재개하면 권위 있는 JSONL 컨텍스트 설치를 다시 시도하며, 설치 성공 시에만 모델 수락을 다시 엽니다. 생명주기 종료는 계속 사용할 수 있습니다.

영속화 후 세션은 **이벤트 엔벨로프**에 데이터 `{sessionId, deletedGroupIds, deletedPromptIds}` 및 선택적 `originatorClientId`과 함께 `session_messages_deleted`을 게시합니다. 내부 API 이력 식별자는 이 와이어에서 게시되지 않습니다. 이 이벤트는 영속화된 503 경로에서도 발생합니다. 피어는 캐시된 대화 기록, 탐색, 검색 및 선택 상태를 무효화하고 권위 있는 이력을 다시 로드해야 합니다. 시작자는 성공적인 HTTP 응답과 `persisted: true` 오류를 모두 조정해야 하며, 자체 SSE 에코 처리에 의존해서는 안 됩니다.

### `POST /session/:id/recap`

기능 태그: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

세션의 "내가 어디까지 왔는지" 한 문장 요약을 생성합니다. 코어의 `generateSessionRecap`(`packages/core/src/services/sessionRecap.ts`)을 래핑하며, 이는 도구 비활성화, `maxOutputTokens: 300` 및 엄격한 `<recap>...</recap>` 출력 형식으로 빠른 모델을 대상으로 사이드 쿼리를 실행합니다. 사이드 쿼리는 세션의 기존 GeminiClient 채팅 이력을 읽으며 여기에 추가하지 **않습니다**.

요청 본문은 무시됩니다(`{}` 또는 빈 값 전송). 비엄격 변경 게이트 — 태세는 `/session/:id/prompt`과 동일합니다(호출에는 토큰 비용이 발생하지만 상태는 변경되지 않음). SSE 이벤트가 게시되지 않습니다.

응답 (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

다음 경우 `recap`은 `null`입니다(오류가 아닌 정상적인 200):

- 세션에 아직 두 번 미만의 대화 턴이 있을 때,
- 사이드 쿼리에서 추출 가능한 `<recap>...</recap>` 페이로드가 반환되지 않았을 때,
- 또는 기본 모델 오류가 발생한 경우(코어 헬퍼는 최선 노력 기반이며 예외를 던지지 않음).

오류:

- `400 {code: 'invalid_client_id'}` — 잘못된 `X-Qwen-Client-Id` 헤더.
- `404` — 알 수 없는 세션.

취소: **v1에서는 없음**. 라우트는 HTTP 클라이언트 연결 끊김을 감지하지 않으며, `AbortSignal`이 브리지로 전달되지 않고, ACP 자식은 호출자가 연결을 끊었는지 여부와 관계없이 사이드 쿼리를 완료까지 실행합니다. 유일한 상한선은 브리지의 60초 백스톱 타임아웃(`SESSION_RECAP_TIMEOUT_MS`) 및 ACP 채널 종료와의 전송 닫힘 경쟁입니다. 요약(recap)은 짧으므로(단일 시도, `maxOutputTokens: 300`, 일반적으로 ~1–5초) 이것이 허용됩니다. 대역폭 비용이 정당화된다면 향후 릴리스에서 요청 ID 기반 취소 ext-method를 통해 전체 엔드투엔드 취소를 전달할 수 있습니다.

### `POST /session/:id/generate`

기능 태그: `session_generation`.

호출자가 제공한 프롬프트로 요청 범위(request-scoped) 텍스트 생성을 실행합니다. 이 요청은 대화 기록을 읽거나 변경하지 않으며 도구를 노출하지 않습니다. 구성된 빠른 모델을 선호하며, 빠른 모델이 없거나 해석할 수 없는 경우 세션의 주 모델로 대체합니다. 이 엔드포인트는 태스크에 구애받지 않으며, 번역은 가능한 호출자 정의 프롬프트 중 하나일 뿐입니다.

요청:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

응답은 `text/event-stream`입니다. 서버는 초기 SSE 주석을 즉시 작성한 후, `started`, 선택적 `thinking` 진행 상황 이벤트, 0개 이상의 `delta` 이벤트 및 `done`를 순서대로 전송합니다. `thinking` 이벤트에는 추론 내용이 포함되지 않습니다. 스트리밍 시작 후 모델 오류가 발생하면 `error` 이벤트가 생성되며 다른 모델로 재시도하지 않습니다. 프롬프트는 UTF-8 텍스트 기준 32 KiB로 제한됩니다. HTTP 클라이언트 연결을 해제하면 생성 요청이 취소됩니다.

### `POST /session/:id/btw/stream`

기능 태그: `session_btw_stream`. 범위: live-session-owner.

라이브 세션의 대화 컨텍스트를 사용하여 트랜스크립트에 추가하거나 메인 작업을 중단하지 않고 도구 없는 사이드 질문을 합니다. 기존 JSON `POST /session/:id/btw` API는 원래 동작으로 계속 사용할 수 있습니다.

요청:

```json
{ "question": "Why?", "requestId": "unique-request-id", "resume": false }
```

`question`은 공백이 제거된 비어 있지 않은 문자열이며, 공백 제거 전 4096자로 제한됩니다. `requestId`에는 ASCII 문자, 숫자, 언더스코어 또는 하이픈으로 구성된 1–64자가 포함됩니다. `resume`는 선택 사항이며 기본값은 `false`입니다. `X-Qwen-Client-Id`가 제공될 경우 라이브 세션에 등록된 클라이언트를 지정해야 합니다. 모든 시작 및 재개는 해석된 오너 런타임과 해당 신뢰 및 변경 게이트를 사용합니다.

응답은 `text/event-stream`이며, 모든 이벤트에 `v: 1`이 포함됩니다:

| 이벤트 | 페이로드 |
| -------- | --------------------------------------------------------------------------- |
| `answer` | `{ "type": "answer", "requestId": "...", "answer": "accumulated text" }`    |
| `done`   | `{ "type": "done", "requestId": "...", "answer": "trimmed complete text" }` |
| `error`  | `{ "type": "error", "requestId": "...", "code": "...", "message": "..." }`  |

각 `answer`은 이전 텍스트를 대체하며 추가할 델타가 아닙니다. 부분 스냅샷은 공백을 유지하고, `done`은 앞뒤 공백을 제거하여 기존 JSON BTW 결과와 일치합니다. 초기 스냅샷은 비어 있을 수 있습니다. `done`와 `error`은 스트림을 종료합니다. 하트비트 주석은 15초마다 전송됩니다. 답변은 UTF-8 텍스트 기준 1 MiB로 제한되며 초과 시 `btw_failed`가 발생합니다. 데몬은 5분 후 `btw_timeout`로 생성을 종료하며, 자식 프로세스 및 브리지 정리 기한은 각각 추가로 5초와 10초가 허용됩니다. 명시적 취소는 `btw_cancelled`을 생성하고 기타 업스트림 오류는 `btw_failed`을 생성합니다.

HTTP 연결 해제는 구독자를 분리만 합니다. 동일한 `requestId`, 질문 및 클라이언트 식별자와 `resume: true`로 재연결하면 다른 모델 호출 없이 최신 스냅샷을 받을 수 있습니다. 동일한 식별자로 반복되는 초기 제출도 보존된 작업을 재사용합니다. 이벤트 커서나 `Last-Event-ID`는 필요하지 않습니다. 보존된 항목이 없는 `resume: true` 요청은 410을 반환하며 새 작업을 시작하지 않습니다. 요청은 브리지 식별자, 세션, 클라이언트 및 요청 ID로 범위가 지정되며 데몬 재시작이나 교체된 오너 런타임에서는 재개할 수 없습니다.

오너 런타임당 최대 32개의 요청이 보존됩니다. 종단 영수증 및 취소 마커는 60초 후 만료되며 새 요청을 수용하기 위해 오래된 것부터 먼저 조기 제거될 수 있습니다. 활성 요청은 제거되지 않습니다. 생성은 모델이나 구독자를 기다리는 동안 세션의 공유 아카이브 승인 잠금을 보유하지 않지만, 브리지 활동은 유휴 정리로부터 이를 보호합니다. 명시적 세션 닫기와 데몬 종료는 일반적인 취소 동작을 유지합니다.

SSE 시작 전 오류:

- `400 invalid_btw_request` — 잘못된 질문, 요청 ID 또는 재개 플래그입니다.
- `400 invalid_client_id` — 형식이 잘못되었거나 등록되지 않은 클라이언트 식별자입니다.
- `403 untrusted_workspace` — 확인된 비주 소유자가 신뢰할 수 없습니다.
- `404 session_not_found` — 활성 소유자가 존재하지 않습니다.
- `409 btw_request_conflict` — 보존된 ID가 다른 질문에 속합니다.
- `410 btw_expired` — 재개 시 보존된 요청이 없습니다.
- `429 btw_limit` — 32개의 보존된 요청이 모두 활성 상태입니다.
- `501 btw_stream_not_supported` — 소유자의 브리지가 BTW를 스트리밍할 수 없습니다.

### `DELETE /session/:id/btw/stream/:requestId`

기능 태그: `session_btw_stream`. 범위: live-session-owner(활성 세션 소유자).

시작할 때 사용한 것과 동일한 세션 및 클라이언트 식별자로 일치하는 BTW 요청을 취소합니다. 빈 `204`을 반환하며 보존된 요청에 대해 취소는 멱등적입니다. 정확한 캐시된 식별자는 클라이언트가 분리된 후에도 취소할 수 있지만 알 수 없는 ID는 여전히 등록된 클라이언트가 필요합니다. 알 수 없는 ID를 취소하면 지연된 초기 POST가 작업을 시작하지 못하도록 짧은 수명의 취소 마커가 기록됩니다.

라우팅은 스트리밍 POST와 동일한 오너 해석, 신뢰 및 변경 게이트를 사용합니다. 잘못된 ID는 `400 invalid_btw_request`을 반환하고 잘못된 클라이언트 식별자는 `400 invalid_client_id`을 반환합니다. 32개의 보존된 요청이 모두 활성 상태일 때 알 수 없는 취소는 `429 btw_limit`를 반환합니다. 런타임이 용량 한계에 도달했더라도 알려진 활성 요청은 항상 취소할 수 있습니다. 취소는 메인 프롬프트나 다른 세션의 BTW를 취소하지 않습니다.

### 변경 사항: 승인, 도구, 스킬, init, MCP 재시작

데몬은 원격 클라이언트가 데몬 호스트의 CLI를 건드리지 않고도 런타임 상태를 변경할 수 있도록 하는 다섯 가지 변경 제어 경로를 노출합니다. 승인 모드 제어는 비엄격(non-strict) 호환성 게이트를 유지합니다. 도구 토글, 스킬 토글, 워크스페이스 init 및 MCP 재시작은 엄격한 변경 게이트를 사용합니다: 신뢰할 수 있는 루프백 주(primary), 베어러 인증된 페어링된 Local Control 요청이 통과합니다. 신뢰할 수 있는 루프백 권한 없이 게이트에 도달한 토큰 없는 주 요청은 `401 {code: 'token_required'}`을 받습니다. 누락되거나 잘못된 설정된 자격 증명과 페어링되지 않은 Local Control 자격 증명은 더 일찍 일반 `401 Unauthorized`로 거부됩니다. 다섯 가지 모두:

- `X-Qwen-Client-Id` 헤더를 수락하고 도장(stamp)합니다(PR 7 감사 체인). 헤더에 신뢰할 수 있는 ID가 포함된 경우, 데몬은 해당 SSE 이벤트에 `originatorClientId`을 방출하여 교차 클라이언트 UI에서 자체 변경의 에코를 억제할 수 있도록 합니다.
- 해당 기능을 노출하기 전에 각 태그별 기능(capability)을 사전 점검(pre-flight)합니다. 경로가 없는 데몬은 `404`을 반환합니다. Skill 설정 경로의 경우, 태그 부재는 동일한 경로가 폐기된 카탈로그 검증 계약을 서비스함을 의미할 수 있습니다: 단일 대상 경로는 HTTP `404 skill_not_found` 또는 `409 skill_not_toggleable`을 반환할 수 있으며, 배치 경로는 `errors[]`에 카탈로그 파생 실패를 포함하여 HTTP 200을 반환합니다. 버전 확인용으로 경로 프로빙(probing)을 사용하지 마십시오.

도구 토글, 스킬 토글, init 및 MCP 재시작 경로는 **워크스페이스 범위** 이벤트를 방출합니다: 변경이 트리거될 때 어떤 세션이 연결되어 있었는지와 관계없이 모든 활성 세션 SSE 버스가 이벤트를 수신합니다. `approval-mode`은 변경이 하나의 세션의 `Config`에 국부적이므로 **세션 범위** 이벤트를 방출합니다.

#### `POST /session/:id/approval-mode`

기능 태그: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

활성 세션의 승인 모드를 변경합니다. 새 모드는 즉시 ACP 자식의 세션별 `Config` 내부에 적용되며, 채팅 기록이 가능한 경우 해당 세션의 트랜스크립트에서 복원됩니다. Plan의 선택된 실행 모드도 함께 복원됩니다. 워크스페이스 설정은 기본적으로 작성되지 않습니다 — `persist: true`을 전달하여 `tools.approvalMode`도 워크스페이스 설정에 작성하십시오. 기록이 비활성화되거나 저하된 경우, 모드는 활성 세션 전용으로 남습니다.

요청:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode`은 `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` 중 하나여야 합니다(core의 `ApprovalMode` 열거형 미러; SDK는 런타임 검증을 위해 `DAEMON_APPROVAL_MODES`을 내보냅니다). `persist`의 기본값은 `false`입니다.

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

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — 알 수 없는 모드 리터럴입니다.
- `400 {code: 'invalid_persist_flag'}` — `persist`이 boolean이 아닙니다.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — 요청된 모드가 신뢰할 수 있는 폴더를 필요로 합니다(신뢰할 수 없는 워크스페이스에서의 특권 모드는 core의 `Config.setApprovalMode`에 의해 거부됩니다).
- `404` — 알 수 없는 세션입니다.

SSE 이벤트(세션 범위): `approval_mode_changed` with `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

기능 태그: `workspace_tool_toggle`. 순수 파일 IO — ACP 왕복 없음.

워크스페이스의 `tools.disabled` 설정 목록에서 도구 이름을 토글합니다. 여기에 나열된 도구는 전혀 **등록되지 않습니다**(도구를 등록 상태로 유지하고 호출만 거부하는 `permissions.deny`과 구별됨). 내장 도구와 MCP로 발견된 도구 모두 비활성화 집합을 참조하는 `ToolRegistry.registerTool`를 거칩니다.

> ⚠️ **이름은 레지스트리가 노출하는 식별자와 정확히 일치해야 합니다.** 별칭 해석은 수행되지 않습니다 — 라우트는 경로 매개변수에 있는 문자열을 `tools.disabled`에 저장하며, 다음 ACP 자식은 등록 시 `tool.name`과 비교합니다. 내장 도구는 정식 레지스트리 이름(스네이크 케이스 동사 형태)을 사용합니다: `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` 등 — CLI가 표시하는 디스플레이 레이블(`Shell`, `Read`, `Write`)이 아닙니다. MCP로 발견된 도구는 자격화된 `mcp__<server>__<name>` 형식을 사용하며(이는 `tool_toggled` 이벤트가 브로드캐스트하고 `GET /workspace/mcp`이 나열하는 형식이기도 함), `Bash`을 비활성화해도 다음 세션에서 `run_shell_command`의 등록을 방지하지는 않습니다.

활성 ACP 자식은 이미 등록된 도구를 유지합니다 — 토글은 **다음** ACP 자식 스폰(spawn) 시점에 적용됩니다. 현재 데몬에서 변경 사항을 효과적으로 만들려면 `POST /workspace/mcp/:server/restart`(MCP 소스 도구의 경우) 또는 새 세션 생성과 결합하십시오.

알 수 없는 도구 이름도 허용됩니다: 아직 설치되지 않은 MCP 도구를 사전에 비활성화하는 것은 정당한 사용 사례입니다.

요청:

```json
{ "enabled": false }
```

응답 (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

오류:

- `400 {code: 'invalid_tool_name'}` — 경로 매개변수가 비어 있거나, 경로 매개변수가 256자 제한을 초과합니다.
- `400 {code: 'invalid_enabled_flag'}` — `enabled`이 누락되었거나 부울 값이 아닙니다.

SSE 이벤트(워크스페이스 범위): `{toolName, enabled, originatorClientId?}`과 함께 `tool_toggled`.

#### Skills 설정 및 런타임 라우트 분리

기능 태그: `workspace_skills_config_runtime`.

`GET /workspace/config/skills`은 데몬 로컬 전역 구성 소유자를 읽습니다. `GET /workspaces/:workspace/config/skills`은 정확히 등록된 워크스페이스 구성을 읽으며, 활성 또는 신뢰할 수 있는 런타임을 요구하지 않습니다. 둘 다 필수 `runtimeEpoch` 없이 일반적인 Skills 상태 형식을 반환합니다:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "skills": []
}
```

`GET /workspace/runtime/skills` 및 `GET /workspaces/:workspace/runtime/skills`은 선택된 신뢰할 수 있는 런타임을 시작하지 않고 읽습니다. 활성 카탈로그에는 이를 생성한 런타임 생성 번호가 포함됩니다:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "runtimeEpoch": 4,
  "skills": []
}
```

전역 설치 및 삭제는 `POST /workspace/config/skills/install` 및 `DELETE /workspace/config/skills/:name?scope=global`을 사용합니다. 워크스페이스 설치, 삭제 및 활성화는 `POST /workspaces/:workspace/config/skills/install`, `DELETE /workspaces/:workspace/config/skills/:name?scope=workspace` 및 `POST /workspaces/:workspace/config/skills/:name/enable`을 사용합니다. 구성 쓰기는 런타임 조정 스케줄링 전에 영구 상태를 커밋합니다. 현재 업데이트할 수 있는 런타임이 없으면 `activation`은 `deferred`이고, 업데이트가 큐에 추가되면 `reconciling`입니다. 무동작(no-op) 토글은 런타임 새로 고침이 발생했다고 주장하는 대신 파사드의 활성 상태를 유지합니다.

구성 삭제는 데몬 로컬 Skill 인벤토리를 열거할 수 없을 때 결정적인 not-found 응답 대신 `503 skills_config_unavailable`을 반환합니다. 런타임 삭제(`DELETE /workspace/skills/:name` 및 해당 워크스페이스 한정 형식)는 새로 열거된 카탈로그를 요구합니다: 런타임 카탈로그나 데몬 로컬 열거 중 어느 것도 초기화된 카탈로그를 제공하지 않으면 보존된 관찰 결과가 존재하더라도 동일한 `503 skills_config_unavailable`을 반환합니다. `404 skill_not_found`은 카탈로그가 열거되었고 이름이 그 안에 없다는 의미입니다.

단일 변경(mutation) 소유자는 워크스페이스 범위를 `400 workspace_scope_requires_qualified_workspace`으로 거부하며, 한정된 변경은 전역 범위를 `400 global_scope_requires_singular_owner`로 거부합니다. 한정된 쓰기는 신뢰할 수 있는 워크스페이스를 요구합니다. 레거시 주입된 브리지는 런타임 조정이 필요한 한정된 구성 쓰기에 대해 `501 workspace_runtime_not_supported`을 반환합니다. 알 수 없거나, 제거되었거나, 전환 중이거나, 배수 중인 워크스페이스는 표준 워크스페이스 한정 오류를 따르며 절대 기본(primary)으로 폴백하지 않습니다.

#### 네이티브 Skill 아카이브 설치 및 영수증(receipts)

`skill_archive_install` 및 `skill_zip_file_source`은 네이티브 ZIP 입력과 이에 해당하는 소유자 범위 영수증 쿼리를 광고합니다. 둘 다 최신(config) 인터페이스로 제한됩니다. 이들의 `limits.maxSkillArchiveBytes`, `maxSkillArchiveExpandedBytes`, `maxSkillArchiveEntries` 및 `maxSkillArchiveManifestBytes`은 오직 이 두 소스에만 적용됩니다: 압축 시 50 MiB, 해제 시 200 MiB, ZIP 레코드 4096개, 그리고 유효 루트 `SKILL.md`의 경우 32 MiB. 명시적 디렉터리와 무시되는 메타데이터는 필터링 전에 레코드로 계산되며, 암시적 부모는 계산되지 않습니다. 무시되는 메타데이터는 팽창(inflate)되지 않습니다. 레거시 base64, 디렉터리 및 GitHub 제한 사항(10 MiB JSON 파서 포함)은 변경되지 않습니다.

- `POST /workspace/config/skills/install-archive?name=...&attemptId=...`은 전역에 설치하고; `/workspaces/:workspace/config/skills/install-archive`은 선택된 워크스페이스에 설치합니다. HTTP 콘텐츠 인코딩 없이 `application/octet-stream`을 보내십시오. 라우트가 범위를 고정합니다.
- 기존 최신 JSON 설치 라우트도 `{ "name": "example", "scope": "global", "attemptId": "<UUID>", "source": { "type": "zip-file", "path": "/absolute/daemon/path.zip", "sha256": "<optional 64 hex digits>" } }`을 허용합니다. 한정된 라우트는 `scope: "workspace"`을 요구합니다. 데몬은 열린 일반 파일을 프라이빗 스토리지로 복사하며 호출자의 파일을 절대 삭제하거나 이름을 바꾸지 않습니다. 복사 중에 소스를 안정적으로 유지하십시오. 메타데이터 검사만으로는 원자적 스냅샷이 아닙니다.
- `GET /workspace/config/skills/install-attempts/:attemptId` 및 `GET /workspaces/:workspace/config/skills/install-attempts/:attemptId`은 원래 소유자를 쿼리합니다. 응답에는 `running`(단계 포함), `committed`, `not_committed` 또는 `recovery_required`이 포함됩니다. 누락되거나 접근할 수 없는 영수증은 결과를 확인할 수 없음을 의미합니다. 쿼리는 런타임을 시작하지 않으며 변경 조정자(coordinator)를 획득하지도 않습니다.

클라이언트는 전송 전에 UUID를 제공해야 하며, SDK에서 이를 생성할 수 있습니다. 동일한 소유자 아래 중복 ID는 설치를 반복하지 않고 409를 반환합니다. 데몬당 두 개의 작업이 활성 상태일 수 있으며 여기에는 잠금 대기 및 정리(clean-up)가 포함되고, 추가 수용(admission)은 `Retry-After`과 함께 429를 반환합니다. 영수증 접수부터 게시 승인까지 적용되는 하나의 120초 예산(budget)이 있습니다. 게시 전 취소는 작업을 중지시키며, 승인 후 커밋 또는 롤백은 HTTP 연결이 사라지더라도 완료됩니다.

성공 시 변경 결과와 활성 상태를 유지하며 `attemptId` 및 `archiveSha256`을 추가합니다. 커밋 후 활성 실패는 실패한 커밋이 아니라 `activationWarning`입니다. 영수증은 프로세스 로컬 역사적 결과이며, 작업이 종료된 후 10분 동안 보관되고 용량은 256개이며 조기 퇴거(eviction)는 없습니다. 이들은 이후 작업이 설치된 콘텐츠를 대체하지 않았다는 것을 증명하지 않습니다. 재시작, 만료 또는 소유자 접근 손실은 결과를 알 수 없게 만듭니다. 클라이언트는 모호한 실패 후 반드시 쿼리해야 하며 자동으로 재전송해서는 안 됩니다.

#### `POST /workspace/skills/refresh`

기능 태그: `workspace_session_refresh`. 워크스페이스 한정 형식은 `POST /workspaces/:workspace/skills/refresh`입니다. 단일 라우트는 기본 런타임을 소유하며, 한정된 라우트는 정확히 선택된 신뢰할 수 있는 런타임을 해석하고 절대 기본으로 폴백하지 않습니다. 둘 다 엄격한 변경 게이트와 기존 클라이언트 신원 확인을 사용합니다.

모든 활성 세션 또는 제공된 세션 ID에 대해서만 Skill 설정과 콘텐츠를 명시적으로 다시 로드합니다:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

`sessionIds`을 생략하면 모든 활성 세션을 새로 고칩니다. ID는 비어 있지 않은 문자열이어야 하며 요청 순서에 따라 중복 제거됩니다. `[]`은 세션이나 캐시를 새로 고치지 않고 0 개수를 반환합니다. 잘못된 요청 형식은 HTTP 400을 반환합니다. 알 수 없는 ID와 다른 워크스페이스가 소유한 ID는 어떤 새로 고침이 시작되기 전에 HTTP 404를 반환합니다. 선택된 세션은 이를 소유한 실행 엔진 채널로만 라우팅되며, 관련 없는 채널은 새로 고침 명령을 받지 않습니다.

응답 (200):

```json
{
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "configsRefreshed": 3,
  "configsFailed": 0,
  "reason": "all"
}
```

개수는 선택된 세션과 해당 소유자 채널에 대해 새로 고침된 공유/세션 구성을 설명합니다. 선택은 즉각적인 세션 새로 고침 및 명령 알림을 제어합니다. 공유 채널 캐시는 변경될 수 있으며, 워크스페이스 이벤트는 워크스페이스 전체에 걸쳐 유지됩니다. 명시적 요청은 Skill 조정자의 리비전이나 준비 상태를 업데이트하지 않습니다. Skill 활성화/비활성화, 설치/삭제 및 자동 조정은 기존 전체 새로 고침 동작을 유지합니다. 이 라우트는 Skill 토글 본문에 `refreshRuntime` 또는 `sessionIds`을 추가하지 않습니다.

#### `POST /workspace/skills/:name/enable`

기능 태그: `workspace_skill_settings_toggle`. 워크스페이스 한정 형식은 `POST /workspaces/:workspace/skills/:name/enable`입니다.

이름에 대한 워크스페이스 Skill 설정을 업데이트합니다. 활성화 시 데몬은 먼저 확장 프로그램이 작성한 이름을 최신 카탈로그 관찰 데이터를 기준으로 해석하며, 보존된 데이터와 읽기 스로틀링을 우회하고 필요 시 ACP 및 데몬 로컬 폴백을 기다립니다. 두 최신 소스 모두 실패하면 레거시 이름 휴리스틱 전에 보존된 관찰 데이터를 사용합니다. 이름은 카탈로그와 대조하여 검증되지 않습니다. 비활성화 시 카탈로그를 읽지 않습니다. 공백이 제거된 요청 이름은 영속성에 전달되며 응답에 반환됩니다. 어떤 이름을 활성화하든 설치 전이라도 워크스페이스 `skills.enabled` 옵트인이 기록되며, 비활성화 시 해당 옵트인이 제거되고 워크스페이스 `skills.disabled` 항목이 추가됩니다. 더 이상 로드되지 않는 Skill에 대한 기존 항목은 보존되며, 대상의 중복/대소문자 변형 항목은 병합됩니다. 상위 범위에서 상속된 하드 `skills.disabled` 항목은 유효 가용성에 대해 여전히 권위를 가지지만, 워크스페이스 범위가 자체 선언을 기록하거나 제거하는 것을 방지하지는 않습니다. 그 외의 워크스페이스 선언은 일반적인 `skills.disabled > skills.enabled > skills.defaultDisabled` 해석에 참여하며, 상위 범위의 `skills.defaultDisabled` 또는 `skills.enabled` 항목을 재정의할 수 있습니다.

이는 ACP `qwen/skills/setEnabled` 관리형 skill 작업 및 `disable-model-invocation` frontmatter 필드와 다릅니다. 활성 Extension 부모의 경우 유효한 Skill 가용성은 `skills.disabled` > `skills.enabled` > `skills.defaultDisabled` > 워크스페이스 내부 재정의 > 매니페스트 `skillStates` > 활성화 순서를 따릅니다. 하드 비활성화와 기본 비활성화 모두 스킬을 슬래시 명령어/모델 가용성에서 제거하고 이후 스킬 실행을 거부합니다. `disable-model-invocation: true`은 직접 사용자 호출은 유지하면서 모델 호출에서만 스킬을 숨깁니다.

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

`activation`은 `changed`과 독립적으로 자식 생존 여부와 필요한 새로 고침을 반영합니다. ACP 자식이 살아 있고 모든 필요한 새로 고침이 성공하면 `applied`이고, 생존 확인 시 살아 있는 자식이 없거나 변경된 요청이 필요한 새로 고침 중 자식/세션을 잃으면 `deferred`이며, 다른 필요한 새로 고침 중 하나라도 실패하면 `partial`입니다. 따라서 no-op(변경 없음)인 경우 `changed: false`을 포함하여 `applied` 또는 `deferred`일 수 있으며; `changed`이 true이고 활성화가 `deferred`인 경우, 자식이 시작될 때 영속화된 선언이 사용됩니다. 바쁜 세션은 필요한 새로 고침에 포함됩니다. 데몬은 ACP 자식과 모든 활성 세션에 대해 워크스페이스 설정을 다시 로드하고, SkillManager 소비자에게 알리며, `available_commands_update`을 푸시합니다. 이미 모델로 전송된 요청은 재작성되지 않으며, 이후 검증, 명령어 스냅샷 및 모델 컨텍스트는 새로운 상태를 사용합니다. 영속성이 실패하면 새로 고침이나 이벤트가 발생하지 않습니다. 세션 새로 고침이 실패하면 커밋된 설정은 유지됩니다. 자식이 세션별 결과를 반환하면 세션 수는 정확합니다. 이러한 결과를 반환하기 전에 새로 고침 제어 자체가 실패하면 `sessionsFailed: 1`은 새로 고침 요청이 실패했음을 나타내는 보수적인 하한값입니다.

오류:

- `400 {code: 'invalid_skill_name'}` — 경로 매개변수가 비어 있거나 256자를 초과함.
- `400 {code: 'invalid_enabled_flag'}` — `enabled`이 누락되었거나 부울 값이 아님.
- `403 {code: 'untrusted_workspace'}` — 선택된 워크스페이스가 신뢰되지 않음.

변경 사항은 각 변경된 키(`skills.disabled` 및/또는 `skills.enabled`)에 대해 워크스페이스 범위 `settings_changed` 이벤트를 재사용하며 새 이벤트 유형을 추가하지 않습니다. 이러한 각 이벤트에는 동일한 `mutation` 객체: `{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`가 포함됩니다. `id`는 하나의 토글 요청으로 생성된 모든 설정 이벤트를 상관관계 지습니다. `skills`은 실제로 워크스페이스 설정 선언이 변경된 요청된 이름과 요청된 활성화 값을 나열합니다. 상위 범위 설정으로 인해 유효 가용성은 변경되지 않을 수 있습니다. 워크스페이스 skill 상태 셀에는 선택적 `disabledReason: 'hard' | 'default' | 'inactive_extension'` 및 `lockedScope: 'system' | 'user' | 'systemDefaults'` 필드가 포함됩니다.

#### `POST /workspace/skills/enable`

기능 태그: `workspace_skill_settings_batch_toggle`. 워크스페이스 한정 형식은 `POST /workspaces/:workspace/skills/enable`입니다.

하나의 요청으로 최대 100개의 이름에 대한 워크스페이스 Skill 설정을 업데이트합니다. 상한은 중복 제거 전 원본 `skillNames` 항목 수를 계산합니다. 이름은 공백이 제거되고 처음 발견된 순서와 대소문자를 유지하면서 대소문자를 구분하지 않고 중복이 제거됩니다. 활성화 시 데몬은 먼저 확장 프로그램이 작성한 이름을 최신 카탈로그 관찰 데이터를 기준으로 해석하며, 보존된 데이터와 읽기 스로틀링을 우회하고 필요 시 ACP 및 데몬 로컬 폴백을 기다립니다. 두 최신 소스 모두 실패하면 레거시 이름 휴리스틱 전에 보존된 관찰 데이터를 사용합니다. 이름은 카탈로그와 대조하여 검증되지 않습니다. 비활성화 시 카탈로그를 읽지 않습니다. 결과적으로 발생하는 모든 선언 변경 사항을 최대 하나의 잠긴 설정 쓰기로 적용하며, 변경 사항이 있을 경우 활성 세션을 한 번 새로 고칩니다. 활성화 시 아직 설치되지 않은 이름을 포함하여 항상 명시적인 워크스페이스 `skills.enabled` 옵트인을 기록하므로 Extension의 내부 비활성화를 재정의할 수 있습니다. 동일한 선언을 반복하면 no-op(변경 없음)으로 유지됩니다. 예상치 못한 영속성 또는 런타임 생성 실패는 전체 요청을 실패시킵니다.

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
    },
    {
      "skillName": "missing",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": []
}
```

잘못된 형식의 요청은 `invalid_skill_names`, `invalid_skill_name` 또는 `invalid_enabled_flag`와 함께 HTTP 400을 반환합니다. 인증, 워크스페이스 신뢰, 클라이언트 식별, 예상치 못한 영속성 실패 및 런타임 생성 실패는 표준 라우트 게이트를 통해 전체 요청을 실패시킵니다. `errors`은 호환성을 위해 응답에 남아 있지만 구조적으로 유효한 이름의 경우 비어 있습니다. 배치 수준의 `activation`, `sessionsRefreshed` 및 `sessionsFailed`은 자식 생존 여부와 모든 변경된 결과가 공유하는 단일 라이브 세션 새로 고침을 설명합니다. 대상이 변경되지 않은 배치도 자식이 살아 있으면 `applied`로, 존재하지 않으면 `deferred`로 응답할 수 있어 단일 Skill no-op 응답과 일치하므로 각 결과의 `changed` 플래그에서 실제로 변경된 내용을 유추해야 합니다. 최소한 하나의 대상이 변경되면 데몬은 단일 Skill 라우트와 동일한 `settings_changed` 변경 메타데이터를 발생시키며; 해당 요청의 모든 `skills.disabled` / `skills.enabled` 이벤트는 하나의 `mutation.id`을 공유합니다.

#### `PUT /skills/activation`

기능: `user_skill_activation` (User 설정 영속성이 사용 가능할 때 광고됨). 이 프로세스 전역 변경은 신뢰된 워크스페이스나 설치된 Skill 스캔 없이 User Skill 환경설정을 저장합니다. 일반적인 인증된 변경 게이트를 사용하며; 선택적 `X-Qwen-Client-Id`은 배수 중인 런타임을 포함하여 여전히 관리되는 런타임에 속해야 합니다.

```json
{
  "skillNames": ["rust:pdf", "go:review"],
  "state": "enabled"
}
```

1–100개의 이름(각각 최대 256자)을 제공합니다. 이름은 공백이 제거되고 대소문자를 구분하지 않고 중복이 제거됩니다. `state`은 `enabled` 또는 `disabled`입니다. `disabled`만 `mode`를 허용합니다: `hard` (기본값) 또는 `default`. 이름은 아직 설치되지 않아도 됩니다. 잘못된 배치는 쓰기 전에 거부됩니다.

Qwen은 설정 쓰기 잠금 하에서 최신 사용자(User) 설정을 읽고, 각 명시적 이름을 `skills.enabled`, `skills.disabled` 또는 `skills.defaultDisabled`에 추가하며, 다른 두 목록에서 동일한 이름을 제거하여 한 번의 저장으로 처리합니다. 다른 이름, 철자, 범위 및 설정은 보존됩니다. 특히 `rust:pdf` 활성화는 `pdf` 제한을 제거하지 않습니다. 명시적 맨 이름(bare names)은 기존 매칭 규칙을 유지합니다. 시스템 제한은 여전히 적용됩니다.

```json
{
  "scope": "user",
  "state": "enabled",
  "results": [
    { "skillName": "rust:pdf", "changed": true },
    { "skillName": "go:review", "changed": true }
  ],
  "propagation": "queued"
}
```

비활성화된 응답에는 정규화된 `mode`도 포함됩니다. `propagation`은 측정된 가용성이 아닌 스케줄링을 설명합니다: `queued`는 최소 하나의 라이브 런타임이 새로고침을 큐에 넣었음을 의미하고; `deferred`은 저장된 설정이 런타임 생명주기 작업을 기다리고 있음을 의미하며; `not_required`는 이 요청이 아무것도 변경하지 않았음을 의미합니다. 노오퍼레이션(no-op)은 쓰기를 수행하거나 이벤트를 발행하지 않으며 이전 새로고침의 완증을 인증하지 않습니다. 유효한 상태를 확인하려면 기존 워크스페이스 구성 및 런타임 Skill 상태 엔드포인트를 읽으십시오.

성공적인 변경 사항은 구성 캐시를 무효화하고 `scope: "user"`이 포함된 일반 `settings_changed` 이벤트를 브로드캐스트합니다. 새로고침은 사용자와 워크스페이스 설정을 원자적으로 다시 읽습니다; 실패한 구성 또는 세션 새로고침은 생명주기 복구를 위한 대기 중인 작업과 제한된 재시도를 유지합니다. 기존 워크스페이스 전용 새로고침 동작은 변경되지 않습니다.

잘못된 입력은 HTTP 400 (`invalid_skill_names`, `invalid_skill_name`, `invalid_skill_activation_state` 또는 `invalid_skill_activation_mode`)을 반환합니다. 커밋 전에 종료된 기본 런타임 생성은 설정 라우트와 마찬가지로 `Retry-After: 1`와 함께 HTTP 503을 반환합니다. SDK는 `setUserSkillsActivation(skillNames, activation, { clientId? })`를 노출하며 예비 구성 읽기 없이 하나의 PUT을 전송합니다.

#### `POST /workspace/init`

기능 태그: `workspace_init`. 순수 파일 IO — ACP 왕복 없음, **LLM 호출 없음**.

데몬의 기본 워크스페이스 루트에 빈 `QWEN.md`(또는 워크스페이스 `context.fileName` 설정 오버라이드)을 스캐폴딩합니다. 기계적 처리만 수행 — AI 주도 콘텐츠 채우기의 경우 `POST /session/:id/prompt`로 후속 조치하십시오.

기본값은 대상 파일이 공백이 아닌 내용을 가지고 존재할 때 덮어쓰기를 거부합니다. 공백 전용 파일은 없는 것으로 간주됩니다(로컬 `/init` 슬래시 명령과 일치).

요청:

```json
{ "force": false }
```

응답 (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action`은 신규 생성 시 `'created'`이고, 기존 공백 전용 파일이 그대로 남겨진 경우(쓰기 수행 안 함) `'noop'`이며, `force: true`가 비어 있지 않은 내용을 대체한 경우 `'overwrote'`입니다. `workspace_initialized` SSE 이벤트는 응답 동작을 반영하므로 — 관찰자는 실제 디스크 변경 사항에만 반응하기 위해 `action !== 'noop'`으로 필터링할 수 있습니다.

오류:

- `400 {code: 'invalid_force_flag'}` — `force`이 부울(boolean)이 아닙니다.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — 파일이 공백이 아닌 내용으로 존재하며 `force`이 생략되거나 false입니다. 본문에는 절대 경로와 크기(바이트)가 포함되어 있어 SDK 클라이언트가 재-stat 없이 "N 바이트 덮어쓸까요?" 프롬프트를 렌더링할 수 있습니다.

SSE 이벤트(워크스페이스 범위): `{path, action, originatorClientId?}`이 포함된 `workspace_initialized`.

#### `POST /workspace/mcp/reload`

영구화된 MCP 설정을 워크스페이스 발견 구성과 모든 활성 세션에 다시 로드합니다. 워크스페이스 한정 형식은 `POST /workspaces/:workspace/mcp/reload`입니다.

요청 본문:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll`는 선택 사항이며 기본값은 `false`로 점진적 조정 동작을 유지합니다. true인 경우 데몬은 설정 조정을 완료한 후 자격 있는 모든 구성된 MCP 서버에 재연결합니다. 또는 `forceReconnectWhich: ["server-a", "server-b"]`를 전달하여 지정된 서버에만 재연결할 수 있습니다. 이 옵션들은 상호 배타적입니다. 강제 재연결 시 각 트랜스포트는 다른 로컬 Qwen Code 프로세스가 토큰 저장소에 쓸 수 있는 자격 증명을 읽지만 OAuth 인증 흐름을 시작하지는 않습니다.

라우팅은 `202 { "accepted": true }`을 반환하며 최종 연결 상태를 확인하려면 `GET /workspace/mcp`을 폴링하십시오. 잘못된 옵션 값은 400을 반환합니다.

#### `POST /workspace/mcp/:server/restart`

기능 태그: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

ACP 자식의 `McpClientManager.discoverMcpToolsForServer`를 통해 구성된 MCP 서버를 재시작합니다(연결 해제 + 재연결 + 재검색). PR 14 v1의 회계에서 라이브 예산 스냅샷을 사전 검사하므로, 예산 포화 상태의 워크스페이스에서의 재시작은 `BudgetExhaustedError` 연쇄를 트리거하는 대신 소프트 거부를 반환합니다.

요청 본문은 비어 있습니다(`{}`). 경로 매개변수는 `mcpServers` 구성에 나타나는 대로 URL 인코딩된 서버 이름입니다.

응답 (200) — `restarted`에 대한 판별 유니온(discriminated union):

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

소프트 스킵 사유(모두 200 반환):

| `reason` | 의미 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'` | 이 서버에 대한 다른 검색/재시작이 이미 진행 중입니다. 라우트는 원래 프로미스를 기다리는 대신 즉시 반환합니다. 호출자는 짧은 지연 후 재시도해야 합니다. |
| `'disabled'` | 서버가 구성되어 있지만 `excludedMcpServers`에 나열되어 있습니다. 재시작 전에 다시 활성화하십시오. |
| `'budget_would_exceed'` | 데몬이 `--mcp-budget-mode=enforce`이고, 대상 서버가 현재 `reservedSlots`에 없으며, 라이브 총량이 `clientBudget`에 도달했습니다. 호출자는 먼저 슬롯을 해제해야 합니다. |

오류 (non-2xx):

- `400 {code: 'invalid_server_name'}` — 경로 매개변수가 비어 있음.
- `404` — 서버 이름이 `mcpServers` 구성에 없거나, 활성 ACP 채널이 없음(재시작은 본질적으로 활성 `McpClientManager` 인스턴스가 필요함).
- `500` — 내부 오류(예: `ToolRegistry`이 초기화되지 않음).

SSE 이벤트(워크스페이스 범위): 성공 시 `{serverName, durationMs, originatorClientId?}`이 포함된 `mcp_server_restarted`; 소프트 스킵 시 `{serverName, reason, originatorClientId?}`이 포함된 `mcp_server_restart_refused`.

#### `POST /workspaces/:workspace/language`

설정 영구화가 가능할 때 등록되는 세션리스(sessionless) 워크스페이스 UI 언어 동기화. 소유권: 선택된 런타임. 워크스페이스 ID 또는 인코딩된 절대 cwd를 해석하고, 활성 신뢰 런타임을 요구하며 해당 런타임에 대해 클라이언트 소유권을 검증합니다. 비활성 생성은 `503 workspace_runtime_unavailable`을 반환합니다; 해석되지 않은 선택기는 기본 워크스페이스로 폴백하지 않습니다.

요청: `{ "language": "zh" }`. 언어는 `POST /language`과 동일한 지원 코드를 사용합니다. 선택된 워크스페이스의 `general.language`만 영구화한 후, 병합된 유효 설정을 읽고 `scope: "workspace"`와 함께 `qwen/control/user/language`을 통해 이미 활성인 채널들을 동기화합니다. 콜드 채널은 프로세스를 시작하거나 대화를 생성하지 않고 건너뜁니다. 출력 언어 및 모델 설정은 변경되지 않으며; `syncOutputLanguage: true`는 거부됩니다.

응답은 `outputLanguage: null`와 함께 `POST /language`과 동일한 형태를 가지며; `language`는 유효하게 구성된 로케일(`auto` 포함)이고 `refresh`는 선택된 런타임만 계산합니다. 성공 시 워크스페이스 `language_changed` 이벤트가 발행됩니다. SDK는 세션 전송과 독립적으로 REST를 통해 `client.workspaceByCwd(cwd).setUiLanguage(language)`를 노출합니다.

#### `POST /language`

기능 태그: `user_language_sync` (조건부 — 설정 영속화가 사용 가능한 경우에만 광고되며, `workspace_settings`과 동일한 조건). Bridge → ACP extMethod `qwen/control/user/language`은 신뢰할 수 있는 런타임별로 라이브 채널이 있을 때 호출됩니다.

세션 없는 **사용자 수준** 언어 동기화(이슈 #10234)로, 세션이 생성되기 전에 언어를 전환해야 하는 호스트(예: 환영 페이지)를 위한 기능입니다. 소유권 분류: 프로세스 전역 — 사용자 전역 상태(`~/.qwen/settings.json`, 전역 `~/.qwen/output-language.md`)만 변경하고 최선의 노력(best-effort)으로 런타임을 새로 고치므로, 워크스페이스 선택자나 세션 ID가 필요하지 않습니다. 비엄격한 `mutate()` 게이트 뒤에 등록되며, 형제 항목인 `POST /session/:id/language`과 일치합니다.

데몬 프로세스가 단일 작성자입니다: `general.language`을(를) 저장하고(`syncOutputLanguage`이 true인 경우 `general.outputLanguage` 및 전역 `output-language.md`도 포함), 그 후 브로드캐스팅합니다. 각 신뢰할 수 있는 런타임은 자체 프로세스 UI 언어를 전환하고 디스크에서 사용자 범위 설정을 다시 로드합니다. `syncOutputLanguage`이 true이면 모든 로컬 세션의 시스템 지침도 새로 고칩니다. 세션 범위 라우트와의 차이점:

- 프로젝트에 바인딩된 출력 언어 파일은 재작성되지 않습니다 — 워크스페이스에 자체 `.qwen/output-language.md`이 있는 세션은 해당 오버라이드를 유지합니다(새로 고침 시 프로젝트 범위가 우선함).
- 세션이 0개이고 라이브 런타임 채널이 0개인 것은 오류가 아니라 **성공**입니다. 라이브 채널이 없는 런타임은 건너뛰고(실패로 간주하지 않음) 다음에 채널이 스폰될 때 저장된 파일을 읽습니다.
- 신뢰할 수 없는 워크스페이스 런타임은 세션 라우트의 `403 untrusted_workspace` 태도와 동일하게 건너뜁니다.

요청:

```json
{ "language": "zh", "syncOutputLanguage": true }
```

`language`은 `/capabilities` `supportedLanguages`에 나열된 코드 중 하나여야 합니다(`'auto'` 추가됨); `syncOutputLanguage`의 기본값은 `false`입니다.

응답 (200):

```json
{
  "language": "zh",
  "outputLanguage": "Chinese",
  "refresh": { "runtimes": 1, "sessions": 2, "failed": 0 }
}
```

`language`은 데몬이 해석한 UI 로케일이므로 `'auto'` 요청이 구체적인 언어를 반환할 수 있습니다; 호스트는 선택자 상태를 위해 저장된 `general.language` 설정을 읽어야 합니다. `syncOutputLanguage`이 false인 경우 `outputLanguage`은 `null`입니다. `refresh.runtimes`은 라이브 채널을 통해 전환을 적용한 런타임 수를 계산합니다; `refresh.sessions`은 세션별 시스템 지침 새로 고침 횟수를 합산합니다; `refresh.failed`은 세션별 새로 고침 실패와 실패한 런타임을 집계합니다(브로드캐스팅은 최선의 노력이며, 저장 성공 후에는 요청을 절대 실패시키지 않습니다).

오류:

- `400 {code: 'invalid_language', allowed: [...]}` — 알 수 없는 언어 코드.
- `400 {code: 'invalid_sync_flag'}` — `syncOutputLanguage`이 부울 값이 아닙니다.
- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id`이 어떤 런타임에도 알려지지 않은 클라이언트입니다(헤더는 선택 사항이며, 세션이 없을 때는 생략하십시오).
- `500 {code: 'persist_error'}` — 사용자 설정 또는 출력 언어 파일 쓰기 실패; 실패한 단계와 그 이후의 모든 단계는 실행되지 않았습니다(`general.language` 쓰기 등 이전에 적용된 단계는 롤백되지 않습니다).
- `404` — 데몬이 이 라우트보다 이전 버전이거나 설정 영속화 없이 빌드되었습니다(기능 태그를 확인하십시오).

SSE 이벤트(워크스페이스 범위, 모든 런타임의 세션 버스에서): `language_changed` with `{language, outputLanguage, userLevel: true, originatorClientId?}`. `userLevel: true` 마커는 이 브로드캐스팅을 `sessionId` 대신 전달하는 세션 라우트의 세션별 이벤트와 구별합니다.

### `GET /session/:id/events` (SSE)

세션의 이벤트 스트림을 구독합니다.

헤더:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
X-Qwen-Event-Epoch: ...  ← optional, pairs the cursor with its bus epoch
X-Qwen-Client-Id: ...    ← optional client identity and diagnostic correlation
```

쿼리 매개변수:

| 매개변수 | 필수 여부 | 비고 |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | 아니요 | 구독자별 **라이브 프레임 백로그** 상한. 범위 `[16, 2048]`, 기본값 256. 구독 시 강제 푸시되는 재생 프레임은 프레임 및 바이트 상한에서 제외됩니다; 실제로 이를 소비하는 것은 구독자가 큰 `Last-Event-ID: 0` 재생을 아직 처리 중일 때 도착하는 라이브 이벤트입니다. 콜드 재연결 시에는 값을 높여 소비자가 따라잡기 전에 라이브 꼬리가 느린 클라이언트 경고/퇴출을 트리거하지 않도록 하십시오. 라이브 직렬화 바이트 상한은 데몬 측에 고정되어 있으며(기본값 2 MiB) 쿼리 매개변수가 없습니다. 범위를 벗어나거나 10진수가 아니거나 존재하지만 비어 있는 값은 SSE 핸드셰이크가 열리기 전에 `400 invalid_max_queued`을 반환합니다. 사전 검사 `caps.features.slow_client_warning` — 오래된 데몬은 이 매개변수를 조용히 무시합니다. |
| `connectReason` | 아니요 | 클라이언트가 보고한 진단 힌트: `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync` 또는 `unknown`. 잘못된 값은 `unknown`로 정규화되며 핸드셰이크를 거부하지 않습니다. 데몬은 인증, 재생, 퇴출, 중복 제거 또는 스트림 교체에 이 필드를 사용하지 않습니다. |
| `previousStreamId` | 아니요 | 클라이언트가 보고한 이전 허용된 REST/SSE 스트림의 UUID. 잘못된 값은 무시됩니다. 이는 최선의 노력(lineage) 추적일 뿐이며 스트림 동작을 변경하지 않습니다. |

성공적인 핸드셰이크에는 `X-Qwen-SSE-Stream-Id: <uuid>`이 포함됩니다. 브라우저 게이트웨이는 이 응답 헤더를 보존하고 `Access-Control-Expose-Headers`을 통해 노출해야 합니다. 오래된 데몬이나 중간 매개체는 이를 생략할 수 있습니다; 클라이언트는 정상적으로 계속 진행하며 lineage를 사용할 수 없는 것으로 취급해야 합니다. 이 ID는 물리적 REST/SSE 연결을 식별하고 데몬 생명주기, 큐 진단 및 요청 추적을 상관관계 짓습니다.

프레임 형식. `data:` 줄은 한 줄에 JSON 문자열화된 **전체 이벤트 엔벨로프**입니다 — `{id?, v, type, data, originatorClientId?}`. ACP 특정 페이로드(`sessionUpdate`, `requestPermission` 인자 등)는 엔벨로프의 `data` 필드 아래에 위치합니다; 엔벨로프 자체의 `type`는 SSE `event:` 줄과 일치합니다.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← terminal frame for byte overflow, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

SSE 수준의 `id:` / `event:` 줄은 EventSource 호환성을 위해 `envelope.id` / `envelope.type`을 복제합니다. Raw-`fetch` 소비자(SDK의 `parseSseStream`)는 모든 것을 JSON 엔벨로프에서 읽고 SSE 프리앰블 줄을 무시합니다.

| 이벤트 유형 | 트리거 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update` | 모든 ACP `sessionUpdate` 알림(LLM 청크, 도구 호출, 사용량) |
| `permission_request` | Agent가 도구 승인을 요청함 |
| `permission_resolved` | 일부 클라이언트가 `POST /permission/:requestId`을 통해 권한에 투표함 |
| `permission_partial_vote` | (합의 전용) 투표가 기록되었지만 정족수에 도달하지 못함. `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`을 전달합니다. 사전 검사 `caps.features.permission_mediation`. |
| `permission_forbidden` | 투표가 활성 정책(`designated` 불일치, `local-only` 비루프백 또는 `consensus` 유권자가 스냅샷에 없음)에 의해 거부됨. `{requestId, sessionId, clientId?, reason}`을 전달합니다. 사전 검사 `caps.features.permission_mediation`. |
| `model_switched` | `POST /session/:id/model` 성공 |
| `model_switch_failed` | `POST /session/:id/model` 거부됨 |
| `session_died` | Agent 자식이 예상치 못하게 충돌했습니다. **종료: 이 프레임 이후 SSE 스트림이 닫히고 세션은 `byId`에서 사라집니다.** 구독자는 `POST /session`을 통해 재연결하여 새로운 세션을 스폰해야 합니다. |
| `slow_client_warning` | 구독자 로컬: 라이브 프레임 백로그 또는 라이브 직렬화 바이트 백로그가 75% 이상 채워짐. **비종료(non-terminal)** — 스트림은 계속되며, 경고는 강제 제거(eviction) 전 사전 알림(heads-up)입니다. `threshold`이 `frames`, `bytes` 또는 `frames_and_bytes`일 때 `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}`을 포함합니다. 오버플로 에피소드당 한 번만 발생하며, 두 측정값 모두 37.5% 미만으로 비워진 후 다시 활성화됩니다. `id` 없음(합성(synthetic)). 사전 점검(pre-flight) `caps.features.slow_client_warning`. |
| `client_evicted` | 구독자 로컬: 큐 오버플로. `reason`은 라이브 프레임 상한에 대해 `queue_overflow`이고, 라이브 직렬화 바이트 상한에 대해 `queue_bytes_overflow`입니다. **종료(terminal): 이 프레임 이후 SSE 스트림이 닫힘** (`id` 없음 — 합성). 동일 세션의 다른 구독자는 계속 진행됩니다. |
| `stream_error` | 팬아웃(fan-out) 중 데몬 측 오류. **종료(terminal): 이 프레임 이후 SSE 스트림이 닫힘** (`id` 없음 — 합성). |

재연결(reconnect) 의미:

- 세션별 링(ring)(기본 깊이 **8000**, `qwen serve --event-ring-size <n>`로 조정 가능)에서 `id > n`을 사용하여 이벤트를 재생하기 위해 `Last-Event-ID: <n>`을 전송합니다.
- **갭 감지:** 동일한 에폭(epoch) 내에서 유지되는 첫 번째 링 ID가 `<n> + 1`보다 크면, 데몬은 남은 접미사를 재생하기 전에 `reason: 'ring_evicted'`을 포함한 ID 없는 `state_resync_required` 프레임을 방출합니다. 다른 이유는 `epoch_reset`, `seeded_replay_not_in_ring` 및 `replay_budget_exceeded`이며, 예산 신호는 전달된 재생 접두사 뒤에 따릅니다. 트리거, 커서 필드 및 복구 규칙은 [재동기화(reasons and ordering)](./daemon/09-event-schema.md#resync-reasons-and-ordering)를 참조하세요.
- SDK는 `awaitingResync`을 래치(latch)합니다; 클라이언트는 `POST /session/:id/load`을 호출하고 현재 제한된 재생 스냅샷 윈도우에서 재구축해야 합니다. 해당 스냅샷은 이전 메모리 재생 항목이 드롭될 경우 자체적으로 `history_truncated`로 시작할 수 있습니다; 이 마커는 정보 제공용이며 또 다른 재동기화 루프를 시작해서는 안 됩니다. 선택적 페이지네이션 앵커는 [재생 윈도우 eviction 시 고정](./daemon/09-event-schema.md#history-truncation-anchor)됩니다.
- ID는 세션의 이벤트 버스 에폭 내에서 단조 증가(monotonic)하며 1부터 시작합니다. 거부된 게시(publish)는 ID를 소비해서는 안 됩니다; [이벤트 순서 불변 조건](./daemon/09-event-schema.md#state-and-forward-compatibility)을 참조하세요.
- 합성 프레임(`client_evicted`, `slow_client_warning`, `stream_error`, `state_resync_required`, `replay_complete`)은 의도적으로 `id`을 생략하여 다른 구독자를 위한 순서 슬롯을 소모하지 않습니다. `replay_complete`은 빈 재생이나 불완전한 재생을 포함하여 재생의 끝을 나타냅니다; 이는 재동기화가 완료되었음을 의미하지 않습니다.

백프레셔(backpressure):

- 구독자별 큐는 기본적으로 `maxQueued: 256`개의 라이브 항목과 데몬 소유의 2 MiB 라이브 직렬화 바이트 상한을 사용합니다. 재연결 중 재생 프레임, `slow_client_warning` 및 `client_evicted`은 두 상한을 모두 우회합니다.
- SSE 요청에서 `?maxQueued=N`(범위 `[16, 2048]`)을 통해 프레임 상한만 재정의합니다. 의도적으로 `?maxQueuedBytes`는 없습니다; 클라이언트는 데몬 메모리 예산을 높일 수 없습니다.
- 구독자의 라이브 프레임 백로그 또는 라이브 바이트 백로그가 75% 이상 채워지면 버스는 해당 구독자에게 `slow_client_warning` 합성 프레임을 강제로 푸시(force-push)합니다(오버플로 에피소드당 한 번; 두 측정값 모두 37.5% 미만으로 비워진 후 다시 활성화됨). 스트림은 열려 있으며 — 경고는 클라이언트가 더 빠르게 비우거나 cleanly detach + reconnect할 수 있도록 하는 사전 알림입니다.
- 라이브 프레임 상한이 오버플로되면 버스는 `reason: "queue_overflow"`을 포함한 `client_evicted`을 방출합니다. 빈 라이브 큐는 하나의 oversized 이벤트를 변경 없이 허용합니다. 비어 있지 않은 큐에서 바이트 오버플로를 거부하기 전에, 버스는 MCP 앱의 전체 `rawOutput.html`을 `''`으로 드롭할 수 있으며, 이때 `fallbackText`이 비어 있지 않아야 합니다. 그 사본이 적합하면 eviction이나 재동기화 신호 없이 전달이 계속됩니다. 그렇지 않으면 `reason: "queue_bytes_overflow"`을 방출합니다. 어떤 eviction에서도 종료 프레임은 강제로 푸시되고 구독은 닫힙니다.
- 이 선택적 앱 저하(degradation)는 큐잉된 전달에만 영향을 미칩니다. 직접 전달 및 재생 링은 원본을 보존합니다; 압축(compaction) 재생 윈도우는 자체 예산을 적용합니다. 저하된 사본은 원본 링 항목과 동일한 이벤트 ID를 가집니다. 따라서 ID가 포함된 전달된 페이로드가 링의 페이로드와 일치하지 않을 수 있으며, 해당 ID 이후로 재개해도 HTML을 복원하지 못합니다. 문서를 요구하는 클라이언트는 페이지 크기 제한에도 영향을 받는 영속화된 트랜스크립트를 명시적으로 다시 페이징(re-page)해야 합니다.

### `POST /session/:id/permission/:requestId`

아래 문서화된 것과 동일한 투표를 하지만 지정된 라이브 세션을 소유한 런타임을 통해 라우팅합니다. 새로운 다중 워크스페이스 통합은 레거시 프로세스 전역 라우팅 대신 이 형식을 사용해야 합니다. 사전 점검 `caps.features.session_permission_vote`.

요청 본문, 중재 정책, 결과 및 성공 응답은 `POST /permission/:requestId`과 동일합니다. 선택적 `X-Qwen-Client-Id` 헤더는 지정 및 합의 정책에 참여합니다. 실패는 명시된 대로 안정적인 `code` 값을 사용하며 잘못된 입력이나 보류 중인 요청 경쟁 손실 시 `code`이 생략될 수 있습니다:

- `400` — 잘못된 투표 본문(`code` 없음)이나 잘못된 클라이언트 식별자(`invalid_client_id`), 또는 선택된 옵션이 제공되지 않은 경우 `invalid_option_id`. 같은 투표를 재시도하는 대신 제공된 옵션을 다시 읽어보십시오.
- `403` — 활성 정책이 투표자를 거부할 경우 `permission_forbidden`, 또는 기본(primary) 소유자가 아닌 워크스페이스가 신뢰되지 않을 경우 `untrusted_workspace`. 신뢰되지 않은 기본 소유자는 이 신뢰 검사에서 면제되며 투표가 수락될 수 있습니다.
- `404` — 활성 소유자가 존재하지 않거나 요청이 대기 중(pending)이 아닐 경우 `session_not_found`, 또는 `code`일 때.
- `500` — `cancel_sentinel_collision`: 에이전트의 `allowedOptionIds`에 예약된 `__cancelled__` 센티널이 포함된 경우, 또는 `ambiguous_session_owner`: 여러 워크스페이스가 세션을 주장하는 경우.
- `501` — 이 빌드가 구현하지 않는 정책에 대해 `permission_policy_not_implemented`.
- `503` — 소유 런타임이 사용할 수 없거나 데몬(daemon)이 더 이상 작업을 수락하지 않을 경우 `workspace_runtime_unavailable`, 또는 `daemon_draining`일 때.

기본 브리지(primary bridge)에 대해서는 재시도하지 않습니다. TypeScript SDK 메서드는 `respondToSessionPermission()`입니다.

### `POST /permission/:requestId`

대기 중인 `permission_request`에 대한 투표를 수행합니다. 활성 **중재 정책(mediation policy)**이 승자를 결정합니다:

| 정책 | 동작 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (기본값) | 검증된 모든 유권자가 승리합니다; 이후 유권자는 `404`을 받습니다. F3 이전 기준선(baseline). |
| `designated` | 프롬프트 발신자(`originatorClientId`)만 결정합니다; 발신자가 아닌 사람은 `403 permission_forbidden / designated_mismatch`을 받습니다. 익명 프롬프트의 경우 첫 응답자(first-responder)로 폴백합니다. |
| `consensus` | N-of-M 유권자가 동의해야 합니다 (기본값 `N = floor(M/2) + 1`, `policy.consensusQuorum`로 재정의). `N`에 도달한 첫 번째 옵션이 승리합니다. 해결되지 않은 투표는 `200` + `permission_partial_vote` SSE 프레임을 받습니다. |
| `local-only` | 루프백 유권자만 결정합니다. 원격 호출자는 `403 permission_forbidden / remote_not_allowed`을 받습니다. |

활성 정책은 `settings.json`의 `policy.permissionStrategy` 아래에서 구성되며 `/capabilities`의 `body.policy.permission`에 표시됩니다. 빌드 지원 집합을 위해 `caps.features.permission_mediation` (`modes: [...]` 포함)를 사전 확인하세요.

> **F3 (#4175): 다중 클라이언트 권한 조정.** F3는 위의 네 가지 정책을 추가했습니다. F3 이전 데몬은 첫 번째 응답자를 하드코딩했으며, 구성된 정책이 `first-responder`일 때 와이어 형식은 비트 단위로 변경되지 않습니다. 새로운 이벤트(`permission_partial_vote`, `permission_forbidden`)는 추가적입니다. 이전 SDK는 이를 `unrecognized_known_event`으로 보고 우아하게 무시합니다.

> **권한 시간 초과(기본적으로 비활성화됨).** `permission_request`은 다음 조건 중 하나가 발생할 때까지 대기 상태로 유지됩니다: (a) 일부 클라이언트가 여기서 투표함, (b) `POST /session/:id/cancel` 발생, (c) 프롬프트를 구동하는 HTTP 클라이언트 연결 해제(프롬프트 중 취소 시 미해결 권한을 `cancelled`로 해결), (d) 세션 종료, (e) 데몬 종료, **또는 (f) 구성된 시간 초과 발생**. 시간 초과가 발생하면 에이전트의 `requestPermission`이 `{outcome: 'cancelled'}`로 해결되고, 감사 링(audit ring)에 `permission.timeout` 항목이 기록되며, 데몬 stderr에 한 줄의 추적 정보(breadcrumb)가 출력되고, SSE 버스는 표준 `permission_resolved` 취소(cancelled) 프레임을 팬아웃(fan out)하여 구독자가 정리하도록 합니다. 공유 시간 초과는 `BridgeOptions.permissionResponseTimeoutMs` 또는 `qwen serve --permission-response-timeout-ms`을 통해 구성할 수 있습니다. 기본값은 `0`이므로 일반 권한 및 `ask_user_question` 모두 인간의 결정을 무기한으로 기다립니다. 투표자 취소, 세션 취소, 연결 해제 정리 및 데몬 종료는 여전히 대기 중인 상호작용을 취소(canceled) 상태로 해결합니다.

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — 허용 / 거부 / 한 번 진행 등, 에이전트가 제시한 선택지에 따름
- `{ "outcome": "cancelled" }` — 요청 드롭 (내부적으로 `cancelSession` / `shutdown`가 수행하는 것과 일치)

응답:

- `200 {}` — 투표가 허용되었습니다 (해결됨 또는 합의 정족수 하에 기록됨)
- `400` — 잘못된 형식의 투표 본문(`code` 없음), `invalid_client_id`, 또는 선택된 옵션이 제공되지 않았을 경우 `invalid_option_id`; 동일한 투표를 재시도하는 대신 제공된 옵션을 다시 읽으십시오.
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: 활성 정책이 투표를 거부했습니다
- `404 { "error": "..." }` — requestId를 알 수 없습니다 (이미 해결됨, 존재하지 않았거나 세션이 해체됨)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: 에이전트의 `allowedOptionIds`에 예약된 센티널 `'__cancelled__'`가 포함되어 있음; 에이전트 / 데몬 계약 위반
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 전방 호환성: 정책 리터럴이 스키마에 들어왔지만 해당 중재자 분기가 아직 빌드되지 않음 (현재는 도달 불가능하며 향후 정책을 위해 예약됨)

투표 성공 후, 모든 연결된 클라이언트는 동일한 `requestId`과 선택된 `outcome`로 `permission_resolved`을 봅니다. `consensus` 하에서는 중간 투표들이 정족수에 도달할 때까지 추가로 `permission_partial_vote`를 팬아웃합니다.

### 인증 디바이스 플로우 라우트 (issue #4175 PR 21)

데몬은 OAuth 2.0 디바이스 권한 부여 그랜트(RFC 8628)를 중개하여 원격 SDK 클라이언트가 로그인을 트리거할 수 있도록 하며, 이때 토큰은 클라이언트가 아닌 **데몬** 파일 시스템에 저장됩니다. 데몬이 IdP를 직접 폴링하며, 클라이언트의 역할은 검증 URL과 사용자 코드를 표시하고 (선택적으로) 완료 이벤트를 위해 SSE를 구독하는 것뿐입니다.

기능 태그(Capability tag): `auth_device_flow` (항상 광고됨). v1에서 지원되는 제공자(provider): `qwen-oauth`.

> [!note]
>
> Qwen OAuth 무료 티어는 2026-04-15에 중단되었습니다. 이 프로토콜에서 `qwen-oauth`을 레거시 v1 제공자 식별자로 취급하십시오. 새로운 클라이언트는 현재 지원되는 인증 제공자가 있을 경우 이를 우선적으로 사용해야 합니다.

**런타임 위치.** 데몬은 가능하더라도 브라우저를 실행하지 않습니다. 클라이언트가 로컬에서 `open(verificationUri)`을 호출할지 여부를 결정합니다. 헤드리스 포드(표준 모드 B 배포)에서는 사용자가 브라우저가 있는 장치에서 URL을 엽니다. 권장 UX는 `docs/users/qwen-serve.md`을 참조하세요.

**이벤트에 토큰 누출 없음.** `auth_device_flow_started`에는 `{deviceFlowId, providerId, expiresAt}`만 포함됩니다. 사용자 코드와 검증 URL은 POST 201 본문을 통해 점대점으로 반환되며 `GET /workspace/auth/device-flow/:id`를 통해 전달됩니다. 이들은 SSE에서 브로드캐스트되지 않습니다.

**제공자별 싱글톤.** 플로우가 대기 중일 때 동일 제공자에 대한 두 번째 `POST`은 멱등적 인계입니다. 새 IdP 요청을 시작하는 대신 `attached: true`로 기존 항목을 반환합니다.

#### `POST /workspace/auth/device-flow`

엄격한 변형 게이트: 토큰 없는 신뢰할 수 있는 루프백 주요 요청은 통과합니다. 신뢰할 수 있는 루프백 권한 없이 게이트에 도달한 토큰 없는 주요 요청은 `401 token_required`을 받습니다. 누락되거나 잘못된 구성된 자격 증명 및 페어링되지 않은 로컬 제어 자격 증명은 더 일찍 단순 `401 Unauthorized`로 거부됩니다.

요청:

```json
{ "providerId": "qwen-oauth" }
```

응답 (`201` 신규 시작, `200` 멱등적 인계):

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

- `400 unsupported_provider` — 알 수 없는 `providerId` (응답에 `supportedProviders` 포함)
- `409 too_many_active_flows` — 워크스페이스 상한(4) 도달; `DELETE`로 하나 취소하세요
- `401 token_required` — 엄격한 게이트가 신뢰할 수 있는 루프백 권한 없이 토큰 없는 주요 요청을 거부했습니다
- `502 upstream_error` — IdP가 예상치 못한 오류를 반환했습니다

#### `GET /workspace/auth/device-flow/:id`

현재 상태를 읽으세요. 대기 중인 항목은 `userCode/verificationUri/expiresAt/intervalMs`을 에코합니다. 종단 항목(5분 유예 기간)은 이를 드롭하고 `status` + 선택적 `errorKind/hint`를 표시합니다.

알 수 없는 ID 및 유예 기간 후 제거된 항목에 대해 `404 device_flow_not_found`을 반환합니다.

#### `DELETE /workspace/auth/device-flow/:id`

멱등적 취소:

- 대기 중인 항목 → `204` + `auth_device_flow_cancelled` 발행
- 종단 항목 → `204` 노오퍼레이션 (이벤트 재발행 없음)
- 알 수 없는 ID → `404`

#### `GET /workspace/auth/status`

대기 중인 플로우 + 지원되는 제공자의 스냅샷:

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

다섯 가지 유형화된 이벤트 (워크스페이스 범위, 모든 활성 세션 버스로 팬아웃됨):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST 성공; SDK는 구독해야 함 (여기에는 userCode가 없음, 필요 시 GET으로 가져오기)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — 데몬이 업스트림 `slow_down`을 준수함; GET을 폴링하는 클라이언트는 간격을 이에 맞춰 조정해야 함
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — 자격 증명이 영구 저장됨; `accountAlias`는 비PII 레이블(이메일/전화번호 절대 포함 안 됨)임
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — 종료 상태; `errorKind`는 `expired_token | access_denied | invalid_grant | upstream_error | persist_failed` 중 하나임. `persist_failed`는 데몬 내부 오류: IdP 교환은 성공했지만 데몬이 자격 증명을 영구적으로 저장할 수 없었음(EACCES / EROFS / ENOSPC). 사용자는 기본 디스크 조건이 해결된 후 재시도해야 함.
- `auth_device_flow_cancelled` `{deviceFlowId}` — 대기 중인 항목에 대해 DELETE 성공

> **MCP 호환 아님.** MCP 인증 사양(2025-06-18)은 리디렉션 콜백을 사용하는 OAuth 2.1 + PKCE 인증 코드 플로우를 요구하며, 이는 헤드리스 파드 데몬에서는 작동하지 않음. 모드 B의 디바이스 플로우 인터페이스는 데몬 전용임 — MCP 호환 서버를 대상으로 하는 클라이언트는 다른 인증 경로를 사용해야 함.

### 세션 첨부 파일 청크 업로드

기능: `session_attachment_chunk_upload`. 아래 네 가지 경로는 모두 활성 세션 런타임이 소유한 변경 작업(mutations)입니다. 기존 베어러 토큰 및 선택적 `X-Qwen-Client-Id` 헤더를 사용합니다. 업로드는 생성한 세션 스토어와 정확한 클라이언트 식별자에 속합니다. 생략된 식별자는 명명된 클라이언트와 구별됩니다.

`U = /session/:id/attachment-uploads`라고 가정:

| 요청 | 본문 | 응답 |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST U` | JSON `{ name, mimeType, size }`, 최대 4 KiB | 201 `{ uploadId }` |
| `POST U/:uploadId/chunks?offset=N` | 원시(raw) `application/octet-stream`, 최대 512 KiB | 200 `{ offset }`, 다음 바이트 오프셋 |
| `POST U/:uploadId/complete` | 본문 불필요; JSON 본문은 파싱되지만 무시됨 | 200 기존 첨부 파일 참조 `{ type, attachmentId, mimeType, size }` |
| `DELETE U/:uploadId` | 빈 값 | 수신 중, 실패 또는 없는 업로드에 대해 204; 완료 중이거나 완료된 경우 409 |

최대 첨부 파일 크기는 여전히 8 MiB입니다. 메타데이터는 기존 파일명/MIME 규칙을 따릅니다; 빈 이미지 파일은 유효하지 않습니다. 순차적인 512 KiB 청크를 보내며, 마지막 청크에는 정확한 나머지를 포함합니다. 직전 청크만 동일한 오프셋, 길이 및 바이트로 재시도할 수 있습니다. 갭(gap), 겹침(overlap), 변경된 재시도 또는 조기 완료를 반환하면 409; 잘못된 입력은 400, 크기 초과 입력은 413, 지원되지 않는 청크 미디어 타입 또는 JSON 문자셋은 415 `invalid_attachment_upload_content_type`을 반환합니다. 생성 및 청크 요청에서 지원되지 않는 인코딩은 415 `invalid_attachment_upload_encoding`을 반환합니다. 알 수 없거나 만료되었거나 소유자가 다른 업로드 ID는 세 개의 POST 경로에서 404를 반환합니다; DELETE는 없는 업로드에 대해 204를 반환하고 완료 중이거나 완료 후에는 409를 반환합니다. 생성 및 청크 요청은 압축된 본문을 허용하지 않습니다. 완료 경로는 전역 JSON 파서를 사용하므로, 유효한 압축된 JSON 본문은 무시될 수 있지만, 잘못된 JSON은 완료 전에 거부됩니다.

완료 처리는 저장소 앞뒤에서 세션/클라이언트/런타임 소유권을 검증합니다. 동시 또는 반복적인 완료는 추가 쓰기 없이 동일한 결과를 반환합니다. 동시 세션 복사는 일시적으로 `503 attachment_upload_store_busy`과 `retryable: true`을 반환합니다; 복사 종료 후에도 단계적(staged) 바이트는 동일한 업로드 ID로 완료하는 데 사용할 수 있습니다. 실제 저장소 장애는 해당 업로드 ID에 대해 최종적입니다. 수신 중인 업로드는 생성 후 5분 후에 만료됩니다. 성공/실패 영수증은 5분 후에 만료되며 데몬 프로세스당 최대 1024개로 제한됩니다. 세션 닫기/삭제 및 최종 클라이언트 등록 취소는 미완료 업로드를 무효화합니다. 완료된 첨부 파일만 읽기, 참조 또는 복사가 가능합니다. DELETE는 이미 확정 중이거나 완료된 첨부 파일을 롤백할 수 없습니다; 응답 손실 후에도 완료된 파일은 남을 수 있습니다.

스테이징은 프로세스 내 모든 런타임에 걸쳐 128 MiB 및 32개의 활성 업로드로 제한되며, 세션 스토어당 최대 8개의 활성 업로드가 허용됩니다. 한도에 도달하면 `429 attachment_upload_capacity_exceeded`을 반환합니다; 기존 요청 속도 제한도 적용됩니다. 이는 스테이징 버퍼 제한이며 전체 프로세스 메모리 제한이 아닙니다. 임시 ID는 데몬 재시작 후 유지되지 않습니다.

TypeScript SDK는 이 기능이 광고될 때 512 KiB보다 큰 첨부 파일에 대해 이 프로토콜을 자동으로 사용하며, 클라이언트당 두 개의 동시 파일과 순차적 청크를 사용합니다. ACP 트랜스포트에서도 인증된 REST를 사용하고, 유효한 발견(discovery) 정보를 60초 동안 캐싱하며, 더 작은 파일과 이전 버전 데몬을 위해 기존 원시(raw) 엔드포인트를 유지합니다. 네트워크 오류, 요청 시간 초과 또는 502/503/504 이후에 추가/완료 재시도는 최대 두 번 수행합니다; 속도 제한 재시도는 5분 운영 마감 시간 내에서 `Retry-After`을 준수합니다. 모호한 생성 및 용량 부족 실패는 재시도하지 않습니다. 실패한 업로드는 독립적인 2초 청소(clean-up) 시도를 한 번 가집니다. `DaemonAttachmentUploadError`은 원인(cause)과 `httpStatus`를 보존하며; 그 `status`은 업로드 내부의 404를 생략하여 소비자가 이를 지원되지 않는 레거시 첨부 파일 라우팅으로 오인하지 않도록 합니다.

라이프사이클 및 호환성 세부 사항은 [전체 설계 문서](../design/session-attachment-chunk-upload.md)를 참조하세요.

### 모델 카탈로그 재로드

`workspace_model_reload` 기능은 `POST /workspaces/:workspace/models/reload`을 광고합니다. 이 인증된, 신뢰된, 선택된 런타임 변경 작업은 사용자 및 워크스페이스 범위 설정을 다시 읽고, 선택된 런타임 환경 오버레이를 새로 고치며, 모델 제공자 구성을 재구축하기 전에 ACP 자식 프로세스에서 환경을 다시 적용합니다. 환경 변경은 제공자 자격 증명을 지원하며 다른 환경 키를 포함할 수 있습니다; 응답이나 설정 이벤트에는 보고되지 않습니다. 데몬 프로세스 환경 및 워크플로우 활성화는 변경되지 않습니다. `{ "status": "applied" | "deferred" | "failed" }`를 반환하며; `deferred`은 활성 ACP 자식이 카탈로그를 적용하지 않았음을 의미합니다. 플랫폼 카탈로그를 가져오지 않고, 설정을 작성하지 않으며, 활성 대화 모델을 전환하지 않고, 설정 이벤트를 브로드캐스트하지 않습니다. 세션 생성 후 현재 선택 가능한 모델을 확인하려면 기존 세션의 `/session/:id/context`를 읽고, 세션 생성 전에는 선택된 워크스페이스의 제공자를 읽으세요. 알 수 없거나, 신뢰되지 않거나, 드레인 중이거나, 닫힌 런타임은 주(primary)로 폴백하지 않습니다.

## 스트리밍 와이어 형식

이벤트는 표준 EventSource 프레임으로 전송됩니다. 데몬은 프레임당 하나의 `data:` 줄을 씁니다(JSON에는 `JSON.stringify` 뒤에 임베디드 개행 문자가 없음); `packages/sdk-typescript/src/daemon/sse.ts`의 SDK 파서는 수신 측에서 이것과 사양이 허용하는 다중 `data:` 형식을 모두 처리합니다.

## 스트리밍 중 오류 프레임

SSE 구독자에게 서비스를 제공하는 동안 브리지 이터레이터가 예외를 발생시키면, 데몬은 최종 `stream_error` 프레임을 방출합니다(`id` 없음). `data:` 줄은 전체 엔벨로프(envelope)입니다(이 문서의 다른 모든 SSE 프레임과 동일한 형태); 실제 오류 메시지는 `envelope.data.error` 아래에 있습니다:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

그런 다음 연결이 닫힙니다.

## 환경 변수

| 변수 | 목적 |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer 토큰. 부팅 시 앞뒤 공백이 제거됩니다. |

## 소스 레이아웃

| 경로 | 목적 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts` | yargs 명령 + 플래그 스키마 |
| `packages/cli/src/serve/run-qwen-serve.ts` | 리스너 생명주기 + 신호 처리 |
| `packages/cli/src/serve/server.ts` | Express 앱 조립, 미들웨어 순서 지정 및 나머지 직접 라우트 |
| `packages/cli/src/serve/routes/*.ts` | 세션, SSE, 워크스페이스 인증, 워크스페이스 상태 및 파일 라우트를 포함하는 집중된 Express 라우트 그룹 |
| `packages/cli/src/serve/auth.ts` | bearer + Host 허용 목록 + CORS 거부 |
| `packages/cli/src/serve/acp-session-bridge.ts` | spawn-or-attach, 세션별 FIFO 및 권한 등록을 위한 CLI 로컬 브리지 호환성 퍼사드 |
| `packages/acp-bridge/src/status.ts` | 읽기 전용 데몬 상태 와이어 타입 + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts` | 자격 증명 마스킹을 포함하여 `process.*` 상태에서 `/workspace/env` 페이로드를 구축하는 순수 헬퍼 |
| `packages/acp-bridge/src/eventBus.ts` | 제한된 비동기 큐 + 재생 링 |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS 클라이언트 |
| `packages/sdk-typescript/src/daemon/sse.ts` | EventSource 프레임 파서 |
| `integration-tests/cli/qwen-serve-routes.test.ts` | 18개 케이스, LLM 없음 |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3개 케이스, 로컬 가짜 OpenAI 서버로 백업된 실제 `qwen --acp` 자식 프로세스 (POSIX 전용; Windows에서는 건너뜀) |
