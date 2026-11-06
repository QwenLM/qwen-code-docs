# 데몬 모드 (`qwen serve`)

Qwen Code를 HTTP 데몬으로 실행하여 여러 클라이언트(IDE 플러그인, 웹 UI, CI 스크립트, 사용자 지정 CLI)가 각자의 하위 프로세스를 생성하는 대신 HTTP + Server-Sent Events를 통해 에이전트 세션을 공유할 수 있도록 합니다.

> **상태:** 실험적입니다. 이 데몬은 로컬 및 원격 Web Shell/API 배포를 지원합니다. 루프백 외부로 노출하기 전에 [인증](#authentication) 및 [배포 위협 모델](#default-deployment-threat-model)을 검토하세요.

## 제공하는 기능

- **내장 Web Shell UI** — `qwen serve`는 루트(`http://127.0.0.1:4170/`)에서 브라우저 기반 Web Shell을 즉시 제공합니다; `qwen serve --open`을 실행하면 브라우저에서 자동으로 열립니다. API와 동일한 오리진에서 제공되므로 두 번째 포트나 리버스 프록시가 필요하지 않습니다. API 전용 데몬의 경우 `--no-web`을 전달하세요.

  사이드바는 목록이 로드되었을 때 세션이 없으면 **워크스페이스 없는 세션**을 숨깁니다. 이는 **고정됨**과 동일합니다. 그룹이 숨겨진 상태에서 대화를 시작하려면 메인 **새 세션** 버튼을 사용하고 컴포저에서 **워크스페이스 없음**을 선택하세요.

- **최대 하나의 기본 ACP 자식 plus 신뢰할 수 있는 보조당 하나의 온디맨드 자식, 다수의 클라이언트** — 프로덕션에서는 기본 브리지를 예열하고 실패 시 첫 사용 시 재시도합니다; 신뢰할 수 있는 보조 런타임은 온디맨드로 자체 자식을 시작하며, 신뢰할 수 없는 보조는 자식을 시작하지 않습니다. 기본 `sessionScope: 'single'`에서 동일한 워크스페이스를 대상으로 하는 클라이언트는 하나의 ACP 세션을 공유하고 동일한 대화, 파일 diff, 권한 프롬프트에서 협업합니다.
- **재연결 안전 스트리밍** — `Last-Event-ID` 재연결이 있는 SSE로 클라이언트가 중단된 후 정확히 이전 위치에서 이어서 시작할 수 있습니다(링의 재생 창 내에서).
- **페이지된 영속 트랜스크립트** — `GET /session/:id/transcript`는 클라이언트를 연결하거나 라이브 SSE 재생 창을 변경하지 않고도 완전한 활성 디스크 트랜스크립트를 재생 페이지로 반환합니다.
- **첫 응답자 권한** — 에이전트가 도구 실행 권한을 요청하면 연결된 모든 클라이언트가 요청을 보며, 가장 먼저 응답하는 클라이언트가 승리합니다.
- **하나의 데몬, 하나 이상의 워크스페이스** — `--workspace`를 반복하여 하나의 리스너 아래에 격리된 워크스페이스 런타임을 등록합니다. 첫 번째 워크스페이스가 기본이며 `cwd`를 생략한 요청의 기본값으로 유지됩니다.
- **실험적 데몬 관리 채널** — `qwen serve --channel <name>`으로 시작하거나, 채널 없이 시작하고 나중에 `qwen channel set`으로 선택합니다. 워커는 데몬 수명주기가 소유한 별도 프로세스입니다. 선택 항목은 데몬 재시작 없이 조회, 교체, 리로드, 중지가 가능합니다.
- **원격 런타임 제어** — 세션의 승인 모드 변경(`POST /session/:id/approval-mode`), 워크스페이스별 도구 토글(`POST /workspace/tools/:name/enable`) 또는 로드된 skill(`POST /workspace/skills/:name/enable`), 빈 `QWEN.md` 스캐폴딩(`POST /workspace/init`, 기계적만 — 모델 호출 안 함; AI 채우기의 경우 `POST /session/:id/prompt` 후속 처리), 예산 사전 점검을 통한 단일 MCP 서버 재시작(`POST /workspace/mcp/:server/restart`), 또는 데몬 재시작 없이 MCP 서버 추가/제거(`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). 기본 토큰 없는 루프백 리스너는 이들을 모두 사용할 수 있습니다; 엄격 워크스페이스 뮤테이션은 다른 배포 모드에서 추가로 운영자 자격 증명을 요구합니다.
- **세션 요약**([#4175](https://github.com/QwenLM/qwen-code/issues/4175) 후속) — 활성 세션의 "어디서 멈췄는지" 한 문장 요약을 가져옵니다(`POST /session/:id/recap`). 코어의 `generateSessionRecap`을 빠른 모델에 대한 사이드 쿼리로 래핑; 메인 채팅 기록이나 SSE 스트림을 오염시키지 않습니다. 비엄격 게이트(`/prompt`와 동일한 자세); SDK 헬퍼 `client.recapSession(sessionId)`.
  - **알려진 한계 — 토큰 비용 증폭:** 이 라우트는 순수 비용 엔드포인트(각 호출은 LLM 사이드 쿼리이며 상태 이점 없음)이며 v1에서는 라우트별 속도 제한이 없습니다. 토큰 없는 루프백 기본값에서 버그가 있거나 악성인 로컬 클라이언트가 토큰을 소모하기 위해 스팸을 보낼 수 있습니다. 데몬을 노출하기 전에 공유 개발 호스트에서 `--token`(및 선택적으로 `--require-auth`)을 구성하세요.
  - **동시 재연결 안전성:** 동일한 세션에서 두 개의 동시 `/recap` 호출은 두 개의 독립적 사이드 쿼리를 실행합니다. `generateSessionRecap`은 `GeminiClient.getChat().getHistory()`를 통해 채팅 기록의 스냅샷을 읽고 별도의 `BaseLlmClient.generateText` 호출(`runSideQuery` 경유)에 전달합니다; 세션의 `GeminiChat`에 추가하거나 변경하지 않습니다. 조정 없이 여러 클라이언트에서 호출해도 안전합니다.

## 배포 및 보안 관련 참고 사항 [#deployment-and-security-notes]

- **루프백은 기본적으로 신뢰됩니다** — `127.0.0.1:4170`은 베어러 인증 없이 시작되며, 여기에 도달할 수 있는 모든 로컬 프로세스는 데몬 사용자로 코드 실행을 포함한 전체 API 권한을 받습니다. 공유되거나 신뢰할 수 없는 호스트에서는 `--require-auth`와 함께 안정적인 `QWEN_SERVER_TOKEN`을 사용하세요.
- **비루프백 리스너는 항상 베어러 토큰을 사용합니다** — 자체 토큰을 제공하거나 시작 시 출력되는 임시 토큰을 사용하세요. 생성된 토큰은 재시작 시 회전되므로 재사용 가능한 클라이언트에는 안정적인 토큰이 필요합니다. HTTP는 암호화되지 않으므로, 신뢰할 수 없는 네트워크를 통과하기 전에 TLS를 구성하세요.
- **백그라운드 실행에는 두 가지 경로가 있습니다** — 내장 로컬 생명주기 관리를 위해 `qwen daemon start`을 사용하거나, 서비스 관리자 감독이나 재부팅 후 시작이 필요한 경우 [systemd / launchd / tmux / nohup 템플릿](./qwen-serve-deploy-local.md)을 사용하세요.
- **토큰 영속화는 옵트인입니다** — `qwen daemon start --save-token`은 `qwen daemon token`을 위해 명시적으로 제공된 베어러 토큰을 소유자 전용 사이드카에 저장하며, 일반적인 `qwen serve` 및 생성된 토큰은 해당 사이드카를 사용하지 않습니다. [로컬 데몬 검사 및 제어](#inspect-and-control-a-local-daemon)를 참조하세요.
- **다중 워크스페이스는 단일 운영자 환경입니다** — 등록된 워크스페이스는 데몬의 베어러 토큰, 리스너, 할당량 및 프로세스 장애 경계를 공유합니다. 독립적인 사용자나 보안 주체를 위해서는 별도의 데몬과 외부 오케스트레이터를 사용하세요. [다중 세션 및 다중 워크스페이스 배포](#multi-session--multi-workspace-deployment)를 참조하세요.

더 깊은 "Stage 1에서 수정하지 않을 항목" 목록(단일 호스트 세션 상태 변경 모델 + 각 워크스페이스 런타임 내에서 하나의 ACP 자식을 공유하는 N개의 병렬 세션)은 아래 [Stage 1 범위 경계](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15)를 참조하세요.

## 빠른 시작

### 원격 Web Shell 및 모바일 접근 [#remote-web-shell-and-phone-access]

다른 머신에서 실행 중인 로컬 데몬에 연결하려면, 해당 Web Shell을 열고 **설정(Settings) → 연결(Connections) → 원격 연결 허용(Allow remote connections)**으로 이동하세요. 원격 접근은 기본적으로 비활성화되어 있습니다. 이를 활성화하고, 프롬프트가 표시되면 네트워크 인터페이스를 선택한 후, 표시된 주소와 베어러 토큰(bearer token)을 다른 Web Shell의 연결 양식에 복사하세요. 추가 터미널 명령이나 데몬 재시작이 필요하지 않습니다.

원격 리스너는 로컬 리스너와 동일한 워크스페이스 및 세션을 제공합니다. 먼저 선택된 인터페이스에서 동일한 숫자 포트를 사용합니다. 해당 주소가 사용 중이면 고급 설정에서 다른 포트를 선택하세요. Qwen은 조용히 포트를 변경하거나 다른 서비스를 중지하지 않습니다. 어떤 포트에서든 `localhost` 및 `127.0.0.1`의 HTTP 페이지가 허용됩니다. 고급 설정에서는 HTTPS 페이지를 포함하여 추가적인 정확한 브라우저 오리진(origin)을 허용합니다.

접근을 끄거나 토큰을 재설정하면 기존 원격 연결이 취소되지만, 로컬 클라이언트와 데몬이 소유한 실행 중인 작업은 계속됩니다. 다시 활성화하면 새 토큰이 생성됩니다. 이 설정은 데몬 재시작 시 유지되지 않습니다. 토큰은 권한이 부여된 로컬 운영자에게만 사용할 수 있습니다. 명시적인 시작/프록시 구성으로 이미 노출된 주요 리스너는 별도로 표시되며 이 스위치로 닫히지 않습니다.

주소는 네트워크 및 방화벽을 통해 도달 가능해야 합니다. HTTP는 토큰을 암호화하지 않으므로 신뢰할 수 있는 네트워크를 사용하거나 HTTPS를 구성하세요. HTTPS 페이지는 원격 HTTP 엔드포인트에 연결할 수 없습니다. UI는 인증, 정책 및 혼합 콘텐츠(mixed-content) 오류를 구분하지만, 일반적인 브라우저 네트워크 오류는 CORS, 인증서 및 연결 실패를 확실하게 구분할 수 없습니다.

```bash
qwen serve --hostname 0.0.0.0
```

`--token` 또는 `QWEN_SERVER_TOKEN`이 모두 제공되지 않으면 비루프백 리스너는 128비트 임시 베어러(22자 URL-safe 문자)를 생성하고 시작 시 한 번 출력합니다. 명시적 플래그 값은 환경 변수보다 우선하며, 비루프백 바인딩에서는 명시적으로 빈 값을 지정해도 안전하게 실패하여 부팅을 거부하지만, 루프백에서는 `QWEN_SERVER_TOKEN`를 덮어쓰고 `--require-auth`에 설명된 토큰 없는 신뢰 모드 상태로 바인딩을 유지합니다. 기본 루프백 동작은 변경되지 않습니다.

와일드카드 바인딩 시 시작 단계에서는 실제 인터페이스에서 토큰이 없는 로컬/네트워크 URL을 나열하고, 생성된 토큰이나 대화형 터미널에서의 사용자 지정 토큰에 대해 라벨이 지정된 사설 LAN 주소용 **비밀번호가 포함된 QR 코드**를 표시합니다. 와일드카드 열거는 Local Control이 광고하는 것과 동일한 사설/링크 로컬 LAN 그룹(RFC 1918 / RFC 3927 IPv4 및 듀얼 스택 바인딩의 fc00::/7 ULA IPv6)만 나열하며, VPN 어댑터와 컨테이너 브리지를 제외하는 소프트웨어 인터페이스 필터는 **이름 휴리스틱**([#9158](https://github.com/QwenLM/qwen-code/issues/9158))으로 보장되지 않으므로 k8s 오버레이 이름(`cbr0`, `cali*`, `vxlan.*`)이 통과될 수 있습니다. 명시적인 비 루프백 바인딩은 대신 선택한 주소(라우팅 가능한 주소 포함)를 정확히 출력하고 QR 코드로 생성합니다. 컨테이너 내부에서 열거된 주소는 컨테이너 자체의 인터페이스이므로 게시된 포트에 도달하려면 호스트 주소를 대체해야 합니다. pty 할당 컨테이너는 대화형 터미널로 간주되므로 로그에 비밀이 포함됩니다. QR 코드를 스캔하면 URL 조각에 베어러 토큰이 포함된 내장 Web Shell이 열립니다. 브라우저는 URL에서 자격 증명을 제거하고 탭별 `sessionStorage`에 보관합니다. 또는 인쇄된 URL을 열고 토큰을 입력할 수 있으며, 누락되거나 만료된 자격 증명은 재시도 양식을 표시합니다. 생성된 토큰은 재시작 시 회전합니다. `--no-web`은 QR 코드를 생략하며, 파이프/리디렉션된 stdout은 안정적인 운영자 토큰을 QR 코드 내에 다시 게시하지 않습니다. 이 경우 `--token-qr`을 지정하는 억제 힌트와 주소 전용 QR 코드(Web Shell은 도착 시 토큰을 요청함)를 대신 출력합니다. 전체 비밀번호가 포함된 QR 코드를 여전히 출력하려면 `--token-qr`을 전달하거나 사용자, 시스템 또는 시스템 기본 설정에서 `serve.tokenQr`을 설정하세요. `--no-token-qr`는 대화형 터미널과 생성된 토큰(자체 평문 줄로 계속 출력됨)을 포함한 모든 빠른 시작 경로에서 해당 실행의 빠른 시작 토큰 QR 코드를 억제하지만, Local Control 페어링 QR 코드는 제어하지 않으며 이는 `--local-control`이 설계상 출력합니다. QR 코드를 출력할 수 없는 위치(`--no-web`, 해결되지 않은 Web Shell 자산 또는 루프백 바인딩)에서 QR 코드를 요청하면 조용히 아무것도 하지 않는 대신 stderr에 이를 알립니다. 주소는 방화벽 또는 NAT 도달 가능성을 의미하지 않으며, 공개 IP는 자동으로 검색되지 않습니다.

내장 Web Shell의 동일 출처 **HTTP** 요청은 `--allow-origin` 없이 작동하지만, 다른 브라우저 출처에는 해당 허용 목록이 필요하며 `Origin: null`은 계속 거부됩니다. WebSocket 기반 기능(터미널, 음성) 및 TLS 종료 리버스 프록시를 통해 데몬에 도달하는 브라우저는 명시적인 `--allow-origin <origin>` 항목이 여전히 필요합니다. 전달된 헤더는 동일 출처를 확립하는 데 신뢰되지 않습니다. `Host` 헤더를 재작성하는 일반 HTTP 중개자도 마찬가지입니다. nginx의 기본 `proxy_set_header Host $proxy_host`와 k8s Ingress 모두 데몬이 더 이상 브라우저의 `Origin`과 일치하지 않는 `Host`을 보게 만듭니다. 브라우저가 실제로 보는 출처에 대해 `--allow-origin <origin>`을 전달하거나, 프록시가 `Host`을 원본 그대로 전달하도록 구성하세요. **비 루프백** 바인딩에서는 포트 변환만(`docker -p 8080:4170`)으로는 아무것도 필요하지 않습니다. 동일 출처 검사는 전달된 `Host`과 `Origin`을 비교하며 수신 포트를 참조하지 않기 때문입니다. 기본 **루프백** 바인딩에서는 그렇지 않습니다. DNS 재바인딩 Host 허용 목록은 데몬의 자체 포트만 허용하므로, 포트 변환 터널(`ssh -L 8080:localhost:4170`)은 셸 문서를 포함한 모든 요청에 대해 `403 Invalid Host header`으로 거부되며 `--allow-origin`로 재정의할 수 없습니다. 같은 포트를 전달(`ssh -L 4170:localhost:4170`)하거나 비 루프백으로 바인딩하세요. **모바일 액세스** 페어링 QR 코드는 요청하는 요청의 스킴과 `Host`으로 구성되며, 전달된 헤더로는 절대 구성되지 않습니다. 따라서 TLS 종료 프록시 뒤에서는 데몬의 자체 `http` 스킴을 유지하며, 교환은 초대가 발급된 출처에 바인딩되어 있으므로 전화기의 `https` 페이지를 거부합니다. 데몬의 직접 주소를 탐색하면서 페어링하거나, 대신 전화기에 토큰을 입력하세요. 베어러는 코드 실행을 포함하여 전체 데몬 API 권한을 부여합니다. 터미널 토큰과 QR 캡처를 비밀로 취급하세요. HTTP는 암호화되지 않으며, 기존 `--tls-cert` 및 `--tls-key` 옵션은 자체 인증서로 HTTPS를 제공합니다.

사용자 머신에서 원격 데몬을 Web Shell로 사용하려면 연결 화면 또는 **데몬 상태**에 원격 데몬의 출처(예: `https://dev-box.example:4170`)와 베어러 토큰을 입력하세요. 원격 데몬은 로컬 페이지의 출처를 허용해야 합니다. 고정 포트의 브라우저 탭은 해당 출처를 나열할 수 있으며, 예를 들어 `qwen serve --hostname 0.0.0.0 --allow-origin http://localhost:4170`이 가능합니다. 터미널의 WebSocket에도 해당 항목이 필요합니다. **데스크톱 클라이언트**는 다릅니다. 자체 셸을 `http://127.0.0.1:<OS-assigned port>`에서 로드하므로 페이지 출처가 매 실행마다 변경되어 고정 항목으로 일치시킬 수 없습니다. REST API와 터미널/음성 WebSocket 모두에 대해 정확히 그 루프백 호스트의 모든 포트를 허용하는 `--allow-origin http://127.0.0.1:*`으로 해당 출처 클래스를 명시적으로 옵트인하세요. `*`보다 권장됩니다. `*`은 모든 브라우저 출처를 허용하며 WebSocket 게이트가 아닌 REST만 커버하기 때문입니다. 토큰은 탭별 및 데몬 출처별로 보관되며 다른 데몬에 재사용되지 않습니다. 사이드바는 한 번에 하나의 선택된 데몬의 작업 공간을 나열합니다. 데몬을 전환하면 페이지가 다시 로드되고 로컬 및 원격 프로젝트 목록이 결합되지 않습니다. 기존 **작업 공간 추가** 양식을 사용하여 선택된 데몬에 절대 경로를 등록하세요. 이 브라우저가 이전에 연결하지 않은 출처를 `?daemon=`에 지정한 링크는 연결 화면에서 확인할 때까지 접촉되지 않습니다. 교차 출처 연결은 독립형 또는 내장형 Web Shell 모두에서 브라우저 로컬 파일 브리지를 제공하지 않습니다. HTTPS 페이지는 HTTP 데몬에 연결할 수 없으므로 신뢰할 수 없는 네트워크 외부에서는 둘 다 HTTPS로 서비스하세요.

### 1. 데몬 시작(루프백, 인증 없음)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: trusted loopback mode; local callers have full API access without bearer authentication, including code execution as the daemon user. Use --require-auth with QWEN_SERVER_TOKEN on shared or untrusted hosts.
```

기본 바인드는 `127.0.0.1:4170`입니다. 베어러 인증이 **꺼져** 있고 기본 리스너가 신뢰되므로, 포트에 접근할 수 있는 모든 로컬 프로세스가 데몬 사용자로 코드 실행을 포함하여 전체 운영자 API를 사용할 수 있습니다. 라우트별 워크스페이스 신뢰, 세션 소유권, `X-Qwen-Client-Id`, 권한, 기능, 검증 및 리소스 검사는 여전히 적용됩니다. 데몬은 현재 작업 디렉토리를 기본 워크스페이스로 등록합니다; 절대 `--workspace /path/to/dir`로 재정의하고, 플래그를 반복하여 추가 격리 런타임을 등록하세요.

API 전용 데몬의 경우 Web Shell을 비활성화하세요. 세션, 프롬프트, 작업 공간, 권한 및 SSE 경로는 변경되지 않지만, Web Shell에 바인딩된 표면은 함께 제거됩니다. Local Control 활성화는 모든 플랫폼에서 안전하게 실패하며, `/live/*` 경로(및 macOS에서 `QWEN_SERVE_LIVE_NATIVE_HOST=1`이 있는 경우 `/live/host` WebSocket)는 등록되지 않습니다:

```bash
qwen serve --no-web
```

**Web Shell UI 열기.** `http://127.0.0.1:4170/`로 이동하거나(또는 `qwen serve --open`으로 데몬을 시작하여 자동 실행), 전체 브라우저 터미널을 확인하세요 — 채팅, diff, 커밋 기록, 도구 호출, 권한 프롬프트. UI는 API와 동일한 오리진의 데몬 루트에서 제공됩니다. 이 가이드의 나머지 부분에서는 원시 HTTP를 사용하여 API를 직접 스크립트할 수 있습니다.

토큰을 수동으로 생성하지 않고 인증된 단일 사용자 실행을 하려면 명시적으로 옵트인하세요:

```bash
qwen serve --open-with-auth
```

이 루프백 전용 모드는 `--token`이나 `QWEN_SERVER_TOKEN`이 토큰을 제공하지 않을 때 256비트 베어러 토큰을 생성하고, 열린 Web Shell에 `#token=` URL 프래그먼트로 전달합니다. 셸은 프래그먼트를 제거하고 해당 탭의 `sessionStorage`에 자격 증명을 유지합니다; 새로고침은 작동하지만 탭을 닫거나 데몬을 재시작하면 자격 증명이 손실됩니다. CI, SSH 또는 자동 열기를 사용할 수 없는 다른 환경에서는 데몬이 시작되고 프래그먼트 URL이 출력되어 수동으로 열 수 있습니다. 출력된 URL은 시크릿을 포함합니다.

이 플래그는 기본적으로 꺼져 있으며, 브라우저 열기 동작을 포함하고 Web Shell, 빌드된 Web Shell 자산 및 루프백 바인드가 필요합니다. 일반적인 `qwen serve --open`은 루프백에서 토큰 없이 유지됩니다. 인증된 열기 모드에서 일반 API 라우트는 베어러 없는 다른 로컬 클라이언트를 거부하며, 정적 Web Shell 자산과 루프백 `/health`는 `--require-auth`도 설정되지 않은 한 기존 사전 인증 동작을 유지합니다. 여러 클라이언트나 다시 열 수 있는 Web Shell의 경우 안정된 공유 토큰을 대신 사용하세요:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --open
```

### 2. 정상 확인

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` 필드는 주요 호환성 워크스페이스를 노출하므로 클라이언트가 `POST /session`에서 `cwd`을 의도적으로 생략할 수 있습니다. 현재 클라이언트는 `workspaces[]`에서 신뢰할 수 있는 항목을 선택하고 런타임을 명시적으로 타겟팅할 때 해당 항목의 `cwd`을 전송해야 합니다. `limits.maxPendingPromptsPerSession` 필드는 활성 세션별 프롬프트 수용 상한(admission cap)을 알립니다. `null`은 상한이 비활성화되었음을 의미합니다. `limits.maxTotalSessions`은 선택적 데몬 전체 신규 세션 상한을 알리며, `null`은 무제한을 의미합니다.

### 로컬 데몬 검사 및 제어 [#inspect-and-control-a-local-daemon]

`qwen serve`은 각 활성 리스너에 대한 로컬 검색 레코드를 게시하므로 두 번째 터미널이 stdout을 파싱하거나 `ps`을 검색할 필요가 없습니다:

```bash
qwen daemon start --port 4170      # detached; waits for the discovery record
qwen daemon status                 # ports, PIDs, workspaces, and health
qwen daemon status --json          # one JSON object per daemon
qwen daemon status --detail        # version, uptime, sessions, and issues
qwen daemon logs --port 4170 -f    # follow the recorded log file
qwen daemon stop --port 4170       # SIGTERM the recorded process
qwen daemon restart --port 4170    # stop, then start with the recorded settings
```

레코드는 런타임 디렉터리(`$QWEN_RUNTIME_DIR`, `$QWEN_HOME` 또는 `~/.qwen`) 하위 `daemon/daemon-<port>.json`에 저장됩니다. POSIX에서 `0600`이며 베어러 토큰을 절대 포함하지 않습니다. 충돌한 데몬이 남긴 레코드는 `stale`로 보고되며, `status --prune` 또는 `stop`로 제거할 수 있습니다. `stop`은 리스너가 `/health`에 응답하거나 PID가 아직 살아있는 경우에만 `SIGTERM`을 전송합니다. `--force`은 우아한 타임아웃 후 `SIGKILL`을 추가합니다. 여러 데몬이 등록된 경우 `--port`을 전달하세요. `stop`도 `--all`을 허용합니다.

`status --detail`은 데몬에 자체 상태(버전, 가동 시간, 활성 세션 수, 문제 수)를 요청합니다. 레코드에서 데몬이 베어러 토큰을 사용한다고 명시하고, 기록된 프로세스가 살아 있으며, 주소 지정이 가능하고, 레코드가 시작된 시점과 일치할 때에만 `QWEN_SERVER_TOKEN`을 전송합니다. 이 프로세스가 주소 지정을 할 수 없는 PID 네임스페이스의 레코드에는 절대 베어러 토큰을 전송하지 않습니다. 토큰 없이 베어러 토큰을 요구하는 데몬은 인증이 필요하다고 보고합니다.

`qwen daemon start`은 `qwen serve`을 분리(detached) 상태로 실행하고, 디스커버리 레코드를 기다린 후 바인딩된 URL, PID, 로그 경로 및 중지 명령어를 출력합니다. 시작 세션의 식별자와 개인 권한 바인딩을 제거하여 자식 프로세스가 새로운 데몬이 되도록 하고, 운영자의 모델/인증 환경 변수는 유지하며, `--no-token-qr`을 전달하여 시작 로그에 토큰이 포함되지 않도록 합니다. 작업 공간은 정규화되며, 상대적 런타임 디렉터리는 실행 전에 시작 디렉터리에 고정되고, Windows 드라이브 상대 경로는 시작 드라이브 기준으로 해석됩니다. 루프백(loopback)이 아닌 바인딩에는 `QWEN_SERVER_TOKEN`이 필요하며, 임시 토큰을 사용하려면 `qwen serve`을 직접 사용하십시오. 시작 로그는 `0600`이며 성공적인 시작 후 삭제됩니다. `--wait`은 런타임이 서비스 중일 때까지 대기하며(`daemon_runtime_starting` 문제가 없고 `error` 상태가 아님), 타임아웃 발생 시 시작 로그를 유지하고 비영(zero가 아닌) 종료 코드로 종료합니다.

재사용 가능한 로컬 자격 증명을 사용하는 인증된 백그라운드 데몬의 경우, 환경 변수를 통해 안정적인 토큰을 제공하고 토큰 사이드카(sidecar) 사용을 선택적으로 활성화하십시오:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen daemon start --require-auth --save-token --wait
qwen daemon token --port 4170          # print the saved bearer; treat the output as a secret
qwen daemon token --port 4170 --remove # delete only the local sidecar
```

셸 프로세스 목록에 표시되는 `--token`보다 `QWEN_SERVER_TOKEN`을 선호하십시오. `--save-token`는 명시적으로 제공된 토큰을 요구하며 토큰 없이는 실행을 거부합니다. 사이드카는 디스커버리 레코드와 동일한 런타임 디렉터리 아래 `daemon/daemon-<port>-<pid>.token`에 위치하며, POSIX에서는 `0600` 권한을 가지며 디스커버리 레코드나 데몬 로그에 포함되지 않습니다. `qwen daemon stop`는 이를 삭제하지만 `qwen daemon restart`는 대체 인스턴스로 이를 전달합니다. `qwen daemon token --remove`은 로컬 사본을 삭제하지만 실행 중인 데몬의 자격 증명을 변경하거나 취소하지 않으므로, 토큰을 회전하려면 데몬을 중지하고 새 토큰으로 다시 시작하십시오. 일반적인 `qwen serve`(`--open-with-auth` 포함)은 이 사이드카를 작성하지 않습니다.

`qwen daemon restart`은 `daemon stop`을 통해 등록된 데몬 하나를 중지하고 `daemon start --wait`를 통해 기록된 포트와 호스트 이름, 기록된 시작 작업 공간, Conversations 작업 디렉터리 루트, Web Shell 모드 및 `--require-auth` 설정으로 다시 시작합니다. `--web`/`--no-web` 및 `--require-auth`/`--no-require-auth`은 레코드를 오버라이드합니다. 영속화된 작업 공간 등록은 새 데몬 자체가 복원하며 `--workspace`로 재생되지 않습니다. 다른 모든 `qwen serve` 옵션(예: `--profile`, `--channel`, `--allow-origin` 또는 속도 제한)은 기본값으로 재설정되므로 이러한 구성으로 데몬을 실행한 경우 `qwen serve`을 통해 다시 실행하십시오. 무언가를 중지하기 전에 재시작은 HTTPS 데몬, 더 이상 존재하지 않는 시작 작업 공간, 데몬이 호스팅하는 셸 내부(예: Web Shell 터미널)에서의 실행, 그리고 `--token` 또는 `QWEN_SERVER_TOKEN`이 없는 베어러 데몬을 거부합니다. 실행 중인 베어러 데몬은 토큰을 허용해야 하므로 재시작은 자격 증명을 회전하지 않습니다. 작업 공간 `.env`이나 설정 파일에만 보관된 토큰은 `qwen daemon`이 읽지 않습니다. `--force`은 사용자가 전달한 경우에만 `daemon stop`로 전달됩니다. 기록된 포트가 사용 중이면 데몬은 다음 빈 포트에서 시작되며 재시작은 비영 종료 코드로 종료합니다.

현재 데몬에 의해 기록된 Conversations 루트는 재시작 셸의 `QWEN_CONVERSATIONS_DIR`이 변경되었더라도 `daemon restart`에 의해 보존됩니다. 이 필드가 없는 이전 디스커버리 레코드는 다시 시작 환경이나 기본값을 사용하므로 이전 선택을 보장할 수 없습니다. 다른 루트를 선택하려면 데몬을 중지하고 새 값으로 시작하십시오. 영속성 및 복원 요구 사항은 [Conversations working directory](#conversations-working-directory)를 참조하십시오.

### 작업 공간 등록 용량

기본 등록 한도는 256입니다. 이를 낮추려면 `QWEN_SERVE_MAX_WORKSPACES=25 qwen serve --workspace /path/to/project`을 설정하십시오. 허용되는 값은 1부터 256까지의 10진수 정수입니다. 잘못된 값은 시작 실패를 유발합니다. 이는 데몬 시작 설정이므로 프로젝트 `.env`과 프로젝트 `settings.env`로는 변경할 수 없습니다. 임베디드 호출자는 시작 환경보다 우선하는 `ServeOptions.maxRegisteredWorkspaces`을 설정할 수 있습니다.

한도는 주(primary) 작업 공간, 등록된 보조 작업 공간 및 사용자가 생성한 스크래치 작업 공간을 계산합니다. 내부 Conversations 런타임은 제외됩니다. 동적 등록은 용량 도달 시 `409 workspace_limit_reached`을 반환합니다. `GET /capabilities`과 `GET /daemon/status`는 `limits.maxRegisteredWorkspaces`을 노출합니다.

기본 등록 용량인 256일 때, 표준 데몬은 하나의 작업 공간만으로 시작된 데몬을 포함하여 전역 세션 상한을 800으로 고정합니다. 25를 초과하는 구성된 등록 용량에도 동일한 세션 기본값이 적용됩니다. `--max-total-sessions`은 여전히 이를 오버라이드하며 `0`은 이를 비활성화합니다. 용량이 25 이하인 경우 기존 기본값이 유지됩니다. 즉, 시작되거나 복원된 작업 공간이 하나면 무제한이고, 여러 개일 경우 작업 공간별 상한과 그 수로부터 총량을 파생합니다. 등록 변경은 총량을 재계산하지 않습니다. 이는 ACP 자식 메모리 정책을 변경하지 않으며 800개의 안전한 동시 세션을 보장하지도 않습니다.

채널 제어는 최대 25개의 작업 공간 소유자를 독립적으로 지원하며 `limits.maxChannelControlWorkspaces`으로 노출됩니다. 전환(transitions)은 복원을 위해 유지되는 소유자도 계산합니다. 용량 도달 시 새 소유자를 추가하기 전에 이전 소유자의 선택된 채널을 모두 성공적으로 중지하십시오. 과도한 크기의 전환은 `409 channel_control_workspace_limit_reached`을 반환합니다. `--channel all`는 계속 주 작업 공간만 선택합니다. 채널 SDK 타임아웃은 변경되지 않습니다.

영속화된 등록 파일은 스키마 버전 1을 유지하며 8 MiB 내에서 최대 255개의 보조 레코드를 지원합니다. 오래된 별칭을 포함한 원시(raw) 레코드는 잊혀질 때까지 영속 슬롯을 소비합니다. 완전한 유효 시작 집합이 구성된 한도를 초과하면 시작이 실패하고 파일은 변경되지 않습니다. 용량을 줄이려면 이전 용량으로 재시작하고, 충분한 등록을 잊어버린 후, 낮은 한도로 재시작하기 전에 명시적인 `--workspace` 인수를 줄이십시오. 이전 바이너리로 다운그레이드하기 전에 파일을 백업하고 최신 바이너리를 사용하여 최대 24개의 보조 레코드와 256 KiB로 축소하십시오. 그렇지 않으면 이전 바이너리는 해당 저장소를 거부하고 명시적 작업 공간만으로 시작하며, 쓰기 전에 저장소 변경 사항이 실패합니다.

### 세션 라이브 상태 폴링 조정

Web Shell은 기본적으로 **5초**마다 작업 공간 세션 라이브 상태를 새로 고칩니다. 다른 간격을 사용하려면 데몬을 시작하기 전에 데몬 환경 변수를 설정하십시오:

```bash
QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS=10000 qwen serve --web
```

값은 `1000`에서 `2147483647`까지의 밀리초 단위 정수입니다. 누락되거나 잘못된 값은 `5000`로 대체됩니다. 이 간격은 해당 데몬이 제공하는 모든 작업 공간에 적용되며, 변경 후에는 데몬을 재시작하고 열려 있는 모든 Web Shell 페이지를 다시 로드하십시오. 로컬 세션 작업과 보이는 탭으로 돌아가기는 즉시 새로 고침을 트리거할 수 있습니다. 이는 라이브 상태 폴링만 변경하며 전체 세션 카탈로그 폴링은 변경하지 않습니다.

데몬은 유효 간격을 `sessionLiveStatePollIntervalMs`로 `/capabilities`에 게시합니다. Web Shell은 이 값을 사용하며, 이 값이 생략된 이전 버전의 데몬에 연결할 경우 5초로 폴백합니다. SDK 소비자는 자체 폴링 일정을 선택할 때 이 값을 읽을 수 있습니다.

### 데몬에서 채널 실행

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under daemon-owned workspace workers
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all

# Or start a token-protected daemon with no channel worker
QWEN_SERVER_TOKEN=secret qwen serve

# Enable or replace its runtime selection later
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# Inspect or stop daemon-managed channels
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

이 모드는 실험적이며 데몬이 관리합니다. 이는 독립형 `qwen channel start` 명령을 대체하지 않습니다: `--daemon-url` 없이는 기존 `qwen channel start`, `stop` 및 `status` 동작이 독립형으로 유지됩니다. `qwen serve --channel`가 있으면 명시적 선택이 우선시되며, 데몬은 리스닝 전에 채널 서비스 리스를 예약하고 초기 워커가 준비되지 않으면 시작이 실패합니다. 플래그 없는 부팅 시 데몬은 모든 신뢰할 수 있는 등록된 워크스페이스에서 `serve.channels`를 복원하므로, 비주(primary) 워크스페이스가 시작하도록 구성된 채널은 런타임 API 호출 없이 데몬과 함께 다시 돌아옵니다. 두 소스 모두 채널을 선택하지 않으면 무거운 채널 런타임은 로드되지 않은 상태로 남아 있으며, 첫 번째 런타임 PUT 또는 자체 `serve.channels`를 구성하는 워크스페이스가 등록될 때까지 채널 서비스 리스가 예약되지 않습니다. 데몬 시작 후 등록된 신뢰할 수 있는 워크스페이스도 데몬 실행당 한 번만 자체 `serve.channels`를 복원합니다. 나중에 다시 등록(제거 후 또는 신뢰 재구성 후)하면 복원이 반복되지 않으므로 그 사이에 중지한 채널은 중지된 상태로 남습니다. 명시적인 `--channel`로 데몬을 시작하거나 `qwen channel stop`(`DELETE /workspace/channel`)로 채널을 중지하여 `qwen channel set`가 다시 활성화하기 전까지는 이 과정을 완전히 건너뜁니다: 워크스페이스 등록은 호스팅을 다시 켜는 요청이 아닙니다. 부팅 복원과 달리 호스팅할 수 없는 이름을 건너뛰고 나머지는 유지하지만, 그런 이름이 포함된 목록을 가진 늦게 등록된 워크스페이스는 채널을 하나도 복원받지 못하며 데몬 로그에 이유가 기록됩니다. 워크스페이스 등록은 해당 채널이 올라올 때까지 기다리지 않습니다. 호스팅할 수 없는 워크스페이스가 나열한 채널 이름은 로그와 함께 건너뛰어 다른 워크스페이스의 채널은 실행 중으로 남습니다; `all`은 여전히 주(primary) 워크스페이스에만 적용됩니다. 준비된 워커가 나중에 충돌하면 데몬은 계속 실행되며 제한된 재시작 정책으로 이를 다시 실행하고 `GET /daemon/status`에서 상태(`channel_worker_exited` 경고 포함)를 보고합니다.

자동 복원은 워커 시작 전에 잘못된 시작 필드 또는 검증 또는 리스 오류를 건너뛰고, `serve.channels` 소스를 기록하며, 관련 없는 설정은 유효하게 유지합니다. 워커 시작 실패 후 데몬은 정리(clean up)가 성공적으로 완료된 경우에만 계속 진행합니다. 전역 런타임 시작 타임아웃 및 확인되지 않은 워커 중지는 일반적인 시작 실패 동작을 유지합니다; 워커 종료 확인이 안 된 동안 서비스 리스는 보유 상태를 유지합니다. 건너뛰거나 실패한 복원에 대해 데몬 로그를 확인하세요.

저장된 시작 이름은 비어 있지 않아야 하며, 앞뒤 공백이 없어야 하고, 안전하지 않은 제어 문자나 보이지 않는 문자를 포함하지 않아야 합니다. 잘못된 항목은 개별적으로 건너뛰며 배열 인덱스로 로깅됩니다. 시작 과정은 이를 다른 인스턴스 이름으로 트리밍(trim)하거나 설정을 재작성하지 않습니다. 채널 시작 토글은 영속화된 구성을 반영하는 반면, 런타임 상태는 채널이 실행 중인지 여부를 보고합니다.

런타임 제어는 `GET`, `PUT` 및 `DELETE /workspace/channel`로 노출되며, SDK 헬퍼는 `getChannelWorkerControl()`, `setChannelWorkerSelection()` 및 `stopChannelWorker()`입니다. PUT/DELETE/reload는 엄격한 변경 게이트를 사용합니다: 신뢰할 수 있는 루프백(loopback) 주(primary) 호출자는 토큰 없이 사용할 수 있지만, 다른 배포 환경에서는 운영자 자격 증명이 필요합니다. 런타임 선택은 의도적으로 일시적입니다: PUT은 설정이나 부팅 옵션을 편집하지 않으며, 재시작 시 명시적인 `qwen serve --channel` 선택으로 돌아가거나, 없으면 신뢰할 수 있는 주 워크스페이스의 `serve.channels`로, 둘 다 없으면 비활성화 상태로 돌아갑니다. 명시적인 CLI 및 런타임 명명된 선택은 첫 번째 발생 순서대로 트리밍되고 중복 제거됩니다. 첫 번째 채널이 공유 모델 선택에 영향을 줄 수 있으므로 순서가 유지됩니다.

데몬 기반 `qwen channel set` 및 `qwen channel reload`, 그리고 `--daemon-url`와 함께 사용되는 `status` 및 `stop`은 `--open-with-auth`가 생성한 토큰을 발견할 수 없습니다. `QWEN_SERVER_TOKEN`를 사용하고 동일한 값을 `--token`로 이러한 클라이언트에 전달하거나 인증된 오픈 모드(authenticated-open mode)를 생략하세요.

데몬은 각 채널의 설정(토큰, `proxy`, 채널별 `model`)을 워커가 시작될 때 읽습니다. 커밋된 선택을 변경하지 않고 설정을 다시 읽으려면 `POST /workspace/channel/reload`(SDK `client.reloadChannelWorker()` 또는 `qwen channel reload`)를 호출하세요. 리로드는 워크스페이스 소유권을 재해결하고 동일한 롤백 안전 조정 경로를 통해 선택된 워커를 재시작합니다. `channel_control` 기능은 런타임 제어가 연결될 때마다 존재합니다; `channel_reload`는 관리자가 활성화된 동안에만 존재합니다. 영속 스레드는 디스크에서 복원됩니다.

선택된 각 채널의 `cwd`은 등록된 워크스페이스로 해석되어야 하며, 채널은 소유 워크스페이스별로 그룹화됩니다: 단일 워크스페이스 데몬은 하나의 워커를 실행합니다(이전과 동일); 다중 워크스페이스 데몬(`--workspace` 반복)은 선택된 채널을 소유한 각 워크스페이스마다 하나의 워커를 실행하며, 각 워커는 해당 워크스페이스의 cwd, `QWEN_DAEMON_WORKSPACE` 및 env 오버레이에 바인딩됩니다. 비주 워크스페이스에서 채널을 호스팅하려면 해당 워크스페이스의 자체 `.qwen/settings.json`에 정의하거나(`cwd` 불필요) 워크스페이스 경로와 동일한 명시적인 `cwd`를 설정하세요. `cwd` 없이 사용자/시스템 범위에서만 정의된 채널은 여러 워크스페이스에서 모호합니다: 명시적인 `--channel` 선택은 시작을 실패시키며, 자동 복원은 워커 시작 전에 소유권 오류를 기록하고 해당 선택을 건너뜁니다. `--channel all`은 주 전용으로 유지되며(주 워크스페이스의 채널을 호스팅함), 명명된 채널과 결합할 수 없습니다.

선택 교체는 아무것도 중지하기 전에 구성, 소유권 및 신뢰성을 사전 점검(preflight)합니다. 순차 선택이 변경되지 않은 워크스페이스 워커는 유지됩니다. 변경된 워커를 시작할 수 없으면 데몬은 새 워커를 중지하고 이전 선택을 복원합니다. SIGKILL 후에도 데몬이 이전 자식 프로세스 종료를 확인할 수 없으면 PID 리스를 유지하고 중복 워커 생성을 거부합니다. 요청된 어댑터 중 최소 하나가 연결되면 워커는 여전히 준비된 것으로 간주됩니다; 그러면 PUT은 `partial: true`를 반환하고 `/daemon/status`은 누락된 어댑터에 대해 `channel_worker_partial_connect`를 보고합니다. 데몬이 올릴 수 없었던 `serve.channels` 이름 — 워커 시작에 실패한 구성된 선택, 부팅 시 귀속할 수 없었던 이름, 또는 늦은 등록의 복원으로 인해 다운된 채 남은 이름 — 은 `/daemon/status`에서 `channel_restore_failed`로 보고되며, 해당 워크스페이스의 자체 설정이 이를 정의하는 경우 해당 워크스페이스의 채널 목록에서 `lastError`와 함께 `error`로 표시됩니다. 이름이 호스팅되지 않은 상태로 남는 다른 경우는 데몬 로그에만 기록됩니다.

어댑터가 `connect()`를 거부하면 현재 워커 스냅샷에는 채널, `phase: "connect"`, 선택적 어댑터 코드 및 자격 증명이 마스킹된 메시지를 포함한 `startupFailures` 항목이 있을 수 있습니다. `qwen channel set`, `qwen channel reload` 및 원격 `qwen channel status --daemon-url …`는 이러한 이유를 출력합니다. 동적 세트 또는 reload 중에 모든 어댑터가 실패하면 명령은 `502 channel_worker_start_failed`를 수신합니다; 응답 이유는 해당 시도를 설명하고 `state`는 롤백 후 결과를 설명합니다. 실패한 시도는 이후 상태 요청에 의해 보존되지 않습니다. 워커 시작당 최대 64개의 이유가 보존되며, 어댑터 코드는 안정적 범주가 아닌 진단용으로 취급해야 합니다. 초기 `qwen serve --channel …` 시작은 어댑터가 연결되지 않을 경우 여전히 종료합니다.

데몬은 클라이언트 UI 및 운영자를 위해 읽기 전용 런타임 스냅샷도 노출합니다: `GET /daemon/status`, `GET /workspace/mcp`, `GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`, `GET /workspace/preflight`, `GET /workspace/:id/session-info`, `GET /session/:id/status`, `GET /session/:id/context`, `GET /session/:id/supported-commands`, 그리고 `GET /session/:id/tasks`, `GET /session/:id/lsp`, `GET /session/:id/resources`, `GET /session/:id/transcript`.

`GET /workspace/:id/session-info` (및 복수형 쌍인 `GET /workspaces/:workspace/session-info`)은 워크스페이스의 집계 세션 수를 반환합니다: 영구 저장된 `active` / `archived` / `total`, 그리고 라이브 상태가 있을 때 현재 메모리 내 `live` 수를 포함합니다. 등록된 신뢰할 수 없는 보조 워크스페이스는 카탈로그 읽기가 라이브 브리지를 쿼리하지 않으므로 `live`을 생략합니다. 페이지네이션된 `GET /workspace/:id/sessions` 목록에는 총계가 없으므로, 이는 “세션이 몇 개 존재합니까?”라는 질문에 대한 전용 인터페이스입니다 — 예약되거나 반복되는 작업으로 인해 큰 로컬 저장소가 남을 때 유용합니다.

> ⚠️ **디스크 스캔 — 폴링하지 마세요.** 이 엔드포인트는 워크스페이스 채팅 디렉터리 아래에 있는 로컬 세션 JSONL 파일을 순회합니다. 응답에는 항상 `expensive: true`과 `cost: "disk_scan"`이 포함됩니다. 드물게 호출하세요(수동 새로고침, 운영자 도구, 간헐적 UI 로드) — 타이머나 사이드바 렌더링마다 호출하지 마세요. 페이지 탐색에는 `GET /workspace/:id/sessions`를, 라이브 메모리 내 세션 수에는 `GET /daemon/status`를 선호하세요. `truncated: true`가 포함된 응답은 스캔이 안전 한도에 도달했거나 모든 후보 파일을 분류할 수 없었음을 의미하므로, 영구 저장된 수는 하한(lower bound)입니다.

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status`은 단일 세션의 라이브 브리지 요약을 반환합니다: `sessionId`, `workspaceCwd`, `createdAt`, 선택적 `displayName`, `clientCount`, `hasActivePrompt`. 데몬이 해당 ID의 라이브 세션을 보유 중일 때는 요약으로 `200`에 응답하고, 그렇지 않으면 `404` (본문 `{ "error": …, "sessionId": … }`)로 응답합니다. 전체 페이지네이션된 세션 목록을 가져오고 스캔하지 않고도 알려진 하나의 세션이 여전히 실행 중인지(`hasActivePrompt`) 또는 몇 개의 클라이언트가 연결되어 있는지(`clientCount`) 확인하는 데 사용하세요:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

이는 원시(raw) 라이브 세션 뷰이므로 `clientCount`과 `hasActivePrompt`은 `GET /workspace/:id/sessions`의 해당 항목과 일치하지만, 두 경로는 바이트 단위로 동일하지 않습니다. 목록 엔드포인트는 각 항목을 영구 저장된 세션 저장소 데이터로 보강합니다: 그 `createdAt`은 영구 저장된 첫 프롬프트 시간이며, 저장된 제목이나 첫 프롬프트에서 파생된 `updatedAt` 및 `displayName`를 추가합니다. 반면 `/status`은 라이브 세션 자체의 `createdAt`을 보고하고, `updatedAt`을 생략하며, 라이브 세션에 설정된 경우에만 `displayName`를 반환합니다.

`GET /session/:id/lsp`은 구조화된 세션별 LSP 상태를 반환합니다. 생성된 에이전트 세션에서 LSP를 활성화하려면 데몬을 `--experimental-lsp`과 함께 시작하세요. 그렇지 않으면 라우트는 서버 없이 `enabled: false`를 반환합니다.

`GET /session/:id/resources`은 해당 라이브 세션 자체 Config에서 살균(sanitized)된 Skill 및 MCP 스냅샷을 반환합니다. 세션이 기본 워크스페이스와 자원이 다른 worktree 또는 다른 유효 디렉터리에서 실행될 수 있을 때 사용하세요. 워크스페이스 소유의 MCP 인증, 풀(pool), 예산(budget) 및 발견(discovery) 오류 세부 정보는 이 세션 뷰에서 생략됩니다. 호출하기 전에 `session_resources` 기능을 확인하세요.

`GET /daemon/status`은 통합된 문제 해결 스냅샷입니다. 기본 `detail=summary`은 메모리 내 데몬 상태(세션, 권한, SSE/ACP 전송 카운트, 속도 제한 거부, 프로세스 메모리, 해석된 한도)만 읽으며 ACP 자식 프로세스를 시작하지 않습니다. 문제를 적극적으로 조사 중일 때 세션별 진단, ACP 연결 세부 정보, 인증 디바이스 플로우 카운트 및 워크스페이스 상태 섹션을 확인하려면 `GET /daemon/status?detail=full`을 사용하세요.

`GET /workspace/mcp`은 실시간 ACP 런타임을 보고하며 유휴 상태일 때 ACP 자식 프로세스를 시작하지 않습니다. 유휴 데몬은 빈 스냅샷과 함께 `initialized: false`을 반환합니다. 세션이 활성화되면 `initialized: true`로 전환되어 실제 상태를 표시합니다.

`GET /workspace/providers`은 워크스페이스 설정 및 환경에서 데몬 로컬로 응답하므로 ACP 자식 프로세스가 실행 중일 필요는 없으며, `acpChannelLive`은 활성 신호(liveness signal)입니다. 워크스페이스 설정이나 모델 구성을 해석할 수 없는 경우 응답에는 `initialized: false`, 빈 `providers` 배열 및 `errors` 항목이 포함됩니다. 데몬이 데몬 로컬 제공자 상태 빌더 없이 생성된 경우에만 라우트가 실시간 ACP 스냅샷으로 폴백하며, 데몬 로컬 응답에는 런타임에 등록된 모델이 절대 포함되지 않습니다.

`GET /workspace/skills`은 보존된 데몬 관찰 결과를 즉시 반환하고 백그라운드에서 재검증하므로, 캐시된 읽기 작업은 ACP 자식 프로세스를 기다리지 않습니다. 선택적 `snapshot` 객체는 `observedAt`, `ageMs`, `stale` 및 `refreshing`을 보고하며, 카탈로그를 최신 상태로 간주하기 전에 `ageMs`을 확인하세요. 첫 번째 성공적인 관찰 결과 이전에는 1초 시작 스로틀 윈도우 내의 읽기 작업이 대기하는 대신 `initialized: false`과 `errors` 항목을 반환할 수 있으며, 이는 재시도 가능한 일시적 가용성 부족이지 빈 카탈로그가 아닙니다.

이름별로 워크스페이스 Skill 설정을 업데이트하려면 `workspace_skill_settings_toggle` 기능을 확인한 후 `POST /workspace/skills/:name/enable`을 호출하여 `{ "enabled": true | false }`을 설정하세요. 여러 이름을 변경하려면 `workspace_skill_settings_batch_toggle`을 확인하고 `POST /workspace/skills/enable`을 호출하여 `{ "skillNames": ["review", "deploy"], "enabled": false }`을 전달하세요. 이 기능은 구조적으로 유효한 모든 이름을 함께 처리하고, 결과 선언 변경 사항을 최대 하나의 잠긴 설정 쓰기 작업으로 영속화하며, 변경 사항이 있을 때 활성 ACP 세션을 한 번만 새로고침합니다. 이러한 경로는 로드된 Skill 카탈로그를 참조하지 않고 워크스페이스 `skills.disabled` 및 `skills.enabled`에 쓰므로, 설치 전이나 해당 Extension이 비활성인 동안에도 이름을 비활성화할 수 있습니다. 활성화 시 일치하는 워크스페이스 비활성화를 제거하고 명시적인 `skills.enabled` 옵트인을 기록하며, 이는 설치 전에도 적용되어 Extension 내부의 Skill 비활성화를 덮어쓸 수 있습니다. 동일한 선언을 반복하면 아무 동작도 하지 않습니다(`changed: false`). 경로 및 요청 본문은 변경되지 않으며, 설정 관련 기능이 폐기된 카탈로그 검증 기반 Skill 토글 태그를 대체합니다. 배치 `errors` 배열은 호환성을 위해 유지되지만 구조적으로 유효한 이름의 경우 비어 있습니다. 상위 범위에서 상속된 하드 `skills.disabled` 항목은 유효 가용성에 대해 여전히 권위적이지만, 워크스페이스가 자체 선언을 기록하거나 제거하는 것을 차단하지는 않습니다. Skill 상태 셀은 `disabledReason`(`hard`, `default` 또는 `inactive_extension`) 및 선택적 `lockedScope`을 노출합니다. 신뢰할 수 없는 워크스페이스 쓰기는 여전히 거부됩니다. `deferred` 응답은 라이브 확인 시점에 자식이 실행 중이 아니었거나, 변경된 요청이 필수 새로고침 중에 자식/세션을 잃어버렸음을 의미합니다. `changed`이 true이면, 자식이 시작될 때 영속화된 선언이 적용됩니다. 선언이 실제로 변경되었는지 여부는 `changed`로 보고됩니다(배치 요청의 각 결과마다). `skills.disabled`은 수동 및 모델 사용을 모두 비활성화하지만, `disable-model-invocation: true`은 직접 `/skill-name` 호출을 사용할 수 있게 유지합니다. V2 Extension 배치를 사용하려면 `extension_batch_activation_v2`을 확인하세요: `PUT /extensions/activation`은 전역 기본값을 변경하고, `PUT /workspaces/:workspace/extensions/activation`은 선택된 워크스페이스에 대한 정확한 오버라이드를 변경하며 `"inherit"`을 허용하여 이를 지웁니다. 둘 다 `extensionNames`에 이름을 받습니다. `enabled` 및 `disabled`은 설치 전에 선언할 수 있지만, 알 수 없는 이름에 대한 `inherit`은 아무 동작도 하지 않습니다. 각 요청은 폴링할 하나의 작업을 반환합니다. `extension_activation_explicit_refresh`이 광고되면, 해당 작업은 활성화 정책이 커밋된 후 완료되며 활성 세션을 직접 새로고침하지 않습니다. 이를 즉시 적용하려면 활성화 성공 후 독립적인 기본 또는 워크스페이스 한정 Extension 새로고침을 제출하세요. 명시적인 새로고침이 없으면 다른 워크스페이스는 다음 30초 간격의 생성 조정자 패스까지 이전 활성화를 계속 사용할 수 있으며, 실패한 조정은 이후 패스에서 재시도됩니다.

`GET /workspace/env`과 `GET /workspace/preflight`은 ACP 상태와 관계없이 항상 `initialized: true`로 응답합니다. `env`은 ACP를 참조하지 않으며(데몬 프로세스 정보만 해당), `preflight`는 `process.*`에서 데몬 수준 셀에 응답하고 자식 프로세스가 유휴일 때 ACP 수준 셀에 대해 `status: 'not_started'` 자리표시자를 출력합니다.

`GET /workspace/env`은 데몬 프로세스의 런타임, 플랫폼, 샌드박스, 프록시 및 `OPENAI_API_KEY`과 같은 허용 목록에 포함된 비밀 환경 변수의 **존재 여부**(값은 아님)를 보고합니다. 프록시 URL은 자격 증명이 제거되고 네트워크로 전송되기 전에 `host:port`로 축소됩니다. 이 라우트는 항상 데몬 프로세스에서 직접 응답하며 ACP 자식 프로세스를 생성하지 않습니다.

`GET /workspace/preflight`은 준비 상태 검사 목록을 반환합니다. **데몬 수준 셀**(Node 버전, CLI 엔트리, 워크스페이스 디렉터리, ripgrep, git, npm)은 항상 렌더링됩니다. **ACP 수준 셀**(인증, MCP 발견, 스킬, 제공자, 도구 레지스트리, 아웃바운드 트래픽)은 실행 중인 ACP 자식 프로세스가 필요하며, 데몬이 유휴일 경우 ACP를 단순히 채우기 위해 생성하는 대신 `status: 'not_started'` 자리표시자를 출력합니다. 오류는 클라이언트 UI가 구조화된 수정 사항을 렌더링할 수 있도록 닫힌 `errorKind` 열거형(`missing_binary`, `auth_env_error`, `init_timeout`, `restore_timeout`, `protocol_error`, `missing_file`, `parse_error`, `blocked_egress`)에 매핑됩니다.

데몬은 워크스페이스 파일 헬퍼도 노출합니다:

- `GET /file`은 텍스트 파일을 읽습니다. 전체 스냅샷 응답은 원시 바이트 `sha256:<hex>` 해시를 반환하며, 256 KiB를 초과하는 파일의 유한 라인 윈도우에서는 이를 생략합니다.
- `GET /file/bytes`는 제한된 원시 바이트 창을 읽고 base64 내용을 반환합니다.
- `POST /file/write`는 텍스트 파일을 생성하거나 교체합니다.
- `POST /file/edit`는 하나의 정확한 텍스트 교체를 적용합니다.

쓰기/편집은 **엄격한 변경(mutating) 라우트**입니다: 토큰 없는 신뢰된 루프백(primary listener)은 운영자 권한을 부여하며, 자격 증명이 없는 신뢰되지 않은 임베드는 `token_required`을 반환합니다. 교체 및 편집에는 전체 스냅샷 `GET /file`(또는 전체 윈도우 `GET /file/bytes`)의 최신 `expectedHash`이 필요합니다. 부분적인 대형 파일 윈도우는 낙관적 동시성 토큰으로 사용할 수 없습니다. `create`는 절대로 덮어쓰지 않습니다. 무시되는 경로에 대한 명시적 쓰기는 허용되지만 감사(audited)됩니다. 바이너리 쓰기, 삭제/이동/mkdir 및 재귀적 상위 디렉터리 생성은 이 인터페이스의 일부가 아닙니다.

### 3. 세션 열기

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd`는 생략할 수 있습니다 — 라우트는 데몬의 기본 워크스페이스로 폴백합니다. 등록된 워크스페이스로 표준화되지 않는 `cwd`를 게시하면 `400 workspace_mismatch`가 반환됩니다.

두 번째 클라이언트가 동일한 해석된 워크스페이스 런타임에 대해 `/session`에 게시하면 기본 `sessionScope: 'single'` 하에서 `"attached": true`을 얻게 되며, 이제 해당 런타임의 에이전트 세션을 공유하게 됩니다. `cwd`을 생략하면 기본값으로 해석되며, 다른 등록 워크스페이스를 선택하면 해당 런타임의 별도 기본 세션을 생성하거나 첨부합니다.

### 4. 이벤트 스트림 구독 (다른 터미널에서 먼저 실행)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 줄은 **전체 이벤트 인벨롭**입니다 — `{id?, v, type, data, originatorClientId?}` — 단일 라인으로 JSON 문자열화된 것입니다. ACP 페이로드(이 예시의 `sessionUpdate` 블록)는 해당 인벨롭 내부의 `data` 아래에 있습니다. SSE 레벨의 `id:` / `event:` 라인은 EventSource 클라이언트를 위한 편의이며, 동일한 값이 JSON 인벨롭 내부에 나타나므로 raw-`fetch` 소비자도 이를 받습니다.

프롬프트를 보내기 **전에** 이것을 여세요 — SSE 재생 버퍼는 마지막 8000개 이벤트를 보관하므로 늦게 구독한 클라이언트가 `Last-Event-ID`을 통해 따라잡을 수 있지만, 간단한 "단일 프롬프트 모니터링" 경우에는 먼저 구독하여 라이브로 스트리밍하도록 하는 것이 가장 쉽습니다.

스트림은 `session_update`(LLM 청크, 도구 호출, 사용량), `permission_request`(도구 승인 필요), `permission_resolved`(누군가가 투표함), `model_switched`, `model_switch_failed` 및 종료 프레임인 `session_died`(에이전트 자식 프로세스 충돌 — 이후 SSE 종료)와 `client_evicted`(큐 오버플로 — 이후 SSE 종료)을 출력합니다.

### 5. 프롬프트 전송 (원래 터미널에서)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

4단계의 `curl -N`이 프레임이 도착하는 대로 출력합니다.

### 선택적 Todo 중지 가드

장기 실행 데몬 클라이언트는 현재 작업 체인이 최상위 Todo 목록을 성공적으로 작성한 후에도 대기 중이거나 진행 중인 항목이 남아 있을 때 중단된 경우, 제한된 연속 작업을 옵트인할 수 있습니다. 데몬을 재시작하기 전에 `settings.json`에 다음을 추가하세요:

```json
{
  "experimental": {
    "todoStopGuard": true
  },
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

가드는 새로운 사용자 입력 없이 최대 두 번의 연속적인 기본 모델 호출을 추가합니다. 턴 중간에 들어온 사용자 메시지는 먼저 실행되며 새로운 두 번 시도 단계를 시작합니다. 재시도/계속 및 관련 백그라운드 결과는 현재 단계의 예산(budget)을 유지합니다. 모든 호출과 최종 소진 상태는 `_meta.source: "todo_stop_guard"`이 포함된 재생 가능한 `session_update` 이벤트로 나타나며, 메타데이터에는 시도 횟수와 미완료 개수가 포함되나 Todo 텍스트는 절대 포함되지 않습니다. 큐잉된 전체 프롬프트도 먼저 실행되며, 기존 권한/취소 규칙은 변경되지 않습니다.

무장된(armed) 체인이 관련 백그라운드 작업을 기다리는 동안, 관련 없는 cron/loop 트리거와 오래된 작업 알림은 지연(deferred)됩니다. 반복 작업은 체인이 양보(yield)할 때까지 작업별로 제한되고 병합(coalesced)됩니다.

이 옵션의 기본값은 `false`이며 재시작이 필요하고, 안전 모드, 베어 모드 및 승인 `plan` 모드에서는 강제로 비활성화됩니다. 메모리 전용으로 유지되며: 디스크에서 Todo 상태를 로드하거나 데몬을 재시작해도 활성화되지 않습니다. settings.json에 `tools.todoWrite.enabled`를 설정하고 Qwen Code를 재시작하면, 새로운 일반 프롬프트가 자체 최상위 `todo_write`를 성공적으로 실행해야 합니다; 재시도/계속하기 및 라이브 클라이언트 재연결은 현재 메모리 내 작업 체인을 유지합니다. 세션 작업 디렉터리를 성공적으로 변경하면 이전 Todo가 새 워크스페이스에서 재개되지 않도록 초기화됩니다.

## 인증 [#authentication]

루프백 외의 모든 환경에서는 API 요청마다 베어러 토큰이 필요합니다. 재사용 가능한 클라이언트를 위해 안정적인 토큰을 제공하거나, 토큰 없이 시작하여 데몬이 생성하고 출력하는 임시 토큰을 사용하세요:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → uses QWEN_SERVER_TOKEN; generates an ephemeral token if neither token source is supplied
```

클라이언트는 일반 API 요청 시 `Authorization: Bearer <token>`을 전송합니다 — `$QWEN_SERVER_TOKEN`(직접 내보낸 경우) 또는 데몬이 생성한 경우 시작 시 출력된 베어러 토큰(이 경로에서는 환경 변수가 설정되지 않으므로 시작 출력에서 값을 복사해야 함). `/health`는 **일반 루프백 바인딩에서만** 면제되므로, 파드 내부의 k8s/Compose 라이브니스 프로브는 자격 증명이 필요하지 않습니다. 비루프백 바인딩(`--hostname 0.0.0.0` 등)에서는 `/health`가 다른 일반 API 라우트와 마찬가지로 토큰을 요구합니다 — 그렇지 않으면 공격자가 임의의 주소를 탐색하여 데몬의 존재 여부를 확인할 수 있습니다. 채널 웹훅 유입은 모든 모드에서 분리되어 있으며, 데몬 베어러 대신 구성된 `x-qwen-webhook-secret`를 사용합니다. 구성된 토큰이 올바른지 엔드투엔드로 확인하려면 `/capabilities`을 사용하세요:

> **강화된 루프백 (`--require-auth`).** 기본 루프백 무토큰 동작은 단일 사용자 노트북에는 적합하지만, 공유 개발 호스트, CI 러너 또는 모든 로컬 사용자가 `curl 127.0.0.1:4170`할 수 있는 멀티 테넌트 워크스테이션에서는 안전하지 않습니다. `--require-auth`를 전달하면 `127.0.0.1`에 바인딩된 경우에도 `/health` 및 `/capabilities`를 포함해 모든 일반 API 라우트에서 베어러 토큰을 필수로 만듭니다. 채널 웹훅 유입은 `x-qwen-webhook-secret`에 의해 독립적으로 인증됩니다. Web Shell 문서 및 자산 라우트는 사전 인증 상태로 유지되며, 이를 제거하려면 `--no-web`을 사용하세요. 토큰 소스가 해결되지 않으면 부팅이 실패하며, 루프백에서는 `--token`, `QWEN_SERVER_TOKEN` 또는 `--open-with-auth`을 의미합니다 — 마지막 옵션은 부팅 전에 자체 생성된 토큰을 설치하므로 `--require-auth --open-with-auth`이 시작됩니다. 생성 키는 `--hostname` 표기에 따라 결정됩니다: 루프백 표기(`127.0.0.0/8`, `localhost`, `::1`, `[::1]`)는 절대 생성하지 않으며, 루프백으로 해석되는 DNS 이름을 포함한 기타 표기는 `--require-auth`을 충족하는 임시 베어러 토큰을 생성하여 시작 시 출력합니다(소켓이 루프백에 바인딩된 경우 토큰만 출력). 매 재시작마다 회전하므로 재사용 가능한 클라이언트를 위해 `--token` 또는 `QWEN_SERVER_TOKEN`을 고정하세요. 플래그가 켜진 상태에서 **미인증** 클라이언트는 인증이 필요함을 발견하기 위해 `/capabilities`을 읽을 수 없습니다; 발견 표면은 401 응답 본문 자체입니다. 인증 후 `caps.features.require_auth` 태그는 배포가 강화되었음을 사후 확인하는 용도입니다(감사/컴플라이언스 UI에 유용):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
# Paste the bearer the daemon printed at startup, or your own QWEN_SERVER_TOKEN.
TOKEN='<printed bearer>'
curl -H "Authorization: Bearer $TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

토큰 비교는 상수 시간입니다(SHA-256 + `crypto.timingSafeEqual`); 401 응답은 "누락된 헤더", "잘못된 스킴" 및 "잘못된 토큰"에서 균일하므로 사이드 채널이 구별할 수 없습니다.

`--open-with-auth`는 CLI 소유의 편의 기능이며 또 다른 데몬 토큰 소스가 아닙니다: 해당 옵션이 정의되어 있으면(비어 있더라도) `--token`을 선택하고, 그렇지 않으면 `QWEN_SERVER_TOKEN`을 선택한 다음 선택된 값을 트리밍하고 결과가 비어 있는 경우에만 생성합니다. 데몬은 생성된 값을 영속화하거나 `QWEN_SERVER_TOKEN`으로 내보내지 않으며, 기존 내부 인증된 자식 핸드오프는 변경되지 않습니다. Web Shell은 브라우저 사본를 수신 탭의 `sessionStorage`에만 저장합니다; 이 모드는 탭 간 또는 외부 클라이언트 자격 증명 발견 메커니즘을 추가하지 않습니다. 토큰은 독립적으로 철회할 수 없으며 클라이언트 아이덴티티에 연결되지 않습니다. 소유는 다른 베어러 토큰과 동일한 데몬 권한을 부여합니다. [인증된 Web Shell 실행 설계](../design/2026-08-22-serve-open-with-auth.md) 및 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)의 관련 향후 작업을 참조하세요.

## HTTPS / TLS (모바일 / 크로스 디바이스 접근용) [#https--tls-for-mobile--cross-device-access]

기본적으로 데몬은 평문 HTTP를 제공합니다. 이는 `localhost`에서는 괜찮지만, LAN IP(`https://192.168.x.x:4170`)로 접속하는 스마트폰이나 태블릿은 `http://`을 통해 [안전한 컨텍스트](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)가 **아닙니다** — 따라서 브라우저는 `getUserMedia`(음성 입력), WebRTC 및 기타 안전한 컨텍스트 전용 API를 차단합니다. `--tls-cert` + `--tls-key`을 전달하여 Web Shell을 HTTPS로 제공하고 이러한 제한을 해제하세요:

```bash
# 1. Install a local CA and trust it (one-time). The mobile device must
#    also trust this CA — mkcert prints where the root cert lives.
mkcert -install

# 2. Generate a cert for your machine's LAN IP. Add localhost / 127.0.0.1 to
#    the SANs too: with `--open`, the daemon rewrites the browser URL to
#    127.0.0.1, so a cert scoped to only the LAN IP would be rejected with
#    ERR_CERT_COMMON_NAME_INVALID. (mkcert names the output after all hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Start the daemon over HTTPS. Non-loopback binds still require a token,
#    and the browser Origin must be allowed through CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

참고:

- **두 플래그 모두 또는 둘 다 없음** — 하나만 지정하면 부팅이 실패합니다(키 없는 인증서로는 HTTPS 리스너를 시작할 수 없음).
- **TLS는 인증과 직교합니다** — HTTPS는 전송 계층을 암호화합니다; 베어러 토큰이 구성된 경우, 일반 루프백 바인딩에서의 `/health`을 제외한 일반 API 라우트를 제어합니다. 루프백 `/health`도 제어하려면 `--require-auth`을 전달하세요. 채널 웹훅 유입은 항상 자체 공유 비밀을 사용합니다. 비루프백 바인딩은 TLS 여부와 관계없이 항상 토큰을 요구합니다 — 전달한 토큰이거나, 데몬이 생성하여 시작 시 출력하는 임시 토큰일 수 있습니다.
- **범위는 TLS 종료에만 국한됩니다** — 자동 생성, ACME / Let's Encrypt 지원 없음. 이는 LAN / 개발 편의를 위한 것이며, 인터넷에 공개되는 배포 환경에서는 리버스 프록시에서 TLS를 종료해야 합니다(아래 위협 모델 참조).
- **채널 워커는 `https://`을 통해 데몬으로 다시 연결합니다(dial back)** — 따라서 워커도 서빙 인증서를 신뢰해야 합니다. 자체 서명된 인증서(또는 자체 루트를 포함하는 fullchain)는 추가 설정이 필요 없습니다: 데몬이 이를 각 워커의 `NODE_EXTRA_CA_CERTS`에 주입합니다. 위의 mkcert 절차는 **CA 발급** 방식이므로, 리프 인증서만으로는 체인을 앵커링할 수 없습니다 — `--channel`로 시작하기 전에 데몬의 실행 환경에 `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"`를 내보내야(export) 합니다. 운영자가 설정한 값은 데몬 인증서와 _병합_되며 대체되지 않습니다. 이 값이 없으면 데몬은 정상적으로 부팅되지만 모든 채널 워커가 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`로 인해 재시작 루프에 빠집니다; 데몬 로그는 부팅 시 이 공백을 명시합니다.
- **IPv6 와일드카드 바인드는 이 호스트가 실제로 할당한 루프백 주소로 다시 연결됩니다(dialled back)** — `--hostname ::` (또는 `[::]`)은 IPv6 소켓을 바인딩합니다. (빈 `--hostname`는 리스너에 도달하지 못합니다: 바인딩 전에 운영자 오류로 거부되므로, `HOSTNAME`이 설정되지 않은 compose 파일은 조용히 와일드카드로 처리되는 대신 명확하게 실패합니다.) 해당 소켓은 듀얼 스택(Node가 `IPV6_V6ONLY=0`를 고정하므로 `net.ipv6.bindv6only` sysctl 설정이 영향을 미치지 않음)이며, 일반적으로 두 루프백 모두 도달 가능하지만 — IPv4가 전혀 없는 호스트는 `::1`만 사용할 수 있고, `::`을 바인딩하지만 루프백에 `::1`가 없는 호스트(예: `net.ipv6.conf.lo.disable_ipv6=1`)는 `127.0.0.1`만 사용할 수 있습니다. 이 호스트가 `[::1]`을 할당하면 워커는 그곳으로 보내지고, 그렇지 않으면 `127.0.0.1`로 보내집니다. IPv6 와일드카드 바인드에 대한 서빙 인증서는 SAN에 두 루프백 주소를 모두 포함해야 합니다(`mkcert localhost 127.0.0.1 ::1`이 이를 커버함); 부팅 시 신뢰성 진단은 워커가 연결할 정확한 URL을 검사하고 공백을 명시합니다. `--hostname 0.0.0.0`는 변경되지 않았으며 여전히 `127.0.0.1`가 필요합니다.
- **`--tls-cert`를 제자리에서 회전하려면 데몬 재시작이 필요합니다** — 데몬은 부팅 시 읽은 바이트를 제공하므로, 재시작할 때까지 재생성된 워커는 데몬이 제공하는 것보다 최신 내용을 로드할 수 있어 핸드셰이크가 실패합니다.

## Web Shell을 앱으로 설치

지원되는 브라우저에서 데몬의 Web Shell을 열고 브라우저의 **앱 설치** 또는 **홈 화면에 추가** 기능을 사용하세요. 설치된 앱은 Qwen Code 이름과 아이콘으로 독립적인 창에서 동일한 서버를 엽니다. iOS에서는 브라우저의 공유 메뉴와 **홈 화면에 추가**를 사용하세요. 가용성은 브라우저 및 기기에 따라 다릅니다.

데몬은 PWA 메타데이터를 직접 제공합니다: `GET /manifest.webmanifest`과 `GET /sw.js`은 사전 인증 라우트(브라우저는 Authorization 헤더가 존재하기 전에 두 파일을 모두 가져옴)이며, `sw.js`는 `Service-Worker-Allowed: /`과 함께 제공되어 범위가 전체 오리진을 커버합니다. 워커는 콘텐츠 해시가 포함된 Vite 빌드 자산만 캐시하며, 캐시 우선 전략을 사용합니다. 해싱되지 않은 공개 아이콘과 매니페스트는 HTTP로 재검증됩니다. API 요청, 이벤트 스트림 및 인증 헤더를 포함하는 요청은 네트워크를 통해 처리됩니다.

휴대폰이나 기타 원격 장치에서는 신뢰할 수 있는 HTTPS 연결을 사용하세요. 로컬 개발을 위해 `localhost` 또는 루프백 주소에서의 HTTP가 지원됩니다. LAN IP에서의 평문 HTTP는 서비스 워커를 활성화하지 않습니다. 위의 TLS 지침을 참조하세요. 설치는 인증서 또는 인증 검사를 우회하지 않습니다.

설치는 항상 서버 루트를 실행합니다. 현재 주소의 토큰, 세션 링크 또는 워크스페이스는 앱의 실행 URL에 포함되지 않습니다. 설치된 앱에서 토큰을 다시 입력해야 할 수 있습니다: 기존 Web Shell 인증 흐름을 사용하며 영구적인 자격 증명 저장을 추가하지 않습니다.

서버는 계속 실행 중이고 접근 가능해야 합니다. 서비스 워커가 활성화되고 페이지를 제어한 후, 연결이 실패했을 때 루트나 세션 링크를 열면 재시도 페이지가 표시됩니다. 대화 내용, 파일, API 응답 또는 자격 증명은 서비스 워커 캐시에 저장되지 않습니다. 기존 HTTP 오류는 여전히 서버에서 발생합니다. 이 첫 번째 단계는 오프라인 작업, 웹 푸시 또는 앱이 닫혀 있을 때의 알림을 제공하지 않습니다. 업데이트된 워커는 `skipWaiting()`과 `clients.claim()`로 즉시 활성화되며, 페이지 새로고침을 강제하지 않고 열린 탭의 이전 워커를 대체합니다. 활성화 시 이전 Qwen 셸 캐시는 제거되지만 관련 없는 캐시는 보존됩니다.

설치 메타데이터는 내장된 Qwen Code 신원을 사용하며, 런타임 사용자 지정 브랜딩은 Web Shell 내부에서 여전히 적용됩니다. 임베디드 라이브러리 소비자는 워커를 등록하지 않습니다. 설치를 제거하려면 브라우저 또는 운영체제의 앱 관리를 사용하고, 서비스 워커 및 저장된 사이트 데이터를 제거하려면 브라우저의 사이트 설정을 사용하세요.

## Qwen Live (실험적)

Qwen Live는 모든 플랫폼에서 Web Shell을 통해 실행됩니다: 브라우저 탭이 마이크와 스피커 역할을 하므로(WS `/live/web`), 마이크 접근을 위해 `https` 또는 `localhost`로 Web Shell을 여세요. 네이티브 macOS `Qwen Live Host` 앱은 기본적으로 꺼져 있습니다; 이를 시도하려면 `QWEN_SERVE_LIVE_NATIVE_HOST=1`로 macOS 데몬을 시작하세요. 이렇게 하면 Live가 켜질 때 `/live/host` WebSocket, `realtime_voice` 기능 및 Host 다운로드가 복원됩니다. 이것이 없으면 이미 설치된 `Qwen Live Host.app`은 연결할 수 없는 상태로 유지됩니다(데몬이 `/live/host`를 등록하지 않음); 이를 종료하고 Web Shell을 사용하세요.

## CLI 플래그

| 플래그 | 기본값 | 목적 |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>` | `4170` | TCP 포트. `0` = OS가 할당한 임시 에페메럴 포트. |
| `--hostname <addr>` | `127.0.0.1` | 바인딩 인터페이스. 루프백 외의 경우 토큰이 필요합니다; `--token` 또는 `QWEN_SERVER_TOKEN`이 이를 제공하지 않으면, 임시 토큰이 생성되어 시작 시 출력됩니다. |
| `--local-control` | `false` | 선택된 하나의 사설 IPv4 인터페이스에서 데몬 소유의 취소 가능한 페어링 토큰, 터미널 QR 코드, 정확한 브라우저 오리진 및 최선의 노력(best-effort) 수면 억제를 사용하여 Web Shell을 공유합니다. `--token`, `--allow-origin` 및 `--port 0`와 조합하여 사용할 수 있으며, `--no-web` 및 기본값이 아닌 `--hostname`과는 충돌합니다. 여러 LAN 후보가 있을 때는 `--local-control-address`을 사용하고, 음성 입력과 같은 보안 컨텍스트 브라우저 API를 위해 `--tls-cert` + `--tls-key`를 추가하세요. |
| `--local-control-address <ip>` | — | 호스트에 여러 후보가 있을 때 공유할 LAN IPv4 주소. `--local-control`이 모호한 선택을 보고하는 경우에만 필요합니다. |
| `--token-qr` | — | stdout이 캡처된 경우(대화형 터미널이 아닌 경우)에도 토큰이 포함된 QR 코드를 출력하며, 베어러는 운영자가 제공한(안정적인) 토큰으로 기본값에서는 수집된 로그에 안정적인 자격 증명이 포함되지 않도록 숨겨집니다. `serve.tokenQr` 설정으로도 지정할 수 있으며, 사용자, 시스템 및 시스템 기본 범위에서만 적용되고 플래그가 전달되면 우선합니다. 플래그 생략은 `--no-token-qr`와 **다릅니다**: 생략 시 기본 정책(대화형 터미널에서 또는 생성된 토큰의 경우 QR 코드 표시)이 유지되지만, `--no-token-qr`은 모든 빠른 시작 경로에서 해당 실행 동안 시작 시 빠른 시작 토큰 QR 코드를 억제하므로 영구 설정을 실행별로 거부할 수 있습니다. 둘 다 로컬 제어 페어링 QR 코드는 관리하지 않습니다. |
| `--token <str>` | — | 베어러 토큰. `QWEN_SERVER_TOKEN` 환경 변수로 대체됩니다(앞뒤 공백 제거 — `$(cat token.txt)`에 유용). 소스가 없는 비 루프백 바인딩은 임시 토큰을 생성합니다. 명시적으로 빈 값인 경우에도 비 루프백 바인딩에서는 부팅을 거부하지만, 루프백에서는 환경 변수를 가리고 신뢰된 토큰 없는 모드를 선택하거나(`--require-auth` 하에서는 즉시 거부) 합니다. |
| `--require-auth` | `false` | 루프백에서도 베어러 토큰 없이 시작하는 것을 거부합니다. 모든 로컬 사용자가 리스너에 접근할 수 있는 공유 개발 호스트/CI 러너/멀티 테넌트 워크스테이션에서 `127.0.0.1` 개발자 기본값을 강화합니다. 이 패스트 페일(fail-fast)은 루프백 전용입니다: 루프백은 세 가지 토큰 소스 중 하나(`--token`, `QWEN_SERVER_TOKEN` 또는 부팅 전 자체 생성된 토큰을 설치하는 `--open-with-auth`, 생성은 루프백에서 억제됨)가 있을 때만 부팅되며, 비 루프백 바인딩에서는 생성된 임시 토큰이 플래그를 충족합니다. `/health`도 베어러 뒤에 게이트합니다. |
| `--enable-session-shell` | `false` | 직접 세션 셸 실행을 활성화합니다. 구성된 베어러 토큰 또는 신뢰된 루프백 모드와 함께 효과적이며, 호출에는 여전히 유효한 세션 바운드 `X-Qwen-Client-Id`가 필요합니다. |
| `--tls-cert <path>` | — | PEM 인증서 파일 경로. HTTP 대신 **HTTPS**로 제공합니다. `--tls-key`과 반드시 함께 사용해야 합니다(하나라만 주어지면 부팅 실패). 브라우저가 일반 `http://`에서 차단하는 음성 입력(`getUserMedia`), WebRTC 등 보안 컨텍스트 브라우저 API를 LAN IP에서 사용할 수 있게 합니다. TLS 종료만 지원하며 자동 생성/ACME는 지원하지 않습니다. 아래 [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) 참조. |
| `--tls-key <path>` | — | PEM 개인 키 파일 경로. `--tls-cert`과 반드시 함께 사용해야 합니다. |
| `--max-sessions <n>` | `32` | 동시 활성 세션 수 제한. 한도에 도달하면 새 `POST /session` 요청이 새로운 자식을 생성하려고 하면 `503`(`Retry-After: 5` 포함)을 반환하며, 기존 세션에 대한 연결은 계산되지 않습니다. `0`로 설정하여 비활성화합니다. `serve.maxSessions`로도 설정할 수 있으며(사용자, 시스템 및 시스템 기본 범위만); 플래그가 전달되면 우선합니다. 단일 사용자/소규모 팀 사용을 기준으로 크기를 조정했으며, 배포 환경에 RAM/FD 여유 공간이 있으면 높입니다(세션당 약 30–50 MB). |
| `--max-total-sessions <n>` | `800` 또는 파생 | 모든 등록된 작업 공간 런타임 전반에서 새로운 세션 생성에 대한 선택적 비음수 정수 데몬 전체 제한입니다. 새 자식 세션, 세션 복원 및 분기/포크 생성된 세션에 적용되며, 기존 활성 세션에 연결하는 것은 슬롯을 소비하지 않습니다. 무제한으로 설정하려면 `0`로 설정합니다. 등록 용량이 25 이상(기본값 256 포함)인 경우 기본값은 800입니다. 용량이 25 이하인 경우, 하나의 시작 또는 복원된 작업 공간은 무제한이며 여러 개는 작업 공간별 제한과 그 수에서 총량을 파생합니다. 이후의 동적 등록은 이를 재계산하지 않습니다. |
| `--max-pending-prompts-per-session <n>` | `5` | `POST /session/:id/prompt`에서 허용되었으나 아직 처리되지 않은 프롬프트에 대한 세션별 제한으로, 대기 중인 프롬프트와 활성 프롬프트를 포함합니다. 브리지는 `promptId`를 반환하기 전에 오버플로를 `503`, `Retry-After: 5`, `code: "prompt_queue_full"`로 동기적으로 거부합니다. 비활성화하려면 `0`로 설정합니다. `branchSession`은 동일한 FIFO에서 직렬화되지만 이 프롬프트 제한에는 포함되지 않습니다. |
| `--workspace <path>` | `process.cwd()` | 이 데몬이 등록한 절대 작업 공간 디렉터리. 플래그를 반복하여 하나의 프로세스에서 여러 작업 공간을 호스팅할 수 있으며, 첫 번째가 기본(primary)이고 요청이 `cwd`를 생략할 때 기본값으로 유지됩니다. 상대 경로는 거부됩니다. 정규화된 `cwd`이 등록되지 않은 세션 요청은 `400 workspace_mismatch`를 반환합니다. |
| `--conversations-dir <path>` | — | 독립형 및 Live 세션을 위한 절대 Conversations 작업 디렉터리 루트. `QWEN_CONVERSATIONS_DIR`을 재정의하며, 둘 다 설정되지 않으면 `~/Documents/Qwen Code/Conversations`를 사용합니다. `qwen daemon start`에서도 허용됩니다. [Conversations 작업 디렉터리](#conversations-working-directory) 참조. |
| `--memory-project-scope <mode>` | `workspace` | 프로젝트 메모리 분할 모드. `workspace`(기본값)은 정확히 등록된 작업 공간 디렉터리를 키로 사용하여 각 데몬 작업 공간이 격리된 메모리를 갖게 하며, `git-root`은 동일한 Git 루트로 해석되는 작업 공간 간에 공유되는 레거시 호환성 모드입니다. 제공될 경우 `QWEN_CODE_MEMORY_PROJECT_SCOPE`을 재정의하며, 빈 환경 값은 미설정 상태로 취급되고 인식되지 않는 비어 있지 않은 값은 한 번 경고하고 무시되어 레거시 `git-root` 동작을 유지합니다. 새로운 기본값은 기존 git-root 프로젝트 메모리를 마이그레이션하지 않으므로, 마이그레이션 중에 해당 항목을 읽으려면 명시적인 `git-root` 범위를 사용하십시오. |
| `--channel <name\|all>` | — | 실험적 데몬 관리 채널 워커. 플래그를 반복하여 구성된 여러 채널을 선택하거나, `all`를 전달하여 구성된 모든 채널을 시작합니다. `all`는 명명된 채널과 결합할 수 없습니다. 선택된 채널 `cwd` 값은 등록된 작업 공간으로 해석되어야 하며, 다중 작업 공간 데몬은 소유 작업 공간당 하나의 워커를 실행합니다. 워커는 `qwen serve`이 소유하며, serve-managed 채널을 중지하려면 데몬을 중지하십시오. |
| `--max-connections <n>` | `256` | 리스너 수준 TCP 연결 제한(`server.maxConnections`). 세션 수와 관계없이 원시 소켓 수를 한정하며, 가득 차면 느린/유령 SSE 클라이언트는 accept 시점에 거부됩니다. 배포 환경에서 세션당 많은 SSE 구독자가 예상되는 경우 `--max-sessions`과 함께 높이십시오. |
| `--memory-budget-mb <n>` | cgroup/호스트의 50% | 데몬 프로세스 트리 전체에 대한 총 메모리 예산(MB). 설정되지 않은 경우 cgroup 제한 또는 호스트 메모리의 50%로 파생되며, 어떤 경우든 유효 값은 해석된 가용 메모리로 상한이 적용되고, 설정된 값과 유효 값 모두 보고됩니다. 이는 `--child-heap-mode`이 선택하는 고정 ACP 파티션 및 적응형 라이브 저널 성장을 구동하며, 총 RSS 제한이 아닙니다: 유효 예산의 5%로 파생되는 데몬 전역 성장 풀(상한 `1024` MB; `insufficientMemory`을 보고하는 호스트에서는 풀이 0이고 적응형 성장이 비활성화됨)이 모든 워크스페이스 브리지에서 공유됩니다 — `--max-journal-bytes` 참조. 해석된 수치는 `GET /daemon/status`의 `limits.memory` 아래에 등록 및 활성 자식 수와 함께 표시되며, `runtime.memory` 아래에 권고 사항인 자식별 지분이 포함됩니다. 최소값보다 작은 호스트는 위로 클램핑되지 않고 `insufficientMemory`을 보고합니다; 파생 비율이 50%이므로 약 2 GB 미만의 호스트는 이 조건에 해당합니다. 이러한 호스트에서 파생 값을 재정의하려면 명시적인 `--memory-budget-mb 1024`를 전달하십시오(플래그는 여전히 경고 해소를 위해 최소 1024 MB의 가용 메모리를 요구합니다). `[1024, 1048576]` 내의 정수여야 합니다. |
| `--memory-pressure-mode <mode>` | `observe` | 데몬이 자체 메모리 읽기 값을 판정으로 변환할지 여부. `observe`(기본값)는 `GET /daemon/status`의 `runtime.memory.pressure` 아래에 압력 수준을 보고하고, 수준이 `normal`을 벗어날 때마다 `daemon_memory_pressure` 이슈를 발생시킵니다 — 이는 `warning`이므로 전체 `status`은 `ok`을 유지합니다. `off`은 수준을 포함한 모든 수치를 계속 보고하지만 이슈를 발생시키지 않으므로 전체 `status`은 변경되지 않습니다; 캘리브레이션 중이거나 최상위 상태로 알림을 설정하는 경우 사용하십시오. 수준은 두 가지 비율 중 더 나쁜 값입니다: 가용 메모리에 대한 RSS(cgroup OOM 킬러가 모니터링하는 항목)와 이 프로세스의 힙 상한에 대한 V8 힙 사용량. 이는 데몬 루트 프로세스만 포함하며, 자식에 대해서는 `runtime.memory.children.rssBytes`와 비교하십시오. 어느 모드에서도 교정 조치가 이루어지지 않습니다. `off`, `observe` 중 하나. |
| `--child-heap-mode <mode>` | `observe` | `off`는 파티션을 비활성화합니다; `observe`은 생성(spawning)을 변경하지 않고 `limits.memory.childHeap`을 보고합니다; `admit`는 모델링된 동시 자식 수만 강제합니다. 실험적 옵트인 `enforce`은 관리되는 모든 ACP 자식에 고정 `perChildCeilingMb` 올 스페이스 상한을 부여하고 `limits.memory.enforced: true`을 보고합니다. 두 가지 어드미션 모드 모두 `acp_child_capacity_exhausted`로 거부하기 전에 하나의 자격 있는 유휴 ACP를 회수할 수 있습니다; 라이브 세션은 계속 보호됩니다. 등록은 자식 용량과 독립적입니다. 슬롯이 0개인 어드미션 구성은 시작 시 실패합니다. 고정 상속된 Node 힙 플래그는 `enforce`에서 정규화되며, 백분율 플래그는 충돌하여 거부됩니다. 상한은 올 스페이스를 제한하며, RSS나 MCP 하위 프로세스를 제한하지 않습니다. 활성화하기 전에 워크로드를 캘리브레이션하십시오; 거부 횟수가 0이라고 해서 힙 안전성이 증명되는 것은 아닙니다. 모드 및 예산 변경에는 데몬 재시작이 필요하며, 힙 강제를 롤백하려면 `admit`로 재시작하십시오. |
| `--event-ring-size <n>` | `8000` | 세션별 SSE 재생 링 깊이(#3803 §02 목표). `Last-Event-ID: N`을 사용하는 `GET /session/:id/events`에 사용할 수 있는 백로그를 설정합니다. 크게 설정하면 = 추가 RAM이 세션당 몇 hundred KB 증가하는 대신 재연결 여유 공간이 더 많아집니다. SDK 클라이언트는 특정 구독에 대해 `?maxQueued=N`를 통해 더 큰 구독자별 백로그 상한을 추가로 요청할 수 있습니다(범위 `[16, 2048]`, 기본값 256). 데몬은 또한 큐 채움률이 75%일 때 종단(non-terminal) `slow_client_warning` SSE 프레임을 방출하여 클라이언트가 퇴출되기 전에 드레인/재연결할 수 있도록 합니다. 사전 점검 `caps.features.slow_client_warning`. |
| `--compacted-replay-max-bytes <n>` | `4194304` | `POST /session/:id/load`가 반환하는 제한된 스냅샷에 포함된 보존된 재생 이벤트에 대한 라이브 세션별 바이트 상한. 이 상한은 `compactedReplay`에 적용됩니다; 현재 진행 중인 `liveJournal`는 `--max-journal-events` 및 `--max-journal-bytes`(적응형 성장이 높일 수 있는 기준선 상한 — `--max-journal-bytes` 참조)에 의해 별도로 상한이 적용됩니다. 값은 양의 안전한 정수여야 하며, 잘못된 값은 부팅 시 실패하고 하드 상한은 256 MiB입니다. 오래된 보존된 재생이 드롭되면 스냅샷은 `history_truncated`로 시작합니다. 이는 디스크상의 트랜스크립트를 제한하지 않습니다. |
| `--max-journal-events <n>` | `10000` | 현재 완료되지 않은 턴의 진행 중인 `liveJournal`에 보존되는 재생 항목에 대한 세션별 기준선 상한. 연속적인 호환되는 텍스트 또는 생각 청크는 항목을 공유하며, 항목당 최대 256개의 소스 이벤트를 포함합니다; 다른 이벤트 경계는 보존됩니다. 초과되면 데몬은 먼저 적응형 성장을 시도합니다(`--max-journal-bytes` 참조); 여유 공간이 허용되지 않거나 허용된 공간이 초과분을 커버하지 못하는 경우 가장 오래된 항목이 드롭되고 `history_truncated` 마커가 앞에 추가됩니다. 마커의 `truncatedEvents` 및 `retainedEvents` 수는 소스 이벤트를 설명합니다. 양의 안전한 정수여야 합니다. 이 플래그(또는 `--max-journal-bytes`)를 고정하면 적응형 성장이 비활성화됩니다. |
| `--max-journal-bytes <n>` | `8388608` | 진행 중인 `liveJournal`에 대한 세션별 기준선 바이트 상한으로, 호환되는 청크가 재생 항목을 공유하더라도 직렬화된 소스 이벤트 기준으로 계산됩니다. 턴이 상한을 초과하면 적응형 성장은 세션의 상한을 두 배까지 높이려 하지만(세션당 하드 상한 256 MiB, 남은 풀 여유 공간에 의해 제한됨), 데몬의 모든 라이브 세션에 걸쳐 허용된 성장은 데몬의 유효 메모리 예산의 5% 크기의 단일 공유 성장 풀에 맞아야 합니다 — 전달된 경우 `--memory-budget-mb` 값, 해석된 가용 메모리로 상한이 적용되며, 그렇지 않으면 자동 감지된 메모리의 50%(`--memory-budget-mb` 참조) — 상한 `1024` MB; `insufficientMemory`을 보고하는 호스트에서는 풀이 0이고 적응형 성장이 비활성화됩니다. 성장은 필요할 때에만 발생하며, 풀이 허용하는 범위 내에서만 발생합니다. 성장이 거부되거나, 풀이 고갈되거나, 허용된 공간이 초과분을 커버하지 못하는 경우 가장 오래된 항목이 통째로 드롭되지만(항상 최소 한 개의 항목은 유지됨), 따라서 보존된 꼬리는 상한보다 훨씬 작을 수 있습니다. 이 플래그(또는 `--max-journal-events`)를 고정하면 적응형 성장이 비활성화됩니다. 양의 안전한 정수여야 합니다. 기본값은 8 MiB입니다. |
| `--mcp-client-budget <n>` | — | 라이브 MCP 클라이언트에 대한 양의 정수 상한. `mcp_workspace_pool`이 광고될 때, 상한과 트랜스포트는 워크스페이스 런타임별로 공유됩니다; 태그가 없을 때, 레거시 세션별 관리자에서 이를 강제합니다. `--mcp-budget-mode`와 결합하십시오. 설정되지 않은 경우, 회계 기반 강제 처리는 없지만 `GET /workspace/mcp`은 여전히 `clientCount`을 보고합니다. claude-code의 `MCP_SERVER_CONNECTION_BATCH_SIZE`와 구별되며, 이는 총 라이브 클라이언트가 아닌 시작 시 동시성을 제어합니다. 사전 점검 `caps.features.mcp_guardrails` 및 `caps.features.mcp_workspace_pool`. |
| `--mcp-budget-mode <m>` | `warn` / `off` | `--mcp-client-budget`이 어떻게 강제되는지. `warn`(예산이 설정된 경우 기본값): 거부는 없으며, 예산의 ≥75%에서 스냅샷의 `budgets[0].status`가 `warning`로 전환됩니다. `enforce`: 상한을 초과하는 연결은 거부되며, 서버별 셀에는 `disabledReason: 'budget'`이 표시되고, `mcpServers` 선언 순서에 따라 결정적으로 동작합니다. `off`(예산이 설정되지 않은 경우 기본값): 순수 관측성. 부팅 시 예산 없이 `enforce`을 거부합니다. |
| `--external-tool-guard-mode <m>` | `off` | 관리되는 ACP 외부 사전 실행 정책. `off`는 제공자 호출을 하지 않으며 기능을 광고하지 않습니다. `required`은 호환되는 제공자가 v1 핸드셰이크를 완료하지 못하면 시작이 실패하며, 이후 단일 준비 요청이 허용되지 않는 한 지원되는 모든 상위 레벨 도구 호출을 닫힌 상태로 실패시킵니다. |
| `--external-tool-guard-endpoint <url>` | — | `required` 모드에서 사용되는 오리진 전용 루프백 HTTP(S) 제공자 URL, 예: `http://127.0.0.1:8787`. 경로, URL 자격 증명, 리디렉션, 비루프백 호스트 및 프록시 라우팅은 허용되지 않습니다. |
| `--external-tool-guard-timeout-ms <n>` | `3000` | 정수 `100..30000`; 시작 시 핸드셰이크와 각 prepare 요청에 독립적으로 적용됩니다. |
| `--http-bridge` | `true` | 1단계 모드: 프로덕션은 호환성을 위해 하나의 기본 `qwen --acp` 자식 프로세스를 미리 준비하고 실패 후 첫 사용 시 재시도하며, 신뢰할 수 있는 각 보조 프로세스는 필요 시 자식 프로세스를 하나 시작할 수 있습니다. 런타임을 대상으로 하는 세션은 ACP `newSession()`을 통해 해당 자식 프로세스로 멀티플렉싱되며, 신뢰할 수 없는 보조 프로세스는 ACP를 시작할 수 없습니다. 2단계의 네이티브 인프로세스(in-process) 기능은 이후 제공됩니다. |
| `--initialize-timeout-ms <n>` | `10000` | `initialize` 핸드셰이크를 포함하는 ACP 자식 프로세스 요청 시간 초과(ms). 양의 정수여야 하며 최대 `2147483647`까지 허용됩니다. JS 타이머 상한(`2^31-1`)을 초과하는 값은 Node가 이를 조용히 1ms로 압축하기 때문에 부팅 시 거부됩니다. 자식 프로세스 시작을 위해 추가 여유 시간이 필요한 컨테이너 환경에서는 이 값을 높일 수 있으며, 동일한 값이 `newSession`, 워크스페이스 상태 폴링 및 기타 ACP ext-method 기한에도 적용됩니다. |
| `--session-restore-timeout-ms <n>` | `60000` | 밀리초 단위의 ACP 세션 로드/재개 기한. 양의 정수여야 하며 최대 `2147483647`까지 허용되고, `0`은 유효하지 않습니다. 생략하면 기본값은 60초이며, 명시적으로 제공된 `--initialize-timeout-ms` 값이 더 클 경우 그 값으로 상향 조정됩니다. 더 짧은 initialize 시간 초과는 복원 예산을 낮추지 않습니다. SDK와 Web Shell은 각각 10초와 15초의 클라이언트 측 여유 시간을 추가합니다. 시간 초과 시 재시도 가능한 `504 session_restore_timeout`이 반환되며, 이는 데몬 자체가 종료되었음을 의미하지 않습니다. |
| `--allow-origin <pat>` | — | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). 브라우저 클라이언트를 위한 교차 출처 허용 목록. 반복 지정 가능. 각 값은 `*`(모든 출처 — 루프백 바인딩에서 베어러 토큰이 설정되지 않은 경우 부팅 거부됨; 비루프백 바인딩에서는 생성된 임시 토큰이 이러한 가드 조건을 충족하므로 거부는 루프백 전용임; 루프백에서 `--require-auth`을 권장하는데, 이는 기본적으로 루프백에서 사전 인증(pre-auth) 상태인 `/health`도 베어러 토큰으로 보호되도록 하기 위함입니다. Web Shell 정적 자산은 모든 모드에서 사전 인증 상태로 유지되므로, 이를 제거하려면 `--no-web`을 전달하십시오) 또는 정규화된 URL 출처(`<scheme>://<host>[:<port>]`, 슬래시 / 경로 / 사용자 정보 / 쿼리 문자열 없음)여야 합니다. 정규화된 **루프백** 출처는 포트에 `:*`을 사용할 수 있으며(`<scheme>://<loopback-host>:*`, 예: `http://127.0.0.1:*`), 이 경우 해당 호스트를 모든 포트에서 허용합니다. 베어러 토큰이 필수이고, 호스트가 정확히 일치해야 하며(`127.0.0.1`, `localhost`, `[::1]`은 별개의 항목입니다), REST CORS 매처와 WebSocket CSRF 게이트 모두에서 인식됩니다. 토큰이 없으면 HTTP(S) 출처는 루프백 바인딩에서 루프백이어야 하고, 비루프백 바인딩에서는 생성된 토큰이 동일한 가드 조건을 충족합니다. 원격 HTTP(S) 출처는 모든 API 라우트에서 베어러 토큰으로 인증합니다. 사전 인증 예외는 Web Shell 문서/자산 라우트, MCP 앱 샌드박스, 자체 `x-qwen-webhook-secret`으로 인증하는 채널 웹훅 수신부, 그리고 루프백 바인딩에서의 `/health`뿐입니다(다른 곳에서는 베어러 토큰으로 보호됨). 브라우저 확장 프로그램은 로컬에서 토큰 없이 접근할 수 있습니다. 호스트 및 서브도메인 와일드카드(`https://*.example.com`)는 의도적으로 지원되지 않으므로, 각 호스트를 명시적으로 나열하거나 설정된 토큰과 함께 `*`을 사용하십시오(완전한 보안을 위해 `--require-auth`도 함께 사용). 위의 루프백 포트 와일드카드만이 유일한 와일드카드 형식입니다. 일치하는 출처에는 CORS 응답 헤더(`Access-Control-Allow-Origin`, `Vary: Origin`, 메서드, 헤더, max-age 및 노출된 `Retry-After`)가 포함되며, 일치하지 않는 출처에는 현재 방화벽과 동일한 엔벨로프로 403 오류가 반환됩니다. `Origin: null`(샌드박스 iframe, file:// 문서)은 `*` 하에서도 항상 거부됩니다. `caps.features.allow_origin`을 통한 사전 처리(preflight). 루프백 자기 출처(self-origin) 요청은 영향을 받지 않습니다. |
| `--web` / `--no-web` | `true` | 빌드된 Web Shell SPA를 데몬 루트(`GET /`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` 및 `GET /session/<id>` 문서 내비게이션)에서 제공합니다. 이러한 진입점은 베어러 인증 게이트 **이전에** 등록됩니다. 브라우저는 `<script>` 하위 리소스나 주소 표시줄 내비게이션에 토큰을 첨부할 수 없으며, 셸에는 비밀 정보가 포함되어 있지 않기 때문입니다. API 요청은 데몬의 일반적인 권한 정책을 따릅니다. 설정된 토큰은 `--require-auth`이 설정되지 않은 한 루프백 `/health`을 제외한 일반 API 라우트를 제한하며, 채널 웹훅 수신부는 항상 자체 공유 비밀 키를 사용하고, 토큰이 없는 신뢰된 루프백 기본 리스너는 전체 운영자 접근 권한을 가집니다. 다른 모든 경로에 대한 SPA 딥 링크 폴백은 베어러 미들웨어 뒤에 위치합니다. 비루프백 바인딩에서는 UI가 인증 없이도 접근 가능함을 알리는 한 줄의 stderr 경고가 표시됩니다. API 전용 데몬을 사용하려면 `--no-web`을 사용하십시오. 빌드에서 Web Shell 자산이 누락된 경우 효과가 없습니다(데몬은 브레드크럼을 기록하고 API 전용으로 실행됩니다). |
| `--open` | `false` | 리스너가 시작된 후, 데몬 URL에서 기본 브라우저로 Web Shell을 엽니다(토큰이 해석되면 — 설정된 토큰이거나 생성된 토큰 — `#token=`가 URL 조각(fragment)으로 추가됩니다. 조각은 서버로 전송되지 않으므로 접근 로그와 Referer 헤더에서 토큰을 제외합니다). `--no-web`과 함께 사용하거나, 브라우저를 사용할 수 없는 헤드리스(headless) / CI / SSH 환경에서는 아무 작업도 수행하지 않습니다. |
| `--open-with-auth` | `false` | 루프백에서 베어러 인증으로 Web Shell을 엽니다. 활성화된 Web Shell과 빌드된 자산이 필요합니다. 설정된 토큰을 재사용하거나 프로세스 수명 동안 유효한 256비트 베어러 토큰을 생성하여 Web Shell 조각으로 전달합니다. 브라우저 자격이 없는 환경에서는 비밀이 포함된 수동 URL을 출력합니다. 다른 클라이언트는 동일하게 명시적으로 설정된 공유 토큰을 대신 사용해야 합니다. |

> **메모리 프로젝트 범위 주의 사항.**
>
> - **데몬 대 독립형 CLI.** 플래그 또는 데몬 실행 환경은 해당 데몬이 소유한 모든 런타임에 대해 하나의 고정된 범위를 설정합니다. 워크스페이스 `.env` 또는 `settings.env`은 등록된 특정 워크스페이스에 대해 이를 재정의할 수 없습니다. 독립형 `qwen` TUI는 여전히 git-root 범위를 기본값으로 사용하므로; 두 진입점을 일관되게 유지하려면 이를 실행하는 셸 또는 서비스 환경에서 `QWEN_CODE_MEMORY_PROJECT_SCOPE`를 내보내세요.
> - **디렉터리 이름 충돌.** 저장소 키는 `sanitizeCwd`에 의해 파생되며, 이는 모든 비알파벳 숫자 문자를 `-`로 대체합니다. 구두점만으로 다른 형제 디렉터리(예: `feature_1` 및 `feature-1`)는 `workspace` 범위에서도 동일한 메모리 디렉터리에 매핑됩니다. 워크스페이스 격리에 의존할 경우 이러한 명명을 피하세요.
> - **플래그와 환경 변수 간 정규화 차이.** 환경 변수는 공백이 제거되고 소문자로 변환됩니다(`"  Workspace  "` 작동); CLI 플래그는 yargs `choices`에 의해 대소문자를 구분하여 일치됩니다(`--memory-project-scope Workspace` 거부됨). 두 값 사이를 복사할 때는 소문자 값을 사용하세요.

### 내장 데몬 Git 이동 가드

모든 관리되는 데몬 ACP 세션은 `--external-tool-guard-mode`과 무관하게 그리고 어떠한 기능 광고 없이 모델 셸 명령어에 대한 내장 사전 실행 가드를 적용합니다. 데몬은 바인딩된 워크스페이스와 세션의 현재 유효 작업 디렉터리를 소유하며; 둘 다 신뢰할 수 있는 세션 상태에서 공급되며 ACP 하위 프로세스로부터 절대 허용되지 않습니다.

가드는 셸 명령어를 실행하는 도구, 즉 `run_shell_command`과 `monitor`을 검사하며, 저장소 위치가 세션의 유효 작업 디렉터리 외부로 해석되는 경우 변경(mutating) Git 명령어는 실행 전에 거부됩니다. 재배치(relocation)는 `git -C <path>`, `git --git-dir[=]<path>`, `git --work-tree[=]<path>`의 리터럴 형식, 선행 `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` 할당(`export`/`declare`/`readonly`을 통해 이루어져 체인 내 후속 모든 명령어의 환경에 유지되는 경우 포함), 디렉터리 이동 래퍼 플래그(`env -C`, `sudo -D`), 그리고 동일한 명령어 체인 앞부분의 `cd`, `pushd` 또는 `popd` 빌트인을 인식합니다. 일반적인 래퍼 접두사(`sh -c`, `bash -c`, `eval`, `sudo`, `nohup`, `timeout`, `exec`, `command`, `builtin`, `env`, 경로가 지정된 `git` 바이너리 및 `{ …; }` / `! …` 셸 구문)는 언래핑(unwrapped)되어 내부 Git 호출에도 동일한 정책이 적용되며, `$(…)` 또는 백틱 치환 본문은 독립적인 명령어로 분석됩니다.

자체 워크트리에 고정된 하위 에이전트는 세션의 디렉터리가 아닌 해당 워크트리로 제한되며, 데몬이 실행 디렉터리를 식별할 수 없는 셸 호출은 거부됩니다.

상대 경로는 정규화(canonical path resolution)를 거친 후 명령어의 유효 시작 디렉터리(`arguments.directory`이 존재하면 이를 따르고, 없으면 세션의 현재 유효 작업 디렉터리) 기준으로 해석되며, 여기에는 `.git` gitfile 리디렉션, 심볼릭 링크 및 워크트리별 관리 디렉터리가 포함됩니다. 실행 전에 완전히 해석할 수 없는 재배치 대상(동적 대상(`$VAR`, 백틱, `~`, 글롭), 아직 존재하지 않는 경로 또는 읽을 수 없는 간접 참조)은 변경(mutating) 또는 분류 불가능한 하위 명령어에 대해 거부됩니다. 해석할 수 없는 재배치 대상은 하위 명령어가 무엇이든(읽기 전용 포함) 거부됩니다. 하위 명령어가 검증된 소규모 읽기 전용 집합(`rev-parse`, `cat-file`) 중 하나인 재배치 명령어는 대상이 해석되면 허용되지만, 명령어에 명령 실행 `-c` 설정이 있거나 `--output`, `--textconv` 또는 `--filters` 플래그가 포함된 경우는 제외됩니다. 이러한 플래그는 파일을 쓰거나 대상 저장소에 구성된 드라이버를 실행하기 때문입니다. 인식 가능한 재배치가 없는 명령어는 기존 동작을 유지합니다. 거부는 최종적이며, 모델에게는 해석되었거나 동적이거나 해석 불가능한 저장소 위치에 대해 `Daemon shell guard denied a mutating Git command…`로 보고되고, 명령어 파싱 실패, 페이로드 해석 실패 또는 미확인 프로그램이 재배치된 Git 명령어를 실행할 수 있는 경우에는 `Daemon shell guard denied a shell command…`로 보고됩니다.

가드는 위에서 언급한 리터럴 형식의 Git 재배치, 즉 이 통제가 존재하는 목적의 오조준(mis-targeted) 명령어에 대해서는 신뢰할 수 있지만, 가드를 우회하도록 작성된 셸 텍스트에 대해서는 **최선의 노력(best-effort)일 뿐 경계(boundary)가 아닙니다**. 정적 리더에게서 재배치를 숨기는 구조는 통과될 수 있으며, 새로운 구조는 계속 발견될 것입니다. 가드의 신뢰성을 근거로 데몬에 더 넓은 권한을 부여하지 마십시오. 가드는 스크립트 파일을 해석하지 않고, 명령어 간 환경 변수 값을 추적하지 않으며, 히어도크(heredoc) 본문을 분석하지 않습니다(셸이 실제로 실행하지 않더라도 히어도크 내의 Git 형식 텍스트는 거부될 수 있습니다). `/fork` 및 에이전트 기반 작업 공간 메모리 remember/dream은 내장 가드 아래에서 계속 사용할 수 있으며, 아래 설명된 외부 제공자 모드가 활성화된 동안에만 제한됩니다. 선택적 외부 도구 가드는 추가 정책으로 남아 있으며, 내장 정책이 허용한 후에만 동일한 요청을 받습니다.

### 타임아웃, 취소, 전송 실패, 잘못된 형식 또는 불일치하는 응답, 명시적 거부는 실행자가 실행되는 것을 방지합니다.

이 옵트인은 최종 도구 실행자(executor) 경계에서 외부 허용/거부 결정이 필요한 관리형 ACP 배포를 위한 것입니다. `--external-tool-guard-mode=required`이 존재하지 않으면 완전히 비활성 상태(dark)입니다:

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

제공자는 `POST /v1/handshake`과 `POST /v1/prepare`을 노출하고, `Authorization: Bearer <token>`을 요구하며, JSON을 반환하고, 공급된 논스(nonce) 또는 요청 ID를 에코(echo)해야 하며, 프로토콜 버전 `1`을 사용해야 합니다. 토큰은 공백이 아니어야 하고, 최대 8192개의 UTF-16 코드 단위여야 하며, 제어 문자를 포함해서는 안 됩니다. 요청은 1 MiB, 응답은 64 KiB로 제한되며, 선택적 거부 이유는 제어 문자 없이 500개의 UTF-16 코드 단위로 제한됩니다. 성공적인 prepare 응답은 다음과 같습니다:

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

거부는 `allowed:false`을 사용하며 짧은 `reason`을 추가할 수 있습니다. 기존 권한 및 `PreToolUse` 게이트를 통과하여 최종 실행 경계에 도달하는 각 지원되는 최상위 도구 호출에 대해 Qwen Code는 하나의 prepare 요청을 보내며 절대 재시도하지 않습니다. 이전 단계의 권한/훅(hook) 거부 시에는 prepare 요청이 전송되지 않습니다. 시간 초과, 취소, 전송 실패, 잘못된 형식 또는 불일치하는 응답, 명시적 거부는 실행자가 실행되는 것을 방지합니다. 각 생성된 ACP 채널은 필수 콜백(callback) 설치를 확인해야 하며, 누락되거나 호환되지 않는 확인은 세션 생성 전 채널을 거부합니다. 제공자 요청에는 `sessionId`, `promptId`, `toolCallId`, 정규화된 `toolName` 및 최종 `arguments`이 포함되며; `toolCallId`은 상관 관계(correlation) 레이블일 뿐 인증 신원이나 독립적인 멱등성 키가 아닙니다.

최종 인수는 민감한 애플리케이션 데이터를 포함할 수 있습니다. 제공자 로그 및 감사 저장소에서 이를 민감하게 취급하십시오.

`PreToolUse` 훅(hooks)은 이 최종 실행자 결정보다 먼저 실행됩니다. 필수 가드 모드(Guard mode)는 훅 동작을 승인하거나 샌드박스 처리하지 않습니다; 모든 가능한 부작용(side effect)에 대한 경계가 필요한 배포에서는 훅을 비활성화하거나 구현을 별도로 통제해야 합니다.

슬래시 명령 작업도 모델/도구 스케줄링 전에 실행되며 Guard 호출이 아닙니다. 일부 내장 명령은 파일이나 설정을 직접 변경할 수 있습니다. 모든 효과에 대한 경계가 필요한 관리형 배포 환경에서는 슬래시 명령 입력을 거부하거나 `slashCommands.disabled` 또는 `--disabled-slash-commands`을 통해 승인되지 않은 모든 명령을 비활성화해야 합니다.

v1 관리 범위는 활성 전경(foreground) 관리 프롬프트가 호출하는 최상위 도구입니다. 필수 모드가 활성화된 동안 중첩되거나 위임하는 `agent`, `workflow`, `create_sub_session`, `send_message`, 직접 `/fork` 및 에이전트 기반 워크스페이스 메모리 remember/dream 제어는 거부됩니다. 최상위 백그라운드 셸 또는 모니터 시작은 여전히 하나의 보호된 호출이며 최종 인수가 제공자에게 전달되지만, 이 기능은 프로세스를 지속적으로 인증하지 않으며 프로세스 완료 감사 프로토콜을 추가하지 않습니다. 전경 완료를 요구하는 정책은 해당 형태를 거부해야 합니다. 보호된 MCP 호출은 전송 오류 후 자동 재연결/재전송도 비활성화합니다. 성공적인 시작 핸드셰이크 후, `/capabilities`은 `external_tool_guard`을 광고하며; 이것이 없으면 클라이언트는 강제 적용을 가정해서는 안 됩니다.

이 기능은 명시적인 데몬 REST/ACP 관리 호출을 인증하지 않으며; 이러한 호출은 데몬의 기존 인증 및 라우팅 계약을 계속 사용합니다. 또한 허용된 도구 또는 셸 명령을 결정론적으로 만들거나 내부 동작을 샌드박스 처리하지 않습니다; 관리형 배포 환경에서는 제공자 결정을 일반적인 도구 정책 및 격리 경계와 결합해야 합니다.

> **부하 조정 매개변수 크기 설정.** `--max-sessions`은 워크스페이스별 새 세션 상한입니다. `--max-total-sessions`은 데몬 전체의 새 세션 상한이며; 생략 시 기본 등록 용량인 256일 때 800으로 기본값이 설정됩니다. 다른 세 계층도 부하를 제한하므로 — 높은 동시성 배포 환경을 위해 크기를 조정할 때는 함께 튜닝하십시오:
>
> - **리스너 수준**: `--max-connections` / `server.maxConnections=256`은 원시 TCP 연결을 제한합니다(느린 클라이언트 백프레셔).
> - **세션별 구독자**: EventBus는 기본적으로 세션당 SSE 구독자를 64명으로 제한합니다; 65번째 클라이언트는 종료 `stream_error`을 받고 닫힙니다.
> - **세션별 프롬프트 수용**: `--max-pending-prompts-per-session=5`은 하나의 세션에 대해 대기 중 + 활성 프롬프트의 수용 한계를 제한합니다. 초과 시 `503`과 `Retry-After: 5`가 발생합니다.
> - **데몬 전체 새 세션**: `--max-total-sessions=N`은 데몬 전체에서 새 세션 생성을 제한합니다. 초과 시 `scope: "total"`와 함께 동일한 `session_limit_exceeded` 형태가 발생합니다.
> - **구독자별 백로그**: SSE 클라이언트당 256프레임 큐; 용량을 초과한 클라이언트는 종료 `client_evicted` 프레임을 받고 닫힙니다(느린 소비자 하나가 데몬을 고정시킬 수 없습니다).
>
> 이러한 상한은 상호작용합니다: 각 런타임은 `--max-sessions`에 의해 제한되며, `--max-total-sessions`은 이들의 총합을 제한합니다. 유효한 세션 상한은 유한한 데몬 전체 상한과 유한한 런타임별 총합 상한 중 더 낮은 값입니다(워크스페이스별 상한이 무제한이면 해당 총합을 무제한으로 취급하십시오). 둘 다 유한하지 않은 경우 — 기본 등록 용량에서 `--max-total-sessions 0`가 필요함 — 유한한 세션 상한이 없습니다. 유한한 상한 × 64명 구독자 × 256프레임은 EventBus 계층에서의 최악의 경우 인메모리 사용량입니다; 이를 `--max-pending-prompts-per-session`로 곱하면 수용 계층에서의 허용된 프롬프트 작업량이 제한됩니다. 기본 크기 조정은 단일 사용자/소규모 팀 부하를 가정합니다; 더 큰 배포 환경에서는 점진적으로 높이고(RSS 모니터링) 조정하십시오.

> **MCP 클라이언트 가드레일(이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** `mcpServers`에 30개의 MCP 서버를 선언하는 워크스페이스는 상한을 설정하지 않으면 30개의 클라이언트를 제한 없이 시작합니다. `--mcp-client-budget=N`은 라이브 MCP 클라이언트 수를 제한합니다; `--mcp-budget-mode={enforce,warn,off}`가 동작을 선택합니다. 기본값은 예산이 설정되면 `warn`입니다(스냅샷이 경고를 표시하지만 클라이언트는 거부되지 않음 — 집행을 전환하기 전에 실제 세계 팬아웃을 측정하는 데 유용). `enforce` 모드에서 거부된 서버는 서버별 셀에 `disabledReason: 'budget'`를 얻고 `budgets[0]` 셀은 `status: 'error'` + `errorKind: 'budget_exhausted'`를 표시합니다. 슬롯 예약은 서버 이름으로 이루어지며 재연결 / 검색 타임아웃에서도 유지됩니다 — 거부된 서버는 건강한 서버로부터 슬롯을 빼앗을 수 없습니다.
>
> **현재 범위는 기능 기반입니다.** `mcp_workspace_pool`이 존재하면 하나의 워크스페이스 런타임의 모든 세션이 해당 MCP 전송 풀과 예산 컨트롤러를 공유합니다; `GET /workspace/mcp`은 `scope: 'workspace'`를 출력합니다. 두 번째 워크스페이스는 독립 풀과 예산을 가집니다. 태그가 없으면(`QWEN_SERVE_NO_MCP_POOL=1` 포함), 데몬은 레거시 세션별 `McpClientManager`를 사용하고 `scope: 'session'`을 출력합니다; 해당 폴백에서 N개의 세션이 각각 구성된 상한을 소비할 수 있습니다.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> 이는 claude-code의 `MCP_SERVER_CONNECTION_BATCH_SIZE`(시작 동시성을 게이트함)과는 **다릅니다**. 이들은 직교합니다. 클라이언트는 `mcp_workspace_pool` 기준으로 분기해야 하며 프로토콜 버전만으로 범위를 가정해서는 안 됩니다.
>
> **푸시 이벤트(이슈 [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** `GET /session/:id/events`를 구독하는 SDK 클라이언트는 예산 임계값이 교차할 때 타입화된 프레임을 받습니다 — `mcp_budget_warning`(합성, 75% 상승 교차당 한 번 발생하며 37.5%에서 히스테리시스 리암, `mcp_guardrail_events`를 통해 광고) 및 `mcp_child_refused_batch`(`enforce` 모드에서 검색 패스당 한 번 병합; `readResource` lazy-spawn 거부에서 길이-1). `GET /workspace/mcp`의 스냅샷은 여전히 재연결 후 상태의 진실 원천입니다; 이벤트는 변화 엣지입니다. 폴링 없이 실시간으로 대시보딩할 때 유용합니다.

## 기본 배포 위협 모델 [#default-deployment-threat-model]

- **루프백만** — `127.0.0.0/8`, `localhost` 또는 `::1`; 인증 불필요.
- **`localhost`는 한 번 해석되고 고정된 후 리스닝 후 검증됩니다** — 실제 리스너 주소가 `127.0.0.0/8` 또는 `::1` 밖이면 토큰 없는 시작이 리스너를 닫고 실패합니다.
- **`--hostname 0.0.0.0`에는 토큰이 필요합니다** — 두 토큰 소스가 모두 제공되지 않으면 하나가 생성됩니다. 명시적으로 빈 소스는 여전히 폐쇄적으로 실패합니다.
- **`LOOPBACK_BINDS`는 IPv6 포함** — `::1`과 `[::1]`은 토큰 없음 규칙에 대해 루프백으로 카운트.
- **Host 헤더 허용 목록** — **루프백** 바인드에서 데몬은 DNS 리바인딩으로부터 방어하기 위해 `Host:`가 `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` 또는 정확히 바인딩된 루프백 주소와 포트와 일치하는지 확인합니다(RFC 7230 §5.4에 따라 대소문자 구분 없음). 포트 80 또는 443에서 리스닝할 때는 브라우저가 스킴 기본 포트를 생략하므로 포트 없는 형태도 허용됩니다. 이것은 관련 없는 Host를 수용하지 않으면서 완전한 IPv4 루프백 범위(`127.0.0.0/8`)를 지원합니다. **비루프백 바인드(`--hostname 0.0.0.0`)는 의도적으로 Host 허용 목록을 우회합니다** — 운영자가 표면적을 선택했으므로 베어러 토큰 게이트가 일반 API 라우트의 유일한 인증 레이어입니다; 리버스 프록시 / SNI / 클라이언트 인증서 핀ning은 데몬이 아닌 운영자의 책임입니다. 비루프백 바인드에서 Host 기반 격리가 필요하면 프론트 프록시에서 TLS를 종료하고 Host를 확인하세요.
- **CORS는 기본적으로 모든 브라우저 Origin을 거부**하며 `403` JSON을 반환합니다. 특정 브라우저 origins를 허용하려면 **`--allow-origin <pattern>`**(반복 가능, T2.4 #4514) 옵션을 사용하세요. 각 값은 리터럴 `*`(모든 origin — **loopback** 바인딩에서는 베어러 토큰이 구성되지 않으면 부팅이 거부되지만, 비-loopback 바인딩은 토큰 생성으로 인해 공급되어 부팅됩니다; `--require-auth` on loopback은 `/health`가 기본적으로 loopback에서 사전 인증 상태이므로 완전한 강화를 위해 권장됩니다 — Web Shell 정적 자산(`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` 및 `/settings` 문서 탐색)은 모든 모드에서 베어러보다 먼저 마운트되며 `--require-auth` 하에서도 사전 인증 상태로 유지되므로, 잔여 브라우저 표면이 중요한 경우 `--no-web`을 사용하세요) 또는 정규화된 URL origin(`<scheme>://<host>[:<port>]`, 후행 슬래시/경로/userinfo 없음) 중 하나입니다. Loopback 호스트는 대신 포트 와일드카드(`<scheme>://<loopback-host>:*`)를 사용할 수 있습니다. 이는 구성된 베어러 토큰을 요구하며(없으면 부팅 거부), 스킴과 호스트가 정확히 일치해야 하고(`127.0.0.1`, `localhost`, `[::1]`은 별개의 항목임), REST 전용 `*`을 제외한 유일한 와일드카드 형식입니다. 토큰이 없는 **loopback** 바인딩에서는 HTTP(S) 항목이 loopback 호스트를 사용해야 합니다. 비-loopback 바인딩에는 항상 토큰이 포함됩니다(공급되거나 생성됨). 원격으로 호스팅된 브라우저 origins가 데몬 사용자로서 연산자 API를 통해 코드를 실행할 수 있기 때문입니다. 명시적인 브라우저 확장 origins는 토큰 없는 로컬 자동화 경로를 유지합니다. 매칭된 origins는 적절한 CORS 응답 헤더(`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, 표준 메서드/헤더/max-age 및 노출된 `Retry-After` 포함)를 받습니다. 매칭되지 않은 origins는 기본 차단벽과 동일한 엔벨로프로 403을 계속 받습니다. `caps.features.allow_origin`은 조건부로 광고되므로 SDK/webui 클라이언트는 교차 출처 요청을 발행하기 전에 데몬이 이를 수용하는지 사전 확인할 수 있습니다. 예: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Loopback 자체-origin 요청(예: Web Shell UI)은 영향을 받지 않습니다. 별도 Origin-제거 shim이 `--allow-origin`와 관계없이 이를 처리합니다. 내장 원격 Web Shell의 동일 출처 **HTTP** 요청도 `--allow-origin` 없이 작동합니다. 비-loopback 주요 리스너에서 `Origin`이 직접 소켓 스킴과 정규화된 `Host` 권한과 같으면 베어러 인증 후 CORS 차단벽 앞에서 제거되며, 기존 공개 정적 라우트는 인증되지 않은 상태로 유지됩니다. 두 가지 제외 사항은 여전히 `--allow-origin`이 필요합니다. 전달된 헤더는 절대 동일 출처 신뢰를 확립하지 않으므로 TLS 종료 리버스 프록시의 `https` 브라우저 origin은 동일 출처가 아니며(`Host` 헤더를 재작성하는 평문 HTTP 중간자도 동일 출처가 아님. 예: nginx의 기본 `proxy_set_header Host $proxy_host` 또는 k8s Ingress. 해결책은 브라우저가 보는 origin에 대해 `--allow-origin <origin>`을 설정하거나 `Host`을 원본 그대로 전달하는 프록시를 사용하는 것입니다. 포트 변환만으로는 아무것도 필요하지 않습니다. 비교되는 것은 전달된 `Host`뿐이며, 스킴 기본값 `:80`/`:443`만 제거되기 때문입니다.) 그리고 WebSocket 업그레이드 라우트(터미널, 음성)는 별도 CSWSH 게이트를 유지하며, 동일 포트 loopback origins, 명시적으로 허용 목록에 포함된 origins(loopback 포트 와일드카드 포함) 및 Local Control 리스너 자체의 origin만 허용합니다. `*` 리터럴은 여기에는 적용되지 않습니다.
- **Chrome 확장 브라우저 자동화는 프레이밍과 분리됩니다.** `qwen serve --allow-origin chrome-extension://<id>`는 확장이 Web Shell을 프레이밍하고 데몬에 연결할 수 있도록 합니다. 콘솔/네트워크/스크린샷/클릭 도구는 외부 CDP MCP 어댑터 명령어가 필요합니다: `QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`. 메인 CLI 패키지는 브라우저 자동화 어댑터를 번들하지 않습니다; 클라이언트는 해당 도구를 사용 가능으로 표시하기 전에 `caps.features.includes('browser_automation_mcp')`를 확인할 수 있습니다.
- **생성된 `qwen --acp` 자식은 소유 런타임의 유효 환경을 상속받습니다.** 데몬은 프로세스 환경 기반을 고정하고 해당 워크스페이스의 settings/env-file 오버레이를 런타임 로컬 스냅샷에 적용하며, 오버레이를 `process.env`에 다시 쓰지 않습니다. 다른 런타임의 동일 이름 키는 상호 간섭하지 않습니다. 에이전트가 데몬 베어러를 필요로 하지 않으므로 생성 전 `QWEN_SERVER_TOKEN`은 제거됩니다. 로더에 영향을 미치는 변수들(`NODE_OPTIONS`, `npm_config_node_options` 및 npm의 config-file 리디렉션, `NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`, export된 bash 함수 정의 `BASH_FUNC_*`) 역시 세션 하위 프로세스로 전달되지 않습니다. 데몬은 자신의 `process.env`과 세션을 호스팅하는 자식이 생성될 때 사용하는 고정된 기반 환경에서 이를 제거합니다(기반 환경은 `DEV=true` 하네스 아래에서만 이를 유지하며, 해당 `.ts` 항목들은 여전히 tsx 로더가 필요합니다). 또한 `.env` / `settings.json` `env` 소스는 이를 거부합니다([settings](./configuration/settings.md) 참조). 이 규칙은 데몬이 호스팅하는 모든 세션에 적용됩니다. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*`, `DASHSCOPE_API_KEY` 등의 기본 자격 증명은 런타임 오버레이가 변경하지 않는 한 그대로 통과됩니다. **이는 의도된 동작이며 샌드박스가 아닙니다.** 에이전트는 셸 도구 접근 권한이 있는 동일한 UID로 실행되므로 `~/.bashrc`, `~/.aws/credentials` 또는 `~/.npmrc`의 내용은 프롬프트 인젝션에 의해 어쨌든 도달 가능합니다. 런타임 간 환경 격리는 운영 체제 보안 경계가 아닙니다. 에이전트를 신뢰할 수 없는 자격 증명을 가진 ID로 `qwen serve`을 실행하지 마세요.
- **에이전트 텍스트 읽기는 자식 로컬이며 일반 CLI 권한 규칙을 따릅니다, 워크스페이스 파일시스템 경계가 아닙니다.** 직접 `read_file`은 등록된 모든 워크스페이스 외부의 호스트 텍스트 경로에 도달할 수 있습니다: 외부 경로는 기본적으로 확인을 요구하며, 허용 규칙이나 승인 모드가 자동으로 승인할 수 있습니다. 승인된 읽기는 워크스페이스 파일시스템의 반환 출력, 전체 스냅샷 및 대규모 텍스트 스캔 상한이 아닌 구성 가능한 CLI 출력 제한을 사용합니다. 이것은 모든 공유 텍스트 읽기 소비자에 적용되므로 쓰기, 편집, 노트북, sed 및 아티팩트 작업이 수행하는 사전 읽기는 워크스페이스 파일시스템의 읽기 감사, 심볼릭 링크 거부 및 읽기 측 TOCTOU 보호와 함께 해당 상한을 잃습니다 — 정확한 목록은 [디자인 문서](../design/daemon-local-text-reads.md)를 참조하세요. 확인 페이로드는 파일을 읽어 생성되므로 워크스페이스 외부 diff는 누군가 승인하기 전에 **모든** 연결된 SSE 구독자에게 팬아웃됩니다 — 대화형 CLI에서 해당 내용은 터미널의 사람만 봅니다. 인증된 데몬 클라이언트를 동일한 보안 주체로 취급하세요. HTTP 파일시스템 라우트는 여전히 워크스페이스 범위이며 에이전트 검색 도구 동작은 변경되지 않습니다.
- **내장 텍스트 도구의 승인된 최종 쓰기는 좁은 범위의 동일 호스트 경로를 가집니다.** `write_file`, `edit`, `notebook_edit` 및 셸 도구의 시뮬레이션된 sed 편집기는 기존 권한 정책이 실행을 허용한 후에만 내부 출처(provenance)를 첨부합니다. 따라서 최종 ACP 텍스트 쓰기는 두 번째 확인 없이 소유 워크스페이스 외부의 절대 경로를 대상으로 할 수 있습니다. allow 규칙, AUTO/AUTO_EDIT 및 YOLO는 CLI와 동일하게 작동하지만, 거부, Plan, Hook/Guard 거절 및 실행 전 취소는 최종 쓰기를 전송하지 않습니다. 도구가 이미 취소 불가능한 파일 시스템 작업에 들어간 후 취소되면 해당 도구의 기존 동작이 유지됩니다. 워크스페이스 대상은 여전히 WFS를 사용합니다. 외부 대상은 동일한 신뢰 스냅샷, 5 MiB 인코딩 제한, 리프 심볼릭 링크 거부, 정규화된 경로 잠금, 원자적 이름 변경, 모드 보존, 기본 `0600` 새 파일 모드(구성 가능 — [New-file mode for agent text writes](#new-file-mode-for-agent-text-writes) 참조), 생성 가드 및 파일 시스템 감사를 사용하는 데몬 호스트 작성자를 사용합니다. HTTP 쓰기, 일반적이거나 표시되지 않은 ACP 쓰기, 주입된 bridge/workspace-registry/factory 통합 및 임의의 셸 리디렉션은 이 예외를 받지 않습니다. [the external-write design](../design/daemon-external-tool-text-writes.md)을 참조하세요.
- **구독자별 제한된 SSE 큐** — 큐를 오버플로하는 느린 클라이언트는 `client_evicted` 터미널 프레임을 받고 닫힙니다; 하나의 멈춘 소비자가 데몬을 고정할 수 없습니다.
- **세션당 프롬프트 수용 상한** — 세션당 기본 5개의 수락되었지만 미정착 프롬프트. 버그가 있는 클라이언트는 하나의 세션에 대해 무제한 프롬프트 promise 또는 임시 SSE 대기를 큐에 넣을 수 없습니다.
- **우아한 종료** — SIGINT/SIGTERM은 리스너를 닫기 전에 에이전트 자식을 드레인합니다(자식당 10초 마감).

> ⚠️ **권한 투표는 이제 세션 범위입니다 — 상시 공유 베어러 주의사항 포함.** `POST /session/:id/permission/:requestId`(Wave 4 / F3)을 선호하세요. 이는 지정된 라이브 세션을 소유한 런타임으로 라우팅되며 주요 브리지로 폴백하지 않습니다. 새로운 다중 워크스페이스 통합은 항상 이 경로를 사용해야 합니다(사전 확인 `caps.features.session_permission_vote`). 레거시 프로세스 전역 `POST /permission/:requestId`는 pre-F3 단일 워크스페이스 클라이언트를 위해 남아 있습니다. 이는 주요 바운드이며 다른 등록된 런타임이 소유한 세션에 대해 `404`을 발생시킵니다(기본 `first-responder` 정책 하에서 손실된 투표와 동일한 본문). 따라서 이 경우의 `404` 자체가 요청이 이미 응답되었음을 의미하지는 않습니다. 라우트 테이블: [daemon REST API reference](../developers/daemon-rest-api-reference.md#permissions). 상시 주의사항: 베어러 토큰을 보유한 모든 클라이언트는 동일한 보안 주체입니다. 신뢰할 수 없는 당사자와 공유되는 베어러 뒤에 `qwen serve`을 실행하지 마세요.
>
> ⚠️ **Stage 1 알려진 문제 — `POST /session/:id/prompt` 본문은 10 MB로 제한됨 (BUy4L).** 이미지 / PDF / 오디오가 포함된 멀티모달 프롬프트가 10 MB를 초과하면 라우팅 로직 실행 전 본문 파싱 단계에서 실패합니다(스트리밍 없음, 업로드 중 중단 없음). 해결 방법: 클라이언트 측에서 콘텐츠를 축소하거나 경로 참조를 전달하여 에이전트가 `readTextFile`을 통해 파일을 읽도록 하세요. Stage 1.5에서는 `/prompt`에서 `multipart/form-data` 또는 청크 인코딩을 허용하므로 큰 프롬프트가 한계에 부딪히지 않습니다.
>
> ⚠️ **Stage 1 알려진 결함 — NAT 뒤의 유령 SSE 연결.** 데몬은 하트비트(15초 간격)에 대한 TCP 백프레셔를 통해 죽은 클라이언트를 감지합니다. TCP RST 없이 사라지는 클라이언트(예: 유휴 흐름을 조용히 드롭하는 NAT 장비)는 Node의 keepalive 프로브가 타임아웃될 때까지 커널 수준 소켓을 "살아있는" 상태로 유지합니다 — 일반적으로 Linux 기본값에서 약 2시간. 이러한 NAT 뒤에 있는 `--hostname 0.0.0.0` 배포 환경에서는 유령 SSE 연결이 누적되어 결국 256 `server.maxConnections` 상한에 도달할 수 있습니다.
>
> [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout) (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)을 설정하여 명시적인 애플리케이션 수준 유휴 마감 기한으로 결함을 해결하십시오: `n` ms 동안 성공적인 플러시가 없으면 데몬은 `reason: 'writer_idle_timeout'`와 함께 종료 `client_evicted` 프레임을 방출하고 스트림을 닫습니다. 레거시 계약을 보존하기 위해 이 플래그는 기본적으로 꺼져 있습니다 — RST를 삼키는 네트워크의 운영자는 합법적인 유휴 연결이 제거되지 않으면서 실제로 막힌 작성자가 즉시 회수되도록 15초 하트비트 간격보다 훨씬 높은 값(예: `60000`–`300000`)을 선택해야 합니다. 데몬이 이를 지원하는지 확인하려면 SDK에서 `caps.features.includes('writer_idle_timeout')`을 사전 확인하십시오.

### 마감 및 writer 유휴 타임아웃 [#deadlines-and-writer-idle-timeout]

이슈 [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9는 15초 하트비트 + AbortSignal이 커버하지 않는 장기 실행 / 원격 배포 격차를 닫는 두 개의 옵트인 플래그를 제공합니다. 공유 권한 응답 타임아웃도 여기에 표시됩니다. 세 개 모두 기본값이 꺼져 있습니다.

| 플래그                         | 환경 변수                            | 기본값 | 수행 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | unset   | 단일 `POST /session/:id/prompt`에 대한 서버 측 벽시계 상한. 만료 시 데몬은 프롬프트의 AbortController를 중단하고 HTTP `504`를 `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}`과 함께 반환합니다. 프롬프트별 요청 본문 필드 `deadlineMs`는 유효 마감 시간을 플래그 아래로 단축할 수 있지만 확장할 수는 없습니다. 기능 태그(조건부): `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 미설정 | SSE 연결별 유휴 마감 시간. `n` ms 동안 성공적으로 플러시된 쓰기가 없으면 — 실제 이벤트든 15초 하트비트든 — 데몬은 `data.reason = 'writer_idle_timeout'`와 함께 종료 `client_evicted` 프레임을 방출하고(`data.errorKind`에도 미러링됨) 스트림을 닫습니다. **정당한 유휴 스트림이 제거되지 않도록 15초 하트비트보다 충분히 높은 값을 선택하세요**(예: `30000`–`300000`). 값 `< 15000`은 첫 번째 하트비트가 발생하기 전에 정상적인 유휴 연결을 제거합니다(테스트/단기 개발 세션 전용으로 의도된 경우). 기능 태그(조건부): `writer_idle_timeout`. |
| `--permission-response-timeout-ms <n>` | —                                   | `0`     | 데몬 모드에서 일반 권한 및 `ask_user_question` 응답에 대한 공유 벽시계. `0` 또는 플래그 생략은 무기한 대기합니다; 양의 정수는 둘 다에 마감을 부과합니다. 투표자 취소, 세션 취소 및 데몬 종료은 타이머가 비활성화된 경우에도 대기 중인 상호 작용을 해결합니다. |

프롬프트 및 writer 플래그는 밀리초 단위의 양의 정수를 허용합니다; `0`, `NaN`, 비정수 또는 음수 값은 부팅 시 명확한 오류 메시지와 함께 거부됩니다. 권한 응답 타임아웃은 `0` 또는 양의 정수를 허용합니다. 환경 변수 기반 두 마감의 경우 명시적 `ServeOptions` 필드가 env 값보다 우선합니다. SDK 소비자는 프롬프트 및 writer 동작에 의존하기 전에 일치하는 기능 태그를 사전 점검해야 합니다.

### 에이전트 텍스트 쓰기의 새 파일 모드 [#new-file-mode-for-agent-text-writes]

에이전트 텍스트 쓰기(`write_file`, `edit`, `notebook_edit` 및 셸 도구의 시뮬레이션된 sed 편집기)는 데몬의 원자적 작성자를 통해 게시되며, 기존 대상의 모드를 보존하고 **새** 파일의 경우 데몬 프로세스의 umask를 무시하고 소유자 전용 `0600`을 기본값으로 사용합니다. 이 실패 폐쇄 기본값은 의도적입니다: 새로 생성된 에이전트 파일은 감독 umask가 얼마나 관대하든 실수로 그룹/월드 읽기 가능이 되지 않습니다.

배포 규칙이 umask 기반인 운영자(예: `UMask=0002`가 있는 systemd 유닛, 공유 그룹 저장소)는 다음을 통해 새 파일을 표준 POSIX 처리로 옵트인할 수 있습니다:

| 환경 변수                  | 값                  | 기본값  | 수행 내용                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE` | `owner` \| `system` | `owner` | `system`은 새 파일을 `0o666 & ~umask`로 생성하므로 에이전트가 생성한 파일은 머신의 다른 프로세스와 마찬가지로 데몬 프로세스의 umask를 따릅니다. `owner`는 umask와 독립적인 `0600` 기본값을 유지합니다. 값은 대소문자를 구분하지 않습니다; 리터럴 `0600`은 `owner`의 별칭으로 허용됩니다(다른 8진 모드는 지원되지 않음), 다른 값은 stderr 경고와 함께 거부되고 `0600` 기본값이 유지됩니다. |

범위 및 제한:

- 텍스트 쓰기 라우트가 생성한 새 파일에 적용됩니다(워크스페이스 대상, 동일 호스트 외부 호스트 작성자 및 HTTP 텍스트 쓰기). 기존 파일은 항상 디스크의 모드를 유지합니다 — `0600` 시크릿을 편집하면 `0600`으로 유지되고, 실행 파일은 `+x`를 유지합니다.
- 바이너리 업로드(`POST /file/upload`)는 이 설정과 관계없이 항상 `0600`으로 생성됩니다.
- 데몬은 워크스페이스 파일시스템 생성 시 변수를 읽습니다; 변경 후 데몬을 재시작하세요.

### 대화 작업 디렉터리 [#conversations-working-directory]

운영 체제 홈과 독립적으로 스탠드얼론 및 Live 세션의 작업 디렉터리 루트를 설정하세요:

```bash
qwen serve --conversations-dir /persistent/qwen-conversations

# Or configure the launch environment:
QWEN_CONVERSATIONS_DIR=/persistent/qwen-conversations qwen serve

# The same option is available for a detached daemon:
qwen daemon start --conversations-dir /persistent/qwen-conversations
```

명시적 플래그는 `QWEN_CONVERSATIONS_DIR`보다 우선하며, 이는 시작 환경이나 사용자 수준 `.env` 파일에서 올 수 있습니다. 임베디드 런처는 `ServeOptions.conversationsDir`로 동일한 루트를 선택할 수 있으며, 이 또한 환경보다 우선합니다. 둘 다 구성되지 않은 경우 루트는 `~/Documents/Qwen Code/Conversations`으로 유지됩니다. 해당 기본 경로에 영구 볼륨을 마운트하거나 프로세스 홈을 변경하는 것도 유효한 배포 선택 사항입니다.

명시적 값은 NUL 문자가 없는 비어 있지 않은 완전한 절대 경로여야 합니다. 상대 경로, 확장되지 않은 `~`, 현재 드라이브에 의존하는 Windows 경로는 거부됩니다. 값은 공백이 제거되지 않으며, 잘못된 구성은 폴백 대신 시작 시 실패합니다. 경로 구문은 리스닝 전에 확인되며, 디렉터리 생성 및 파일 시스템 검사는 지연되므로 사용되지 않는 대화 루트는 시작 시 생성되지 않습니다. 첫 사용 시 파일 시스템 오류가 발생해도 다른 루트를 선택하지 않습니다.

선택 사항은 데몬의 수명 동안 고정됩니다. 프로젝트 `.env` 및 프로젝트 `.qwen/.env` 파일, 모든 범위의 최상위 `settings.json` `env`, 환경 재로드, 브라우저/세션 요청은 이를 리디렉션할 수 없습니다. 이에 해당하는 프로젝트 설정이나 세션별 루트 옵션은 없습니다.

Standalone 및 Live는 기존 대화 런타임을 계속 공유합니다. 각 세션은 도구 및 셸 작업 디렉터리로 결정적인 개인 `conversation-<sha256(normalized session ID)>` 직접 자식을 사용합니다. 기존 소유권, 개인 POSIX 권한, 정규 식별자, 직접 자식, 링크/재파싱, 작성자 리스, 복구 검사(플랫폼별 제한 포함)는 여전히 적용됩니다. Windows는 POSIX 소유자/모드 또는 ACL 보장을 얻지 못하며, 검증 가능한 inode 식별자가 없는 파일 시스템은 여전히 모든 동일 경로 교체를 감지할 수 없습니다. 선택된 대화 트리는 일반 워크스페이스 등록에서 예약된 상태로 유지되며, 다른 워크스페이스는 기존 규칙을 유지합니다.

작업 루트와 런타임 저장소는 별도의 책임을 가집니다:

| 데이터 | 위치 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 세션 작업 파일 | 선택된 대화 루트 아래의 개인 세션 자식. |
| 공유 루트 구성 | 선택된 루트 아래에서 세션 간에 공유되는 사용자 작성 구성. |
| 트랜스크립트 및 사이드카 | 정규 대화 런타임 cwd를 키로 하는 기존 데몬 런타임 기반 저장소. |
| 삭제 복구 저널 | 안정적인 `<home>/.qwen/conversations/deletions` 네임스페이스. |
| Live 검색 | 안정적인 `<home>/.qwen/live/daemon.json` 로케이터 및 해당되는 경우 데몬 런타임 기반 사본. |
| 로컬 데몬 검색 | 데몬 런타임 기반 아래 `daemon/daemon-<port>.json`; 재시작을 위해 선택된 대화 경로를 기록합니다. |

`QWEN_HOME`은 글로벌 Qwen 구성 디렉터리를 선택합니다. `QWEN_RUNTIME_DIR` 및 `advanced.runtimeOutputDir`은 기존 우선순위 규칙을 통해 런타임 출력 저장소를 선택합니다. 아무것도 대화 작업 디렉터리 루트를 선택하지 않습니다. 런타임 저장소만 지속하면 개인 세션 디렉터리에 생성된 파일이 지속되지 않으며, 작업 루트만 구성해도 런타임 저장소 또는 홈 기반 복구 및 검색 상태가 보존되지 않습니다.

동일한 루트를 사용하는 재시작의 경우 동일한 정규 경로, 런타임 기반 및 필요한 제어 상태를 유지하세요. `qwen daemon restart`은 현재 검색 레코드에서 루트를 보존하며, 자동 업데이트 재실행도 선택된 루트를 보존합니다. 일반적인 파일 시스템 식별 허용, 권한, 작성자 리스, 복구 검사는 여전히 실행되지만, 모든 컨테이너 또는 호스트 재시작 후 복구를 보장하는 것은 아닙니다. [대화 작성자 잠금 및 복구](./conversations-recovery.md)를 참조하세요.

루트를 의도적으로 변경하려면 원본 루트에 대해 대기 중인 삭제 복구를 완료하고, 이를 사용하는 모든 작성자를 중지한 후 새 구성으로 데몬을 중지하고 시작하세요. 다른 정규 루트는 다른 히스토리 저장소/검색 네임스페이스 및 공유 루트 구성을 선택합니다. 작업 파일, 세션 레코드, 구성, 복구 저널 또는 검색 상태가 자동으로 마이그레이션되지 않으며, 이전 히스토리가 계속 표시되는 것이 보장되지 않습니다. 허용을 강요하기 위해 복구 증거를 제거하지 마세요: 원본 루트에 대한 복구가 완료될 수 없는 경우, 이 옵션 변경은 복구 절차가 아닙니다.

### 세션 첨부 저장 [#session-attachment-storage]

세션 첨부(Web Shell이 `POST /session/:id/attachments`를 통해 업로드한 파일 및 이미지)는 기본적으로 워크스페이스의 런타임 임시 디렉토리 아래에 저장됩니다: `<runtimeBaseDir>/tmp/<projectHash>/attachments`, 세션별로 `session-<sessionId>` 키가 지정됩니다. 런타임 임시 디렉토리 외부(예: 전용 볼륨)에 첨부 파일을 영속하려는 운영자는 루트를 재정의할 수 있습니다:

| 환경 변수                               | 값    | 기본값 | 수행 내용                                                                                                                                                                                                |
| ------------------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_SESSION_ATTACHMENTS_ROOT` | 경로   | 미설정   | 기본 런타임 임시 디렉토리 대신 이 디렉토리 아래에 세션 첨부 파일을 저장합니다. 절대 경로, 데몬의 cwd 상대 경로, 또는 홈 디렉토리에 대해 확장되는 `~` / `~/…`를 허용합니다. |

범위 및 제한:

- **단방향 마이그레이션.** 환경 변수가 설정되면 새 첨부 파일은 구성된 루트 아래에만 기록됩니다. 구성된 루트를 놓치는 읽기 및 제거는 기본 런타임 임시 디렉토리로 폴백하므로, 전환 **이전**에 업로드된 첨부 파일도 읽기 가능하며 기본 폴백 디렉토리가 쓰기 가능한 동안 제거할 수 있습니다 — 레거시 사본을 unlink할 수 없는 제거(예: 읽기 전용 폴백 볼륨)는 성공을 보고하지 않고 오류를 표시합니다. 반대 방향 — 구성된 루트에 첨부 파일이 기록된 후 환경 변수를 제거하면 해당 첨부 파일에 도달할 수 없게 됩니다; 주어진 워크스페이스에 대해 변수를 안정적으로 유지하세요.
- **세션별 레이아웃.** 파일은 두 위치 모두에서 `<root>/<projectHash>/attachments/session-<sessionId>/` 아래에 위치하며, `<projectHash>`는 기본 런타임 임시 디렉토리에서 사용하는 동일한 워크스페이스 해시입니다; 폴백 조회는 기본 디렉토리에서 동일한 세션 레이아웃을 사용합니다. 동일한 구성된 루트를 가리키는 두 워크스페이스는 서로 격리된 상태로 유지됩니다.
- **삭제 정리.** 세션이 삭제되면 첨부 디렉토리가 구성된 루트와 기본 폴백 디렉토리 모두에서 제거됩니다. 세션을 아카이브하면 첨부 파일이 유지되어 아카이브 해제 후에도 생존합니다.
- 데몬은 시작 시 변수를 읽습니다; 변경 후 데몬을 재시작하세요. 디렉토리는 데몬 프로세스가 쓰기 가능해야 합니다.

## 다중 세션 및 다중 워크스페이스 배포 [#multi-session--multi-workspace-deployment]

`--workspace`를 여러 번 전달하여 하나의 `qwen serve` 프로세스에서 여러 겹치지 않는 워크스페이스를 등록하세요. 첫 번째 경로가 기본입니다. 각 등록된 워크스페이스는 격리된 런타임 경계를 소유하며, 데몬 전체 리스너, 인증 정책 및 총 세션 제한은 공유됩니다. 프로덕션은 호환성을 위해 기본 ACP 자식을 예열하고 실패 시 첫 사용 시 재시도합니다; 신뢰할 수 있는 보조는 온디맨드로 자체 자식을 시작하며 신뢰할 수 없는 보조는 ACP를 시작하지 않습니다. 요청은 표준화된 `cwd`로 등록된 워크스페이스를 선택할 수 있습니다; `cwd`를 생략하면 기본 워크스페이스를 사용합니다. 사용자 또는 보안 주체당 하나의 데몬을 사용하세요; 워크스페이스 신뢰는 실행 게이지이며 ACL이 아닙니다.

신뢰할 수 없는 보조 워크스페이스는 Web Shell에서 `untrusted` 및 `read-only`로 표시됩니다. 영속 세션 카탈로그를 검사하기 위해 확장할 수 있지만, 아직 선택하거나 열기, 재개, 세션 생성 또는 완전한 내보내기를 할 수 없습니다. REST API는 기존 제한된 파일시스템 읽기 정책을 따르며 영속 세션 그룹 카탈로그와 `workspace_persisted_transcript`가 광고될 때 제한된 워크스페이스 한정 페이저를 통한 활성 영속 트랜스크립트도 노출합니다. 이 읽기에는 라이브 런타임 상태가 포함되지 않으며 ACP 자식을 시작하지 않습니다. 완전한 워크스페이스 한정 내보내기는 신뢰할 수 있는 워크스페이스와 별도의 `workspace_session_export` 기능이 필요합니다. 실행, 뮤테이션 또는 내보내기 기능을 사용하기 전에 워크스페이스를 신뢰하고 데몬을 재시작하세요. 신뢰할 수 없는 기본은 Web Shell에서 비활성 상태로 유지됩니다.

더 작은 장애 또는 보안 경계, 독립 베어러 토큰, 할당량, 감사 경계, 운영 체제 격리 또는 독립 리소스 감독이 필요할 때 별도 데몬 프로세스를 사용하세요. 다중 워크스페이스 모드는 한 운영자가 여러 저장소를 호스팅하기 위한 것이며 다중 테넌트 격리 경계가 아닙니다. 단일 데몬 토큰은 등록된 모든 워크스페이스에 대한 허용된 읽기 전용 카탈로그를 포함한 데몬이 노출하는 모든 라우트를 인증합니다.

> **attach 시 `modelServiceId`을 게시하기 전에 구독하세요.** 클라이언트가 `modelServiceId`와 함께 `POST /session`할 때 워크스페이스에 이미 다른 모델을 실행 중인 세션이 있으면 데몬은 내부 `setSessionModel` 호출을 수행합니다 — 실패는 HTTP 오류로 전파되지 않습니다(세션은 현재 모델에서 계속 작동). 가시적인 실패 신호는 세션의 SSE 스트림에서의 `model_switch_failed` 이벤트입니다. 먼저 `POST /session`를 호출하고 그 다음에만 `GET /session/:id/events`을 열면 실패 이벤트를 놓치고 잘못된 모델과 조용히 통신하게 됩니다. SSE 스트림을 먼저 열거나, 구독 시 `Last-Event-ID: 0`를 전달하여 링의 가장 오래된 사용 가능한 이벤트를 재생하세요.

독립 토큰, 할당량, 감사 로그, 샌드박스 또는 프로세스 장애 경계를 가진 여러 **사용자 또는 보안 주체**를 처리하거나 하나의 프로세스 범위(콜드 시작 예산, FD 수, RSS)를 넘어 확장하려면, 외부 오케스트레이터 뒤에 주체당 하나의 데몬을 생성하세요. 각 데몬은 해당 주체를 위해 여러 워크스페이스를 여전히 호스팅할 수 있습니다. 오케스트레이터(다중 테넌시 / OIDC / 할당량 / 감사 / k8s)는 qwen-code 프로젝트의 **범위 외**입니다 — 디자인 포인터는 이슈 [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture"를 참조하세요.

## 영속 세션 로드 및 재개 [#loading-and-resuming-a-persisted-session]

데몬은 ACP의 `session/load` 및 재개 플로우를 HTTP로 노출하며, 별도의 읽기 전용 트랜스크립트 페이저도 제공합니다:

| 라우트                                                  | 사용 시점                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`                                | 클라이언트에 렌더링된 유용한 로컬 기록이 **없는** 경우(콜드 재연결, 선택기-then-열기). 라이브 세션의 경우 데몬은 현재 제한된 재생 스냅샷 창을 반환하고 주입합니다; 오래된 재생이 삭제되면 스냅샷은 `history_truncated`로 시작됩니다. 기능 태그: `session_load`. |
| `POST /session/:id/resume`                              | 클라이언트가 이미 화면에 턴을 가지고 있으며 데몬 측 핸들만 다시 필요로 하는 경우. 모델 컨텍스트는 UI 재생 없이 에이전트 측에서 복원됩니다 — SSE 스트림이 깨끗하게 유지됩니다. 기능 태그: `session_resume`(`unstable_session_resume`는 오래된 클라이언트를 위한 권장되지 않는 별칭으로 유지).     |
| `GET /session/:id/transcript`                           | 클라이언트가 완전한 활성 영속 트랜스크립트가 필요한 경우. 커서 페이지에서 ID 없는 재생 프레임을 반환하며 `/load`를 호출하거나 클라이언트를 연결하거나 라이브 EventBus를 시딩하거나 라이브 세션을 생성하거나 라이브 재생 창을 변경하지 않습니다. 기능 태그: `session_transcript`.                    |
| `GET /workspaces/:workspace/session/:id/transcript`     | 클라이언트가 선택된 워크스페이스의 활성 영속 트랜스크립트가 필요한 경우. Forward 및 cursor 페이지는 데몬 로컬로 유지됩니다; 라이브 세션의 backward 첫 페이지는 영속 꼬리를 플러시하기 위해 ACP를 시작하고 워크스페이스 설정을 로드할 수 있습니다. 등록된 신뢰할 수 없는 보조 워크스페이스는 이 읽기 전용 경로를 사용할 수 있습니다. 기능 태그: `workspace_persisted_transcript`. |
| `GET /workspaces/:workspace/session/:id/export`         | 클라이언트가 선택된 신뢰 워크스페이스에서 완전한 `html`, `md`, `json` 또는 `jsonl` 첨부가 필요한 경우. ACP를 시작하거나 기본으로 폴백하지 않고 활성 영속 저장소를 읽습니다. 기능 태그: `workspace_session_export`.                                                         |
| `GET /workspaces/:workspace/session/:id/archive/export` | 클라이언트가 선택된 신뢰 워크스페이스의 아카이브된 영속 저장소에서 동일한 첨부 형식이 필요한 경우. 아카이브 해제, ACP 시작 또는 활성 또는 기본 세션으로 폴백하지 않습니다. 기능 태그: `workspace_archived_session_export`.                                                |

부하 및 재개를 위해 TypeScript SDK는 `DaemonSessionClient`에 정적 팩토리를 노출합니다:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay the bounded snapshot window through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

해당 라우트를 호출하기 전에 사전 점검으로 `caps.features.session_load`, `caps.features.session_resume` 또는 `caps.features.session_transcript`를 수행하세요 — 이전 버전의 데몬은 `404`를 반환합니다. `unstable_session_resume`는 여전히 지원 중단된 호환성 별칭으로 표시됩니다. 동일한 id에 대한 동시 동일 작업 요청은 병합됩니다; 교차 작업 경쟁(`load`가 `resume`와 경쟁하는 경우) 및 호출자가 제공한 id로 생성한 프로세스가 복원과 경쟁하는 경우 `409 restore_in_progress`와 `Retry-After: 5`가 발생합니다. `limits.sessionRestoreTimeoutMs`를 초과하는 복원은 예산 기반 `Retry-After`(5-120초로 제한)와 함께 재시도 가능한 `504 session_restore_timeout`를 받습니다; 아직 실행 중인 하위 요청은 정리 작업이 완료될 때까지 격리되며, 해당 기간 동안 동일 id 재시도는 고정된 5초 지연 대신 예산 기반 `Retry-After`(5-120초로 제한)와 `reason: awaiting_abandoned_cleanup` 및 `409 restore_in_progress`를 받습니다. 정리가 불확실하거나, 버려진 복원이 마감 후에도 전체 복원 예산이 지나도록 해결되지 않은 경우, 새로운 세션 작업은 일시적으로 `reason: restore_cleanup_failed` 또는 `restore_settlement_overdue`와 함께 `503 acp_channel_unavailable`를 받습니다. 시간 초과되었지만 즉시 해결되지 않은 세션 초기화는 늦은 정리가 결론적이지 않거나 하위 요청이 다른 초기화 예산 동안 미결 상태로 남아 있는 경우 유사하게 `reason: new_session_cleanup_failed` 또는 `new_session_settlement_overdue`를 반환할 수 있습니다. 이미 활성 상태인 세션은 네 가지 이유 모두에서 사용할 수 있습니다. 전체 오류 엔벨로프는 [프로토콜 참조](../developers/qwen-serve-protocol.md)를 확인하세요.

전체 영속 재생의 경우 `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` 또는 원시 REST 라우트로 페이지를 나누세요:

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

등록된 워크스페이스의 경우 `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` 또는 `/workspaces/:workspace/session/:id/transcript`를 사용하세요. 워크스페이스 한정 메서드는 SDK 클라이언트에 교체 가능한 ACP 전송이 있더라도 항상 네이티브 REST를 사용합니다. 커서는 데몬 수명 전용이며 데몬 재시작 후 1페이지부터 재시작해야 합니다. 라이브 세션의 backward 첫 페이지는 읽기 전에 영속 꼬리를 플러시하기 위해 ACP를 시작하고 워크스페이스 설정을 로드할 수 있습니다.

신뢰할 수 있는 등록된 워크스페이스의 전체 첨부의 경우 `workspace_session_export`를 사전 점검하고 `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` 또는 원시 `/workspaces/:workspace/session/:id/export` 라우트를 호출하세요. `session_export` 또는 `workspace_qualified_rest_core`에서 지원을 추론하지 마세요; 오래된 데몬은 둘 다 광고하면서 기본 전용 내보내기를 유지할 수 있습니다. 현재 Web Shell 내보내기 작업은 기본 전용으로 유지됩니다; 다른 워크스페이스의 경우 SDK 또는 REST 라우트를 사용하세요.

아카이브 첨부의 경우 `workspace_archived_session_export`를 사전 점검하고 `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` 또는 `/workspaces/:workspace/session/:id/archive/export`를 호출하세요. 이 경로는 제자리에서 아카이브 저장소를 읽으며 활성 전용 id에 대해 `409 session_not_archived`를 반환합니다; 세션을 아카이브 해제하지 않습니다. Web Shell은 기능이 존재할 때 신뢰할 수 있는 기본 및 보조 워크스페이스의 아카이브 행에 대해 동일한 내보내기를 노출합니다.

`limit`는 방출된 재생 프레임 수가 아니라 활성 채팅 레코드의 목표 수입니다. 하나의 레코드는 여러 `session_update` 이벤트를 생성할 수 있습니다. 뒤로 페이지는 턴 및 도구 호출/결과 경계를 보존하기 위해 최대 `3 * limit`개의 레코드로 확장될 수 있습니다. 첫 번째 응답은 JSONL 스냅샷 크기를 고정하며 `hasMore`가 true인 동안 `nextCursor`를 반환합니다. 이후 페이지는 페이지 1 이후의 추가 항목을 무시하지만, 파일이 삭제, 잘림, 교체, 아카이브되거나 고정된 커서와 충돌하는 경우 `409`를 반환합니다. 매우 큰 스냅샷은 인덱싱 전에 `413 transcript_too_large`를 반환하여 데몬이 요청 경로에서 무제한 대화 기록 파일을 스캔하지 않도록 합니다.

레거시 단수형 라우트를 통해 반복적으로 페이징하려면 `--channel-idle-timeout-ms`를 양수로 설정하세요. 기본값 `0`에서는 대기 중인 워크스페이스의 ACP 자식 프로세스와 이를 보유하는 프로세스 내 대화 기록 인덱스 캐시가 모든 페이지 후에 회수되므로, 각 페이지마다 자식 프로세스를 다시 생성하고 전체 고정 접두사를 다시 스캔하여 인덱스를 재구축합니다(페이지당 `O(snapshotSize)`). 양수 타임아웃은 커서 탐색 중 자식 프로세스를 살아있게 유지하여 캐시된 대화 기록 인덱스와 재생 구성을 재사용하도록 하지만, `--child-heap-mode admit` 또는 `enforce`가 다른 워크스페이스의 용량 제약이 있는 생성을 충족시키기 위해 이를 회수하는 경우는 제외합니다. 이 경우 다음 페이지에서 자식 프로세스를 다시 생성하고 인덱스를 재구축합니다. 워크스페이스 한정 순방향 및 커서 페이지는 데몬 로컬로 유지됩니다; 활성 세션의 뒤로 첫 페이지만 플러시 장벽을 넘나듭니다.

참고: 활성 세션 기록 재생은 두 번 제한됩니다: `Last-Event-ID` 재연결용 SSE 링과 `POST /session/:id/load`가 반환하는 스냅샷용 `--compacted-replay-max-bytes`에 의해 제한됩니다. 잡담이 많은 턴이 포함된 긴 기록은 어느 한쪽 제한을 초과할 수 있습니다. 데몬은 스냅샷 잘림을 `history_truncated`로 표시합니다; 완전히 활성화된 영속화된 기록이 필요한 경우 `/transcript`를 사용하세요.

## 내구성 모델 [#durability-model]

**활성 세션은 데몬 재시작으로 인해 중단되지만, 영속화된 세션은 디스크에 남아 있으며 다시 로드할 수 있습니다:**

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
6. **`client_evicted` 이전의 `slow_client_warning` 이벤트** — 종료되기 전에 잘 동작하는 느린 클라이언트가 스스로 스로틀링(렌더링 깊이 줄이기, 청크 드롭)할 수 있도록 하는 부드러운 백프레셔입니다.

**통합 인체 공학:**

7. **IM 스타일 컨텍스트를 위한 `POST /session/:id/_meta`** — 후속 프롬프트에 첨부되는 세션별 키-값(채팅 id, 발신자, 스레드 id)로 채널별 즉흥을 대체합니다.
8. **`/capabilities` 실제 기능 협상** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`로 클라이언트가 "알 수 없는 프레임, 무시"로 폴백하는 대신 드리프트를 감지할 수 있습니다.
9. **일급 내구성 문서**(이 섹션) — 이미 위에서 제공.

전체 수렴 로드맵은 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)에서 추적됩니다.

## Stage 1 범위 경계 — Stage 1.5에서 수정하지 않을 사항 [#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15]

두 가지 구조적 선택이 Stage 1 / 1.5 / 2 메인 라인 로드맵의 명시적 비목표입니다. 사용 사례가 이 중 하나에 의존한다면, 우리를 기다리기보다는 이에 맞춰 계획하세요.

### 세션 상태는 로컬 변형 전용([LaZzyMan 리뷰 #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721) 기준)

Stage 1.5 계획은 TUI를 프로세스 내 EventBus 구독자로 설명합니다. 실제로 **TUI UI는 와이어 프로토콜보다 엄격히 더 큽니다**:

- **로컬 전용 UI** — ~15개의 Ink 대화 상자 컴포넌트(`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) 및 `local-jsx` 슬래시 명령어(`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …)는 터미널별 Ink JSX를 렌더링합니다. HTTP/SSE의 원격 클라이언트는 Ink를 동일하게 렌더링할 수 없으며 이러한 플로우는 와이어 이벤트를 발생시키지 않습니다.
- **와이어 이벤트 없는 세션 상태 변형** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init`(`CLAUDE.md` 쓰기)은 모두 에이전트 동작을 변경하지만 현재 `/model`만 이벤트를 게시합니다(`model_switched`).

**Stage 1 선택 — 리뷰의 옵션 (A)**: 이러한 변형을 와이어 이벤트로 승격하지 않습니다. 두 배포 모드는 다른 결과를 가집니다.

#### 모드 1 — 헤드리스 `qwen serve`(이 PR)

데몬 내부에서 TUI 셸이 실행되지 않습니다. 나열된 슬래시 명령어는 이 모드에서 **존재하지 않습니다** — 발행할 터미널 UI가 없습니다. 따라서 세션 상태:

- **부트 시 고정** `approval-mode` / `memory` / `agents` / `tools` 허용 목록 / `auth` — 데몬의 `qwen --acp` 자식이 시작될 때 설정 + 디스크에서 모두 로드; 세션 수명 동안 불변. 설정 정의 MCP 서버도 부트 시 고정되지만 **런타임에 추가된 서버**(`POST /workspace/mcp/servers` 경유)는 재시작 없이 추가 또는 제거할 수 있습니다.
- **HTTP를 통한 변경 가능**: `POST /session/:id/model`(`model_switched` 게시), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name`(`mcp_server_added` / `mcp_server_removed` 게시) 및 권한 투표(`POST /session/:id/permission/:requestId`; 레거시 프로세스 전역 `POST /permission/:requestId`는 F3 이전 단일 워크스페이스 클라이언트용으로 유지됨)를 통해 가능합니다.

**결과:** 헤드리스 모드의 원격 클라이언트는 **전체 세션 상태**를 볼 수 있습니다. TUI가 추가 상태를 숨기지 않으며, 드리프트가 발생할 수 없습니다. `approval-mode`를 변경하려면 새 설정으로 데몬을 재시작하세요. MCP 서버는 이제 런타임에 변경 라우트(`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`)를 통해 추가/제거할 수 있습니다 — [런타임 MCP 서버 관리](#runtime-mcp-server-management-issue-4514)를 참조하세요.

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

**MCP 서버 자식 프로세스**는 `mcp_workspace_pool`가 광고될 때 워크스페이스 범위 전송 풀을 사용합니다: 일치하는 `(workspace runtime, server name, config fingerprint)` 항목은 세션 간에 참조 카운팅됩니다. 기능이 없는 경우 레거시 세션별 관리자가 독립적으로 이를 생성합니다.

**동료 에이전트(Cursor / Continue / Claude Code / OpenCode / Gemini CLI)는 모두 단일 프로세스 다중 세션을 사용합니다.** qwen-code는 에이전트 계층에서 이들과 일치합니다; 이 PR의 Stage 1 브리지는 동일한 아키텍처가 HTTP를 통해 보이게 만듭니다.

## 원격 데몬에 로그인(issue #4175 PR 21)

데몬이 원격 포드(사용자와 디스플레이 공유 없음)에서 실행되는 경우, 클라이언트는 HTTP를 통해 OAuth 디바이스 플로우를 트리거할 수 있습니다. 데몬이 자체적으로 IdP를 폴링하며; 사용자의 역할은 브라우저가 있는 장치에서 URL을 여는 것뿐입니다.

> [!note]
>
> Qwen OAuth 무료 티어는 2026-04-15에 중단되었습니다. 아래 `qwen-oauth` 예시는 디바이스 플로우 프로토콜 형태와 레거시 제공자 식별자를 문서화합니다; 새로운 설정은 현재 지원되는 인증 제공자를 사용해야 합니다.

```bash
# 1. Start a flow. The daemon contacts the IdP, returns a code + URL.
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

# 2. Visit the URL on your phone / laptop, enter the user code.
# 3. Poll for completion (or subscribe to SSE for the auth_device_flow_authorized event):
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

**`--require-auth`와 개발 편의.** 디바이스 플로우 라우트는 엄격 뮤테이션 게이트를 사용합니다. 토큰 없는 신뢰 루프백 기본값은 플로우를 직접 시작하고 관리할 수 있습니다; 자격 증명 없는 신뢰할 수 없는 임베드는 `401 token_required`를 반환합니다. 공유 호스트, CI 러너, 원격 개발 머신 또는 로컬 프로세스가 상호 신뢰되지 않는 모든 곳에서 관리되는 `QWEN_SERVER_TOKEN`을 설정하고 `--require-auth`를 전달하세요.

**크로스 데몬 제한.** `oauth_creds.json`은 데몬 간 공유됩니다(`~/.qwen/oauth_creds.json`). 데몬 A에서의 성공적인 로그인은 데몬 B의 다음 토큰 새로 고침에서 자동으로 가져와집니다 — 하지만 데몬 B의 SDK 클라이언트는 `auth_device_flow_authorized` 이벤트를 받지 못합니다(이벤트는 데몬별).

**클라이언트 간 인수.** 동일한 데몬에서 동일한 공급자에 대해 둘 다 `POST /workspace/auth/device-flow`하는 두 개의 SDK 클라이언트는 공급자별 싱글톤을 얻습니다: 첫 번째 호출은 새로운 IdP 요청을 시작하고 `attached: false`를 반환합니다; 두 번째 호출은 `attached: true`와 함께 기존 진행 중 항목을 반환합니다. 인수는 감사 추적(두 번째 클라이언트의 `X-Qwen-Client-Id` 아래)에 기록되지만 별도 이벤트를 발생시키지 않습니다 — 사용자가 IdP 페이지를 완료하면 두 클라이언트 모두 결국 동일한 `auth_device_flow_authorized`를 관찰합니다. UI에서 "내가 이것을 시작했다"와 "다른 사람의 흐름에 참여했다"를 구분하려면 `start()`가 반환하는 `attached` 필드를 기준으로 분기하세요.

## 데몬 로그 파일

`qwen serve`은 안정적인 활성 경로에서 정상적인 재시작을 걸쳐 진단 기록을 추가합니다:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

모든 파일 레코드에는 시작 시 생성된 무작위 `runId`과 데몬 PID가 포함됩니다. 안정적 소유자가 성공적으로 설정되면 심볼릭 링크를 지원하는 플랫폼에서 `debug/daemon/latest`이 `daemon.log`로 업데이트됩니다. macOS/Linux에서는 다음 명령으로 로테이션을 추적할 수 있습니다:

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

다른 플랫폼에서는 뷰어가 경로명이 교체된 후 다시 열도록 구성하십시오. 이전 파일 핸들만 유지하는 뷰어는 로테이션 이후에도 아카이브에 남아 있게 됩니다.

로그는 수명주기 메시지, 라우트 오류(`route=` 및 `sessionId=` 컨텍스트 포함), ACP 자식 stderr 및 `QWEN_SERVE_DEBUG=1`이 설정되면 추가 브레드크럼을 캡처합니다. 오늘 stderr로 가는 라인은 여전히 stderr로 갑니다; 파일 로그는 **추가적**이며 대체가 아닙니다.

독립형 생성 실패 시 검증된 대상 `sessionId`과 함께 `Standalone session creation failed.`이 추가되며, `phase` 실패, 안전한 `reason`, `dispatchState` 및 `cleanupOutcome`가 기록됩니다. 하위 생성은 하위 ID를 유지하고 검증된 부모를 `relatedSessionId`으로 별도로 기록합니다. 비공개 출처 확인 또는 전송 세부 정보를 위해 세션 ID별로 `source_persistence_failed` 줄을 상관관계 지으세요; `write_not_confirmed`은 파일 시스템 원인을 식별하지 않습니다. 격리 완성은 롤백과 구별되며, `unknown`는 정리 성공을 입증하지 않습니다. 공개 오류 코드와 재시도 동작은 변경되지 않습니다. 이러한 진단에는 원시 원인, 프롬프트 및 출처 페이로드가 생략됩니다.

활성 파일은 10 MiB를 초과하기 전에 로테이션됩니다. 각 패밀리는 `archive/` 아래에 네 개의 아카이브를 유지하며, 각 파일 레코드는 최대 256 KiB로 제한됩니다. 메모리 내 큐는 미처리 파일 페이로드를 최대 4 MiB까지 허용합니다. 따라서 큐 압력, 로테이션 실패 또는 파일 시스템 오류로 인해 파일 사본이 드롭될 수 있으며, `GET /daemon/status?detail=full`을 통해 로거 상태, 문제점 및 드롭된 레코드/바이트 카운터를 확인할 수 있습니다.

로그 네임스페이스 내에서 하나의 데몬만 안정적 패밀리 소유권을 가질 수 있습니다. 동시 실행되는 데몬은 `debug/daemon/runs/run-<runId>/daemon.log`에 기록하며, 시작 배너와 전체 상태에는 권위 있는 경로가 표시됩니다. `runs/recent-fallback`은 최근 폴백 패밀리를 찾기 위한 최선의(locator)이며 아직 활성 상태인 패밀리를 가리킬 수 있습니다. 정상적인 네임스페이스는 약 100 MiB로 수렴합니다: 안정적 패밀리 약 50 MiB plus 비활성 폴백 패밀리 하나. 활성이거나 아직 만료되지 않은 폴백 패밀리는 유지되므로, 동시 데몬이나 크래시/재시작 폭풍으로 인해 일시적으로 더 많은 용량을 사용할 수 있습니다.

하나의 런타임 디렉터리는 하나의 소유권 및 보존 네임스페이스입니다. 데몬이 독립적인 이력을 필요로 할 경우 서로 다른 `QWEN_RUNTIME_DIR` 값을 사용하십시오. 새로운 데몬 로그 디렉터리는 사용자 전용(`0700`)이며, POSIX 환경에서 새 파일은 `0600` 권한을 사용합니다. 기간 기반 만료 정책은 없습니다.

### 비활성화

파일 로깅을 완전히 건너뛰려면 `QWEN_DAEMON_LOG_FILE=0`(또는 `false`/`off`/`no`)을 설정하세요. stderr 출력은 영향을 받지 않습니다.

### 세션 디버그 로그와의 관계

세션 범위 디버그 로그(`~/.qwen/debug/<sessionId>.txt` 및 `~/.qwen/debug/latest` 심볼릭 링크)는 독립적입니다. 데몬 로그는 형제 `daemon/` 하위 디렉토리에 있습니다; 세션별 디버그 의미는 이 기능으로 변경되지 않습니다.

### 외부 로테이션

외부 logrotate 규칙을 활성 `daemon.log`에 지정하지 마십시오. 데몬만이 지원되는 유일한 작성자이자 로테이터이며, 외부에서의 이름 변경, 삭제 또는 잘라내기는 크기 모델을 무효화합니다. 패밀리를 변경하지 않고 레코드를 복사하거나 전송하는 것은 안전합니다. 이전 `serve-<pid>.log` 및 `serve-<pid>-<workspaceHash>.log` 파일은 그대로 두며 새로운 보존 정책에 의해 계산되지 않습니다.

## 런타임 MCP 서버 관리(이슈 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)) [#runtime-mcp-server-management-issue-4514]

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

건너뛴 응답(`budget_warning_only`, `not_present`)은 이벤트를 발생시키지 않습니다.

기존 `mcp_guardrail_events` 표면의 예산 관련 이벤트(`mcp_budget_warning`, `mcp_child_refused_batch`)도 런타임 추가가 예산 임계값을 교차할 때 발생합니다.

## 다음 단계

- **장기 실행 데몬 설정 중인가요?** 서비스 관리자 감독 및 재부팅 후 시작을 위해 [로컬 실행 템플릿(systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md)을 사용하세요.
- **클라이언트 구축?** [DaemonClient TypeScript 빠른 시작](../developers/examples/daemon-client-quickstart.md) 및 [HTTP 프로토콜 참조](../developers/qwen-serve-protocol.md)를 참조하세요.
- **소스 읽기?** 브리지 코드는 `packages/cli/src/serve/`에; SDK 클라이언트는 `packages/sdk-typescript/src/daemon/`에 있습니다.
- **로드맵 추적?** Stage 1.5 / Stage 2 진행 상황은 이슈 [#3803](https://github.com/QwenLM/qwen-code/issues/3803)에서 추적됩니다.
