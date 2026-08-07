---

# Channel 및 Web 백엔드 Daemon Adapter 드래프트

## 목표

Channel adapter와 web chat 백엔드가 기존 channel ACP 서브프로세스 동작을 기본값으로 유지하면서 `DaemonSessionClient`를 통해 `qwen serve`를 소비할 수 있도록 합니다.

이 드래프트는 서버 측 클라이언트만 다룹니다:

- Channel bot 백엔드 -> `qwen serve`
- Web 브라우저 -> web 백엔드 / BFF -> `qwen serve`

브라우저 JavaScript가 daemon에 직접 호출하는 것은 명시적으로 허용하지 않습니다. daemon은 현재 설계상 브라우저 `Origin` 요청을 거부합니다.

## 제안 진입점

Channel 백엔드:

```bash
QWEN_CHANNEL_DAEMON_URL=http://127.0.0.1:4170 qwen channel start telegram
```

Web 백엔드:

```bash
QWEN_WEB_DAEMON_URL=http://127.0.0.1:4170 qwen web-chat-backend
```

공통 선택 변수:

```bash
QWEN_DAEMON_TOKEN=...
QWEN_DAEMON_WORKSPACE=/repo
```

## 최소 Channel 플로우

이 PR은 channel 및 web 백엔드 adapter를 위한 로컬에서 검증 가능한 서버 측 브리지인 `DaemonChannelBridge`를 추가합니다. 기존 ACP 브리지를 기본값으로 유지하며, 백엔드 프로세스 내부에서 daemon 세션 상태를 관리합니다.

1. Channel sender/thread를 channel 세션 키로 해석합니다.
2. `DaemonClient` + `DaemonSessionClient.createOrAttach()`를 사용합니다.
3. `session.prompt()`로 수신한 사용자 텍스트를 제출합니다.
4. `session.events()`를 구독하고 어시스턴트 텍스트 청크를 수집합니다.
5. 최종 텍스트를 플랫폼 adapter를 통해 다시 전송합니다.
6. `session.respondToPermission()`으로 권한 투표를 전달합니다.
7. `session.cancel()`로 활성 작업을 취소합니다.

## 최소 Web 백엔드 플로우

1. 브라우저가 web 백엔드에 websocket 또는 HTTP 스트림을 엽니다.
2. 백엔드가 `DaemonSessionClient`를 소유합니다.
3. 백엔드가 브라우저 메시지를 daemon 프롬프트로 변환합니다.
4. 백엔드가 daemon SSE 이벤트를 브라우저 안전한 앱 이벤트로 변환합니다.
5. 백엔드가 daemon `sessionId`와 마지막 수신 이벤트 ID를 서버 측에 저장합니다.

브라우저 클라이언트는 daemon bearer 토큰을 _수신_하면 안 됩니다.

## 세션 격리 제약

현재 daemon Stage 1 동작은 daemon 설정 수준에서 사실상 `sessionScope: single`입니다. 요청별 `sessionScope`가 도입되기 전까지, 다중 사용자 channel 또는 web 배포는 다음 중 안전한 형태를 선택해야 합니다:

- channel thread / web room당 daemon 하나
- 사용자 또는 보안 principal당 daemon 하나
- 단일 사용자 데모만

관련 없는 channel thread를 하나의 daemon 세션으로 조용히 다중화하지 마세요.

## 이벤트 매핑 계약

| Daemon 이벤트                           | Channel/web 백엔드 처리                |
| ---------------------------------------- | -------------------------------------- |
| `session_update` / `agent_message_chunk` | 어시스턴트 텍스트 추가                 |
| `session_update` / `agent_thought_chunk` | 선택적 숨김/디버그 스트림              |
| `session_update` / `tool_call`           | 도구 상태 카드/메시지 출력             |
| `permission_request`                     | 플랫폼별 승인 상호작용                 |
| `permission_resolved`                    | 승인 상호작용 종료/업데이트            |
| `model_switched`                         | 백엔드 세션 메타데이터 업데이트        |
| `session_died`                           | 사용자에게 알리고 스트림 중지          |

알 수 없는 daemon 이벤트는 무시하거나 디버그 메타데이터로 전달해야 하며, 치명적 오류로 처리하지 않습니다.

이 브리지는 아직 `qwen channel start`에 연결되지 않았습니다. 기존 Telegram, Weixin, Dingtalk, plugin channel 및 브라우저 동작은 변경되지 않습니다.

## 명시적 비목표

- 브라우저에서 daemon으로의 직접 fetch 또는 EventSource 없음.
- 이 adapter PR에서 CORS 완화 없음.
- Telegram, Weixin, Dingtalk 또는 plugin channel의 기본 마이그레이션 없음.
- 파일 CRUD, 메모리 CRUD, MCP 재시작 또는 provider 변경 없음.
- daemon 측 지원이 없을 때 클라이언트에서 sessionScope 에뮬레이션 없음.

## 병합 안전성

- 기본값 off.
- 기존 ACP channel 브리지가 기본값으로 유지됨.
- Web 백엔드는 명시적 BFF 레이어이며, daemon 보안 변경이 아님.
- 어떤 channel adapter도 daemon 토큰을 프론트엔드/브라우저 코드로 가져오면 안 됨.

## 검증 계획

- Channel 세션 키와 daemon 세션 바인딩을 유닛 테스트.
- Daemon 이벤트를 channel/web 메시지로 매핑하는 것을 유닛 테스트.
- 프롬프트, 취소, 모델 전환 및 권한 응답 전달을 유닛 테스트.
- 단일 사용자 channel 백엔드를 로컬 `qwen serve`에 대해 스모크 테스트.
- 브라우저 -> BFF -> daemon을 daemon 토큰 노출 없이 스모크 테스트.

## 기본 마이그레이션 전 차단 사항

- 요청별 `sessionScope`.
- 세션 메타데이터 + close/delete 수명주기.
- Daemon-stamped 클라이언트 identity.
- 세션 범위 권한 라우트.
- MCP, skill, provider 및 환경에 대한 읽기 전용 진단.
