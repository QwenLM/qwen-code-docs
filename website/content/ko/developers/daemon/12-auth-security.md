# 인증 및 보안 모델

## 개요

`qwen serve`는 기본적으로 로컬 데몬이며, 잘못된 설정 시 노출될 수 있는 표면입니다. 보안 모델은 **계층적**으로 설계되어 설정 오류 시 안전하게 실패합니다.

1. **바인드** — 루프백이 아닌 바인드에서 베어러 토큰 없이 시작하려고 하면 **시작이 거부됩니다**.
2. **베어러 인증** — `bearerAuth` 미들웨어가 상수 시간 SHA-256 비교를 통해 `/health`를 제외한 모든 라우트를 보호합니다(`require_auth`는 루프백과 `/health`까지 확장합니다).
3. **Host 헤더 허용 목록** — 루프백에서는 `localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal`(포트 포함)만 허용됩니다. DNS 리바인딩에 대한 방어입니다.
4. **Origin 제어** — 런타임 앱은 항상 가변 허용 목록(`MutableOriginAllowlist`) 위에 `allowOriginCors`를 설치합니다: `--allow-origin <pattern>` 항목이 시딩하고, Local Control이 활성화된 동안 LAN origin을 추가합니다. 일치하지 않는 origin은 403 거부 엔벨로프를 받습니다. 무조건적 거부 방어벽(`denyBrowserOriginCors`)은 런타임 시작 전에 응답하는 부트스트랩 앱에만 남아 있습니다.
5. **라우트별 뮤테이션 게이트** — Wave 4의 변경 라우트는 토큰이 설정되지 않은 경우에도 루프백에서 `401` 응답을 선택적으로 사용할 수 있으며, 고유한 `code: 'token_required'` 오류를 반환합니다.
6. **디바이스 플로우 인증** — 제공자용 OAuth 별도 표면(`POST /workspace/auth/device-flow` + `/:id`에 대한 GET/DELETE).

이 문서에서는 각 계층과 부트 경로에서 적용되는 명시적 불변식을 설명합니다.

## 책임

- 안전하지 않은 설정에서의 부팅을 거부합니다.
- 모든 HTTP 요청을 베어러(설정된 경우) + 호스트(루프백) + Origin 검사를 통해 차단합니다.
- Wave 4 라우트가 선택적으로 사용하는 라우트별 뮤테이션 게이트를 제공합니다.
- SSE 이벤트를 통해 표시되는 제공자 OAuth 플로우를 구동하는 디바이스 플로우 레지스트리를 호스팅합니다.

## 아키텍처

### 부트 시점 거부 규칙

`run-qwen-serve.ts`에서:

```ts
if (!isLoopbackBind(opts.hostname) && !token) {
  throw new Error('Refusing to bind <host>:<port> without a bearer token. ...');
}
if (opts.requireAuth && !token) {
  throw new Error(
    'Refusing to start with --require-auth set but no bearer token configured. ...',
  );
}
```

allow-origin 와일드카드에도 자체 거부 규칙이 있습니다:

```ts
const parsed = parseAllowOriginPatterns(opts.allowOrigins);
if (parsed.allowAny && !token) {
  throw new Error(
    "Refusing to start with --allow-origin '*' but no bearer token configured. ...",
  );
}
```

세 가지 거부 모두 명시적 부트 실패입니다(stderr에 표시되거나 임베더에게 throw됨).
절대로 조용히 통과하지 않습니다. #3803의 위협 모델은 데몬이 루프백 밖을 개방 상태로 바인딩하는 것을 조용히 허용하는 것을 명시적으로 금지합니다.

### 미들웨어 체인 (HTTP 요청 순서)

