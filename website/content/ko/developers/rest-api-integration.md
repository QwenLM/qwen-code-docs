# REST API 통합 가이드

자신의 제품에 HTTP를 통해 Qwen Code를 통합하는 팀을 위해: `qwen serve`를
백엔드로 실행하고 자체 프론트엔드에서 제어합니다.

이 페이지가 진입점입니다. 전체 라우트 레퍼런스는
[`qwen-serve-protocol.md`](./qwen-serve-protocol.md)이고, 내부는
[데몬 심층 분석](./daemon/00-index.md)이며, 실행 가능한 TypeScript 워크스루는
[`examples/daemon-client-quickstart.md`](./examples/daemon-client-quickstart.md)입니다.

## 어떤 경로가 있는지

데몬 위에 구축하는 여섯 가지 방식은 하나의 질문으로 나뉩니다 — **프론트엔드를
얼마나 소유하는가?**

| 경로                                   | 소유 범위                            | 상태                                                                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 데몬 + 번들 Web Shell                  | 없음 — 제공되는 대로 사용            | 현재 제공 중 ([사용자 가이드](../users/qwen-serve.md))                                                                                                                                                                           |
| 데몬 `--no-web` + 자체 UI              | 프론트엔드 전체                      | 현재 제공 중 — **이 페이지**                                                                                                                                                                                                     |
| 데몬 + 브랜딩된 Web Shell              | 브랜딩, 코드 제외                    | 미구현 ([#11357](https://github.com/QwenLM/qwen-code/issues/11357))                                                                                                                                                              |
| 데몬 + 자체 호스팅 Web Shell 빌드      | 프론트엔드 빌드                      | 미구현 ([#11358](https://github.com/QwenLM/qwen-code/issues/11358))                                                                                                                                                              |
| SDK `DaemonClient`를 통한 데몬         | 클라이언트 코드, 원시 HTTP 미사용    | 현재 제공 중 ([TS](./sdk-typescript.md), [Java](./sdk-java.md)) — [Python SDK](./sdk-python.md)는 프로세스 전송 전용이며 데몬 클라이언트가 없어서, Python 통합은 원시 HTTP를 통해 경로 2를 구동함                                |
| MCP 브리지를 통한 데몬                 | 없음 — 다른 에이전트가 구동          | ` @qwen-code/sdk`의 `qwen-serve-mcp`로 제공 — [브리지 README](../../packages/sdk-typescript/src/daemon-mcp/serve-bridge/README.md) 참조; `QWEN_BRIDGE_ALLOW_GLOBAL_SCOPE`는 글로벌 스코프 쓰기 변경을 선택적으로 허용함          |

헤드리스 `qwen -p`와 에디터용 stdio를 통한 ACP는 별도의 통합
경로입니다. 채널과 확장 기능도 데몬을 통해 실행될 수 있습니다;
[채널 가이드](../users/features/channels/overview.md) 및
[확장 기능 레퍼런스](./qwen-serve-protocol.md#extension-management-v2-wire-contract)를
참조하세요.

## 설계 전에 알아야 할 두 가지

**데몬은 추론을 프로세스 내에서 실행하지 않습니다.** `qwen --acp` 자식 프로세스를
생성하고 그들 사이에서 HTTP를 중개합니다. 동일한 Node 바이너리에서 CLI 진입 스크립트를
실행하며, `QWEN_CLI_ENTRY` 또는 `process.argv[1]`을 사용합니다. 임베딩 Node 백엔드는
`QWEN_CLI_ENTRY`를 설치된 Qwen CLI 진입 스크립트로 지정해야 합니다; `PATH`에서 `qwen`을
찾지 않습니다. 진입점이 없으면 `MissingCliEntryError`로 나타납니다.

안정 상태에서는 **활성 워크스페이스 런타임당 하나의 자식**이 있으며, 세션당 하나가
아닙니다. 워크스페이스의 모든 세션은 해당 자식에 멀티플렉싱되어 프로세스, OAuth 상태,
파일 캐시, 계층 메모리 파스를 공유합니다. 따라서 장애 도메인은 워크스페이스입니다:
자식이 종료되면 그에 멀티플렉싱된 모든 세션이 함께 종료됩니다. 컨테이너를 데몬과
등록된 워크스페이스당 하나의 자식에 맞게 sizing하고, 채널 교체 중 런타임당 추가 자식
하나에 대한 여유를 두세요. 세션이 독립적으로 장애를 가져야 할 때는 별도의 데몬을
실행하세요 — `--max-sessions`은 동시성을 제한하지 폭발 반경을 제한하지 않습니다.

**인증은 단일 운영자입니다.** 런타임 베어러 토큰은 베어러로 보호되는 API 전체에
권한을 부여하며, 신뢰된 루프백 호출자는 데몬 사용자로 코드 실행을 포함한 전체
권한을 가집니다. 사용자별 주체 모델은 없습니다. 이것을 다중 사용자 제품 뒤에
배치하는 경우, 백엔드가 사용자 ID를 소유하며 데몬 토큰을 브라우저에 전달해서는
안 됩니다. 컨테이너화 및 다중 테넌트 배포는 명시적으로 유예됩니다 — [사용자
가이드](../users/qwen-serve.md)의 "v0.16-alpha 알려진 제한"을 참조하세요.

설정된 채널 웹후크 인그레스(`POST /channels/:channelName/webhooks/:source`)는
베어러 인증 전에 자체 `x-qwen-webhook-secret` 인증을 사용합니다; 채널 웹후크
소스가 설정되기 전까지는 비활성 상태입니다.

## 데몬 시작

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"

qwen serve --no-web --require-auth \
  --hostname 0.0.0.0 --port 4170 \
  --workspace /srv/project
```

`--no-web`는 아래 나열된 라우트를 유지하지만, Web Shell 에셋과 종속 서피스를
비활성화합니다: macOS에서는 `/live/*` 라우트와 `/live/host` 소켓, 그리고 모든
플랫폼에서 `GET /mcp-app-sandbox`. 토큰은 `--token` 대신 환경 변수로 전달하세요.
`--token`은 `/proc/<pid>/cmdline`을 통해 모든 로컬 사용자에게 노출됩니다.

아래 Bash 예제는 셸의 `printf` 빌트인을 사용하여 파일 디스크립터를 통해
Authorization 헤더를 전달하므로, 토큰이 curl의 인수에 노출되지 않습니다.

## 통합에서 실제로 사용하는 라우트

데몬이 등록하는 것의 대부분은 Web Shell을 구동하기 위한 것입니다 — git 작업,
확장 기능 설치, 워크스페이스 신뢰, 음성, 예약 작업 — 그리고 해당 UI와 함께
변경됩니다. 아래 하위 집합은 한 자릿수만큼 더 작습니다.

다음은 REST 통합에 필요한 것입니다. 나머지는 내부용으로 취급하세요.

### 검색

| 라우트                                                           | 목적                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | 활성 probe                                                                   |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | 사전 검사 — 다른 모든 작업 전에 `workspaceCwd`와 `policy.permission`을 읽음  |

### 세션 수명주기

| 라우트                                                                                                                               | 목적                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                                                                             | 생성. 독립적인 대화를 위해 `sessionScope: "thread"`를 전송            |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                                                                   | 종료. 저장된 세션은 유지되며 다시 로드할 수 있음                      |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload) · [`/resume`](./qwen-serve-protocol.md#post-sessionidresume) | 저장된 세션 복원                                                      |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat)                                                    | 유휴 리퍼 연기                                                          |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata)                                                    | 세션 메타데이터                                                       |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)                                                            | 바운드 서비스 내에서 모델 전환                                        |
| `GET /session/:id/status`                                                                                                            | 런타임 상태 — _전용 레퍼런스 섹션 아직 없음_                          |

### 프롬프트 및 스트리밍

| 라우트                                                                          | 목적                                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)     | 제출. 완료가 아닌 **수락** 시 `202` 반환           |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)     | 활성 프롬프트만 취소                                 |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)   | SSE 스트림. 프롬프트 **전에** 구독                  |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript) | 대화 기록                                            |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)     | 컨텍스트 창 사용량                                   |
| `GET /session/:id/export` · `GET /session/:id/pending-prompts`                  | _전용 레퍼런스 섹션 아직 없음_                       |

### 권한

| 라우트                                                                             | 목적                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/permission/:requestId`                                          | `permission_request`에 응답. 세션을 소유한 런타임으로 라우팅되므로 모든 워크스페이스 상태에서 정확함 — _전용 섹션 아직 없음_                                                                                                                                                          |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid) | 프로세스 글로벌 양식, **기본** 워크스페이스의 브리지에만 연결됨: 다른 등록된 런타임이 소유한 세션의 경우 `404`를 반환하며, 기본 `first-responder` 정책에서 잃어버린 투표와 동일한 본문을 가짐 — 따라서 여기에서의 `404`가 요청이 이미 응답되었음을 의미하지는 않음                  |

### 읽기 전용 워크스페이스 컨텍스트

| 라우트                                                                                                         | 목적                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`GET /file`](./qwen-serve-protocol.md#get-file) · [`/file/bytes`](./qwen-serve-protocol.md#get-filebytes)     | 파일 또는 바이트 범위 읽기                                                                                                                             |
| `GET /stat` · `GET /list` · `GET /glob`                                                                        | 경로 메타데이터, 디렉토리 목록, glob — _전용 섹션 아직 없음_                                                                                           |
| `GET /workspace/tools`                                                                                         | 활성 ACP 자식이 보고하는 도구; 자식이 없으면 응답은 `acpChannelLive: false`, `tools: []`, `not_started` 에러를 가짐 — _전용 섹션 아직 없음_            |

> **레퍼런스 커버리지.** 위 25개 라우트 중 17개에 전용 섹션이 있습니다.
> 그렇지 않은 8개 중 일부는 언급만 되고 세 개는 완전히 없습니다:
> `GET /session/:id/pending-prompts`,
> `POST /session/:id/permission/:requestId`, `GET /workspace/tools`.
> 해당 격차 해소가
> [#11359](https://github.com/QwenLM/qwen-code/issues/11359)에서 추적되고
> 있습니다.

## 최소 흐름

**1. 사전 검사.** `workspaceCwd`(생성 시 `cwd`를 생략할 수 있도록)와
`policy.permission`(누가 권한 요청에 응답할 수 있는지 확인)을 읽습니다.

```bash
curl -sH @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") http://daemon:4170/capabilities
```

**2. 세션 생성.** 호출자가 하나의 대화를 공유하도록 의도되지 않았다면
`sessionScope: "thread"`를 사용하세요 — 기본값 `"single"`은 동일한
워크스페이스의 두 번째 생성이 기존 세션을 _재사용_하게 하여, 관련 없는
호출자를 하나의 큐로 직렬화합니다.

```bash
curl -sX POST http://daemon:4170/session \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"sessionScope":"thread"}'
# → {"sessionId":"…","workspaceCwd":"/srv/project","attached":false}
```

**3. 프롬프트 전에 구독.** `Last-Event-ID: 0`은 가장 오래된 보존된 이벤트부터
리플레이하며, 이는 생성과 구독 사이에 발생한 이벤트를 잡는 방법입니다 — 특히
`model_switch_failed`. **어태치**에서(기본 `sessionScope: "single"`이 기존 세션을
재사용하는 경우) 해당 이벤트는 잘못된 `modelServiceId`가 거부되었음을 알리는
유일한 신호입니다. 실패가 의도적으로 HTTP 에러로 전파되지 않기 때문입니다.
`modelServiceId`를 포함하는 **신규 생성**에서 — 단계 2의 본문에는 포함되지 않음 —
`200` 본문은 `modelApplied`도 포함하며, 전환이 거부된 경우 `false`입니다. 이것이
바운드 링의 이벤트보다 deterministic하게 대응할 수 있는 것입니다.
`modelServiceId` 없는 생성에는 `modelApplied` 키 자체가 없습니다.

```bash
curl -N http://daemon:4170/session/$SID/events \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") \
  -H 'Accept: text/event-stream' -H 'Last-Event-ID: 0'
```

각 `data:` 줄은 한 줄에 전체 엔벨로프이며, 엔벨로프의 `type`은 `event:` 줄과
일치합니다.

리플레이는 `--event-ring-size`와 구독당 고정 8 MiB 바이트 예산으로 제한됩니다.
스트림이 `reason: "replay_budget_exceeded"`와 함께 `state_resync_required`를
내보내면, 리플레이를 완료로 취급하지 말고 `POST /session/:id/load`를 통해
복구하세요.

**4. 프롬프트.** `202`는 수락을 의미하며 완료가 아닙니다. 스트림에서
`turn_complete` / `turn_error`를 `promptId`로 상관관계 짓습니다.
`turn_complete`에서 `stopReason`를 읽습니다; `turn_error`에서 `message`와
선택적 `code` / `errorKind`를 읽습니다 —
[`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt) 참조.

```bash
curl -sX POST http://daemon:4170/session/$SID/prompt \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → 202 {"promptId":"…","lastEventId":42}
```

**5. 권한 요청에 응답.** 에이전트가 도구를 실행하려고 하고 **승인 모드가
확인을 요구하는** 경우, `permission_request`를 내보내고 턴은 누군가 응답하거나
취소할 때까지 차단됩니다 — **기본적으로 타임아웃은 없습니다**
(`--permission-response-timeout-ms`의 기본값은 `0` = 무기한 대기), 따라서
응답 없는 요청은 세션의 프롬프트 큐에서 슬롯을 계속 점유하며 취소하거나
세션을 종료할 때까지 유지됩니다. 흐름에 데드라인이 필요하면 직접 설정하세요.

모드는 자식의 자체 Qwen 설정 `tools.approvalMode`이며, 데몬 호스트와
`--workspace` 디렉토리의 설정에서 결정됩니다; 데몬은 spawn 시 아무것도
고정하지 않습니다. 기본값은 `auto`이며, 한 클래스의 도구 호출을 묻지 않고
승인합니다 — 이들은 `permission_request`를 전혀 내보내지 않습니다 — 그리고
나머지에 대해서는 여전히 묻습니다. 신뢰할 수 없는 워크스페이스 폴더는
`default`(ask)로 강제되며, 이것이 하나의 배포에서 이러한 이벤트를 보고 다른
배포에서는 아무것도 보지 않는 이유입니다. `GET /capabilities`는 승인 모드가
아닌 투표 중재 정책을 보고하므로, 사전 검사로는 어떤 상태에 있는지 알 수
없습니다. 통합이 승인 게이팅에 의존한다면, `tools.approvalMode`를 명시적으로
고정하고 사전에 어떻게 응답할지 결정하세요: 자동 승인이 아무도 선택하지
않았더라도 이미 적용 중일 수 있습니다.

세션 스코프 라우트에서 응답하세요: 세션을 소유한 런타임으로 라우팅되므로,
워크스페이스 구성에 관계없이 작동합니다.

```bash
curl -sX POST http://daemon:4170/session/$SID/permission/$REQUEST_ID \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"outcome":{"outcome":"selected","optionId":"proceed_once"}}'
```

**6. 종료.** `DELETE /session/$SID` → `204`. 디스크의 세션은 유지됩니다.

## 운영

| 관심사           | 위치                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 동시성 상한      | `--max-sessions`, `--max-total-sessions`; 상한 초과 생성은 `Retry-After`와 함께 `503` 반환                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 속도 제한        | `--rate-limit` 및 클래스별 `--rate-limit-*` 플래그                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 유휴 정리        | `--session-idle-timeout-ms`; `POST /session/:id/heartbeat`로 활성 유지                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 메모리           | `--child-heap-mode`는 관찰 전용. `--memory-budget-mb`는 `POST /session/:id/load`의 적응형 라이브 저널 성장 풀을 제어하며, SSE 리플레이와는 무관; `--max-journal-bytes` 또는 `--max-journal-events` 중 하나를 고정하면 성장이 비활성화됨. 어느 플래그도 자식을 sizing하거나 spawn을 거부하지 않으며, 실제 힙 상한(`--max-old-space-size`, 호스트 메모리에서 파생)을 제어하지 않음. 예산 계산은 [설정](./daemon/17-configuration.md) 참조. SSE 리플레이는 `--event-ring-size`와 구독당 고정 8 MiB 예산으로 별도로 제한됨; 누락된 테일은 `reason: "replay_budget_exceeded"`와 함께 `state_resync_required`를 발생시킴 |
| 프롬프트 데드라인 | `--prompt-deadline-ms`; 만료 시 `turn_error` 내보냄                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 에러             | [에러 분류](./daemon/18-error-taxonomy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 관측성           | [관측성](./daemon/19-observability.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 전체 플래그 목록 | [설정](./daemon/17-configuration.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |