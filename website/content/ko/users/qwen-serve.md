# 데몬 모드 (`qwen serve`)

Qwen Code를 로컬 HTTP 데몬으로 실행하여 여러 클라이언트(IDE 플러그인, 웹 UI, CI 스크립트, 커스텀 CLI)가 각자 서브프로세스를 생성하지 않고도 HTTP + Server-Sent Events를 통해 하나의 에이전트 세션을 공유할 수 있습니다.

> **🚧 v0.16-alpha**: `qwen serve`는 v0.16-alpha에서 npm에 처음 배포되며 **텍스트 전용 채팅/코딩**과 **로컬 전용 배포**로 시작됩니다. 프롬프트 경로의 이미지/파일 첨부, 컨테이너화된 배포(Docker / k8s / nginx 리버스 프록시), 원격/다중 데몬 강화는 기업 파일럿이 확정된 후 후속 패치에서 제공됩니다. 전체 지연 목록은 [v0.16-alpha 알려진 한계](#v016-alpha-알려진-한계)를 참조하세요.

> **상태:** Stage 1(실험적). 프로토콜 표면은 이슈 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)의 §04 라우트 테이블에서 고정되었습니다. Stage 1.5(`qwen --serve` 플래그 — TUI가 동일한 HTTP 서버를 공동 호스트)와 Stage 2(프로세스 내 리팩터링 + `mDNS`/OpenAPI/WebSocket/Prometheus 개선)는 바로 하류에 있습니다.
>
> **범위 솔직성:** Stage 1은 **프로토콜 표면에 대해 클라이언트를 프로토타이핑하는 개발자**와 **로컬 단일 사용자/소규모 팀 협업**에 맞춰져 있습니다. 프로덕션급 다중 클라이언트/장기 실행/네트워크 불안정 워크로드(모바일 컴패니언, 1000+ 채팅에 도달하는 IM 봇)는 이 릴리스에 없는 Stage 1.5+ 보장이 필요합니다. 전체 격차 목록은 [Stage 1.5+ 런타임 보장](#stage-15-런타임-보장)을, 수렴 로드맵은 #3803을 참조하세요.

## 제공하는 기능

- **내장 Web Shell UI** — `qwen serve`는 루트(`http://127.0.0.1:4170/`)에서 브라우저 기반 Web Shell을 즉시 제공합니다; `qwen serve --open`을 실행하면 브라우저에서 자동으로 열립니다. API와 동일한 오리진에서 제공되므로 두 번째 포트나 리버스 프록시가 필요하지 않습니다. API 전용 데몬의 경우 `--no-web`을 전달하세요.
- **최대 하나의 기본 ACP 자식 plus 신뢰할 수 있는 보조당 하나의 온디맨드 자식, 다수의 클라이언트** — 프로덕션에서는 기본 브리지를 예열하고 실패 시 첫 사용 시 재시도합니다; 신뢰할 수 있는 보조 런타임은 온디맨드로 자체 자식을 시작하며, 신뢰할 수 없는 보조는 자식을 시작하지 않습니다. 기본 `sessionScope: 'single'`에서 동일한 워크스페이스를 대상으로 하는 클라이언트는 하나의 ACP 세션을 공유하고 동일한 대화, 파일 diff, 권한 프롬프트에서 협업합니다.
- **재연결 안전 스트리밍** — `Last-Event-ID` 재연결이 있는 SSE로 클라이언트가 중단된 후 정확히 이전 위치에서 이어서 시작할 수 있습니다(링의 재생 창 내에서).
- **페이지된 영속 트랜스크립트** — `GET /session/:id/transcript`는 클라이언트를 연결하거나 라이브 SSE 재생 창을 변경하지 않고도 완전한 활성 디스크 트랜스크립트를 재생 페이지로 반환합니다.
- **첫 응답자 권한** — 에이전트가 도구 실행 권한을 요청하면 연결된 모든 클라이언트가 요청을 보며, 가장 먼저 응답하는 클라이언트가 승리합니다.
- **하나의 데몬, 하나 이상의 워크스페이스** — `--workspace`를 반복하여 하나의 리스너 아래에 격리된 워크스페이스 런타임을 등록합니다. 첫 번째 워크스페이스가 기본이며 `cwd`를 생략한 요청의 기본값으로 유지됩니다.
- **실험적 데몬 관리 채널** — `qwen serve --channel <name>`으로 시작하거나, 채널 없이 시작하고 나중에 `qwen channel set`으로 선택합니다. 워커는 데몬 수명주기가 소유한 별도 프로세스입니다. 선택 항목은 데몬 재시작 없이 조회, 교체, 리로드, 중지가 가능합니다.
- **원격 런타임 제어** — 세션의 승인 모드 변경(`POST /session/:id/approval-mode`), 워크스페이스별 도구 토글(`POST /workspace/tools/:name/enable`) 또는 로드된 skill(`POST /workspace/skills/:name/enable`), 빈 `QWEN.md` 스캐폴딩(`POST /workspace/init`, 기계적만 — 모델 호출 안 함; AI 채우기의 경우 `POST /session/:id/prompt` 후속 처리), 예산 사전 점검을 통한 단일 MCP 서버 재시작(`POST /workspace/mcp/:server/restart`), 또는 데몬 재시작 없이 MCP 서버 추가/제거(`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). 모두 엄격 게이트 — 먼저 `--token`을 구성하세요.
- **세션 요약**([#4175](https://github.com/QwenLM/qwen-code/issues/4175) 후속) — 활성 세션의 "어디서 멈췄는지" 한 문장 요약을 가져옵니다(`POST /session/:id/recap`). 코어의 `generateSessionRecap`을 빠른 모델에 대한 사이드 쿼리로 래핑; 메인 채팅 기록이나 SSE 스트림을 오염시키지 않습니다. 비엄격 게이트(`/prompt`와 동일한 자세); SDK 헬퍼 `client.recapSession(sessionId)`.
  - **알려진 한계 — 토큰 비용 증폭:** 이 라우트는 순수 비용 엔드포인트(각 호출은 LLM 사이드 쿼리이며 상태 이점 없음)이며 v1에서는 라우트별 속도 제한이 없습니다. 토큰 없는 루프백 기본값에서 버그가 있거나 악성인 로컬 클라이언트가 토큰을 소모하기 위해 스팸을 보낼 수 있습니다. 데몬을 노출하기 전에 공유 개발 호스트에서 `--token`(및 선택적으로 `--require-auth`)을 구성하세요.
  - **동시 재연결 안전성:** 동일한 세션에서 두 개의 동시 `/recap` 호출은 두 개의 독립적 사이드 쿼리를 실행합니다. `generateSessionRecap`은 `GeminiClient.getChat().getHistory()`를 통해 채팅 기록의 스냅샷을 읽고 별도의 `BaseLlmClient.generateText` 호출(`runSideQuery` 경유)에 전달합니다; 세션의 `GeminiChat`에 추가하거나 변경하지 않습니다. 조정 없이 여러 클라이언트에서 호출해도 안전합니다.

## v0.16-alpha 알려진 한계

`qwen serve`의 첫 npm 릴리스(v0.16-alpha)는 의도적으로 좁습니다 — 개발자가 자신의 머신에서 실행하는 텍스트 전용 채팅/코딩입니다. 아래 목록은 지연된 표면을 명시적으로 보여주어 채택자가 이에 맞춰 계획할 수 있도록 합니다; 여기 있는 모든 항목은 v0.16.x 패치 로드맵이나 근시일 내 후속 릴리스에 있습니다.

**제품 표면 — 텍스트 전용:**

- ✅ 텍스트 프롬프트 및 텍스트 응답(채팅, 코딩, 도구 호출, MCP 통합)
- ❌ **프롬프트 경로의 이미지/파일 첨부** — `MessageEmitter`는 현재 텍스트만 렌더링합니다; 멀티모달 에코는 이미지 니즈가 있는 알파 대상이 확정될 때 제공됩니다(#4175 chiga0 #27 P0 항목)
- ❌ **스트리밍 업로드** — 멀티모달과 동일한 게이팅

**배포 표면 — 로컬 전용:**

- ✅ 루프백(`127.0.0.1`, 기본값) — 인증 불필요, 개발 워크스테이션에 적합
- ✅ `systemd` / `launchd` / `nohup &` / `tmux`를 통한 로컬 실행 — [로컬 실행 템플릿](./qwen-serve-deploy-local.md) 참조
- ✅ `QWEN_SERVER_TOKEN` 환경 변수를 통한 자체 베어러 토큰 가져오기(설정은 [인증](#인증) 참조)
- ❌ **컨테이너화된 배포** — Docker / Compose / Kubernetes / TLS 종단 nginx 리버스 프록시는 v0.16-alpha에 포함되지 않습니다. 기업 파일럿이 확정되면 v0.16.x로 연기됩니다(아니면 아무도 검증하지 않아 부패할 수 있음).
- ❌ **하나의 호스트에서 다중 데몬 조정** — 하나의 데몬이 여러 개의 명시적으로 등록된 워크스페이스를 호스팅할 수 있지만 데몬 간 조정은 되지 않습니다. 크로스 호스트 페더레이션, 인스턴스 경로 토큰 키잉, 오래된 토큰 정리는 v0.16.x로 연기됩니다.
- ✅ **새 Local Control 토큰** — `--local-control`은 해당 프로세스에 대해 토큰을 생성합니다. 일반 데몬 토큰 저장은 BYO-token을 유지합니다.

**강화 — 로컬 단일 사용자에 대한 최소 실행 가능:**

- ✅ 부트 시 보안 게이트(토큰 없는 비루프백 바인드 거부, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ 뮤테이션 라우트 인증 게이트, 세션 범위 권한 라우팅(Wave 4 PR)
- ✅ MCP 가드레일 + 다중 클라이언트 권한 조정(F2 / F3)
- ✅ **프롬프트 절대 마감 시한 + SSE writer 유휴 타임아웃** — `--prompt-deadline-ms` 및 `--writer-idle-timeout-ms`를 통한 옵트인; 활성화 시 `prompt_absolute_deadline` 및 `writer_idle_timeout`을 통해 광고.
- ✅ **HTTP 속도 제한** — `--rate-limit` 및 티어별 임계값을 통한 옵트인; 활성화 시 `rate_limit`을 통해 광고.
- ⏸️ **Prometheus 메트릭 + 부하 테스트 하네스** — 30-50개 활성 세션이 실제 목표가 될 때 v0.17 F4 Phase-1 규모 계측으로 연기.
- ⏸️ **`--max-body-size` CLI 플래그** — 데몬은 기본적으로 `express.json({ limit: '10mb' })`를 적용하며 텍스트 전용 프롬프트를 충분히 커버합니다(모델 컨텍스트 창은 10 MiB의 문자보다 훨씬 작음). v0.16.x에서 플래그로 조정 가능.

Stage 1에서 수정하지 않을 것에 대한 더 깊은 열거(각 워크스페이스 런타임 내부의 단일 호스트 세션 상태 모델 + N개의 병렬 세션이 하나의 ACP 자식을 공유)는 아래 [Stage 1 범위 경계](#stage-1-범위-경계--stage-15에서-수정하지-않을-사항)를 참조하세요.

## 빠른 시작

### 1. 데몬 시작(루프백, 인증 없음)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

기본 바인드는 `127.0.0.1:4170`입니다. 루프백에서는 베어러 인증이 **꺼져** 있어서 로컬 개발이 "그냥 작동"합니다. 데몬은 현재 작업 디렉토리를 기본 워크스페이스로 등록합니다; 절대 경로 `--workspace /path/to/dir`로 재정의하고, 플래그를 반복하여 추가 격리 런타임을 등록하세요.

**Web Shell UI 열기.** `http://127.0.0.1:4170/`로 이동하거나(또는 `qwen serve --open`으로 데몬을 시작하여 자동 실행), 전체 브라우저 터미널을 확인하세요 — 채팅, diff, 커밋 기록, 도구 호출, 권한 프롬프트. UI는 API와 동일한 오리진의 데몬 루트에서 제공됩니다. 이 가이드의 나머지 부분에서는 원시 HTTP를 사용하여 API를 직접 스크립트할 수 있습니다.

### 2. 정상 확인

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` 필드는 기본 호환성 워크스페이스를 표시하므로 클라이언트가 의도적으로 `POST /session`에서 `cwd`를 생략할 수 있습니다. 현재 클라이언트는 `workspaces[]`에서 신뢰할 수 있는 항목을 선택하고 런타임을 명시적으로 대상화할 때 해당 항목의 `cwd`를 전송해야 합니다.
`limits.maxPendingPromptsPerSession` 필드는 활성 세션당 프롬프트 수용 상한을 광고합니다; `null`은 상한이 비활성화된다는 의미입니다. `limits.maxTotalSessions`은 선택적 데몬 전체 신규 세션 상한을 광고합니다; `null`은 무제한을 의미합니다.

### 데몬에서 채널 실행

```bash
# qwen serve 아래에서 하나의 구성된 채널 시작
qwen serve --channel telegram

# 데몬 소유 워크스페이스 워커 아래에서 여러 구성된 채널 시작
qwen serve --channel telegram --channel feishu

# 모든 구성된 채널 시작
qwen serve --channel all

# 또는 채널 워커 없이 토큰 보호 데몬 시작
QWEN_SERVER_TOKEN=secret qwen serve

# 나중에 런타임 선택 활성화 또는 교체
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# 데몬 관리 채널 검사 또는 중지
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

이 모드는 실험적이며 데몬이 관리합니다. 독립 실행형 `qwen channel start` 명령어를 대체하지 않습니다: `--daemon-url` 없이 기존 `qwen channel start`, `stop`, `status` 동작은 독립 실행형으로 유지됩니다. `qwen serve --channel`과 함께 데몬은 리스닝 전에 채널 서비스 리스를 예약하고 초기 워커가 준비되지 않으면 시작이 실패합니다. `--channel` 없이 채널 런타임을 로드하지 않으며 첫 런타임 PUT까지 채널 서비스 리스를 예약하지 않습니다. 준비된 워커가 나중에 충돌하면 데몬은 계속 실행되고 제한된 재시작 정책으로 재시작하며 `channel_worker_exited` 경고를 포함한 상태를 `GET /daemon/status`에 보고합니다.

런타임 제어는 `GET`, `PUT`, `DELETE /workspace/channel`로 노출됩니다; SDK 헬퍼는 `getChannelWorkerControl()`, `setChannelWorkerSelection()`, `stopChannelWorker()`입니다. PUT/DELETE/리로드은 엄격 뮤테이션 게이트를 사용하므로 데몬에 베어러 토큰이 구성되어야 합니다. 런타임 선택은 의도적으로 일시적입니다: PUT은 설정이나 부트 옵션을 편집하지 않으며, 재시작 시 `qwen serve --channel` 선택으로 돌아갑니다(해당 플래그가 생략되면 비활성화). 이름 선택은 첫 등장 순서로 정리되고 중복이 제거됩니다; 순서가 유지됩니다. 첫 번째 채널이 공유 모델 선택에 영향을 줄 수 있기 때문입니다.

데몬은 각 채널의 설정(토큰, `proxy`, 채널별 `model`)을 워커가 시작될 때 읽습니다. 커밋된 선택을 변경하지 않고 설정을 다시 읽으려면 `POST /workspace/channel/reload`(SDK `client.reloadChannelWorker()` 또는 `qwen channel reload`)를 호출하세요. 리로드는 워크스페이스 소유권을 재해결하고 동일한 롤백 안전 조정 경로를 통해 선택된 워커를 재시작합니다. `channel_control` 기능은 런타임 제어가 연결될 때마다 존재합니다; `channel_reload`는 관리자가 활성화된 동안에만 존재합니다. 영속 스레드는 디스크에서 복원됩니다.

선택된 각 채널의 `cwd`는 등록된 워크스페이스로 확인되어야 하며, 채널은 해당 소유 워크스페이스별로 그룹화됩니다: 단일 워크스페이스 데몬은 하나의 워커를 실행하고(이전과 동일); 다중 워크스페이스 데몬(`--workspace` 반복)은 선택된 채널을 소유하는 워크스페이스당 하나의 워커를 실행하며, 각 워크스페이스의 cwd, `QWEN_DAEMON_WORKSPACE` 및 env 오버레이에 바인딩됩니다. 기본이 아닌 워크스페이스에서 채널을 호스팅하려면 해당 워크스페이스의 자체 `.qwen/settings.json`에 정의하거나(`cwd` 불필요) 워크스페이스 경로와 동일한 명시적 `cwd`를 설정하세요; `cwd` 없이 사용자/시스템 범위에서만 정의된 채널은 워크스페이스 간에 모호하며 부트 오류를 발생시킵니다. `--channel all`은 기본 전용으로 유지되며(`기본 워크스페이스의 채널을 호스팅`) 이름 채널과 결합할 수 없습니다.

선택을 교체하면 무엇이든 중지하기 전에 구성, 소유권 및 신뢰를 사전 점검합니다. 순서화된 선택이 변경되지 않은 워크스페이스 워커를 유지합니다. 변경된 워커가 시작할 수 없으면 데몬은 새 워커를 중지하고 이전 선택을 복원합니다. 데몬이 SIGKILL 후에도 이전 자식이 종료된 것을 확인할 수 없으면 PID 리스를 유지하고 중복 워커 생성을 거부합니다. 워커는 요청된 어댑터 중 하나 이상이 연결되면 여전히 준비된 것으로 간주됩니다; PUT은 `partial: true`를 반환하고 `/daemon/status`는 누락된 어댑터에 대해 `channel_worker_partial_connect`를 보고합니다.

어댑터가 `connect()`를 거부하면 현재 워커 스냅샷에 채널, `phase: "connect"`, 선택적 어댑터 코드 및 자격 증명 편집 메시지가 포함된 `startupFailures` 항목이 포함될 수 있습니다. `qwen channel set`, `qwen channel reload` 및 원격 `qwen channel status --daemon-url …`는 이러한 이유를 출력합니다. 동적 set 또는 리로드 중에 모든 어댑터가 실패하면 명령어는 `502 channel_worker_start_failed`를 받습니다; 응답 이유는 해당 시도와 롤백 후 `state`를 설명합니다. 실패한 시도는 이후 상태 요청에서 유지되지 않습니다. 워커 시작당 최대 64개의 이유가 유지되며 어댑터 코드는 안정적인 범주가 아닌 진단으로 취급되어야 합니다. 초기 `qwen serve --channel …` 시작은 여전히 어댑터가 연결되지 않으면 종료됩니다.

데몬은 클라이언트 UI와 운영자를 위한 읽기 전용 런타임 스냅샷도 노출합니다: `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /workspace/:id/session-info`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`, 및
`GET /session/:id/tasks`, `GET /session/:id/lsp`, 및
`GET /session/:id/transcript`.

`GET /workspace/:id/session-info`(및 복수형
`GET /workspaces/:workspace/session-info` 쌍)는 워크스페이스의 집계 세션
수를 반환합니다: 영속 `active` / `archived` / `total` 및 라이브 상태를
사용할 수 있을 때 현재 인메모리 `live` 수. 등록된 신뢰할 수 없는 보조
워크스페이스는 카탈로그 읽기가 라이브 브리지를 쿼리하지 않으므로 `live`를
생략합니다. 페이지된 `GET /workspace/:id/sessions` 목록은 합계를
포함하지 않으므로 "세션이 몇 개 있는가?"에 대한 전용 표면입니다 —
예약되거나 반복되는 작업이 큰 로컬 저장소를 남길 때 유용합니다.

> ⚠️ **디스크 스캔 — 폴링하지 마세요.** 이 엔드포인트는 워크스페이스 채팅
> 디렉토리 아래의 로컬 세션 JSONL 파일을 순회합니다. 응답은 항상
> `expensive: true` 및 `cost: "disk_scan"`을 포함합니다. 드물게 호출하세요(수동
> 새로 고침, 운영자 도구, 가끔 UI 로드) — 긴 타이머나 사이드바 렌더링마다
> 호출하지 마세요. 페이지 탐색에는 `GET /workspace/:id/sessions`을,
> 라이브 인메모리 세션 수에는 `GET /daemon/status`를 선호하세요.
> `truncated: true`가 포함된 응답은 스캔이 안전 제한에 도달했거나 모든
> 후보 파일을 분류할 수 없었음을 의미하므로 영속 수는 하한입니다.

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status`는 단일 세션의 라이브 브리지 요약을 반환합니다:
`sessionId`, `workspaceCwd`, `createdAt`, 선택적 `displayName`, `clientCount`,
및 `hasActivePrompt`. 데몬이 해당 id의 라이브 세션을 보유하고 있으면 `200`으로
요약을 반환하고, 그렇지 않으면 `404`(본문 `{ "error": …, "sessionId": … }`)를
반환합니다. 하나의 알려진 세션이 여전히 실행 중인지(`hasActivePrompt`) 또는
몇 개의 클라이언트가 연결되어 있는지(`clientCount`) 전체 페이지된 세션 목록을
가져오고 스캔하지 않고 확인하는 데 사용하세요:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

이것은 원시 라이브 세션 뷰이므로 `clientCount`와 `hasActivePrompt`는
`GET /workspace/:id/sessions`의 해당 항목과 일치합니다 — 하지만 두 라우트는
바이트 단위로 동일하지 않습니다. 목록 엔드포인트는 각 항목에 영속
세션 저장소 데이터로 보강합니다: `createdAt`은 영속 첫 프롬프트 시간이며,
`updatedAt`과 저장된 제목이나 첫 프롬프트에서 파생된 `displayName`을
추가합니다. `/status`는 대신 라이브 세션 자체의 `createdAt`을 보고하고,
`updatedAt`을 생략하며, 라이브 세션에 설정된 경우에만 `displayName`을
반환합니다.

`GET /session/:id/lsp`는 구조화된 세션별 LSP 상태를 반환합니다. 데몬을
`--experimental-lsp`로 시작하여 생성된 에이전트 세션에서 LSP를 활성화하세요;
그렇지 않으면 라우트는 `enabled: false`를 반환하며 서버가 없습니다.

`GET /daemon/status`는 통합된 문제 해결 스냅샷입니다. 기본
`detail=summary`는 인메모리 데몬 상태만 읽습니다(세션, 권한,
SSE/ACP 전송 카운트, 속도 제한 거부, 프로세스 메모리, 해석된 제한)
및 ACP 자식을 시작하지 않습니다. 문제 조사 중에는
`GET /daemon/status?detail=full`을 사용하여 세션별 진단, ACP 연결 세부 정보,
인증 디바이스 플로우 카운트 및 워크스페이스 상태 섹션을 확인하세요.

`GET /workspace/mcp`, `GET /workspace/skills` 및 `GET /workspace/providers`
는 라이브 ACP 런타임을 보고하며 유휴 상태에서 ACP 자식을 시작하지 않습니다;
유휴 데몬은 `initialized: false`를 빈 스냅샷과 함께 반환합니다. 세션이
활성화되면 `initialized: true`로 전환되고 실제 상태를 표시합니다.

원격으로 CLI `/skills` 패널을 미러링하려면 `workspace_skill_toggle` 기능을
확인한 후 `POST /workspace/skills/:name/enable`을 `{ "enabled": true | false }`로
호출하세요. 여러 Skill을 변경하려면 `workspace_skill_batch_toggle`를 확인하고
`POST /workspace/skills/enable`을 `{ "skillNames": ["review", "deploy"], "enabled": false }`로
호출하세요; 응답은 성공적인 `results`를 대상별 `errors`와 분리하고, 유효한 대상을
함께 영속화하며, 활성 ACP 세션을 한 번에 새로 고칩니다. 라우트는 워크스페이스
`skills.disabled` 및 `skills.enabled`를
필요에 따라 업데이트하고, 알 수 없거나, 숨겨진, 비활성 확장, 상위 범위 잠금,
신뢰할 수 없는 대상을 거부하며, 활성 ACP 세션을 즉시 새로 고칩니다.
`skills.defaultDisabled` skill을 활성화하면 `skills.enabled`에 정식 옵트인이
기록됩니다; 더 높은 범위에서 상속된 하드 `skills.disabled` 항목은 여전히
재정의할 수 없습니다. Skill 상태 셀은 `disabledReason`(`hard`, `default`
또는 `inactive_extension`)과 선택적 `lockedScope`를 노출합니다. `deferred`
응답은 ACP 자식이 실행되지 않는 동안 설정이 저장되었음을 의미합니다;
자식이 시작될 때 적용됩니다. `skills.disabled`는 수동 및 모델 사용을 모두
비활성화합니다. `disable-model-invocation: true`와 달리 직접 `/skill-name`
호출은 계속 사용할 수 있습니다.

`GET /workspace/env`와 `GET /workspace/preflight`는 ACP 상태와 관계없이
항상 `initialized: true`로 응답합니다. `env`는 ACP를 참조하지 않습니다(데몬
프로세스 정보만); `preflight`는 `process.*`에서 데몬 레벨 셀에 응답하고
자식이 유휴 상태일 때 ACP 레벨 셀에 대해 `status: 'not_started'` 플레이스홀더를
출력합니다.

`GET /workspace/env`는 데몬 프로세스의 런타임, 플랫폼, 샌드박스,
프록시 및 `OPENAI_API_KEY`와 같은 화이트리스트 시크릿 환경 변수의
**존재**(값은 절대 아님)를 보고합니다. 프록시 URL은 자격 증명이 제거되고
전송 전에 `host:port`로 축소됩니다. 라우트는 항상 데몬 프로세스에서
직접 응답하며 ACP 자식을 생성하지 않습니다.

`GET /workspace/preflight`는 준비 상태 검사 목록을 반환합니다. **데몬 레벨
셀**(Node 버전, CLI 엔트리, 워크스페이스 디렉토리, ripgrep, git, npm)은
항상 렌더링됩니다. **ACP 레벨 셀**(인증, MCP 검색, skills, providers,
도구 레지스트리, 이그레스)은 라이브 ACP 자식이 필요합니다 — 데몬이 유휴
상태일 때 자식을 시작하는 대신 `status: 'not_started'` 플레이스홀더를
출력합니다. 실패는 닫힌 `errorKind` 열거형(`missing_binary`,
`auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`)에 매핑되므로 클라이언트 UI가 구조화된
개선 조치를 렌더링할 수 있습니다.

데몬은 워크스페이스 파일 헬퍼도 노출합니다:

- `GET /file`은 텍스트 파일을 읽습니다. 전체 스냅샷 응답은 원시 바이트
  `sha256:<hex>` 해시를 반환합니다; 256 KiB 초과 파일의 유한 라인 창은 이를 생략합니다.
- `GET /file/bytes`는 제한된 원시 바이트 창을 읽고 base64 내용을 반환합니다.
- `POST /file/write`는 텍스트 파일을 생성하거나 교체합니다.
- `POST /file/edit`는 하나의 정확한 텍스트 교체를 적용합니다.

쓰기/편집은 **엄격 뮤테이션 라우트**입니다: 루프백에서도 구성된 베어러 토큰이
필요하며, 그렇지 않으면 `token_required`를 반환합니다. 교체 및 편집은
전체 스냅샷 `GET /file`(또는 전체 창 `GET /file/bytes`)의 최신 `expectedHash`가
필요합니다. 부분적 대용량 파일 창은 낙관적 동시성 토큰으로 사용될 수 없습니다.
`create`는 절대 덮어쓰지 않습니다. 무시된 경로에 대한 명시적 쓰기는 허용되지만
감사됩니다. 바이너리 쓰기, 삭제/이동/mkdir 및 재귀적 부모 생성은 이 표면에
포함되지 않습니다.

### 3. 세션 열기

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd`는 생략할 수 있습니다 — 라우트는 데몬의 기본 워크스페이스로 폴백합니다. 등록된 워크스페이스로 표준화되지 않는 `cwd`를 게시하면 `400 workspace_mismatch`가 반환됩니다.

기본 `sessionScope: 'single'`에서 동일한 확인된 워크스페이스 런타임에 `POST /session`을 게시하는 두 번째 클라이언트는 `"attached": true`를 받습니다 — 이제 해당 런타임의 에이전트 세션을 공유합니다. `cwd`를 생략하면 기본으로 해석되고, 다른 등록된 워크스페이스를 선택하면 해당 런타임의 별도 기본 세션을 생성하거나 연결합니다.

### 4. 이벤트 스트림 구독(먼저 다른 터미널에서)

```bash
SESSION_ID="<3단계에서>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 줄은 **전체 이벤트 인벨롭**입니다 — `{id?, v, type, data, originatorClientId?}` — 단일 라인으로 JSON 문자열화된 것입니다. ACP 페이로드(이 예시의 `sessionUpdate` 블록)는 해당 인벨롭 내부의 `data` 아래에 있습니다. SSE 레벨의 `id:` / `event:` 라인은 EventSource 클라이언트를 위한 편의이며, 동일한 값이 JSON 인벨롭 내부에 나타나므로 raw-`fetch` 소비자도 이를 받습니다.

프롬프트를 보내기 **전에** 이것을 여세요 — SSE 재생 버퍼는 마지막 8000개 이벤트를 보유하므로 늦은 구독자가 `Last-Event-ID`를 통해 따라잡을 수 있지만, 간단한 "단일 프롬프트 관찰"의 경우 먼저 구독하고 라이브로 스트리밍하는 것이 가장 쉽습니다.

스트림은 `session_update`(LLM 청크, 도구 호출, 사용량), `permission_request`(도구가 승인 필요), `permission_resolved`(누군가 투표), `model_switched`, `model_switch_failed` 및 터미널 프레임 `session_died`(에이전트 자식 충돌 — SSE 닫힘)와 `client_evicted`(큐 오버플로 — SSE 닫힘)를 발생시킵니다.

### 5. 프롬프트 전송(원래 터미널로 돌아가서)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

4단계의 `curl -N`이 프레임이 도착하는 대로 출력합니다.

### 선택적 Todo 중지 가드

장기 실행 데몬 클라이언트는 현재 작업 체인이 최상위 Todo 목록을 성공적으로 작성한 후 아직 대기 중이거나 진행 중인 항목이 있는 상태에서 중지될 때 제한된 계속에 옵트인할 수 있습니다. 이를 `settings.json`에 추가하고 데몬을 재시작하세요:

```json
{
  "experimental": {
    "todoStopGuard": true
  }
}
```

가드는 새 사용자 입력 없이 최대 두 번의 연속 기본 모델 호출을 추가합니다. 중간 턴 사용자 메시지가 먼저 실행됩니다. 재시도/계속 및 관련 백그라운드 결과는 현재 단계의 예산을 유지합니다. 모든 호출과 최종 고갈 상태는 재생 가능한 `session_update` 이벤트로 `_meta.source: "todo_stop_guard"`와 함께 나타납니다; 메타데이터는 시도 및 미완료 수를 포함하지만 Todo 텍스트는 포함하지 않습니다. 대기 중인 전체 프롬프트도 먼저 실행되며 기존 권한/취소 규칙은 변경되지 않습니다.

무장된 체인이 관련 백그라운드 작업을 기다리는 동안, 관련 없는 cron/loop 발생 및 오래된 작업 알림이 지연됩니다. 반복 작업은 체인이 양보할 때까지 작업별로 제한되고 병합됩니다.

이 옵션은 기본값이 `false`이며 재시작이 필요하고, 안전 모드, 베어 모드 및 승인 `plan` 모드에서 강제로 꺼집니다. 인메모리 전용입니다: 디스크에서 Todo 상태를 로드하거나 데몬을 재시작해도 무장되지 않습니다. 새 일반 프롬프트는 자체 최상위 `todo_write`를 성공적으로 실행해야 합니다; 재시도/계속 및 라이브 클라이언트 재연결은 현재 인메모리 작업 체인을 유지합니다. 세션 작업 디렉토리를 성공적으로 변경하면 정리되어 오래된 Todo가 새 워크스페이스에서 재개되지 않습니다.

## 인증

루프백을 벗어나려면 베어러 토큰을 **반드시** 전달해야 합니다:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

클라이언트는 모든 요청에 `Authorization: Bearer $QWEN_SERVER_TOKEN`을 전송합니다. `/health`는 **루프백 바인드에서만** 면제되므로 파드 내부의 k8s/Compose 활성 프로브(`127.0.0.1`에서 데몬이 수신)는 자격 증명이 필요하지 않습니다. 비루프백 바인드(`--hostname 0.0.0.0` 등)에서 `/health`는 다른 모든 라우트와 마찬가지로 토큰이 필요합니다 — 그렇지 않으면 공격자가 임의 주소를 탐색하여 데몬 존재를 확인할 수 있습니다. `/capabilities`를 사용하여 토큰이 종단에서 올바른지 확인하세요(항상 인증 필요):

> **강화된 루프백(`--require-auth`).** 기본 루프백 토큰 없음 동작은 단일 사용자 노트북에서는 괜찮지만, 모든 로컬 사용자가 `curl 127.0.0.1:4170`을 할 수 있는 공유 개발 호스트, CI 러너 또는 다중 테넌트 워크스테이션에서는 안전하지 않습니다. `--require-auth`를 전달하면 `/health` 및 `/capabilities`를 포함한 모든 라우트에서 베어러 토큰이 필수화됩니다 — `127.0.0.1`에 바인딩된 경우에도. 토큰 없이는 부팅이 실패합니다. 플래그가 켜지면 **인증되지 않은** 클라이언트는 `/capabilities`를 읽어서 인증이 필요함을 발견할 수 없습니다; 발견 표면은 401 응답 본문 자체입니다. 인증되면 `caps.features.require_auth` 태그는 배포가 강화되었음을 사후 인증 확인합니다(감사/컴플라이언스 UI에 유용):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (또는 인덱스 — 인증 후 non-null이면 태그 존재)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

토큰 비교는 상수 시간입니다(SHA-256 + `crypto.timingSafeEqual`); 401 응답은 "누락된 헤더", "잘못된 스킴" 및 "잘못된 토큰"에서 균일하므로 사이드 채널이 구별할 수 없습니다.

## HTTPS / TLS(모바일 / 크로스 디바이스 액세스용)

기본적으로 데몬은 일반 HTTP를 제공합니다. `localhost`에서는 괜찮지만, LAN IP(`https://192.168.x.x:4170`)를 호출하는 휴대폰이나 태블릿은 `http://`를 통해 [보안 컨텍스트](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)가 **아닙니다** — 따라서 브라우저는 `getUserMedia`(음성 입력), WebRTC 및 기타 보안 컨텍스트 전용 API를 차단합니다. `--tls-cert` + `--tls-key`를 전달하여 Web Shell을 HTTPS로 제공하고 이들을 잠금 해제하세요:

```bash
# 1. 로컬 CA를 설치하고 신뢰합니다(일회성). 모바일 장치도
#    이 CA를 신뢰해야 합니다 — mkcert는 루트 인증서가 있는 위치를 출력합니다.
mkcert -install

# 2. 머신의 LAN IP에 대한 인증서를 생성합니다. localhost / 127.0.0.1도
#    SAN에 추가하세요: `--open`과 함께 데몬은 브라우저 URL을
#    127.0.0.1로 재작성하므로, LAN IP에만 범위가 지정된 인증서는
#    ERR_CERT_COMMON_NAME_INVALID로 거부됩니다. (mkcert는 모든 호스트에 따라
#    출력 이름을 지정합니다.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. HTTPS를 통해 데몬을 시작합니다. 비루프백 바인드는 여전히 토큰이 필요하며,
#    브라우저 Origin은 CORS를 통해 허용되어야 합니다.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

참고:

- **두 플래그 모두 또는 모두 없음** — 하나만 주어지면 부팅이 실패합니다(키 없는 인증서는 HTTPS 리스너를 시작할 수 없음).
- **TLS는 인증과 직교** — HTTPS는 전송을 암호화합니다; 베어러 토큰은 여전히 모든 API 라우트를 게이트합니다. 비루프백 바인드는 TLS 유무와 관계없이 토큰이 필요합니다.
- **범위는 TLS 종단만** — 자동 생성 없음, ACME / Let's Encrypt 없음. 이것은 LAN / 개발 편의입니다; 인터넷 노출 배포의 경우 리버스 프록시에서 TLS를 종단하세요(아래 위협 모델 참조).

## CLI 플래그

| 플래그                                  | 기본값             | 목적                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`             | TCP 포트. `0` = OS 할당 임시 포트.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--hostname <addr>`                     | `127.0.0.1`        | 바인드 인터페이스. 루프백을 벗어나려면 토큰이 필요합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--local-control`                       | `false`            | 모든 비루프백 IPv4 인터페이스에서 인증된 Web Shell을 프로세스당 새 토큰, 터미널 QR 코드 레이블, 정확한 브라우저 오리진, 고정 포트 및 최선 노력 절전 억제로 공유합니다. `--token`, `--allow-origin`, `--no-web`, `--port 0` 및 비기본 `--hostname`과 충돌합니다; 음성 입력과 같은 보안 컨텍스트 브라우저 API를 위해서는 `--tls-cert` + `--tls-key`를 추가하세요.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--token <str>`                         | —                  | 베어러 토큰. `QWEN_SERVER_TOKEN` 환경 변수로 폴백(선행/후행 공백 제거 — `$(cat token.txt)`에 편리).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`            | 루프백에서도 베어러 토큰 없이 시작 거부. 공유 개발 호스트 / CI 러너 / 모든 로컬 사용자가 리스너에 접근할 수 있는 다중 테넌트 워크스테이션을 위해 `127.0.0.1` 개발자 기본값을 강화합니다. `--token` 또는 `QWEN_SERVER_TOKEN`이 설정된 경우에만 부팅; `/health`도 베어러 뒤에 게이트.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —                  | PEM 인증서 파일 경로. HTTP 대신 **HTTPS**로 제공합니다. `--tls-key`와 쌍을 이루어야 합니다(하나만 주어지면 부팅 실패). 보안 컨텍스트 브라우저 API — 음성 입력(`getUserMedia`), WebRTC — 를 LAN IP에서 잠금 해제하며, 그렇지 않으면 브라우저가 일반 `http://`에서 차단합니다. TLS 종단만; 자동 생성 / ACME 없음. 아래 [HTTPS / TLS](#https--tls모바일--크로스-디바이스-액세스용) 참조.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —                  | PEM 개인 키 파일 경로. `--tls-cert`와 쌍을 이루어야 합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `32`               | 동시 라이브 세션 상한. 상한에 도달하면 새 자식을 생성하는 `POST /session` 요청은 `503`(`Retry-After: 5` 포함)을 반환합니다; 기존 세션에 대한 연결은 카운트되지 않습니다. 비활성화하려면 `0`으로 설정. 단일 사용자 / 소규모 팀 사용에 맞춰져 있습니다; 배포에 RAM/FD 여유가 있으면(~30–50 MB/세션) 높이세요.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-total-sessions <n>`              | 파생               | 선택적 음이 아닌 정수 데몬 전체 신규 세션 생성 상한. 모든 등록된 워크스페이스 런타임에 적용됩니다. 새 자식 세션, 세션 복원 및 브랜치/포크 생성 세션에 적용됩니다; 기존 라이브 세션에 연결은 슬롯을 소비하지 않습니다. 무제한으로 설정하려면 `0`으로 설정. 여러 시작/복원 워크스페이스와 함께 생략하면 데몬은 워크스페이스당 제한과 시작 워크스페이스 수에서 고정 상한을 파생합니다; 이후 동적 등록은 재계산하지 않습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--max-pending-prompts-per-session <n>` | `5`                | `POST /session/:id/prompt`에서 수락되었지만 아직 정착되지 않은 프롬프트의 세션당 상한. 대기 중인 프롬프트와 활성 프롬프트를 포함합니다. 브리지는 `promptId`를 반환하기 전에 오버플로를 `503`, `Retry-After: 5` 및 `code: "prompt_queue_full"`로 동기적으로 거부합니다. 비활성화하려면 `0`으로 설정. `branchSession`은 동일한 FIFO에서 직렬화되지만 이 프롬프트 상한에 카운트되지 않습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()`    | 이 데몬이 등록한 절대 워크스페이스 디렉토리. 플래그를 반복하여 하나의 프로세스에서 여러 워크스페이스를 호스팅합니다; 첫 번째가 기본이며 요청이 `cwd`를 생략할 때 기본값으로 유지됩니다. 상대값은 거부됩니다. 표준화된 `cwd`가 등록되지 않은 세션 요청은 `400 workspace_mismatch`를 반환합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--memory-project-scope <mode>`         | `workspace`        | 프로젝트 메모리 분할 모드. `workspace`(기본값)는 정확히 등록된 워크스페이스 디렉토리별로 메모리를 키잉하여 각 데몬 워크스페이스가 자체 격리된 메모리를 갖습니다; `git-root`는 동일한 Git 루트로 확인된 워크스페이스가 공유하는 레거시 호환 모드입니다. 제공 시 `QWEN_CODE_MEMORY_PROJECT_SCOPE`를 재정의합니다; 빈 env 값은 미설정으로 취급되며, 인식되지 않는 비어 있지 않은 값은 일회성 경고와 함께 무시되고 레거시 `git-root` 동작을 유지합니다. 새 기본값은 기존 git-root 프로젝트 메모리를 마이그레이션하지 않습니다 — 마이그레이션 중 해당 항목을 읽으려면 명시적 `git-root` 범위를 사용하세요.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--channel <name\|all>`                 | —                  | 실험적 데몬 관리 채널 워커. 플래그를 반복하여 여러 구성된 채널을 선택하거나 `all`을 전달하여 모든 구성된 채널을 시작합니다. `all`은 이름 채널과 결합할 수 없습니다. 선택된 채널 `cwd` 값은 등록된 워크스페이스로 확인되어야 합니다; 다중 워크스페이스 데몬은 소유 워크스페이스당 하나의 워커를 실행합니다. 워커는 `qwen serve`가 소유합니다; serve 관리 채널을 중지하려면 데몬을 중지하세요.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--max-connections <n>`                 | `256`              | 리스너 레벨 TCP 연결 상한(`server.maxConnections`). 세션 수와 관계없이 원시 소켓 수를 제한합니다 — 느린/유령 SSE 클라이언트는 가득 차면 수락 시점에서 거부됩니다. 세션당 많은 SSE 구독자가 예상되면 `--max-sessions`과 함께 높이세요.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--memory-budget-mb <n>`                | cgroup/호스트의 50% | 전체 데몬 프로세스 트리에 대한 총 메모리 예산(MB). 설정되지 않으면 cgroup 제한 또는 호스트 메모리의 50%로 파생됩니다; 어쨌든 유효 값은 해석된 사용 가능 메모리로 제한되며, 구성된 값과 유효 값 모두 보고됩니다. 현재 관찰 전용 — `qwen --acp` 자식의 크기를 변경하지 않습니다. 해석된 수치는 `GET /daemon/status`의 `limits.memory` 아래에, 등록된 및 라이브 자식 수와 `runtime.memory` 아래의 자식당 권장 공유와 함께 나타납니다. 최소값에 비해 너무 작은 호스트는 클램프 업 대신 `insufficientMemory`를 보고합니다; 파생 비율이 50%이므로 ~2 GB 미만의 호스트는 이를 트리거합니다. 이러한 호스트에서 `--memory-budget-mb 1024`를 명시적으로 전달하여 파생 값을 재정의하세요(플래그는 여전히 경고를 지우기 위해 최소 1024 MB의 사용 가능 메모리가 필요). `[1024, 1048576]` 범위의 정수여야 합니다.                                                                                                                                                                                                                    |
| `--memory-pressure-mode <mode>`         | `observe`          | 데몬이 자체 메모리 읽기를 판정으로 전환하는지 여부. `observe`(기본값)는 `GET /daemon/status`의 `runtime.memory.pressure` 아래 압력 레벨을 보고하고 레벨이 `normal`을 벗어날 때마다 `daemon_memory_pressure` 이슈(`warning`이므로 전체 `status`는 `ok`를 유지)를 발생시킵니다. `off`는 레벨을 포함한 모든 수치를 보고하지만 이슈를 발생시키지 않으므로 전체 `status`가 변경되지 않습니다; 교정 중이거나 최상위 상태에 대해 경고할 때 사용하세요. 레벨은 두 비율 중 더 나쁜 것입니다: 사용 가능한 메모리에 대한 RSS(cgroup OOM 킬러가 감시)와 이 프로세스의 힙 상한에 대한 V8 힙 사용. 데몬 루트 프로세스만 커버합니다; 자식에 대해서는 `runtime.memory.children.rssBytes`와 비교하세요. 두 모드 모두 아무것도 개선하지 않습니다. `off`, `observe` 중 하나.                                                                                                                                                                                                                                  |
| `--child-heap-mode <mode>`              | `observe`          | 데몬이 `--memory-budget-mb`의 자식당 힙 분할을 모델링하는지 여부. `observe`(기본값)는 적용할 내용 — `limits.memory.childHeap.perChildCeilingMb` 및 `maxConcurrentChildren` — 을 보고하고 제한을 초과했을 생성 수를 카운트합니다. **아것도 적용되지 않습니다**: 예산에서 크기가 지정되는 자식도 없고 생성이 거부되지도 않습니다. `off`는 아무것도 모델링하지 않으며 유선에서 그렇게 말합니다: `maxConcurrentChildren`과 `perChildCeilingMb`는 모두 `null`이며 스위치를 끈 분할을 운반하지 않습니다. 거부 카운트 0이 분할을 적용해도 안전하다는 의미는 **아닙니다**: 자식은 여전히 훨씬 더 큰 호스트 파생 상한에서 실행되므로 모델링된 상한보다 더 많은 old space가 필요한 워크로드가 여기서는 완벽하게 건강해 보입니다. 분할 적용은 이에 답할 수 있는 측정과 함께 제공됩니다.                                                                                                                                                                                                                                              ... (생략) |
| `--event-ring-size <n>`                 | `8000`             | 세션별 SSE 재생 링 깊이(#3803 §02 대상). `Last-Event-ID: N`과 함께 `GET /session/:id/events`에 사용 가능한 백로그를 설정합니다. 더 크면 = 세션당 수백 KB 추가 RAM을 비용으로 더 많은 재연결 여유. SDK 클라이언트는 `?maxQueued=N`(범위 `[16, 2048]`, 기본 256)을 통해 특정 구독에 대한 더 큰 구독자별 백로그 상한을 추가로 요청할 수 있습니다. 데몬은 또한 75% 큐 채움에서 비터미널 `slow_client_warning` SSE 프레임을 발생시켜 클라이언트가 축출되기 전에 드레인/재연결할 수 있습니다. `caps.features.slow_client_warning`로 사전 점검.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--compacted-replay-max-bytes <n>`      | `4194304`          | `POST /session/:id/load`가 반환하는 유한 스냅샷의 보유 재생 이벤트에 대한 세션당 바이트 상한. 상한은 `compactedReplay`에 적용됩니다; 현재 비행 중인 `liveJournal`은 `--max-journal-events`와 `--max-journal-bytes`로 별도로 제한됩니다. 값은 양의 안전 정수여야 합니다; 잘못된 값은 부팅 시 실패하며 하드 상한은 256 MiB입니다. 오래된 보유 재생이 삭제되면 스냅샷은 `history_truncated`로 시작됩니다. 이것은 디스크 트랜스크립트를 제한하지 않습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--max-journal-events <n>`              | `10000`            | 현재 미완료 턴의 비행 중 `liveJournal`에 보유된 재생 항목의 세션당 상한. **연속되는 호환 텍스트 또는 사고 청크는 항목을 공유하며, 항목당 최대 256개의 소스 이벤트가 가능합니다; 다른 이벤트 경계는 보존됩니다.** 초과하면 가장 오래된 항목이 삭제되고 `history_truncated` 마커가 앞에 추가됩니다. **마커의 `truncatedEvents`와 `retainedEvents` 카운트는 소스 이벤트를 설명합니다.** 양의 안전 정수여야 합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--max-journal-bytes <n>`               | `8388608`          | 비행 중 `liveJournal`의 세션당 바이트 상한으로, **호환 청크가 재생 항목을 공유하더라도 직렬화된 소스 이벤트로부터 계산됩니다.** 초과하면 가장 오래된 항목이 전체적으로 삭제됩니다 **(최소 하나의 항목은 항상 유지되므로, 보유된 꼬리가 상한보다 훨씬 작을 수 있습니다).** 양의 안전 정수여야 합니다. 기본값 8 MiB.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`               | —                  | 라이브 MCP 클라이언트에 대한 양의 정수 상한. `mcp_workspace_pool`이 광고되면 상한과 전송이 워크스페이스 런타임별로 공유됩니다; 태그가 없으면 레거시 세션별 관리자가 적용합니다. `--mcp-budget-mode`와 결합. 설정되지 않으면 회계 기반 적용 없음(하지만 `GET /workspace/mcp`은 여전히 `clientCount`를 보고). claude-code의 `MCP_SERVER_CONNECTION_BATCH_SIZE`와 구별 — 이것은 총 라이브 클라이언트가 아닌 시작 동시성을 게이트합니다. `caps.features.mcp_guardrails` 및 `caps.features.mcp_workspace_pool`로 사전 점검.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--mcp-budget-mode <m>`                 | `warn` / `off`     | `--mcp-client-budget` 적용 방식. `warn`(예산 설정 시 기본값): 거부 없음, 스냅샷의 `budgets[0].status`가 예산의 ≥75%에서 `warning`으로 전환. `enforce`: 상한을 초과하는 연결이 거부되고 서버별 셀에 `disabledReason: 'budget'`가 표시되며 `mcpServers` 선언 순서에 따라 결정적. `off`(예산 미설정 시 기본값): 순수 관찰. 부팅은 예산 없이 `enforce`를 거부.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--external-tool-guard-mode <m>`        | `off`              | 관리 ACP 외부 사전 실행 정책. `off`는 제공자 호출을 하지 않고 기능을 광고하지 않습니다. `required`는 호환 제공자가 v1 핸드셰이크를 완료하지 않으면 시작을 실패하고, 지원되는 모든 최상위 도구 호출을 단일 준비 요청이 허용되지 않는 한 닫힌 상태로 실패합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--external-tool-guard-endpoint <url>`  | —                  | `required` 모드에서 사용되는 오리진 전용 루프백 HTTP(S) 제공자 URL(예: `http://127.0.0.1:8787`). 경로, URL 자격 증명, 리디렉션, 비루프백 호스트 및 프록시 라우팅은 허용되지 않습니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--external-tool-guard-timeout-ms <n>`  | `3000`             | 정수 `100..30000`; 시작 핸드셰이크와 각 준비 요청에 독립적으로 적용.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--http-bridge`                         | `true`             | Stage 1 모드: 프로덕션은 호환성을 위해 하나의 기본 `qwen --acp` 자식을 예열하고 실패 시 첫 사용 시 재시도하며, 각 신뢰할 수 있는 보조는 온디맨드로 하나의 자식을 시작할 수 있습니다. 런타임을 대상화하는 세션은 ACP `newSession()`을 통해 자식으로 멀티플렉스됩니다; 신뢰할 수 없는 보조는 ACP를 시작할 수 없습니다. Stage 2 네이티브 프로세스 내는 나중에 사용 가능합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--initialize-timeout-ms <n>`           | `10000`            | ACP 자식 요청 타임아웃. `initialize` 핸드셰이크 포함(ms). `2147483647`까지의 양의 정수. JS 타이머 상한(`2^31-1`)을 초과하는 값은 Node가 이를 1 ms로 조용히 압축하기 때문에 부팅 시 거부됩니다. 자식 시작에 대한 추가 여유가 필요한 콜드 컨테이너 배포는 이를 높일 수 있습니다; 동일한 값이 `newSession`, 워크스페이스 상태 폴링 및 기타 ACP 확장 메서드 마감 시간을 관리합니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--session-restore-timeout-ms <n>`      | `60000`            | ACP 세션 로드/재개 마감 시간(밀리초). `2147483647`까지의 양의 정수여야 하며 `0`은 유효하지 않습니다. 생략하면 기본값은 60초이며, 명시적으로 제공된 `--initialize-timeout-ms`가 더 큰 값이면 해당 값으로 올라갑니다; 더 짧은 초기화 타임아웃이 복원 예산을 낮추지는 않습니다. SDK와 WebUI는 10초와 15초의 클라이언트 여유를 추가합니다. 타임아웃은 재시도 가능한 `504 session_restore_timeout`을 반환합니다; 데몬 자체가 종료되었다는 의미는 아닙니다.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--allow-origin <pat>`                  | —                  | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). 브라우저 webui 클라이언트를 위한 크로스 오리진 허용 목록. 반복 가능. 각 값은 `*`(모든 오리진 — 베어러 토큰이 구성되지 않으면 부팅 거부; `/health`와 `/demo`가 루프백에서 기본적으로 사전 인증이므로 `--require-auth`가 루프백에서 권장) 또는 표준 URL 오리진(`<scheme>://<host>[:<port>]`, 후행 슬래시/경로/사용자 정보/쿼리 없음). **서브도메인 와일드카드(`https://*.example.com`)는 의도적으로 지원되지 않습니다** — 각 서브도메인을 명시적으로 나열하거나 구성된 토큰(완전한 강화를 위해 `--require-auth`)과 함께 `*`를 사용하세요. 매칭된 오리진은 `Access-Control-Allow-Origin: <에코>`, `Vary: Origin` 및 노출된 `Retry-After`를 포함한 CORS 응답 헤더를 받습니다; 매칭되지 않은 오리진은 여전히 403을 받습니다. `Origin: null`(샌드박스 iframe, file:// 문서)은 `*`에서도 항상 거부됩니다. `caps.features.allow_origin`으로 사전 점검. 루프백 자체 오리진 히트는 영향을 받지 않습니다. 참고: Web Shell 정적 자산(`/`, `/assets/*`, `/session/:id` 문서 탐색)은 모든 모드에서 베어러 전에 마운트되며 `--require-auth`에서도 사전 인증 상태를 유지하므로, 잔여 브라우저 표면이 문제되면 `--no-web`을 사용하세요. |
| `--web` / `--no-web`                    | `true`             | 데몬 루트에서 빌드된 Web Shell SPA를 제공합니다(`GET /`, `/assets/*` 및 `GET /session/<id>` 문서 탐색). 이 진입점은 베어러 인증 게이트 **전에** 등록됩니다 — 브라우저는 `<script>` 하위 리소스나 주소 표시줄 탐색에 토큰을 첨부할 수 없으며 셸은 시크릿을 운반하지 않습니다. 모든 API 라우트는 여전히 토큰 게이트 상태이며, 다른 모든 경로에 대한 SPA 딥링크 폴백도 베어러 게이트 뒤에 있습니다. 비루프백 바인드에서는 UI가 인증 없이 접근 가능하다는 한 줄 stderr 경고가 표시됩니다. API 전용 데몬의 경우 `--no-web`을 사용하세요. 빌드에 Web Shell 자산이 누락되면 효과 없음(데몬이 브레드크럼을 로그하고 API 전용으로 실행).                                                                                                                                                                                                                                                                                                                                                                                |
| `--open`                                | `false`            | 리스너가 시작된 후 기본 브라우저에서 데몬 URL에서 Web Shell을 엽니다(토큰이 구성된 경우 `#token=`이 URL 프래그먼트로 추가 — 프래그먼트는 절대 서버로 전송되지 않아 토큰이 액세스 로그와 Referer 헤더에서 제외). `--no-web`과 함께 또는 브라우저를 사용할 수 없는 헤드리스 / CI / SSH 환경에서는 no-op.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

> **메모리 프로젝트 범위 주의사항.**
>
> - **데몬 vs. 독립 실행형 CLI.** `--memory-project-scope`(및
>   `QWEN_CODE_MEMORY_PROJECT_SCOPE`)는 데몬 관리 런타임에만 영향을
>   미칩니다. 같은 디렉토리에서 시작된 독립 실행형 `qwen` TUI는
>   환경 변수가 전역으로 내보내지지 않는 한 여전히 git-root 범위를
>   사용합니다. 두 진입점을 일관되게 유지하려면 워크스페이스 `.env` 또는
>   `settings.env`에서 범위를 고정하여 워크스페이스를 읽는 모든 프로세스가
>   동의하도록 하세요.
> - **디렉토리 이름 충돌.** 저장 키는 모든 비영숫자 문자를
>   `-`로 교체하는 `sanitizeCwd`에 의해 파생됩니다. 구두점만 다른
>   형제 디렉토리(예: `feature_1`과 `feature-1`)는 `workspace`
>   범위에서도 동일한 메모리 디렉토리에 매핑됩니다. 워크스페이스
>   격리에 의존할 때 이러한 이름을 피하세요.
> - **플래그와 env var 간 정규화가 다릅니다.** 환경 변수는
>   트리밍되고 소문자화됩니다(`"  Workspace  "` 작동); CLI 플래그는
>   yargs `choices`에 의해 대소문자 구분 매칭됩니다(`--memory-project-scope
Workspace` 거부). 둘 사이에서 복사할 때 소문자 값을 사용하세요.

### 필수 외부 도구 가드

이 옵트인은 최종 도구 실행자 경계에서 외부 허용/거부 결정이 필요한
관리 ACP 배포를 위한 것입니다. `--external-tool-guard-mode=required`가
없으면 완전히 비활성 상태입니다:

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

제공자는 `POST /v1/handshake`와 `POST /v1/prepare`를 노출하고,
`Authorization: Bearer <token>`을 요구하며, JSON을 반환하고, 제공된
논스 또는 요청 ID를 에코하고 프로토콜 버전 `1`을 사용해야 합니다.
토큰은 비어 있지 않고 최대 8192 UTF-16 코드 유닛이며 제어 문자를
포함하지 않아야 합니다. 요청은 1 MiB로, 응답은 64 KiB로, 선택적 거부
이유는 제어 문자 없는 500 UTF-16 코드 유닛으로 제한됩니다. 성공적인
prepare 응답:

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

거부는 `allowed:false`를 사용하고 짧은 `reason`을 추가할 수 있습니다.
기존 권한 및 `PreToolUse` 게이트를 통과하여 최종 실행 경계에 도달하는
지원되는 각 최상위 도구 호출에 대해 Qwen Code는 하나의 prepare 요청을
전송하며 재시도하지 않습니다. 이전 권한/hook 거부는 prepare 요청을
전송하지 않습니다. 타임아웃, 취소, 전송 실패, 잘못된 또는 일치하지 않는
응답 및 명시적 거부는 실행자가 실행되는 것을 방지합니다. 각 생성된
ACP 채널은 필수 콜백을 설치했음을 확인해야 합니다; 누락되거나 호환되지
않는 확인은 세션 생성 전에 채널을 거부합니다.
제공자 요청은 `sessionId`, `promptId`, `toolCallId`, 표준
`toolName` 및 최종 `arguments`를 전달합니다; `toolCallId`는 상관 레이블이며
인증 ID나 독립 멱등성 키가 아닙니다.

최종 인수는 민감한 애플리케이션 데이터를 포함할 수 있습니다.
제공자 로그와 감사 저장소에서 이를 해당 데이터로 취급하세요.

`PreToolUse` hook은 이 최종 실행자 결정 전에 실행됩니다. 필수 가드
모드는 hook 동작을 인증하거나 샌드박스하지 않습니다; 가능한 모든
부작용에 대한 경계가 필요한 배포는 hook을 비활성화하거나 구현을
별도로 관리해야 합니다.

슬래시 명령어 작업도 모델/도구 스케줄링 전에 실행되며 가드
호출이 아닙니다. 일부 내장 기능은 직접 파일이나 설정을 변경할 수
있습니다. 모든 효과 경계가 필요한 관리 배포는 슬래시 명령어 입력을
거부하거나 `slashCommands.disabled` 또는 `--disabled-slash-commands`를
통해 승인되지 않은 모든 명령어를 비활성화해야 합니다.

v1 관리 범위는 활성 포그라운드 관리 프롬프트가 호출한 최상위 도구입니다.
중첩되거나 위임하는 `agent`, `workflow`, `create_sub_session`,
`send_message`, 직접 `/fork` 및 에이전트 기반 워크스페이스 메모리
remember/dream 제어는 필수 모드가 활성인 동안 거부됩니다. 최상위
백그라운드 셸 또는 모니터 시작은 여전히 하나의 가드 호출이며 최종 인수가
제공자에 도달하지만, 이 기능은 프로세스를 지속적으로 인증하거나
프로세스 완료 감사 프로토콜을 추가하지 않습니다; 포그라운드 완료를
요구하는 정책은 해당 형태를 거부해야 합니다. 가드된 MCP 호출은 전송
오류 후 자동 재연결/재생도 비활성화합니다. 성공적인 시작 핸드셰이크 후
`/capabilities`는 `external_tool_guard`를 광고합니다; 부재는 클라이언트가
집행을 가정하지 않아야 함을 의미합니다.

이 기능은 명시적 데몬 REST/ACP 관리 호출을 인증하지 않습니다;
그것들은 데몬의 기존 인증 및 라우트 계약을 계속 사용합니다. 또한
허용된 도구 또는 셸 명령어를 결정적으로 만들거나 내부를 샌드박스하지
않습니다; 관리 배포는 제공자 결정과 일반 도구 정책 및 격리 경계를
결합해야 합니다.

> **부하 조절기 크기 조정.** `--max-sessions`는 워크스페이스당 신규 세션 상한입니다. `--max-total-sessions`는 설정 시 데몬 전체 신규 세션 상한입니다.
> 세 개의 다른 레이어도 부하를 제한합니다 — 고동시성 배포를 위해
> 크기를 조정할 때 함께 조절하세요:
>
> - **리스너 레벨**: `--max-connections` / `server.maxConnections=256`
>   원시 TCP 연결을 제한합니다(느린 클라이언트 배압).
> - **세션당 구독자**: EventBus는 기본적으로 세션당 SSE 구독자를
>   64로 제한합니다; 65번째 클라이언트는 터미널 `stream_error`를 받고
>   닫힙니다.
> - **세션당 프롬프트 수용**:
>   `--max-pending-prompts-per-session=5`는 하나의 세션에 대해 수락된
>   대기 중 + 활성 프롬프트를 제한합니다. 오버플로는 `503`에
>   `Retry-After: 5`를 받습니다.
> - **데몬 전체 신규 세션**: `--max-total-sessions=N`은 데몬 전체
>   신규 세션 생성을 제한합니다. 오버플로는 동일한
>   `session_limit_exceeded` 형태를 `scope: "total"`과 함께 받습니다.
> - **구독자별 백로그**: SSE 클라이언트당 256 프레임 큐; 초과
>   용량 클라이언트는 터미널 `client_evicted` 프레임을 받고
>   닫힙니다(하나의 느린 소비자가 데몬을 고정할 수 없음).
>
> 이 상한들은 상호 작용합니다: 각 런타임은 `--max-sessions`로 제한되며,
> `--max-total-sessions`는 그들의 집합을 제한합니다. 유효 세션 상한은
> 유한한 데몬 전체 상한과 런타임당 집합 상한 중 더 낮은 값입니다(워크스페이스당
> 상한이 무제한이면 해당 집합을 무제한으로 취급). 둘 다 유한하지 않으면
> 유한 세션 상한이 없습니다. 유한 상한 × 64 구독자 × 256 프레임은
> EventBus 레이어의 최악의 경우 비행 중 메모리입니다; 여기에
> `--max-pending-prompts-per-session`을 곱하면 수용 레이어에서 수락된
> 프롬프트 작업이 제한됩니다. 기본 크기는 단일 사용자 / 소규모 팀 부하를
> 가정합니다; 더 큰 배포를 위해 점진적으로 높이세요(RSS를 관찰).

> **MCP 클라이언트 가드레일(이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** `mcpServers`에 30개의 MCP 서버를 선언하는 워크스페이스는 상한을 설정하지 않으면 30개의 클라이언트를 제한 없이 시작합니다. `--mcp-client-budget=N`은 라이브 MCP 클라이언트 수를 제한합니다; `--mcp-budget-mode={enforce,warn,off}`가 동작을 선택합니다. 기본값은 예산이 설정되면 `warn`입니다(스냅샷이 경고를 표시하지만 클라이언트는 거부되지 않음 — 집행을 전환하기 전에 실제 세계 팬아웃을 측정하는 데 유용). `enforce` 모드에서 거부된 서버는 서버별 셀에 `disabledReason: 'budget'`를 얻고 `budgets[0]` 셀은 `status: 'error'` + `errorKind: 'budget_exhausted'`를 표시합니다. 슬롯 예약은 서버 이름으로 이루어지며 재연결 / 검색 타임아웃에서도 유지됩니다 — 거부된 서버는 건강한 서버로부터 슬롯을 빼앗을 수 없습니다.
>
> **현재 범위는 기능 기반입니다.** `mcp_workspace_pool`이 존재하면 하나의 워크스페이스 런타임의 모든 세션이 해당 MCP 전송 풀과 예산 컨트롤러를 공유합니다; `GET /workspace/mcp`은 `scope: 'workspace'`를 출력합니다. 두 번째 워크스페이스는 독립 풀과 예산을 가집니다. 태그가 없으면(`QWEN_SERVE_NO_MCP_POOL=1` 포함), 데몬은 레거시 세션별 `McpClientManager`를 사용하고 `scope: 'session'`을 출력합니다; 해당 폴백에서 N개의 세션이 각각 구성된 상한을 소비할 수 있습니다.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # 나중에, 텔레메트리로 실제 분포를 확인한 후:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> 이것은 claude-code의 `MCP_SERVER_CONNECTION_BATCH_SIZE`(시작 동시성을 게이트)와 같지 않습니다; 직교합니다. 클라이언트는 `mcp_workspace_pool`을 분기해야 하며 프로토콜 버전만으로 범위를 가정하면 안 됩니다.
>
> **푸시 이벤트(이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** `GET /session/:id/events`를 구독하는 SDK 클라이언트는 예산 임계값이 교차할 때 타입화된 프레임을 받습니다 — `mcp_budget_warning`(합성, 75% 상승 교차당 한 번 발생하며 37.5%에서 히스테리시스 리암, `mcp_guardrail_events`를 통해 광고) 및 `mcp_child_refused_batch`(`enforce` 모드에서 검색 패스당 한 번 병합; `readResource` lazy-spawn 거부에서 길이-1). `GET /workspace/mcp`의 스냅샷은 여전히 재연결 후 상태의 진실 원천입니다; 이벤트는 변화 엣지입니다. 폴링 없이 실시간으로 대시보딩할 때 유용합니다.

## 기본 배포 위협 모델

- **127.0.0.1만** — 루프백 바인드, 인증 불필요.
- **`--hostname 0.0.0.0`는 토큰 필요** — 토큰 없으면 부팅 거부.
- **`LOOPBACK_BINDS`는 IPv6 포함** — `::1`과 `[::1]`은 토큰 없음 규칙에 대해 루프백으로 카운트.
- **Host 헤더 허용 목록** — **루프백** 바인드에서 데몬은 `Host:`가 `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port`와 일치하는지 확인합니다(RFC 7230에 따라 대소문자 구분 없음). 일치하지 않는 `Host`는 `403`을 받습니다. **비루프백 바인드(`--hostname 0.0.0.0`)는 의도적으로 Host 허용 목록을 우회합니다** — 운영자가 표면을 선택했으므로 베어러 토큰 게이트가 유일한 인증 레이어입니다; 리버스 프록시 / SNI / 클라이언트 인증서 핀ning은 데몬이 아닌 운영자의 책임입니다. 비루프백 바인드에서 Host 기반 격리가 필요하면 TLS를 종료하고 프론트 프록시에서 Host를 확인하세요.
- **CORS는 기본적으로 모든 브라우저 Origin을 거부** — `403` JSON을 반환합니다. **`--allow-origin <pattern>`**(반복 가능, T2.4 #4514)을 전달하여 특정 브라우저 오리진을 통과시키세요. 각 값은 리터럴 `*`(모든 오리진 — 베어러 토큰이 구성되지 않으면 부팅 거부; `/health`와 `/demo`가 루프백에서 기본적으로 사전 인증이므로 완전한 강화를 위해 `--require-auth` 권장) 또는 표준 URL 오리진(`<scheme>://<host>[:<port>]`, 후행 슬래시/경로/사용자 정보 없음). 매칭된 오리진은 적절한 CORS 응답 헤더를 받습니다(`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin` 및 표준 메서드/헤더/max-age와 노출된 `Retry-After`); 매칭되지 않은 오리진은 여전히 기본 월과 동일한 인벨롭으로 403을 받습니다. `caps.features.allow_origin`은 조건부로 광고되어 SDK / webui 클라이언트가 크로스 오리진 히트를 치기 전에 데몬이 이를 존중하는지 사전 점검할 수 있습니다. 예시: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. 루프백 자체 오리진 히트(예: `/demo` 페이지)는 영향을 받지 않습니다 — 별도의 Origin-스트립 심이 `--allow-origin`과 관계없이 처리합니다. **`--allow-origin`이 구성되지 않은 브라우저 webui**는 여전히 이전과 동일한 Stage 1 옵션으로 폴백합니다: 네이티브 셸(Electron/Tauri)로 패키징하여 `Origin` 헤더가 전송되지 않도록 하거나, 데몬을 동일 오리진 리버스 프록시로 프론트하세요.
- **Chrome 확장 브라우저 자동화는 프레이밍과 분리됩니다.** `qwen serve --allow-origin chrome-extension://<id>`는 확장이 Web Shell을 프레이밍하고 데몬에 연결할 수 있도록 합니다. 콘솔/네트워크/스크린샷/클릭 도구는 외부 CDP MCP 어댑터 명령어가 필요합니다: `QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`. 메인 CLI 패키지는 브라우저 자동화 어댑터를 번들하지 않습니다; 클라이언트는 해당 도구를 사용 가능으로 표시하기 전에 `caps.features.includes('browser_automation_mcp')`를 확인할 수 있습니다.
- **생성된 `qwen --acp` 자식은 소유 런타임의 유효 환경을 받습니다.** 데몬은 프로세스 env 베이스를 동결하고 해당 워크스페이스의 설정/env-파일 오버레이를 런타임 로컬 스냅샷에 적용하며 오버레이를 `process.env`에 다시 쓰지 않습니다; 다른 런타임의 동일한 이름 키는 교차되지 않습니다. `QWEN_SERVER_TOKEN`은 생성 전에 스크러빙됩니다 — 에이전트가 데몬 베어러를 필요로 하지 않기 때문입니다. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*` 및 `DASHSCOPE_API_KEY`와 같은 기본 자격 증명은 런타임 오버레이가 변경하지 않는 한 통과됩니다. **이것은 의도적이며 샌드박스가 아닙니다.** 에이전트는 동일한 UID로 실행되며 셸 도구 액세스가 있으므로 `~/.bashrc`, `~/.aws/credentials` 또는 `~/.npmrc`의 모든 것이 프롬프트 주입을 통해 도달 가능합니다. 런타임 간 환경 격리는 운영 체제 보안 경계가 아닙니다; 에이전트에게 신뢰하지 않을 자격 증명을 가진 ID로 `qwen serve`를 실행하지 마세요.
- **에이전트 텍스트 읽기는 자식 로컬이며 일반 CLI 권한 규칙을 따릅니다, 워크스페이스 파일시스템 경계가 아닙니다.** 직접 `read_file`은 등록된 모든 워크스페이스 외부의 호스트 텍스트 경로에 도달할 수 있습니다: 외부 경로는 기본적으로 확인을 요구하며, 허용 규칙이나 승인 모드가 자동으로 승인할 수 있습니다. 승인된 읽기는 워크스페이스 파일시스템의 반환 출력, 전체 스냅샷 및 대규모 텍스트 스캔 상한이 아닌 구성 가능한 CLI 출력 제한을 사용합니다. 이것은 모든 공유 텍스트 읽기 소비자에 적용되므로 쓰기, 편집, 노트북, sed 및 아티팩트 작업이 수행하는 사전 읽기는 워크스페이스 파일시스템의 읽기 감사, 심볼릭 링크 거부 및 읽기 측 TOCTOU 보호와 함께 해당 상한을 잃습니다 — 정확한 목록은 [디자인 문서](../design/daemon-local-text-reads.md)를 참조하세요. 확인 페이로드는 파일을 읽어 생성되므로 워크스페이스 외부 diff는 누군가 승인하기 전에 **모든** 연결된 SSE 구독자에게 팬아웃됩니다 — 대화형 CLI에서 해당 내용은 터미널의 사람만 봅니다. 인증된 데몬 클라이언트를 동일한 보안 주체로 취급하세요. HTTP 파일시스템 라우트는 여전히 워크스페이스 범위이며 이러한 경로를 거부하고, 에이전트 검색 도구 동작은 변경되지 않으며, 최종 ACP `writeTextFile` 내용 쓰기는 워크스페이스 파일시스템을 통해 계속됩니다.
- **로더 영향 변수는 세션 서브프로세스에 절대 전달되지 않습니다.** 로더 영향 변수(`NODE_OPTIONS`, `npm_config_node_options` 및 npm의 구성 파일 리디렉션, `NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`, 내보낸 bash 함수 정의 `BASH_FUNC_*`)는 세션 서브프로세스에 절대 전달되지 않습니다 — 데몬은 자체 `process.env`와 세션 호스팅 자식이 생성하는 동결된 기본 env에서 이를 스크러빙합니다(기본 env는 `.ts` 진입점이 여전히 tsx 로더를 필요로 하는 `DEV=true` 하네스에서만 유지), `.env` / `settings.json` `env` 소스도 이를 거부합니다([settings](./configuration/settings.md) 참조); 이것은 데몬이 호스팅하는 모든 세션에 적용됩니다.
- **내장 텍스트 도구의 승인된 최종 쓰기는 좁은 동일 호스트 경로를 가집니다.** `write_file`, `edit`, `notebook_edit` 및 셸 도구의 시뮬레이션된 sed 편집기는 기존 권한 정책이 실행을 허용한 후에만 내부 출처를 첨부합니다. 따라서 최종 ACP 텍스트 쓰기는 두 번째 확인 없이 소유 워크스페이스 외부의 절대 경로를 대상화할 수 있습니다; 허용 규칙, AUTO/AUTO_EDIT 및 YOLO는 CLI와 동일하게 동작하며, 거부, Plan, Hook/Guard 거부 및 실행 전 취소는 최종 쓰기를 전송하지 않습니다. 도구가 이미 취소 불가능한 파일시스템 작업에 진입한 후의 취소는 해당 도구의 기존 동작을 유지합니다. 워크스페이스 대상은 여전히 WFS를 사용합니다. 외부 대상은 동일한 신뢰 스냅샷을 가진 데몬 호스트 작성기를 사용하며, 5 MiB 인코딩 제한, 리프 심볼릭 링크 거부, 정규 경로 잠금, 원자적 rename, 모드 보존, `0600` 새 파일 모드, 세대 가드 및 파일시스템 감사가 적용됩니다. HTTP 쓰기, 일반 또는 마커 없는 ACP 쓰기, 주입된 브리지/워크스페이스 레지스트리/팩토리 통합 및 임의 셸 리디렉션은 이 예외를 받지 않습니다. [외부 쓰기 디자인](../design/daemon-external-tool-text-writes.md)을 참조하세요.
- **구독자별 제한된 SSE 큐** — 큐를 오버플로하는 느린 클라이언트는 `client_evicted` 터미널 프레임을 받고 닫힙니다; 하나의 멈춘 소비자가 데몬을 고정할 수 없습니다.
- **세션당 프롬프트 수용 상한** — 세션당 기본 5개의 수락되었지만 미정착 프롬프트. 버그가 있는 클라이언트는 하나의 세션에 대해 무제한 프롬프트 promise 또는 임시 SSE 대기를 큐에 넣을 수 없습니다.
- **우아한 종료** — SIGINT/SIGTERM은 리스너를 닫기 전에 에이전트 자식을 드레인합니다(자식당 10초 마감).

> ⚠️ **Stage 1 알려진 격차 — 권한은 데몬 전체이며 세션별이 아닙니다(BUy4H).** `pendingPermissions`는 데몬 범위에 있습니다; 베어러 토큰을 가진 모든 클라이언트가 볼 수 있는 세션의 `requestId`에 대해 투표할 수 있습니다(SSE `permission_request` 이벤트도 페이로드에 requestId를 운반). 이것은 모든 인증된 클라이언트가 동일한 인간 또는 신뢰하는 협업자인 단일 사용자 / 소규모 팀 신뢰 모델에서 허용됩니다. Stage 1.5는 `POST /session/:id/permission/:requestId` + 세션 범위 대기 맵 + 클라이언트별 ID로 이동합니다(하류 리뷰의 must-have #3); 그때까지는 신뢰할 수 없는 당사자와 공유되는 베어러 뒤에서 `qwen serve`를 실행하지 마세요.
>
> ⚠️ **Stage 1 알려진 격차 — `POST /session/:id/prompt` 본문 10 MB 상한(BUy4L).** 10 MB를 초과하는 이미지 / PDF / 오디오가 포함된 멀티모달 프롬프트는 라우트 로직이 실행되기 전에 바디 파싱 시점에 실패합니다(스트리밍 없음, 중간 업로드 중단 없음). 해결 방법: 클라이언트 측에서 내용을 축소하거나 경로 참조를 전달하고 에이전트가 `readTextFile`을 통해 파일을 읽도록 하세요. Stage 1.5는 `/prompt`에서 `multipart/form-data` 또는 청크 인코딩을 수락하여 큰 프롬프트가 제한에 부딪히지 않도록 합니다.
>
> ⚠️ **Stage 1 알려진 격차 — NAT 뒤의 유령 SSE 연결.**
> 데몬은 하트비트(15초 간격)의 TCP 배압을 통해 죽은
> 클라이언트를 감지합니다. TCP RST 없이 사라지는 클라이언트(예: 유휴
> 플로우를 조용히 드롭하는 NAT 박스)는 Node의 keepalive
> 프로브가 타임아웃될 때까지 커널 레벨 소켓을 "alive"로 유지합니다 —
> 일반적으로 Linux 기본값에서 ~2시간. 그러한 NAT 뒤의
> `--hostname 0.0.0.0` 배포에서 유령 SSE 연결이 축적되어
> 결국 256 `server.maxConnections` 상한에 도달할 수 있습니다.
>
> 명시적 애플리케이션 레벨 유휴 마감으로 격차를
> 닫으려면 [`--writer-idle-timeout-ms <n>`](#마감 및-writer-유휴-타임아웃)
> (이슈 [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)을
> 설정하세요: `n` ms 동안 쓰기가 성공적으로 플러시되지 않으면
> 데몬은 터미널 `client_evicted` 프레임을
> `reason: 'writer_idle_timeout'`와 함께 발생시키고 스트림을 닫습니다.
> 플래그는 기본값이 꺼져 있어 레거시 계약을 보존합니다 — RST를
> 삼키는 네트워크의 운영자는 15초 하트비트 간격보다 훨씬 큰 값을
> 선택해야 합니다(예: `60000`–`300000`). 이렇게 하면 합법적인 유휴
> 연결이 축출되지 않으면서 정말로 멈춘 writer가 신속하게
> 수거됩니다. SDK에서 `caps.features.includes('writer_idle_timeout')`를
> 사전 점검하여 데몬이 이를 지원하는지 확인하세요.

### 마감 및 writer 유휴 타임아웃

이슈 [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9는 15초 하트비트 + AbortSignal이 커버하지 않는 장기 실행 / 원격 배포 격차를 닫는 두 개의 옵트인 플래지를 제공합니다. 둘 다 기본값이 꺼져 있습니다 — 단일 사용자 루프백 워크플로는 비트 단위로 변경되지 않습니다.

| 플래그                         | 환경 변수                            | 기본값 | 수행 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | unset   | 단일 `POST /session/:id/prompt`에 대한 서버 측 벽시계 상한. 만료 시 데몬은 프롬프트의 AbortController를 중단하고 HTTP `504`를 `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`과 함께 반환합니다. 프롬프트별 요청 본문 필드 `deadlineMs`는 유효 마감 시간을 플래그 아래로 단축할 수 있지만 확장할 수는 없습니다. 기능 태그(조건부): `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | unset   | SSE 연결별 유휴 마감. `n` ms 동안 쓰기가 성공적으로 플러시되지 않으면 — 실제 이벤트도 15초 하트비트도 — 데몬은 `data.reason = 'writer_idle_timeout'`(`data.errorKind`에 미러링)을 가진 터미널 `client_evicted` 프레임을 발생시키고 스트림을 닫습니다. **15초 하트비트보다 충분히 큰 값을 선택하세요**(예: `30000`–`300000`). 합법적인 유휴 스트림이 축출되지 않도록 합니다; `< 15000` 값은 첫 하트비트가 발생하기 전에 정상적인 유휴 연결을 축출합니다(테스트 / 단기 개발 세션에만 의도). 기능 태그(조건부): `writer_idle_timeout`. |

두 플래그 모두 밀리초 단위의 양의 정수를 허용합니다; `0`, `NaN`, 비정수 또는 음수 값은 부팅 시 명확한 오류 메시지와 함께 거부됩니다. CLI 플래그가 환경 변수보다 우선합니다; 명시적 `ServeOptions` 필드(임베디드 호출자)가 환경 변수보다 우선합니다. SDK 소비자는 두 동작 중 하나에 의존하기 전에 일치하는 기능 태그를 사전 점검해야 합니다 — 이 PR 이전의 데몬은 두 태그를 생략하며 요청 `deadlineMs` 필드는 조용히 삭제됩니다.

## 다중 세션 및 다중 워크스페이스 배포

`--workspace`를 여러 번 전달하여 하나의 `qwen serve` 프로세스에서 여러 겹치지 않는 워크스페이스를 등록하세요. 첫 번째 경로가 기본입니다. 각 등록된 워크스페이스는 격리된 런타임 경계를 소유하며, 데몬 전체 리스너, 인증 정책 및 총 세션 제한은 공유됩니다. 프로덕션은 호환성을 위해 기본 ACP 자식을 예열하고 실패 시 첫 사용 시 재시도합니다; 신뢰할 수 있는 보조는 온디맨드로 자체 자식을 시작하며 신뢰할 수 없는 보조는 ACP를 시작하지 않습니다. 요청은 표준화된 `cwd`로 등록된 워크스페이스를 선택할 수 있습니다; `cwd`를 생략하면 기본 워크스페이스를 사용합니다. 사용자 또는 보안 주체당 하나의 데몬을 사용하세요; 워크스페이스 신뢰는 실행 게이지이며 ACL이 아닙니다.

신뢰할 수 없는 보조 워크스페이스는 Web Shell에서 `untrusted` 및 `read-only`로 표시됩니다. 영속 세션 카탈로그를 검사하기 위해 확장할 수 있지만, 아직 선택하거나 열기, 재개, 세션 생성 또는 완전한 내보내기를 할 수 없습니다. REST API는 기존 제한된 파일시스템 읽기 정책을 따르며 영속 세션 그룹 카탈로그와 `workspace_persisted_transcript`가 광고될 때 제한된 워크스페이스 한정 페이저를 통한 활성 영속 트랜스크립트도 노출합니다. 이 읽기에는 라이브 런타임 상태가 포함되지 않으며 ACP 자식을 시작하지 않습니다. 완전한 워크스페이스 한정 내보내기는 신뢰할 수 있는 워크스페이스와 별도의 `workspace_session_export` 기능이 필요합니다. 실행, 뮤테이션 또는 내보내기 기능을 사용하기 전에 워크스페이스를 신뢰하고 데몬을 재시작하세요. 신뢰할 수 없는 기본은 Web Shell에서 비활성 상태로 유지됩니다.

더 작은 장애 또는 보안 경계, 독립 베어러 토큰, 할당량, 감사 경계, 운영 체제 격리 또는 독립 리소스 감독이 필요할 때 별도 데몬 프로세스를 사용하세요. 다중 워크스페이스 모드는 한 운영자가 여러 저장소를 호스팅하기 위한 것이며 다중 테넌트 격리 경계가 아닙니다. 단일 데몬 토큰은 등록된 모든 워크스페이스에 대한 허용된 읽기 전용 카탈로그를 포함한 데몬이 노출하는 모든 라우트를 인증합니다.

> **`modelServiceId`를 연결에서 전송하기 전에 구독하세요.** 클라이언트가 `modelServiceId`와 함께 `POST /session`을 하고 워크스페이스에 이미 다른 모델을 실행하는 세션이 있으면, 데몬은 내부 `setSessionModel` 호출을 발생합니다 — 실패는 HTTP 오류로 전파되지 않습니다(세션은 현재 모델에서 계속 작동). 보이는 실패 신호는 세션의 SSE 스트림에서 `model_switch_failed` 이벤트입니다. `POST /session`을 호출한 후 `GET /session/:id/events`를 열면 실패 이벤트를 놓치고 조용히 잘못된 모델과 계속 대화합니다. 먼저 SSE 스트림을 열거나 구독 시 `Last-Event-ID: 0`을 전달하여 링의 가장 오래된 사용 가능 이벤트를 재생하세요.

독립 토큰, 할당량, 감사 로그, 샌드박스 또는 프로세스 장애 경계를 가진 여러 **사용자 또는 보안 주체**를 처리하거나 하나의 프로세스 범위(콜드 시작 예산, FD 수, RSS)를 넘어 확장하려면, 외부 오케스트레이터 뒤에 주체당 하나의 데몬을 생성하세요. 각 데몬은 해당 주체를 위해 여러 워크스페이스를 여전히 호스팅할 수 있습니다. 오케스트레이터(다중 테넌시 / OIDC / 할당량 / 감사 / k8s)는 qwen-code 프로젝트의 **범위 외**입니다 — 디자인 포인터는 이슈 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture"를 참조하세요.

## 영속 세션 로드 및 재개

데몬은 ACP의 `session/load` 및 재개 플로우를 HTTP로 노출하며, 별도의 읽기 전용 트랜스크립트 페이저도 제공합니다:

| 라우트                                                  | 사용 시점                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`                                | 클라이언트에 렌더링된 유용한 로컬 기록이 **없는** 경우(콜드 재연결, 선택기-then-열기). 라이브 세션의 경우 데몬은 현재 제한된 재생 스냅샷 창을 반환하고 주입합니다; 오래된 재생이 삭제되면 스냅샷은 `history_truncated`로 시작됩니다. 기능 태그: `session_load`. |
| `POST /session/:id/resume`                              | 클라이언트가 이미 화면에 턴을 가지고 있으며 데몬 측 핸들만 다시 필요로 하는 경우. 모델 컨텍스트는 UI 재생 없이 에이전트 측에서 복원됩니다 — SSE 스트림이 깨끗하게 유지됩니다. 기능 태그: `session_resume`(`unstable_session_resume`는 오래된 클라이언트를 위한 권장되지 않는 별칭으로 유지).     |
| `GET /session/:id/transcript`                           | 클라이언트가 완전한 활성 영속 트랜스크립트가 필요한 경우. 커서 페이지에서 ID 없는 재생 프레임을 반환하며 `/load`를 호출하거나 클라이언트를 연결하거나 라이브 EventBus를 시딩하거나 라이브 세션을 생성하거나 라이브 재생 창을 변경하지 않습니다. 기능 태그: `session_transcript`.                    |
| `GET /workspaces/:workspace/session/:id/transcript`     | 클라이언트가 ACP를 시작하거나 워크스페이스 설정을 로드하지 않고 선택된 워크스페이스의 활성 영속 트랜스크립트가 필요한 경우. 등록된 신뢰할 수 없는 보조 워크스페이스는 이 읽기 전용 경로를 사용할 수 있습니다. 기능 태그: `workspace_persisted_transcript`.                                            |
| `GET /workspaces/:workspace/session/:id/export`         | 클라이언트가 선택된 신뢰 워크스페이스에서 완전한 `html`, `md`, `json` 또는 `jsonl` 첨부가 필요한 경우. ACP를 시작하거나 기본으로 폴백하지 않고 활성 영속 저장소를 읽습니다. 기능 태그: `workspace_session_export`.                                                         |
| `GET /workspaces/:workspace/session/:id/archive/export` | 클라이언트가 선택된 신뢰 워크스페이스의 아카이브된 영속 저장소에서 동일한 첨부 형식이 필요한 경우. 아카이브 해제, ACP 시작 또는 활성 또는 기본 세션으로 폴백하지 않습니다. 기능 태그: `workspace_archived_session_export`.                                                |

로드 및 재개를 위해 TypeScript SDK는 `DaemonSessionClient`에 정적 팩토리를 노출합니다:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// 콜드 재연결 — 데몬은 제한된 스냅샷 창을 SSE를 통해 재생합니다.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// 또는 UI에 이미 기록이 있으면 재생을 건너뜁니다:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // 먼저 재생된 `session_update` 프레임(로드만),
  // 그 다음 라이브 이벤트.
}
```

일치하는 라우트를 호출하기 전에 `caps.features.session_load`, `caps.features.session_resume` 또는 `caps.features.session_transcript`를 사전 점검하세요 — 오래된 데몬은 `404`를 반환합니다. `unstable_session_resume`는 여전히 권장되지 않는 호환성 별칭으로 광고됩니다. 동일한 id에 대한 동시 동일 동작 요청은 병합됩니다; 크로스 동작 경주(`load`가 `resume`과 경주) 및 호출자 제공 id 생성이 복원과 경주하면 `Retry-After: 5`와 함께 `409 restore_in_progress`를 받습니다. `limits.sessionRestoreTimeoutMs`를 초과하는 복원은 예산에서 파생된 `Retry-After`(5-120초로 고정)와 함께 재시도 가능한 `504 session_restore_timeout`를 반환합니다; 아직 실행 중인 자식 요청은 정리가 완료될 때까지 차단되며, 해당 창 동안 동일한 id의 재시도는 고정 5초 지연 대신 5-120초로 고정된 예산 파생 `Retry-After`와 함께 `reason: awaiting_abandoned_cleanup`로 `409 restore_in_progress`를 받습니다. 정리가 불확실하거나 포기된 복원이 마감 시한 후에도 전체 복원 예산을 아직 정리하지 못한 경우, 새 세션 작업은 이미 라이브 세션이 사용 가능한 상태에서 `reason: restore_cleanup_failed` 또는 `restore_settlement_overdue`와 함께 `503 acp_channel_unavailable`을 일시적으로 받습니다. 전체 오류 인벨롭은 [프로토콜 참조](../developers/qwen-serve-protocol.md)를 참조하세요.

전체 영속 재생의 경우 `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` 또는 원시 REST 라우트로 페이지를 나누세요:

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

등록된 워크스페이스의 경우 `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` 또는 `/workspaces/:workspace/session/:id/transcript`를 사용하세요. 워크스페이스 한정 메서드는 SDK 클라이언트에 교체 가능한 ACP 전송이 있더라도 항상 네이티브 REST를 사용합니다. 커서는 데몬 수명 전용이며 데몬 재시작 후 1페이지부터 재시작해야 합니다.

신뢰할 수 있는 등록된 워크스페이스의 전체 첨부의 경우 `workspace_session_export`를 사전 점검하고 `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` 또는 원시 `/workspaces/:workspace/session/:id/export` 라우트를 호출하세요. `session_export` 또는 `workspace_qualified_rest_core`에서 지원을 추론하지 마세요; 오래된 데몬은 둘 다 광고하면서 기본 전용 내보내기를 유지할 수 있습니다. 현재 Web Shell 내보내기 작업은 기본 전용으로 유지됩니다; 다른 워크스페이스의 경우 SDK 또는 REST 라우트를 사용하세요.

아카이브 첨부의 경우 `workspace_archived_session_export`를 사전 점검하고 `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` 또는 `/workspaces/:workspace/session/:id/archive/export`를 호출하세요. 이 경로는 제자리에서 아카이브 저장소를 읽으며 활성 전용 id에 대해 `409 session_not_archived`를 반환합니다; 세션을 아카이브 해제하지 않습니다. Web Shell은 기능이 존재할 때 신뢰할 수 있는 기본 및 보조 워크스페이스의 아카이브 행에 대해 동일한 내보내기를 노출합니다.

`limit`은 활성 채팅 기록 수를 세며 발생된 재생 프레임 수를 세지 않습니다; 하나의 기록이 여러 `session_update` 이벤트를 생성할 수 있습니다. 첫 번째 응답은 JSONL 스냅샷 크기를 고정하고 `hasMore`가 true인 동안 `nextCursor`를 반환합니다. 이후 페이지는 페이지 1 이후의 추가를 무시하지만 파일이 삭제, 잘림, 교체, 아카이브되거나 동결된 커서와 충돌하면 `409`를 반환합니다. 매우 큰 스냅샷은 인덱싱 전에 `413 transcript_too_large`를 반환하여 데몬이 요청 경로에서 무제한 트랜스크립트 파일을 스캔하지 않습니다.

레거시 단수 라우트를 통한 반복 페이징의 경우 `--channel-idle-timeout-ms`를 양의 값으로 설정하세요. 기본값 `0`에서는 유휴 워크스페이스의 ACP 자식 — 그리고 그가 보유한 프로세스 내 트랜스크립트 인덱스 캐시 — 가 매 페이지 후에 수거되므로 각 페이지가 자식을 재생성하고 동결된 접두사 전체를 재스캔하여 인덱스를 재구축합니다(페이지당 `O(snapshotSize)`). 양의 타임아웃은 커서 워크 전체에서 자식을 활성 상태로 유지하므로 캐시된 트랜스크립트 인덱스와 재생 구성을 재사용합니다. 워크스페이스 한정 영속 라우트는 ACP 자식을 시작하지 않으며 이 타임아웃의 영향을 받지 않습니다.

참고: 라이브 세션 기록 재생은 두 번 제한됩니다: `Last-Event-ID` 재연결을 위한 SSE 링과 `POST /session/:id/load`가 반환하는 스냅샷을 위한 `--compacted-replay-max-bytes`. 많은 턴이 있는 긴 기록은 어느 한도를 초과할 수 있습니다. 데몬은 `history_truncated`로 스냅샷 잘림을 표시합니다; 완전한 활성 영속 기록이 필요할 때 `/transcript`를 사용하세요.

## 내구성 모델

**세션은 Stage 1에서 데몬 재시작 사이에 여전히 일시적**이지만, 디스크의 영속 세션은 다시 로드할 수 있습니다:

- 자식 프로세스 충돌은 `session_died`를 게시하고 데몬의 맵에서 라이브 세션을 제거합니다. 디스크에 영속된 세션은 새 에이전트 자식을 생성할 수 있으면 `POST /session/:id/load`를 통해 **다시 로드할 수 있습니다**.
- 데몬 재시작은 모든 비행 중 라이브 세션을 잃습니다. 영속 세션은 디스크에 남아 있으며 동일한 워크스페이스 바인딩 규칙에 따라 새 데몬 프로세스에 대해 로드될 수 있습니다.
- 긴 클라이언트 연결 끊김(많은 턴에서 >5분)은 SSE 재생 링(기본 8000 프레임)을 벗어날 수 있습니다 — `Last-Event-ID` 재연결은 `state_resync_required`를 트리거합니다. 모바일 / 불안정한 네트워크 클라이언트의 경우 긴 드롭에서 SSE를 다시 열거나 `POST /session/:id/load`를 호출하여 현재 제한된 재생 스냅샷을 복구하세요; 해당 라우트가 전체 트랜스크립트를 반환한다고 가정하지 마세요.
- 파일 작업(`writeTextFile`)은 충돌에서 원자적입니다(쓰기-then-이름 변경); 데몬 재시작에서 재연속의 의미는 아닙니다 — 파일 쓰기가 적용되었거나 아니거나입니다.

통합에 `session/load`가 커버하는 것 이상의 서버 측 크로스 재시작 내구성(예: 서버 관리 재시도 큐)이 필요하면 여전히 애플리케이션 레벨 상태 복구가 필요합니다. 데몬의 세션 내에 장기 실행 재시작 민감 상태를 보관하지 마세요.

## Stage 1.5+ 런타임 보장

Stage 1의 계약은 프로토타이핑에 맞춰져 있습니다. [#3889 chiga0 하류 소비자 리뷰](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644)에 따라 다음 사항이 Stage 1에 **없습니다** — 프로덕션급 통합은 이에 의존하기 전에 Stage 1.5+가 필요합니다:

**심각한 하류 사용을 위한 차단제:**

1. **`loadSession` / `unstable_resumeSession` over HTTP** — 이것이 없으면 어떤 통합도 자식 충돌이나 데몬 재시작에서 생존할 수 없으며, 데몬을 조정하는 오케스트레이터도 상태를 복구할 수 없습니다.
2. **영속 클라이언트 ID(페어 토큰 + 클라이언트별 폐기)** — Stage 1은 하나의 공유 베어러를 사용합니다; 유출된 토큰은 모든 사람을 폐기하며 `originatorClientId`는 인증된 ID에서 데몬이 스탬프하는 것이 아닌 클라이언트 자체 선언입니다.

**신뢰성 기본:**

3. ~~**클라이언트 시작 하트비트 경로**~~ — [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9를 통해 제공. `POST /session/:id/heartbeat`는 데몬에 마지막 목격 타임스탬프를 기록합니다(기능 태그 `client_heartbeat`); SDK 헬퍼는 `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. 투표에서 첫 응답자 경주에서 패배할 때 **`permission_already_resolved` 이벤트** — 현재 UI는 `404`에서 상태를 추론해야 합니다.
5. ~~**더 큰 재생 링**~~ — 8000으로 증가. **세션별 구성 가능한 링** 여전히 개방 — 모바일 / 많은 턴 워크로드는 세션별 재정의가 필요할 수 있습니다.
6. `client_evicted` 전 **`slow_client_warning` 이벤트** — 소프트 배압으로 예의 바른 느린 클라이언트가 종료되기 전에 자체 조절(렌더 깊이 축소, 청크 삭제)할 수 있습니다.

**통합 인체 공학:**

7. **IM 스타일 컨텍스트를 위한 `POST /session/:id/_meta`** — 후속 프롬프트에 첨부되는 세션별 키-값(채팅 id, 발신자, 스레드 id)로 채널별 즉흥을 대체합니다.
8. **`/capabilities` 실제 기능 협상** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`로 클라이언트가 "알 수 없는 프레임, 무시"로 폴백하는 대신 드리프트를 감지할 수 있습니다.
9. **일급 내구성 문서**(이 섹션) — 이미 위에서 제공.

전체 수렴 로드맵은 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)에서 추적됩니다.

## Stage 1 범위 경계 — Stage 1.5에서 수정하지 않을 사항

두 가지 구조적 선택이 Stage 1 / 1.5 / 2의 명시적 비목표입니다.

### 세션 상태는 로컬 변형 전용([LaZzyMan 리뷰 #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721) 기준)

Stage 1.5 계획은 TUI를 프로세스 내 EventBus 구독자로 설명합니다. 실제로 **TUI UI는 와이어 프로토콜보다 엄격히 더 큽니다**:

- **로컬 전용 UI** — ~15개의 Ink 대화 상자 컴포넌트(`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) 및 `local-jsx` 슬래시 명령어(`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …)는 터미널별 Ink JSX를 렌더링합니다. HTTP/SSE의 원격 클라이언트는 Ink를 동일하게 렌더링할 수 없으며 이러한 플로우는 와이어 이벤트를 발생시키지 않습니다.
- **와이어 이벤트 없는 세션 상태 변형** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init`(`CLAUDE.md` 쓰기)은 모두 에이전트 동작을 변경하지만 현재 `/model`만 이벤트를 게시합니다(`model_switched`).

**Stage 1 선택 — 리뷰의 옵션 (A)**: 이러한 변형을 와이어 이벤트로 승격하지 않습니다. 두 배포 모드는 다른 결과를 가집니다.

#### 모드 1 — 헤드리스 `qwen serve`(이 PR)

데몬 내부에서 TUI 셸이 실행되지 않습니다. 나열된 슬래시 명령어는 이 모드에서 **존재하지 않습니다** — 발행할 터미널 UI가 없습니다. 따라서 세션 상태:

- **부트 시 고정** `approval-mode` / `memory` / `agents` / `tools` 허용 목록 / `auth` — 데몬의 `qwen --acp` 자식이 시작될 때 설정 + 디스크에서 모두 로드; 세션 수명 동안 불변. 설정 정의 MCP 서버도 부트 시 고정되지만 **런타임에 추가된 서버**(`POST /workspace/mcp/servers` 경유)는 재시작 없이 추가 또는 제거할 수 있습니다.
- **HTTP를 통해 변경 가능** `POST /session/:id/model`(`model_switched` 게시), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name`(`mcp_server_added` / `mcp_server_removed` 게시) 및 권한 투표(`POST /permission/:requestId`)를 통해.

**결과:** 헤드리스 모드의 원격 클라이언트는 **전체 세션 상태**를 봅니다. TUI가 추가 상태를 숨기지 않으며; 드리프트가 불가능합니다. `approval-mode`를 변경하려면 새 설정으로 데몬을 재시작하세요. MCP 서버는 이제 뮤테이션 라우트를 통해 런타임에 추가/제거할 수 있습니다(`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — [런타임 MCP 서버 관리](#런타임-mcp-서버-관리이슈-4514) 참조.

#### 모드 2 — Stage 1.5 `qwen --serve` 공동 호스트 TUI(이 PR에 없음)

Stage 1.5에서 `qwen --serve`(TUI 프로세스가 동일한 HTTP 서버를 공동 호스트)가 도착하면 TUI는 원격 클라이언트와 함께 **존재합니다**. `/approval-mode yolo` 또는 `/mcp add-server`를 입력하는 로컬 운영자가 세션 상태를 변형하면 HTTP의 원격 클라이언트는 변경을 관찰할 이벤트가 없습니다.

이 모드에서 TUI는 **"슈퍼 클라이언트"**입니다 — 원격 클라이언트가 보는 동일한 에이전트 대화를 관찰하며 AND 원격 클라이언트가 변경할 수 없는 세션 상태를 변형할 수 있습니다. 비대칭성:

- ✅ TUI와 원격 클라이언트 모두 동일한 에이전트 메시지, 도구 호출, 파일 diff, 권한 프롬프트를 봅니다.
- ❌ TUI만 approval-mode / memory / MCP 서버 목록 / agents / tools 허용 목록 / auth 상태를 보고/변경합니다.

**모드 2의 결과:** 원격 클라이언트 UI가 세션 설정을 미러링하려고 하면 TUI 슬래시 명령어 후에 드리프트될 수 있습니다. 원격 클라이언트는 **연결 / 재연결 시 상태를 재 가져오기**해야 합니다(`Last-Event-ID: 0`을 전달하여 링의 가장 오래된 이벤트를 `model_switched`와 같은 것에 대해 재생). TUI 측 변형에 대해 증분 이벤트에 의존하면 안 됩니다.

#### 왜 (A)인가 (B)가 아닌지(변형을 `session_state_changed` 이벤트 패밀리로 승격)

(B)는 더 야심 찬 답변이지만 계획된 프로세스 내 리팩터링을 깨끗하게 통과해야 하는 훨씬 더 큰 와이어 표면으로 Stage 1.5를 고정합니다. 더 작은 범위를 정직하게 걷는 것이 낫습니다. 세션 상태 이벤트 분류 작업 — 어떤 TUI 플로우가 설계상 로컬 전용인지 vs. 향후 옵트인 (B)-스타일 확장으로 와이어로 졸업할 수 있는지를 열거 — 는 Stage 1.5 코드가 아닌 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)으로 이동합니다.

### N개의 병렬 세션이 워크스페이스 런타임당 하나의 `qwen --acp` 자식을 공유

동일한 신뢰 워크스페이스의 여러 세션은 에이전트의 네이티브 다중 세션 지원을 통해 **해당 런타임의 `qwen --acp` 자식 프로세스를 공유**합니다(`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). 브리지는 각 세션에 대해 `connection.newSession({cwd, mcpServers})`를 호출합니다 — 에이전트는 이를 sessions 맵에 저장하고 호출별 sessionId를 디멀티플렉스합니다. 프로덕션은 기본 자식 하나(기본적으로 예열 시도) plus 신뢰할 수 있는 보조당 온디맨드 자식 하나를 소유할 수 있습니다; 신뢰할 수 없는 보조는 소유하지 않습니다.

동일한 워크스페이스에서 N=5 세션의 구체적 비용:

| 리소스                               | 세션당                                                | N=5에서                                                          |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------- |
| 데몬 Node 프로세스                   | 하나                                                  | **30–50 MB**(데몬 하나)                                          |
| `qwen --acp` 자식                    | 공유                                                  | **60–100 MB**(자식 하나)                                         |
| MCP 서버 자식                        | 광고 시 워크스페이스 풀; 그렇지 않으면 세션별        | 일치하는 풀 항목으로 공유, 또는 레거시 폴백에서 최대 3×N         |
| `FileReadCache`(자식 내 힙)          | 공유                                                  | 한 번 파싱                                                       |
| `CLAUDE.md` / 계층 메모리 파싱       | 공유                                                  | 한 번 파싱                                                       |
| OAuth 리프레시 토큰 상태             | 공유                                                  | **하나의 리프레시 경로**                                         |
| 자동 메모리 학습된 사실              | 공유                                                  | 자식당 하나의 지식 베이스                                        |
| 콜드 시작                           | 첫 번째만                                             | 첫 세션 후 <200 ms                                               |

각 활성 워크스페이스 런타임은 **하나의 브리지 경계**를 유지합니다. 프로덕션은 기본 채널을 예열하고 실패 시 첫 사용 시 재시도합니다; 신뢰할 수 있는 보조는 온디맨드로 채널과 자식을 열며 신뢰할 수 없는 보조는 열지 않습니다. 채널은 최소 하나의 세션이 라이브인 동안 활성 상태를 유지합니다. 마지막 `killSession` 후 런타임은 기본적으로 즉시 또는 구성된 채널 유휴 유예 후에 자식을 종료합니다; 채널 레벨 충돌도 다른 런타임을 선택하지 않고 이를 해체합니다.

**MCP 서버 자식**은 `mcp_workspace_pool`이 광고될 때 워크스페이스 범위 전송 풀을 사용합니다: 일치하는 `(워크스페이스 런타임, 서버 이름, 구성 지문)` 항목이 세션 간에 refcount됩니다. 기능이 없으면 레거시 세션별 관리자가 독립적으로 생성합니다.

**동료 에이전트(Cursor / Continue / Claude Code / OpenCode / Gemini CLI)는 모두 단일 프로세스 다중 세션입니다.** qwen-code는 에이전트 레이어에서 이들에 맞춥니다; 이 PR의 Stage 1 브리지는 동일한 아키텍처를 HTTP를 통해 볼 수 있게 만듭니다.

## 원격 데몬 로그인(이슈 #4175 PR 21)

데몬이 원격 파드에서 실행될 때(공유 디스플레이 없음), 클라이언트는
HTTP를 통해 OAuth 디바이스 플로우를 트리거할 수 있습니다. 데몬 자체가
IdP를 폴링합니다; 사용자의 작업은 브라우저가 있는 어떤 디바이스에서
URL을 여는 것뿐입니다.

> [!note]
>
> Qwen OAuth 무료 티어는 2026-04-15에 중단되었습니다. 아래
> `qwen-oauth` 예제는 디바이스 플로우 프로토콜 형태와 레거시
> 제공자 식별자를 문서화합니다; 새 설정은 현재 지원되는 인증
> 제공자를 사용해야 합니다.

```bash
# 1. 플로우 시작. 데몬이 IdP에 연락하여 코드 + URL을 반환합니다.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. 휴대폰 / 노트북에서 URL을 방문하고 사용자 코드를 입력합니다.
# 3. 완료를 폴링(또는 auth_device_flow_authorized 이벤트에 대한 SSE 구독):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
```

TypeScript SDK는 두 단계를 하나의 헬퍼로 래핑합니다:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**데몬은 사용자를 대신하여 브라우저를 열지 않습니다.** 로컬에서 실행될 때도 데몬은 수동으로 유지됩니다 — URL을 반환하고 SDK / 사용자가 어디에서 열지 선택하도록 합니다. 이것은 의도적입니다: `xdg-open`을 호출하는 헤드리스 파드의 데몬은 조용히 실패하여 실제 인증 표면을 마스킹합니다. 클라이언트에서 `gh auth login`의 "Press Enter to open browser" UX를 미러링하세요.

**`--require-auth`와 개발 편의.** 디바이스 플로우 라우트는 엄격 뮤테이션 게이트(PR 15)를 사용하므로 토큰 없는 루프백 기본값은 `401 token_required`를 반환합니다. 로컬에서 개발 중 이를 우회하는 가장 간단한 방법은 `qwen serve --token=dev-token`입니다; 루프백 기본값을 강화하지 않는 한 `--require-auth`가 필요하지 않습니다.

**크로스 데몬 제한.** `oauth_creds.json`은 데몬 간 공유됩니다(`~/.qwen/oauth_creds.json`). 데몬 A에서의 성공적인 로그인은 데몬 B의 다음 토큰 새로 고침에서 자동으로 가져와집니다 — 하지만 데몬 B의 SDK 클라이언트는 `auth_device_flow_authorized` 이벤트를 받지 못합니다(이벤트는 데몬별).

**크로스 클라이언트 인계.** 동일한 데몬의 두 SDK 클라이언트가 동일한 제공자에 대해 `POST /workspace/auth/device-flow`를 호출하면 제공자별 싱글톤을 얻습니다: 첫 호출은 새 IdP 요청을 시작하고 `attached: false`를 반환합니다; 두 번째 호출은 기존 비행 중 항목을 `attached: true`와 함께 반환합니다. 인계는 감사 추적에 기록되지만(두 번째 클라이언트의 `X-Qwen-Client-Id` 아래) 별도의 이벤트를 발생시키지 않습니다 — 두 클라이언트는 사용자가 IdP 페이지를 완료하면 동일한 `auth_device_flow_authorized`를 관찰합니다. UI가 "내가 시작한 것"과 "다른 사람의 플로우에 합류한 것"을 구별하려면 `start()`가 반환한 `attached` 필드를 분기하세요.

## 데몬 로그 파일

`qwen serve`는 안정적인 활성 경로에서 정상 재시작에 걸쳐 진단 기록을 추가합니다:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

모든 파일 기록에는 시작별 무작위 `runId`와 데몬 PID가 포함됩니다. 성공적인 안정 소유자는 또한 심볼릭 링크를 지원하는 플랫폼에서 `debug/daemon/latest`를 `daemon.log`로 업데이트합니다. macOS/Linux에서 로테이션을 팔로우하려면:

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

다른 플랫폼에서는 교체 후 경로명을 다시 열도록 뷰어를 구성하세요. 이전 파일 핸들만 유지하는 뷰어는 로테이션 후 아카이브에 남아 있습니다.

로그는 수명주기 메시지, 라우트 오류(`route=` 및 `sessionId=` 컨텍스트 포함), ACP 자식 stderr 및 `QWEN_SERVE_DEBUG=1`이 설정되면 추가 브레드크럼을 캡처합니다. 오늘 stderr로 가는 라인은 여전히 stderr로 갑니다; 파일 로그는 **추가적**이며 대체가 아닙니다.

활성 파일은 10 MiB를 초과하기 전에 로테이션됩니다. 각 패밀리는 `archive/` 아래에 4개의 아카이브를 유지하며 각 파일 기록은 256 KiB로 제한됩니다. 인메모리 큐는 최대 4 MiB의 미정착 파일 페이로드를 허용합니다. 큐 압력, 로테이션 실패 또는 파일시스템 실패는 파일 복사본을 삭제할 수 있습니다; `GET /daemon/status?detail=full`은 로거 상태, 이슈 및 삭제된 기록/바이트 카운터를 노출합니다.

로그 네임스페이스에서 안정적인 패밀리를 소유할 수 있는 데몬은 하나뿐입니다. 동시 데몬은 `debug/daemon/runs/run-<runId>/daemon.log`에 씁니다; 시작 배너 및 전체 상태에 권한 경로가 포함됩니다. `runs/recent-fallback`은 최근 폴백 패밀리의 최선 노력 로케이터이며 아직 활성일 수 있는 것을 가리킬 수 있습니다. 건강한 네임스페이스는 약 100 MiB로 수렴합니다: 안정 약 50 MiB plus 하나의 비활성 폴백 패밀리. 활성 또는 아직 오래되지 않은 폴백 패밀리가 유지되므로 동시 데몬이나 충돌/재시작 폭풍은 일시적으로 더 많이 사용할 수 있습니다.

하나의 런타임 디렉토리는 하나의 소유권 및 보존 네임스페이스입니다. 데몬이 독립 역사가 필요할 때 구분되는 `QWEN_RUNTIME_DIR` 값을 사용하세요. 새 데몬 로그 디렉토리는 사용자에게 비공개(`0700`)이며 새 파일은 POSIX에서 `0600`을 사용합니다. 연령 기반 만료가 없습니다.

### 비활성화

파일 로깅을 완전히 건너뛰려면 `QWEN_DAEMON_LOG_FILE=0`(또는 `false`/`off`/`no`)을 설정하세요. stderr 출력은 영향을 받지 않습니다.

### 세션 디버그 로그와의 관계

세션 범위 디버그 로그(`~/.qwen/debug/<sessionId>.txt` 및 `~/.qwen/debug/latest` 심볼릭 링크)는 독립적입니다. 데몬 로그는 형제 `daemon/` 하위 디렉토리에 있습니다; 세션별 디버그 의미는 이 기능으로 변경되지 않습니다.

### 외부 로테이션

활성 `daemon.log`에 외부 logrotate 규칙을 지정하지 마세요. 데몬은 유일하게 지원되는 작성자 및 로테이터입니다; 외부 이름 변경, 삭제 또는 잘림은 크기 모델을 무효화합니다. 패밀리를 변경하지 않고 기록을 복사하거나 전송하는 것은 안전합니다. 오래된 `serve-<pid>.log` 및 `serve-<pid>-<workspaceHash>.log` 파일은 변경되지 않은 상태로 유지되며 새 보존 정책에 의해 카운트되지 않습니다.

## 런타임 MCP 서버 관리(이슈 [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

데몬을 재시작하지 않고 런타임에 MCP 서버를 추가하거나 제거합니다. 런타임 항목은 동일한 이름의 설정 정의 서버를 **그림자화**하는 일시적 오버레이에 있습니다; 기본 `settings.json` / `mcpServers` 구성은 절대 작성되지 않습니다.

**사전 점검:** 두 라우트를 호출하기 전에 `caps.features`에서 `mcp_server_runtime_mutation`을 확인하세요. 이 태그가 없는 오래된 데몬은 `404`를 반환합니다.

### `POST /workspace/mcp/servers` — 런타임 MCP 서버 추가

엄격 게이트(베어러 토큰 필요). 라이브 `McpClientManager`를 통해 서버를 즉시 연결하고 도구를 검색합니다.

요청:

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name`은 영숫자 plus `_`와 `-`(최대 256자)여야 합니다. `config`는 `settings.json` `mcpServers` 항목에 사용되는 동일한 MCP 서버 구성 객체입니다(전송 의존 필드: stdio의 경우 `command`/`args`, SSE/HTTP의 경우 `url`). 보안 민감 필드(`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`)는 데몬에 의해 제거되고 무시됩니다.

응답 (200) — 성공:

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — 동일한 이름의 런타임 항목이 이미 존재하며 구성 지문이 다릅니다; 이전 연결이 해제되고 새 연결이 설정됩니다. 지문이 일치하면(멱등 재추가) `replaced`는 `false`입니다.
- `shadowedSettings: true` — 동일한 이름의 설정 정의 서버가 존재합니다; 런타임 항목이 이제 이를 그림자화합니다. 설정 항목은 변경되지 않으며 런타임 항목이 나중에 제거되면 다시 나타납니다.
- `toolCount` — 새로 연결된 서버에서 검색된 도구 수.

응답 (200) — 소프트 거부(예산 경고 모드):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

`--mcp-budget-mode=warn`이고 서버를 추가하면 구성된 `--mcp-client-budget`을 초과할 때 반환됩니다. 서버는 연결되지 않습니다. 호출자는 사용자에게 예산 압력을 알려야 합니다.

오류:

| 상태   | 코드                      | 발생 시점                                                                                         |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 이름이 비어 있거나 256자를 초과하거나 `[A-Za-z0-9_-]` 밖의 문자 포함                             |
| `400`  | `missing_required_field`  | `config`가 누락되었거나 null이 아닌 객체가 아님                                                   |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` 헤더가 있지만 이 워크스페이스에 등록되지 않음                                 |
| `400`  | `invalid_config`          | MCP 전송 유효성 검사기가 구성 형태를 거부                                                        |
| `401`  | `token_required`          | 베어러 토큰이 구성되지 않음(엄격 게이트)                                                         |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce`이고 예산이 가득 참                                                    |
| `502`  | `mcp_server_spawn_failed` | 서버 프로세스가 연결 중에 종료되거나 타임아웃; 본문에 `serverName`, `exitCode`, `stderr` 포함     |
| `503`  | `acp_channel_unavailable` | 라이브 ACP 자식 없음(아직 세션이 생성되지 않음)                                                   |

### `DELETE /workspace/mcp/servers/:name` — 런타임 MCP 서버 제거

엄격 게이트. 서버를 연결 해제하고 런타임 오버레이에서 제거합니다. 멱등 — 추가되지 않은 이름을 제거하면 스킵 응답이 반환됩니다(오류 아님).

`:name` 경로 매개변수는 URL 인코딩된 서버 이름입니다.

응답 (200) — 성공:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — 제거된 런타임 항목이 동일한 이름의 설정 정의 서버를 그림자화하고 있었습니다. 해당 설정 항목이 이제 그림자 해제되고 다음 검색/재시작에서 사용됩니다.

응답 (200) — 멱등 스킵:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

런타임 오버레이에 이름이 없을 때 반환됩니다(설정에 여전히 존재할 수 있음 — 설정 항목은 이 라우트를 통해 제거할 수 없음).

오류:

| 상태   | 코드                      | 발생 시점                                                                      |
| ------ | ------------------------- | ------------------------------------------------------------------------------ |
| `400`  | `invalid_server_name`     | 이름이 비어 있거나 256자를 초과하거나 `[A-Za-z0-9_-]` 밖의 문자 포함          |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` 헤더가 있지만 이 워크스페이스에 등록되지 않음              |
| `401`  | `token_required`          | 베어러 토큰이 구성되지 않음(엄격 게이트)                                      |
| `503`  | `acp_channel_unavailable` | 라이브 ACP 자식 없음                                                           |

### 그림자 의미론

런타임 항목은 설정 정의 MCP 서버 위에 일시적 오버레이를 형성합니다:

- 동일한 이름의 런타임 서버를 **추가**하면 설정 항목을 **그림자화**합니다 — 런타임 구성이 우선합니다. 원래 설정 항목은 수정되지 않습니다.
- 설정 항목을 그림자화하던 런타임 서버를 **제거**하면 **그림자 해제**됩니다 — 설정 정의 구성이 다음 연결에서 다시 활성 상태가 됩니다.
- **데몬 재시작**은 모든 런타임 항목을 잃습니다. 설정 정의 서버만 재시작을 넘어 생존합니다. 런타임 서버는 세션 수명 범위입니다.
- **`GET /workspace/mcp`**는 병합된 뷰를 보고합니다 — 설정 정의와 런타임 서버 모두 `servers[]` 배열에 나타납니다. 현재 스냅샷에서 두 출처 간 와이어 레벨 구별은 없습니다.

### 이벤트

두 라우트 모두 **워크스페이스 범위** SSE 이벤트를 발생시킵니다(모든 활성 세션 버스가 받음):

| 이벤트               | 발생 시점                   | 페이로드 필드                                                                          |
| -------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` 성공(스킵 아님)     | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` 성공(스킵 아님)   | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

스킵 응답(`budget_warning_only`, `not_present`)은 이벤트를 발생시키지 **않습니다**.

기존 `mcp_guardrail_events` 표면의 예산 관련 이벤트(`mcp_budget_warning`, `mcp_child_refused_batch`)도 런타임 추가가 예산 임계값을 교차할 때 발생합니다.

## 다음 단계

- **장기 실행 데몬 설정?** v0.16-alpha(로컬 전용)를 위한 [로컬 실행 템플릿(systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md).
- **클라이언트 구축?** [DaemonClient TypeScript 빠른 시작](../developers/examples/daemon-client-quickstart.md) 및 [HTTP 프로토콜 참조](../developers/qwen-serve-protocol.md)를 참조하세요.
- **소스 읽기?** 브리지 코드는 `packages/cli/src/serve/`에; SDK 클라이언트는 `packages/sdk-typescript/src/daemon/`에 있습니다.
- **로드맵 추적?** Stage 1.5 / Stage 2 진행 상황은 이슈 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)에서 추적됩니다.