```mermaid
flowchart LR
    REQ[Request] --> SO["strip same-origin Origin<br/>(Web Shell support)"]
    SO --> AO["allowOriginCors<br/>(mutable allowlist: --allow-origin<br/>patterns + Local Control LAN origin)"]
    AO --> HA["hostAllowlist"]
    HA --> LOG["access-log middleware<br/>(DaemonLogger)"]
    LOG --> BA["bearerAuth"]
    BA --> RL["rate-limit middleware<br/>(when enabled)"]
    RL --> JSON["express.json<br/>(body parser)"]
    JSON --> TEL["daemonTelemetryMiddleware<br/>(OTel span)"]
    TEL --> MG["per-route: mutationGate<br/>(opt-in strict)"]
    MG --> HANDLER["route handler"]
```

`mutationGate`는 라우트별 미들웨어 팩토리입니다(`createMutationGate`가 `mutate()`를 반환). 라우트는 등록 시 `mutate()` 또는 `mutate({strict: true})`를 호출합니다. 전역 `app.use()` 미들웨어가 아닙니다. 접근 로그는 `bearerAuth` 이전에 등록되므로 401 거부도 기록됩니다. 속도 제한은 `bearerAuth` 이후, `express.json()` 이전에 실행되므로 인증된 요청만 카운트되고, 제한을 초과할 경우 큰 본문이 파싱 전에 거부됩니다.

### `bearerAuth`

- **토큰 미설정** → 미들웨어가 no-op입니다(루프백 개발자 기본값). 예외: Local Control **LAN 리스너**는 리스너 범위이며 항상 페어링 자격 증명을 요구합니다(`CredentialStore.isOpen`은 `local-control`에 대해 절대 true가 아님). 따라서 토큰 없는 데몬에서도 개방되지 않습니다.
- **토큰 설정** → 생성 시 설정된 토큰을 한 번 SHA-256 해시합니다. 모든 요청에서 후보를 해시하고 `timingSafeEqual`로 비교합니다. 문자열 동일성 단축 없음. 시간 누출 없음.
- **스키마 파싱**: RFC 7235 §2.1에 따라 대소문자 구분 없는 `Bearer`. RFC 7230 §3.2.6 BWS에 따라 스키마와 자격 증명 사이의 `SP\tHTAB`를 허용합니다. 순수 HTAB 구분자는 거부합니다.
- **CodeQL 강화**: `\s+` / `.+` 중복이 있는 정규식 대신 수작업 `indexOf` 파싱을 사용합니다(다항 정규식 위험 없음).

### `hostAllowlist`

루프백 전용. 포트 기준으로 `Set<string>`을 유지합니다. 허용되는 Host:

- `localhost:<port>`, `127.0.0.1:<port>`, `[::1]:<port>`, `host.docker.internal:<port>`.
- 포트 없는 형태(`localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal`)는 포트 80에 바인딩된 경우에만 허용됩니다(RFC 7230 §5.4 기본 포트 생략).

Host 비교는 **대소문자를 구분하지 않습니다**. Express는 헤더 이름을 정규화하지만 값은 정규화하지 않으므로, Host를 대문자로 표기하는 Docker 프록시(`Localhost:4170`, `HOST.docker.internal`)는 정확한 문자열 비교 시 403이 발생합니다.

루프백이 아닌 바인드는 이 미들웨어를 우회합니다(운영자가 노출 영역을 선택한 것이며, 베어러 토큰이 Host 스푸핑을 차단합니다). Local Control LAN 리스너는 예외입니다: 기본 바인드와 관계없이 항상 광고된 authority의 Host 검사를 강제합니다.

### `denyBrowserOriginCors` (부트스트랩 앱 전용)

`Origin` 헤더가 포함된 모든 요청을 거부합니다. CLI/SDK는 Origin을 설정하지 않습니다. 브라우저만 설정합니다. `cors` 패키지의 오류 콜백이 생성할 500 HTML 대신 결정론적인 `403 { error: 'Request denied by CORS policy' }`를 반환합니다. 런타임 앱은 더 이상 이 방어벽을 설치하지 않습니다 — 가변 허용 목록 위에서 `allowOriginCors`를 실행합니다(아래 참조); 거부 동작은 일치하지 않는 origin 분기로서 거기서 생존합니다. 이 방어벽은 런타임 시작 전에 요청을 처리하는 부트스트랩 앱(run-qwen-serve.ts)에만 남아 있습니다.

예외: **루프백** 바인드에서 Web Shell의 동일 출처 XHR은 별도 미들웨어(`server/self-origin.ts`)에서 처리되며, Origin이 루프백 자체 Origin(`127.0.0.1`, `localhost`, `[::1]`, `host.docker.internal`) 중 하나와 일치할 때 `Origin`을 제거합니다. 루프백이 아닌 바인드에서 셸의 XHR은 일치하지 않는 `Origin`을 가지며 데몬에 대해 `--allow-origin`이 필요합니다.

### `allowOriginCors` (런타임 앱, 항상 설치)

런타임 앱은 `allowOriginCors(originAllowlist)`를 무조건 설치합니다. 허용 목록은 `--allow-origin <pattern>` 항목(없을 수 있음)에서 시딩되고 Local Control이 활성화된 동안 런타임에 확장되는 `MutableOriginAllowlist`입니다(LAN origin이 리스너와 함께 추가/제거됨):

- 일치하는 `Origin` 값은 `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`를 받습니다. `OPTIONS` 프리플라이트는 `204`를 반환합니다.
- 일치하지 않는 `Origin` 값은 거부 모드와 동일한 결정론적 `403 { error: 'Request denied by CORS policy' }`를 받습니다.
- `--allow-origin '*'`는 `--token`이 필요합니다. 그렇지 않으면 부팅이 거부됩니다.
- `parseAllowOriginPatterns()`는 부트 시 패턴 구문을 검증합니다.
- `allow_origin` 기능 태그는 이 모드가 설정된 경우에만 광고됩니다.

### `createMutationGate`

라우트별 선택적 게이트. 동작 매트릭스:

| 데몬 설정               | 라우트 옵션     | 결과                             |
| ----------------------- | --------------- | -------------------------------- |
| `requireAuth=true`      | 아무 값         | 통과¹                            |
| `token` 설정됨          | 아무 값         | 통과²                            |
| 토큰 없음 (루프백 개발) | `strict: false` | 통과                             |
| 토큰 없음 (루프백 개발) | `strict: true`, 미인증³ | `401 { code: 'token_required' }` |
| 토큰 없음 (루프백 개발) | `strict: true`, 인증³    | 통과                               |

¹ `--require-auth`는 토큰이 있어야 부팅되므로 전역 `bearerAuth`가 이미 인증되지 않은 호출자를 401로 차단합니다.
² 토큰 설정이 있으면 전역 `bearerAuth`가 모든 곳에서 베어러를 요구합니다. 게이트는 중복이지만 무해합니다.
³ 리스너 범위 자격 증명을 통한 인증: Local Control LAN 리스너는 토큰 없는 데몬에서도 페어링 자격 증명을 검증하고 요청을 인증된 것으로 스탬프하므로, strict 라우트도 페어링된 LAN 클라이언트에 대해 통과합니다.

`code: 'token_required'` 형태는 `bearerAuth`의 단순 `Unauthorized`와 구별되므로, SDK 클라이언트가 일반적인 401 대신 "configure --token / --require-auth" 힌트를 표시할 수 있습니다.

**Wave 4+ strict 라우트**: `/workspace/memory`, `/workspace/agents/*`,
`/workspace/agents/generate`, `/file/write`, `/file/edit`,
`/workspace/tools/:name/enable`, `/workspace/mcp/:server/restart`,
`/workspace/mcp/:server/{enable,disable,authenticate,clear-auth}`,
`/workspace/mcp/servers` (POST/DELETE), `/workspace/auth/device-flow`,
`/workspace/init`, `/session/:id/approval-mode`, `/session/:id/rewind`,
`/session/:id/shell`.

Rewind는 ACP 트랜스포트가 설정된 경우에도 TypeScript SDK에서 REST 전용으로 유지됩니다. 이는 strict 뮤테이션 게이트와 베어러/클라이언트 ID 헤더를 보존합니다. ACP 라우트 테이블에는 의도적으로 rewind 매핑이 없습니다. 소유자 라우팅은 rewind나 shell이 보조 런타임 브릿지에 도달하기 전에 워크스페이스 신뢰를 다시 확인합니다. 중복된 라이브 세션 ID는 기본 런타임으로 폴백하지 않고 `ambiguous_session_owner`로 안전하게 실패합니다.

### `/health` 예외

루프백 바인드에서 `/health`는 베어러 미들웨어 **이전에** 등록되므로 파드 내부의 활성 상태 프로브는 토큰을 포함할 필요가 없습니다. 루프백이 아닌 바인드는 다른 모든 라우트와 마찬가지로 `/health`를 베어러 뒤에 배치합니다. `--require-auth`는 예외를 제거합니다: `/health`도 루프백에서 `Authorization: Bearer <token>`이 필요합니다.

### v1 클라이언트 ID(`X-Qwen-Client-Id`)는 자체 보고

데몬은 `X-Qwen-Client-Id`의 형식(`[A-Za-z0-9._:-]{1,128}`)만 검증하고 세션별 연결된 클라이언트 ID를 추적합니다. 현재 소유 증명(proof-of-possession)을 수행하지 않습니다. SSE에서 `originatorClientId`를 관찰한 클라이언트는 동일한 ID로 재등록하여 이후 요청에서 해당 originator를 가장할 수 있습니다.

영향:

- `designated` — 원격 호출자가 originator를 가장하여 프롬프트 originator만을 위한 요청에 투표할 수 있습니다.
- `consensus` — 스푸핑된 ID가 이미 `votersAtIssue` 스냅샷에 있으면 투표할 수 있습니다.
- `local-only`는 데몬이 연결 원격 주소에서 스탬프하는 `fromLoopback`을 기준으로 게이트하므로 영향을 받지 않습니다.
- `first-responder`는 ID에 무관하므로 영향을 받지 않습니다.

향후 페어 토큰 메커니즘은 `POST /session`에서 세션별 비밀을 발급합니다. `designated` / `consensus` 투표는 이를 제시해야 합니다. 그전까지는 강화된 designated 정책이 필요한 배포는 루프백에 바인딩하거나 인증된 리버스 프록시 뒤에서 실행해야 합니다. 정책 수준 세부 사항은 [`04-permission-mediation.md`](./04-permission-mediation.md)를 참조하세요.

### 디바이스 플로우 인증

제공자 인증을 위한 별도 OAuth 표면입니다. v1 제공자 식별자는 `qwen-oauth`이지만, Qwen OAuth 무료 티어는 2026-04-15에 중단되었습니다. 새로운 설정은 현재 지원되는 인증 제공자가 있으면 이를 사용해야 합니다.

- `POST /workspace/auth/device-flow` — 플로우를 시작합니다. `{deviceFlowId, providerId, expiresAt, verificationUrl, userCode}`를 반환합니다.
- `GET /workspace/auth/device-flow/:id` — 상태를 폴링합니다.
- `DELETE /workspace/auth/device-flow/:id` — 취소합니다.
- `GET /workspace/auth/status` — 현재 계정 / 제공자 스냅샷입니다.

SSE 이벤트 `auth_device_flow_{started, throttled, authorized, failed, cancelled}`는 모든 구독자에게 플로우 상태를 팬아웃하여 다중 클라이언트 UI를 동기화합니다. [`09-event-schema.md`](./09-event-schema.md)를 참조하세요.

구현: `packages/cli/src/serve/auth/device-flow.ts` + `qwen-device-flow-provider.ts`.

**로그 삽입 / 트로이 목마 소스 방어**: `sanitizeForStderr(value)`(`device-flow.ts`)는 ASCII 제어 문자와 Unicode 제어 문자를 `?`로 대체합니다. 악성 IdP가 없으면 로그 라인을 위조하거나 페이로드를 숨길 수 있습니다:

| 범위                             | 제거 이유                                                                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `\x00–\x1f`, `\x7f`, `\x80–\x9f` | ASCII C0 / DEL / C1 제어 문자, 터미널 이스케이프, 로그 라인 위조.                                                                                                                                                                                           |
| U+200B-U+200F                    | 제로 너비 문자 + LRM / RLM. 보이지 않지만 터미널 렌더링을 변경할 수 있습니다.                                                                                                                                                                                |
| U+2028-U+2029                    | LINE / PARAGRAPH SEPARATOR. 많은 Unicode 인식 터미널에서 라인 브레이크로 처리합니다.                                                                                                                                                                         |
| U+202A-U+202E                    | 양방향 EMBEDDING / OVERRIDE 제어.                                                                                                                                                                                                                            |
| U+2066-U+2069                    | 양방향 ISOLATE 제어(LRI / RLI / FSI / PDI). 주요 [CVE-2021-42574 "Trojan Source"](https://trojansource.codes/) 벡터입니다. U+202D(LRO) 대신 U+2066(LRI)를 사용하는 IdP는 유사한 시각적 재정렬로 EMBEDDING/OVERRIDE 전용 필터를 우회할 수 있습니다.           |
| U+FEFF                           | BOM / 제로 너비 비분리 공백.                                                                                                                                                                                                                                 |

각 제거된 코드 포인트를 삭제하는 대신 `?`로 대체하여 길이를 보존하므로, 운영자가 해당 인덱스에 무언가가 있었음을 확인할 수 있습니다. 두 레이어 모두 새니타이저를 사용합니다: `qwenDeviceFlowProvider`는 IdP `oauthError`를 새니타이징하고, 레지스트리의 late-poll 옵저버는 감사 힌트에 보간되는 제공자 제어 값(`latePollResult.kind` / `lateErr.name`)을 새니타이징합니다.

`auth_device_flow` 기능 태그는 **무조건** 광고됩니다. 라우트 자체는 데몬이 특정 제공자를 충족할 수 없을 때 `400 unsupported_provider`를 반환합니다. 지원되는 제공자 목록은 `/capabilities`가 아닌 `/workspace/auth/status`에 있으며, 이는 디스크립터 형태를 균일하게 유지하기 위함입니다.

## 워크플로우

### 베어러 인증 성공 요청

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant BA as bearerAuth
    participant R as Route

    C->>BA: Authorization: Bearer abc...
    BA->>BA: parse scheme (case-insensitive), strip BWS
    BA->>BA: SHA-256(candidate)
    BA->>BA: timingSafeEqual(candidate, expected)
    BA->>R: next()
    R-->>C: 200 ...
```

### 베어러 인증 실패 모드

모두 `401 { error: 'Unauthorized' }`를 반환합니다(`missing header` / `wrong scheme` / `wrong token`에 대해 균일하므로 프로빙이 구별할 수 없습니다).

### `--require-auth` 그림자

```mermaid
sequenceDiagram
    autonumber
    participant C as Unauth client
    participant CAPS as GET /capabilities
    participant BA as bearerAuth

    C->>CAPS: GET /capabilities (no Authorization)
    CAPS->>BA: pass through middleware
    BA-->>C: 401 Unauthorized
    Note over C,BA: client cannot preflight require_auth tag<br/>before authenticating. Discovery surface is the 401 body.
```

인증 후 `caps.features.includes('require_auth')`로 배포가 강화되었는지 확인합니다.

### 토큰 없는 루프백에서의 Wave 4 뮤테이션 게이트

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant BA as bearerAuth (no-op, no token)
    participant MG as mutationGate({strict: true})
    participant R as Handler

    C->>BA: POST /workspace/memory (no Authorization)
    BA->>MG: passthrough
    MG-->>C: 401 { code: 'token_required', error: '...' }
```

## 상태 및 라이프사이클

- 베어러 토큰은 부트 시 읽어들여지며 트리밍됩니다(`cat token.txt`의 개행이 비교를 조용히 깨뜨리지 않도록).
- 허용된 Host Set은 포트별로 캐시됩니다. 포트 변경 시 재구축됩니다(임시 `0` → `listen` 후 실제 포트).
- 뮤테이션 게이트는 앱 빌드당 `passthrough`와 `strictDenier`를 한 번씩만 생성합니다. 라우트별 호출은 캐시된 클로저를 반환합니다(요청별 할당 없음).
- 디바이스 플로우 레지스트리는 `shutdown()` Phase 1에서 해제되므로 대기 중인 플로우가 HTTP 해체 전에 `cancelled`로 해결됩니다.

## 의존성

- `node:crypto` — `createHash`, `timingSafeEqual`.
- `packages/cli/src/serve/loopback-binds.ts` — `isLoopbackBind`.
- `packages/cli/src/serve/auth/device-flow.ts` — 디바이스 플로우 상태 머신.
- `@qwen-code/acp-bridge` — 세션별 SSE 버스에서 디바이스 플로우 이벤트를 노출합니다.

## 설정

| 소스            | 설정                                                                                    | 효과                                                                    |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 환경 변수       | `QWEN_SERVER_TOKEN`                                                                     | 베어러 토큰(트리밍됨).                                                  |
| 플래그          | `--token`                                                                               | 베어러 토큰(환경 변수를 재정의).                                        |
| 플래그          | `--require-auth`                                                                        | 베어러를 루프백 + `/health`로 확장. 토큰이 있어야 부팅 가능.             |
| 플래그          | `--hostname`                                                                            | 루프백이 아닌 바인드는 `--token`(또는 환경 변수)이 필요합니다.           |
| 플래그          | `--allow-origin <pattern>`                                                              | CORS 허용 목록 모드로 전환. `'*'`는 토큰이 필요합니다.                   |
| 기능 태그       | `require_auth`(조건부), `auth_device_flow`(항상), `allow_origin`(조건부)                 | [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) 참조. |

## 주의사항 및 알려진 제한

- **`--require-auth`는 기능 프리플라이트를 가립니다.** 인증되지 않은 클라이언트는 `require_auth` 태그를 검색할 수 없습니다. 검색 표면은 401 본문 자체입니다.
- **뮤테이션 게이트 body-parser 순서**: `mutationGate({strict: true})` 401 응답은 `express.json()`이 본문을 파싱한 **후에** 발생합니다. 포화된 루프백 리스너의 최악의 경우: `--max-connections × express.json({limit: '10mb'})` ≈ 2.5GB 일시적 메모리. 루프백 전용 공격 표면이며 의도적으로 허용됩니다.
- **동일 출처 Origin 제거**는 `server.ts`에서 `allowOriginCors` _이전에_ 발생합니다. 향후 변경으로 제거 위치가 이동하면 Web Shell이 깨집니다.
- **토큰 비교는 SHA-256 다이제스트**로 수행되며 원시 토큰이 아닙니다. 가변 길이 토큰 비교를 고정 크기 다이제스트 비교로 축소하여 시간 누출을 줄입니다.
- 데몬은 현재 mTLS, 요청 서명, 페어 토큰 소유 증명을 지원하지 않습니다. `--rate-limit`은 클라이언트 ID / IP 키별로 HTTP 속도 제한을 제공합니다. 클라이언트 ID 인증이 아닙니다.

## 참고 자료

- `packages/cli/src/serve/auth.ts` (전체 파일)
- `packages/cli/src/serve/run-qwen-serve.ts` (거부 규칙)
- `packages/cli/src/serve/loopback-binds.ts`
- `packages/cli/src/serve/auth/device-flow.ts`
- `packages/cli/src/serve/auth/qwen-device-flow-provider.ts`
- 사용자 대상 위협 모델: [`../../users/qwen-serve.md`](../../users/qwen-serve.md).
- 프로토콜 참조: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md).
